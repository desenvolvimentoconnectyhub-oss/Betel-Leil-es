import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WillianConnectionInfo, WillianInstanceState } from "./willian-types";

export const WILLIAN_AGENT_KEY = "multichannel-dispatch";
export const WILLIAN_AGENT_NAME = "Willian";
export const WILLIAN_DEFAULT_INSTANCE_NAME = "willian-betel";
export const CONNECTYHUB_PROVIDER = "connectyhub";
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

export type ConnectyHubDeliveryResult = {
  ok: boolean;
  providerStatus: string;
  endpointConfigured: boolean;
  latencyMs: number;
  processedAt: string;
  externalDeliveryId?: string;
  responsePreview?: string;
  errorMessage?: string;
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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
  for (const key of keys) {
    const value = cleanString(process.env[key]);
    if (value) return { value, source: "env" };
  }

  for (const key of configAliases(keys)) {
    const value = cleanString(appConfig.get(key));
    if (value) return { value, source: "app_config" };
  }

  if (fallback) return { value: fallback, source: "default" };
  return { value: "", source: "missing" };
}

const willianConfigKeys = [
  "CONNECTYHUB_API_URL",
  "CONNECTYHUB_API_TOKEN",
  "CONNECTYHUB_WEBHOOK_SECRET",
  "CONNECTYHUB_WEBHOOK_URL",
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

async function getWillianConfig() {
  const appConfig = await readAppConfig(willianConfigKeys);
  const base = configFrom(["CONNECTYHUB_API_URL"], appConfig, "https://www.connectyhub.com.br/api/v1");
  const apiToken = configFrom(["CONNECTYHUB_API_TOKEN"], appConfig);
  const webhookSecret = configFrom(["CONNECTYHUB_WEBHOOK_SECRET"], appConfig);
  const webhookUrl = configFrom(["CONNECTYHUB_WEBHOOK_URL"], appConfig);
  const instanceName = configFrom(["BETEL_WILLIAN_CONNECTYHUB_INSTANCE_NAME"], appConfig, WILLIAN_DEFAULT_INSTANCE_NAME);
  const instanceId = configFrom(["BETEL_WILLIAN_CONNECTYHUB_INSTANCE_ID"], appConfig);
  const phoneNumber = configFrom(["BETEL_WILLIAN_WHATSAPP_PHONE_NUMBER"], appConfig);
  const displayName = configFrom(["BETEL_WILLIAN_WHATSAPP_DISPLAY_NAME"], appConfig);
  const profileImageUrl = configFrom(["BETEL_WILLIAN_WHATSAPP_PROFILE_IMAGE_URL"], appConfig);
  const profileImageSyncedAt = configFrom(["BETEL_WILLIAN_WHATSAPP_PROFILE_SYNCED_AT"], appConfig);
  const emailProvider = configFrom(["BETEL_EMAIL_PROVIDER"], appConfig, "resend");
  const resendKey = configFrom(["RESEND_API_KEY"], appConfig);
  const emailFrom = configFrom(["BETEL_EMAIL_FROM"], appConfig);
  const communicationReleased =
    readBoolean(process.env.BETEL_COMMUNICATION_PROVIDER_RELEASED) ||
    readBoolean(appConfig.get("BETEL_COMMUNICATION_PROVIDER_RELEASED")) ||
    readBoolean(appConfig.get("betel_communication_provider_released"));
  const whatsappProviderReleased =
    communicationReleased ||
    readBoolean(process.env.BETEL_WHATSAPP_PROVIDER_RELEASED) ||
    readBoolean(appConfig.get("BETEL_WHATSAPP_PROVIDER_RELEASED")) ||
    readBoolean(appConfig.get("betel_whatsapp_provider_released"));
  const emailProviderReleased =
    communicationReleased ||
    readBoolean(process.env.BETEL_EMAIL_PROVIDER_RELEASED) ||
    readBoolean(appConfig.get("BETEL_EMAIL_PROVIDER_RELEASED")) ||
    readBoolean(appConfig.get("betel_email_provider_released"));

  return {
    baseUrl: normalizeBaseUrl(base.value) || "https://www.connectyhub.com.br/api/v1",
    baseUrlSource: base.source,
    apiToken: apiToken.value,
    webhookSecret: webhookSecret.value,
    webhookUrl: normalizePublicUrl(webhookUrl.value),
    instanceName: instanceName.value,
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

function normalizeStatusPayload(payload: unknown) {
  const data = asRecord(payload);
  const status = asRecord(data.status);
  const instance = asRecord(data.instance);
  const rawState =
    instance.status ||
    instance.state ||
    status.state ||
    status.status ||
    data.state ||
    data.status ||
    instance.connectionStatus ||
    data.connectionStatus;
  const state = normalizeConnectionState(rawState, false);
  const connected =
    readBooleanLike(status.connected) ||
    readBooleanLike(data.connected) ||
    readBooleanLike(instance.connected) ||
    readBooleanLike(status.loggedIn) ||
    readBooleanLike(data.loggedIn) ||
    readBooleanLike(instance.loggedIn) ||
    state === "connected";
  const loggedIn =
    connected ||
    readBooleanLike(status.isLogged) ||
    readBooleanLike(data.isLogged) ||
    readBooleanLike(instance.isLogged) ||
    readBooleanLike(status.loggedIn) ||
    readBooleanLike(data.loggedIn) ||
    readBooleanLike(instance.loggedIn);
  const jid =
    status.jid ??
    data.jid ??
    instance.jid ??
    status.owner ??
    data.owner ??
    instance.owner ??
    data.phoneNumber ??
    instance.phoneNumber ??
    null;

  return { connected, loggedIn, jid, state };
}

function findFirstString(payload: unknown, keys: string[]): string {
  if (typeof payload === "string") return "";
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

function extractConnectionInfo(payload: unknown): WillianConnectionInfo {
  const qrCode = findFirstString(payload, ["qrCode", "qrcode", "qr", "base64", "image"]);
  const pairingCode = findFirstString(payload, ["pairingCode", "pairCode", "paircode", "code"]);
  const info: WillianConnectionInfo = {};

  if (pairingCode) info.pairingCode = pairingCode;
  if (qrCode) {
    if (qrCode.startsWith("data:image")) info.qrCodeDataUrl = qrCode;
    else if (qrCode.length > 80 && /^[A-Za-z0-9+/=]+$/.test(qrCode)) info.qrCodeDataUrl = `data:image/png;base64,${qrCode}`;
    else info.qrCode = qrCode;
  }

  return info;
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
    throw new Error(cleanString(error.message || data.message || data.error || data.response, `ConnectyHub retornou HTTP ${response.status}.`));
  }

  return payload;
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
  const normalizedName = instanceName.toLowerCase();
  return instances.find((item) => extractInstanceName(item).toLowerCase() === normalizedName) || null;
}

async function resolveConnectyHubInstanceId(config?: Awaited<ReturnType<typeof getWillianConfig>>) {
  const resolvedConfig = config || await getWillianConfig();
  if (resolvedConfig.instanceId) return resolvedConfig.instanceId;

  const instances = await listConnectyHubInstances().catch(() => []);
  const normalizedName = resolvedConfig.instanceName.toLowerCase();
  const matched = instances.find((item) => extractInstanceName(item).toLowerCase() === normalizedName) || instances[0];
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

async function persistConnectyHubInstance(input: {
  instanceId: string;
  instanceName: string;
  webhookUrl?: string;
  statusPayload?: unknown;
}) {
  const records: Array<{ key: string; value: string; description: string; secret?: boolean }> = [];
  if (input.instanceId) {
    records.push({
      key: "BETEL_WILLIAN_CONNECTYHUB_INSTANCE_ID",
      value: input.instanceId,
      description: "ID da instancia ConnectyHub usada pelo agente Willian.",
    });
  }
  if (input.instanceName) {
    records.push({
      key: "BETEL_WILLIAN_CONNECTYHUB_INSTANCE_NAME",
      value: input.instanceName,
      description: "Nome da instancia ConnectyHub usada pelo agente Willian.",
    });
  }
  await upsertAppConfig(records);

  const supabase = getSupabaseAdminClient();
  if (!supabase || !input.instanceName) return;

  const status = normalizeStatusPayload(input.statusPayload || {});
  const phone = extractWhatsappPhoneNumber(input.statusPayload);
  await supabase.from("whatsapp_instances").upsert(
    {
      agent_key: WILLIAN_AGENT_KEY,
      provider: CONNECTYHUB_PROVIDER,
      instance_name: input.instanceName,
      provider_instance_id: input.instanceId || null,
      token_ciphertext: null,
      token_preview: null,
      phone: phone || null,
      status: status.state || "draft",
      webhook_url: input.webhookUrl || null,
      webhook_secret_preview: null,
      last_seen_at: new Date().toISOString(),
      connected_at: status.connected || status.loggedIn ? new Date().toISOString() : null,
    },
    { onConflict: "provider,instance_name" }
  );
}

async function clearPersistedConnectyHubInstance() {
  await deleteAppConfig([
    "BETEL_WILLIAN_CONNECTYHUB_INSTANCE_ID",
    "BETEL_WILLIAN_WHATSAPP_PHONE_NUMBER",
    "BETEL_WILLIAN_WHATSAPP_DISPLAY_NAME",
    "BETEL_WILLIAN_WHATSAPP_PROFILE_IMAGE_URL",
    "BETEL_WILLIAN_WHATSAPP_PROFILE_SYNCED_AT",
  ]);

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
    records.push({
      key: "BETEL_WILLIAN_WHATSAPP_PHONE_NUMBER",
      value: phoneNumber,
      description: "Numero de WhatsApp conectado na instancia do agente Willian.",
    });
  }
  if (displayName) {
    records.push({
      key: "BETEL_WILLIAN_WHATSAPP_DISPLAY_NAME",
      value: displayName,
      description: "Nome de exibicao do WhatsApp conectado na instancia do agente Willian.",
    });
  }
  if (profileImageUrl) {
    records.push(
      {
        key: "BETEL_WILLIAN_WHATSAPP_PROFILE_IMAGE_URL",
        value: profileImageUrl,
        description: "Foto de perfil do WhatsApp conectado na instancia do agente Willian.",
      },
      {
        key: "BETEL_WILLIAN_WHATSAPP_PROFILE_SYNCED_AT",
        value: syncedAt,
        description: "Data da ultima sincronizacao da foto do WhatsApp do agente Willian.",
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
  const missing = [
    !config.apiToken ? "CONNECTYHUB_API_TOKEN" : "",
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
    missing,
  };

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
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : "Falha ao consultar ConnectyHub.";
  }

  return state;
}

export async function createWillianConnectyHubInstance(input: { instanceName?: string } = {}) {
  const config = await getWillianConfig();
  const instanceName = cleanString(input.instanceName, config.instanceName || WILLIAN_DEFAULT_INSTANCE_NAME);
  if (!config.webhookUrl) throw new Error("Configure CONNECTYHUB_WEBHOOK_URL antes de criar a instancia.");

  const existing = await findConnectyHubInstanceByName(instanceName);
  const existingId = extractInstanceId(existing);
  if (existingId) {
    const name = extractInstanceName(existing, instanceName);
    await persistConnectyHubInstance({
      instanceId: existingId,
      instanceName: name,
      webhookUrl: config.webhookUrl,
      statusPayload: existing,
    });

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
  }

  return {
    payload: sanitizePayload(payload),
    instanceIdPersisted: Boolean(instanceId),
    instanceName: name,
  };
}

export async function connectWillianConnectyHubInstance(input: { phone?: string; browser?: string } = {}) {
  const config = await getWillianConfig();
  const instanceId = await resolveConnectyHubInstanceId(config);
  if (!instanceId) throw new Error("Crie ou vincule uma instancia ConnectyHub antes de conectar.");

  const body: Record<string, unknown> = {};
  const phone = normalizeWhatsAppNumber(input.phone || "");
  if (phone) body.phone = phone;

  const payload = await connectyhubRequest(`/instances/${encodeURIComponent(instanceId)}/connect`, { body });
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

export async function configureWillianWebhook() {
  const config = await getWillianConfig();
  if (!config.webhookUrl) throw new Error("Configure CONNECTYHUB_WEBHOOK_URL antes do webhook.");

  const events = [...CONNECTYHUB_WEBHOOK_EVENTS];
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
        url: config.webhookUrl,
        description: "Webhook principal Betel AI",
        events,
        status: "active",
      },
    });

    return { payload: sanitizePayload(payload), existingWebhookUpdated: true };
  }

  const payload = await connectyhubRequest("/webhooks", {
    body: {
      url: config.webhookUrl,
      description: "Webhook principal Betel AI",
      events,
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

  return { payload: sanitizePayload(payload), webhookCreated: true, secretPersisted: Boolean(returnedSecret && !process.env.CONNECTYHUB_WEBHOOK_SECRET) };
}

export async function fetchWillianRemoteStatus() {
  const config = await getWillianConfig();
  const instanceId = await resolveConnectyHubInstanceId(config);
  if (!instanceId) throw new Error("Instancia ConnectyHub nao localizada para o Willian.");

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
    status,
    profile,
  };
}

async function runInstanceProviderAction(path: string, statusLabel: string) {
  const config = await getWillianConfig();
  const instanceId = await resolveConnectyHubInstanceId(config);
  if (!instanceId) throw new Error("Instancia ConnectyHub nao localizada para o Willian.");

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

export async function resetWillianConnectyHubInstance() {
  return runInstanceProviderAction("/provider/instance/reset", "resetting");
}

export async function deleteWillianConnectyHubInstance() {
  const config = await getWillianConfig();
  const instanceId = await resolveConnectyHubInstanceId(config);
  if (!instanceId) throw new Error("Instancia ConnectyHub nao localizada para excluir.");

  const payload = await connectyhubRequest(`/provider/instance?instanceId=${encodeURIComponent(instanceId)}`, {
    method: "DELETE",
    timeoutMs: 15000,
  });
  await clearPersistedConnectyHubInstance();

  return { payload: sanitizePayload(payload), instanceDeleted: true };
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

export async function sendWillianWhatsAppText(input: {
  messageCode: string;
  runCode: string;
  subject: string;
  messagePreview: string;
  guardrailSummary: string;
  payload: Record<string, unknown>;
}): Promise<ConnectyHubDeliveryResult> {
  const startedMs = Date.now();
  const processedAt = new Date().toISOString();
  const recipient = asRecord(input.payload.recipient);
  const phone = normalizeWhatsAppNumber(cleanString(recipient.phone));
  const config = await getWillianConfig();
  const instanceId = config.apiToken ? await resolveConnectyHubInstanceId(config).catch(() => "") : "";

  if (!config.apiToken || !instanceId) {
    return {
      ok: false,
      providerStatus: !config.apiToken ? "missing_connectyhub_token" : "missing_connectyhub_instance",
      endpointConfigured: false,
      latencyMs: Date.now() - startedMs,
      processedAt,
      errorMessage: !config.apiToken
        ? "CONNECTYHUB_API_TOKEN nao configurado."
        : "Instancia ConnectyHub do Willian nao configurada.",
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
    const payload = await connectyhubRequest("/messages/text", {
      body: {
        instanceId,
        number: phone,
        text,
        linkPreview: true,
        trackId: input.messageCode,
      },
      headers: {
        "Idempotency-Key": input.messageCode || input.runCode,
      },
      timeoutMs: 15000,
    });
    return {
      ok: true,
      providerStatus: "connectyhub_accepted",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      externalDeliveryId: extractDeliveryId(payload),
      responsePreview: preview(JSON.stringify(sanitizePayload(payload))),
    };
  } catch (error) {
    return {
      ok: false,
      providerStatus: "connectyhub_error",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido na ConnectyHub.",
    };
  }
}

export async function sendWillianWhatsAppReply(input: {
  number: string;
  text: string;
  trackId: string;
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
    const payload = await connectyhubRequest("/messages/text", {
      body: {
        instanceId,
        number: phone,
        text: input.text.trim(),
        linkPreview: true,
        trackId: input.trackId,
      },
      headers: {
        "Idempotency-Key": input.trackId,
      },
      timeoutMs: 15000,
    });

    return {
      ok: true,
      providerStatus: "connectyhub_accepted",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      externalDeliveryId: extractDeliveryId(payload),
      responsePreview: preview(JSON.stringify(sanitizePayload(payload))),
    };
  } catch (error) {
    return {
      ok: false,
      providerStatus: "connectyhub_error",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido na ConnectyHub.",
    };
  }
}

export async function sendWillianWhatsAppMedia(input: {
  number: string;
  type: "image" | "video" | "videoplay" | "document" | "audio" | "myaudio" | "ptt" | "ptv" | "sticker";
  file: string;
  text?: string;
  docName?: string;
  trackId: string;
}) {
  const config = await getWillianConfig();
  const instanceId = config.apiToken ? await resolveConnectyHubInstanceId(config).catch(() => "") : "";
  const number = normalizeWhatsAppNumber(input.number);
  if (!config.apiToken || !instanceId || !number || !input.file) {
    throw new Error("Envio de midia WhatsApp incompleto.");
  }

  const payload = await connectyhubRequest("/messages/media", {
    body: {
      instanceId,
      number,
      type: input.type,
      file: input.file,
      text: input.text,
      docName: input.docName,
      trackId: input.trackId,
    },
    headers: {
      "Idempotency-Key": input.trackId,
    },
    timeoutMs: 20000,
  });

  return { payload: sanitizePayload(payload), externalDeliveryId: extractDeliveryId(payload) };
}
