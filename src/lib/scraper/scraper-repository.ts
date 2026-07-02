import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DataResult, MutationResult } from "@/lib/admin/repository/shared";
import type { ResourceTone } from "@/lib/admin/resources";
import type {
  ScraperTarget,
  ScraperRun,
  ScraperDashboardData,
  ScraperRunStatus,
} from "./types";
import { RECOMMENDED_SCRAPER_SOURCES } from "./source-catalog";

type DbRow = Record<string, unknown>;

const mockReason = "Supabase nao configurado, tabela ausente ou sem registros.";

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return fallback;
  return String(v) || fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toneForTargetStatus(enabled: boolean, errors: number): ResourceTone {
  if (!enabled) return "muted";
  if (errors > 2) return "red";
  if (errors > 0) return "yellow";
  return "green";
}

function toneForRunStatus(status: string): ResourceTone {
  if (status === "completed") return "green";
  if (status === "running") return "cyan";
  if (status === "failed") return "red";
  if (status === "partial") return "yellow";
  return "muted";
}

function normalizeTarget(row: DbRow): ScraperTarget {
  const enabled = row.enabled !== false;
  const errors = asNumber(row.consecutive_errors);
  return {
    id: asString(row.id),
    targetCode: asString(row.target_code),
    name: asString(row.name, "Alvo"),
    url: asString(row.url),
    targetType: asString(row.target_type, "auctioneer") as ScraperTarget["targetType"],
    region: asString(row.region),
    coverage: asString(row.coverage, "nacional"),
    scrapeStrategy: asString(row.scrape_strategy, "playwright") as ScraperTarget["scrapeStrategy"],
    selectors: (row.selectors as Record<string, unknown>) || {},
    scheduleCron: asString(row.schedule_cron, "0 */6 * * *"),
    enabled,
    priority: asNumber(row.priority, 50),
    lastScrapedAt: asString(row.last_scraped_at),
    lastResultStatus: asString(row.last_result_status),
    lastResultCount: asNumber(row.last_result_count),
    errorCount: asNumber(row.error_count),
    consecutiveErrors: errors,
    maxRetries: asNumber(row.max_retries, 3),
    maxPages: asNumber(row.max_pages, 10),
    rateLimitMs: asNumber(row.rate_limit_ms, 2000),
    notes: asString(row.notes),
    createdAt: asString(row.created_at),
    tone: toneForTargetStatus(enabled, errors),
  };
}

function normalizeRun(row: DbRow): ScraperRun {
  const targetRow = (row.scraper_targets || null) as DbRow | null;
  return {
    id: asString(row.id),
    targetId: asString(row.target_id),
    targetName: asString(targetRow?.name),
    runCode: asString(row.run_code),
    status: asString(row.status, "queued") as ScraperRunStatus,
    itemsFound: asNumber(row.items_found),
    itemsIngested: asNumber(row.items_ingested),
    itemsSkipped: asNumber(row.items_skipped),
    itemsDuplicate: asNumber(row.items_duplicate),
    pagesScraped: asNumber(row.pages_scraped),
    errorMessage: asString(row.error_message),
    durationMs: asNumber(row.duration_ms),
    startedAt: asString(row.started_at),
    completedAt: asString(row.completed_at),
    createdAt: asString(row.created_at),
    tone: toneForRunStatus(asString(row.status)),
  };
}

export async function getScraperDashboardData(): Promise<DataResult<ScraperDashboardData>> {
  const empty: ScraperDashboardData = {
    targets: [],
    recentRuns: [],
    metrics: { totalTargets: 0, enabledTargets: 0, totalRuns: 0, itemsIngested: 0, failedTargets: 0 },
  };

  const supabase = getSupabaseAdminClient();
  if (!supabase) return { data: empty, source: "mock", reason: mockReason };

  const [targetsResult, runsResult] = await Promise.all([
    supabase.from("scraper_targets").select("*").order("priority", { ascending: false }),
    supabase
      .from("scraper_runs")
      .select("*, scraper_targets(name)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const targets = targetsResult.error ? [] : ((targetsResult.data || []) as DbRow[]).map(normalizeTarget);
  const recentRuns = runsResult.error ? [] : ((runsResult.data || []) as DbRow[]).map(normalizeRun);

  const metrics = {
    totalTargets: targets.length,
    enabledTargets: targets.filter((t) => t.enabled).length,
    totalRuns: recentRuns.length,
    itemsIngested: recentRuns.reduce((sum, r) => sum + r.itemsIngested, 0),
    failedTargets: targets.filter((t) => t.consecutiveErrors > 0).length,
  };

  return {
    data: { targets, recentRuns, metrics },
    source: targets.length > 0 ? "supabase" : "mock",
    reason: targets.length > 0 ? undefined : "Tabela scraper_targets sem registros. Execute as migrations.",
  };
}

export async function listScraperTargets(): Promise<DataResult<ScraperTarget[]>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { data: [], source: "mock", reason: mockReason };

  const { data, error } = await supabase
    .from("scraper_targets")
    .select("*")
    .order("priority", { ascending: false });

  if (error) return { data: [], source: "mock", reason: error.message };

  return {
    data: ((data || []) as DbRow[]).map(normalizeTarget),
    source: "supabase",
  };
}

export async function getScraperTargetByCode(targetCode: string): Promise<DataResult<ScraperTarget | null>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { data: null, source: "mock", reason: mockReason };

  const { data, error } = await supabase
    .from("scraper_targets")
    .select("*")
    .eq("target_code", targetCode)
    .maybeSingle();

  if (error || !data) return { data: null, source: "mock", reason: error?.message || "Alvo nao encontrado." };

  return { data: normalizeTarget(data as DbRow), source: "supabase" };
}

export type CreateScraperTargetInput = {
  targetCode: string;
  name: string;
  url: string;
  targetType: string;
  region?: string;
  coverage?: string;
  scrapeStrategy: string;
  selectors?: Record<string, unknown>;
  scheduleCron?: string;
  priority?: number;
  maxPages?: number;
  rateLimitMs?: number;
  notes?: string;
};

export async function createScraperTargetRecord(
  input: CreateScraperTargetInput
): Promise<MutationResult<{ targetCode: string }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const { error } = await supabase.from("scraper_targets").insert({
    target_code: input.targetCode,
    name: input.name,
    url: input.url,
    target_type: input.targetType,
    region: input.region || null,
    coverage: input.coverage || "nacional",
    scrape_strategy: input.scrapeStrategy,
    selectors: input.selectors || {},
    schedule_cron: input.scheduleCron || "0 */6 * * *",
    priority: input.priority || 50,
    max_pages: input.maxPages || 10,
    rate_limit_ms: input.rateLimitMs || 2000,
    notes: input.notes || null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { targetCode: input.targetCode } };
}

export async function seedRecommendedScraperTargets(): Promise<
  MutationResult<{
    created: number;
    existing: number;
    sources: Array<{ targetCode: string; name: string }>;
  }>
> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const codes = RECOMMENDED_SCRAPER_SOURCES.map((source) => source.targetCode);
  const existingResult = await supabase
    .from("scraper_targets")
    .select("target_code")
    .in("target_code", codes);

  if (existingResult.error) return { ok: false, error: existingResult.error.message };

  const existingCodes = new Set(((existingResult.data || []) as DbRow[]).map((row) => asString(row.target_code)));
  const missing = RECOMMENDED_SCRAPER_SOURCES.filter((source) => !existingCodes.has(source.targetCode));

  if (missing.length === 0) {
    return {
      ok: true,
      data: {
        created: 0,
        existing: existingCodes.size,
        sources: [],
      },
    };
  }

  const rows = missing.map((source) => ({
    target_code: source.targetCode,
    name: source.name,
    url: source.url,
    target_type: source.targetType,
    coverage: source.coverage,
    scrape_strategy: source.scrapeStrategy,
    selectors: {},
    schedule_cron: "0 */6 * * *",
    enabled: true,
    priority: source.priority,
    max_pages: source.maxPages,
    rate_limit_ms: source.rateLimitMs,
    notes: source.notes,
  }));

  const { data, error } = await supabase
    .from("scraper_targets")
    .insert(rows)
    .select("target_code, name");

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: {
      created: (data || []).length,
      existing: existingCodes.size,
      sources: ((data || []) as DbRow[]).map((row) => ({
        targetCode: asString(row.target_code),
        name: asString(row.name),
      })),
    },
  };
}

export async function toggleScraperTargetRecord(
  targetCode: string,
  enabled: boolean
): Promise<MutationResult<{ targetCode: string }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const { error } = await supabase
    .from("scraper_targets")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("target_code", targetCode);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { targetCode } };
}

export async function createScraperRunRecord(
  targetId: string
): Promise<MutationResult<{ runCode: string; runId: string }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const runCode = `SCR-${Date.now().toString(36).slice(-6)}`.toUpperCase();

  const { data, error } = await supabase
    .from("scraper_runs")
    .insert({
      target_id: targetId,
      run_code: runCode,
      status: "queued",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { runCode, runId: asString((data as DbRow).id) } };
}

export async function updateScraperRunRecord(
  runCode: string,
  updates: {
    status: ScraperRunStatus;
    itemsFound?: number;
    itemsIngested?: number;
    itemsSkipped?: number;
    itemsDuplicate?: number;
    pagesScraped?: number;
    errorMessage?: string;
    durationMs?: number;
  }
): Promise<MutationResult<{ runCode: string }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const payload: Record<string, unknown> = { status: updates.status };
  if (updates.itemsFound !== undefined) payload.items_found = updates.itemsFound;
  if (updates.itemsIngested !== undefined) payload.items_ingested = updates.itemsIngested;
  if (updates.itemsSkipped !== undefined) payload.items_skipped = updates.itemsSkipped;
  if (updates.itemsDuplicate !== undefined) payload.items_duplicate = updates.itemsDuplicate;
  if (updates.pagesScraped !== undefined) payload.pages_scraped = updates.pagesScraped;
  if (updates.errorMessage !== undefined) payload.error_message = updates.errorMessage;
  if (updates.durationMs !== undefined) payload.duration_ms = updates.durationMs;
  if (updates.status === "completed" || updates.status === "failed" || updates.status === "partial") {
    payload.completed_at = new Date().toISOString();
  }

  const { error } = await supabase.from("scraper_runs").update(payload).eq("run_code", runCode);
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { runCode } };
}

export async function updateScraperTargetRunState(
  targetCode: string,
  updates: {
    status: ScraperRunStatus;
    itemsFound: number;
    errorMessage?: string;
    consecutiveErrors: number;
    errorCount: number;
  }
): Promise<MutationResult<{ targetCode: string }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const hasError = updates.status === "failed" || (Boolean(updates.errorMessage) && updates.itemsFound === 0);
  const { error } = await supabase
    .from("scraper_targets")
    .update({
      last_scraped_at: new Date().toISOString(),
      last_result_status: updates.status,
      last_result_count: updates.itemsFound,
      consecutive_errors: hasError ? updates.consecutiveErrors + 1 : 0,
      error_count: hasError ? updates.errorCount + 1 : updates.errorCount,
      updated_at: new Date().toISOString(),
    })
    .eq("target_code", targetCode);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { targetCode } };
}

export async function updateScraperTargetRecord(
  targetCode: string,
  input: Partial<CreateScraperTargetInput>
): Promise<MutationResult<{ targetCode: string }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) payload.name = input.name;
  if (input.url !== undefined) payload.url = input.url;
  if (input.targetType !== undefined) payload.target_type = input.targetType;
  if (input.region !== undefined) payload.region = input.region || null;
  if (input.coverage !== undefined) payload.coverage = input.coverage;
  if (input.scrapeStrategy !== undefined) payload.scrape_strategy = input.scrapeStrategy;
  if (input.selectors !== undefined) payload.selectors = input.selectors;
  if (input.scheduleCron !== undefined) payload.schedule_cron = input.scheduleCron;
  if (input.priority !== undefined) payload.priority = input.priority;
  if (input.maxPages !== undefined) payload.max_pages = input.maxPages;
  if (input.rateLimitMs !== undefined) payload.rate_limit_ms = input.rateLimitMs;
  if (input.notes !== undefined) payload.notes = input.notes || null;

  const { error } = await supabase
    .from("scraper_targets")
    .update(payload)
    .eq("target_code", targetCode);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { targetCode } };
}

export async function clearScraperTargetErrors(
  targetCode?: string
): Promise<MutationResult<{ cleared: number }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  let query = supabase
    .from("scraper_targets")
    .update({
      consecutive_errors: 0,
      error_count: 0,
      updated_at: new Date().toISOString(),
    })
    .gt("consecutive_errors", 0);

  if (targetCode) query = query.eq("target_code", targetCode);

  const { data, error } = await query.select("target_code");
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { cleared: (data || []).length } };
}

export async function deleteScraperTargetRecord(
  targetCode: string
): Promise<MutationResult<{ targetCode: string }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const { error } = await supabase
    .from("scraper_targets")
    .delete()
    .eq("target_code", targetCode);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { targetCode } };
}
