import { NextRequest, NextResponse } from "next/server";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai/config";
import { GECKO_API_DEFAULT_BASE_URL, testGeckoApiConnection } from "@/lib/geckoapi/client";
import { testMetaWhatsAppConnection } from "@/lib/meta-whatsapp/official";
import { TRAFFIC_CONFIG_DEFAULTS } from "@/lib/traffic-ai/dashboard";
import { testElevenLabsConnection } from "@/lib/voice/elevenlabs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TestResult = {
  success: boolean;
  integration: string;
  message: string;
  latencyMs: number;
};

type MaintenanceAppConfig = Map<string, string>;

const DEFAULT_CONFIG_VALUES: Record<string, string> = {
  betel_datajud_api_base_url: "https://api-publica.datajud.cnj.jus.br",
  betel_ibge_api_base_url: "https://servicodados.ibge.gov.br/api/v1/localidades",
  betel_receitaws_api_base_url: "https://www.receitaws.com.br/v1/cnpj",
  betel_brasilapi_base_url: "https://brasilapi.com.br/api",
  betel_viacep_base_url: "https://viacep.com.br/ws",
  betel_dadosgov_api_base_url: "https://dados.gov.br/dados/api/publico",
  betel_spu_imoveis_base_url: "https://imoveis.economia.gov.br",
  betel_sncr_base_url: "https://sncr.serpro.gov.br/sncr-web",
  betel_bcb_imoveis_api_base_url: "https://dadosabertos.bcb.gov.br/api/3/action",
  betel_nominatim_api_base_url: "https://nominatim.openstreetmap.org",
  betel_geckoapi_api_base_url: GECKO_API_DEFAULT_BASE_URL,
  meta_graph_api_version: "v26.0",
  meta_default_language: "pt_BR",
  meta_rate_limit_per_minute: "60",
  meta_daily_limit_per_number: "1000",
  ...TRAFFIC_CONFIG_DEFAULTS,
};

function cleanConfigValue(value: unknown) {
  return String(value || "").trim();
}

async function readMaintenanceAppConfig(): Promise<MaintenanceAppConfig> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return new Map();

  const { data, error } = await supabase
    .from("app_config")
    .select("key,value");

  if (error || !data) return new Map();

  return new Map(
    data
      .map((row) => [cleanConfigValue(row.key).toLowerCase(), cleanConfigValue(row.value)] as const)
      .filter(([key, value]) => Boolean(key && value))
  );
}

function configKeyFor(name: string) {
  return cleanConfigValue(name).toLowerCase();
}

function resolveConfigValue(appConfig: MaintenanceAppConfig, name: string) {
  const key = configKeyFor(name);
  return appConfig.get(key) || cleanConfigValue(process.env[name]) || DEFAULT_CONFIG_VALUES[key] || "";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function readJsonPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { response: text.slice(0, 240) };
  }
}

function formatConnectyHubFailure(status: number, payload: unknown) {
  const data = asRecord(payload);
  const error = asRecord(data.error);
  const code = cleanConfigValue(error.code || data.code);
  const message = cleanConfigValue(error.message || data.message || data.error || data.response);
  const detail = [code, message].filter(Boolean).join(": ");

  return detail
    ? `ConnectyHub retornou ${status} - ${detail}.`
    : `ConnectyHub retornou ${status}.`;
}

async function testSupabase(): Promise<TestResult> {
  const start = Date.now();
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return { success: false, integration: "supabase", message: "Cliente admin indisponivel. Verifique URL e Service Role Key no .env.", latencyMs: Date.now() - start };
  }

  const { error } = await supabase.from("app_config").select("key").limit(1);
  const latencyMs = Date.now() - start;

  if (error) {
    return { success: false, integration: "supabase", message: `Erro: ${error.message}`, latencyMs };
  }

  return { success: true, integration: "supabase", message: `Conexao ativa. Resposta em ${latencyMs}ms.`, latencyMs };
}

async function testR2(): Promise<TestResult> {
  const start = Date.now();
  const appConfig = await readMaintenanceAppConfig();
  const endpoint = resolveConfigValue(appConfig, "R2_ENDPOINT");
  const accessKey = resolveConfigValue(appConfig, "R2_ACCESS_KEY_ID");
  const secretKey = resolveConfigValue(appConfig, "R2_SECRET_ACCESS_KEY");
  const publicBucket = resolveConfigValue(appConfig, "R2_PUBLIC_BUCKET_NAME");

  if (!endpoint || !accessKey || !secretKey || !publicBucket) {
    return { success: false, integration: "r2", message: "Credenciais R2 incompletas.", latencyMs: Date.now() - start };
  }

  try {
    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });

    await client.send(new HeadBucketCommand({ Bucket: publicBucket }));
    const latencyMs = Date.now() - start;
    return { success: true, integration: "r2", message: `Bucket "${publicBucket}" acessivel. Resposta em ${latencyMs}ms.`, latencyMs };
  } catch (error: unknown) {
    return { success: false, integration: "r2", message: error instanceof Error ? error.message : "Falha ao conectar R2.", latencyMs: Date.now() - start };
  }
}

async function testInngest(): Promise<TestResult> {
  const start = Date.now();
  const appConfig = await readMaintenanceAppConfig();
  const appId = resolveConfigValue(appConfig, "INNGEST_APP_ID");
  const eventKey = resolveConfigValue(appConfig, "INNGEST_EVENT_KEY");

  if (!appId || !eventKey) {
    return { success: false, integration: "inngest", message: "INNGEST_APP_ID ou INNGEST_EVENT_KEY ausente.", latencyMs: Date.now() - start };
  }

  return { success: true, integration: "inngest", message: `App "${appId}" configurado. Chaves presentes.`, latencyMs: Date.now() - start };
}

async function testConnectyHub(): Promise<TestResult> {
  const start = Date.now();
  const appConfig = await readMaintenanceAppConfig();
  const baseUrl = resolveConfigValue(appConfig, "CONNECTYHUB_API_URL");
  const token = resolveConfigValue(appConfig, "CONNECTYHUB_API_TOKEN");

  if (!baseUrl || !token) {
    return { success: false, integration: "connectyhub", message: "CONNECTYHUB_API_URL ou CONNECTYHUB_API_TOKEN ausente.", latencyMs: Date.now() - start };
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/instances`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-connectyhub-api-key": token,
      },
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { success: true, integration: "connectyhub", message: `ConnectyHub respondeu. Resposta em ${latencyMs}ms.`, latencyMs };
    }

    const payload = await readJsonPayload(res);
    return { success: false, integration: "connectyhub", message: formatConnectyHubFailure(res.status, payload), latencyMs };
  } catch (error: unknown) {
    return { success: false, integration: "connectyhub", message: error instanceof Error ? error.message : "Falha ao conectar ConnectyHub.", latencyMs: Date.now() - start };
  }
}

async function testGemini(): Promise<TestResult> {
  const start = Date.now();
  const [apiKey, model] = await Promise.all([getGeminiApiKey(), getGeminiModel()]);

  if (!apiKey) {
    return { success: false, integration: "gemini", message: "API key Gemini nao configurada.", latencyMs: Date.now() - start };
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Responda apenas OK" }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 5 },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { success: true, integration: "gemini", message: `Gemini "${model}" respondeu OK. Resposta em ${latencyMs}ms.`, latencyMs };
    }

    const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
    return { success: false, integration: "gemini", message: data?.error?.message || `Gemini retornou ${res.status}.`, latencyMs };
  } catch (error: unknown) {
    return { success: false, integration: "gemini", message: error instanceof Error ? error.message : "Falha ao conectar Gemini.", latencyMs: Date.now() - start };
  }
}

async function testResend(): Promise<TestResult> {
  const start = Date.now();
  const appConfig = await readMaintenanceAppConfig();
  const apiKey = resolveConfigValue(appConfig, "RESEND_API_KEY");
  const emailFrom = resolveConfigValue(appConfig, "BETEL_EMAIL_FROM");
  if (!apiKey || !emailFrom) {
    return { success: false, integration: "resend", message: "RESEND_API_KEY ou BETEL_EMAIL_FROM ausente.", latencyMs: Date.now() - start };
  }
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { success: true, integration: "resend", message: `Resend API respondeu OK. Resposta em ${latencyMs}ms.`, latencyMs };
    }
    return { success: false, integration: "resend", message: `Resend retornou ${res.status}.`, latencyMs };
  } catch (error: unknown) {
    return { success: false, integration: "resend", message: error instanceof Error ? error.message : "Falha ao conectar Resend.", latencyMs: Date.now() - start };
  }
}

async function testMetaAds(): Promise<TestResult> {
  const start = Date.now();
  const appConfig = await readMaintenanceAppConfig();
  const token = resolveConfigValue(appConfig, "META_SYSTEM_USER_TOKEN");
  const adAccountId = resolveConfigValue(appConfig, "META_AD_ACCOUNT_ID").replace(/^act_/, "");
  const apiVersion = resolveConfigValue(appConfig, "META_GRAPH_API_VERSION") || "v26.0";

  if (!token || !adAccountId) {
    return {
      success: false,
      integration: "meta_ads",
      message: "Informe META_SYSTEM_USER_TOKEN e META_AD_ACCOUNT_ID para testar Meta Ads.",
      latencyMs: Date.now() - start,
    };
  }

  try {
    const url = new URL(`https://graph.facebook.com/${apiVersion}/act_${adAccountId}`);
    url.searchParams.set("fields", "id,name,account_status,currency,timezone_name");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - start;
    const data = await res.json().catch(() => ({})) as { name?: string; error?: { message?: string } };

    if (!res.ok) {
      return {
        success: false,
        integration: "meta_ads",
        message: data.error?.message || `Meta Ads retornou ${res.status}.`,
        latencyMs,
      };
    }

    return {
      success: true,
      integration: "meta_ads",
      message: `Meta Ads respondeu para ${data.name || `act_${adAccountId}`}. Resposta em ${latencyMs}ms.`,
      latencyMs,
    };
  } catch (error: unknown) {
    return {
      success: false,
      integration: "meta_ads",
      message: error instanceof Error ? error.message : "Falha ao conectar Meta Ads.",
      latencyMs: Date.now() - start,
    };
  }
}

async function testMetaSocial(): Promise<TestResult> {
  const start = Date.now();
  const appConfig = await readMaintenanceAppConfig();
  const token = resolveConfigValue(appConfig, "META_SYSTEM_USER_TOKEN");
  const pageId = resolveConfigValue(appConfig, "META_FACEBOOK_PAGE_ID");
  const instagramId = resolveConfigValue(appConfig, "META_INSTAGRAM_BUSINESS_ACCOUNT_ID");
  const apiVersion = resolveConfigValue(appConfig, "META_GRAPH_API_VERSION") || "v26.0";

  if (!token || !pageId || !instagramId) {
    return {
      success: false,
      integration: "meta_social",
      message: "Informe token, Facebook Page ID e Instagram Business Account ID.",
      latencyMs: Date.now() - start,
    };
  }

  try {
    const pageUrl = new URL(`https://graph.facebook.com/${apiVersion}/${pageId}`);
    pageUrl.searchParams.set("fields", "id,name,instagram_business_account");
    const igUrl = new URL(`https://graph.facebook.com/${apiVersion}/${instagramId}`);
    igUrl.searchParams.set("fields", "id,username,name");
    const [pageRes, igRes] = await Promise.all([
      fetch(pageUrl, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }),
      fetch(igUrl, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }),
    ]);
    const latencyMs = Date.now() - start;
    const pageData = await pageRes.json().catch(() => ({})) as { name?: string; error?: { message?: string } };
    const igData = await igRes.json().catch(() => ({})) as { username?: string; error?: { message?: string } };

    if (!pageRes.ok || !igRes.ok) {
      return {
        success: false,
        integration: "meta_social",
        message: pageData.error?.message || igData.error?.message || `Meta Social retornou ${pageRes.status}/${igRes.status}.`,
        latencyMs,
      };
    }

    return {
      success: true,
      integration: "meta_social",
      message: `Meta Social respondeu: ${pageData.name || pageId} / ${igData.username || instagramId}.`,
      latencyMs,
    };
  } catch (error: unknown) {
    return {
      success: false,
      integration: "meta_social",
      message: error instanceof Error ? error.message : "Falha ao conectar Meta Social.",
      latencyMs: Date.now() - start,
    };
  }
}

async function testGoogleOAuth(
  integration: string,
  label: string,
  requiredVars: string[]
): Promise<TestResult> {
  const start = Date.now();
  const appConfig = await readMaintenanceAppConfig();
  const missing = requiredVars.filter((name) => !resolveConfigValue(appConfig, name));

  if (missing.length > 0) {
    return {
      success: false,
      integration,
      message: `Variavel(is) ausente(s): ${missing.join(", ")}`,
      latencyMs: Date.now() - start,
    };
  }

  const clientId = resolveConfigValue(appConfig, "GOOGLE_ADS_CLIENT_ID");
  const clientSecret = resolveConfigValue(appConfig, "GOOGLE_ADS_CLIENT_SECRET");
  const refreshToken = resolveConfigValue(appConfig, "GOOGLE_ADS_REFRESH_TOKEN");

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - start;
    const data = await res.json().catch(() => ({})) as { error_description?: string; error?: string; expires_in?: number };

    if (!res.ok) {
      return {
        success: false,
        integration,
        message: data.error_description || data.error || `Google OAuth retornou ${res.status}.`,
        latencyMs,
      };
    }

    return {
      success: true,
      integration,
      message: `${label}: OAuth respondeu e gerou access token temporario (${data.expires_in || "-"}s).`,
      latencyMs,
    };
  } catch (error: unknown) {
    return {
      success: false,
      integration,
      message: error instanceof Error ? error.message : `Falha ao conectar ${label}.`,
      latencyMs: Date.now() - start,
    };
  }
}

function testTrafficGovernance(): () => Promise<TestResult> {
  return async () => {
    const start = Date.now();
    const appConfig = await readMaintenanceAppConfig();
    const readOnly = resolveConfigValue(appConfig, "TRAFFIC_AI_READ_ONLY_MODE");
    const approval = resolveConfigValue(appConfig, "TRAFFIC_AI_REQUIRE_HUMAN_APPROVAL");
    const interval = resolveConfigValue(appConfig, "TRAFFIC_AI_SYNC_INTERVAL_MINUTES");

    return {
      success: true,
      integration: "traffic_ai_governance",
      message: `Governanca configurada: modo leitura=${readOnly || "true"}, aprovacao humana=${approval || "true"}, sync=${interval || "60"}min.`,
      latencyMs: Date.now() - start,
    };
  };
}

async function testElevenLabs(): Promise<TestResult> {
  const start = Date.now();
  try {
    const subscription = await testElevenLabsConnection();
    const latencyMs = Date.now() - start;
    const usage =
      subscription.characterLimit === null
        ? `${subscription.characterCount} caracteres usados`
        : `${subscription.characterCount}/${subscription.characterLimit} caracteres`;

    return {
      success: true,
      integration: "elevenlabs",
      message: `ElevenLabs respondeu. Plano ${subscription.tier}; ${usage}.`,
      latencyMs,
    };
  } catch (error: unknown) {
    return {
      success: false,
      integration: "elevenlabs",
      message: error instanceof Error ? error.message : "Falha ao conectar ElevenLabs.",
      latencyMs: Date.now() - start,
    };
  }
}

async function testIbge(): Promise<TestResult> {
  const start = Date.now();
  const appConfig = await readMaintenanceAppConfig();
  const baseUrl = resolveConfigValue(appConfig, "BETEL_IBGE_API_BASE_URL");
  try {
    const res = await fetch(`${baseUrl}/estados?orderBy=nome`, { signal: AbortSignal.timeout(10000) });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { success: true, integration: "ibge", message: `IBGE API respondeu OK (${latencyMs}ms). API publica, sem chave necessaria.`, latencyMs };
    }
    return { success: false, integration: "ibge", message: `IBGE retornou ${res.status}.`, latencyMs };
  } catch (error: unknown) {
    return { success: false, integration: "ibge", message: error instanceof Error ? error.message : "Falha ao conectar IBGE.", latencyMs: Date.now() - start };
  }
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function testPublicGet(
  integration: string,
  label: string,
  url: string,
  init?: RequestInit,
): Promise<TestResult> {
  const start = Date.now();
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json,text/html;q=0.9,*/*;q=0.8");
  }

  try {
    const res = await fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { success: true, integration, message: `${label} respondeu OK (${latencyMs}ms).`, latencyMs };
    }

    return { success: false, integration, message: `${label} retornou ${res.status}.`, latencyMs };
  } catch (error: unknown) {
    return { success: false, integration, message: error instanceof Error ? error.message : `Falha ao conectar ${label}.`, latencyMs: Date.now() - start };
  }
}

async function testBrasilApi(): Promise<TestResult> {
  const appConfig = await readMaintenanceAppConfig();
  const baseUrl = resolveConfigValue(appConfig, "BETEL_BRASILAPI_BASE_URL");
  return testPublicGet("brasilapi", "BrasilAPI", joinUrl(baseUrl, "ibge/uf/v1"));
}

async function testViaCep(): Promise<TestResult> {
  const appConfig = await readMaintenanceAppConfig();
  const baseUrl = resolveConfigValue(appConfig, "BETEL_VIACEP_BASE_URL");
  return testPublicGet("viacep", "ViaCEP", joinUrl(baseUrl, "01001000/json/"));
}

async function testDadosGov(): Promise<TestResult> {
  const start = Date.now();
  const appConfig = await readMaintenanceAppConfig();
  const baseUrl = resolveConfigValue(appConfig, "BETEL_DADOSGOV_API_BASE_URL");
  const token = resolveConfigValue(appConfig, "BETEL_DADOSGOV_API_TOKEN");

  if (!token) {
    return {
      success: false,
      integration: "dadosgov",
      message: "Token consumidor do Dados.gov.br pendente. Gere o token no portal para ativar a busca.",
      latencyMs: Date.now() - start,
    };
  }

  return testPublicGet(
    "dadosgov",
    "Dados.gov.br",
    joinUrl(baseUrl, "conjuntos-dados?nomeConjuntoDados=imoveis&isPrivado=false&pagina=1"),
    { headers: { "chave-api-dados-abertos": token } }
  );
}

async function testSpuImoveis(): Promise<TestResult> {
  const appConfig = await readMaintenanceAppConfig();
  const baseUrl = resolveConfigValue(appConfig, "BETEL_SPU_IMOVEIS_BASE_URL");
  return testPublicGet("spu_imoveis", "SPU / Imoveis da Uniao", baseUrl);
}

async function testSncr(): Promise<TestResult> {
  const appConfig = await readMaintenanceAppConfig();
  const baseUrl = resolveConfigValue(appConfig, "BETEL_SNCR_BASE_URL");
  return testPublicGet("sncr", "SNCR Rural", joinUrl(baseUrl, "consultaPublica.jsf"));
}

async function testBcbImoveis(): Promise<TestResult> {
  const appConfig = await readMaintenanceAppConfig();
  const baseUrl = resolveConfigValue(appConfig, "BETEL_BCB_IMOVEIS_API_BASE_URL");
  return testPublicGet("bcb_imoveis", "BCB Mercado Imobiliario", joinUrl(baseUrl, "package_show?id=informacoes-do-mercado-imobiliario"));
}

async function testNominatim(): Promise<TestResult> {
  const appConfig = await readMaintenanceAppConfig();
  const baseUrl = resolveConfigValue(appConfig, "BETEL_NOMINATIM_API_BASE_URL");
  return testPublicGet(
    "nominatim",
    "OpenStreetMap / Nominatim",
    joinUrl(baseUrl, "search?format=json&q=Sao%20Paulo%20SP&limit=1"),
    { headers: { "User-Agent": "BetelAI/1.0 maintenance-check", "Accept-Language": "pt-BR,pt;q=0.9" } }
  );
}

function testEnvOnly(id: string, label: string, vars: string[]): () => Promise<TestResult> {
  return async () => {
    const start = Date.now();
    const appConfig = await readMaintenanceAppConfig();
    const missing = vars.filter((v) => !resolveConfigValue(appConfig, v));
    if (missing.length > 0) {
      return { success: false, integration: id, message: `Variavel(is) ausente(s): ${missing.join(", ")}`, latencyMs: Date.now() - start };
    }
    return { success: true, integration: id, message: `${label} — chaves configuradas.`, latencyMs: Date.now() - start };
  };
}

const testMap: Record<string, () => Promise<TestResult>> = {
  supabase: testSupabase,
  r2: testR2,
  inngest: testInngest,
  connectyhub: testConnectyHub,
  meta_whatsapp: testMetaWhatsAppConnection,
  meta_ads: testMetaAds,
  meta_social: testMetaSocial,
  google_ads: () => testGoogleOAuth("google_ads", "Google Ads", [
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
    "GOOGLE_ADS_CUSTOMER_ID",
  ]),
  google_analytics: () => testGoogleOAuth("google_analytics", "Google Analytics", [
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
    "GOOGLE_ANALYTICS_PROPERTY_ID",
  ]),
  google_search_console: () => testGoogleOAuth("google_search_console", "Google Search Console", [
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
    "GOOGLE_SEARCH_CONSOLE_SITE_URL",
  ]),
  google_business_profile: () => testGoogleOAuth("google_business_profile", "Google Business Profile", [
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
    "GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID",
    "GOOGLE_BUSINESS_PROFILE_LOCATION_ID",
  ]),
  traffic_ai_governance: testTrafficGovernance(),
  gemini: testGemini,
  resend: testResend,
  elevenlabs: testElevenLabs,
  geckoapi: testGeckoApiConnection,
  ibge: testIbge,
  brasilapi: testBrasilApi,
  viacep: testViaCep,
  dadosgov: testDadosGov,
  spu_imoveis: testSpuImoveis,
  sncr: testSncr,
  bcb_imoveis: testBcbImoveis,
  nominatim: testNominatim,
  datazap: testEnvOnly("datazap", "DataZAP+", ["BETEL_DATAZAP_API_BASE_URL", "BETEL_DATAZAP_API_KEY"]),
  fipezap: testEnvOnly("fipezap", "FipeZAP", ["BETEL_FIPEZAP_API_BASE_URL", "BETEL_FIPEZAP_API_KEY"]),
  datajud: testEnvOnly("datajud", "CNJ DataJud", ["BETEL_DATAJUD_API_BASE_URL", "BETEL_DATAJUD_API_KEY"]),
  receitaws: testEnvOnly("receitaws", "ReceitaWS", ["BETEL_RECEITAWS_API_BASE_URL", "BETEL_RECEITAWS_API_KEY"]),
  bigdata: testEnvOnly("bigdata", "BigData Corp", ["BETEL_BIG_DATA_API_BASE_URL", "BETEL_BIG_DATA_API_KEY"]),
  registry: testEnvOnly("registry", "ONR Registradores", ["BETEL_REGISTRY_API_BASE_URL", "BETEL_REGISTRY_API_KEY"]),
  infosimples: testEnvOnly("infosimples", "InfoSimples", ["BETEL_INFOSIMPLES_API_BASE_URL", "BETEL_INFOSIMPLES_API_KEY"]),
  serpro: testEnvOnly("serpro", "SerPro", ["BETEL_SERPRO_API_BASE_URL", "BETEL_SERPRO_API_KEY"]),
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { integration: string };
    const integrationId = String(body.integration || "").trim();

    const testFn = testMap[integrationId];
    if (!testFn) {
      return NextResponse.json(
        { success: false, message: `Integracao "${integrationId}" desconhecida.` },
        { status: 400 }
      );
    }

    const result = await testFn();
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Erro ao testar conexao.",
      },
      { status: 500 }
    );
  }
}
