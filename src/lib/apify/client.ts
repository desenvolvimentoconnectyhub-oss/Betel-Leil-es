import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const APIFY_API_DEFAULT_BASE_URL = "https://api.apify.com";
export const APIFY_API_BASE_URL_CONFIG_KEY = "betel_apify_api_base_url";
export const APIFY_API_TOKEN_CONFIG_KEY = "betel_apify_api_token";
export const APIFY_WEB_SEARCH_ACTOR_CONFIG_KEY = "betel_apify_web_search_actor";
export const APIFY_WEBSITE_CONTENT_ACTOR_CONFIG_KEY = "betel_apify_website_content_actor";
export const APIFY_WEB_SEARCH_ACTOR_DEFAULT = "apify/google-search-scraper";
export const APIFY_WEBSITE_CONTENT_ACTOR_DEFAULT = "apify/website-content-crawler";

type ApifyConfigSource = "app_config" | "env" | "default" | "missing";

export type ApifyConfig = {
  baseUrl: string;
  apiToken: string;
  webSearchActor: string;
  websiteContentActor: string;
  configured: boolean;
  baseUrlSource: ApifyConfigSource;
  apiTokenSource: ApifyConfigSource;
  webSearchActorSource: ApifyConfigSource;
  websiteContentActorSource: ApifyConfigSource;
};

export type ApifyActorRunResult = {
  ok: boolean;
  status: number;
  latencyMs: number;
  actorId: string;
  items: unknown[];
  payload: unknown;
  error?: string;
};

export type ApifyWebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type ApifyWebsiteContentResult = {
  ok: boolean;
  status: number;
  latencyMs: number;
  actorId: string;
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  items: unknown[];
  error?: string;
};

export type ApifyConnectionTestResult = {
  success: boolean;
  integration: "apify";
  message: string;
  latencyMs: number;
};

const APIFY_REQUEST_TIMEOUT_MS = 45_000;
const APIFY_ACTOR_TIMEOUT_SECONDS = 40;
const APIFY_TEXT_LIMIT = 600_000;

const ENV_ALIASES: Record<"baseUrl" | "apiToken" | "webSearchActor" | "websiteContentActor", string[]> = {
  baseUrl: ["BETEL_APIFY_API_BASE_URL", "APIFY_API_BASE_URL"],
  apiToken: ["BETEL_APIFY_API_TOKEN", "APIFY_API_TOKEN"],
  webSearchActor: ["BETEL_APIFY_WEB_SEARCH_ACTOR", "APIFY_WEB_SEARCH_ACTOR"],
  websiteContentActor: ["BETEL_APIFY_WEBSITE_CONTENT_ACTOR", "APIFY_WEBSITE_CONTENT_ACTOR"],
};

const APP_CONFIG_ALIASES: Record<"baseUrl" | "apiToken" | "webSearchActor" | "websiteContentActor", string[]> = {
  baseUrl: [APIFY_API_BASE_URL_CONFIG_KEY],
  apiToken: [APIFY_API_TOKEN_CONFIG_KEY, "apify_api_token"],
  webSearchActor: [APIFY_WEB_SEARCH_ACTOR_CONFIG_KEY],
  websiteContentActor: [APIFY_WEBSITE_CONTENT_ACTOR_CONFIG_KEY],
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

function apifyUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function actorPathId(actorId: string) {
  return encodeURIComponent(cleanString(actorId).replace(/\//g, "~"));
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

function payloadErrorMessage(payload: unknown) {
  const record = asRecord(payload);
  const error = asRecord(record.error);
  return cleanString(error.message || record.message || record.error || record.response);
}

function firstText(...values: unknown[]) {
  return values.map((value) => cleanString(value)).find(Boolean) || "";
}

function stripTags(html: string) {
  return cleanString(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function itemText(item: unknown) {
  const row = asRecord(item);
  const text = firstText(
    row.markdown,
    row.text,
    row.content,
    row.description,
    row.snippet,
    row.body,
    row.html,
    row.pageHtml
  );
  if (!text) return "";
  if (/<[a-z][\s\S]*>/i.test(text)) return stripTags(text);
  return text;
}

function itemUrl(item: unknown) {
  const row = asRecord(item);
  return firstText(row.url, row.sourceUrl, row.loadedUrl, row.finalUrl, row.link, row.href);
}

function itemTitle(item: unknown) {
  const row = asRecord(item);
  const metadata = asRecord(row.metadata);
  return firstText(row.title, row.name, row.pageTitle, metadata.title);
}

function normalizeActorItems(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  const row = asRecord(payload);
  if (Array.isArray(row.items)) return row.items;
  if (Array.isArray(row.data)) return row.data;
  const data = asRecord(row.data);
  if (Array.isArray(data.items)) return data.items;
  return [];
}

export async function getApifyConfig(): Promise<ApifyConfig> {
  const appConfig = await readAppConfigValues([
    ...APP_CONFIG_ALIASES.baseUrl,
    ...APP_CONFIG_ALIASES.apiToken,
    ...APP_CONFIG_ALIASES.webSearchActor,
    ...APP_CONFIG_ALIASES.websiteContentActor,
  ]);

  const appBaseUrl = readMapValue(appConfig, APP_CONFIG_ALIASES.baseUrl);
  const appApiToken = readMapValue(appConfig, APP_CONFIG_ALIASES.apiToken);
  const appWebSearchActor = readMapValue(appConfig, APP_CONFIG_ALIASES.webSearchActor);
  const appWebsiteContentActor = readMapValue(appConfig, APP_CONFIG_ALIASES.websiteContentActor);
  const envBaseUrl = readEnvValue(ENV_ALIASES.baseUrl);
  const envApiToken = readEnvValue(ENV_ALIASES.apiToken);
  const envWebSearchActor = readEnvValue(ENV_ALIASES.webSearchActor);
  const envWebsiteContentActor = readEnvValue(ENV_ALIASES.websiteContentActor);

  const baseUrl = appBaseUrl || envBaseUrl || APIFY_API_DEFAULT_BASE_URL;
  const apiToken = appApiToken || envApiToken;
  const webSearchActor = appWebSearchActor || envWebSearchActor || APIFY_WEB_SEARCH_ACTOR_DEFAULT;
  const websiteContentActor = appWebsiteContentActor || envWebsiteContentActor || APIFY_WEBSITE_CONTENT_ACTOR_DEFAULT;

  return {
    baseUrl,
    apiToken,
    webSearchActor,
    websiteContentActor,
    configured: Boolean(baseUrl && apiToken),
    baseUrlSource: appBaseUrl ? "app_config" : envBaseUrl ? "env" : "default",
    apiTokenSource: appApiToken ? "app_config" : envApiToken ? "env" : "missing",
    webSearchActorSource: appWebSearchActor ? "app_config" : envWebSearchActor ? "env" : "default",
    websiteContentActorSource: appWebsiteContentActor ? "app_config" : envWebsiteContentActor ? "env" : "default",
  };
}

export async function runApifyActorDatasetItems(
  actorId: string,
  input: Record<string, unknown>,
  timeoutMs = APIFY_REQUEST_TIMEOUT_MS
): Promise<ApifyActorRunResult> {
  const start = Date.now();
  const config = await getApifyConfig();
  const cleanActorId = cleanString(actorId);

  if (!config.apiToken) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
      actorId: cleanActorId,
      items: [],
      payload: {},
      error: "Token da Apify pendente.",
    };
  }

  if (!cleanActorId) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
      actorId: cleanActorId,
      items: [],
      payload: {},
      error: "Actor da Apify nao informado.",
    };
  }

  try {
    const url = new URL(apifyUrl(config.baseUrl, `/v2/actors/${actorPathId(cleanActorId)}/run-sync-get-dataset-items`));
    url.searchParams.set("timeout", String(APIFY_ACTOR_TIMEOUT_SECONDS));
    url.searchParams.set("memory", "512");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Date.now() - start;
    const payload = await readJsonPayload(response);
    const items = normalizeActorItems(payload);

    if (!response.ok) {
      const detail = payloadErrorMessage(payload);
      return {
        ok: false,
        status: response.status,
        latencyMs,
        actorId: cleanActorId,
        items,
        payload,
        error: detail ? `Apify retornou ${response.status}: ${detail}` : `Apify retornou ${response.status}.`,
      };
    }

    return {
      ok: true,
      status: response.status,
      latencyMs,
      actorId: cleanActorId,
      items,
      payload,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
      actorId: cleanActorId,
      items: [],
      payload: {},
      error: error instanceof Error ? error.message : "Falha ao chamar Apify.",
    };
  }
}

export async function searchWebWithApify(query: string): Promise<ApifyActorRunResult & { results: ApifyWebSearchResult[] }> {
  const config = await getApifyConfig();
  const cleanQuery = cleanString(query);
  const run = await runApifyActorDatasetItems(config.webSearchActor, {
    queries: cleanQuery,
    maxPagesPerQuery: 1,
    countryCode: "br",
    searchLanguage: "pt",
    languageCode: "pt-BR",
    geminiSearch: { enableGemini: false },
    perplexitySearch: {
      enablePerplexity: false,
      returnImages: false,
      returnRelatedQuestions: false,
    },
    chatGptSearch: { enableChatGpt: false },
    copilotSearch: { enableCopilot: false },
    maximumLeadsEnrichmentRecords: 0,
    proxyConfiguration: { useApifyProxy: true },
  });

  const resultItems = run.items.flatMap((item) => {
    const row = asRecord(item);
    return Array.isArray(row.organicResults) && row.organicResults.length ? row.organicResults : [row];
  });
  const results = resultItems
    .map((item) => {
      const row = asRecord(item);
      return {
        title: firstText(row.title, row.websiteTitle, row.name, row.heading),
        url: firstText(row.url, row.link, row.href, row.sourceUrl),
        snippet: firstText(row.description, row.snippet, row.text, row.content),
      };
    })
    .filter((item) => item.url);

  return { ...run, results };
}

export async function fetchUrlWithApifyWebsiteContent(url: string): Promise<ApifyWebsiteContentResult> {
  const config = await getApifyConfig();
  const targetUrl = cleanString(url);
  const run = await runApifyActorDatasetItems(config.websiteContentActor, {
    startUrls: [{ url: targetUrl }],
    maxCrawlPages: 1,
    maxCrawlDepth: 0,
    crawlerType: "playwright:adaptive",
    useSitemaps: false,
    respectRobotsTxtFile: true,
    blockMedia: true,
    saveHtml: true,
    saveMarkdown: true,
    storeSkippedUrls: false,
    proxyConfiguration: { useApifyProxy: true },
    removeElementsCssSelector: "nav, footer, script, style, noscript, svg, img[src^='data:']",
  });
  const first = run.items[0];
  const text = run.items.map(itemText).filter(Boolean).join("\n\n").slice(0, APIFY_TEXT_LIMIT);
  const finalUrl = itemUrl(first) || targetUrl;

  return {
    ok: run.ok && Boolean(text),
    status: run.status,
    latencyMs: run.latencyMs,
    actorId: run.actorId,
    url: targetUrl,
    finalUrl,
    title: itemTitle(first),
    text,
    items: run.items,
    error: run.ok && text ? undefined : run.error || "Apify nao retornou conteudo aproveitavel.",
  };
}

export async function testApifyConnection(): Promise<ApifyConnectionTestResult> {
  const start = Date.now();
  const config = await getApifyConfig();

  if (!config.apiToken) {
    return {
      success: false,
      integration: "apify",
      message: "Token da Apify pendente.",
      latencyMs: Date.now() - start,
    };
  }

  try {
    const response = await fetch(apifyUrl(config.baseUrl, "/v2/users/me"), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiToken}`,
      },
      signal: AbortSignal.timeout(12_000),
    });
    const latencyMs = Date.now() - start;
    const payload = await readJsonPayload(response);

    if (!response.ok) {
      const detail = payloadErrorMessage(payload);
      return {
        success: false,
        integration: "apify",
        message: detail ? `Apify retornou ${response.status}: ${detail}` : `Apify retornou ${response.status}.`,
        latencyMs,
      };
    }

    const actorRun = await searchWebWithApify("site:vivareal.com.br apartamento aluguel Blumenau SC");
    if (!actorRun.ok) {
      return {
        success: false,
        integration: "apify",
        message: `Conta OK, mas o actor ${actorRun.actorId} falhou: ${actorRun.error || `HTTP ${actorRun.status}`}.`,
        latencyMs: Date.now() - start,
      };
    }

    return {
      success: true,
      integration: "apify",
      message: `Apify respondeu OK. Actor de busca retornou ${actorRun.results.length} resultado(s). Conteudo=${config.websiteContentActor}.`,
      latencyMs: Date.now() - start,
    };
  } catch (error: unknown) {
    return {
      success: false,
      integration: "apify",
      message: error instanceof Error ? error.message : "Falha ao conectar Apify.",
      latencyMs: Date.now() - start,
    };
  }
}
