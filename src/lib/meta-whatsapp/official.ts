import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type DbRow = Record<string, unknown>;

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
  campaigns: Array<{ id: string; name: string; status: string; sent: number; delivered: number; read: number; failed: number; scheduledFor: string }>;
  templates: Array<{ id: string; name: string; language: string; status: string; managedFromPanel: boolean; category: string }>;
  senders: Array<{ id: string; label: string; phoneNumberId: string; status: string; qualityRating: string; isDefault: boolean }>;
  contactLists: Array<{ id: string; name: string; validCount: number; duplicateCount: number; invalidCount: number }>;
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

function tableMissing(error: unknown) {
  const message = error instanceof Error ? error.message : cleanString((error as DbRow | null)?.message);
  return /relation .* does not exist|schema cache|Could not find the table|does not exist/i.test(message);
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

export async function getMetaWhatsAppConfig(): Promise<MetaWhatsAppConfig> {
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
    appSecretConfigured: Boolean(appSecret),
    systemUserTokenConfigured: Boolean(systemUserToken),
    wabaId,
    phoneNumberId,
    webhookVerifyTokenConfigured: Boolean(webhookVerifyToken),
    apiVersion,
    defaultLanguage,
    rateLimitPerMinute,
    dailyLimitPerNumber,
    configured: Boolean(systemUserToken && wabaId && phoneNumberId && webhookVerifyToken),
  };
}

export async function getMetaWhatsAppWebhookSecrets() {
  const config = await readAppConfig();
  return {
    verifyToken: valueFor(config, "meta_webhook_verify_token", "META_WEBHOOK_VERIFY_TOKEN"),
    appSecret: valueFor(config, "meta_app_secret", "META_APP_SECRET"),
  };
}

export async function testMetaWhatsAppConnection() {
  const rawConfig = await readAppConfig();
  const token = valueFor(rawConfig, "meta_system_user_token", "META_SYSTEM_USER_TOKEN");
  const wabaId = valueFor(rawConfig, "meta_waba_id", "META_WABA_ID");
  const apiVersion = valueFor(rawConfig, "meta_graph_api_version", "META_GRAPH_API_VERSION", DEFAULT_API_VERSION);
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
        const totals = row.totals && typeof row.totals === "object" ? row.totals as DbRow : {};
        return {
          id: cleanString(row.id),
          name: cleanString(row.name, "Campanha Meta WhatsApp"),
          status: cleanString(row.status, "draft"),
          sent: asNumber(totals.sent),
          delivered: asNumber(totals.delivered),
          read: asNumber(totals.read),
          failed: asNumber(totals.failed),
          scheduledFor: cleanString(row.scheduled_for),
        };
      }),
      templates: ((templatesResult.data || []) as DbRow[]).map((row) => ({
        id: cleanString(row.id),
        name: cleanString(row.name),
        language: cleanString(row.language, DEFAULT_LANGUAGE),
        status: cleanString(row.status, "draft"),
        managedFromPanel: asBoolean(row.managed_from_panel),
        category: cleanString(row.category, "MARKETING"),
      })),
      senders: ((sendersResult.data || []) as DbRow[]).map((row) => ({
        id: cleanString(row.id),
        label: cleanString(row.verified_name, cleanString(row.display_phone_number, "Numero oficial")),
        phoneNumberId: cleanString(row.phone_number_id),
        status: cleanString(row.status, "active"),
        qualityRating: cleanString(row.quality_rating, "desconhecido"),
        isDefault: asBoolean(row.is_default),
      })),
      contactLists: ((listsResult.data || []) as DbRow[]).map((row) => ({
        id: cleanString(row.id),
        name: cleanString(row.name, "Lista Meta WhatsApp"),
        validCount: asNumber(row.valid_count),
        duplicateCount: asNumber(row.duplicate_count),
        invalidCount: asNumber(row.invalid_count),
      })),
    };
  } catch (error) {
    if (tableMissing(error)) {
      return { ...emptyDashboard("migration_pending", "Migration Meta WhatsApp Oficial ainda nao aplicada no Supabase."), config };
    }
    return { ...emptyDashboard("mock", error instanceof Error ? error.message : "Falha ao carregar Meta WhatsApp."), config };
  }
}
