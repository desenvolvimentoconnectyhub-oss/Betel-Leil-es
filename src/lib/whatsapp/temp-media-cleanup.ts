import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppAgentConfig } from "@/lib/communication/willian-agent-config";
import { deletePublicR2Object } from "@/lib/storage/r2";

type DbRow = Record<string, unknown>;

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : {};
}

function parseLimit(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value || 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(Math.trunc(parsed), 200));
}

function isExpiredIso(value: string, nowIso: string) {
  if (!value) return false;
  const expiresAt = Date.parse(value);
  const now = Date.parse(nowIso);
  return Number.isFinite(expiresAt) && Number.isFinite(now) && expiresAt <= now;
}

function isTemporaryMediaRow(row: DbRow, nowIso: string) {
  const metadata = asRecord(row.metadata);
  return (
    metadata.temporary === true &&
    metadata.preserve !== true &&
    cleanString(row.storage_key).startsWith("whatsapp-temp/") &&
    Boolean(cleanString(row.file_url)) &&
    isExpiredIso(cleanString(metadata.expiresAt), nowIso)
  );
}

async function cleanupEnabledForAgent(metadata: DbRow, cache: Map<string, boolean>) {
  const agentKey = cleanString(metadata.agentKey);
  if (!agentKey) return true;
  if (cache.has(agentKey)) return cache.get(agentKey) !== false;

  try {
    const config = await getWhatsAppAgentConfig(agentKey);
    const enabled = config.behavior.mediaCleanupEnabled !== false;
    cache.set(agentKey, enabled);
    return enabled;
  } catch {
    cache.set(agentKey, true);
    return true;
  }
}

async function loadExpiredRows(limit: number, nowIso: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { rows: [] as DbRow[], error: "Supabase admin nao configurado." };

  const query = await supabase
    .from("whatsapp_lead_files")
    .select("id,storage_key,file_url,metadata,created_at")
    .not("storage_key", "is", null)
    .not("file_url", "is", null)
    .eq("metadata->>temporary", "true")
    .lte("metadata->>expiresAt", nowIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!query.error) return { rows: ((query.data || []) as DbRow[]).filter((row) => isTemporaryMediaRow(row, nowIso)), error: "" };

  const fallback = await supabase
    .from("whatsapp_lead_files")
    .select("id,storage_key,file_url,metadata,created_at")
    .not("storage_key", "is", null)
    .not("file_url", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit * 4);

  if (fallback.error) return { rows: [] as DbRow[], error: fallback.error.message || query.error.message };
  return { rows: ((fallback.data || []) as DbRow[]).filter((row) => isTemporaryMediaRow(row, nowIso)).slice(0, limit), error: "" };
}

export async function cleanupExpiredWhatsAppLeadMedia(input: {
  dryRun?: boolean;
  limit?: number;
} = {}) {
  const supabase = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const limit = parseLimit(input.limit);

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado.",
      scanned: 0,
      deleted: 0,
      failed: 0,
      skipped: 0,
      dryRun: Boolean(input.dryRun),
      processedAt: nowIso,
    };
  }

  const loaded = await loadExpiredRows(limit, nowIso);
  if (loaded.error && !loaded.rows.length) {
    return {
      ok: false,
      error: loaded.error,
      scanned: 0,
      deleted: 0,
      failed: 0,
      skipped: 0,
      dryRun: Boolean(input.dryRun),
      processedAt: nowIso,
    };
  }

  let deleted = 0;
  let failed = 0;
  let skipped = 0;
  const cleanupEnabledByAgent = new Map<string, boolean>();
  const results: Array<Record<string, unknown>> = [];

  for (const row of loaded.rows) {
    const id = cleanString(row.id);
    const storageKey = cleanString(row.storage_key);
    const metadata = asRecord(row.metadata);

    if (!id || !storageKey.startsWith("whatsapp-temp/")) {
      skipped += 1;
      results.push({ id, storageKey, status: "skipped", reason: "invalid_temp_media_row" });
      continue;
    }

    if (!(await cleanupEnabledForAgent(metadata, cleanupEnabledByAgent))) {
      skipped += 1;
      results.push({ id, storageKey, status: "skipped", reason: "cleanup_disabled_for_agent" });
      continue;
    }

    if (input.dryRun) {
      skipped += 1;
      results.push({ id, storageKey, status: "dry_run" });
      continue;
    }

    const deletion = await deletePublicR2Object(storageKey);
    const deleteOk = deletion.status === "deleted";
    if (deleteOk) deleted += 1;
    else failed += 1;

    const nextMetadata = {
      ...metadata,
      temporaryCleanup: {
        status: deletion.status,
        deletedAt: deletion.deletedAt,
        error: deletion.error || null,
      },
      deletedAt: deleteOk ? deletion.deletedAt : metadata.deletedAt || null,
    };

    const updatePayload: Record<string, unknown> = {
      metadata: nextMetadata,
    };
    if (deleteOk) updatePayload.file_url = null;

    const { error: updateError } = await supabase.from("whatsapp_lead_files").update(updatePayload).eq("id", id);
    if (updateError) {
      if (deleteOk) failed += 1;
      results.push({ id, storageKey, status: "metadata_update_failed", error: updateError.message });
    } else {
      results.push({ id, storageKey, status: deletion.status, error: deletion.error || null });
    }
  }

  return {
    ok: failed === 0,
    error: failed ? "Algumas midias temporarias nao puderam ser limpas." : "",
    scanned: loaded.rows.length,
    deleted,
    failed,
    skipped,
    dryRun: Boolean(input.dryRun),
    processedAt: nowIso,
    results,
  };
}
