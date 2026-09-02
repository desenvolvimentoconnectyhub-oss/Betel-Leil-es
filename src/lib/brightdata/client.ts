import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const BRIGHTDATA_API_DEFAULT_BASE_URL = "https://api.brightdata.com/request";
export const BRIGHTDATA_API_BASE_URL_CONFIG_KEY = "betel_brightdata_api_base_url";
export const BRIGHTDATA_API_KEY_CONFIG_KEY = "betel_brightdata_api_key";
export const BRIGHTDATA_SERP_ZONE_CONFIG_KEY = "betel_brightdata_serp_zone";
export const BRIGHTDATA_WEB_UNLOCKER_ZONE_CONFIG_KEY = "betel_brightdata_web_unlocker_zone";
export const BRIGHTDATA_SERP_ZONE_DEFAULT = "serp_api1";

type BrightDataConfigSource = "app_config" | "env" | "default" | "missing";

export type BrightDataConfig = {
  baseUrl: string;
  apiKey: string;
  serpZone: string;
  webUnlockerZone: string;
  configured: boolean;
  webUnlockerConfigured: boolean;
  baseUrlSource: BrightDataConfigSource;
  apiKeySource: BrightDataConfigSource;
  serpZoneSource: BrightDataConfigSource;
  webUnlockerZoneSource: BrightDataConfigSource;
};

export type BrightDataRequestInput = {
  url: string;
  zone: string;
  format?: "raw" | "json";
  dataFormat?: "html" | "markdown";
  timeoutMs?: number;
};

export type BrightDataRequestResult = {
  ok: boolean;
  status: number;
  latencyMs: number;
  url: string;
  zone: string;
  payloadText: string;
  payload: unknown;
  error?: string;
};

export type BrightDataConnectionTestResult = {
  success: boolean;
  integration: "brightdata";
  message: string;
  latencyMs: number;
  serp?: {
    ok: boolean;
    status: number;
    bytes: number;
  };
  webUnlockerConfigured: boolean;
};

const BRIGHTDATA_REQUEST_TIMEOUT_MS = 25_000;

const ENV_ALIASES: Record<"baseUrl" | "apiKey" | "serpZone" | "webUnlockerZone", string[]> = {
  baseUrl: ["BETEL_BRIGHTDATA_API_BASE_URL", "BRIGHTDATA_API_BASE_URL"],
  apiKey: ["BETEL_BRIGHTDATA_API_KEY", "BRIGHTDATA_API_KEY"],
  serpZone: ["BETEL_BRIGHTDATA_SERP_ZONE", "BRIGHTDATA_SERP_ZONE"],
  webUnlockerZone: ["BETEL_BRIGHTDATA_WEB_UNLOCKER_ZONE", "BRIGHTDATA_WEB_UNLOCKER_ZONE"],
};

const APP_CONFIG_ALIASES: Record<"baseUrl" | "apiKey" | "serpZone" | "webUnlockerZone", string[]> = {
  baseUrl: [BRIGHTDATA_API_BASE_URL_CONFIG_KEY],
  apiKey: [BRIGHTDATA_API_KEY_CONFIG_KEY, "brightdata_api_key"],
  serpZone: [BRIGHTDATA_SERP_ZONE_CONFIG_KEY],
  webUnlockerZone: [BRIGHTDATA_WEB_UNLOCKER_ZONE_CONFIG_KEY],
};

function cleanString(value: unknown) {
  return String(value || "").trim();
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

function payloadErrorMessage(payload: unknown) {
  const record = asRecord(payload);
  const error = asRecord(record.error);
  return cleanString(error.message || record.message || record.error || record.response || record.body);
}

function textFromPayload(payload: unknown, fallback: string) {
  const record = asRecord(payload);
  return cleanString(
    record.html ||
      record.body ||
      record.content ||
      record.markdown ||
      record.response ||
      asRecord(record.data).html ||
      asRecord(record.data).body ||
      fallback
  );
}

async function readPayload(response: Response) {
  const text = await response.text().catch(() => "");
  const contentType = response.headers.get("content-type") || "";
  if (!text) return { payloadText: "", payload: {} };

  if (contentType.includes("json") || /^[\s\r\n]*[\[{]/.test(text)) {
    try {
      const payload = JSON.parse(text) as unknown;
      return { payloadText: textFromPayload(payload, text), payload };
    } catch {
      return { payloadText: text, payload: { response: text.slice(0, 240) } };
    }
  }

  return { payloadText: text, payload: { response: text.slice(0, 240) } };
}

export async function getBrightDataConfig(): Promise<BrightDataConfig> {
  const appConfig = await readAppConfigValues([
    ...APP_CONFIG_ALIASES.baseUrl,
    ...APP_CONFIG_ALIASES.apiKey,
    ...APP_CONFIG_ALIASES.serpZone,
    ...APP_CONFIG_ALIASES.webUnlockerZone,
  ]);

  const appBaseUrl = readMapValue(appConfig, APP_CONFIG_ALIASES.baseUrl);
  const appApiKey = readMapValue(appConfig, APP_CONFIG_ALIASES.apiKey);
  const appSerpZone = readMapValue(appConfig, APP_CONFIG_ALIASES.serpZone);
  const appWebUnlockerZone = readMapValue(appConfig, APP_CONFIG_ALIASES.webUnlockerZone);
  const envBaseUrl = readEnvValue(ENV_ALIASES.baseUrl);
  const envApiKey = readEnvValue(ENV_ALIASES.apiKey);
  const envSerpZone = readEnvValue(ENV_ALIASES.serpZone);
  const envWebUnlockerZone = readEnvValue(ENV_ALIASES.webUnlockerZone);

  const baseUrl = appBaseUrl || envBaseUrl || BRIGHTDATA_API_DEFAULT_BASE_URL;
  const apiKey = appApiKey || envApiKey;
  const serpZone = appSerpZone || envSerpZone || BRIGHTDATA_SERP_ZONE_DEFAULT;
  const webUnlockerZone = appWebUnlockerZone || envWebUnlockerZone;

  return {
    baseUrl,
    apiKey,
    serpZone,
    webUnlockerZone,
    configured: Boolean(baseUrl && apiKey && serpZone),
    webUnlockerConfigured: Boolean(baseUrl && apiKey && webUnlockerZone),
    baseUrlSource: appBaseUrl ? "app_config" : envBaseUrl ? "env" : "default",
    apiKeySource: appApiKey ? "app_config" : envApiKey ? "env" : "missing",
    serpZoneSource: appSerpZone ? "app_config" : envSerpZone ? "env" : "default",
    webUnlockerZoneSource: appWebUnlockerZone ? "app_config" : envWebUnlockerZone ? "env" : "missing",
  };
}

export async function executeBrightDataRequest(
  input: BrightDataRequestInput
): Promise<BrightDataRequestResult> {
  const start = Date.now();
  const config = await getBrightDataConfig();
  const targetUrl = cleanString(input.url);
  const zone = cleanString(input.zone);

  if (!config.apiKey) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
      url: targetUrl,
      zone,
      payloadText: "",
      payload: {},
      error: "API key da Bright Data pendente.",
    };
  }

  if (!targetUrl || !zone) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
      url: targetUrl,
      zone,
      payloadText: "",
      payload: {},
      error: "URL ou zone da Bright Data nao informada.",
    };
  }

  try {
    const response = await fetch(config.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        zone,
        url: targetUrl,
        format: input.format || "raw",
        ...(input.dataFormat ? { data_format: input.dataFormat } : {}),
      }),
      signal: AbortSignal.timeout(input.timeoutMs || BRIGHTDATA_REQUEST_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - start;
    const payload = await readPayload(response);

    if (!response.ok) {
      const detail = payloadErrorMessage(payload.payload);
      return {
        ok: false,
        status: response.status,
        latencyMs,
        url: targetUrl,
        zone,
        payloadText: payload.payloadText,
        payload: payload.payload,
        error: detail ? `Bright Data retornou ${response.status}: ${detail}` : `Bright Data retornou ${response.status}.`,
      };
    }

    return {
      ok: true,
      status: response.status,
      latencyMs,
      url: targetUrl,
      zone,
      payloadText: payload.payloadText,
      payload: payload.payload,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
      url: targetUrl,
      zone,
      payloadText: "",
      payload: {},
      error: error instanceof Error ? error.message : "Falha ao chamar Bright Data.",
    };
  }
}

export async function searchBrightDataSerp(query: string) {
  const config = await getBrightDataConfig();
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", cleanString(query));
  url.searchParams.set("hl", "pt-BR");
  url.searchParams.set("gl", "br");
  url.searchParams.set("num", "10");

  return executeBrightDataRequest({
    url: url.toString(),
    zone: config.serpZone,
    format: "raw",
    dataFormat: "html",
  });
}

export async function unlockUrlWithBrightData(url: string) {
  const config = await getBrightDataConfig();
  if (!config.webUnlockerConfigured) {
    return {
      ok: false,
      status: 0,
      latencyMs: 0,
      url,
      zone: config.webUnlockerZone,
      payloadText: "",
      payload: {},
      error: "Bright Data Web Unlocker sem zone configurada.",
    } satisfies BrightDataRequestResult;
  }

  return executeBrightDataRequest({
    url,
    zone: config.webUnlockerZone,
    format: "raw",
  });
}

export async function testBrightDataConnection(): Promise<BrightDataConnectionTestResult> {
  const start = Date.now();
  const config = await getBrightDataConfig();

  if (!config.apiKey) {
    return {
      success: false,
      integration: "brightdata",
      message: "API key da Bright Data pendente.",
      latencyMs: Date.now() - start,
      webUnlockerConfigured: config.webUnlockerConfigured,
    };
  }

  if (!config.serpZone) {
    return {
      success: false,
      integration: "brightdata",
      message: "Zone SERP da Bright Data pendente.",
      latencyMs: Date.now() - start,
      webUnlockerConfigured: config.webUnlockerConfigured,
    };
  }

  const result = await searchBrightDataSerp("Betel Leiloes");
  const latencyMs = Date.now() - start;
  if (!result.ok) {
    return {
      success: false,
      integration: "brightdata",
      message: result.error || `Bright Data retornou ${result.status}.`,
      latencyMs,
      serp: { ok: false, status: result.status, bytes: result.payloadText.length },
      webUnlockerConfigured: config.webUnlockerConfigured,
    };
  }

  return {
    success: true,
    integration: "brightdata",
    message: `SERP API respondeu ${result.status}; ${result.payloadText.length} bytes recebidos.`,
    latencyMs,
    serp: { ok: true, status: result.status, bytes: result.payloadText.length },
    webUnlockerConfigured: config.webUnlockerConfigured,
  };
}
