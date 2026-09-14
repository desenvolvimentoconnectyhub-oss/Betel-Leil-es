import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { deletePublicR2Object } from "@/lib/storage/r2";

const workContext = new AsyncLocalStorage<string>();
function database() {
  const db = getSupabaseAdminClient();
  if (!db) throw new Error("RESET_DATABASE_UNAVAILABLE");
  return db;
}

export async function canResetBetelLead(admin: { id: string; role: string } | null) {
  if (admin?.role !== "owner") return false;
  const { data, error } = await database().rpc("can_reset_betel_lead", { p_actor: admin.id });
  return !error && data === true;
}

export function providerMessageTime(message: Record<string, unknown>): string | null {
  for (const value of [message.messageTimestamp, message.timestamp, message.messageTime, message.createdAt, message.created_at]) {
    if (value === undefined || value === null || value === "") continue;
    const n = Number(value);
    const ms = Number.isFinite(n) && n > 0 ? (n < 10_000_000_000 ? n * 1000 : n) : Date.parse(String(value));
    if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
  }
  return null;
}

export type LeadWorkScope = {
  leadId?: string; conversationId?: string; phone?: string; providerInstanceId?: string;
  mode?: "work" | "inbound" | "outbound" | "history"; occurredAt?: string | null; messageId?: string;
};
export async function beginLeadWork(scope: LeadWorkScope) {
  const { data, error } = await database().rpc("begin_betel_lead_work", {
    p_lead: scope.leadId || null, p_conversation: scope.conversationId || null,
    p_phone: scope.phone || null, p_provider_instance: scope.providerInstanceId || null,
    p_mode: scope.mode || "work", p_occurred_at: scope.occurredAt || null, p_message_id: scope.messageId || null,
  });
  if (error || typeof data !== "string") throw new Error(error?.message || "RESET_WORK_UNAVAILABLE");
  return data;
}
export async function endLeadWork(token: string) {
  const { error } = await database().from("whatsapp_lead_work_leases").delete().eq("id", token);
  if (error) throw new Error("RESET_WORK_RELEASE_FAILED");
}
export async function withLeadWork<T>(scope: LeadWorkScope, action: () => Promise<T>): Promise<T> {
  // Nested work belongs to the outer intake/worker lease until all writes finish.
  if (workContext.getStore()) return action();
  const token = await beginLeadWork(scope);
  try { return await workContext.run(token, action); }
  finally { await endLeadWork(token); }
}
export async function assertLeadWorkActive() {
  const token = workContext.getStore();
  if (!token) return;
  const { data, error } = await database().from("whatsapp_lead_work_leases").select("id")
    .eq("id", token).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !data) throw new Error("RESET_STALE_WORK");
}

export async function finishLeadResetAssets(jobId: string) {
  const db = database();
  const { data: job, error } = await db.from("whatsapp_lead_reset_jobs").select("assets,completed_at").eq("id", jobId).single();
  if (error || !job) throw new Error("RESET_JOB_UNAVAILABLE");
  if (job.completed_at) return true;
  const assets = job.assets as Array<{ key: string; done: boolean }>;
  for (const asset of assets) {
    if (asset.done) continue;
    // Object keys are from the transaction's manifest, never client parameters.
    const result = await deletePublicR2Object(asset.key);
    if (result.status !== "deleted") return false;
    asset.done = true;
    const saved = await db.from("whatsapp_lead_reset_jobs").update({ assets }).eq("id", jobId);
    if (saved.error) return false;
  }
  const saved = await db.from("whatsapp_lead_reset_jobs").update({ assets: [], completed_at: new Date().toISOString() }).eq("id", jobId);
  return !saved.error;
}
export async function resetBetelLead(actorId: string, leadId: string, conversationId: string) {
  const { data, error } = await database().rpc("reset_betel_whatsapp_lead", {
    p_actor: actorId, p_lead: leadId, p_conversation: conversationId, p_confirm: true,
  });
  if (error) throw new Error(error.message);
  if (!data?.deleted || !data.jobId) throw new Error("RESET_RESULT_INVALID");
  return { deleted: true, complete: data.complete || await finishLeadResetAssets(data.jobId) };
}

export async function retryLeadResetAssets() {
  const { data, error } = await database().from("whatsapp_lead_reset_jobs").select("id").is("completed_at", null).order("started_at").limit(3);
  if (error) throw new Error("RESET_JOB_LOOKUP_FAILED");
  for (const job of data || []) await finishLeadResetAssets(job.id);
}

export async function withOutboxLeadWork<T>(code: string, action: () => Promise<T>): Promise<T> {
  const { data, error } = await database().rpc("begin_betel_outbox_work", { p_code: code });
  if (error) throw new Error(error.message);
  if (!data) return action();
  try { return await workContext.run(String(data), action); }
  finally { await endLeadWork(String(data)); }
}
