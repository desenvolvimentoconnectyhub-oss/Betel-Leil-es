import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type DbRow = Record<string, unknown>;

type MetaConfigInternal = MetaWhatsAppConfig & {
  appSecret: string;
  systemUserToken: string;
  webhookVerifyToken: string;
};

export type MetaTemplateButtonInput = {
  type: "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phoneNumber?: string;
};

export type CreateMetaWhatsAppTemplateInput = {
  name: string;
  category: string;
  language: string;
  headerType: "none" | "text" | "image" | "video" | "document";
  headerText?: string;
  headerMediaHandle?: string;
  bodyText: string;
  footerText?: string;
  buttons?: MetaTemplateButtonInput[];
  variableExamples?: Record<string, string>;
};

export type ImportMetaWhatsAppContactListInput = {
  name: string;
  sourceFilename: string;
  sourceType: "csv" | "txt" | "xlsx" | "manual" | "import";
  rows: Array<Record<string, string>>;
  optInConfirmed: boolean;
  optInSource?: string;
};

export type CreateMetaWhatsAppCampaignInput = {
  name: string;
  campaignType: string;
  senderId?: string;
  templateId: string;
  contactListId: string;
  language?: string;
  scheduledFor?: string;
  requireOptIn: boolean;
  rateLimitPerMinute?: number;
  dailyLimitPerNumber?: number;
};

export type MetaWhatsAppConfig = {
  appId: string;
  appSecretConfigured: boolean;
  systemUserTokenConfigured: boolean;
  wabaId: string;
  phoneNumberId: string;
  webhookVerifyTokenConfigured: boolean;
  apiVersion: string;
  defaultLanguage: string;
  rateLimitPerMinute: number;
  dailyLimitPerNumber: number;
  configured: boolean;
};

export type MetaWhatsAppDashboardData = {
  source: "supabase" | "migration_pending" | "mock";
  reason?: string;
  generatedAt: string;
  config: MetaWhatsAppConfig;
  metrics: Array<{ label: string; value: string; detail: string; tone: "green" | "yellow" | "red" | "purple" | "muted" }>;
  campaigns: Array<{
    id: string;
    name: string;
    campaignType: string;
    status: string;
    approvalStatus: string;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    queued: number;
    skipped: number;
    total: number;
    scheduledFor: string;
    templateName: string;
    contactListName: string;
    createdAt: string;
  }>;
  templates: Array<{
    id: string;
    metaTemplateId: string;
    name: string;
    language: string;
    status: string;
    managedFromPanel: boolean;
    category: string;
    headerType: string;
    headerText: string;
    bodyText: string;
    footerText: string;
    buttons: unknown[];
    variables: unknown[];
    rejectionReason: string;
  }>;
  senders: Array<{ id: string; label: string; phoneNumberId: string; displayPhoneNumber: string; status: string; qualityRating: string; isDefault: boolean }>;
  contactLists: Array<{
    id: string;
    name: string;
    validCount: number;
    duplicateCount: number;
    invalidCount: number;
    optInCount: number;
    sourceFilename: string;
    sourceType: string;
    createdAt: string;
  }>;
};

const DEFAULT_API_VERSION = "v26.0";
const DEFAULT_LANGUAGE = "pt_BR";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value: unknown) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function tableMissing(error: unknown) {
  const message = error instanceof Error ? error.message : cleanString((error as DbRow | null)?.message);
  return /relation .* does not exist|schema cache|Could not find the table|does not exist/i.test(message);
}

function normalizeKey(value: string) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9{}]+/g, "");
}

function pickValue(row: Record<string, string>, keys: string[]) {
  const normalizedKeys = keys.map(normalizeKey);
  const entry = Object.entries(row).find(([key]) => normalizedKeys.includes(normalizeKey(key)));
  return cleanString(entry?.[1]);
}

function normalizePhone(value: unknown) {
  let digits = cleanString(value).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) digits = `55${digits}`;
  if (digits.startsWith("055")) digits = digits.slice(1);
  if (digits.length < 10 || digits.length > 15) return "";
  return digits;
}

function tagsFromValue(value: string) {
  return cleanString(value)
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function variablesFromRow(row: Record<string, string>) {
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeKey(key);
    const match = normalized.match(/^(?:var|variavel|variable)?(\d+)$/) || normalized.match(/^\{\{(\d+)\}\}$/);
    if (match && cleanString(value)) variables[match[1]] = cleanString(value);
  }
  return variables;
}

function standardVariablesForContact(contact: DbRow, templateVariables: unknown[]) {
  const baseVariables = asObject(contact.variables);
  const values: Record<string, string> = {};
  for (const variable of templateVariables) {
    const key = cleanString(variable);
    values[key] =
      cleanString(baseVariables[key]) ||
      (key === "1" ? cleanString(contact.name) : "") ||
      (key === "2" ? cleanString(contact.city) : "") ||
      (key === "3" ? cleanString(contact.email) : "");
  }
  return values;
}

async function insertInChunks(table: string, rows: DbRow[], chunkSize = 500) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || rows.length === 0) return;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const { error } = await supabase.from(table).insert(rows.slice(index, index + chunkSize));
    if (error) throw error;
  }
}

async function readAppConfig() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return new Map<string, string>();

  const { data, error } = await supabase.from("app_config").select("key,value");
  if (error || !data) return new Map<string, string>();

  return new Map(
    ((data || []) as DbRow[])
      .map((row) => [cleanString(row.key).toLowerCase(), cleanString(row.value)] as const)
      .filter(([key]) => Boolean(key))
  );
}

function valueFor(config: Map<string, string>, key: string, envName: string, fallback = "") {
  return config.get(key) || cleanString(process.env[envName]) || fallback;
}

async function getMetaWhatsAppConfigInternal(): Promise<MetaConfigInternal> {
  const config = await readAppConfig();
  const appId = valueFor(config, "meta_app_id", "META_APP_ID");
  const appSecret = valueFor(config, "meta_app_secret", "META_APP_SECRET");
  const systemUserToken = valueFor(config, "meta_system_user_token", "META_SYSTEM_USER_TOKEN");
  const wabaId = valueFor(config, "meta_waba_id", "META_WABA_ID");
  const phoneNumberId = valueFor(config, "meta_phone_number_id", "META_PHONE_NUMBER_ID");
  const webhookVerifyToken = valueFor(config, "meta_webhook_verify_token", "META_WEBHOOK_VERIFY_TOKEN");
  const apiVersion = valueFor(config, "meta_graph_api_version", "META_GRAPH_API_VERSION", DEFAULT_API_VERSION);
  const defaultLanguage = valueFor(config, "meta_default_language", "META_DEFAULT_LANGUAGE", DEFAULT_LANGUAGE);
  const rateLimitPerMinute = Math.max(1, Math.min(1000, asNumber(valueFor(config, "meta_rate_limit_per_minute", "META_RATE_LIMIT_PER_MINUTE", "60"), 60)));
  const dailyLimitPerNumber = Math.max(1, Math.min(100000, asNumber(valueFor(config, "meta_daily_limit_per_number", "META_DAILY_LIMIT_PER_NUMBER", "1000"), 1000)));

  return {
    appId,
    appSecret,
    appSecretConfigured: Boolean(appSecret),
    systemUserToken,
    systemUserTokenConfigured: Boolean(systemUserToken),
    wabaId,
    phoneNumberId,
    webhookVerifyToken,
    webhookVerifyTokenConfigured: Boolean(webhookVerifyToken),
    apiVersion,
    defaultLanguage,
    rateLimitPerMinute,
    dailyLimitPerNumber,
    configured: Boolean(systemUserToken && wabaId && phoneNumberId && webhookVerifyToken),
  };
}

function publicConfig(config: MetaConfigInternal): MetaWhatsAppConfig {
  const { appSecret, systemUserToken, webhookVerifyToken, ...publicValue } = config;
  void appSecret;
  void systemUserToken;
  void webhookVerifyToken;
  return publicValue;
}

export async function getMetaWhatsAppConfig(): Promise<MetaWhatsAppConfig> {
  return publicConfig(await getMetaWhatsAppConfigInternal());
}

export async function getMetaWhatsAppWebhookSecrets() {
  const config = await readAppConfig();
  return {
    verifyToken: valueFor(config, "meta_webhook_verify_token", "META_WEBHOOK_VERIFY_TOKEN"),
    appSecret: valueFor(config, "meta_app_secret", "META_APP_SECRET"),
  };
}

export async function testMetaWhatsAppConnection() {
  const config = await getMetaWhatsAppConfigInternal();
  const token = config.systemUserToken;
  const wabaId = config.wabaId;
  const apiVersion = config.apiVersion;
  const start = Date.now();

  if (!token || !wabaId) {
    return {
      success: false,
      integration: "meta_whatsapp",
      message: "Informe Business/System User Token e WABA ID para testar a conexao oficial da Meta.",
      latencyMs: Date.now() - start,
    };
  }

  try {
    const url = new URL(`https://graph.facebook.com/${apiVersion}/${wabaId}/phone_numbers`);
    url.searchParams.set("fields", "id,display_phone_number,verified_name,quality_rating,code_verification_status");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - start;
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = cleanString((payload as DbRow)?.error && ((payload as DbRow).error as DbRow).message, `Meta retornou ${response.status}.`);
      return { success: false, integration: "meta_whatsapp", message, latencyMs };
    }

    const count = Array.isArray((payload as DbRow).data) ? ((payload as DbRow).data as unknown[]).length : 0;
    return {
      success: true,
      integration: "meta_whatsapp",
      message: `Meta WhatsApp respondeu com ${count} numero(s) oficial(is). Resposta em ${latencyMs}ms.`,
      latencyMs,
    };
  } catch (error) {
    return {
      success: false,
      integration: "meta_whatsapp",
      message: error instanceof Error ? error.message : "Falha ao conectar na Meta WhatsApp Cloud API.",
      latencyMs: Date.now() - start,
    };
  }
}

function metaGraphUrl(config: MetaConfigInternal, path: string) {
  return new URL(`https://graph.facebook.com/${config.apiVersion}/${path.replace(/^\/+/, "")}`);
}

async function metaFetch(config: MetaConfigInternal, path: string, init: RequestInit = {}) {
  if (!config.systemUserToken || !config.wabaId) {
    throw new Error("Configure Business/System User Token e WABA ID na Sala de Manutencao.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${config.systemUserToken}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(metaGraphUrl(config, path), {
    ...init,
    headers,
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = payload && typeof payload === "object" ? (payload as DbRow).error as DbRow | undefined : undefined;
    throw new Error(cleanString(error?.message, `Meta retornou ${response.status}.`));
  }

  return payload as DbRow;
}

function mapTemplateStatus(value: unknown) {
  const normalized = cleanString(value, "pending").toLowerCase();
  if (["approved", "pending", "rejected", "paused", "disabled"].includes(normalized)) return normalized;
  if (["in_appeal", "pending_deletion"].includes(normalized)) return "pending";
  return "sync_only";
}

function mapHeaderType(components: unknown[]) {
  const header = components.find((component) => cleanString((component as DbRow).type).toUpperCase() === "HEADER") as DbRow | undefined;
  if (!header) return "none";
  const format = cleanString(header.format, "text").toLowerCase();
  if (["text", "image", "video", "document"].includes(format)) return format;
  return "none";
}

function componentText(components: unknown[], type: string) {
  const component = components.find((item) => cleanString((item as DbRow).type).toUpperCase() === type) as DbRow | undefined;
  return cleanString(component?.text);
}

function componentButtons(components: unknown[]) {
  const component = components.find((item) => cleanString((item as DbRow).type).toUpperCase() === "BUTTONS") as DbRow | undefined;
  return asArray(component?.buttons);
}

function extractTemplateVariables(bodyText: string) {
  const found = new Set<string>();
  for (const match of bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    found.add(match[1]);
  }
  return [...found].sort((left, right) => Number(left) - Number(right));
}

function normalizeTemplateName(name: string) {
  return cleanString(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 512);
}

function buildTemplateComponents(input: CreateMetaWhatsAppTemplateInput) {
  const components: DbRow[] = [];
  const headerType = cleanString(input.headerType, "none") as CreateMetaWhatsAppTemplateInput["headerType"];
  const headerText = cleanString(input.headerText);

  if (headerType === "text" && headerText) {
    components.push({ type: "HEADER", format: "TEXT", text: headerText });
  }

  if (["image", "video", "document"].includes(headerType)) {
    const handle = cleanString(input.headerMediaHandle);
    if (!handle) {
      throw new Error("Header com midia exige um handle de exemplo da Meta. Use header texto por enquanto ou informe o media handle.");
    }
    components.push({
      type: "HEADER",
      format: headerType.toUpperCase(),
      example: { header_handle: [handle] },
    });
  }

  const bodyText = cleanString(input.bodyText);
  if (!bodyText) throw new Error("Informe o corpo do template.");

  const variables = extractTemplateVariables(bodyText);
  const bodyComponent: DbRow = { type: "BODY", text: bodyText };
  if (variables.length) {
    bodyComponent.example = {
      body_text: [
        variables.map((variable) => cleanString(input.variableExamples?.[variable], `exemplo ${variable}`)),
      ],
    };
  }
  components.push(bodyComponent);

  const footerText = cleanString(input.footerText);
  if (footerText) components.push({ type: "FOOTER", text: footerText });

  const buttons = (input.buttons || [])
    .map((button) => ({
      type: button.type,
      text: cleanString(button.text),
      url: cleanString(button.url),
      phone_number: cleanString(button.phoneNumber),
    }))
    .filter((button) => button.text && ((button.type === "URL" && button.url) || (button.type === "PHONE_NUMBER" && button.phone_number)))
    .map((button) => {
      if (button.type === "URL") return { type: "URL", text: button.text, url: button.url };
      return { type: "PHONE_NUMBER", text: button.text, phone_number: button.phone_number };
    });

  if (buttons.length) components.push({ type: "BUTTONS", buttons: buttons.slice(0, 3) });

  return { components, variables };
}

async function upsertTemplateFromMeta(input: {
  template: DbRow;
  managedFromPanel?: boolean;
  createdFromPanel?: boolean;
}) {
  const supabase = getSupabaseAdminClient();
  const config = await getMetaWhatsAppConfigInternal();
  if (!supabase) throw new Error("Supabase admin nao configurado.");

  const components = asArray(input.template.components);
  const name = normalizeTemplateName(cleanString(input.template.name));
  const language = cleanString(input.template.language, config.defaultLanguage);
  if (!name) throw new Error("Template Meta sem nome valido.");

  const { data: existing } = await supabase
    .from("meta_whatsapp_templates")
    .select("id,managed_from_panel,created_from_panel")
    .eq("waba_id", config.wabaId)
    .eq("name", name)
    .eq("language", language)
    .maybeSingle();
  const existingRow = existing as DbRow | null;
  const managedFromPanel = input.managedFromPanel === true || asBoolean(existingRow?.managed_from_panel);
  const createdFromPanel = input.createdFromPanel === true || asBoolean(existingRow?.created_from_panel);

  const payload = {
    waba_id: config.wabaId,
    meta_template_id: cleanString(input.template.id) || null,
    name,
    language,
    category: cleanString(input.template.category, "MARKETING").toUpperCase(),
    status: managedFromPanel ? mapTemplateStatus(input.template.status) : "sync_only",
    header_type: mapHeaderType(components),
    header_text: componentText(components, "HEADER"),
    body_text: componentText(components, "BODY"),
    footer_text: componentText(components, "FOOTER"),
    buttons: componentButtons(components),
    components,
    variables: extractTemplateVariables(componentText(components, "BODY")),
    managed_from_panel: managedFromPanel,
    created_from_panel: createdFromPanel,
    last_synced_at: new Date().toISOString(),
    raw_payload: input.template,
    rejection_reason: cleanString(input.template.rejected_reason, cleanString(input.template.rejection_reason)),
  };

  const { data, error } = await supabase
    .from("meta_whatsapp_templates")
    .upsert(payload, { onConflict: "waba_id,name,language" })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as DbRow;
}

export async function syncMetaWhatsAppSenders() {
  const supabase = getSupabaseAdminClient();
  const config = await getMetaWhatsAppConfigInternal();
  if (!supabase) throw new Error("Supabase admin nao configurado.");

  const payload = await metaFetch(config, `${config.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,status`);
  const rows = asArray(payload.data) as DbRow[];
  const now = new Date().toISOString();

  for (const row of rows) {
    const phoneNumberId = cleanString(row.id);
    if (!phoneNumberId) continue;
    await supabase.from("meta_whatsapp_senders").upsert(
      {
        waba_id: config.wabaId,
        phone_number_id: phoneNumberId,
        display_phone_number: cleanString(row.display_phone_number),
        verified_name: cleanString(row.verified_name),
        quality_rating: cleanString(row.quality_rating),
        messaging_limit_tier: cleanString(row.messaging_limit_tier),
        status: "active",
        is_default: phoneNumberId === config.phoneNumberId,
        last_synced_at: now,
        raw_payload: row,
      },
      { onConflict: "phone_number_id" }
    );
  }

  return { ok: true, synced: rows.length };
}

export async function syncMetaWhatsAppTemplates() {
  const config = await getMetaWhatsAppConfigInternal();
  const payload = await metaFetch(
    config,
    `${config.wabaId}/message_templates?fields=id,name,language,status,category,components,rejected_reason`
  );
  const rows = asArray(payload.data) as DbRow[];
  const synced: string[] = [];

  for (const row of rows) {
    const saved = await upsertTemplateFromMeta({ template: row });
    synced.push(cleanString(saved.id));
  }

  await syncMetaWhatsAppSenders().catch(() => null);
  return { ok: true, synced: synced.length, ids: synced };
}

export async function createMetaWhatsAppTemplate(input: CreateMetaWhatsAppTemplateInput) {
  const config = await getMetaWhatsAppConfigInternal();
  const name = normalizeTemplateName(input.name);
  if (!name) throw new Error("Nome do template invalido.");
  const language = cleanString(input.language, config.defaultLanguage);
  const category = cleanString(input.category, "MARKETING").toUpperCase();
  const { components, variables } = buildTemplateComponents(input);

  const response = await metaFetch(config, `${config.wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({
      name,
      language,
      category,
      components,
    }),
  });

  const template = {
    ...response,
    id: cleanString(response.id),
    name,
    language,
    category,
    status: cleanString(response.status, "pending"),
    components,
  };
  const saved = await upsertTemplateFromMeta({ template, managedFromPanel: true, createdFromPanel: true });
  return { ok: true, template: saved, variables };
}

export async function deleteMetaWhatsAppTemplate(input: { id: string }) {
  const supabase = getSupabaseAdminClient();
  const config = await getMetaWhatsAppConfigInternal();
  if (!supabase) throw new Error("Supabase admin nao configurado.");

  const { data, error } = await supabase
    .from("meta_whatsapp_templates")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (error) throw error;

  const template = data as DbRow | null;
  if (!template) throw new Error("Template nao encontrado.");

  if (asBoolean(template.managed_from_panel)) {
    const name = cleanString(template.name);
    const metaTemplateId = cleanString(template.meta_template_id);
    const query = new URLSearchParams();
    if (name) query.set("name", name);
    if (metaTemplateId) query.set("hsm_id", metaTemplateId);
    await metaFetch(config, `${config.wabaId}/message_templates?${query.toString()}`, { method: "DELETE" });
  }

  const { error: deleteError } = await supabase.from("meta_whatsapp_templates").delete().eq("id", input.id);
  if (deleteError) throw deleteError;
  return { ok: true };
}

export async function importMetaWhatsAppContactList(input: ImportMetaWhatsAppContactListInput) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase admin nao configurado.");

  const name = cleanString(input.name, "Lista Meta WhatsApp");
  const sourceFilename = cleanString(input.sourceFilename);
  const sourceType = cleanString(input.sourceType, "import");
  const optInSource = cleanString(input.optInSource, "upload_painel_meta_whatsapp");
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const validContacts: DbRow[] = [];
  let duplicateCount = 0;
  let invalidCount = 0;

  for (const row of input.rows) {
    const phone = normalizePhone(
      pickValue(row, ["whatsapp", "telefone", "celular", "phone", "mobile", "numero", "número", "contato"]) ||
        Object.values(row).find((value) => normalizePhone(value))
    );

    if (!phone) {
      invalidCount += 1;
      continue;
    }
    if (seen.has(phone)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(phone);

    validContacts.push({
      name: pickValue(row, ["nome", "name", "lead", "cliente", "contato"]),
      phone_e164: phone,
      email: pickValue(row, ["email", "e-mail", "mail"]),
      city: pickValue(row, ["cidade", "city", "municipio", "município"]),
      tags: tagsFromValue(pickValue(row, ["tags", "tag", "segmento", "segmentos"])),
      variables: variablesFromRow(row),
      opt_in_confirmed: input.optInConfirmed,
      opt_in_source: input.optInConfirmed ? optInSource : null,
      opt_in_at: input.optInConfirmed ? now : null,
      status: "valid",
      raw_payload: row,
    });
  }

  const { data: list, error: listError } = await supabase
    .from("meta_whatsapp_contact_lists")
    .insert({
      name,
      source_filename: sourceFilename,
      source_type: sourceType,
      opt_in_required: true,
      valid_count: validContacts.length,
      duplicate_count: duplicateCount,
      invalid_count: invalidCount,
      metadata: {
        opt_in_count: input.optInConfirmed ? validContacts.length : 0,
        imported_rows: input.rows.length,
      },
    })
    .select("*")
    .single();
  if (listError) throw listError;

  const listId = cleanString((list as DbRow).id);
  const contacts: DbRow[] = validContacts.map((contact) => ({ ...contact, list_id: listId }));
  await insertInChunks("meta_whatsapp_contact_list_contacts", contacts);

  if (input.optInConfirmed && contacts.length) {
    await insertInChunks(
      "meta_whatsapp_opt_ins",
      contacts.map((contact) => ({
        phone_e164: cleanString(contact.phone_e164),
        source: optInSource,
        source_reference: listId,
        consent_text: "Opt-in confirmado na importacao da lista pelo painel.",
        consent_at: now,
        metadata: { contact_list_id: listId, source_filename: sourceFilename },
      }))
    );
  }

  return {
    ok: true,
    listId,
    validCount: validContacts.length,
    duplicateCount,
    invalidCount,
    optInCount: input.optInConfirmed ? validContacts.length : 0,
  };
}

async function fetchAllListContacts(listId: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase admin nao configurado.");

  const rows: DbRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("meta_whatsapp_contact_list_contacts")
      .select("*")
      .eq("list_id", listId)
      .eq("status", "valid")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data || []) as DbRow[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function selectCampaignSender(senderId: string, config: MetaConfigInternal) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase admin nao configurado.");

  let query = supabase.from("meta_whatsapp_senders").select("*").eq("status", "active").limit(1);
  if (senderId) query = query.eq("id", senderId);
  else if (config.phoneNumberId) query = query.eq("phone_number_id", config.phoneNumberId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (data) return data as DbRow;

  const { data: fallback, error: fallbackError } = await supabase
    .from("meta_whatsapp_senders")
    .select("*")
    .eq("status", "active")
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fallbackError) throw fallbackError;
  if (!fallback) throw new Error("Nenhum numero oficial Meta ativo. Sincronize os numeros ou configure o Phone Number ID.");
  return fallback as DbRow;
}

export async function createMetaWhatsAppCampaign(input: CreateMetaWhatsAppCampaignInput) {
  const supabase = getSupabaseAdminClient();
  const config = await getMetaWhatsAppConfigInternal();
  if (!supabase) throw new Error("Supabase admin nao configurado.");

  const name = cleanString(input.name, "Campanha Meta WhatsApp");
  const templateId = cleanString(input.templateId);
  const contactListId = cleanString(input.contactListId);
  if (!templateId) throw new Error("Selecione um template aprovado.");
  if (!contactListId) throw new Error("Selecione uma lista de contatos.");

  const [{ data: template, error: templateError }, { data: list, error: listError }] = await Promise.all([
    supabase
      .from("meta_whatsapp_templates")
      .select("*")
      .eq("id", templateId)
      .eq("managed_from_panel", true)
      .eq("status", "approved")
      .maybeSingle(),
    supabase.from("meta_whatsapp_contact_lists").select("*").eq("id", contactListId).maybeSingle(),
  ]);
  if (templateError) throw templateError;
  if (listError) throw listError;
  if (!template) throw new Error("Template precisa estar aprovado e gerenciado pelo painel.");
  if (!list) throw new Error("Lista de contatos nao encontrada.");

  const sender = await selectCampaignSender(cleanString(input.senderId), config);
  const contacts = await fetchAllListContacts(contactListId);
  if (!contacts.length) throw new Error("A lista selecionada nao possui contatos validos.");

  const phones = contacts.map((contact) => cleanString(contact.phone_e164)).filter(Boolean);
  const { data: suppressed, error: suppressionError } = phones.length
    ? await supabase.from("meta_whatsapp_suppression_list").select("phone_e164").in("phone_e164", phones)
    : { data: [], error: null };
  if (suppressionError) throw suppressionError;
  const blockedPhones = new Set(((suppressed || []) as DbRow[]).map((row) => cleanString(row.phone_e164)));
  const requireOptIn = input.requireOptIn !== false;
  const eligible = contacts.filter((contact) => {
    const phone = cleanString(contact.phone_e164);
    if (!phone || blockedPhones.has(phone)) return false;
    if (requireOptIn && !asBoolean(contact.opt_in_confirmed)) return false;
    return true;
  });

  if (!eligible.length) {
    throw new Error("Nenhum contato elegivel. Confirme opt-in na lista ou desative a trava apenas para testes autorizados.");
  }

  const scheduledFor = cleanString(input.scheduledFor);
  const campaignStatus = scheduledFor ? "scheduled" : "draft";
  const recipientStatus = scheduledFor ? "scheduled" : "queued";
  const rateLimit = Math.max(1, Math.min(config.rateLimitPerMinute, asNumber(input.rateLimitPerMinute, config.rateLimitPerMinute)));
  const dailyLimit = Math.max(1, Math.min(config.dailyLimitPerNumber, asNumber(input.dailyLimitPerNumber, config.dailyLimitPerNumber)));
  const totals = {
    total: contacts.length,
    queued: eligible.length,
    skipped: contacts.length - eligible.length,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
  };

  const { data: campaign, error: campaignError } = await supabase
    .from("meta_whatsapp_campaigns")
    .insert({
      name,
      campaign_type: cleanString(input.campaignType, "marketing"),
      status: campaignStatus,
      sender_id: cleanString(sender.id),
      sender_pool: [cleanString(sender.id)],
      template_id: templateId,
      language: cleanString(input.language, cleanString((template as DbRow).language, config.defaultLanguage)),
      contact_list_id: contactListId,
      scheduled_for: scheduledFor || null,
      rate_limit_per_minute: rateLimit,
      daily_limit_per_number: dailyLimit,
      require_opt_in: requireOptIn,
      approval_status: "pending_review",
      totals,
      metadata: {
        template_name: cleanString((template as DbRow).name),
        contact_list_name: cleanString((list as DbRow).name),
        phone_number_id: cleanString(sender.phone_number_id),
        next_step: "Aprovacao humana antes da fila Inngest.",
      },
    })
    .select("*")
    .single();
  if (campaignError) throw campaignError;

  const campaignId = cleanString((campaign as DbRow).id);
  const templateVariables = asArray((template as DbRow).variables);
  const recipients = eligible.map((contact) => ({
    campaign_id: campaignId,
    contact_list_contact_id: cleanString(contact.id) || null,
    sender_id: cleanString(sender.id),
    phone_e164: cleanString(contact.phone_e164),
    name: cleanString(contact.name),
    variables: standardVariablesForContact(contact, templateVariables),
    opt_in_confirmed: asBoolean(contact.opt_in_confirmed),
    status: recipientStatus,
    payload: {
      template_name: cleanString((template as DbRow).name),
      language: cleanString((template as DbRow).language, config.defaultLanguage),
      components: asArray((template as DbRow).components),
    },
    scheduled_for: scheduledFor || null,
  }));
  await insertInChunks("meta_whatsapp_campaign_recipients", recipients);

  return {
    ok: true,
    campaignId,
    queued: recipients.length,
    skipped: totals.skipped,
    status: campaignStatus,
    approvalStatus: "pending_review",
  };
}

function emptyDashboard(source: MetaWhatsAppDashboardData["source"], reason?: string): MetaWhatsAppDashboardData {
  return {
    source,
    reason,
    generatedAt: new Date().toISOString(),
    config: {
      appId: "",
      appSecretConfigured: false,
      systemUserTokenConfigured: false,
      wabaId: "",
      phoneNumberId: "",
      webhookVerifyTokenConfigured: false,
      apiVersion: DEFAULT_API_VERSION,
      defaultLanguage: DEFAULT_LANGUAGE,
      rateLimitPerMinute: 60,
      dailyLimitPerNumber: 1000,
      configured: false,
    },
    metrics: [
      { label: "Campanhas", value: "0", detail: "oficial Meta", tone: "muted" },
      { label: "Destinatarios", value: "0", detail: "com opt-in", tone: "muted" },
      { label: "Entregues", value: "0", detail: "webhook Meta", tone: "muted" },
      { label: "Falhas", value: "0", detail: "sem eventos", tone: "muted" },
    ],
    campaigns: [],
    templates: [],
    senders: [],
    contactLists: [],
  };
}

export async function getMetaWhatsAppDashboardData(): Promise<MetaWhatsAppDashboardData> {
  const supabase = getSupabaseAdminClient();
  const config = await getMetaWhatsAppConfig();
  if (!supabase) {
    return { ...emptyDashboard("mock", "Supabase admin nao configurado."), config };
  }

  try {
    const [sendersResult, templatesResult, campaignsResult, recipientsResult, listsResult] = await Promise.all([
      supabase.from("meta_whatsapp_senders").select("*").order("updated_at", { ascending: false }).limit(20),
      supabase.from("meta_whatsapp_templates").select("*").eq("managed_from_panel", true).order("updated_at", { ascending: false }).limit(20),
      supabase.from("meta_whatsapp_campaigns").select("*").order("updated_at", { ascending: false }).limit(20),
      supabase.from("meta_whatsapp_campaign_recipients").select("status"),
      supabase.from("meta_whatsapp_contact_lists").select("*").order("updated_at", { ascending: false }).limit(12),
    ]);

    const firstError = [sendersResult.error, templatesResult.error, campaignsResult.error, recipientsResult.error, listsResult.error].find(Boolean);
    if (firstError) throw firstError;

    const recipientRows = ((recipientsResult.data || []) as DbRow[]);
    const countStatus = (status: string) => recipientRows.filter((row) => cleanString(row.status) === status).length;
    const sent = ["sent", "delivered", "read"].reduce((acc, status) => acc + countStatus(status), 0);
    const delivered = ["delivered", "read"].reduce((acc, status) => acc + countStatus(status), 0);
    const read = countStatus("read");
    const failed = countStatus("failed");

    return {
      source: "supabase",
      generatedAt: new Date().toISOString(),
      config,
      metrics: [
        { label: "Campanhas", value: String(((campaignsResult.data || []) as unknown[]).length), detail: "criadas no painel", tone: "purple" },
        { label: "Destinatarios", value: String(recipientRows.length), detail: "fila oficial", tone: "green" },
        { label: "Entregues", value: String(delivered), detail: `${sent} enviadas`, tone: "green" },
        { label: "Falhas", value: String(failed), detail: `${read} lidas`, tone: failed ? "red" : "muted" },
      ],
      campaigns: ((campaignsResult.data || []) as DbRow[]).map((row) => {
        const totals = asObject(row.totals);
        const metadata = asObject(row.metadata);
        return {
          id: cleanString(row.id),
          name: cleanString(row.name, "Campanha Meta WhatsApp"),
          campaignType: cleanString(row.campaign_type, "marketing"),
          status: cleanString(row.status, "draft"),
          approvalStatus: cleanString(row.approval_status, "draft"),
          sent: asNumber(totals.sent),
          delivered: asNumber(totals.delivered),
          read: asNumber(totals.read),
          failed: asNumber(totals.failed),
          queued: asNumber(totals.queued),
          skipped: asNumber(totals.skipped),
          total: asNumber(totals.total),
          scheduledFor: cleanString(row.scheduled_for),
          templateName: cleanString(metadata.template_name),
          contactListName: cleanString(metadata.contact_list_name),
          createdAt: cleanString(row.created_at),
        };
      }),
      templates: ((templatesResult.data || []) as DbRow[]).map((row) => ({
        id: cleanString(row.id),
        metaTemplateId: cleanString(row.meta_template_id),
        name: cleanString(row.name),
        language: cleanString(row.language, DEFAULT_LANGUAGE),
        status: cleanString(row.status, "draft"),
        managedFromPanel: asBoolean(row.managed_from_panel),
        category: cleanString(row.category, "MARKETING"),
        headerType: cleanString(row.header_type, "none"),
        headerText: cleanString(row.header_text),
        bodyText: cleanString(row.body_text),
        footerText: cleanString(row.footer_text),
        buttons: asArray(row.buttons),
        variables: asArray(row.variables),
        rejectionReason: cleanString(row.rejection_reason),
      })),
      senders: ((sendersResult.data || []) as DbRow[]).map((row) => ({
        id: cleanString(row.id),
        label: cleanString(row.verified_name, cleanString(row.display_phone_number, "Numero oficial")),
        phoneNumberId: cleanString(row.phone_number_id),
        displayPhoneNumber: cleanString(row.display_phone_number),
        status: cleanString(row.status, "active"),
        qualityRating: cleanString(row.quality_rating, "desconhecido"),
        isDefault: asBoolean(row.is_default),
      })),
      contactLists: ((listsResult.data || []) as DbRow[]).map((row) => {
        const metadata = asObject(row.metadata);
        return {
          id: cleanString(row.id),
          name: cleanString(row.name, "Lista Meta WhatsApp"),
          validCount: asNumber(row.valid_count),
          duplicateCount: asNumber(row.duplicate_count),
          invalidCount: asNumber(row.invalid_count),
          optInCount: asNumber(metadata.opt_in_count),
          sourceFilename: cleanString(row.source_filename),
          sourceType: cleanString(row.source_type, "import"),
          createdAt: cleanString(row.created_at),
        };
      }),
    };
  } catch (error) {
    if (tableMissing(error)) {
      return { ...emptyDashboard("migration_pending", "Migration Meta WhatsApp Oficial ainda nao aplicada no Supabase."), config };
    }
    return { ...emptyDashboard("mock", error instanceof Error ? error.message : "Falha ao carregar Meta WhatsApp."), config };
  }
}
