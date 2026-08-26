import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveSystemWhatsAppSender } from "./system-whatsapp-sender";
import type { WhatsAppAgentInstanceSummary, WillianConnectionInfo, WillianInstanceState } from "./willian-types";

export const WILLIAN_AGENT_KEY = "multichannel-dispatch";
export const WILLIAN_AGENT_NAME = "Evelyn";
export const WILLIAN_DEFAULT_INSTANCE_NAME = "evelyn-betel";
export const GLOBAL_WHATSAPP_AGENT_KEY = WILLIAN_AGENT_KEY;
export const GLOBAL_WHATSAPP_AGENT_NAME = "WhatsApp Global";
export const GLOBAL_WHATSAPP_DEFAULT_INSTANCE_NAME = WILLIAN_DEFAULT_INSTANCE_NAME;
export const CONNECTYHUB_PROVIDER = "connectyhub";
const CONNECTYHUB_CONNECT_SYSTEM_NAME = "ViralCheck";
const CONNECTYHUB_TEXT_SEND_TIMEOUT_MS = 30000;
const CONNECTYHUB_PRESENCE_TIMEOUT_MS = 3000;
export const CONNECTYHUB_WEBHOOK_EVENTS = [
  "messages",
  "messages_update",
  "connection",
  "chats",
  "contacts",
  "history",
  "presence",
  "groups",
  "labels",
  "chat_labels",
  "newsletter_messages",
  "call",
  "blocks",
  "sender",
] as const;
const CONNECTYHUB_WEBHOOK_EXCLUDES = ["wasSentByApi"] as const;
const PASSKEY_BLOCKED_STATUS = "passkey_blocked";
const PASSKEY_PAIRING_UNSUPPORTED_REASON = "Passkey pairing not supported";

type ConfigSource = "env" | "app_config" | "default" | "missing";

type ConfigValue = {
  value: string;
  source: ConfigSource;
};

type ConnectyHubRequestOptions = {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "DELETE" | "PATCH" | "PUT";
  timeoutMs?: number;
};

export type WhatsAppActionButtonChoiceInput = {
  label: string;
  url: string;
};

export type WhatsAppActionButtonInput = {
  label?: string;
  url?: string;
  footerText?: string;
  choices?: WhatsAppActionButtonChoiceInput[];
};

type ConnectyHubWhatsAppMessageResult = {
  payload: unknown;
  usedIdempotencyKey: boolean;
  sentAsButton: boolean;
  endpoint: "provider" | "legacy";
};

type ConnectyHubWhatsAppMediaResult = {
  payload: unknown;
  usedIdempotencyKey: boolean;
  endpoint: "provider";
};

export type ConnectyHubDeliveryResult = {
  ok: boolean;
  providerStatus: string;
  endpointConfigured: boolean;
  latencyMs: number;
  processedAt: string;
  deliveryUnconfirmed?: boolean;
  externalDeliveryId?: string;
  responsePreview?: string;
  errorMessage?: string;
};

export type ConnectyHubMediaDownloadResult = {
  fileUrl: string;
  mimeType: string;
  base64Data: string;
  transcription: string;
  payload: unknown;
};

export type WhatsAppAgentSendOptions = {
  delayMs?: number;
  readChat?: boolean;
  readMessages?: boolean;
};

export type ConnectyHubWhatsAppDestinationType = "group" | "channel";

export type ConnectyHubWhatsAppGroupParticipant = {
  jid: string;
  phone: string;
  displayName: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  raw: unknown;
};

export type ConnectyHubWhatsAppGroupSummary = {
  jid: string;
  name: string;
  description: string;
  participantCount: number;
  adminCount: number;
  isAnnouncement: boolean;
  isCommunity: boolean;
  isAdmin: boolean;
  inviteUrl: string;
  participants: ConnectyHubWhatsAppGroupParticipant[];
  raw: unknown;
};

export type WhatsAppAgentChatPresence = "composing" | "recording" | "paused";
export type WhatsAppAgentInstancePresence = "available" | "unavailable";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

const PRIMARY_WHATSAPP_LEGACY_INSTANCE_NAMES = [
  "willian",
  "william",
  "willian-betel",
  "william-betel",
];

function normalizedLookupText(value: unknown) {
  return cleanString(value).toLowerCase();
}

function isLegacyPrimaryWhatsappInstanceName(value: unknown) {
  const normalized = normalizedLookupText(value);
  return PRIMARY_WHATSAPP_LEGACY_INSTANCE_NAMES.includes(normalized);
}

function normalizePrimaryWhatsappInstanceName(value: unknown, fallback = WILLIAN_DEFAULT_INSTANCE_NAME) {
  const clean = cleanString(value, fallback);
  return isLegacyPrimaryWhatsappInstanceName(clean) ? WILLIAN_DEFAULT_INSTANCE_NAME : clean;
}

function primaryWhatsappInstanceLookupNames(instanceName: string) {
  return Array.from(
    new Set(
      [instanceName, WILLIAN_DEFAULT_INSTANCE_NAME, ...PRIMARY_WHATSAPP_LEGACY_INSTANCE_NAMES]
        .map((value) => cleanString(value).toLowerCase())
        .filter(Boolean)
    )
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readBoolean(value: string | undefined) {
  return ["1", "true", "yes", "sim", "on"].includes((value || "").trim().toLowerCase());
}

function normalizeBaseUrl(value: string) {
  const clean = cleanString(value).replace(/\/+$/, "");
  if (!clean) return "";
  if (clean.includes("://")) return clean;
  return `https://${clean}`;
}

function normalizePublicUrl(value: string) {
  const clean = cleanString(value).replace(/\/+$/, "");
  if (!clean) return "";
  if (clean.includes("://")) return clean;
  return `https://${clean}`;
}

function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 10) return "configurado";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function preview(text: string, limit = 500) {
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function clampDelayMs(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(0, Math.min(300000, Math.round(numeric)));
}

function optionalSendFields(options?: WhatsAppAgentSendOptions) {
  const delay = clampDelayMs(options?.delayMs);
  return {
    ...(delay > 0 ? { delay } : {}),
    readchat: options?.readChat !== false,
    readmessages: options?.readMessages === true,
  };
}

function shouldFallbackToLegacySend(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  return (
    message.includes("http 400") ||
    message.includes("http 404") ||
    message.includes("invalid payload") ||
    message.includes("cannot post") ||
    message.includes("not found") ||
    message.includes("rota")
  );
}

function clampLabel(value: string, fallback: string, limit = 32) {
  const clean = cleanString(value).replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  const label = clean || fallback;
  return label.length > limit ? label.slice(0, limit).trim() : label;
}

function findFirstHttpUrl(text: string) {
  const match = text.match(/https?:\/\/[^\s<>)\]]+/i);
  if (!match) return "";
  return match[0].replace(/[.,;!?]+$/g, "");
}

function normalizeActionButton(input: WhatsAppActionButtonInput | undefined, text: string) {
  const explicitChoices = (input?.choices || [])
    .map((choice) => ({
      label: clampLabel(choice.label || "", "Abrir link"),
      url: cleanString(choice.url),
    }))
    .filter((choice) => /^https?:\/\//i.test(choice.url))
    .slice(0, 3);

  if (explicitChoices.length) {
    return {
      choices: explicitChoices,
      footerText: clampLabel(input?.footerText || "", "Betel Leiloes", 48),
      explicit: true,
    };
  }

  const explicitUrl = cleanString(input?.url);
  const inferredUrl = explicitUrl || findFirstHttpUrl(text);
  if (!inferredUrl || !/^https?:\/\//i.test(inferredUrl)) return null;

  return {
    choices: [
      {
        label: clampLabel(input?.label || "", "Abrir link"),
        url: inferredUrl,
      },
    ],
    footerText: clampLabel(input?.footerText || "", "Betel Leiloes", 48),
    explicit: Boolean(explicitUrl),
  };
}

function removeButtonUrlFromText(text: string, url: string) {
  return text.replace(url, "").replace(/\n{3,}/g, "\n\n").trim();
}

function configAliases(keys: string[]) {
  return [...new Set(keys.flatMap((key) => [key, key.toLowerCase()]))];
}

async function readAppConfig(keys: string[]) {
  const supabase = getSupabaseAdminClient();
  const values = new Map<string, string>();

  if (!supabase || !keys.length) return values;

  const { data } = await supabase
    .from("app_config")
    .select("key,value")
    .in("key", configAliases(keys));

  for (const row of data || []) {
    const key = cleanString((row as Record<string, unknown>).key);
    const value = cleanString((row as Record<string, unknown>).value);
    if (key && value) values.set(key, value);
  }

  return values;
}

async function upsertAppConfig(records: Array<{ key: string; value: string; description: string; secret?: boolean }>) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !records.length) return;

  await supabase.from("app_config").upsert(
    records.map((record) => ({
      key: record.key,
      value: record.value,
      description: record.description,
      is_secret: Boolean(record.secret),
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "key" }
  );
}

async function deleteAppConfig(keys: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !keys.length) return;

  await supabase.from("app_config").delete().in("key", configAliases(keys));
}

function configFrom(keys: string[], appConfig: Map<string, string>, fallback = ""): ConfigValue {
  for (const key of configAliases(keys)) {
    const value = cleanString(appConfig.get(key));
    if (value) return { value, source: "app_config" };
  }

  for (const key of keys) {
    const value = cleanString(process.env[key]);
    if (value) return { value, source: "env" };
  }

  if (fallback) return { value: fallback, source: "default" };
  return { value: "", source: "missing" };
}

function booleanConfigFrom(keys: string[], appConfig: Map<string, string>) {
  for (const key of configAliases(keys)) {
    if (readBoolean(appConfig.get(key))) return true;
  }

  return keys.some((key) => readBoolean(process.env[key]));
}

function isConnectyHubApiKey(value: string) {
  const token = cleanString(value);
  return token.length >= 20 && !/\s/.test(token);
}

const globalWhatsappInstanceNameKeys = [
  "BETEL_GLOBAL_WHATSAPP_INSTANCE_NAME",
  "BETEL_GLOBAL_CONNECTYHUB_INSTANCE_NAME",
  "BETEL_WILLIAN_CONNECTYHUB_INSTANCE_NAME",
];
const globalWhatsappInstanceIdKeys = [
  "BETEL_GLOBAL_WHATSAPP_INSTANCE_ID",
  "BETEL_GLOBAL_CONNECTYHUB_INSTANCE_ID",
  "BETEL_WILLIAN_CONNECTYHUB_INSTANCE_ID",
];
const globalWhatsappPhoneKeys = [
  "BETEL_GLOBAL_WHATSAPP_PHONE_NUMBER",
  "BETEL_WILLIAN_WHATSAPP_PHONE_NUMBER",
];
const globalWhatsappDisplayNameKeys = [
  "BETEL_GLOBAL_WHATSAPP_DISPLAY_NAME",
  "BETEL_WILLIAN_WHATSAPP_DISPLAY_NAME",
];
const globalWhatsappProfileImageKeys = [
  "BETEL_GLOBAL_WHATSAPP_PROFILE_IMAGE_URL",
  "BETEL_WILLIAN_WHATSAPP_PROFILE_IMAGE_URL",
];
const globalWhatsappProfileSyncedAtKeys = [
  "BETEL_GLOBAL_WHATSAPP_PROFILE_SYNCED_AT",
  "BETEL_WILLIAN_WHATSAPP_PROFILE_SYNCED_AT",
];
const primaryWhatsappAgentArchivedKeys = [
  "BETEL_WHATSAPP_PRIMARY_AGENT_ARCHIVED",
  "BETEL_WILLIAN_WHATSAPP_AGENT_ARCHIVED",
];
const primaryWhatsappAgentPausedKeys = [
  "BETEL_WHATSAPP_PRIMARY_AGENT_PAUSED",
  "BETEL_WILLIAN_WHATSAPP_AGENT_PAUSED",
];

const willianConfigKeys = [
  "CONNECTYHUB_API_URL",
  "CONNECTYHUB_API_TOKEN",
  "CONNECTYHUB_WEBHOOK_SECRET",
  "CONNECTYHUB_WEBHOOK_URL",
  ...globalWhatsappInstanceNameKeys,
  ...globalWhatsappInstanceIdKeys,
  ...globalWhatsappPhoneKeys,
  ...globalWhatsappDisplayNameKeys,
  ...globalWhatsappProfileImageKeys,
  ...globalWhatsappProfileSyncedAtKeys,
  "BETEL_WILLIAN_CONNECTYHUB_INSTANCE_NAME",
  "BETEL_WILLIAN_CONNECTYHUB_INSTANCE_ID",
  "BETEL_WILLIAN_WHATSAPP_PHONE_NUMBER",
  "BETEL_WILLIAN_WHATSAPP_DISPLAY_NAME",
  "BETEL_WILLIAN_WHATSAPP_PROFILE_IMAGE_URL",
  "BETEL_WILLIAN_WHATSAPP_PROFILE_SYNCED_AT",
  "BETEL_COMMUNICATION_PROVIDER_RELEASED",
  "BETEL_WHATSAPP_PROVIDER_RELEASED",
  "BETEL_EMAIL_PROVIDER_RELEASED",
  "RESEND_API_KEY",
  "BETEL_EMAIL_PROVIDER",
  "BETEL_EMAIL_FROM",
];

async function isPrimaryWhatsappAgentArchived() {
  const appConfig = await readAppConfig(primaryWhatsappAgentArchivedKeys);
  return configAliases(primaryWhatsappAgentArchivedKeys).some((key) => readBoolean(appConfig.get(key)));
}

async function setPrimaryWhatsappAgentArchived(archived: boolean) {
  if (!archived) {
    await deleteAppConfig(primaryWhatsappAgentArchivedKeys);
    return;
  }

  await upsertAppConfig([
    {
      key: "BETEL_WHATSAPP_PRIMARY_AGENT_ARCHIVED",
      value: "true",
      description: "Oculta o agente principal da Central WhatsApp sem arquivar o agente interno multichannel-dispatch.",
    },
  ]);
}

async function isPrimaryWhatsappAgentPaused() {
  const appConfig = await readAppConfig(primaryWhatsappAgentPausedKeys);
  return configAliases(primaryWhatsappAgentPausedKeys).some((key) => readBoolean(appConfig.get(key)));
}

async function setPrimaryWhatsappAgentPaused(paused: boolean) {
  if (!paused) {
    await deleteAppConfig(primaryWhatsappAgentPausedKeys);
    return;
  }

  await upsertAppConfig([
    {
      key: "BETEL_WHATSAPP_PRIMARY_AGENT_PAUSED",
      value: "true",
      description: "Pausa operacionalmente o agente principal da Central WhatsApp sem desconectar o numero.",
    },
  ]);
}

async function getWillianConfig() {
  const appConfig = await readAppConfig(willianConfigKeys);
  const base = configFrom(["CONNECTYHUB_API_URL"], appConfig, "https://www.connectyhub.com.br/api/v1");
  const apiToken = configFrom(["CONNECTYHUB_API_TOKEN"], appConfig);
  const webhookSecret = configFrom(["CONNECTYHUB_WEBHOOK_SECRET"], appConfig);
  const webhookUrl = configFrom(["CONNECTYHUB_WEBHOOK_URL"], appConfig);
  const instanceName = configFrom(globalWhatsappInstanceNameKeys, appConfig, GLOBAL_WHATSAPP_DEFAULT_INSTANCE_NAME);
  const instanceId = configFrom(globalWhatsappInstanceIdKeys, appConfig);
  const phoneNumber = configFrom(globalWhatsappPhoneKeys, appConfig);
  const displayName = configFrom(globalWhatsappDisplayNameKeys, appConfig);
  const profileImageUrl = configFrom(globalWhatsappProfileImageKeys, appConfig);
  const profileImageSyncedAt = configFrom(globalWhatsappProfileSyncedAtKeys, appConfig);
  const emailProvider = configFrom(["BETEL_EMAIL_PROVIDER"], appConfig, "resend");
  const resendKey = configFrom(["RESEND_API_KEY"], appConfig);
  const emailFrom = configFrom(["BETEL_EMAIL_FROM"], appConfig);
  const communicationReleased = booleanConfigFrom(["BETEL_COMMUNICATION_PROVIDER_RELEASED"], appConfig);
  const whatsappProviderReleased =
    communicationReleased ||
    booleanConfigFrom(["BETEL_WHATSAPP_PROVIDER_RELEASED"], appConfig);
  const emailProviderReleased =
    communicationReleased ||
    booleanConfigFrom(["BETEL_EMAIL_PROVIDER_RELEASED"], appConfig);

  return {
    baseUrl: normalizeBaseUrl(base.value) || "https://www.connectyhub.com.br/api/v1",
    baseUrlSource: base.source,
    apiToken: apiToken.value,
    apiTokenSource: apiToken.source,
    apiTokenLooksValid: isConnectyHubApiKey(apiToken.value),
    webhookSecret: webhookSecret.value,
    webhookUrl: normalizePublicUrl(webhookUrl.value),
    instanceName: normalizePrimaryWhatsappInstanceName(instanceName.value),
    instanceId: instanceId.value,
    phoneNumber: normalizeWhatsAppNumber(phoneNumber.value),
    displayName: displayName.value,
    profileImageUrl: normalizeProfileImageUrl(profileImageUrl.value),
    profileImageSyncedAt: profileImageSyncedAt.value,
    emailProvider: emailProvider.value,
    resendKey: resendKey.value,
    emailFrom: emailFrom.value,
    whatsappProviderReleased,
    emailProviderReleased,
  };
}

function readBooleanLike(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const clean = cleanString(value).toLowerCase();
  if (!clean) return false;
  return ["1", "true", "yes", "sim", "on", "connected", "open", "online", "ready", "logged", "loggedin"].includes(clean);
}

function normalizeConnectionState(value: unknown, connected: boolean) {
  const clean = cleanString(value);
  const normalized = clean.toLowerCase().replace(/\s+/g, "_");
  if (!normalized) return connected ? "connected" : "disconnected";

  if (
    normalized.includes("disconnect") ||
    normalized.includes("not_connected") ||
    normalized.includes("notconnected") ||
    normalized.includes("not_logged") ||
    normalized.includes("notlogged") ||
    normalized.includes("logout") ||
    normalized === "close" ||
    normalized === "closed" ||
    normalized === "offline"
  ) {
    return "disconnected";
  }

  if (normalized.includes("qr") || normalized.includes("scan") || normalized.includes("pair")) return "qr_pending";
  if (normalized.includes("hibernated")) return "hibernated";
  if (normalized.includes("connect") && !normalized.includes("disconnect")) return "connected";
  if (["open", "online", "ready", "logged", "loggedin"].includes(normalized)) return "connected";
  return clean;
}

function connectionStateIsTerminallyDisconnected(value: unknown) {
  const normalized = cleanString(value).toLowerCase().replace(/\s+/g, "_");
  return Boolean(
    normalized.includes("disconnect") ||
      normalized.includes("not_connected") ||
      normalized.includes("notconnected") ||
      normalized.includes("not_logged") ||
      normalized.includes("notlogged") ||
      normalized.includes("logout") ||
      normalized === "close" ||
      normalized === "closed" ||
      normalized === "offline" ||
      normalized === "deleted" ||
      normalized === "archived"
  );
}

const statusContainerKeys = new Set([
  "data",
  "result",
  "response",
  "instance",
  "status",
  "connection",
  "session",
  "provider",
  "whatsapp",
  "account",
  "profile",
]);

function collectStatusRecords(payload: unknown, depth = 0): Array<Record<string, unknown>> {
  if (!payload || depth > 5) return [];
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => collectStatusRecords(item, depth + 1));
  }
  if (typeof payload !== "object") return [];

  const record = asRecord(payload);
  const records = [record];
  for (const [key, value] of Object.entries(record)) {
    if (!value || typeof value !== "object") continue;
    if (depth < 2 || statusContainerKeys.has(key)) {
      records.push(...collectStatusRecords(value, depth + 1));
    }
  }

  return records;
}

function firstRecordValue(records: Array<Record<string, unknown>>, keys: string[]) {
  for (const record of records) {
    for (const key of keys) {
      if (key in record) {
        const value = record[key];
        if (typeof value !== "undefined" && value !== null && value !== "") return value;
      }
    }
  }

  return undefined;
}

function normalizeStatusPayload(payload: unknown) {
  const records = collectStatusRecords(payload);
  const rawState = firstRecordValue(records, [
    "connectionStatus",
    "connection_status",
    "instanceStatus",
    "instance_status",
    "sessionStatus",
    "session_status",
    "whatsappStatus",
    "whatsapp_status",
    "state",
    "status",
  ]);
  const preliminaryState = normalizeConnectionState(rawState, false);
  const connectedKeys = [
    "connected",
    "isConnected",
    "is_connected",
    "loggedIn",
    "logged_in",
    "isLogged",
    "is_logged",
    "authenticated",
    "ready",
    "online",
    "open",
  ];
  const connected =
    preliminaryState === "connected" ||
    records.some((record) => connectedKeys.some((key) => readBooleanLike(record[key]))) ||
    records.some((record) => {
      const recordState = normalizeConnectionState(firstRecordValue([record], ["state", "status", "connectionStatus", "connection_status"]), false);
      return recordState === "connected";
    });
  const loggedIn =
    connected ||
    records.some((record) => ["loggedIn", "logged_in", "isLogged", "is_logged"].some((key) => readBooleanLike(record[key])));
  const state = normalizeConnectionState(rawState, connected);
  const jid =
    firstRecordValue(records, [
      "jid",
      "owner",
      "ownerJid",
      "owner_jid",
      "phoneNumber",
      "phone_number",
      "number",
      "phone",
      "waId",
      "wa_id",
    ]) ?? null;

  return { connected, loggedIn, jid, state };
}

function findFirstString(payload: unknown, keys: string[]): string {
  if (typeof payload === "string") return "";
  if (!payload || typeof payload !== "object") return "";

  const record = asRecord(payload);
  const normalizedKeys = keys.map((key) => key.toLowerCase());
  for (const key of keys) {
    const value = cleanString(record[key]);
    if (value) return value;
  }
  for (const [key, value] of Object.entries(record)) {
    if (normalizedKeys.includes(key.toLowerCase())) {
      const clean = cleanString(value);
      if (clean) return clean;
    }
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const found = findFirstString(value, keys);
      if (found) return found;
    }
  }

  return "";
}

function payloadHasPasskeyBlock(payload: unknown, depth = 0): boolean {
  if (!payload || depth > 8) return false;
  if (typeof payload === "string") {
    const text = payload.toLowerCase();
    return (
      text.includes(PASSKEY_PAIRING_UNSUPPORTED_REASON.toLowerCase()) ||
      text.includes(PASSKEY_BLOCKED_STATUS)
    );
  }
  if (Array.isArray(payload)) return payload.some((item) => payloadHasPasskeyBlock(item, depth + 1));
  if (typeof payload !== "object") return false;

  const record = asRecord(payload);
  const lastDisconnectReason = cleanString(
    record.lastDisconnectReason ||
      record.last_disconnect_reason ||
      record.disconnectReason ||
      record.disconnect_reason
  ).toLowerCase();
  const finalStatus = cleanString(record.finalStatus || record.final_status).toLowerCase();
  const eventType = cleanString(record.type).toLowerCase();

  if (lastDisconnectReason.includes(PASSKEY_PAIRING_UNSUPPORTED_REASON.toLowerCase())) return true;
  if (finalStatus === PASSKEY_BLOCKED_STATUS) return true;
  if (eventType === PASSKEY_BLOCKED_STATUS) return true;

  return Object.values(record).some((value) => payloadHasPasskeyBlock(value, depth + 1));
}

function extractConnectionInfo(payload: unknown): WillianConnectionInfo {
  const qrCode = findFirstString(payload, ["qrCode", "qrcode", "qr", "base64", "image"]);
  const pairingCode = findFirstString(payload, ["pairingCode", "pairCode", "paircode", "code"]);
  const finalStatus = findFirstString(payload, ["finalStatus", "final_status"]);
  const lastDisconnectReason = findFirstString(payload, [
    "lastDisconnectReason",
    "last_disconnect_reason",
    "disconnectReason",
    "disconnect_reason",
    "reason",
  ]);
  const status = normalizeStatusPayload(payload).state;
  const info: WillianConnectionInfo = {};

  if (status) info.status = status;
  if (finalStatus) info.finalStatus = finalStatus;
  if (pairingCode) info.pairingCode = pairingCode;
  if (lastDisconnectReason) info.lastDisconnectReason = lastDisconnectReason;
  if (payloadHasPasskeyBlock(payload)) {
    info.passkeyBlocked = true;
    info.technicalReason = PASSKEY_PAIRING_UNSUPPORTED_REASON;
  }
  if (qrCode) {
    if (qrCode.startsWith("data:image")) info.qrCodeDataUrl = qrCode;
    else if (qrCode.length > 80 && /^[A-Za-z0-9+/=]+$/.test(qrCode)) info.qrCodeDataUrl = `data:image/png;base64,${qrCode}`;
    else info.qrCode = qrCode;
  }

  return info;
}

function buildConnectBody(input: { phone?: string; browser?: string; systemName?: string } = {}) {
  const body: Record<string, unknown> = {
    browser: cleanString(input.browser, "auto"),
    systemName: cleanString(input.systemName, CONNECTYHUB_CONNECT_SYSTEM_NAME),
  };
  const phone = normalizeWhatsAppNumber(input.phone || "");
  if (phone) body.phone = phone;
  return body;
}

const profileImageKeys = [
  "profileImageUrl",
  "profile_image_url",
  "profilePictureUrl",
  "profile_picture_url",
  "profilePicUrl",
  "profile_pic_url",
  "pictureUrl",
  "picture_url",
  "photoUrl",
  "photo_url",
  "imageUrl",
  "image_url",
  "avatarUrl",
  "avatar_url",
  "profileImage",
  "profilePicture",
  "profilePic",
  "imagePreview",
  "picture",
  "photo",
  "avatar",
];

function normalizeProfileImageUrl(value: unknown) {
  const clean = cleanString(value).replace(/\s/g, "");
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(clean)) return clean;
  if (clean.length > 120 && /^[A-Za-z0-9+/=]+$/.test(clean)) return `data:image/jpeg;base64,${clean}`;
  return "";
}

function isProfileImageContainerKey(key: string) {
  const normalized = key.toLowerCase();
  if (normalized.includes("qr") || normalized.includes("pair")) return false;
  return /(profile|avatar|picture|photo|image)/.test(normalized);
}

function findProfileImageUrl(payload: unknown, depth = 0, insideProfileKey = false): string {
  if (depth > 8) return "";
  if (typeof payload === "string") return insideProfileKey ? normalizeProfileImageUrl(payload) : "";
  if (!payload || typeof payload !== "object") return "";

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findProfileImageUrl(item, depth + 1, insideProfileKey);
      if (found) return found;
    }
    return "";
  }

  const record = asRecord(payload);
  for (const key of profileImageKeys) {
    if (key in record) {
      const found = findProfileImageUrl(record[key], depth + 1, true);
      if (found) return found;
    }
  }

  for (const [key, value] of Object.entries(record)) {
    const found = findProfileImageUrl(value, depth + 1, insideProfileKey || isProfileImageContainerKey(key));
    if (found) return found;
  }

  return "";
}

function extractProfileImageUrl(...payloads: unknown[]) {
  for (const payload of payloads) {
    const found = findProfileImageUrl(payload);
    if (found) return found;
  }
  return "";
}

function extractWhatsappPhoneNumber(...payloads: unknown[]) {
  for (const payload of payloads) {
    const found = findFirstString(payload, [
      "phoneNumber",
      "phone_number",
      "phone",
      "number",
      "owner",
      "ownerJid",
      "jid",
      "sender",
      "chatid",
      "chatId",
      "wa_chatid",
    ]);
    const normalized = normalizeWhatsAppNumber(found);
    if (normalized.length >= 10) return normalized;
  }
  return "";
}

function extractWhatsappDisplayNameFromPayload(payload: unknown, includeGenericName = false) {
  const keys = [
    "profileName",
    "profile_name",
    "displayName",
    "display_name",
    "pushName",
    "push_name",
    "verifiedName",
    "businessName",
    "business_name",
    "wa_name",
    "wa_contactName",
    "name",
  ];
  const found = findFirstString(payload, includeGenericName ? keys : keys.filter((key) => key !== "name"));
  return found;
}

function extractWhatsappDisplayName(...payloads: unknown[]) {
  for (const payload of payloads) {
    const found = extractWhatsappDisplayNameFromPayload(payload);
    if (found) return found;
  }
  return "";
}

function extractWhatsappProfileDisplayName(...payloads: unknown[]) {
  for (const payload of payloads) {
    const found = extractWhatsappDisplayNameFromPayload(payload, true);
    if (found) return found;
  }
  return "";
}

function extractDeliveryId(payload: unknown) {
  const data = asRecord(payload);
  const message = asRecord(data.message);
  const response = asRecord(data.response);
  return cleanString(
    data.id ||
      data.messageId ||
      data.messageID ||
      data.messageid ||
      data.requestId ||
      data.trackId ||
      message.id ||
      message.messageid ||
      response.id
  );
}

function extractWebhookId(payload: unknown) {
  const data = asRecord(payload);
  const webhook = asRecord(data.webhook);
  const item = asRecord(data.data);
  return cleanString(data.id || data.webhookId || data.webhook_id || webhook.id || webhook.webhookId || item.id || item.webhookId);
}

function extractWebhookSecret(payload: unknown) {
  return findFirstString(payload, [
    "secret",
    "webhookSecret",
    "webhook_secret",
    "signingSecret",
    "signing_secret",
  ]);
}

function sanitizePayload(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload.map(sanitizePayload);
  if (!payload || typeof payload !== "object") return payload;

  const record = payload as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey.includes("token") || normalizedKey.includes("secret") || normalizedKey.includes("signature")) {
        return [key, "[redacted]"];
      }
      if (
        typeof value === "string" &&
        value.length > 500 &&
        (normalizedKey.includes("image") ||
          normalizedKey.includes("photo") ||
          normalizedKey.includes("picture") ||
          normalizedKey.includes("avatar") ||
          normalizedKey === "base64" ||
          normalizedKey === "qrcode")
      ) {
        return [key, `[image:${value.length} chars]`];
      }
      return [key, sanitizePayload(value)];
    })
  );
}

async function connectyhubRequest(path: string, options: ConnectyHubRequestOptions = {}) {
  const config = await getWillianConfig();
  const method = options.method || (options.body ? "POST" : "GET");
  const endpoint = `${config.baseUrl}${path}`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${config.apiToken}`,
    "x-connectyhub-api-key": config.apiToken,
    ...options.headers,
  };

  if (!config.apiToken) throw new Error("CONNECTYHUB_API_TOKEN ausente.");
  if (options.body) headers["content-type"] = "application/json";

  const response = await fetch(endpoint, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
    headers,
    method,
    signal: AbortSignal.timeout(options.timeoutMs || 15000),
  });
  const text = await response.text().catch(() => "");
  const payload = text
    ? (() => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return { response: text };
        }
      })()
    : {};

  if (!response.ok) {
    const data = asRecord(payload);
    const error = asRecord(data.error);
    const code = cleanString(error.code || data.code);
    const message = cleanString(error.message || data.message || data.error || data.response, `ConnectyHub retornou HTTP ${response.status}.`);
    throw new Error(explainConnectyHubError({ code, message, path, status: response.status }));
  }

  return payload;
}

function explainConnectyHubError(input: { code: string; message: string; path: string; status: number }) {
  const codeSuffix = input.code ? ` (${input.code})` : "";
  const normalized = `${input.code} ${input.message}`.toLowerCase();

  if (
    input.code === "invalid_api_key" ||
    input.code === "missing_api_key" ||
    input.code === "expired_api_key" ||
    input.code === "api_client_inactive"
  ) {
    return `Chave ConnectyHub recusada${codeSuffix}: ${input.message}. Salve uma API key ativa no formato ch_live_... em CONNECTYHUB_API_TOKEN.`;
  }

  if (input.code.startsWith("provider_") || normalized.includes("invalid token")) {
    return `ConnectyHub aceitou a chave, mas o provedor WhatsApp recusou a operacao${codeSuffix}: ${input.message}. Recrie ou vincule uma instancia nova antes de gerar o QR Code.`;
  }

  return `ConnectyHub retornou HTTP ${input.status}${codeSuffix}: ${input.message}`;
}

function isConnectyHubIdempotencyStoreError(error: unknown) {
  const normalized = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  return (
    normalized.includes("idempotency_lookup_failed") ||
    normalized.includes("connectyhub_api_idempotency_keys") ||
    (normalized.includes("schema cache") && normalized.includes("idempotency"))
  );
}

function isUnconfirmedConnectyHubDeliveryError(error: unknown) {
  const normalized = (error instanceof Error ? `${error.name} ${error.message}` : String(error || "")).toLowerCase();
  return (
    normalized.includes("abort") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("fetch failed") ||
    normalized.includes("socket") ||
    normalized.includes("network")
  );
}

async function connectyhubRequestWithIdempotencyFallback(
  path: string,
  options: ConnectyHubRequestOptions & { idempotencyKey?: string }
) {
  const idempotencyKey = cleanString(options.idempotencyKey);
  const baseOptions: ConnectyHubRequestOptions = {
    ...(options.body ? { body: options.body } : {}),
    ...(options.headers ? { headers: { ...options.headers } } : {}),
    ...(options.method ? { method: options.method } : {}),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  };

  if (!idempotencyKey) {
    return { payload: await connectyhubRequest(path, baseOptions), usedIdempotencyKey: false };
  }

  try {
    return {
      payload: await connectyhubRequest(path, {
        ...baseOptions,
        headers: {
          ...(baseOptions.headers || {}),
          "Idempotency-Key": idempotencyKey,
        },
      }),
      usedIdempotencyKey: true,
    };
  } catch (error) {
    if (!isConnectyHubIdempotencyStoreError(error)) throw error;

    return {
      payload: await connectyhubRequest(path, baseOptions),
      usedIdempotencyKey: false,
    };
  }
}

async function sendConnectyHubWhatsAppMessage(input: {
  instanceId: string;
  number: string;
  text: string;
  trackId: string;
  idempotencyKey?: string;
  actionButton?: WhatsAppActionButtonInput;
  inferActionButtonFromText?: boolean;
  sendOptions?: WhatsAppAgentSendOptions;
  mentions?: string[];
  replyId?: string;
  timeoutMs?: number;
}): Promise<ConnectyHubWhatsAppMessageResult> {
  const button = normalizeActionButton(input.actionButton, input.inferActionButtonFromText === false ? "" : input.text);
  const timeoutMs = input.timeoutMs || CONNECTYHUB_TEXT_SEND_TIMEOUT_MS;
  const sendFields = optionalSendFields(input.sendOptions);

  if (button) {
    const inferredUrl = button.choices[0]?.url || "";
    const buttonText = button.explicit ? input.text.trim() : removeButtonUrlFromText(input.text, inferredUrl);

    const { payload, usedIdempotencyKey } = await connectyhubRequestWithIdempotencyFallback("/provider/send/menu", {
      body: {
        instanceId: input.instanceId,
        payload: {
          number: input.number,
          type: "button",
          text: buttonText || input.text.trim(),
          choices: button.choices.map((choice) => `${choice.label}|${choice.url}`),
          footerText: button.footerText,
          track_source: "betel_ai",
          track_id: input.trackId,
          ...sendFields,
        },
      },
      idempotencyKey: input.idempotencyKey || input.trackId,
      timeoutMs,
    });

    return { payload, usedIdempotencyKey, sentAsButton: true, endpoint: "provider" };
  }

  try {
    const { payload, usedIdempotencyKey } = await connectyhubRequestWithIdempotencyFallback("/provider/send/text", {
      body: {
        instanceId: input.instanceId,
        payload: {
          number: input.number,
          text: input.text,
          linkPreview: true,
          ...(input.mentions?.length ? { mentions: input.mentions.join(",") } : {}),
          ...(input.replyId ? { replyid: input.replyId } : {}),
          track_source: "betel_ai",
          track_id: input.trackId,
          ...sendFields,
        },
      },
      idempotencyKey: input.idempotencyKey || input.trackId,
      timeoutMs,
    });

    return { payload, usedIdempotencyKey, sentAsButton: false, endpoint: "provider" };
  } catch (error) {
    if (!shouldFallbackToLegacySend(error)) throw error;

    const { payload, usedIdempotencyKey } = await connectyhubRequestWithIdempotencyFallback("/messages/text", {
      body: {
        instanceId: input.instanceId,
        number: input.number,
        text: input.text,
        linkPreview: true,
        ...(input.mentions?.length ? { mentions: input.mentions.join(",") } : {}),
        ...(input.replyId ? { replyid: input.replyId } : {}),
        trackId: input.trackId,
        delay: sendFields.delay,
        readchat: sendFields.readchat,
        readmessages: sendFields.readmessages,
      },
      idempotencyKey: input.idempotencyKey || input.trackId,
      timeoutMs,
    });

    return { payload, usedIdempotencyKey, sentAsButton: false, endpoint: "legacy" };
  }
}

async function sendConnectyHubWhatsAppMedia(input: {
  instanceId: string;
  number: string;
  fileUrl: string;
  mediaType: string;
  text?: string;
  trackId: string;
  idempotencyKey?: string;
  sendOptions?: WhatsAppAgentSendOptions;
  mentions?: string[];
  replyId?: string;
  timeoutMs?: number;
}): Promise<ConnectyHubWhatsAppMediaResult> {
  const timeoutMs = input.timeoutMs || CONNECTYHUB_TEXT_SEND_TIMEOUT_MS;
  const sendFields = optionalSendFields(input.sendOptions);

  const { payload, usedIdempotencyKey } = await connectyhubRequestWithIdempotencyFallback("/provider/send/media", {
    body: {
      instanceId: input.instanceId,
      payload: {
        number: input.number,
        type: cleanString(input.mediaType, "image"),
        file: input.fileUrl,
        text: cleanString(input.text),
        ...(input.mentions?.length ? { mentions: input.mentions.join(",") } : {}),
        ...(input.replyId ? { replyid: input.replyId } : {}),
        track_source: "betel_ai",
        track_id: input.trackId,
        ...sendFields,
      },
    },
    idempotencyKey: input.idempotencyKey || input.trackId,
    timeoutMs,
  });

  return { payload, usedIdempotencyKey, endpoint: "provider" };
}

function firstArrayPayload(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const record = asRecord(payload);
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const values = Object.values(asRecord(value)).filter((item) => item && typeof item === "object");
      if (values.length) return values;
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (keys.some((candidate) => candidate.toLowerCase() === key.toLowerCase()) && Array.isArray(value)) {
      return value;
    }
    if (keys.some((candidate) => candidate.toLowerCase() === key.toLowerCase()) && value && typeof value === "object") {
      const values = Object.values(asRecord(value)).filter((item) => item && typeof item === "object");
      if (values.length) return values;
    }
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const nested = firstArrayPayload(value, keys);
      if (nested.length) return nested;
    }
  }
  return [];
}

function readNumberLike(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value || "");
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function recordValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }

  const entries = Object.entries(record);
  for (const key of keys) {
    const match = entries.find(([candidate]) => candidate.toLowerCase() === key.toLowerCase());
    if (match && match[1] !== undefined && match[1] !== null) return match[1];
  }

  return undefined;
}

function normalizeWhatsappJid(value: unknown) {
  const clean = cleanString(value);
  if (!clean) return "";
  if (clean.includes("@")) return clean;
  const digits = normalizeWhatsAppNumber(clean);
  return digits || clean;
}

function normalizeGroupParticipant(value: unknown): ConnectyHubWhatsAppGroupParticipant {
  const record = asRecord(value);
  const jid = normalizeWhatsappJid(
    recordValue(record, ["id", "jid", "participant", "user", "phone", "number"])
  );
  const participantPhone = normalizeWhatsAppNumber(jid.replace(/@.+$/, "") || cleanString(recordValue(record, ["phone", "number"])));
  const role = cleanString(recordValue(record, ["role", "type", "admin"])).toLowerCase();

  return {
    jid,
    phone: participantPhone,
    displayName: cleanString(recordValue(record, ["name", "pushName", "displayName", "notifyName"])),
    isAdmin: recordValue(record, ["isAdmin"]) === true || role === "admin" || role === "superadmin" || role === "super_admin",
    isSuperAdmin: recordValue(record, ["isSuperAdmin"]) === true || role === "superadmin" || role === "super_admin" || role === "owner",
    raw: sanitizePayload(value),
  };
}

function groupJidFromRecord(record: Record<string, unknown>) {
  const key = asRecord(record.key);
  const candidates = [
    recordValue(record, ["jid", "groupJid", "group_jid", "remoteJid", "remote_jid", "chatId", "chatid", "wa_chatid"]),
    recordValue(key, ["remoteJid", "remote_jid"]),
    recordValue(record, ["id"]),
  ];
  const explicit = candidates.map(normalizeWhatsappJid).find((jid) => jid.includes("@g.us") || jid.includes("@newsletter"));
  return explicit || normalizeWhatsappJid(candidates.find(Boolean));
}

function looksLikeWhatsAppGroup(value: unknown) {
  const record = asRecord(value);
  const jid = groupJidFromRecord(record);
  const type = cleanString(recordValue(record, ["type", "kind", "chatType", "chat_type"])).toLowerCase();
  return (
    jid.includes("@g.us") ||
    jid.includes("@newsletter") ||
    recordValue(record, ["isGroup", "is_group", "group"]) === true ||
    type.includes("group") ||
    type.includes("newsletter") ||
    type.includes("channel")
  );
}

function normalizeConnectyHubGroup(value: unknown): ConnectyHubWhatsAppGroupSummary {
  const record = asRecord(value);
  const participants = firstArrayPayload(record, ["participants", "members", "users"]).map(normalizeGroupParticipant);
  const jid = groupJidFromRecord(record);
  const adminCount = participants.filter((participant) => participant.isAdmin || participant.isSuperAdmin).length;
  const remoteParticipantCount = readNumberLike(recordValue(record, ["size", "participantCount", "participantsCount"]));

  return {
    jid,
    name: cleanString(recordValue(record, ["subject", "name", "title", "groupName", "pushName"]), jid || "Grupo WhatsApp"),
    description: cleanString(recordValue(record, ["desc", "description", "groupDescription", "topic"])),
    participantCount: Math.max(remoteParticipantCount, participants.length),
    adminCount: readNumberLike(recordValue(record, ["adminCount", "adminsCount"]), adminCount),
    isAnnouncement: Boolean(recordValue(record, ["announce", "isAnnouncement", "announcement", "isAnnounce"])),
    isCommunity: Boolean(recordValue(record, ["isCommunity", "community", "isCommunityAnnounce", "isParent"])),
    isAdmin: Boolean(recordValue(record, ["isAdmin", "owner", "isOwner"])),
    inviteUrl: cleanString(recordValue(record, ["inviteUrl", "invite_url", "inviteCode", "invite"])),
    participants,
    raw: sanitizePayload(value),
  };
}

function normalizeGroupPayload(payload: unknown, keys: string[]) {
  const candidates = firstArrayPayload(payload, keys);
  const values = candidates.length ? candidates : looksLikeWhatsAppGroup(payload) ? [payload] : [];
  return values
    .filter(looksLikeWhatsAppGroup)
    .map(normalizeConnectyHubGroup)
    .filter((group) => Boolean(group.jid));
}

async function connectyhubRequestOrError(path: string, options: ConnectyHubRequestOptions = {}) {
  try {
    return {
      ok: true,
      path,
      payload: await connectyhubRequest(path, options),
    };
  } catch (error) {
    return {
      ok: false,
      path,
      error: error instanceof Error ? error.message : "Falha ao chamar ConnectyHub.",
    };
  }
}

export async function listConnectyHubWhatsAppGroups(input: {
  agentKey?: string;
  instanceId?: string;
  force?: boolean;
  noParticipants?: boolean;
  limit?: number;
  search?: string;
}): Promise<{ ok: boolean; instanceId: string; groups: ConnectyHubWhatsAppGroupSummary[]; raw: unknown }> {
  const agentKey = cleanString(input.agentKey, WILLIAN_AGENT_KEY);
  const { config, instanceId } = await resolveAgentProviderInstanceId(agentKey, input.instanceId);

  if (!config.apiToken || !instanceId) {
    throw new Error(!config.apiToken ? "CONNECTYHUB_API_TOKEN ausente." : "Instancia ConnectyHub ausente para listar grupos.");
  }

  const query = new URLSearchParams({
    instanceId,
    force: input.force ? "true" : "false",
    noparticipants: input.noParticipants ? "true" : "false",
  });
  if (input.search) query.set("search", input.search);

  const attempts: unknown[] = [];
  const providerGet = await connectyhubRequestOrError(`/provider/group/list?${query.toString()}`, {
    method: "GET",
    timeoutMs: 20000,
  });
  attempts.push(providerGet);

  let groups = providerGet.ok ? normalizeGroupPayload(providerGet.payload, ["groups", "data", "items", "result", "results"]) : [];

  if (!groups.length) {
    const providerPost = await connectyhubRequestOrError("/provider/group/list", {
      body: {
        instanceId,
        payload: {
          force: Boolean(input.force),
          noParticipants: Boolean(input.noParticipants),
          limit: input.limit || 1000,
          ...(input.search ? { search: input.search } : {}),
        },
      },
      timeoutMs: 20000,
    });
    attempts.push(providerPost);
    if (providerPost.ok) groups = normalizeGroupPayload(providerPost.payload, ["groups", "data", "items", "result", "results"]);
  }

  if (!groups.length) {
    const chatsQuery = new URLSearchParams({
      instanceId,
      limit: String(input.limit || 1000),
      offset: "0",
    });
    const chats = await connectyhubRequestOrError(`/chats?${chatsQuery.toString()}`, {
      method: "GET",
      timeoutMs: 20000,
    });
    attempts.push(chats);
    if (chats.ok) groups = normalizeGroupPayload(chats.payload, ["chats", "data", "items", "result", "results"]);
  }

  return {
    ok: true,
    instanceId,
    groups,
    raw: sanitizePayload({ attempts }),
  };
}

export async function sendWhatsAppDestinationText(input: {
  agentKey: string;
  instanceId?: string;
  destinationJid: string;
  text: string;
  trackId: string;
  actionButton?: WhatsAppActionButtonInput;
  inferActionButtonFromText?: boolean;
  mentions?: string[];
  replyId?: string;
  sendOptions?: WhatsAppAgentSendOptions;
}): Promise<ConnectyHubDeliveryResult> {
  const startedMs = Date.now();
  const processedAt = new Date().toISOString();
  const destinationJid = normalizeWhatsappJid(input.destinationJid);
  const { config, instanceId } = await resolveAgentProviderInstanceId(input.agentKey, input.instanceId);

  if (!config.apiToken || !instanceId || !destinationJid || !input.text.trim()) {
    return {
      ok: false,
      providerStatus: !config.apiToken
        ? "missing_connectyhub_token"
        : !instanceId
          ? "missing_connectyhub_instance"
          : !destinationJid
            ? "missing_destination_jid"
            : "missing_reply_text",
      endpointConfigured: Boolean(config.apiToken && instanceId),
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      errorMessage: "Mensagem WhatsApp de grupo/canal incompleta.",
    };
  }

  try {
    const delivery = await sendConnectyHubWhatsAppMessage({
      instanceId,
      number: destinationJid,
      text: input.text.trim(),
      trackId: input.trackId,
      idempotencyKey: input.trackId,
      actionButton: input.actionButton,
      inferActionButtonFromText: input.inferActionButtonFromText,
      mentions: input.mentions?.map(normalizeWhatsAppNumber).filter(Boolean),
      replyId: cleanString(input.replyId),
      sendOptions: input.sendOptions,
      timeoutMs: 20000,
    });

    return {
      ok: true,
      providerStatus: delivery.usedIdempotencyKey ? "connectyhub_destination_accepted" : "connectyhub_destination_accepted_without_idempotency",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      externalDeliveryId: extractDeliveryId(delivery.payload),
      responsePreview: preview(JSON.stringify(sanitizePayload(delivery.payload))),
    };
  } catch (error) {
    return {
      ok: false,
      providerStatus: "connectyhub_destination_error",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido na ConnectyHub.",
    };
  }
}

export async function sendWhatsAppDestinationMedia(input: {
  agentKey: string;
  instanceId?: string;
  destinationJid: string;
  fileUrl: string;
  mediaType?: "image" | "video" | "document" | "audio" | string;
  text?: string;
  trackId: string;
  mentions?: string[];
  replyId?: string;
  sendOptions?: WhatsAppAgentSendOptions;
}): Promise<ConnectyHubDeliveryResult> {
  const startedMs = Date.now();
  const processedAt = new Date().toISOString();
  const destinationJid = normalizeWhatsappJid(input.destinationJid);
  const fileUrl = cleanString(input.fileUrl);
  const { config, instanceId } = await resolveAgentProviderInstanceId(input.agentKey, input.instanceId);

  if (!config.apiToken || !instanceId || !destinationJid || !fileUrl) {
    return {
      ok: false,
      providerStatus: !config.apiToken
        ? "missing_connectyhub_token"
        : !instanceId
          ? "missing_connectyhub_instance"
          : !destinationJid
            ? "missing_destination_jid"
            : "missing_media_url",
      endpointConfigured: Boolean(config.apiToken && instanceId),
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      errorMessage: "Midia WhatsApp de grupo/canal incompleta.",
    };
  }

  try {
    const delivery = await sendConnectyHubWhatsAppMedia({
      instanceId,
      number: destinationJid,
      fileUrl,
      mediaType: cleanString(input.mediaType, "image"),
      text: cleanString(input.text),
      trackId: input.trackId,
      idempotencyKey: input.trackId,
      mentions: input.mentions?.map(normalizeWhatsAppNumber).filter(Boolean),
      replyId: cleanString(input.replyId),
      sendOptions: input.sendOptions,
      timeoutMs: 25000,
    });

    return {
      ok: true,
      providerStatus: delivery.usedIdempotencyKey ? "connectyhub_media_accepted" : "connectyhub_media_accepted_without_idempotency",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      externalDeliveryId: extractDeliveryId(delivery.payload),
      responsePreview: preview(JSON.stringify(sanitizePayload(delivery.payload))),
    };
  } catch (error) {
    return {
      ok: false,
      providerStatus: "connectyhub_media_error",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido na ConnectyHub.",
    };
  }
}

export type WhatsAppLeadProfileImageLookupResult = {
  ok: boolean;
  profileImageUrl: string;
  displayName: string;
  source: string;
  attemptedAt: string;
  payload?: unknown;
  error?: string;
};

export async function fetchWhatsAppLeadProfileImage(input: {
  agentKey?: string;
  instanceId?: string;
  phone: string;
}): Promise<WhatsAppLeadProfileImageLookupResult> {
  const attemptedAt = new Date().toISOString();
  const phone = normalizeWhatsAppNumber(input.phone);
  const { instanceId } = await resolveAgentProviderInstanceId(cleanString(input.agentKey, WILLIAN_AGENT_KEY), input.instanceId || "");

  if (!phone || !instanceId) {
    return {
      ok: false,
      profileImageUrl: "",
      displayName: "",
      source: !phone ? "missing_phone" : "missing_instance",
      attemptedAt,
      error: !phone ? "Telefone do lead ausente." : "Instancia ConnectyHub ausente.",
    };
  }

  const attempts = [
    { source: "chat_details_preview", preview: true },
    { source: "chat_details_full", preview: false },
  ];

  for (const attempt of attempts) {
    try {
      const payload = await connectyhubRequest("/provider/chat/details", {
        body: {
          instanceId,
          payload: {
            number: phone,
            preview: attempt.preview,
          },
        },
        timeoutMs: 9000,
      });
      const profileImageUrl = extractProfileImageUrl(payload);
      const displayName = extractWhatsappProfileDisplayName(payload) || extractWhatsappDisplayName(payload);

      if (profileImageUrl) {
        return {
          ok: true,
          profileImageUrl,
          displayName,
          source: attempt.source,
          attemptedAt,
          payload: sanitizePayload(payload),
        };
      }
    } catch (error) {
      if (attempt === attempts[attempts.length - 1]) {
        return {
          ok: false,
          profileImageUrl: "",
          displayName: "",
          source: attempt.source,
          attemptedAt,
          error: error instanceof Error ? error.message : "Erro ao consultar foto do WhatsApp.",
        };
      }
    }
  }

  return {
    ok: false,
    profileImageUrl: "",
    displayName: "",
    source: "not_found",
    attemptedAt,
  };
}

async function resolveAgentProviderInstanceId(agentKey: string, explicitInstanceId = "") {
  const config = await getWillianConfig();
  const cleanExplicit = cleanString(explicitInstanceId);
  if (cleanExplicit) return { config, instanceId: cleanExplicit };

  if (!agentKey || agentKey === WILLIAN_AGENT_KEY) {
    return {
      config,
      instanceId: config.apiToken ? await resolveConnectyHubInstanceId(config).catch(() => "") : "",
    };
  }

  const persisted = await findPersistedWhatsappInstance(agentKey);
  return { config, instanceId: cleanString(persisted?.provider_instance_id) };
}

export async function sendWhatsAppAgentChatPresence(input: {
  agentKey: string;
  instanceId?: string;
  number: string;
  presence: WhatsAppAgentChatPresence;
  delayMs?: number;
}): Promise<ConnectyHubDeliveryResult> {
  const startedMs = Date.now();
  const processedAt = new Date().toISOString();
  const phone = normalizeWhatsAppNumber(input.number);
  const { config, instanceId } = await resolveAgentProviderInstanceId(input.agentKey, input.instanceId);

  if (!config.apiToken || !instanceId || !phone || !input.presence) {
    return {
      ok: false,
      providerStatus: !config.apiToken
        ? "missing_connectyhub_token"
        : !instanceId
          ? "missing_connectyhub_instance"
          : !phone
            ? "missing_recipient_phone"
            : "missing_presence",
      endpointConfigured: Boolean(config.apiToken && instanceId),
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      errorMessage: "Presenca WhatsApp incompleta para envio.",
    };
  }

  try {
    const payload = await connectyhubRequest("/provider/message/presence", {
      body: {
        instanceId,
        payload: {
          number: phone,
          presence: input.presence,
          ...(clampDelayMs(input.delayMs) > 0 ? { delay: clampDelayMs(input.delayMs) } : {}),
        },
      },
      timeoutMs: CONNECTYHUB_PRESENCE_TIMEOUT_MS,
    });

    return {
      ok: true,
      providerStatus: `connectyhub_presence_${input.presence}_accepted`,
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      responsePreview: preview(JSON.stringify(sanitizePayload(payload))),
    };
  } catch (error) {
    return {
      ok: false,
      providerStatus: "connectyhub_presence_error",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido ao enviar presenca WhatsApp.",
    };
  }
}

export async function setWhatsAppAgentInstancePresence(input: {
  agentKey: string;
  instanceId?: string;
  presence: WhatsAppAgentInstancePresence;
}): Promise<ConnectyHubDeliveryResult> {
  const startedMs = Date.now();
  const processedAt = new Date().toISOString();
  const { config, instanceId } = await resolveAgentProviderInstanceId(input.agentKey, input.instanceId);

  if (!config.apiToken || !instanceId || !input.presence) {
    return {
      ok: false,
      providerStatus: !config.apiToken ? "missing_connectyhub_token" : !instanceId ? "missing_connectyhub_instance" : "missing_presence",
      endpointConfigured: Boolean(config.apiToken && instanceId),
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      errorMessage: "Presenca da instancia WhatsApp incompleta.",
    };
  }

  try {
    const payload = await connectyhubRequest("/provider/instance/presence", {
      body: {
        instanceId,
        payload: {
          presence: input.presence,
        },
      },
      timeoutMs: CONNECTYHUB_PRESENCE_TIMEOUT_MS,
    });

    return {
      ok: true,
      providerStatus: `connectyhub_instance_presence_${input.presence}_accepted`,
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      responsePreview: preview(JSON.stringify(sanitizePayload(payload))),
    };
  } catch (error) {
    return {
      ok: false,
      providerStatus: "connectyhub_instance_presence_error",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido ao alterar presenca da instancia WhatsApp.",
    };
  }
}

function extractInstanceId(payload: unknown) {
  const data = asRecord(payload);
  const instance = asRecord(data.instance);
  const item = asRecord(data.data);
  const nestedInstance = asRecord(item.instance);
  const listedInstance = asRecord(data.instances);
  return cleanString(
    data.id ||
      data.instanceId ||
      data.instance_id ||
      instance.id ||
      instance.instanceId ||
      instance.instance_id ||
      item.id ||
      item.instanceId ||
      item.instance_id ||
      nestedInstance.id ||
      nestedInstance.instanceId ||
      nestedInstance.instance_id ||
      listedInstance.id ||
      listedInstance.instanceId ||
      listedInstance.instance_id
  );
}

function extractInstanceName(payload: unknown, fallback = "") {
  const data = asRecord(payload);
  const instance = asRecord(data.instance);
  const item = asRecord(data.data);
  const nestedInstance = asRecord(item.instance);
  const listedInstance = asRecord(data.instances);
  return cleanString(
    data.displayName ||
      data.display_name ||
      data.name ||
      data.instanceName ||
      data.instance_name ||
      instance.displayName ||
      instance.display_name ||
      instance.name ||
      instance.instanceName ||
      instance.instance_name ||
      item.displayName ||
      item.display_name ||
      item.name ||
      item.instanceName ||
      item.instance_name ||
      nestedInstance.displayName ||
      nestedInstance.display_name ||
      nestedInstance.name ||
      nestedInstance.instanceName ||
      nestedInstance.instance_name ||
      listedInstance.displayName ||
      listedInstance.display_name ||
      listedInstance.name ||
      listedInstance.instanceName ||
      listedInstance.instance_name,
    fallback
  );
}

function asArrayPayload(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  const data = asRecord(payload);
  for (const key of ["instances", "webhooks", "messages", "chats", "contacts", "deliveries", "items", "results"]) {
    const value = data[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return [value];
  }

  const nestedData = asRecord(data.data);
  if (Array.isArray(data.data)) return data.data;
  for (const key of ["instances", "webhooks", "messages", "chats", "contacts", "deliveries", "items", "results"]) {
    const value = nestedData[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return [value];
  }

  if (
    Object.keys(nestedData).some((key) =>
      ["id", "instanceId", "instance_id", "webhookId", "webhook_id", "url", "name", "displayName", "display_name", "instanceName", "instance_name"].includes(key)
    )
  ) {
    return [nestedData];
  }
  return [];
}

async function listConnectyHubInstances() {
  return asArrayPayload(await connectyhubRequest("/instances", { method: "GET", timeoutMs: 10000 }));
}

async function findConnectyHubInstanceByName(instanceName: string) {
  const instances = await listConnectyHubInstances().catch(() => []);
  const normalizedName = normalizedLookupText(instanceName);
  return instances.find((item) => extractInstanceName(item).toLowerCase() === normalizedName) || null;
}

async function findPrimaryConnectyHubInstanceByName(instanceName: string) {
  const instances = await listConnectyHubInstances().catch(() => []);
  const candidateNames = new Set(primaryWhatsappInstanceLookupNames(instanceName));
  return instances.find((item) => candidateNames.has(extractInstanceName(item).toLowerCase())) || null;
}

async function resolveConnectyHubInstanceId(config?: Awaited<ReturnType<typeof getWillianConfig>>) {
  const resolvedConfig = config || await getWillianConfig();
  if (resolvedConfig.instanceId) return resolvedConfig.instanceId;

  const instances = await listConnectyHubInstances().catch(() => []);
  const candidateNames = new Set(primaryWhatsappInstanceLookupNames(resolvedConfig.instanceName));
  const matched = instances.find((item) => candidateNames.has(extractInstanceName(item).toLowerCase())) || instances[0];
  const instanceId = extractInstanceId(matched);
  const instanceName = extractInstanceName(matched, resolvedConfig.instanceName);

  if (instanceId) {
    await persistConnectyHubInstance({
      instanceId,
      instanceName,
      webhookUrl: resolvedConfig.webhookUrl,
      statusPayload: matched,
    });
  }

  return instanceId;
}

async function findConfiguredWillianInstanceId(config: Awaited<ReturnType<typeof getWillianConfig>>) {
  if (config.instanceId) return config.instanceId;
  const matched = await findPrimaryConnectyHubInstanceByName(config.instanceName).catch(() => null);
  return extractInstanceId(matched);
}

async function persistConnectyHubInstance(input: {
  instanceId: string;
  instanceName: string;
  agentKey?: string;
  agentName?: string;
  webhookUrl?: string;
  statusPayload?: unknown;
  persistWillianConfig?: boolean;
}) {
  const agentKey = cleanString(input.agentKey, WILLIAN_AGENT_KEY);
  const persistWillianConfig = agentKey === WILLIAN_AGENT_KEY && input.persistWillianConfig !== false;
  const instanceName = persistWillianConfig
    ? normalizePrimaryWhatsappInstanceName(input.instanceName)
    : input.instanceName;

  if (persistWillianConfig) {
    const records: Array<{ key: string; value: string; description: string; secret?: boolean }> = [];
    if (input.instanceId) {
      records.push(
        {
          key: "BETEL_GLOBAL_WHATSAPP_INSTANCE_ID",
          value: input.instanceId,
          description: "ID da instancia ConnectyHub usada pelo WhatsApp Global da Betel.",
        },
        {
          key: "BETEL_WILLIAN_CONNECTYHUB_INSTANCE_ID",
          value: input.instanceId,
          description: "Compatibilidade: ID da instancia ConnectyHub usada pelo antigo agente Willian.",
        }
      );
    }
    if (instanceName) {
      records.push(
        {
          key: "BETEL_GLOBAL_WHATSAPP_INSTANCE_NAME",
          value: instanceName,
          description: "Nome da instancia ConnectyHub usada pelo WhatsApp Global da Betel.",
        },
        {
          key: "BETEL_WILLIAN_CONNECTYHUB_INSTANCE_NAME",
          value: instanceName,
          description: "Compatibilidade: nome da instancia ConnectyHub usada pelo antigo agente Willian.",
        }
      );
    }
    await upsertAppConfig(records);
    await setPrimaryWhatsappAgentArchived(false);
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase || !instanceName) return;

  const status = normalizeStatusPayload(input.statusPayload || {});
  const phone = extractWhatsappPhoneNumber(input.statusPayload);
  const profileImageUrl = extractProfileImageUrl(input.statusPayload);
  const displayName =
    extractWhatsappProfileDisplayName(input.statusPayload) || extractWhatsappDisplayName(input.statusPayload);
  const hasRemoteIdentity = Boolean(phone && (profileImageUrl || displayName || status.jid));
  const connectedAt =
    status.connected ||
    status.loggedIn ||
    (!connectionStateIsTerminallyDisconnected(status.state) && hasRemoteIdentity)
      ? new Date().toISOString()
      : null;
  await supabase.from("whatsapp_instances").upsert(
    {
      agent_key: agentKey,
      provider: CONNECTYHUB_PROVIDER,
      instance_name: instanceName,
      provider_instance_id: input.instanceId || null,
      token_ciphertext: null,
      token_preview: null,
      phone: phone || null,
      status: status.state || "draft",
      webhook_url: input.webhookUrl || null,
      webhook_secret_preview: null,
      last_seen_at: new Date().toISOString(),
      connected_at: connectedAt,
    },
    { onConflict: "provider,instance_name" }
  );
}

function slugifyAgentName(value: string) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
}

function makeWhatsappAgentKey(agentName: string) {
  return `whatsapp-${slugifyAgentName(agentName) || Date.now().toString(36)}`;
}

async function makeUniqueWhatsappAgentKey(agentName: string) {
  const baseKey = makeWhatsappAgentKey(agentName);
  const supabase = getSupabaseAdminClient();
  if (!supabase) return baseKey;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = attempt === 0 ? baseKey : `${baseKey}-${Date.now().toString(36)}-${attempt}`;
    const { data } = await supabase
      .from("ai_agents")
      .select("agent_key")
      .eq("agent_key", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }

  return `${baseKey}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function makeWhatsappInstanceName(agentKey: string) {
  return `betel-${agentKey}`;
}

async function ensureWhatsappAgentRecord(input: { agentKey: string; agentName: string; companyName?: string; sector?: string }) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase admin nao configurado. Cadastro de novo agente WhatsApp exige service role.");
  }

  const groupPayload = {
    group_key: "comunicacao",
    name: "Comunicacao e Growth",
    purpose: "Agentes que operam WhatsApp, email, campanhas e distribuicao comercial.",
    status: "active",
    execution_order: 4,
    trigger_description: "Atendimento e distribuicao por canais de comunicacao.",
    human_gate: "Humano revisa casos sensiveis, juridicos ou VIP.",
    api_dependencies: ["ConnectyHub"],
    guardrails: ["Respeitar opt-in", "Registrar conversa", "Escalar risco para humano"],
  };
  const { data: groupData, error: groupError } = await supabase
    .from("agent_groups")
    .upsert(groupPayload, { onConflict: "group_key" })
    .select("id")
    .single();

  if (groupError) throw new Error(groupError.message);

  const groupId = cleanString((groupData as Record<string, unknown> | null)?.id);
  if (!groupId) throw new Error("Nao foi possivel preparar o grupo de comunicacao do agente.");

  const promptName = `${input.agentKey.replace(/-/g, "_")}_prompt`;
  const { error } = await supabase.from("ai_agents").upsert(
    {
      group_id: groupId,
      agent_key: input.agentKey,
      name: input.agentName,
      role: `Agente WhatsApp da Betel para atendimento e distribuicao comercial.`,
      status: "draft",
      prompt_name: promptName,
      prompt_version: "v0.1",
      system_prompt: null,
      trigger_type: "whatsapp_qr",
      input_schema: { fields: ["whatsapp_message", "lead_profile", "opt_in_status"] },
      output_schema: { fields: ["reply", "lead_update", "handoff_reason"] },
      guardrails: ["Respeitar opt-in", "Nao inventar dados de edital", "Escalar risco juridico para humano"],
      metadata: {
        channel: "whatsapp",
        companyName: cleanString(input.companyName, "Betel Leiloes"),
        sector: cleanString(input.sector, "Atendimento WhatsApp"),
        provider: CONNECTYHUB_PROVIDER,
        createdFrom: "agent-office-whatsapp-central",
      },
    },
    { onConflict: "agent_key" }
  );

  if (error) throw new Error(error.message);
}

export async function createLocalConnectyHubWhatsappAgent(input: { agentName: string; companyName?: string; sector?: string }) {
  const agentName = cleanString(input.agentName);
  if (!agentName) throw new Error("Informe o nome do novo agente WhatsApp.");

  const agentKey = await makeUniqueWhatsappAgentKey(agentName);
  await ensureWhatsappAgentRecord({
    agentKey,
    agentName,
    companyName: input.companyName,
    sector: input.sector,
  });

  return {
    createdAgent: {
      agentKey,
      agentName,
      companyName: cleanString(input.companyName, "Betel Leiloes"),
      sector: cleanString(input.sector, "Atendimento WhatsApp"),
      status: "draft",
      connected: false,
    },
  };
}

function whatsappInstanceSummaryFromRow(row: Record<string, unknown>): WhatsAppAgentInstanceSummary {
  const agentRow = asRecord(Array.isArray(row.ai_agents) ? row.ai_agents[0] : row.ai_agents);
  const metadata = asRecord(agentRow.metadata);
  const whatsappProfile = asRecord(metadata.whatsappProfile);
  const agentKey = cleanString(row.agent_key || agentRow.agent_key, WILLIAN_AGENT_KEY);
  const status = normalizeConnectionState(row.status, Boolean(row.connected_at));
  const runtimeStatus = cleanString(agentRow.status, "draft");
  const phoneNumber = cleanString(row.phone);
  const hasSyncedProfile = Boolean(
    phoneNumber &&
      (cleanString(whatsappProfile.syncedAt) ||
        cleanString(whatsappProfile.profileImageUrl) ||
        cleanString(whatsappProfile.displayName))
  );
  const terminallyDisconnected = connectionStateIsTerminallyDisconnected(status);
  const connected =
    !terminallyDisconnected &&
    (status === "connected" ||
      Boolean(row.connected_at) ||
      hasSyncedProfile);

  return {
    agentKey,
    agentName: cleanString(agentRow.name, agentKey === WILLIAN_AGENT_KEY ? WILLIAN_AGENT_NAME : agentKey),
    companyName: cleanString(metadata.companyName) || undefined,
    sector: cleanString(metadata.sector) || undefined,
    instanceName: cleanString(row.instance_name),
    providerInstanceId: cleanString(row.provider_instance_id) || undefined,
    phoneNumber: phoneNumber || undefined,
    displayName: cleanString(whatsappProfile.displayName) || undefined,
    profileImageUrl: normalizeProfileImageUrl(whatsappProfile.profileImageUrl) || undefined,
    profileImageSyncedAt: cleanString(whatsappProfile.syncedAt) || undefined,
    status,
    runtimeStatus,
    connected,
    connectedAt: terminallyDisconnected ? undefined : cleanString(row.connected_at) || undefined,
    updatedAt: cleanString(row.updated_at) || undefined,
  };
}

async function listWhatsappAgentInstances(options: { checkRemote?: boolean } = {}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [] as WhatsAppAgentInstanceSummary[];

  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("agent_key, instance_name, provider_instance_id, phone, status, connected_at, updated_at, ai_agents(agent_key, name, status, metadata)")
    .eq("provider", CONNECTYHUB_PROVIDER)
    .neq("status", "deleted")
    .order("updated_at", { ascending: false })
    .limit(30);

  if (error) return [] as WhatsAppAgentInstanceSummary[];

  const rows = ((data || []) as Array<Record<string, unknown>>).filter((row) => cleanString(row.instance_name));
  const localAgents = await listLocalWhatsappAgents(supabase).catch(() => [] as WhatsAppAgentInstanceSummary[]);
  if (!options.checkRemote) return mergeWhatsappAgentSummaries(rows.map(whatsappInstanceSummaryFromRow), localAgents);

  const updatedRows = await Promise.all(
    rows.map(async (row) => {
      const instanceId = cleanString(row.provider_instance_id);
      if (!instanceId) return row;

      try {
        const payload = await connectyhubRequest(`/instances/${encodeURIComponent(instanceId)}/status`, {
          method: "GET",
          timeoutMs: 10000,
        });
        const status = normalizeStatusPayload(payload);
        const phone = extractWhatsappPhoneNumber(payload, status.jid) || cleanString(row.phone);
        const profileImageUrl = extractProfileImageUrl(payload);
        const displayName = extractWhatsappProfileDisplayName(payload) || extractWhatsappDisplayName(payload);
        const remoteHasProfile = Boolean(phone && (profileImageUrl || displayName));
        const connectedAt =
          status.connected ||
          status.loggedIn ||
          (!connectionStateIsTerminallyDisconnected(status.state) && remoteHasProfile)
            ? cleanString(row.connected_at) || new Date().toISOString()
            : null;
        const patch = {
          phone: phone || null,
          status: status.state || cleanString(row.status, "draft"),
          connected_at: connectedAt,
          last_seen_at: new Date().toISOString(),
        };
        await supabase
          .from("whatsapp_instances")
          .update(patch)
          .eq("provider", CONNECTYHUB_PROVIDER)
          .eq("instance_name", cleanString(row.instance_name));

        const agentKey = cleanString(row.agent_key);
        const agentRow = asRecord(Array.isArray(row.ai_agents) ? row.ai_agents[0] : row.ai_agents);
        const metadata = asRecord(agentRow.metadata);
        if (agentKey && (profileImageUrl || displayName)) {
          const nextMetadata = {
            ...metadata,
            whatsappProfile: {
              ...asRecord(metadata.whatsappProfile),
              displayName: displayName || cleanString(asRecord(metadata.whatsappProfile).displayName),
              profileImageUrl: profileImageUrl || cleanString(asRecord(metadata.whatsappProfile).profileImageUrl),
              syncedAt: new Date().toISOString(),
            },
          };
          await supabase.from("ai_agents").update({ metadata: nextMetadata }).eq("agent_key", agentKey);
          row.ai_agents = {
            ...agentRow,
            metadata: nextMetadata,
          };
        }

        return {
          ...row,
          phone: patch.phone,
          status: patch.status,
          connected_at: patch.connected_at,
          updated_at: new Date().toISOString(),
        };
      } catch {
        return row;
      }
    })
  );

  return mergeWhatsappAgentSummaries(updatedRows.map(whatsappInstanceSummaryFromRow), localAgents);
}

async function listLocalWhatsappAgents(supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>) {
  const { data, error } = await supabase
    .from("ai_agents")
    .select("agent_key,name,status,metadata,updated_at")
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) return [] as WhatsAppAgentInstanceSummary[];

  return ((data || []) as Array<Record<string, unknown>>)
    .filter((row) => {
      const key = cleanString(row.agent_key);
      const metadata = asRecord(row.metadata);
      return key === WILLIAN_AGENT_KEY || cleanString(metadata.channel) === "whatsapp" || cleanString(metadata.provider) === CONNECTYHUB_PROVIDER;
    })
    .filter((row) => cleanString(row.status) !== "archived")
    .map((row) => {
      const metadata = asRecord(row.metadata);
      const agentKey = cleanString(row.agent_key, WILLIAN_AGENT_KEY);
      const runtimeStatus = cleanString(row.status, "draft");
      return {
        agentKey,
        agentName: cleanString(row.name, agentKey === WILLIAN_AGENT_KEY ? WILLIAN_AGENT_NAME : "Agente de WhatsApp"),
        companyName: cleanString(metadata.companyName, "Betel Leiloes"),
        sector: cleanString(metadata.sector, "Atendimento WhatsApp"),
        instanceName: "",
        status: runtimeStatus,
        runtimeStatus,
        connected: false,
        updatedAt: cleanString(row.updated_at) || undefined,
      };
    });
}

function mergeWhatsappAgentSummaries(
  instanceSummaries: WhatsAppAgentInstanceSummary[],
  localAgents: WhatsAppAgentInstanceSummary[]
) {
  const byAgentKey = new Map<string, WhatsAppAgentInstanceSummary>();

  for (const localAgent of localAgents) byAgentKey.set(localAgent.agentKey, localAgent);
  for (const summary of instanceSummaries) {
    byAgentKey.set(summary.agentKey, {
      ...byAgentKey.get(summary.agentKey),
      ...summary,
      agentName: summary.agentName || byAgentKey.get(summary.agentKey)?.agentName || summary.agentKey,
      companyName: summary.companyName || byAgentKey.get(summary.agentKey)?.companyName,
      runtimeStatus: summary.runtimeStatus || byAgentKey.get(summary.agentKey)?.runtimeStatus,
      sector: summary.sector || byAgentKey.get(summary.agentKey)?.sector,
    });
  }

  return [...byAgentKey.values()].sort((a, b) => {
    if (a.agentKey === WILLIAN_AGENT_KEY) return -1;
    if (b.agentKey === WILLIAN_AGENT_KEY) return 1;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });
}

function willianStateLooksConnected(state: WillianInstanceState) {
  const status =
    state.status?.state ||
    state.finalStatus ||
    state.connection?.finalStatus ||
    state.connection?.status;
  if (connectionStateIsTerminallyDisconnected(status)) return false;

  return Boolean(
    state.status?.connected ||
      state.status?.loggedIn ||
      normalizeConnectionState(status, false) === "connected"
  );
}

function ensureWillianSummary(
  state: WillianInstanceState,
  summaries: WhatsAppAgentInstanceSummary[],
  options: { includePrimary?: boolean; primaryRuntimeStatus?: string } = {}
) {
  if (options.includePrimary === false) {
    return summaries.filter((summary) => summary.agentKey !== WILLIAN_AGENT_KEY);
  }

  if (options.primaryRuntimeStatus) {
    summaries = summaries.map((summary) =>
      summary.agentKey === WILLIAN_AGENT_KEY
        ? { ...summary, runtimeStatus: options.primaryRuntimeStatus }
        : summary
    );
  }

  const hasWillian = summaries.some(
    (summary) => summary.agentKey === WILLIAN_AGENT_KEY || summary.instanceName === state.instanceName
  );
  const stateStatus =
    state.status?.state ||
    state.finalStatus ||
    state.connection?.finalStatus ||
    state.connection?.status;
  const stateDisconnected = connectionStateIsTerminallyDisconnected(stateStatus);
  const connected = stateDisconnected ? false : willianStateLooksConnected(state);
  if (hasWillian) {
    return summaries.map((summary) => {
      if (summary.agentKey !== WILLIAN_AGENT_KEY && summary.instanceName !== state.instanceName) return summary;
      const disconnected = stateDisconnected || connectionStateIsTerminallyDisconnected(summary.status);
      const summaryConnected = disconnected ? false : summary.connected || connected;
      return {
        ...summary,
        agentName: summary.agentName || WILLIAN_AGENT_NAME,
        companyName: summary.companyName || "Betel Leiloes",
        sector: summary.sector || "Comercial Betel",
        phoneNumber: summary.phoneNumber || state.phoneNumber,
        displayName: summary.displayName || state.displayName,
        profileImageUrl: summary.profileImageUrl || state.profileImageUrl,
        profileImageSyncedAt: summary.profileImageSyncedAt || state.profileImageSyncedAt,
        status: disconnected ? "disconnected" : summaryConnected ? "connected" : summary.status || state.status?.state || "draft",
        connected: summaryConnected,
        connectedAt: disconnected ? undefined : summary.connectedAt || (summaryConnected ? state.profileImageSyncedAt : undefined),
        updatedAt: summary.updatedAt || state.profileImageSyncedAt,
      };
    });
  }

  return [
    {
      agentKey: WILLIAN_AGENT_KEY,
      agentName: WILLIAN_AGENT_NAME,
      companyName: "Betel Leiloes",
      sector: "Comercial Betel",
      instanceName: state.instanceName,
      providerInstanceId: state.instanceTokenConfigured ? state.instanceTokenPreview : undefined,
      phoneNumber: state.phoneNumber,
      displayName: state.displayName,
      profileImageUrl: state.profileImageUrl,
      profileImageSyncedAt: state.profileImageSyncedAt,
      status: connected ? "connected" : state.status?.state || "draft",
      runtimeStatus: options.primaryRuntimeStatus || "active",
      connected,
      connectedAt: connected ? state.profileImageSyncedAt : undefined,
      updatedAt: state.profileImageSyncedAt,
    },
    ...summaries,
  ];
}

async function clearPersistedConnectyHubInstance(options: { archivePrimaryAgent?: boolean } = {}) {
  await deleteAppConfig([
    "BETEL_GLOBAL_WHATSAPP_INSTANCE_NAME",
    "BETEL_GLOBAL_WHATSAPP_INSTANCE_ID",
    "BETEL_GLOBAL_CONNECTYHUB_INSTANCE_NAME",
    "BETEL_GLOBAL_CONNECTYHUB_INSTANCE_ID",
    "BETEL_GLOBAL_WHATSAPP_PHONE_NUMBER",
    "BETEL_GLOBAL_WHATSAPP_DISPLAY_NAME",
    "BETEL_GLOBAL_WHATSAPP_PROFILE_IMAGE_URL",
    "BETEL_GLOBAL_WHATSAPP_PROFILE_SYNCED_AT",
    "BETEL_WILLIAN_CONNECTYHUB_INSTANCE_NAME",
    "BETEL_WILLIAN_CONNECTYHUB_INSTANCE_ID",
    "BETEL_WILLIAN_WHATSAPP_PHONE_NUMBER",
    "BETEL_WILLIAN_WHATSAPP_DISPLAY_NAME",
    "BETEL_WILLIAN_WHATSAPP_PROFILE_IMAGE_URL",
    "BETEL_WILLIAN_WHATSAPP_PROFILE_SYNCED_AT",
  ]);

  if (options.archivePrimaryAgent) {
    await setPrimaryWhatsappAgentArchived(true);
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase
    .from("whatsapp_instances")
    .update({
      status: "deleted",
      provider_instance_id: null,
      connected_at: null,
      last_seen_at: new Date().toISOString(),
    })
    .eq("provider", CONNECTYHUB_PROVIDER)
    .eq("agent_key", WILLIAN_AGENT_KEY);
}

export async function syncWillianWhatsappProfileFromConnectyHub(input: { connectPayload?: unknown; statusPayload?: unknown } = {}) {
  const status = normalizeStatusPayload(input.statusPayload || input.connectPayload || {});
  const config = await getWillianConfig();

  if (!status.connected && !status.loggedIn) {
    return {
      phoneNumber: config.phoneNumber,
      displayName: config.displayName,
      profileImageUrl: config.profileImageUrl,
      profileImageSyncedAt: config.profileImageSyncedAt,
      synced: false,
    };
  }

  const phoneNumber = extractWhatsappPhoneNumber(input.statusPayload, input.connectPayload, status.jid) || config.phoneNumber;
  const displayName =
    extractWhatsappProfileDisplayName(input.statusPayload, input.connectPayload) ||
    extractWhatsappDisplayName(input.statusPayload, input.connectPayload) ||
    config.displayName;
  const profileImageUrl = extractProfileImageUrl(input.statusPayload, input.connectPayload) || config.profileImageUrl;
  const syncedAt = profileImageUrl ? new Date().toISOString() : config.profileImageSyncedAt;

  const records: Array<{ key: string; value: string; description: string; secret?: boolean }> = [];
  if (phoneNumber) {
    records.push(
      {
        key: "BETEL_GLOBAL_WHATSAPP_PHONE_NUMBER",
        value: phoneNumber,
        description: "Numero conectado ao WhatsApp Global da Betel.",
      },
      {
        key: "BETEL_WILLIAN_WHATSAPP_PHONE_NUMBER",
        value: phoneNumber,
        description: "Compatibilidade: numero de WhatsApp conectado ao antigo agente Willian.",
      }
    );
  }
  if (displayName) {
    records.push(
      {
        key: "BETEL_GLOBAL_WHATSAPP_DISPLAY_NAME",
        value: displayName,
        description: "Nome de exibicao do WhatsApp Global da Betel.",
      },
      {
        key: "BETEL_WILLIAN_WHATSAPP_DISPLAY_NAME",
        value: displayName,
        description: "Compatibilidade: nome de exibicao do WhatsApp conectado ao antigo agente Willian.",
      }
    );
  }
  if (profileImageUrl) {
    records.push(
      {
        key: "BETEL_GLOBAL_WHATSAPP_PROFILE_IMAGE_URL",
        value: profileImageUrl,
        description: "Foto de perfil do WhatsApp Global da Betel.",
      },
      {
        key: "BETEL_GLOBAL_WHATSAPP_PROFILE_SYNCED_AT",
        value: syncedAt,
        description: "Data da ultima sincronizacao da foto do WhatsApp Global da Betel.",
      },
      {
        key: "BETEL_WILLIAN_WHATSAPP_PROFILE_IMAGE_URL",
        value: profileImageUrl,
        description: "Compatibilidade: foto de perfil do WhatsApp conectado ao antigo agente Willian.",
      },
      {
        key: "BETEL_WILLIAN_WHATSAPP_PROFILE_SYNCED_AT",
        value: syncedAt,
        description: "Compatibilidade: data da ultima sincronizacao da foto do antigo agente Willian.",
      }
    );
  }

  await upsertAppConfig(records);

  return {
    phoneNumber,
    displayName,
    profileImageUrl,
    profileImageSyncedAt: syncedAt,
    synced: Boolean(records.length),
  };
}

export async function getWillianInstanceState(options: { checkRemote?: boolean } = {}): Promise<WillianInstanceState> {
  const config = await getWillianConfig();
  const primaryAgentArchived = await isPrimaryWhatsappAgentArchived();
  const primaryAgentPaused = await isPrimaryWhatsappAgentPaused();
  const primaryRuntimeStatus = primaryAgentPaused ? "paused" : "active";
  const missing = [
    !config.apiToken ? "CONNECTYHUB_API_TOKEN" : "",
    config.apiToken && !config.apiTokenLooksValid ? "CONNECTYHUB_API_TOKEN parece incompleto" : "",
    !config.webhookUrl ? "CONNECTYHUB_WEBHOOK_URL" : "",
    !config.webhookSecret ? "CONNECTYHUB_WEBHOOK_SECRET" : "",
    !config.whatsappProviderReleased ? "BETEL_WHATSAPP_PROVIDER_RELEASED=true" : "",
    !config.resendKey ? "RESEND_API_KEY para email" : "",
    !config.emailFrom ? "BETEL_EMAIL_FROM para email" : "",
  ].filter(Boolean);

  const state: WillianInstanceState = {
    agentKey: WILLIAN_AGENT_KEY,
    agentName: WILLIAN_AGENT_NAME,
    baseUrl: config.baseUrl,
    baseUrlSource: config.baseUrlSource,
    adminTokenConfigured: Boolean(config.apiToken),
    adminTokenSource: config.apiTokenSource,
    adminTokenPreview: maskSecret(config.apiToken),
    adminTokenLooksValid: config.apiTokenLooksValid,
    instanceName: config.instanceName,
    instanceTokenConfigured: Boolean(config.instanceId),
    instanceTokenPreview: maskSecret(config.instanceId),
    phoneNumber: config.phoneNumber,
    displayName: config.displayName,
    profileImageUrl: config.profileImageUrl,
    profileImageSyncedAt: config.profileImageSyncedAt,
    webhookUrl: config.webhookUrl,
    webhookConfiguredUrl: config.webhookUrl,
    webhookSecretConfigured: Boolean(config.webhookSecret),
    whatsappProviderReleased: config.whatsappProviderReleased,
    whatsappReady: Boolean(config.apiToken && config.webhookUrl && config.webhookSecret && config.whatsappProviderReleased),
    emailProvider: config.emailProvider,
    emailTokenConfigured: Boolean(config.resendKey),
    emailFromConfigured: Boolean(config.emailFrom),
    emailReady: Boolean(config.resendKey && config.emailFrom && config.emailProviderReleased),
    primaryAgentArchived,
    primaryAgentPaused,
    missing,
  };

  state.agentInstances = ensureWillianSummary(
    state,
    await listWhatsappAgentInstances({ checkRemote: false }).catch(() => []),
    { includePrimary: !primaryAgentArchived, primaryRuntimeStatus }
  );

  if (!options.checkRemote || !config.apiToken) return state;

  try {
    const instanceId = await resolveConnectyHubInstanceId(config);
    state.instanceTokenConfigured = Boolean(instanceId);
    state.instanceTokenPreview = maskSecret(instanceId);

    const [statusPayload, webhookPayload] = await Promise.all([
      instanceId
        ? connectyhubRequest(`/instances/${encodeURIComponent(instanceId)}/status`, { method: "GET", timeoutMs: 10000 })
        : Promise.resolve({}),
      connectyhubRequest("/webhooks", { method: "GET", timeoutMs: 10000 }).catch(() => []),
    ]);
    state.status = normalizeStatusPayload(statusPayload);
    state.connection = extractConnectionInfo(statusPayload);
    state.finalStatus = state.connection.finalStatus;
    state.lastDisconnectReason = state.connection.lastDisconnectReason;
    state.webhookCount = asArrayPayload(webhookPayload).length;

    if (state.status.connected || state.status.loggedIn) {
      const profile = await syncWillianWhatsappProfileFromConnectyHub({ statusPayload }).catch(() => null);
      if (profile) {
        state.phoneNumber = profile.phoneNumber || state.phoneNumber;
        state.displayName = profile.displayName || state.displayName;
        state.profileImageUrl = profile.profileImageUrl || state.profileImageUrl;
        state.profileImageSyncedAt = profile.profileImageSyncedAt || state.profileImageSyncedAt;
      }
    }
    state.agentInstances = ensureWillianSummary(
      state,
      await listWhatsappAgentInstances({ checkRemote: true }).catch(() => state.agentInstances || []),
      { includePrimary: !primaryAgentArchived, primaryRuntimeStatus }
    );
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : "Falha ao consultar ConnectyHub.";
  }

  return state;
}

export async function createWillianConnectyHubInstance(input: { instanceName?: string } = {}) {
  const config = await getWillianConfig();
  const instanceName = cleanString(input.instanceName, config.instanceName || WILLIAN_DEFAULT_INSTANCE_NAME);
  if (!config.webhookUrl) throw new Error("Configure CONNECTYHUB_WEBHOOK_URL antes de criar a instancia.");

  const existing = await findPrimaryConnectyHubInstanceByName(instanceName);
  const existingId = extractInstanceId(existing);
  if (existingId) {
    const name = extractInstanceName(existing, instanceName);
    await persistConnectyHubInstance({
      instanceId: existingId,
      instanceName: name,
      webhookUrl: config.webhookUrl,
      statusPayload: existing,
    });
    await configureConnectyHubProviderWebhook({ config, instanceId: existingId });
    await setPrimaryWhatsappAgentArchived(false);
    await setPrimaryWhatsappAgentPaused(false);

    return {
      payload: sanitizePayload(existing),
      instanceIdPersisted: true,
      instanceName: name,
      existingInstanceLinked: true,
    };
  }

  const payload = await connectyhubRequest("/instances", {
    body: {
      name: instanceName,
      webhookUrl: config.webhookUrl,
      metadata: {
        project: "betel-ai",
        agentKey: WILLIAN_AGENT_KEY,
        agentName: WILLIAN_AGENT_NAME,
      },
    },
  });
  const instanceId = extractInstanceId(payload);
  const name = extractInstanceName(payload, instanceName);

  if (instanceId) {
    await persistConnectyHubInstance({
      instanceId,
      instanceName: name,
      webhookUrl: config.webhookUrl,
      statusPayload: payload,
    });
    await configureConnectyHubProviderWebhook({ config, instanceId });
    await setPrimaryWhatsappAgentArchived(false);
    await setPrimaryWhatsappAgentPaused(false);
  }

  return {
    payload: sanitizePayload(payload),
    instanceIdPersisted: Boolean(instanceId),
    instanceName: name,
  };
}

async function getLocalWhatsappAgent(agentKey: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("ai_agents")
    .select("agent_key,name,metadata")
    .eq("agent_key", agentKey)
    .maybeSingle();

  if (!data) return null;
  const row = data as Record<string, unknown>;
  const metadata = asRecord(row.metadata);
  return {
    agentKey: cleanString(row.agent_key, agentKey),
    agentName: cleanString(row.name, agentKey),
    companyName: cleanString(metadata.companyName, "Betel Leiloes"),
    sector: cleanString(metadata.sector, "Atendimento WhatsApp"),
  };
}

async function findPersistedWhatsappInstance(agentKey: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("whatsapp_instances")
    .select("instance_name, provider_instance_id")
    .eq("provider", CONNECTYHUB_PROVIDER)
    .eq("agent_key", agentKey)
    .neq("status", "deleted")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? (data as Record<string, unknown>) : null;
}

export async function createConnectyHubWhatsappAgentQrCode(input: {
  agentKey?: string;
  agentName?: string;
  browser?: string;
  companyName?: string;
  phone?: string;
  sector?: string;
}) {
  const config = await getWillianConfig();
  let agentKey = cleanString(input.agentKey);
  let agentName = cleanString(input.agentName);
  if (!config.webhookUrl) throw new Error("Configure CONNECTYHUB_WEBHOOK_URL na manutencao antes de criar agentes WhatsApp.");
  if (!config.apiToken) throw new Error("Configure CONNECTYHUB_API_TOKEN na manutencao antes de criar agentes WhatsApp.");

  if (!agentKey) {
    if (!agentName) throw new Error("Informe o nome do novo agente WhatsApp.");
    const created = await createLocalConnectyHubWhatsappAgent({
      agentName,
      companyName: input.companyName,
      sector: input.sector,
    });
    agentKey = cleanString(created.createdAgent.agentKey);
  }

  const localAgent = await getLocalWhatsappAgent(agentKey);
  agentName = cleanString(localAgent?.agentName, agentName || "Agente de WhatsApp");
  if (!localAgent) {
    await ensureWhatsappAgentRecord({
      agentKey,
      agentName,
      companyName: input.companyName,
      sector: input.sector,
    });
  }

  const instanceName = makeWhatsappInstanceName(agentKey);

  await configureWillianWebhook().catch(() => null);

  const persisted = await findPersistedWhatsappInstance(agentKey);
  const persistedId = cleanString(persisted?.provider_instance_id);
  const existing = persistedId ? null : await findConnectyHubInstanceByName(instanceName);
  const existingId = extractInstanceId(existing);
  let instanceId = persistedId || existingId;
  let instancePayload: unknown = existing || persisted || {};
  let createdInstance = false;

  if (!instanceId) {
    instancePayload = await connectyhubRequest("/instances", {
      body: {
        name: instanceName,
        webhookUrl: config.webhookUrl,
        metadata: {
          project: "betel-ai",
          agentKey,
          agentName,
        },
      },
    });
    instanceId = extractInstanceId(instancePayload);
    createdInstance = true;
  }

  if (!instanceId) throw new Error("A ConnectyHub nao retornou ID da instancia criada.");

  const persistedInstanceName = extractInstanceName(instancePayload, instanceName);
  await persistConnectyHubInstance({
    agentKey,
    agentName,
    instanceId,
    instanceName: persistedInstanceName,
    persistWillianConfig: false,
    webhookUrl: config.webhookUrl,
    statusPayload: instancePayload,
  });
  await configureConnectyHubProviderWebhook({ config, instanceId });

  const connectPayload = await connectyhubRequest(`/instances/${encodeURIComponent(instanceId)}/connect`, {
    body: buildConnectBody({ browser: input.browser, phone: input.phone }),
  });
  const status = normalizeStatusPayload(connectPayload);
  await persistConnectyHubInstance({
    agentKey,
    agentName,
    instanceId,
    instanceName: persistedInstanceName,
    persistWillianConfig: false,
    webhookUrl: config.webhookUrl,
    statusPayload: connectPayload,
  });

  return {
    createdAgent: {
      agentKey,
      agentName,
      instanceName: persistedInstanceName,
      status: status.state,
      connected: status.connected || status.loggedIn,
    },
    createdInstance,
    reusedInstance: Boolean(existingId),
    connection: extractConnectionInfo(connectPayload),
    connect: sanitizePayload(connectPayload),
  };
}

export async function fetchWhatsappAgentRemoteStatus(input: { agentKey: string }) {
  const agentKey = cleanString(input.agentKey, WILLIAN_AGENT_KEY);
  if (agentKey === WILLIAN_AGENT_KEY) return fetchWillianRemoteStatus();

  const instance = await findPersistedWhatsappInstance(agentKey);
  const instanceId = cleanString(instance?.provider_instance_id);
  const instanceName = cleanString(instance?.instance_name);
  if (!instanceId || !instanceName) throw new Error("Instancia ConnectyHub nao localizada para este agente.");

  const localAgent = await getLocalWhatsappAgent(agentKey);
  const payload = await connectyhubRequest(`/instances/${encodeURIComponent(instanceId)}/status`, { method: "GET", timeoutMs: 10000 });
  const status = normalizeStatusPayload(payload);
  const profileImageUrl = extractProfileImageUrl(payload);
  const displayName = extractWhatsappProfileDisplayName(payload) || extractWhatsappDisplayName(payload);

  await persistConnectyHubInstance({
    agentKey,
    agentName: localAgent?.agentName || agentKey,
    instanceId,
    instanceName,
    persistWillianConfig: false,
    statusPayload: payload,
  });

  if (localAgent && (profileImageUrl || displayName)) {
    const supabase = getSupabaseAdminClient();
    const current = await getLocalWhatsappAgent(agentKey);
    if (supabase && current) {
      const { data } = await supabase.from("ai_agents").select("metadata").eq("agent_key", agentKey).maybeSingle();
      const metadata = asRecord((data as Record<string, unknown> | null)?.metadata);
      await supabase.from("ai_agents").update({
        metadata: {
          ...metadata,
          whatsappProfile: {
            ...asRecord(metadata.whatsappProfile),
            displayName: displayName || cleanString(asRecord(metadata.whatsappProfile).displayName),
            profileImageUrl: profileImageUrl || cleanString(asRecord(metadata.whatsappProfile).profileImageUrl),
            syncedAt: new Date().toISOString(),
          },
        },
      }).eq("agent_key", agentKey);
    }
  }

  return {
    payload: sanitizePayload(payload),
    connection: extractConnectionInfo(payload),
    lastDisconnectReason: extractConnectionInfo(payload).lastDisconnectReason,
    status,
  };
}

export async function deleteConnectyHubWhatsappAgent(input: { agentKey: string }) {
  const agentKey = cleanString(input.agentKey);
  if (!agentKey) throw new Error("Agente WhatsApp nao informado para exclusao.");
  if (agentKey === WILLIAN_AGENT_KEY) {
    return deleteWillianConnectyHubInstance({
      allowMissingInstance: true,
      archivePrimaryAgent: true,
    });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase admin nao configurado. Exclusao de agente WhatsApp exige service role.");

  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("instance_name, provider_instance_id")
    .eq("provider", CONNECTYHUB_PROVIDER)
    .eq("agent_key", agentKey);

  if (error) throw new Error(error.message);

  const rows = ((data || []) as Array<Record<string, unknown>>).filter((row) => cleanString(row.instance_name));
  await Promise.all(
    rows.map(async (row) => {
      const instanceId = cleanString(row.provider_instance_id);
      if (!instanceId) return;
      await connectyhubRequest(`/instances/${encodeURIComponent(instanceId)}`, {
        method: "DELETE",
        timeoutMs: 15000,
      }).catch(() => null);
    })
  );

  await supabase
    .from("whatsapp_instances")
    .update({
      status: "deleted",
      provider_instance_id: null,
      connected_at: null,
      last_seen_at: new Date().toISOString(),
    })
    .eq("provider", CONNECTYHUB_PROVIDER)
    .eq("agent_key", agentKey);

  await supabase
    .from("ai_agents")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("agent_key", agentKey);

  return { agentDeleted: true, agentKey };
}

export async function setConnectyHubWhatsappAgentControlStatus(input: { agentKey: string; status: string }) {
  const agentKey = cleanString(input.agentKey);
  if (!agentKey) throw new Error("Agente WhatsApp nao informado para controle.");

  const requestedStatus = cleanString(input.status).toLowerCase();
  const nextStatus = requestedStatus === "paused" || requestedStatus === "pausado" ? "paused" : "active";

  if (agentKey === WILLIAN_AGENT_KEY) {
    await setPrimaryWhatsappAgentArchived(false);
    await setPrimaryWhatsappAgentPaused(nextStatus === "paused");
    return { agentKey, runtimeStatus: nextStatus };
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase admin nao configurado. Controle de agente WhatsApp exige service role.");

  const { error } = await supabase
    .from("ai_agents")
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("agent_key", agentKey);

  if (error) throw new Error(error.message);
  return { agentKey, runtimeStatus: nextStatus };
}

export async function getConnectyHubWhatsappAgentControlStatus(input: { agentKey: string }) {
  const agentKey = cleanString(input.agentKey);
  if (!agentKey) return "active";

  if (agentKey === WILLIAN_AGENT_KEY) {
    return await isPrimaryWhatsappAgentPaused() ? "paused" : "active";
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) return "active";

  const { data, error } = await supabase
    .from("ai_agents")
    .select("status")
    .eq("agent_key", agentKey)
    .maybeSingle();

  if (error) return "active";
  return cleanString((data as Record<string, unknown> | null)?.status, "active");
}

export async function disconnectConnectyHubWhatsappAgent(input: { agentKey: string }) {
  const agentKey = cleanString(input.agentKey);
  if (!agentKey) throw new Error("Agente WhatsApp nao informado para desconexao.");
  if (agentKey === WILLIAN_AGENT_KEY) return disconnectWillianConnectyHubInstance();

  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase admin nao configurado. Desconexao de agente WhatsApp exige service role.");

  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("instance_name, provider_instance_id, ai_agents(name)")
    .eq("provider", CONNECTYHUB_PROVIDER)
    .eq("agent_key", agentKey)
    .neq("status", "deleted")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);

  const row = ((data || []) as Array<Record<string, unknown>>)[0];
  const instanceId = cleanString(row?.provider_instance_id);
  const instanceName = cleanString(row?.instance_name);
  if (!instanceId || !instanceName) throw new Error("Instancia ConnectyHub nao localizada para desconectar.");

  const payload = await connectyhubRequest("/provider/instance/disconnect", {
    body: { instanceId },
    timeoutMs: 15000,
  });
  const agentRow = asRecord(Array.isArray(row.ai_agents) ? row.ai_agents[0] : row.ai_agents);

  await persistConnectyHubInstance({
    agentKey,
    agentName: cleanString(agentRow.name, agentKey),
    instanceId,
    instanceName,
    persistWillianConfig: false,
    statusPayload: { status: "disconnected", payload },
  });

  return { payload: sanitizePayload(payload), agentKey, instanceId: maskSecret(instanceId), status: "disconnected" };
}

export async function connectWillianConnectyHubInstance(input: { phone?: string; browser?: string } = {}) {
  const config = await getWillianConfig();
  const instanceId = await resolveConnectyHubInstanceId(config);
  if (!instanceId) throw new Error("Crie ou vincule uma instancia ConnectyHub antes de conectar.");

  const payload = await connectyhubRequest(`/instances/${encodeURIComponent(instanceId)}/connect`, {
    body: buildConnectBody(input),
  });
  const status = normalizeStatusPayload(payload);
  const profile =
    status.connected || status.loggedIn
      ? await syncWillianWhatsappProfileFromConnectyHub({ connectPayload: payload }).catch(() => null)
      : null;

  await persistConnectyHubInstance({
    instanceId,
    instanceName: config.instanceName,
    webhookUrl: config.webhookUrl,
    statusPayload: payload,
  });
  await configureConnectyHubProviderWebhook({ config, instanceId });

  return {
    payload: sanitizePayload(payload),
    connection: extractConnectionInfo(payload),
    profile,
  };
}

function webhookMatchesUrl(webhook: unknown, url: string) {
  const record = asRecord(webhook);
  return cleanString(record.url).replace(/\/+$/, "") === url.replace(/\/+$/, "");
}

function connectyHubProviderWebhookUrl(config: Awaited<ReturnType<typeof getWillianConfig>>) {
  const url = cleanString(config.webhookUrl);
  const secret = cleanString(config.webhookSecret);
  if (!url || !secret) return url;

  const token = createHash("sha256").update(secret).digest("hex");
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("connectyhub_provider_token", token);
    return parsed.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}connectyhub_provider_token=${encodeURIComponent(token)}`;
  }
}

function buildConnectyHubProviderWebhookPayload(config: Awaited<ReturnType<typeof getWillianConfig>>) {
  return {
    url: connectyHubProviderWebhookUrl(config),
    enabled: true,
    events: [...CONNECTYHUB_WEBHOOK_EVENTS],
    excludeMessages: [...CONNECTYHUB_WEBHOOK_EXCLUDES],
    addUrlEvents: false,
    addUrlTypesMessages: false,
  };
}

function buildConnectyHubGlobalWebhookPayload(config: Awaited<ReturnType<typeof getWillianConfig>>) {
  return {
    ...buildConnectyHubProviderWebhookPayload(config),
    url: config.webhookUrl,
    description: "Webhook principal Betel AI",
  };
}

async function configureConnectyHubProviderWebhook(input: {
  config: Awaited<ReturnType<typeof getWillianConfig>>;
  instanceId: string;
}) {
  const instanceId = cleanString(input.instanceId);
  if (!instanceId) return null;
  const config = input.config.webhookSecret ? input.config : await getWillianConfig();

  const payload = await connectyhubRequest("/provider/webhook", {
    body: {
      instanceId,
      payload: buildConnectyHubProviderWebhookPayload(config),
    },
    timeoutMs: 15000,
  });

  return sanitizePayload(payload);
}

export async function configureWillianWebhook() {
  const config = await getWillianConfig();
  if (!config.webhookUrl) throw new Error("Configure CONNECTYHUB_WEBHOOK_URL antes do webhook.");

  const webhookPayload = buildConnectyHubGlobalWebhookPayload(config);
  const existingPayload = await connectyhubRequest("/webhooks", { method: "GET", timeoutMs: 10000 }).catch(() => []);
  const existing = asArrayPayload(existingPayload).find((webhook) => webhookMatchesUrl(webhook, config.webhookUrl));
  const existingId = extractWebhookId(existing);

  if (existingId) {
    if (!config.webhookSecret) {
      throw new Error("Webhook ConnectyHub ja existe, mas CONNECTYHUB_WEBHOOK_SECRET esta ausente para validar entregas.");
    }

    const payload = await connectyhubRequest(`/webhooks/${encodeURIComponent(existingId)}`, {
      method: "PATCH",
      body: {
        ...webhookPayload,
        status: "active",
      },
    });
    const providerInstanceId = await resolveConnectyHubInstanceId(config).catch(() => "");
    const providerWebhook = providerInstanceId
      ? await configureConnectyHubProviderWebhook({ config, instanceId: providerInstanceId })
      : null;

    return {
      payload: sanitizePayload(payload),
      existingWebhookUpdated: true,
      providerWebhookConfigured: Boolean(providerWebhook),
      providerWebhook,
    };
  }

  const payload = await connectyhubRequest("/webhooks", {
    body: {
      ...webhookPayload,
      status: "active",
    },
  });
  const returnedSecret = extractWebhookSecret(payload);
  if (returnedSecret && !process.env.CONNECTYHUB_WEBHOOK_SECRET) {
    await upsertAppConfig([
      {
        key: "CONNECTYHUB_WEBHOOK_SECRET",
        value: returnedSecret,
        description: "Secret de assinatura do webhook ConnectyHub. Gerado pela ConnectyHub e armazenado como segredo.",
        secret: true,
      },
    ]);
  }
  if (!config.webhookSecret && !returnedSecret) {
    throw new Error("Webhook criado, mas a ConnectyHub nao retornou secret. Configure CONNECTYHUB_WEBHOOK_SECRET manualmente.");
  }
  const providerConfig = { ...config, webhookSecret: config.webhookSecret || returnedSecret };
  const providerInstanceId = await resolveConnectyHubInstanceId(providerConfig).catch(() => "");
  const providerWebhook = providerInstanceId
    ? await configureConnectyHubProviderWebhook({ config: providerConfig, instanceId: providerInstanceId })
    : null;

  return {
    payload: sanitizePayload(payload),
    webhookCreated: true,
    secretPersisted: Boolean(returnedSecret && !process.env.CONNECTYHUB_WEBHOOK_SECRET),
    providerWebhookConfigured: Boolean(providerWebhook),
    providerWebhook,
  };
}

export async function fetchWillianRemoteStatus() {
  const config = await getWillianConfig();
  const instanceId = await resolveConnectyHubInstanceId(config);
  if (!instanceId) throw new Error("Instancia ConnectyHub nao localizada para a Evelyn.");

  const payload = await connectyhubRequest(`/instances/${encodeURIComponent(instanceId)}/status`, { method: "GET", timeoutMs: 10000 });
  const status = normalizeStatusPayload(payload);
  const profile =
    status.connected || status.loggedIn
      ? await syncWillianWhatsappProfileFromConnectyHub({ statusPayload: payload }).catch(() => null)
      : null;

  await persistConnectyHubInstance({
    instanceId,
    instanceName: config.instanceName,
    webhookUrl: config.webhookUrl,
    statusPayload: payload,
  });

  return {
    payload: sanitizePayload(payload),
    connection: extractConnectionInfo(payload),
    lastDisconnectReason: extractConnectionInfo(payload).lastDisconnectReason,
    status,
    profile,
  };
}

async function runInstanceProviderAction(path: string, statusLabel: string) {
  const config = await getWillianConfig();
  const instanceId = await resolveConnectyHubInstanceId(config);
  if (!instanceId) throw new Error("Instancia ConnectyHub nao localizada para a Evelyn.");

  const payload = await connectyhubRequest(path, {
    body: { instanceId },
    method: path === "/provider/instance" ? "DELETE" : "POST",
    timeoutMs: 15000,
  });

  await persistConnectyHubInstance({
    instanceId,
    instanceName: config.instanceName,
    webhookUrl: config.webhookUrl,
    statusPayload: { status: statusLabel, payload },
  });

  return { payload: sanitizePayload(payload), instanceId: maskSecret(instanceId), status: statusLabel };
}

export async function disconnectWillianConnectyHubInstance() {
  return runInstanceProviderAction("/provider/instance/disconnect", "disconnected");
}

export async function resetWillianConnectyHubInstance(input: { phone?: string; browser?: string; reconnect?: boolean } = {}) {
  const config = await getWillianConfig();
  const instanceId = await resolveConnectyHubInstanceId(config);
  if (!instanceId) throw new Error("Instancia ConnectyHub nao localizada para reset.");

  const resetPayload = await connectyhubRequest(`/instances/${encodeURIComponent(instanceId)}/reset`, {
    method: "POST",
    timeoutMs: 15000,
  });

  await persistConnectyHubInstance({
    instanceId,
    instanceName: config.instanceName,
    webhookUrl: config.webhookUrl,
    statusPayload: { status: "resetting", payload: resetPayload },
  });

  if (input.reconnect === false) {
    return { payload: sanitizePayload(resetPayload), instanceId: maskSecret(instanceId), status: "resetting" };
  }

  const reconnect = await connectWillianConnectyHubInstance({
    browser: input.browser,
    phone: input.phone,
  });

  return {
    payload: sanitizePayload(resetPayload),
    instanceId: maskSecret(instanceId),
    status: "resetting",
    reconnect,
    connection: reconnect.connection,
  };
}

export async function resetConnectyHubWhatsappAgent(input: { agentKey: string; phone?: string; browser?: string; reconnect?: boolean }) {
  const agentKey = cleanString(input.agentKey);
  if (!agentKey) throw new Error("Agente WhatsApp nao informado para reset.");
  if (agentKey === WILLIAN_AGENT_KEY) {
    return resetWillianConnectyHubInstance({
      browser: input.browser,
      phone: input.phone,
      reconnect: input.reconnect,
    });
  }

  const instance = await findPersistedWhatsappInstance(agentKey);
  const instanceId = cleanString(instance?.provider_instance_id);
  const instanceName = cleanString(instance?.instance_name);
  if (!instanceId || !instanceName) throw new Error("Instancia ConnectyHub nao localizada para reset deste agente.");

  const localAgent = await getLocalWhatsappAgent(agentKey);
  const resetPayload = await connectyhubRequest(`/instances/${encodeURIComponent(instanceId)}/reset`, {
    method: "POST",
    timeoutMs: 15000,
  });

  await persistConnectyHubInstance({
    agentKey,
    agentName: localAgent?.agentName || agentKey,
    instanceId,
    instanceName,
    persistWillianConfig: false,
    statusPayload: { status: "resetting", payload: resetPayload },
  });

  if (input.reconnect === false) {
    return { payload: sanitizePayload(resetPayload), agentKey, instanceId: maskSecret(instanceId), status: "resetting" };
  }

  const connectPayload = await connectyhubRequest(`/instances/${encodeURIComponent(instanceId)}/connect`, {
    body: buildConnectBody({ browser: input.browser, phone: input.phone }),
  });
  const status = normalizeStatusPayload(connectPayload);
  await persistConnectyHubInstance({
    agentKey,
    agentName: localAgent?.agentName || agentKey,
    instanceId,
    instanceName,
    persistWillianConfig: false,
    statusPayload: connectPayload,
  });

  return {
    payload: sanitizePayload(resetPayload),
    agentKey,
    instanceId: maskSecret(instanceId),
    status: "resetting",
    reconnect: sanitizePayload(connectPayload),
    connection: extractConnectionInfo(connectPayload),
    connected: status.connected || status.loggedIn,
  };
}

export async function deleteWillianConnectyHubInstance(
  options: { allowMissingInstance?: boolean; archivePrimaryAgent?: boolean } = {}
) {
  const config = await getWillianConfig();
  const instanceId = options.allowMissingInstance
    ? await findConfiguredWillianInstanceId(config)
    : await resolveConnectyHubInstanceId(config);
  if (!instanceId && !options.allowMissingInstance) throw new Error("Instancia ConnectyHub nao localizada para excluir.");

  let payload: unknown = null;
  let warning = "";
  if (instanceId) {
    try {
      payload = await connectyhubRequest(`/instances/${encodeURIComponent(instanceId)}`, {
        method: "DELETE",
        timeoutMs: 15000,
      });
    } catch (error) {
      if (!options.archivePrimaryAgent) throw error;
      warning = error instanceof Error ? error.message : "Instancia remota nao apagada na ConnectyHub.";
    }
  }
  await clearPersistedConnectyHubInstance({ archivePrimaryAgent: options.archivePrimaryAgent });

  return {
    payload: payload ? sanitizePayload(payload) : null,
    instanceDeleted: Boolean(instanceId),
    agentArchived: Boolean(options.archivePrimaryAgent),
    warning,
  };
}

export async function testWillianWebhookDelivery() {
  const config = await getWillianConfig();
  if (!config.webhookUrl) throw new Error("CONNECTYHUB_WEBHOOK_URL ausente.");

  const existingPayload = await connectyhubRequest("/webhooks", { method: "GET", timeoutMs: 10000 }).catch(() => []);
  const existing = asArrayPayload(existingPayload).find((webhook) => webhookMatchesUrl(webhook, config.webhookUrl));
  const webhookId = extractWebhookId(existing);
  if (!webhookId) throw new Error("Webhook ConnectyHub nao localizado para teste.");

  const payload = await connectyhubRequest(`/webhooks/${encodeURIComponent(webhookId)}/test`, {
    method: "POST",
    timeoutMs: 15000,
  });

  return { payload: sanitizePayload(payload), webhookTestSent: true };
}

export async function fetchWillianWebhookDeliveries() {
  const payload = await connectyhubRequest("/webhooks/deliveries", { method: "GET", timeoutMs: 10000 });
  return { deliveries: asArrayPayload(payload).slice(0, 10).map(sanitizePayload), count: asArrayPayload(payload).length };
}

export async function fetchWillianConnectyHubDataOverview() {
  const config = await getWillianConfig();
  const instanceId = await resolveConnectyHubInstanceId(config);
  if (!instanceId) throw new Error("Instancia ConnectyHub nao localizada para leitura.");

  const query = `instanceId=${encodeURIComponent(instanceId)}&limit=5&offset=0`;
  const [messagesPayload, chatsPayload, contactsPayload] = await Promise.all([
    connectyhubRequest(`/messages?${query}`, { method: "GET", timeoutMs: 12000 }).catch((error) => ({ error: error instanceof Error ? error.message : "messages_error" })),
    connectyhubRequest(`/chats?${query}`, { method: "GET", timeoutMs: 12000 }).catch((error) => ({ error: error instanceof Error ? error.message : "chats_error" })),
    connectyhubRequest(`/contacts?${query}`, { method: "GET", timeoutMs: 12000 }).catch((error) => ({ error: error instanceof Error ? error.message : "contacts_error" })),
  ]);

  const messages = asArrayPayload(messagesPayload);
  const chats = asArrayPayload(chatsPayload);
  const contacts = asArrayPayload(contactsPayload);

  return {
    messages: messages.slice(0, 5).map(sanitizePayload),
    chats: chats.slice(0, 5).map(sanitizePayload),
    contacts: contacts.slice(0, 5).map(sanitizePayload),
    counts: {
      messages: messages.length,
      chats: chats.length,
      contacts: contacts.length,
    },
    errors: {
      messages: cleanString(asRecord(messagesPayload).error),
      chats: cleanString(asRecord(chatsPayload).error),
      contacts: cleanString(asRecord(contactsPayload).error),
    },
  };
}

export function normalizeWhatsAppNumber(value: string) {
  const digits = cleanString(value).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export type GlobalWhatsAppTextInput = {
  messageCode: string;
  runCode: string;
  subject: string;
  messagePreview: string;
  guardrailSummary: string;
  payload: Record<string, unknown>;
  actionButton?: WhatsAppActionButtonInput;
  sendOptions?: WhatsAppAgentSendOptions;
  senderAgentKey?: string;
  senderInstanceId?: string;
};

export async function sendGlobalWhatsAppText(input: GlobalWhatsAppTextInput): Promise<ConnectyHubDeliveryResult> {
  const startedMs = Date.now();
  const processedAt = new Date().toISOString();
  const recipient = asRecord(input.payload.recipient);
  const phone = normalizeWhatsAppNumber(cleanString(recipient.phone));
  const config = await getWillianConfig();
  const systemSender = config.apiToken
    ? await resolveSystemWhatsAppSender({
        senderAgentKey: input.senderAgentKey,
        senderInstanceId: input.senderInstanceId,
      }).catch((error) => ({
        configured: true,
        localInstanceId: "",
        agentKey: "",
        providerInstanceId: "",
        label: "",
        error: error instanceof Error ? error.message : "Erro ao resolver remetente WhatsApp do sistema.",
      }))
    : null;
  const instanceId = config.apiToken
    ? systemSender?.providerInstanceId ||
      (!systemSender?.configured ? await resolveConnectyHubInstanceId(config).catch(() => "") : "")
    : "";

  if (!config.apiToken || !instanceId) {
    const senderError = systemSender?.configured ? systemSender.error || "Remetente WhatsApp do sistema sem instancia valida." : "";
    return {
      ok: false,
      providerStatus: !config.apiToken
        ? "missing_connectyhub_token"
        : systemSender?.configured
          ? "missing_system_whatsapp_sender"
          : "missing_connectyhub_instance",
      endpointConfigured: false,
      latencyMs: Date.now() - startedMs,
      processedAt,
      errorMessage: !config.apiToken
        ? "CONNECTYHUB_API_TOKEN nao configurado."
        : senderError || "Instancia ConnectyHub do WhatsApp Global nao configurada.",
    };
  }

  if (!phone) {
    return {
      ok: false,
      providerStatus: "missing_recipient_phone",
      endpointConfigured: true,
      latencyMs: Date.now() - startedMs,
      processedAt,
      errorMessage: "Destinatario sem telefone para WhatsApp.",
    };
  }

  const text = [
    input.subject,
    input.messagePreview,
    input.guardrailSummary ? `\nObservacao: ${input.guardrailSummary}` : "",
  ].filter(Boolean).join("\n");

  try {
    const delivery = await sendConnectyHubWhatsAppMessage({
      instanceId,
      number: phone,
      text,
      trackId: input.messageCode,
      idempotencyKey: input.messageCode || input.runCode,
      actionButton: input.actionButton,
      sendOptions: input.sendOptions,
      timeoutMs: CONNECTYHUB_TEXT_SEND_TIMEOUT_MS,
    });
    return {
      ok: true,
      providerStatus: delivery.sentAsButton
        ? delivery.usedIdempotencyKey
          ? "connectyhub_button_accepted"
          : "connectyhub_button_accepted_without_idempotency"
        : delivery.usedIdempotencyKey
          ? "connectyhub_accepted"
          : "connectyhub_accepted_without_idempotency",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      externalDeliveryId: extractDeliveryId(delivery.payload),
      responsePreview: preview(JSON.stringify(sanitizePayload(delivery.payload))),
    };
  } catch (error) {
    const deliveryUnconfirmed = isUnconfirmedConnectyHubDeliveryError(error);
    return {
      ok: false,
      providerStatus: deliveryUnconfirmed ? "connectyhub_delivery_unconfirmed" : "connectyhub_error",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      deliveryUnconfirmed,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido na ConnectyHub.",
    };
  }
}

export async function sendWillianWhatsAppText(input: GlobalWhatsAppTextInput): Promise<ConnectyHubDeliveryResult> {
  return sendGlobalWhatsAppText(input);
}

export async function sendWillianWhatsAppReply(input: {
  number: string;
  text: string;
  trackId: string;
  actionButton?: WhatsAppActionButtonInput;
  sendOptions?: WhatsAppAgentSendOptions;
}): Promise<ConnectyHubDeliveryResult> {
  const startedMs = Date.now();
  const processedAt = new Date().toISOString();
  const phone = normalizeWhatsAppNumber(input.number);
  const config = await getWillianConfig();
  const instanceId = config.apiToken ? await resolveConnectyHubInstanceId(config).catch(() => "") : "";

  if (!config.apiToken || !instanceId || !phone || !input.text.trim()) {
    return {
      ok: false,
      providerStatus: !config.apiToken
        ? "missing_connectyhub_token"
        : !instanceId
          ? "missing_connectyhub_instance"
          : !phone
            ? "missing_recipient_phone"
            : "missing_reply_text",
      endpointConfigured: Boolean(config.apiToken && instanceId),
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      errorMessage: "Resposta WhatsApp incompleta para envio.",
    };
  }

  try {
    const delivery = await sendConnectyHubWhatsAppMessage({
      instanceId,
      number: phone,
      text: input.text.trim(),
      trackId: input.trackId,
      idempotencyKey: input.trackId,
      actionButton: input.actionButton,
      sendOptions: input.sendOptions,
      timeoutMs: CONNECTYHUB_TEXT_SEND_TIMEOUT_MS,
    });

    return {
      ok: true,
      providerStatus: delivery.sentAsButton
        ? delivery.usedIdempotencyKey
          ? "connectyhub_button_accepted"
          : "connectyhub_button_accepted_without_idempotency"
        : delivery.usedIdempotencyKey
          ? "connectyhub_accepted"
          : "connectyhub_accepted_without_idempotency",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      externalDeliveryId: extractDeliveryId(delivery.payload),
      responsePreview: preview(JSON.stringify(sanitizePayload(delivery.payload))),
    };
  } catch (error) {
    const deliveryUnconfirmed = isUnconfirmedConnectyHubDeliveryError(error);
    return {
      ok: false,
      providerStatus: deliveryUnconfirmed ? "connectyhub_delivery_unconfirmed" : "connectyhub_error",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      deliveryUnconfirmed,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido na ConnectyHub.",
    };
  }
}

export async function sendWhatsAppAgentReply(input: {
  agentKey: string;
  instanceId?: string;
  number: string;
  text: string;
  trackId: string;
  actionButton?: WhatsAppActionButtonInput;
  sendOptions?: WhatsAppAgentSendOptions;
}): Promise<ConnectyHubDeliveryResult> {
  if (!input.agentKey || input.agentKey === WILLIAN_AGENT_KEY) {
    return sendWillianWhatsAppReply(input);
  }

  const startedMs = Date.now();
  const processedAt = new Date().toISOString();
  const phone = normalizeWhatsAppNumber(input.number);
  const config = await getWillianConfig();
  const persisted = input.instanceId ? null : await findPersistedWhatsappInstance(input.agentKey);
  const instanceId = cleanString(input.instanceId || persisted?.provider_instance_id);

  if (!config.apiToken || !instanceId || !phone || !input.text.trim()) {
    return {
      ok: false,
      providerStatus: !config.apiToken
        ? "missing_connectyhub_token"
        : !instanceId
          ? "missing_connectyhub_instance"
          : !phone
            ? "missing_recipient_phone"
            : "missing_reply_text",
      endpointConfigured: Boolean(config.apiToken && instanceId),
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      errorMessage: "Resposta WhatsApp incompleta para envio.",
    };
  }

  try {
    const delivery = await sendConnectyHubWhatsAppMessage({
      instanceId,
      number: phone,
      text: input.text.trim(),
      trackId: input.trackId,
      idempotencyKey: input.trackId,
      actionButton: input.actionButton,
      sendOptions: input.sendOptions,
      timeoutMs: CONNECTYHUB_TEXT_SEND_TIMEOUT_MS,
    });

    return {
      ok: true,
      providerStatus: delivery.sentAsButton
        ? delivery.usedIdempotencyKey
          ? "connectyhub_button_accepted"
          : "connectyhub_button_accepted_without_idempotency"
        : delivery.usedIdempotencyKey
          ? "connectyhub_accepted"
          : "connectyhub_accepted_without_idempotency",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      externalDeliveryId: extractDeliveryId(delivery.payload),
      responsePreview: preview(JSON.stringify(sanitizePayload(delivery.payload))),
    };
  } catch (error) {
    const deliveryUnconfirmed = isUnconfirmedConnectyHubDeliveryError(error);
    return {
      ok: false,
      providerStatus: deliveryUnconfirmed ? "connectyhub_delivery_unconfirmed" : "connectyhub_error",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      deliveryUnconfirmed,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido na ConnectyHub.",
    };
  }
}

function extractDownloadedMediaUrl(payload: unknown) {
  return findFirstString(payload, ["fileURL", "fileUrl", "downloadUrl", "download_url", "url", "link"]);
}

function extractDownloadedMimeType(payload: unknown) {
  return findFirstString(payload, ["mimetype", "mimeType", "contentType", "content_type"]);
}

function extractDownloadedTranscription(payload: unknown) {
  return findFirstString(payload, [
    "transcription",
    "transcript",
    "text",
    "transcribedText",
    "transcribed_text",
    "speechText",
    "speech_text",
    "audioText",
    "audio_text",
  ]);
}

function extractDownloadedBase64(payload: unknown) {
  return findFirstString(payload, ["base64Data", "base64_data", "base64", "data"]);
}

export async function downloadWhatsAppAgentMessageMedia(input: {
  agentKey: string;
  instanceId?: string;
  messageId: string;
  chatId?: string;
  transcribe?: boolean;
  returnLink?: boolean;
  returnBase64?: boolean;
  generateMp3?: boolean;
  timeoutMs?: number;
}): Promise<ConnectyHubMediaDownloadResult> {
  const messageId = cleanString(input.messageId);
  const agentKey = cleanString(input.agentKey);
  const config = await getWillianConfig();
  const persisted =
    !input.instanceId && agentKey && agentKey !== WILLIAN_AGENT_KEY
      ? await findPersistedWhatsappInstance(agentKey)
      : null;
  const instanceId = cleanString(
    input.instanceId ||
      (agentKey === WILLIAN_AGENT_KEY ? await resolveConnectyHubInstanceId(config).catch(() => "") : "") ||
      persisted?.provider_instance_id
  );

  if (!config.apiToken || !instanceId || !messageId) {
    throw new Error(
      !config.apiToken
        ? "CONNECTYHUB_API_TOKEN ausente para baixar midia."
        : !instanceId
          ? "Instancia ConnectyHub ausente para baixar midia."
          : "ID da mensagem ausente para baixar midia."
    );
  }

  const basePayload: Record<string, unknown> = {
    id: messageId,
    transcribe: Boolean(input.transcribe),
    return_link: input.returnLink !== false,
    return_base64: Boolean(input.returnBase64),
    generate_mp3: input.generateMp3 !== false,
  };
  const chatId = cleanString(input.chatId);
  const payloads = chatId
    ? [
        basePayload,
        {
          ...basePayload,
          messageid: messageId,
          messageId,
          chatid: chatId,
        },
      ]
    : [basePayload];
  let lastError = "sem detalhe do provedor";

  for (const payload of payloads) {
    try {
      const response = await connectyhubRequest("/provider/message/download", {
        method: "POST",
        body: {
          instanceId,
          payload,
        },
        timeoutMs: input.timeoutMs || 30000,
      });

      return {
        fileUrl: extractDownloadedMediaUrl(response),
        mimeType: extractDownloadedMimeType(response),
        base64Data: extractDownloadedBase64(response),
        transcription: extractDownloadedTranscription(response),
        payload: sanitizePayload(response),
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "falha ao baixar midia";
    }
  }

  throw new Error(`Nao foi possivel baixar a midia da mensagem ${messageId}: ${lastError}`);
}

function mediaSendTimeoutMs(type: string) {
  const normalized = cleanString(type).toLowerCase();
  return normalized.includes("audio") || normalized.includes("myaudio") || normalized.includes("ptt") ? 30000 : 20000;
}

export async function sendWillianWhatsAppMedia(input: {
  number: string;
  type: "image" | "video" | "videoplay" | "document" | "audio" | "myaudio" | "ptt" | "ptv" | "sticker";
  file: string;
  text?: string;
  docName?: string;
  trackId: string;
  sendOptions?: WhatsAppAgentSendOptions;
}) {
  const config = await getWillianConfig();
  const instanceId = config.apiToken ? await resolveConnectyHubInstanceId(config).catch(() => "") : "";
  const number = normalizeWhatsAppNumber(input.number);
  if (!config.apiToken || !instanceId || !number || !input.file) {
    throw new Error("Envio de midia WhatsApp incompleto.");
  }

  const sendFields = optionalSendFields(input.sendOptions);
  const timeoutMs = mediaSendTimeoutMs(input.type);
  let payload: unknown;

  try {
    ({ payload } = await connectyhubRequestWithIdempotencyFallback("/provider/send/media", {
      body: {
        instanceId,
        payload: {
          number,
          type: input.type,
          file: input.file,
          text: input.text,
          docName: input.docName,
          track_source: "betel_ai",
          track_id: input.trackId,
          ...sendFields,
        },
      },
      idempotencyKey: input.trackId,
      timeoutMs,
    }));
  } catch (error) {
    if (!shouldFallbackToLegacySend(error)) throw error;

    ({ payload } = await connectyhubRequestWithIdempotencyFallback("/messages/media", {
      body: {
        instanceId,
        number,
        type: input.type,
        file: input.file,
        text: input.text,
        docName: input.docName,
        trackId: input.trackId,
        delay: sendFields.delay,
        readchat: sendFields.readchat,
        readmessages: sendFields.readmessages,
      },
      idempotencyKey: input.trackId,
      timeoutMs,
    }));
  }

  return { payload: sanitizePayload(payload), externalDeliveryId: extractDeliveryId(payload) };
}

export async function sendWhatsAppAgentMediaReply(input: {
  agentKey: string;
  instanceId?: string;
  number: string;
  type: "image" | "video" | "videoplay" | "document" | "audio" | "myaudio" | "ptt" | "ptv" | "sticker";
  file: string;
  text?: string;
  docName?: string;
  trackId: string;
  sendOptions?: WhatsAppAgentSendOptions;
}) {
  if (!input.agentKey || input.agentKey === WILLIAN_AGENT_KEY) {
    return sendWillianWhatsAppMedia(input);
  }

  const config = await getWillianConfig();
  const persisted = input.instanceId ? null : await findPersistedWhatsappInstance(input.agentKey);
  const instanceId = cleanString(input.instanceId || persisted?.provider_instance_id);
  const number = normalizeWhatsAppNumber(input.number);
  if (!config.apiToken || !instanceId || !number || !input.file) {
    throw new Error("Envio de midia WhatsApp incompleto.");
  }

  const sendFields = optionalSendFields(input.sendOptions);
  const timeoutMs = mediaSendTimeoutMs(input.type);
  let payload: unknown;

  try {
    ({ payload } = await connectyhubRequestWithIdempotencyFallback("/provider/send/media", {
      body: {
        instanceId,
        payload: {
          number,
          type: input.type,
          file: input.file,
          text: input.text,
          docName: input.docName,
          track_source: "betel_ai",
          track_id: input.trackId,
          ...sendFields,
        },
      },
      idempotencyKey: input.trackId,
      timeoutMs,
    }));
  } catch (error) {
    if (!shouldFallbackToLegacySend(error)) throw error;

    ({ payload } = await connectyhubRequestWithIdempotencyFallback("/messages/media", {
      body: {
        instanceId,
        number,
        type: input.type,
        file: input.file,
        text: input.text,
        docName: input.docName,
        trackId: input.trackId,
        delay: sendFields.delay,
        readchat: sendFields.readchat,
        readmessages: sendFields.readmessages,
      },
      idempotencyKey: input.trackId,
      timeoutMs,
    }));
  }

  return { payload: sanitizePayload(payload), externalDeliveryId: extractDeliveryId(payload) };
}
