import { NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { CONNECTYHUB_PROVIDER, normalizeWhatsAppNumber, WILLIAN_AGENT_KEY } from "@/lib/communication/connectyhub-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asBoolean(value: unknown) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function eventPayload(payload: Record<string, unknown>) {
  const data = payload.data;
  return data && typeof data === "object" && !Array.isArray(data) ? asRecord(data) : payload;
}

function eventName(payload: Record<string, unknown>, fallback = "connectyhub_event") {
  return cleanString(
    payload.event ||
      payload.EventType ||
      payload.eventType ||
      payload.type ||
      payload.webhookType,
    fallback
  );
}

function findFirstString(payload: unknown, keys: string[]): string {
  if (!payload || typeof payload !== "object") return "";

  const record = asRecord(payload);
  for (const key of keys) {
    const value = cleanString(record[key]);
    if (value) return value;
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const found = findFirstString(value, keys);
      if (found) return found;
    }
  }

  return "";
}

function findFirstBoolean(payload: unknown, keys: string[]) {
  if (!payload || typeof payload !== "object") return false;

  const record = asRecord(payload);
  for (const key of keys) {
    if (key in record && asBoolean(record[key])) return true;
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object" && findFirstBoolean(value, keys)) return true;
  }

  return false;
}

function extractInstanceIdentity(payload: Record<string, unknown>) {
  const data = eventPayload(payload);
  const rootInstance = payload.instance;
  const rootInstanceRecord = asRecord(rootInstance);
  const dataInstanceRecord = asRecord(data.instance);
  const instanceId = cleanString(
    payload.instanceId ||
      payload.instance_id ||
      (typeof rootInstance === "string" ? rootInstance : "") ||
      rootInstanceRecord.id ||
      rootInstanceRecord.instanceId ||
      rootInstanceRecord.instance_id ||
      data.instanceId ||
      data.instance_id ||
      (typeof data.instance === "string" ? data.instance : "") ||
      dataInstanceRecord.id ||
      dataInstanceRecord.instanceId ||
      dataInstanceRecord.instance_id
  );
  const instanceName = cleanString(
    payload.instanceName ||
      payload.instance_name ||
      rootInstanceRecord.name ||
      rootInstanceRecord.instanceName ||
      data.instanceName ||
      data.instance_name ||
      dataInstanceRecord.name ||
      dataInstanceRecord.instanceName
  );
  const phone = normalizeWhatsAppNumber(
    cleanString(
      payload.phoneNumber ||
        rootInstanceRecord.phoneNumber ||
        rootInstanceRecord.phone ||
        data.phoneNumber ||
        data.phone ||
        dataInstanceRecord.phoneNumber ||
        dataInstanceRecord.phone
    )
  );

  return { instanceId, instanceName, phone };
}

function eventHash(payload: Record<string, unknown>) {
  const data = eventPayload(payload);
  const providerId = findFirstString(data, ["messageid", "messageId", "messageID", "id", "stanzaId", "keyId"]);
  const instance = extractInstanceIdentity(payload).instanceId;
  const base = providerId ? `${eventName(payload)}:${instance}:${providerId}` : JSON.stringify(payload);
  return createHash("sha256").update(base).digest("hex");
}

function extractWebhookMessage(payload: Record<string, unknown>) {
  const data = eventPayload(payload);
  const providerMessageId = findFirstString(data, ["messageid", "messageId", "messageID", "id", "stanzaId", "keyId"]);
  const chatId = findFirstString(data, ["chatid", "chatId", "wa_chatid", "remoteJid"]);
  const rawPhone =
    findFirstString(data, [
      "from",
      "fromPhone",
      "phone",
      "sender",
      "senderPhone",
      "participant",
      "chatid",
      "chatId",
      "wa_chatid",
      "remoteJid",
    ]) || chatId;
  const phone = normalizeWhatsAppNumber(rawPhone.replace(/@.+$/, ""));
  const name = findFirstString(data, ["pushName", "senderName", "name", "notifyName", "wa_name", "wa_contactName"]);
  const text = findFirstString(data, ["text", "body", "conversation", "caption", "message", "content"]);
  const messageType = findFirstString(data, ["messageType", "type", "mediaType"]) || (text ? "text" : "unknown");
  const fromApi = findFirstBoolean(data, ["wasSentByApi", "fromMe", "isFromMe", "fromApi"]);
  const isGroup = findFirstBoolean(data, ["isGroup", "isGroupYes"]);

  return { providerMessageId, phone, name, text, messageType, fromApi, isGroup, chatId };
}

async function getExpectedSecret() {
  const envSecret = cleanString(process.env.CONNECTYHUB_WEBHOOK_SECRET);
  if (envSecret) return envSecret;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return "";

  const { data } = await supabase
    .from("app_config")
    .select("value")
    .in("key", ["CONNECTYHUB_WEBHOOK_SECRET", "connectyhub_webhook_secret"])
    .limit(1)
    .maybeSingle();

  return cleanString(data?.value);
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function signatureParts(signature: string) {
  const parts = signature
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const values = new Set<string>();

  for (const part of parts.length ? parts : [signature]) {
    if (part.startsWith("sha256=")) values.add(part.slice("sha256=".length));
    else if (part.startsWith("v1=")) values.add(part.slice("v1=".length));
    else if (part.includes("=")) values.add(part.split("=").slice(1).join("="));
    else values.add(part);
  }

  return [...values].filter(Boolean);
}

function hmacMatches(rawBody: string, secret: string, signature: string, timestamp = "") {
  const candidates = [rawBody];
  if (timestamp) candidates.push(`${timestamp}.${rawBody}`);

  for (const body of candidates) {
    const hmac = createHmac("sha256", secret).update(body).digest();
    const hex = hmac.toString("hex");
    const base64 = hmac.toString("base64");

    for (const part of signatureParts(signature)) {
      if (safeEqual(part.toLowerCase(), hex.toLowerCase())) return true;
      if (safeEqual(part, base64)) return true;
    }
  }

  return false;
}

async function authorizeWebhook(request: Request, rawBody: string) {
  const expected = await getExpectedSecret();
  if (!expected) return { ok: false, status: 503, error: "CONNECTYHUB_WEBHOOK_SECRET nao configurado." };

  const directSecret =
    cleanString(request.headers.get("x-connectyhub-webhook-secret")) ||
    cleanString(request.headers.get("x-connectyhub-secret")) ||
    cleanString(request.headers.get("x-webhook-secret"));
  if (directSecret && safeEqual(directSecret, expected)) return { ok: true };

  const signature =
    cleanString(request.headers.get("x-connectyhub-signature")) ||
    cleanString(request.headers.get("x-webhook-signature")) ||
    cleanString(request.headers.get("x-hub-signature-256")) ||
    cleanString(request.headers.get("x-signature"));
  const timestamp =
    cleanString(request.headers.get("x-connectyhub-timestamp")) ||
    cleanString(request.headers.get("x-webhook-timestamp")) ||
    cleanString(request.headers.get("x-timestamp"));

  if (signature && hmacMatches(rawBody, expected, signature, timestamp)) return { ok: true };

  return { ok: false, status: 401, error: "Webhook nao autorizado." };
}

async function resolveInstanceRow(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  payload: Record<string, unknown>
) {
  const identity = extractInstanceIdentity(payload);
  const message = extractWebhookMessage(payload);
  const instanceName = identity.instanceName || identity.instanceId || message.phone || "connectyhub-default";
  const receivedAt = new Date().toISOString();

  if (identity.instanceId) {
    const { data } = await supabase
      .from("whatsapp_instances")
      .select("id,agent_key")
      .eq("provider", CONNECTYHUB_PROVIDER)
      .eq("provider_instance_id", identity.instanceId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data as { id: string; agent_key: string | null };
  }

  const status = eventName(payload) === "connection" ? "connection_event" : "active";
  const { data } = await supabase
    .from("whatsapp_instances")
    .upsert(
      {
        agent_key: WILLIAN_AGENT_KEY,
        provider: CONNECTYHUB_PROVIDER,
        instance_name: instanceName,
        provider_instance_id: identity.instanceId || null,
        phone: identity.phone || null,
        status,
        webhook_url: cleanString(process.env.CONNECTYHUB_WEBHOOK_URL) || null,
        last_seen_at: receivedAt,
      },
      { onConflict: "provider,instance_name" }
    )
    .select("id,agent_key")
    .maybeSingle();

  return data as { id: string; agent_key: string | null } | null;
}

async function markEventProcessed(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  eventId: string,
  status = "processed",
  errorMessage?: string
) {
  if (!eventId) return;

  await supabase
    .from("whatsapp_webhook_events")
    .update({
      status,
      error_message: errorMessage || null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", eventId);
}

async function persistWebhookCrm(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  payload: Record<string, unknown>
) {
  const eventType = eventName(payload);
  const message = extractWebhookMessage(payload);
  const instanceRow = await resolveInstanceRow(supabase, payload);
  const instanceId = cleanString(instanceRow?.id);
  const agentKey = cleanString(instanceRow?.agent_key, WILLIAN_AGENT_KEY);
  const receivedAt = new Date().toISOString();

  const { data: eventRow, error: eventError } = await supabase
    .from("whatsapp_webhook_events")
    .upsert(
      {
        instance_id: instanceId || null,
        agent_key: agentKey,
        event_hash: eventHash(payload),
        event_type: eventType,
        provider_message_id: message.providerMessageId || null,
        from_phone: message.phone || null,
        payload,
        status: "received",
        received_at: receivedAt,
      },
      { onConflict: "event_hash" }
    )
    .select("id")
    .maybeSingle();

  if (eventError) return { ok: false, reason: eventError.message };

  const eventId = cleanString(eventRow?.id);
  if (!message.phone || message.fromApi || message.isGroup) {
    await markEventProcessed(supabase, eventId, "skipped");
    return {
      ok: true,
      eventId,
      skipped: true,
      reason: message.isGroup ? "group_message" : message.fromApi ? "sent_by_api" : "missing_phone",
      instanceId,
    };
  }

  const { data: leadRow, error: leadError } = await supabase
    .from("whatsapp_leads")
    .upsert(
      {
        phone: message.phone,
        name: message.name || null,
        owner_agent_key: agentKey,
        last_message_at: receivedAt,
        metadata: {
          last_event_type: eventType,
          connectyhub_instance_id: extractInstanceIdentity(payload).instanceId || null,
          chat_id: message.chatId || null,
        },
      },
      { onConflict: "phone" }
    )
    .select("id")
    .maybeSingle();

  if (leadError || !leadRow?.id) return { ok: false, reason: leadError?.message || "lead_not_persisted" };

  const { data: existingConversation } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("lead_id", leadRow.id)
    .eq("agent_key", agentKey)
    .neq("status", "closed")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversationId = cleanString(existingConversation?.id);
  if (!conversationId) {
    const { data: createdConversation, error: conversationError } = await supabase
      .from("whatsapp_conversations")
      .insert({
        lead_id: leadRow.id,
        instance_id: instanceId || null,
        agent_key: agentKey,
        status: "open",
        last_message_at: receivedAt,
        metadata: {
          source: CONNECTYHUB_PROVIDER,
          chat_id: message.chatId || null,
        },
      })
      .select("id")
      .maybeSingle();

    if (conversationError || !createdConversation?.id) {
      return { ok: false, reason: conversationError?.message || "conversation_not_persisted" };
    }
    conversationId = cleanString(createdConversation.id);
  } else {
    await supabase
      .from("whatsapp_conversations")
      .update({ instance_id: instanceId || null, last_message_at: receivedAt, updated_at: receivedAt })
      .eq("id", conversationId);
  }

  await supabase.from("whatsapp_conversation_messages").insert({
    conversation_id: conversationId,
    lead_id: leadRow.id,
    instance_id: instanceId || null,
    webhook_event_id: eventId || null,
    direction: "inbound",
    author_type: "lead",
    author_label: message.name || message.phone,
    message_type: message.messageType,
    text: message.text || null,
    provider_message_id: message.providerMessageId || null,
    payload,
  });

  await markEventProcessed(supabase, eventId);

  return {
    ok: true,
    eventId,
    leadId: cleanString(leadRow.id),
    conversationId,
    instanceId,
    messagePersisted: true,
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const authorization = await authorizeWebhook(request, rawBody);
  if (!authorization.ok) {
    return NextResponse.json(
      { success: false, error: authorization.error },
      { status: authorization.status || 401 }
    );
  }

  let payload: Record<string, unknown>;

  try {
    payload = asRecord(rawBody ? JSON.parse(rawBody) : {});
  } catch {
    payload = {};
  }

  const supabase = getSupabaseAdminClient();
  const eventType = eventName(payload);
  const crmResult = supabase ? await persistWebhookCrm(supabase, payload).catch((error) => ({
    ok: false,
    reason: error instanceof Error ? error.message : "crm_persist_error",
  })) : { ok: false, reason: "supabase_admin_missing" };
  const message = `Webhook ConnectyHub recebido para Willian: ${eventType}.`;

  if (supabase) {
    await supabase.from("agent_runtime_events").insert({
      run_id: null,
      run_code: `WILLIAN-WEBHOOK-${Date.now().toString(36).toUpperCase()}`,
      agent_key: WILLIAN_AGENT_KEY,
      event_type: "willian_connectyhub_webhook",
      status: eventType,
      provider: CONNECTYHUB_PROVIDER,
      model: "webhook",
      attempt: 1,
      message,
      payload: {
        ...payload,
        betel_crm_result: crmResult,
      },
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      received: true,
      eventType,
      crm: crmResult,
    },
  });
}

export async function GET() {
  const secret = await getExpectedSecret();

  return NextResponse.json({
    success: true,
    data: {
      webhook: "connectyhub",
      status: "ready",
      secretConfigured: Boolean(secret),
    },
  });
}
