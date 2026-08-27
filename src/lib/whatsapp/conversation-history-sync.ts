import "server-only";

import { fetchConnectyHubWhatsappMessages, normalizeWhatsAppNumber } from "@/lib/communication/connectyhub-client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { markManualReplyHandoff } from "@/lib/whatsapp/manual-handoff";

type DbRow = Record<string, unknown>;
type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

const DEFAULT_AGENT_KEY = "multichannel-dispatch";
const CONNECTYHUB_PROVIDER = "connectyhub";
const SYNC_STATE_KEY = "WHATSAPP_CONVERSATION_HISTORY_SYNCED_AT";
const RESET_STATE_KEY = "WHATSAPP_CONVERSATION_RESET_CUTOFFS";
const DEFAULT_SYNC_INTERVAL_MS = 15_000;
const DEFAULT_MAX_AGE_MS = 48 * 60 * 60_000;

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

function asResetCutoffs(value: unknown): Record<string, string> {
  if (!value) return {};

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>((acc, [phone, resetAt]) => {
      const normalizedPhone = normalizeWhatsAppNumber(phone);
      const normalizedResetAt = cleanString(resetAt);
      if (normalizedPhone && Number.isFinite(Date.parse(normalizedResetAt))) acc[normalizedPhone] = normalizedResetAt;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

async function loadResetCutoffs(supabase: SupabaseAdminClient) {
  const { data } = await supabase.from("app_config").select("value").eq("key", RESET_STATE_KEY).maybeSingle();
  return asResetCutoffs(asRecord(data).value);
}

function validIsoDate(value: unknown) {
  const clean = cleanString(value);
  return clean && Number.isFinite(Date.parse(clean)) ? clean : "";
}

function latestIsoDate(...values: unknown[]) {
  let latest = "";
  let latestMs = Number.NEGATIVE_INFINITY;

  for (const value of values.flat()) {
    const candidate = validIsoDate(value);
    const candidateMs = candidate ? Date.parse(candidate) : Number.NaN;
    if (Number.isFinite(candidateMs) && candidateMs > latestMs) {
      latest = candidate;
      latestMs = candidateMs;
    }
  }

  return latest;
}

function resetCutoffFromMetadata(...metadataValues: unknown[]) {
  return latestIsoDate(
    metadataValues.flatMap((value) => {
      const metadata = asRecord(value);
      return [
        metadata.reset_for_test_at,
        metadata.resetForTestAt,
        metadata.conversation_reset_cutoff_at,
        metadata.conversationResetCutoffAt,
        metadata.reset_cutoff_at,
        metadata.resetCutoffAt,
      ];
    })
  );
}

function resetCutoffForIdentifiers(resetCutoffs: Record<string, string>, ...identifiers: unknown[]) {
  const candidates = identifiers
    .flatMap((identifier) => {
      const clean = cleanString(identifier);
      if (!clean) return [];
      return [clean, numberFromChatId(clean), normalizeWhatsAppNumber(clean)];
    })
    .filter(Boolean);

  return latestIsoDate(
    candidates.flatMap((candidate) => {
      const normalized = normalizeWhatsAppNumber(candidate);
      return [resetCutoffs[candidate], normalized ? resetCutoffs[normalized] : ""];
    })
  );
}

function messageResetCutoff(
  resetCutoffs: Record<string, string>,
  identifiers: unknown[],
  ...metadataValues: unknown[]
) {
  return latestIsoDate(resetCutoffForIdentifiers(resetCutoffs, ...identifiers), resetCutoffFromMetadata(...metadataValues));
}

function messageIsBeforeResetCutoff(
  resetCutoffs: Record<string, string>,
  identifiers: unknown[],
  occurredAt: string,
  ...metadataValues: unknown[]
) {
  const resetAt = messageResetCutoff(resetCutoffs, identifiers, ...metadataValues);
  if (!resetAt) return false;

  const occurredMs = Date.parse(occurredAt);
  const resetMs = Date.parse(resetAt);
  return Number.isFinite(occurredMs) && Number.isFinite(resetMs) && occurredMs <= resetMs;
}

function clampText(value: string, limit = 220) {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean.length > limit ? `${clean.slice(0, limit - 3)}...` : clean;
}

function normalizedPlaceholder(value: unknown) {
  return cleanString(value).replace(/[\s_[\]{}().:-]/g, "").toLowerCase();
}

function isTechnicalMessagePlaceholder(value: unknown) {
  return new Set([
    "extendedtextmessage",
    "conversation",
    "audiomessage",
    "imagemessage",
    "videomessage",
    "documentmessage",
    "stickermessage",
    "buttonsresponsemessage",
    "listresponsemessage",
    "templatebuttonreplymessage",
    "interactiveresponsemessage",
    "reactionmessage",
    "protocolmessage",
  ]).has(normalizedPlaceholder(value));
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

function firstMessageText(...values: unknown[]) {
  for (const value of values) {
    const clean = cleanString(value);
    if (clean && !isTechnicalMessagePlaceholder(clean)) return clean;
  }
  return "";
}

function extractTextFromMessageLike(value: unknown, depth = 0): string {
  if (depth > 7) return "";
  if (typeof value === "string") return isTechnicalMessagePlaceholder(value) ? "" : cleanString(value);
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractTextFromMessageLike(item, depth + 1);
      if (found) return found;
    }
    return "";
  }

  const record = asRecord(value);
  const direct = firstMessageText(
    record.text,
    record.body,
    record.conversation,
    record.caption,
    record.selectedDisplayText,
    record.selectedRowId,
    record.contentText,
    record.displayText,
    record.title,
    record.description,
    record.transcript,
    record.transcription
  );
  if (direct) return direct;

  const nestedKeys = [
    "content",
    "message",
    "messageData",
    "quotedMessage",
    "quoted_message",
    "quotedMsg",
    "quoted",
    "extendedTextMessage",
    "imageMessage",
    "videoMessage",
    "documentMessage",
    "audioMessage",
    "buttonsResponseMessage",
    "listResponseMessage",
    "templateButtonReplyMessage",
    "interactiveResponseMessage",
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
  ];
  for (const key of nestedKeys) {
    const found = extractTextFromMessageLike(record[key], depth + 1);
    if (found) return found;
  }

  return "";
}

function extractMediaUrlFromMessageLike(value: unknown, depth = 0): string {
  if (depth > 7 || !value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractMediaUrlFromMessageLike(item, depth + 1);
      if (found) return found;
    }
    return "";
  }

  const record = asRecord(value);
  const direct = firstCleanString(record, [
    "mediaUrl",
    "media_url",
    "downloadUrl",
    "download_url",
    "fileURL",
    "fileUrl",
    "file_url",
    "url",
    "URL",
  ]);
  if (direct) return direct;

  for (const key of ["content", "message", "imageMessage", "videoMessage", "documentMessage", "audioMessage"]) {
    const found = extractMediaUrlFromMessageLike(record[key], depth + 1);
    if (found) return found;
  }
  return "";
}

function extractMimeTypeFromMessageLike(value: unknown, depth = 0): string {
  if (depth > 7 || !value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractMimeTypeFromMessageLike(item, depth + 1);
      if (found) return found;
    }
    return "";
  }

  const record = asRecord(value);
  const direct = firstCleanString(record, [
    "mimeType",
    "mimetype",
    "mediaMimeType",
    "media_mime_type",
    "contentType",
    "content_type",
  ]);
  if (direct) return direct;

  for (const key of ["content", "message", "imageMessage", "videoMessage", "documentMessage", "audioMessage"]) {
    const found = extractMimeTypeFromMessageLike(record[key], depth + 1);
    if (found) return found;
  }
  return "";
}

function normalizeMessageTypeName(value: unknown, fallback = "") {
  const clean = cleanString(value, fallback);
  const normalized = normalizedPlaceholder(clean);
  if (!normalized) return fallback;
  if (normalized === "conversation" || normalized === "extendedtextmessage") return "text";
  if (normalized === "audiomessage") return "audio";
  if (normalized === "imagemessage") return "image";
  if (normalized === "videomessage") return "video";
  if (normalized === "documentmessage") return "document";
  if (normalized === "stickermessage") return "sticker";
  if (normalized.includes("button") || normalized.includes("listresponse") || normalized.includes("interactive")) return "text";
  return clean;
}

function extractMessageTypeFromMessageLike(value: unknown, depth = 0): string {
  if (depth > 5 || !value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractMessageTypeFromMessageLike(item, depth + 1);
      if (found) return found;
    }
    return "";
  }

  const record = asRecord(value);
  const direct = firstCleanString(record, ["messageType", "mediaType", "type", "kind"]);
  if (direct) return normalizeMessageTypeName(direct);

  for (const key of [
    "conversation",
    "extendedTextMessage",
    "imageMessage",
    "videoMessage",
    "documentMessage",
    "audioMessage",
    "stickerMessage",
    "buttonsResponseMessage",
    "listResponseMessage",
    "templateButtonReplyMessage",
    "interactiveResponseMessage",
  ]) {
    if (record[key] !== undefined) return normalizeMessageTypeName(key);
  }

  for (const key of ["content", "message"]) {
    const found = extractMessageTypeFromMessageLike(record[key], depth + 1);
    if (found) return found;
  }
  return "";
}

function numberFromChatId(value: unknown) {
  const chatId = cleanString(value);
  if (!chatId || chatId.includes("@g.us") || chatId.includes("status@broadcast")) return "";
  return normalizeWhatsAppNumber(chatId.replace(/@.+$/, ""));
}

function providerMessageIdCandidates(message: DbRow) {
  const key = asRecord(message.key);
  const values = [
    message.messageid,
    message.messageId,
    message.messageID,
    message.stanzaId,
    message.keyId,
    key.id,
    message.id,
  ]
    .map((value) => cleanString(value))
    .filter(Boolean);

  const normalized = values.map((value) => value.replace(/^.+:/, ""));
  return [...new Set([...values, ...normalized].filter(Boolean))];
}

function primaryProviderMessageId(message: DbRow) {
  return providerMessageIdCandidates(message)[0] || "";
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
  return (
    firstMessageText(
      message.text,
      message.body,
      message.conversation,
      message.caption,
      content.text,
      content.body,
      content.conversation,
      content.caption
    ) ||
    extractTextFromMessageLike(content) ||
    extractTextFromMessageLike(message)
  );
}

function messageMediaUrl(message: DbRow) {
  const content = asRecord(message.content);
  return (
    firstCleanString(message, ["mediaUrl", "media_url", "fileURL", "fileUrl", "file_url", "downloadUrl", "download_url"]) ||
    firstCleanString(content, ["URL", "url", "fileURL", "fileUrl", "file_url", "downloadUrl", "download_url"]) ||
    extractMediaUrlFromMessageLike(content) ||
    extractMediaUrlFromMessageLike(message)
  );
}

function messageMimeType(message: DbRow) {
  const content = asRecord(message.content);
  return (
    firstCleanString(message, ["mimeType", "mimetype", "mediaMimeType", "media_mime_type"]) ||
    firstCleanString(content, ["mimeType", "mimetype", "mediaMimeType", "media_mime_type"]) ||
    extractMimeTypeFromMessageLike(content) ||
    extractMimeTypeFromMessageLike(message)
  );
}

function messageType(message: DbRow, text: string, mediaUrl: string) {
  return normalizeMessageTypeName(
    firstCleanString(message, ["messageType", "mediaType", "type", "kind"]) ||
      extractMessageTypeFromMessageLike(asRecord(message.content)) ||
      extractMessageTypeFromMessageLike(message),
    text ? "text" : mediaUrl ? "media" : "unknown"
  );
}

function trackId(message: DbRow) {
  const sendPayload = asRecord(message.sendPayload || message.send_payload);
  return firstCleanString(message, ["track_id", "trackId"]) || firstCleanString(sendPayload, ["track_id", "trackId"]);
}

function trackSource(message: DbRow) {
  const sendPayload = asRecord(message.sendPayload || message.send_payload);
  return (firstCleanString(message, ["track_source", "trackSource"]) || firstCleanString(sendPayload, ["track_source", "trackSource"])).toLowerCase();
}

function messageIsFromMe(message: DbRow) {
  return asBoolean(message.fromMe) || asBoolean(message.isFromMe);
}

function messageWasSentByApi(message: DbRow) {
  return asBoolean(message.wasSentByApi) || asBoolean(message.fromApi) || asBoolean(message.sentByApi);
}

function providerChatId(message: DbRow) {
  return cleanString(message.chatid || message.chatId || message.remoteJid || asRecord(message.key).remoteJid);
}

function isGroupOrStatusMessage(message: DbRow) {
  const chatId = providerChatId(message);
  return asBoolean(message.isGroup) || chatId.includes("@g.us") || chatId.includes("status@broadcast");
}

function leadPhoneForMessage(message: DbRow) {
  const chatId = providerChatId(message);
  return numberFromChatId(chatId) || normalizeWhatsAppNumber(cleanString(message.phone || message.senderPhone || message.sender_pn));
}

function cleanLeadName(value: unknown) {
  const clean = cleanString(value);
  if (!clean) return "";
  if (/^(connectyhub|betel leiloes|betel leilões|betel)$/i.test(clean)) return "";
  return clean;
}

function isSdrAdminNotificationTrackId(value: string) {
  const track = value.toLowerCase();
  if (!track.startsWith("sdr-appointment-")) return false;
  return (
    track.endsWith("-scheduled") ||
    track.endsWith("-admin-reminder") ||
    track.endsWith("-lead-confirmed") ||
    track.endsWith("-lead-reschedule-requested") ||
    /-rescheduled-\d+$/.test(track)
  );
}

function isInternalAdminNotificationTrackId(value: string) {
  const track = value.toLowerCase();
  return track.includes("-human-alert-") || isSdrAdminNotificationTrackId(track);
}

function shouldSkipInternalAdminNotification(message: DbRow) {
  const currentTrackId = trackId(message);
  return Boolean(messageIsFromMe(message) && currentTrackId && isInternalAdminNotificationTrackId(currentTrackId));
}

function automatedBetelLabelFromTrackId(value: string) {
  const track = value.toLowerCase();
  if (track.startsWith("wa-fup-")) return "Follow-up Betel";
  if (track.startsWith("sdr-appointment-")) return "Agenda SDR";
  if (track.startsWith("betel-group-")) return "Convite Betel";
  return "IA Betel";
}

function automatedBetelSourceFromLabel(label: string) {
  if (label === "Follow-up Betel") return "whatsapp_follow_up";
  if (label === "Agenda SDR") return "whatsapp_sdr_automation";
  if (label === "Convite Betel") return "whatsapp_group_invite";
  return "whatsapp_agent_runtime";
}

function messageTrace(message: DbRow, agentKey: string, occurredAt: string) {
  const fromMe = messageIsFromMe(message);
  const currentTrackSource = trackSource(message);
  const currentTrackId = trackId(message);
  const currentTrackIdLower = currentTrackId.toLowerCase();
  const wasSentByApi = messageWasSentByApi(message);
  const rawSource = cleanString(message.source).toLowerCase();
  const agentTrackPrefix = `${agentKey.toLowerCase()}-`;

  if (!fromMe) {
    return {
      direction: "inbound",
      authorType: "lead",
      authorLabel: "Lead",
      source: "whatsapp_lead_history_sync",
      origin: "lead",
      label: "Lead",
      isExternalHumanOutbound: false,
      isPanelHumanOutbound: false,
      isAiOutbound: false,
      shouldPauseAiForHandoff: false,
      sentByApi: wasSentByApi,
      fromPhoneDevice: false,
      rawSource: cleanString(message.source) || null,
      trackSource: currentTrackSource || null,
      trackId: currentTrackId || null,
      observedAt: new Date().toISOString(),
      occurredAt,
    };
  }

  if (currentTrackSource === "admin_whatsapp_panel" || currentTrackIdLower.startsWith("wa-human-")) {
    return {
      direction: "outbound",
      authorType: "human",
      authorLabel: "Painel Betel",
      source: "admin_whatsapp_panel",
      origin: "admin_whatsapp_panel",
      label: "Painel Betel",
      isExternalHumanOutbound: false,
      isPanelHumanOutbound: true,
      isAiOutbound: false,
      shouldPauseAiForHandoff: true,
      sentByApi: wasSentByApi,
      fromPhoneDevice: false,
      rawSource: cleanString(message.source) || null,
      trackSource: currentTrackSource || null,
      trackId: currentTrackId || null,
      observedAt: new Date().toISOString(),
      occurredAt,
    };
  }

  if (
    currentTrackSource === "betel_ai" ||
    currentTrackIdLower.startsWith(agentTrackPrefix) ||
    currentTrackIdLower.startsWith("wa-fup-") ||
    currentTrackIdLower.startsWith("sdr-appointment-") ||
    currentTrackIdLower.startsWith("betel-group-")
  ) {
    const label = automatedBetelLabelFromTrackId(currentTrackId);
    return {
      direction: "outbound",
      authorType: "ai",
      authorLabel: label === "IA Betel" ? "Evelyn" : label,
      source: automatedBetelSourceFromLabel(label),
      origin: "betel_ai",
      label: "IA Betel",
      isExternalHumanOutbound: false,
      isPanelHumanOutbound: false,
      isAiOutbound: true,
      shouldPauseAiForHandoff: false,
      sentByApi: wasSentByApi,
      fromPhoneDevice: false,
      rawSource: cleanString(message.source) || null,
      trackSource: currentTrackSource || null,
      trackId: currentTrackId || null,
      observedAt: new Date().toISOString(),
      occurredAt,
    };
  }

  const label =
    currentTrackSource === CONNECTYHUB_PROVIDER || currentTrackIdLower.startsWith("agent_text_")
      ? "ConnectHub externo"
      : !wasSentByApi && (rawSource === "android" || rawSource === "ios")
        ? "Celular WhatsApp"
        : !wasSentByApi
          ? "WhatsApp Web/Celular"
          : "API externa";
  const isPhoneDeviceOutbound = label === "Celular WhatsApp" || label === "WhatsApp Web/Celular";

  return {
    direction: "outbound",
    authorType: "human",
    authorLabel: label,
    source: isPhoneDeviceOutbound ? "whatsapp_phone_device" : "connectyhub_external_api",
    origin: label === "API externa" ? "external_api" : currentTrackSource || rawSource || "external_outbound",
    label,
    isExternalHumanOutbound: true,
    isPanelHumanOutbound: false,
    isAiOutbound: false,
    shouldPauseAiForHandoff: isPhoneDeviceOutbound,
    sentByApi: wasSentByApi,
    fromPhoneDevice: messageIsFromMe(message) && !wasSentByApi,
    rawSource: cleanString(message.source) || null,
    trackSource: currentTrackSource || null,
    trackId: currentTrackId || null,
    observedAt: new Date().toISOString(),
    occurredAt,
  };
}

function textSignature(value: string) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .slice(0, 500);
}

function timeDistanceMs(left: string, right: unknown) {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(cleanString(right));
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) return Number.POSITIVE_INFINITY;
  return Math.abs(leftMs - rightMs);
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
      description: "Ultima reconciliacao completa do historico WhatsApp na ConnectHub.",
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
    .limit(10);

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
        source: "connectyhub_history_sync",
        last_history_sync_trace: input.trace,
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
      last_message_preview: input.preview || "Mensagem reconciliada.",
      metadata: {
        source: CONNECTYHUB_PROVIDER,
        chat_id: input.providerChatId || null,
        last_history_sync_trace: input.trace,
      },
    })
    .select("id,metadata,last_message_at")
    .maybeSingle();

  if (error || !createdData?.id) return null;
  return { id: cleanString(createdData.id), row: asRecord(createdData) };
}

async function knownMessageExists(
  supabase: SupabaseAdminClient,
  input: {
    conversationId: string;
    providerIds: string[];
    trackId: string;
    text: string;
    mediaUrl: string;
    occurredAt: string;
    direction: string;
  }
) {
  const providerIds = input.providerIds.filter(Boolean);
  if (providerIds.length) {
    const { data } = await supabase
      .from("whatsapp_conversation_messages")
      .select("id")
      .in("provider_message_id", providerIds)
      .limit(1)
      .maybeSingle();
    if (data?.id) return true;
  }

  if (input.trackId) {
    const { data } = await supabase
      .from("whatsapp_conversation_messages")
      .select("id")
      .eq("external_track_id", input.trackId)
      .limit(1)
      .maybeSingle();
    if (data?.id) return true;
  }

  const signature = textSignature(input.text);
  if (!input.conversationId || (!signature && !input.mediaUrl)) return false;

  const { data } = await supabase
    .from("whatsapp_conversation_messages")
    .select("id,direction,text,transcript,media_url,occurred_at,created_at,provider_message_id,external_track_id")
    .eq("conversation_id", input.conversationId)
    .eq("direction", input.direction)
    .order("occurred_at", { ascending: false })
    .limit(80);

  return ((data || []) as DbRow[]).some((row) => {
    if (providerIds.includes(cleanString(row.provider_message_id))) return true;
    if (input.trackId && cleanString(row.external_track_id) === input.trackId) return true;
    if (timeDistanceMs(input.occurredAt, row.occurred_at || row.created_at) > 5 * 60_000) return false;
    if (signature && textSignature(cleanString(row.text || row.transcript)) === signature) return true;
    return Boolean(input.mediaUrl && cleanString(row.media_url) === input.mediaUrl);
  });
}

function shouldPatchLastMessage(row: DbRow, occurredAt: string) {
  const previousMs = Date.parse(cleanString(row.last_message_at));
  const nextMs = Date.parse(occurredAt);
  return !Number.isFinite(previousMs) || (Number.isFinite(nextMs) && nextMs >= previousMs);
}

async function persistHistoryMessage(
  supabase: SupabaseAdminClient,
  input: {
    message: DbRow;
    instance: DbRow;
    agentKey: string;
    resetCutoffs?: Record<string, string>;
  }
) {
  if (isGroupOrStatusMessage(input.message)) return { imported: false, reason: "group_or_status_ignored" };
  if (shouldSkipInternalAdminNotification(input.message)) return { imported: false, reason: "internal_admin_notification_ignored" };

  const occurredAt = messageOccurredAt(input.message);
  const trace = messageTrace(input.message, input.agentKey, occurredAt);
  const phone = leadPhoneForMessage(input.message);
  if (!phone) return { imported: false, reason: "missing_phone" };

  const text = messageText(input.message);
  const mediaUrl = messageMediaUrl(input.message);
  if (!text && !mediaUrl) return { imported: false, reason: "empty_message" };

  const chatId = providerChatId(input.message);
  const resetIdentifiers = [phone, chatId];
  const type = messageType(input.message, text, mediaUrl);
  const providerIds = providerMessageIdCandidates(input.message);
  const currentTrackId = trackId(input.message);
  const preview = text ? clampText(text, 180) : `[${type || "midia"}]`;
  const leadName = cleanLeadName(input.message.pushName || input.message.notifyName || input.message.senderName || input.message.name);

  const lead = await findOrCreateLead(supabase, {
    phone,
    agentKey: input.agentKey,
    name: trace.direction === "inbound" ? leadName : "",
    occurredAt,
    trace,
  });
  if (!lead) return { imported: false, reason: "lead_not_persisted" };

  if (messageIsBeforeResetCutoff(input.resetCutoffs || {}, resetIdentifiers, occurredAt, lead.row.metadata)) {
    return { imported: false, reason: "before_reset_cutoff" };
  }

  const conversation = await findOrCreateConversation(supabase, {
    leadId: lead.id,
    instanceId: cleanString(input.instance.id),
    agentKey: input.agentKey,
    providerChatId: chatId,
    occurredAt,
    preview,
    trace,
  });
  if (!conversation) return { imported: false, reason: "conversation_not_persisted" };

  if (
    messageIsBeforeResetCutoff(
      input.resetCutoffs || {},
      resetIdentifiers,
      occurredAt,
      lead.row.metadata,
      conversation.row.metadata
    )
  ) {
    return { imported: false, reason: "before_reset_cutoff" };
  }

  if (
    await knownMessageExists(supabase, {
      conversationId: conversation.id,
      providerIds,
      trackId: currentTrackId,
      text,
      mediaUrl,
      occurredAt,
      direction: cleanString(trace.direction),
    })
  ) {
    return { imported: false, reason: "known_message" };
  }

  const { error, data } = await supabase
    .from("whatsapp_conversation_messages")
    .insert({
      conversation_id: conversation.id,
      lead_id: lead.id,
      instance_id: cleanString(input.instance.id) || null,
      direction: cleanString(trace.direction, messageIsFromMe(input.message) ? "outbound" : "inbound"),
      author_type: cleanString(trace.authorType, messageIsFromMe(input.message) ? "human" : "lead"),
      author_label: cleanString(trace.authorLabel, messageIsFromMe(input.message) ? "WhatsApp externo" : leadName || "Lead"),
      message_type: type,
      text: text || null,
      provider: CONNECTYHUB_PROVIDER,
      provider_message_id: primaryProviderMessageId(input.message) || null,
      provider_chat_id: chatId || null,
      occurred_at: occurredAt,
      media_url: mediaUrl || null,
      media_mime_type: mediaUrl ? messageMimeType(input.message) || null : null,
      external_track_id: currentTrackId || null,
      delivery_status: cleanString(input.message.status),
      payload: {
        ...input.message,
        source: cleanString(trace.source),
        betel_origin_trace: trace,
        betelOriginTrace: trace,
        betel_history_sync: {
          providerMessageIds: providerIds,
          syncedAt: new Date().toISOString(),
        },
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
      last_history_sync_trace: trace,
      last_history_sync_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };
  if (leadName && !cleanString(lead.row.name) && trace.direction === "inbound") leadPatch.name = leadName;
  if (shouldPatchLastMessage(lead.row, occurredAt)) leadPatch.last_message_at = occurredAt;

  const conversationPatch: DbRow = {
    instance_id: cleanString(input.instance.id) || null,
    metadata: {
      ...conversationMetadata,
      last_history_sync_trace: trace,
      last_history_sync_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };
  if (shouldPatchLastMessage(conversation.row, occurredAt)) {
    conversationPatch.last_message_at = occurredAt;
    conversationPatch.last_message_preview = preview;
  }

  const updates: Array<PromiseLike<unknown>> = [
    supabase.from("whatsapp_leads").update(leadPatch).eq("id", lead.id),
    supabase.from("whatsapp_conversations").update(conversationPatch).eq("id", conversation.id),
  ];

  if (trace.shouldPauseAiForHandoff || trace.isPanelHumanOutbound) {
    updates.push(
      markManualReplyHandoff(supabase, {
        conversationId: conversation.id,
        leadId: lead.id,
        agentKey: input.agentKey,
        operatorLabel: cleanString(trace.label),
        reason: trace.isPanelHumanOutbound ? "panel_outbound_reconciled" : "external_outbound_reconciled",
        source: cleanString(trace.source),
        note: "Mensagem outbound reconciliada pelo historico da ConnectHub para auditoria.",
        now: occurredAt,
        lastMessagePreview: preview,
      })
    );
  }

  await Promise.all(updates);

  await supabase.from("agent_runtime_events").insert({
    run_id: null,
    run_code: `WA-HIST-${Date.now().toString(36).toUpperCase()}`,
    agent_key: input.agentKey,
    event_type: "whatsapp_conversation_history_reconciled",
    status: "persisted",
    provider: CONNECTYHUB_PROVIDER,
    model: "connectyhub-history",
    attempt: 1,
    message: "Mensagem WhatsApp reconciliada pelo historico da ConnectHub.",
    payload: {
      leadId: lead.id,
      conversationId: conversation.id,
      messageId: cleanString(data?.id),
      trace,
    },
  });

  return {
    imported: true,
    reason: "persisted",
    messageId: cleanString(data?.id),
    conversationId: conversation.id,
    leadId: lead.id,
    direction: cleanString(trace.direction),
    origin: cleanString(trace.source),
  };
}

export async function reconcileWhatsAppConversationHistoryFromConnectyHub(input: {
  agentKey?: string;
  force?: boolean;
  limit?: number;
  intervalMs?: number;
  maxAgeMs?: number;
} = {}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, skipped: true, reason: "missing_supabase_admin", imported: 0, scanned: 0 };

  const intervalMs = Math.max(5_000, input.intervalMs || DEFAULT_SYNC_INTERVAL_MS);
  if (!(await syncIsDue(supabase, intervalMs, Boolean(input.force)))) {
    return { ok: true, skipped: true, reason: "sync_not_due", imported: 0, scanned: 0 };
  }

  await markSyncAttempt(supabase).catch(() => undefined);

  const instances = await activeInstances(supabase, input.agentKey);
  const resetCutoffs = await loadResetCutoffs(supabase);
  let scanned = 0;
  let imported = 0;
  const importedByDirection: Record<string, number> = {};
  const importedByOrigin: Record<string, number> = {};
  const errors: string[] = [];
  const maxAgeMs = Math.max(5 * 60_000, input.maxAgeMs || DEFAULT_MAX_AGE_MS);

  for (const instance of instances) {
    const agentKey = cleanString(instance.agent_key, input.agentKey || DEFAULT_AGENT_KEY);
    const providerInstanceId = cleanString(instance.provider_instance_id);
    if (!providerInstanceId) continue;

    const response = await fetchConnectyHubWhatsappMessages({
      agentKey,
      instanceId: providerInstanceId,
      limit: input.limit || 300,
      timeoutMs: 15000,
    }).catch((error) => {
      errors.push(error instanceof Error ? error.message : "Falha ao consultar mensagens ConnectHub.");
      return null;
    });

    const messages = (response?.messages || [])
      .filter((message) => {
        if (isGroupOrStatusMessage(message)) return false;
        const occurredAt = messageOccurredAt(message);
        const ageMs = Date.now() - Date.parse(occurredAt);
        if (Number.isFinite(ageMs) && (ageMs > maxAgeMs || ageMs < -5 * 60_000)) return false;
        const phone = leadPhoneForMessage(message);
        const chatId = providerChatId(message);
        if (!phone && !chatId) return false;
        return !messageIsBeforeResetCutoff(resetCutoffs, [phone, chatId], occurredAt);
      })
      .sort((left, right) => Date.parse(messageOccurredAt(left)) - Date.parse(messageOccurredAt(right)));

    scanned += messages.length;

    for (const message of messages) {
      const result = await persistHistoryMessage(supabase, { message, instance, agentKey, resetCutoffs });
      if (result.imported) {
        imported += 1;
        const direction = cleanString(result.direction, "unknown");
        const origin = cleanString(result.origin, "unknown");
        importedByDirection[direction] = (importedByDirection[direction] || 0) + 1;
        importedByOrigin[origin] = (importedByOrigin[origin] || 0) + 1;
      }
      if (
        !result.imported &&
        ![
          "known_message",
          "empty_message",
          "group_or_status_ignored",
          "internal_admin_notification_ignored",
          "before_reset_cutoff",
        ].includes(result.reason)
      ) {
        errors.push(result.reason);
      }
    }
  }

  return {
    ok: errors.length === 0,
    skipped: false,
    scanned,
    imported,
    importedByDirection,
    importedByOrigin,
    errors: [...new Set(errors)].slice(0, 8),
  };
}
