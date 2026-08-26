import { fetchConnectyHubWhatsappMessages, normalizeWhatsAppNumber } from "@/lib/communication/connectyhub-client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { markManualReplyHandoff } from "@/lib/whatsapp/manual-handoff";

type DbRow = Record<string, unknown>;
type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

const DEFAULT_AGENT_KEY = "multichannel-dispatch";
const CONNECTYHUB_PROVIDER = "connectyhub";
const SYNC_STATE_KEY = "WHATSAPP_EXTERNAL_OUTBOUND_RECONCILED_AT";
const DEFAULT_SYNC_INTERVAL_MS = 15_000;
const DEFAULT_MAX_AGE_MS = 12 * 60 * 60_000;

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : {};
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const clean = cleanString(value).toLowerCase();
  return ["1", "true", "yes", "sim", "on"].includes(clean);
}

function clampText(value: string, limit = 220) {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean.length > limit ? `${clean.slice(0, limit - 3)}...` : clean;
}

function firstCleanString(record: DbRow, keys: string[]) {
  for (const key of keys) {
    const direct = cleanString(record[key]);
    if (direct) return direct;
  }

  const wanted = keys.map((key) => key.toLowerCase());
  for (const [key, value] of Object.entries(record)) {
    if (wanted.includes(key.toLowerCase())) {
      const direct = cleanString(value);
      if (direct) return direct;
    }
  }

  return "";
}

function numberFromChatId(value: unknown) {
  const chatId = cleanString(value);
  if (!chatId || chatId.includes("@g.us") || chatId.includes("status@broadcast")) return "";
  return normalizeWhatsAppNumber(chatId.replace(/@.+$/, ""));
}

function providerMessageId(message: DbRow) {
  return cleanString(
    message.messageid ||
      message.messageId ||
      message.messageID ||
      message.stanzaId ||
      message.keyId ||
      asRecord(message.key).id ||
      message.id
  ).replace(/^.+:/, "");
}

function messageTimestampMs(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }

  const text = cleanString(value);
  if (!text) return 0;

  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 10_000_000_000 ? numeric : numeric * 1000;
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function messageOccurredAt(message: DbRow) {
  const millis =
    messageTimestampMs(message.messageTimestamp) ||
    messageTimestampMs(message.timestamp) ||
    messageTimestampMs(message.createdAt) ||
    messageTimestampMs(message.created_at) ||
    Date.now();
  return new Date(millis).toISOString();
}

function messageText(message: DbRow) {
  const content = asRecord(message.content);
  return cleanString(
    message.text ||
      message.body ||
      message.conversation ||
      message.caption ||
      content.text ||
      content.body ||
      content.conversation ||
      content.caption
  );
}

function messageMediaUrl(message: DbRow) {
  const content = asRecord(message.content);
  return cleanString(
    message.mediaUrl ||
      message.media_url ||
      message.fileURL ||
      message.fileUrl ||
      message.file_url ||
      content.URL ||
      content.url ||
      content.fileURL ||
      content.fileUrl
  );
}

function messageMimeType(message: DbRow) {
  const content = asRecord(message.content);
  return cleanString(message.mimeType || message.mimetype || message.mediaMimeType || content.mimeType || content.mimetype);
}

function externalTrackId(message: DbRow) {
  const sendPayload = asRecord(message.sendPayload || message.send_payload);
  return firstCleanString(message, ["track_id", "trackId"]) || firstCleanString(sendPayload, ["track_id", "trackId"]);
}

function externalTrackSource(message: DbRow) {
  const sendPayload = asRecord(message.sendPayload || message.send_payload);
  return (firstCleanString(message, ["track_source", "trackSource"]) || firstCleanString(sendPayload, ["track_source", "trackSource"])).toLowerCase();
}

function isBetelOwnedMessage(message: DbRow, agentKey: string) {
  const trackSource = externalTrackSource(message);
  const trackId = externalTrackId(message).toLowerCase();

  return (
    trackSource === "betel_ai" ||
    trackSource === "admin_whatsapp_panel" ||
    trackId.startsWith(`${agentKey.toLowerCase()}-`) ||
    trackId.startsWith("wa-human-") ||
    trackId.includes("-human-alert-") ||
    trackId.includes("betel-group-invite")
  );
}

function messageIsFromMe(message: DbRow) {
  return asBoolean(message.fromMe) || asBoolean(message.isFromMe);
}

function messageWasSentByApi(message: DbRow) {
  return asBoolean(message.wasSentByApi) || asBoolean(message.fromApi) || asBoolean(message.sentByApi);
}

function shouldImportExternalOutbound(message: DbRow, agentKey: string, maxAgeMs: number) {
  if (!messageIsFromMe(message)) return false;
  if (asBoolean(message.isGroup)) return false;
  if (isBetelOwnedMessage(message, agentKey)) return false;

  const chatId = cleanString(message.chatid || message.chatId || message.remoteJid);
  if (chatId.includes("@g.us") || chatId.includes("status@broadcast")) return false;

  const occurredAt = messageOccurredAt(message);
  const ageMs = Date.now() - Date.parse(occurredAt);
  if (Number.isFinite(ageMs) && (ageMs > maxAgeMs || ageMs < -5 * 60_000)) return false;

  return Boolean(numberFromChatId(chatId) || normalizeWhatsAppNumber(cleanString(message.phone)));
}

function externalTrace(message: DbRow, occurredAt: string) {
  const trackSource = externalTrackSource(message);
  const trackId = externalTrackId(message);
  const wasSentByApi = messageWasSentByApi(message);
  const source = cleanString(message.source).toLowerCase();
  const label =
    trackSource === CONNECTYHUB_PROVIDER || trackId.toLowerCase().startsWith("agent_text_")
      ? "ConnectHub externo"
      : !wasSentByApi && (source === "android" || source === "ios")
        ? "Celular WhatsApp"
        : !wasSentByApi
          ? "WhatsApp Web/Celular"
          : "API externa";

  return {
    source: label === "Celular WhatsApp" || label === "WhatsApp Web/Celular" ? "whatsapp_phone_device" : "connectyhub_external_api",
    origin: label === "API externa" ? "external_api" : trackSource || source || "external_outbound",
    label,
    providerMessageId: providerMessageId(message) || null,
    providerChatId: cleanString(message.chatid || message.chatId || message.remoteJid) || null,
    textPreview: clampText(messageText(message)) || null,
    messageType: cleanString(message.messageType || message.type, messageText(message) ? "text" : "unknown"),
    sentByApi: wasSentByApi,
    fromPhoneDevice: messageIsFromMe(message) && !wasSentByApi,
    rawSource: cleanString(message.source) || null,
    trackSource: trackSource || null,
    trackId: trackId || null,
    observedAt: new Date().toISOString(),
    occurredAt,
  };
}

async function syncIsDue(supabase: SupabaseAdminClient, intervalMs: number, force: boolean) {
  if (force) return true;

  const { data } = await supabase.from("app_config").select("value").eq("key", SYNC_STATE_KEY).maybeSingle();
  const lastRunMs = Date.parse(cleanString(asRecord(data).value));
  return !Number.isFinite(lastRunMs) || Date.now() - lastRunMs >= intervalMs;
}

async function markSyncAttempt(supabase: SupabaseAdminClient) {
  await supabase.from("app_config").upsert(
    {
      key: SYNC_STATE_KEY,
      value: new Date().toISOString(),
      description: "Ultima reconciliacao de mensagens outbound externas da ConnectHub.",
      is_secret: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
}

async function activeInstances(supabase: SupabaseAdminClient, agentKey?: string) {
  let query = supabase
    .from("whatsapp_instances")
    .select("id,agent_key,instance_name,provider_instance_id,status")
    .eq("provider", CONNECTYHUB_PROVIDER)
    .not("provider_instance_id", "is", null)
    .neq("status", "deleted")
    .order("updated_at", { ascending: false })
    .limit(5);

  if (agentKey) query = query.eq("agent_key", agentKey);

  const { data } = await query;
  return ((data || []) as DbRow[]).filter((row) => {
    const id = cleanString(row.provider_instance_id);
    return id && !["test", "health-check"].includes(id);
  });
}

async function findOrCreateLead(
  supabase: SupabaseAdminClient,
  input: { phone: string; agentKey: string; name: string; occurredAt: string; trace: DbRow }
) {
  const { data: existingData } = await supabase
    .from("whatsapp_leads")
    .select("id,name,metadata,last_message_at")
    .eq("phone", input.phone)
    .maybeSingle();
  const existing = asRecord(existingData);
  const existingId = cleanString(existing.id);

  if (existingId) return { id: existingId, row: existing };

  const { data: createdData, error } = await supabase
    .from("whatsapp_leads")
    .insert({
      phone: input.phone,
      name: input.name || null,
      source: "whatsapp",
      status: "new",
      temperature: "unknown",
      owner_agent_key: input.agentKey,
      last_message_at: input.occurredAt,
      metadata: {
        source: "connectyhub_reconciliation",
        last_external_outbound_trace: input.trace,
      },
    })
    .select("id,metadata,last_message_at")
    .maybeSingle();

  if (error || !createdData?.id) return null;
  return { id: cleanString(createdData.id), row: asRecord(createdData) };
}

async function findOrCreateConversation(
  supabase: SupabaseAdminClient,
  input: {
    leadId: string;
    instanceId: string;
    agentKey: string;
    providerChatId: string;
    occurredAt: string;
    preview: string;
    trace: DbRow;
  }
) {
  const { data: existingData } = await supabase
    .from("whatsapp_conversations")
    .select("id,metadata,last_message_at")
    .eq("lead_id", input.leadId)
    .eq("agent_key", input.agentKey)
    .neq("status", "closed")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existing = asRecord(existingData);
  const existingId = cleanString(existing.id);

  if (existingId) return { id: existingId, row: existing };

  const { data: createdData, error } = await supabase
    .from("whatsapp_conversations")
    .insert({
      lead_id: input.leadId,
      instance_id: input.instanceId || null,
      agent_key: input.agentKey,
      status: "open",
      last_message_at: input.occurredAt,
      last_message_preview: input.preview || "Mensagem externa registrada.",
      metadata: {
        source: CONNECTYHUB_PROVIDER,
        chat_id: input.providerChatId || null,
        last_external_outbound_trace: input.trace,
      },
    })
    .select("id,metadata,last_message_at")
    .maybeSingle();

  if (error || !createdData?.id) return null;
  return { id: cleanString(createdData.id), row: asRecord(createdData) };
}

async function knownMessageExists(supabase: SupabaseAdminClient, providerId: string, trackId: string) {
  if (providerId) {
    const { data } = await supabase
      .from("whatsapp_conversation_messages")
      .select("id")
      .eq("provider_message_id", providerId)
      .limit(1)
      .maybeSingle();
    if (data?.id) return true;
  }

  if (trackId) {
    const { data } = await supabase
      .from("whatsapp_conversation_messages")
      .select("id")
      .eq("external_track_id", trackId)
      .limit(1)
      .maybeSingle();
    if (data?.id) return true;
  }

  return false;
}

function shouldPatchLastMessage(row: DbRow, occurredAt: string) {
  const previousMs = Date.parse(cleanString(row.last_message_at));
  const nextMs = Date.parse(occurredAt);
  return !Number.isFinite(previousMs) || (Number.isFinite(nextMs) && nextMs >= previousMs);
}

async function persistExternalMessage(
  supabase: SupabaseAdminClient,
  input: {
    message: DbRow;
    instance: DbRow;
    agentKey: string;
  }
) {
  const providerId = providerMessageId(input.message);
  const trackId = externalTrackId(input.message);
  if (await knownMessageExists(supabase, providerId, trackId)) return { imported: false, reason: "known_message" };

  const providerChatId = cleanString(input.message.chatid || input.message.chatId || input.message.remoteJid);
  const phone = numberFromChatId(providerChatId) || normalizeWhatsAppNumber(cleanString(input.message.phone));
  if (!phone) return { imported: false, reason: "missing_phone" };

  const text = messageText(input.message);
  const mediaUrl = messageMediaUrl(input.message);
  if (!text && !mediaUrl) return { imported: false, reason: "empty_message" };

  const occurredAt = messageOccurredAt(input.message);
  const trace = externalTrace(input.message, occurredAt);
  const preview = text ? clampText(text, 180) : `[${trace.messageType || "midia"}]`;
  const leadName = cleanString(input.message.pushName || input.message.senderName || input.message.name);

  const lead = await findOrCreateLead(supabase, {
    phone,
    agentKey: input.agentKey,
    name: leadName === "ConnectyHub" ? "" : leadName,
    occurredAt,
    trace,
  });
  if (!lead) return { imported: false, reason: "lead_not_persisted" };

  const conversation = await findOrCreateConversation(supabase, {
    leadId: lead.id,
    instanceId: cleanString(input.instance.id),
    agentKey: input.agentKey,
    providerChatId,
    occurredAt,
    preview,
    trace,
  });
  if (!conversation) return { imported: false, reason: "conversation_not_persisted" };

  const { error, data } = await supabase
    .from("whatsapp_conversation_messages")
    .insert({
      conversation_id: conversation.id,
      lead_id: lead.id,
      instance_id: cleanString(input.instance.id) || null,
      direction: "outbound",
      author_type: "human",
      author_label: trace.label,
      message_type: cleanString(input.message.messageType || input.message.type, text ? "text" : "unknown"),
      text: text || null,
      provider: CONNECTYHUB_PROVIDER,
      provider_message_id: providerId || null,
      provider_chat_id: providerChatId || null,
      occurred_at: occurredAt,
      media_url: mediaUrl || null,
      media_mime_type: mediaUrl ? messageMimeType(input.message) || null : null,
      external_track_id: trackId || null,
      delivery_status: cleanString(input.message.status),
      payload: {
        ...input.message,
        source: trace.source,
        betel_origin_trace: trace,
        betelOriginTrace: trace,
      },
    })
    .select("id")
    .maybeSingle();

  if (error) return { imported: false, reason: error.message };

  const leadMetadata = asRecord(lead.row.metadata);
  const conversationMetadata = asRecord(conversation.row.metadata);
  const leadPatch: DbRow = {
    metadata: {
      ...leadMetadata,
      last_external_outbound_trace: trace,
      last_external_outbound_at: occurredAt,
    },
    updated_at: new Date().toISOString(),
  };
  if (shouldPatchLastMessage(lead.row, occurredAt)) leadPatch.last_message_at = occurredAt;

  const conversationPatch: DbRow = {
    instance_id: cleanString(input.instance.id) || null,
    metadata: {
      ...conversationMetadata,
      last_external_outbound_trace: trace,
      last_external_outbound_at: occurredAt,
    },
    updated_at: new Date().toISOString(),
  };
  if (shouldPatchLastMessage(conversation.row, occurredAt)) {
    conversationPatch.last_message_at = occurredAt;
    conversationPatch.last_message_preview = preview;
  }

  await Promise.all([
    supabase.from("whatsapp_leads").update(leadPatch).eq("id", lead.id),
    supabase.from("whatsapp_conversations").update(conversationPatch).eq("id", conversation.id),
    markManualReplyHandoff(supabase, {
      conversationId: conversation.id,
      leadId: lead.id,
      agentKey: input.agentKey,
      operatorLabel: trace.label,
      reason: "external_outbound_reconciled",
      source: cleanString(trace.source),
      note: "Mensagem enviada fora do painel da Betel foi reconciliada pelo historico da ConnectHub.",
      now: occurredAt,
      lastMessagePreview: preview,
    }),
  ]);

  await supabase.from("agent_runtime_events").insert({
    run_id: null,
    run_code: `WA-EXT-${Date.now().toString(36).toUpperCase()}`,
    agent_key: input.agentKey,
    event_type: "whatsapp_external_outbound_reconciled",
    status: "persisted",
    provider: CONNECTYHUB_PROVIDER,
    model: "connectyhub-history",
    attempt: 1,
    message: "Mensagem externa outbound reconciliada pelo historico da ConnectHub.",
    payload: {
      leadId: lead.id,
      conversationId: conversation.id,
      messageId: cleanString(data?.id),
      trace,
    },
  });

  return { imported: true, reason: "persisted", messageId: cleanString(data?.id), conversationId: conversation.id, leadId: lead.id };
}

export async function reconcileExternalOutboundMessagesFromConnectyHub(input: {
  agentKey?: string;
  force?: boolean;
  limit?: number;
  intervalMs?: number;
  maxAgeMs?: number;
} = {}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, skipped: true, reason: "missing_supabase_admin", imported: 0 };

  const intervalMs = Math.max(5_000, input.intervalMs || DEFAULT_SYNC_INTERVAL_MS);
  if (!(await syncIsDue(supabase, intervalMs, Boolean(input.force)))) {
    return { ok: true, skipped: true, reason: "sync_not_due", imported: 0 };
  }

  await markSyncAttempt(supabase).catch(() => undefined);

  const instances = await activeInstances(supabase, input.agentKey);
  let imported = 0;
  const errors: string[] = [];
  const maxAgeMs = Math.max(5 * 60_000, input.maxAgeMs || DEFAULT_MAX_AGE_MS);

  for (const instance of instances) {
    const agentKey = cleanString(instance.agent_key, input.agentKey || DEFAULT_AGENT_KEY);
    const providerInstanceId = cleanString(instance.provider_instance_id);
    if (!providerInstanceId) continue;

    const response = await fetchConnectyHubWhatsappMessages({
      agentKey,
      instanceId: providerInstanceId,
      limit: input.limit || 200,
      timeoutMs: 12000,
    }).catch((error) => {
      errors.push(error instanceof Error ? error.message : "Falha ao consultar mensagens ConnectHub.");
      return null;
    });

    const messages = (response?.messages || [])
      .filter((message) => shouldImportExternalOutbound(message, agentKey, maxAgeMs))
      .sort((left, right) => Date.parse(messageOccurredAt(left)) - Date.parse(messageOccurredAt(right)));

    for (const message of messages) {
      const result = await persistExternalMessage(supabase, { message, instance, agentKey });
      if (result.imported) imported += 1;
      if (!result.imported && !["known_message", "empty_message"].includes(result.reason)) {
        errors.push(result.reason);
      }
    }
  }

  return {
    ok: errors.length === 0,
    skipped: false,
    imported,
    errors: [...new Set(errors)].slice(0, 6),
  };
}
