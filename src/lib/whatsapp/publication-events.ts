import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveConnectionRecords } from "@/lib/communication/connection-state";

type Row = Record<string, unknown>;
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};

export function deliveryAckLevel(value: unknown) {
  const status = String(value ?? "").toLowerCase();
  if (["4", "5", "read", "played", "read_ack"].includes(status)) return 3;
  if (["3", "delivered", "delivery_ack"].includes(status)) return 2;
  return 0;
}

export async function reconcilePublicationEvent(input: { eventType: string; instanceId: string; messageId: string; payload: Row }) {
  const db = getSupabaseAdminClient();
  if (!db || !input.instanceId) return { ok: true, skipped: true, reason: "unbound_instance" };
  const data = record(input.payload.data);
  if (input.eventType === "connection") {
    const local = await db.from("whatsapp_instances").select("id,last_seen_at").eq("provider", "connectyhub").eq("provider_instance_id", input.instanceId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (local.error || !local.data) return { ok: false, reason: "unbound_connection" };
    const state = resolveConnectionRecords([input.payload, data, record(data.instance), record(input.payload.instance)]);
    const rawTime = input.payload.timestamp || data.timestamp || input.payload.occurredAt || data.occurredAt;
    const numeric = Number(rawTime);
    const time = typeof rawTime === "string" && !Number.isFinite(numeric) ? Date.parse(rawTime) : numeric > 0 ? numeric < 1e12 ? numeric * 1000 : numeric : NaN;
    // Undated snapshots cannot establish a current online status or overwrite a poll.
    if (!Number.isFinite(time) || time > Date.now() + 30_000 || time <= Date.parse(local.data.last_seen_at || "1970-01-01")) return { ok: true, skipped: true, reason: "connection_requires_fresh_poll" };
    const checkedAt = new Date(time).toISOString();
    let update = db.from("whatsapp_instances").update({ status: state.state, last_seen_at: checkedAt, connected_at: state.connected ? checkedAt : null }).eq("id", local.data.id);
    update = local.data.last_seen_at ? update.eq("last_seen_at", local.data.last_seen_at) : update.is("last_seen_at", null);
    const result = await update;
    return { ok: !result.error, reason: result.error?.message || "connection_reconciled" };
  }
  const message = record(data.message);
  const update = record(data.update);
  const level = deliveryAckLevel(update.status ?? message.status ?? data.status ?? input.payload.status ?? data.ack);
  if (!level || !input.messageId) return { ok: true, skipped: true, reason: "ack_not_confirmed" };
  const result = await db.rpc("record_whatsapp_publication_ack", { p_instance: input.instanceId, p_message: input.messageId, p_level: level });
  return { ok: !result.error, reason: result.error?.message || "delivery_ack_reconciled" };
}
