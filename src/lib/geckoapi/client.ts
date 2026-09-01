import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const GECKO_API_DEFAULT_BASE_URL = "https://api.geckoapi.com.br";
export const GECKO_API_BASE_URL_CONFIG_KEY = "betel_geckoapi_api_base_url";
export const GECKO_API_KEY_CONFIG_KEY = "betel_geckoapi_api_key";

type GeckoApiConfigSource = "app_config" | "env" | "default" | "missing";

export type GeckoApiConfig = {
  baseUrl: string;
  apiKey: string;
  configured: boolean;
  baseUrlSource: GeckoApiConfigSource;
  apiKeySource: GeckoApiConfigSource;
};

export type GeckoApiCredits = {
  userId?: string;
  currentCredits?: number;
  planId?: string;
  updatedAt?: string;
  creditsConsumed?: {
    last24Hours?: number;
    last7Days?: number;
    last30Days?: number;
  };
};

export type GeckoApiConnectionTestResult = {
  success: boolean;
  integration: "geckoapi";
  message: string;
  latencyMs: number;
  credits?: GeckoApiCredits;
};

const ENV_ALIASES: Record<"baseUrl" | "apiKey", string[]> = {
  baseUrl: ["BETEL_GECKOAPI_API_BASE_URL", "BETEL_GECKO_API_BASE_URL", "GECKOAPI_API_BASE_URL"],
  apiKey: ["BETEL_GECKOAPI_API_KEY", "BETEL_GECKO_API_KEY", "GECKOAPI_API_KEY"],
};

const APP_CONFIG_ALIASES: Record<"baseUrl" | "apiKey", string[]> = {
  baseUrl: [GECKO_API_BASE_URL_CONFIG_KEY, "betel_gecko_api_base_url"],
  apiKey: [GECKO_API_KEY_CONFIG_KEY, "betel_gecko_api_key"],
};

function cleanString(value: unknown) {
  return String(value || "").trim();
}

async function readAppConfigValues(keys: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return new Map<string, string>();

  const normalizedKeys = keys.map((key) => key.toLowerCase());
  const { data, error } = await supabase
    .from("app_config")
    .select("key,value")
    .in("key", normalizedKeys);

  if (error || !data) return new Map<string, string>();

  return new Map(
    data
      .map((row) => [cleanString(row.key).toLowerCase(), cleanString(row.value)] as const)
      .filter(([key, value]) => Boolean(key && value))
  );
}

function readEnvValue(keys: string[]) {
  for (const key of keys) {
    const value = cleanString(process.env[key]);
    if (value) return value;
  }
  return "";
}

function readMapValue(map: Map<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = cleanString(map.get(key.toLowerCase()));
    if (value) return value;
  }
  return "";
}

export async function getGeckoApiConfig(): Promise<GeckoApiConfig> {
  const appConfig = await readAppConfigValues([
    ...APP_CONFIG_ALIASES.baseUrl,
    ...APP_CONFIG_ALIASES.apiKey,
  ]);

  const appBaseUrl = readMapValue(appConfig, APP_CONFIG_ALIASES.baseUrl);
  const appApiKey = readMapValue(appConfig, APP_CONFIG_ALIASES.apiKey);
  const envBaseUrl = readEnvValue(ENV_ALIASES.baseUrl);
  const envApiKey = readEnvValue(ENV_ALIASES.apiKey);

  const baseUrl = appBaseUrl || envBaseUrl || GECKO_API_DEFAULT_BASE_URL;
  const apiKey = appApiKey || envApiKey;

  return {
    baseUrl,
    apiKey,
    configured: Boolean(baseUrl && apiKey),
    baseUrlSource: appBaseUrl ? "app_config" : envBaseUrl ? "env" : "default",
    apiKeySource: appApiKey ? "app_config" : envApiKey ? "env" : "missing",
  };
}

export function geckoApiUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
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

function getPayloadMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const error = record.error && typeof record.error === "object"
    ? (record.error as Record<string, unknown>)
    : {};
  return cleanString(error.message || record.message || record.error || record.response);
}

export async function testGeckoApiConnection(): Promise<GeckoApiConnectionTestResult> {
  const start = Date.now();
  const config = await getGeckoApiConfig();

  if (!config.apiKey) {
    return {
      success: false,
      integration: "geckoapi",
      message: "API key da GeckoAPI pendente. Cole a chave gerada no dashboard.",
      latencyMs: Date.now() - start,
    };
  }

  try {
    const response = await fetch(geckoApiUrl(config.baseUrl, "/v1/me/credits"), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "X-API-Key": config.apiKey,
      },
      signal: AbortSignal.timeout(12000),
    });
    const latencyMs = Date.now() - start;
    const payload = await readJsonPayload(response);

    if (!response.ok) {
      const detail = getPayloadMessage(payload);
      return {
        success: false,
        integration: "geckoapi",
        message: detail ? `GeckoAPI retornou ${response.status}: ${detail}` : `GeckoAPI retornou ${response.status}.`,
        latencyMs,
      };
    }

    const credits = payload && typeof payload === "object" ? (payload as GeckoApiCredits) : {};
    const creditLabel = typeof credits.currentCredits === "number"
      ? `${credits.currentCredits} crédito(s) disponível(is)`
      : "saldo retornado";
    const planLabel = credits.planId ? `Plano ${credits.planId}; ` : "";

    return {
      success: true,
      integration: "geckoapi",
      message: `${planLabel}${creditLabel}. Resposta em ${latencyMs}ms.`,
      latencyMs,
      credits,
    };
  } catch (error: unknown) {
    return {
      success: false,
      integration: "geckoapi",
      message: error instanceof Error ? error.message : "Falha ao conectar GeckoAPI.",
      latencyMs: Date.now() - start,
    };
  }
}
