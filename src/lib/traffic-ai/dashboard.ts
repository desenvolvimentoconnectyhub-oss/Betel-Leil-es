import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type DbRow = Record<string, unknown>;

export type TrafficStatus = "ok" | "warning" | "missing" | "error";
export type TrafficTone = "green" | "yellow" | "red" | "purple" | "muted" | "cyan";

export type TrafficCredentialDefinition = {
  envName: string;
  configKey: string;
  label: string;
  secret?: boolean;
  required?: boolean;
};

export type TrafficConnectionDefinition = {
  id: string;
  title: string;
  provider: "meta" | "google" | "organic" | "multichannel" | "system";
  description: string;
  site: string;
  usedBy: string;
  credentials: TrafficCredentialDefinition[];
};

export type TrafficConnectionStatus = TrafficConnectionDefinition & {
  status: TrafficStatus;
  message: string;
  configuredRequired: number;
  requiredTotal: number;
};

export type TrafficAiMetric = {
  label: string;
  value: string;
  detail: string;
  tone: TrafficTone;
};

export type TrafficAiDashboardData = {
  source: "supabase" | "migration_pending" | "mock";
  reason?: string;
  generatedAt: string;
  moduleSlug: string;
  config: {
    readOnlyMode: boolean;
    requireHumanApproval: boolean;
    syncIntervalMinutes: number;
  };
  connections: TrafficConnectionStatus[];
  metrics: TrafficAiMetric[];
  accounts: Array<{
    id: string;
    provider: string;
    name: string;
    externalAccountId: string;
    status: string;
    currency: string;
    lastSyncedAt: string;
  }>;
  campaigns: Array<{
    id: string;
    provider: string;
    name: string;
    status: string;
    spend: number;
    leads: number;
    conversions: number;
    cpl: number;
    snapshotDate: string;
  }>;
  socialProfiles: Array<{
    id: string;
    provider: string;
    displayName: string;
    username: string;
    followerCount: number;
    status: string;
    lastSyncedAt: string;
  }>;
  recommendations: Array<{
    id: string;
    provider: string;
    priority: string;
    title: string;
    rationale: string;
    status: string;
    createdAt: string;
  }>;
  approvals: Array<{
    id: string;
    provider: string;
    actionType: string;
    status: string;
    createdAt: string;
  }>;
};

export const TRAFFIC_MODULE_SLUGS = [
  "meta-ads",
  "google-ads",
  "google-analytics",
  "trafego-organico",
  "caixa-meta",
  "criativos",
  "meta-whatsapp-chat",
] as const;

export const TRAFFIC_CONFIG_DEFAULTS: Record<string, string> = {
  traffic_ai_read_only_mode: "true",
  traffic_ai_require_human_approval: "true",
  traffic_ai_sync_interval_minutes: "60",
  meta_graph_api_version: "v26.0",
  google_ads_api_version: "v21",
  google_default_customer_timezone: "America/Sao_Paulo",
};

export const TRAFFIC_CONNECTION_DEFINITIONS: TrafficConnectionDefinition[] = [
  {
    id: "meta_ads",
    title: "Meta Ads",
    provider: "meta",
    site: "business.facebook.com",
    usedBy: "Meta Ads, criativos, publico, pixel, CAPI e relatorios IA",
    description: "Conta de anuncios da Meta para leitura de campanhas, custos, criativos e futuras otimizacoes aprovadas.",
    credentials: [
      { envName: "META_APP_ID", configKey: "meta_app_id", label: "Meta App ID" },
      { envName: "META_APP_SECRET", configKey: "meta_app_secret", label: "Meta App Secret", secret: true },
      { envName: "META_SYSTEM_USER_TOKEN", configKey: "meta_system_user_token", label: "Business/System User Token", secret: true, required: true },
      { envName: "META_BUSINESS_ID", configKey: "meta_business_id", label: "Business Manager ID", required: true },
      { envName: "META_AD_ACCOUNT_ID", configKey: "meta_ad_account_id", label: "Ad Account ID", required: true },
      { envName: "META_PIXEL_ID", configKey: "meta_pixel_id", label: "Pixel ID" },
      { envName: "META_DATASET_ID", configKey: "meta_dataset_id", label: "Dataset / CAPI ID" },
      { envName: "META_GRAPH_API_VERSION", configKey: "meta_graph_api_version", label: "Graph API Version", required: true },
    ],
  },
  {
    id: "meta_social",
    title: "Meta Social / Organico",
    provider: "meta",
    site: "developers.facebook.com",
    usedBy: "Facebook Page, Instagram, comentarios, inbox Meta e trafego organico",
    description: "Perfis sociais da Meta para posts, comentarios, DM, Messenger e analise organica.",
    credentials: [
      { envName: "META_SYSTEM_USER_TOKEN", configKey: "meta_system_user_token", label: "Business/System User Token", secret: true, required: true },
      { envName: "META_FACEBOOK_PAGE_ID", configKey: "meta_facebook_page_id", label: "Facebook Page ID", required: true },
      { envName: "META_INSTAGRAM_BUSINESS_ACCOUNT_ID", configKey: "meta_instagram_business_account_id", label: "Instagram Business Account ID", required: true },
      { envName: "META_GRAPH_API_VERSION", configKey: "meta_graph_api_version", label: "Graph API Version", required: true },
    ],
  },
  {
    id: "google_ads",
    title: "Google Ads",
    provider: "google",
    site: "ads.google.com",
    usedBy: "Campanhas Google Ads, keywords, conversoes e relatorios IA",
    description: "Credenciais OAuth e conta Google Ads para leitura de campanhas e futura gestao com aprovacao.",
    credentials: [
      { envName: "GOOGLE_ADS_DEVELOPER_TOKEN", configKey: "google_ads_developer_token", label: "Developer Token", secret: true, required: true },
      { envName: "GOOGLE_ADS_CLIENT_ID", configKey: "google_ads_client_id", label: "OAuth Client ID", required: true },
      { envName: "GOOGLE_ADS_CLIENT_SECRET", configKey: "google_ads_client_secret", label: "OAuth Client Secret", secret: true, required: true },
      { envName: "GOOGLE_ADS_REFRESH_TOKEN", configKey: "google_ads_refresh_token", label: "OAuth Refresh Token", secret: true, required: true },
      { envName: "GOOGLE_ADS_LOGIN_CUSTOMER_ID", configKey: "google_ads_login_customer_id", label: "Login Customer ID" },
      { envName: "GOOGLE_ADS_CUSTOMER_ID", configKey: "google_ads_customer_id", label: "Customer ID", required: true },
      { envName: "GOOGLE_ADS_API_VERSION", configKey: "google_ads_api_version", label: "Google Ads API Version" },
    ],
  },
  {
    id: "google_analytics",
    title: "Google Analytics 4",
    provider: "google",
    site: "analytics.google.com",
    usedBy: "GA4, eventos, UTMs, funil, origem de leads e auditoria de conversao",
    description: "Propriedade GA4 para cruzar trafego, comportamento, conversoes e leads do CRM.",
    credentials: [
      { envName: "GOOGLE_ADS_CLIENT_ID", configKey: "google_ads_client_id", label: "OAuth Client ID", required: true },
      { envName: "GOOGLE_ADS_CLIENT_SECRET", configKey: "google_ads_client_secret", label: "OAuth Client Secret", secret: true, required: true },
      { envName: "GOOGLE_ADS_REFRESH_TOKEN", configKey: "google_ads_refresh_token", label: "OAuth Refresh Token", secret: true, required: true },
      { envName: "GOOGLE_ANALYTICS_PROPERTY_ID", configKey: "google_analytics_property_id", label: "GA4 Property ID", required: true },
    ],
  },
  {
    id: "google_search_console",
    title: "Google Search Console",
    provider: "google",
    site: "search.google.com/search-console",
    usedBy: "SEO, trafego organico, paginas indexadas, consultas e conteudo IA",
    description: "Fonte organica para entender buscas, paginas, posicao media e oportunidades de SEO.",
    credentials: [
      { envName: "GOOGLE_ADS_CLIENT_ID", configKey: "google_ads_client_id", label: "OAuth Client ID", required: true },
      { envName: "GOOGLE_ADS_CLIENT_SECRET", configKey: "google_ads_client_secret", label: "OAuth Client Secret", secret: true, required: true },
      { envName: "GOOGLE_ADS_REFRESH_TOKEN", configKey: "google_ads_refresh_token", label: "OAuth Refresh Token", secret: true, required: true },
      { envName: "GOOGLE_SEARCH_CONSOLE_SITE_URL", configKey: "google_search_console_site_url", label: "Site URL", required: true },
    ],
  },
  {
    id: "google_business_profile",
    title: "Google Business Profile",
    provider: "google",
    site: "business.google.com",
    usedBy: "Perfil local, avaliacoes, posts, mensagens e reputacao organica",
    description: "Conexao para dados locais da Betel, reputacao, posts e sinais de descoberta no Google.",
    credentials: [
      { envName: "GOOGLE_ADS_CLIENT_ID", configKey: "google_ads_client_id", label: "OAuth Client ID", required: true },
      { envName: "GOOGLE_ADS_CLIENT_SECRET", configKey: "google_ads_client_secret", label: "OAuth Client Secret", secret: true, required: true },
      { envName: "GOOGLE_ADS_REFRESH_TOKEN", configKey: "google_ads_refresh_token", label: "OAuth Refresh Token", secret: true, required: true },
      { envName: "GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID", configKey: "google_business_profile_account_id", label: "Account ID", required: true },
      { envName: "GOOGLE_BUSINESS_PROFILE_LOCATION_ID", configKey: "google_business_profile_location_id", label: "Location ID", required: true },
    ],
  },
  {
    id: "traffic_ai_governance",
    title: "Governanca Trafego IA",
    provider: "system",
    site: "interno",
    usedBy: "Todas as automacoes de trafego pago, organico e multicanal",
    description: "Travas de seguranca para manter a IA em leitura e exigir aprovacao antes de alterar campanhas.",
    credentials: [
      { envName: "TRAFFIC_AI_READ_ONLY_MODE", configKey: "traffic_ai_read_only_mode", label: "Modo leitura" },
      { envName: "TRAFFIC_AI_REQUIRE_HUMAN_APPROVAL", configKey: "traffic_ai_require_human_approval", label: "Exigir aprovacao humana" },
      { envName: "TRAFFIC_AI_SYNC_INTERVAL_MINUTES", configKey: "traffic_ai_sync_interval_minutes", label: "Intervalo Inngest" },
    ],
  },
];

type TrafficAppConfig = Map<string, string>;

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  if (value === true || value === "true" || value === "1" || value === 1) return true;
  if (value === false || value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

function tableMissing(error: unknown) {
  const message = error instanceof Error ? error.message : cleanString((error as DbRow | null)?.message);
  return /relation .* does not exist|schema cache|Could not find the table|does not exist/i.test(message);
}

export function isTrafficAiModule(slug: string) {
  return (TRAFFIC_MODULE_SLUGS as readonly string[]).includes(slug);
}

export async function readTrafficAppConfig(): Promise<TrafficAppConfig> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return new Map();

  const { data, error } = await supabase.from("app_config").select("key,value");
  if (error || !data) return new Map();

  return new Map(
    ((data || []) as DbRow[])
      .map((row) => [cleanString(row.key).toLowerCase(), cleanString(row.value)] as const)
      .filter(([key]) => Boolean(key))
  );
}

export function resolveTrafficConfigValue(appConfig: TrafficAppConfig, envName: string, configKey?: string) {
  const key = cleanString(configKey || envName).toLowerCase();
  return appConfig.get(key) || cleanString(process.env[envName]) || TRAFFIC_CONFIG_DEFAULTS[key] || "";
}

export function getTrafficConnectionStatuses(appConfig: TrafficAppConfig): TrafficConnectionStatus[] {
  return TRAFFIC_CONNECTION_DEFINITIONS.map((definition) => {
    const required = definition.credentials.filter((credential) => credential.required);
    const configuredRequired = required.filter((credential) =>
      Boolean(resolveTrafficConfigValue(appConfig, credential.envName, credential.configKey))
    ).length;

    const status: TrafficStatus =
      configuredRequired === required.length ? "ok" : configuredRequired > 0 ? "warning" : "missing";

    return {
      ...definition,
      status,
      configuredRequired,
      requiredTotal: required.length,
      message:
        status === "ok"
          ? "Credenciais obrigatorias preenchidas."
          : status === "warning"
            ? "Conexao parcial. Complete os campos obrigatorios."
            : "Aguardando credenciais obrigatorias.",
    };
  });
}

function emptyDashboard(
  moduleSlug: string,
  source: TrafficAiDashboardData["source"],
  reason?: string
): TrafficAiDashboardData {
  const appConfig = new Map<string, string>();
  return {
    source,
    reason,
    generatedAt: new Date().toISOString(),
    moduleSlug,
    config: {
      readOnlyMode: true,
      requireHumanApproval: true,
      syncIntervalMinutes: 60,
    },
    connections: getTrafficConnectionStatuses(appConfig),
    metrics: [
      { label: "Conexoes", value: "0", detail: "aguardando credenciais", tone: "yellow" },
      { label: "Contas", value: "0", detail: "sem sync ainda", tone: "muted" },
      { label: "Campanhas", value: "0", detail: "sem snapshots", tone: "muted" },
      { label: "Aprovacoes", value: "0", detail: "fila vazia", tone: "green" },
    ],
    accounts: [],
    campaigns: [],
    socialProfiles: [],
    recommendations: [],
    approvals: [],
  };
}

function mapAccount(row: DbRow) {
  return {
    id: cleanString(row.id),
    provider: cleanString(row.provider, "-"),
    name: cleanString(row.name, "Conta sem nome"),
    externalAccountId: cleanString(row.external_account_id),
    status: cleanString(row.account_status, "unknown"),
    currency: cleanString(row.currency, "-"),
    lastSyncedAt: cleanString(row.last_synced_at),
  };
}

function mapCampaign(row: DbRow) {
  return {
    id: cleanString(row.id),
    provider: cleanString(row.provider, "-"),
    name: cleanString(row.name, "Campanha sem nome"),
    status: cleanString(row.status, "unknown"),
    spend: asNumber(row.spend),
    leads: asNumber(row.leads),
    conversions: asNumber(row.conversions),
    cpl: asNumber(row.cpl),
    snapshotDate: cleanString(row.snapshot_date),
  };
}

function mapSocialProfile(row: DbRow) {
  return {
    id: cleanString(row.id),
    provider: cleanString(row.provider, "-"),
    displayName: cleanString(row.display_name, "Perfil sem nome"),
    username: cleanString(row.username),
    followerCount: asNumber(row.follower_count),
    status: cleanString(row.status, "pending"),
    lastSyncedAt: cleanString(row.last_synced_at),
  };
}

function mapRecommendation(row: DbRow) {
  return {
    id: cleanString(row.id),
    provider: cleanString(row.provider, "all"),
    priority: cleanString(row.priority, "medium"),
    title: cleanString(row.title, "Recomendacao"),
    rationale: cleanString(row.rationale),
    status: cleanString(row.status, "open"),
    createdAt: cleanString(row.created_at),
  };
}

function mapApproval(row: DbRow) {
  return {
    id: cleanString(row.id),
    provider: cleanString(row.provider, "-"),
    actionType: cleanString(row.action_type, "-"),
    status: cleanString(row.status, "pending"),
    createdAt: cleanString(row.created_at),
  };
}

export async function getTrafficAiDashboardData(moduleSlug: string): Promise<TrafficAiDashboardData> {
  const supabase = getSupabaseAdminClient();
  const appConfig = await readTrafficAppConfig();
  const config = {
    readOnlyMode: asBoolean(resolveTrafficConfigValue(appConfig, "TRAFFIC_AI_READ_ONLY_MODE", "traffic_ai_read_only_mode"), true),
    requireHumanApproval: asBoolean(
      resolveTrafficConfigValue(appConfig, "TRAFFIC_AI_REQUIRE_HUMAN_APPROVAL", "traffic_ai_require_human_approval"),
      true
    ),
    syncIntervalMinutes: Math.max(
      5,
      asNumber(resolveTrafficConfigValue(appConfig, "TRAFFIC_AI_SYNC_INTERVAL_MINUTES", "traffic_ai_sync_interval_minutes"), 60)
    ),
  };
  const connections = getTrafficConnectionStatuses(appConfig);

  if (!supabase) {
    return {
      ...emptyDashboard(moduleSlug, "mock", "Supabase admin nao configurado."),
      config,
      connections,
    };
  }

  try {
    const [
      accountsResult,
      campaignsResult,
      profilesResult,
      recommendationsResult,
      approvalsResult,
    ] = await Promise.all([
      supabase.from("traffic_ad_accounts").select("*").order("updated_at", { ascending: false }).limit(20),
      supabase.from("traffic_campaign_snapshots").select("*").order("snapshot_date", { ascending: false }).order("spend", { ascending: false }).limit(30),
      supabase.from("traffic_social_profiles").select("*").order("updated_at", { ascending: false }).limit(20),
      supabase.from("traffic_ai_recommendations").select("*").order("updated_at", { ascending: false }).limit(20),
      supabase.from("traffic_action_approvals").select("*").order("updated_at", { ascending: false }).limit(20),
    ]);

    const firstError = [
      accountsResult.error,
      campaignsResult.error,
      profilesResult.error,
      recommendationsResult.error,
      approvalsResult.error,
    ].find(Boolean);
    if (firstError) throw firstError;

    const accounts = ((accountsResult.data || []) as DbRow[]).map(mapAccount);
    const campaigns = ((campaignsResult.data || []) as DbRow[]).map(mapCampaign);
    const socialProfiles = ((profilesResult.data || []) as DbRow[]).map(mapSocialProfile);
    const recommendations = ((recommendationsResult.data || []) as DbRow[]).map(mapRecommendation);
    const approvals = ((approvalsResult.data || []) as DbRow[]).map(mapApproval);
    const configured = connections.filter((connection) => connection.status === "ok").length;
    const spend = campaigns.reduce((acc, campaign) => acc + campaign.spend, 0);
    const leads = campaigns.reduce((acc, campaign) => acc + campaign.leads, 0);
    const pendingApprovals = approvals.filter((approval) => approval.status === "pending").length;

    return {
      source: "supabase",
      generatedAt: new Date().toISOString(),
      moduleSlug,
      config,
      connections,
      metrics: [
        { label: "Conexoes", value: `${configured}/${connections.length}`, detail: "credenciais obrigatorias", tone: configured ? "green" : "yellow" },
        { label: "Contas", value: String(accounts.length), detail: "Meta/Google sincronizadas", tone: accounts.length ? "green" : "muted" },
        { label: "Campanhas", value: String(campaigns.length), detail: `R$ ${spend.toFixed(2)} em snapshots`, tone: campaigns.length ? "purple" : "muted" },
        { label: "Aprovacoes", value: String(pendingApprovals), detail: leads ? `${leads} leads atribuidos` : "fila de acoes IA", tone: pendingApprovals ? "yellow" : "green" },
      ],
      accounts,
      campaigns,
      socialProfiles,
      recommendations,
      approvals,
    };
  } catch (error) {
    if (tableMissing(error)) {
      return {
        ...emptyDashboard(moduleSlug, "migration_pending", "Migration Trafego IA ainda nao aplicada no Supabase."),
        config,
        connections,
      };
    }

    return {
      ...emptyDashboard(moduleSlug, "mock", error instanceof Error ? error.message : "Falha ao carregar Trafego IA."),
      config,
      connections,
    };
  }
}
