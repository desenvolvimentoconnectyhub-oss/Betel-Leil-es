import "server-only";

import {
  calculatePricePerM2,
  clampMarketScore,
  type MarketComparableQuality,
  type MarketCostItem,
} from "@/lib/admin/market-analysis";
import { getGeminiApiKey, getGeminiModel, normalizeGeminiModel } from "@/lib/ai/config";
import type { AuctionLinkExtraction } from "./auction-link-extractor";
import { normalizeLocationName, normalizeStateUf } from "./location-normalization";

type ListingKind = "sale" | "rent";

export type DeepMarketComparable = {
  sourceLabel: string;
  sourceUrl: string;
  listingType: ListingKind;
  propertyType: string;
  title: string;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  areaM2: number;
  askingPrice: number;
  monthlyRent: number;
  pricePerM2: number;
  bedrooms: number;
  parkingSpaces: number;
  similarityScore: number;
  quality: MarketComparableQuality;
  notes: string;
  collectedAt: string;
};

export type DeepMarketResearchResult = {
  status: "completed" | "partial" | "skipped";
  searchQueries: string[];
  searchedUrls: Array<{ label: string; url: string; kind: ListingKind }>;
  saleComparables: DeepMarketComparable[];
  rentalComparables: DeepMarketComparable[];
  marketValueLow: number;
  marketValueBase: number;
  marketValueHigh: number;
  rentalMonthlyRent: number;
  rentalReferenceUrl: string;
  confidenceScore: number;
  liquidityScore: number;
  estimatedCosts: MarketCostItem[];
  missingFields: string[];
  cautionNotes: string[];
};

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  kind: ListingKind;
  provider: "bing" | "duckduckgo" | "google-grounding";
};

type MarketSearchUrl = {
  label: string;
  url: string;
  kind: ListingKind;
};

type SubjectProfile = {
  title: string;
  propertyType: string;
  address: string;
  city: string;
  state: string;
  neighborhood: string;
  condoName: string;
  areaM2: number;
  bedrooms: number;
  parkingSpaces: number;
  initialBid: number;
};

const SEARCH_TIMEOUT_MS = 8_000;
const PAGE_TIMEOUT_MS = 7_000;
const PAGE_TEXT_LIMIT = 600_000;
const MAX_SEARCH_RESULTS = 12;
const MIN_SALE_REFERENCES = 3;
const MIN_RENT_REFERENCES = 1;
const MAX_SALE_PAGES = 14;
const MAX_RENT_PAGES = 8;
const GEMINI_GROUNDED_TIMEOUT_MS = 45_000;
const MAX_GROUNDED_COMPARABLES = 10;

const MARKET_SOURCE_ALLOWLIST = [
  "zapimoveis",
  "vivareal",
  "imovelweb",
  "chavesnamao",
  "olx.com.br",
  "quintoandar",
  "loft.com.br",
  "mgfimoveis",
  "netimoveis",
  "wimoveis",
  "scimoveis",
  "ibagy",
  "apolar",
  "foxter",
  "auxiliadora",
  "lopes",
  "agenteimovel",
  "123i",
  "imobiliaria",
  "imob",
  "imb.br",
  "classimoveis",
  "corretora",
  "imoveis",
  "imovel",
  "properati",
  "luxuryestate",
];

const AUCTION_SOURCE_BLOCKLIST = [
  "leilao",
  "leiloes",
  "superbid",
  "hastapublica",
  "judicial",
  "sato",
  "portalzuk",
  "fbleiloes",
  "lancenoleilao",
  "hasta",
];

const NON_LISTING_SOURCE_BLOCKLIST = [
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "whatsapp",
  "wa.me",
  "maps.google",
];

function cleanString(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function normalizeText(value: unknown) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function uniqueStrings(values: string[], limit = 30) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values.map((item) => cleanString(item)).filter(Boolean)) {
    const key = normalizeText(value);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cleanString(value);
  if (!text) return fallback;
  const normalized = text
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item)).filter(Boolean)
    : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickJsonObject(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || raw;
  try {
    return JSON.parse(fenced);
  } catch {
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(fenced.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function currencyFromText(value: string) {
  const parsed = asNumber(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function firstPositive(...values: number[]) {
  return values.find((value) => Number.isFinite(value) && value > 0) || 0;
}

function firstText(...values: unknown[]) {
  return values.map((value) => cleanString(value)).find(Boolean) || "";
}

function htmlDecode(value: string) {
  return cleanString(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(html: string) {
  return htmlDecode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}

function sourceDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function sourceLabel(value: string) {
  const domain = sourceDomain(value);
  return domain || "Fonte de mercado";
}

function isLikelyMarketSource(url: string) {
  const normalized = normalizeText(url);
  if (!/^https?:\/\//i.test(url)) return false;
  if (AUCTION_SOURCE_BLOCKLIST.some((token) => normalized.includes(token))) return false;
  return MARKET_SOURCE_ALLOWLIST.some((token) => normalized.includes(token));
}

function canonicalMarketUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const path = decodeURIComponent(parsed.pathname || "")
      .replace(/\/+$/g, "")
      .toLowerCase();
    return `${host}${path}`;
  } catch {
    return cleanString(url).split(/[?#]/)[0].replace(/\/+$/g, "").toLowerCase();
  }
}

function isLikelyListingDetailUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = normalizeText(decodeURIComponent(parsed.pathname || ""));
    const query = normalizeText(decodeURIComponent(parsed.search || ""));
    if (!path || path === "/") return false;
    if (/(busca|buscar|search|pesquisa|resultado|resultados|mapa|favoritos|categoria)/.test(path)) return false;
    const compact = `${path} ${query}`;
    const hasListingToken = /(imovel|apartamento|casa|sobrado|terreno|lote|sala|galpao|comercial|chacara|condominio)/.test(compact);
    const hasIdentifier = /\d{4,}/.test(compact) || /(?:id|codigo|cod|ref)[=/_-]?\d{2,}/.test(compact);
    const pathDepth = path.split("/").filter(Boolean).length;
    return hasIdentifier || (hasListingToken && pathDepth >= 2);
  } catch {
    return false;
  }
}

function isAcceptableGroundedMarketSource(url: string) {
  const normalized = normalizeText(url);
  if (!/^https?:\/\//i.test(url)) return false;
  if (AUCTION_SOURCE_BLOCKLIST.some((token) => normalized.includes(token))) return false;
  if (NON_LISTING_SOURCE_BLOCKLIST.some((token) => normalized.includes(token))) return false;
  return isLikelyMarketSource(url) && isLikelyListingDetailUrl(url);
}

function normalizeComparableQuality(value: unknown, score: number): MarketComparableQuality {
  const normalized = normalizeText(value);
  const scoreQuality = qualityFromScore(score);
  if (scoreQuality === "discarded") return "discarded";
  if ((normalized === "strong" || normalized === "forte" || normalized === "alta") && score >= 78) return "strong";
  if ((normalized === "medium" || normalized === "media" || normalized === "média") && score >= 58) return "medium";
  if (normalized === "weak" || normalized === "fraca" || normalized === "baixa") return "weak";
  if (normalized === "discarded" || normalized === "descartado") return "discarded";
  return scoreQuality;
}

function normalizeExternalSimilarityScore(value: unknown) {
  const score = asNumber(value);
  if (!score) return 0;
  if (score > 0 && score <= 1) return clampMarketScore(score * 100);
  if (score > 1 && score <= 10) return clampMarketScore(score * 10);
  return clampMarketScore(score);
}

function unwrapBingUrl(url: string) {
  const decoded = htmlDecode(url);
  try {
    const parsed = new URL(decoded);
    const encodedTarget = parsed.searchParams.get("u");
    if (encodedTarget?.startsWith("a1")) {
      const base64 = encodedTarget.slice(2).replace(/_/g, "/").replace(/-/g, "+");
      const target = Buffer.from(base64, "base64").toString("utf8");
      if (/^https?:\/\//i.test(target)) return target;
    }
    return parsed.href;
  } catch {
    return decoded;
  }
}

function unwrapDuckDuckGoUrl(url: string) {
  const decoded = htmlDecode(url);
  try {
    const parsed = new URL(decoded, "https://duckduckgo.com");
    const target = parsed.searchParams.get("uddg");
    if (target && /^https?:\/\//i.test(target)) return target;
    if (/^https?:\/\//i.test(parsed.href)) return parsed.href;
  } catch {
    // Keep the decoded value below.
  }
  return decoded;
}

function extractBingResults(html: string, kind: ListingKind) {
  const results: SearchResult[] = [];
  const blocks = html.match(/<li\b[^>]*class=["'][^"']*\bb_algo\b[^"']*["'][\s\S]*?<\/li>/gi) || [];
  const candidates = blocks.length ? blocks : html.match(/<a\b[^>]*href=["'][^"']+["'][\s\S]*?<\/a>/gi) || [];

  for (const block of candidates) {
    const link = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link?.[1]) continue;
    const url = unwrapBingUrl(link[1]);
    if (!isLikelyMarketSource(url)) continue;
    const title = stripTags(link[2]);
    const snippet = stripTags(block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || block);
    results.push({ title, url, snippet, kind, provider: "bing" });
    if (results.length >= MAX_SEARCH_RESULTS) break;
  }

  return results;
}

function extractDuckDuckGoResults(html: string, kind: ListingKind) {
  const results: SearchResult[] = [];
  const blocks =
    html.match(/<div\b[^>]*class=["'][^"']*\bresult\b[^"']*["'][\s\S]*?(?=<div\b[^>]*class=["'][^"']*\bresult\b|<\/body>)/gi) ||
    [];
  const candidates = blocks.length
    ? blocks
    : html.match(/<a\b[^>]*class=["'][^"']*\bresult__a\b[^"']*["'][\s\S]*?<\/a>/gi) || [];

  for (const block of candidates) {
    const link = block.match(/<a\b[^>]*class=["'][^"']*\bresult__a\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link?.[1]) continue;
    const url = unwrapDuckDuckGoUrl(link[1]);
    if (!isLikelyMarketSource(url)) continue;
    const title = stripTags(link[2]);
    const snippet = stripTags(
      block.match(/<a\b[^>]*class=["'][^"']*\bresult__snippet\b[^"']*["'][\s\S]*?>([\s\S]*?)<\/a>/i)?.[1] ||
        block.match(/<div\b[^>]*class=["'][^"']*\bresult__snippet\b[^"']*["'][\s\S]*?>([\s\S]*?)<\/div>/i)?.[1] ||
        block
    );
    results.push({ title, url, snippet, kind, provider: "duckduckgo" });
    if (results.length >= MAX_SEARCH_RESULTS) break;
  }

  return results;
}

async function fetchText(url: string, timeoutMs: number) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.7",
        "user-agent": "Mozilla/5.0 (compatible; BetelMarketResearch/1.0; +https://betel.ai)",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { text: "", status: response.status, finalUrl: response.url };
    return { text: await response.text(), status: response.status, finalUrl: response.url || url };
  } catch {
    return { text: "", status: 0, finalUrl: url };
  }
}

function inferPropertyType(value: string) {
  const text = normalizeText(value);
  if (text.includes("apart")) return "apartamento";
  if (text.includes("casa") || text.includes("sobrado")) return "casa";
  if (text.includes("terreno") || text.includes("lote")) return "terreno";
  if (text.includes("sala") || text.includes("comercial")) return "comercial";
  return "imovel";
}

function propertyGroup(value: string) {
  const text = normalizeText(value);
  if (text.includes("apart")) return "apartment";
  if (text.includes("terreno") || text.includes("lote")) return "land";
  if (text.includes("sala") || text.includes("comercial") || text.includes("galpao")) return "commercial";
  if (text.includes("casa") || text.includes("sobrado") || text.includes("residencia")) return "house";
  return "unknown";
}

function propertyTypeCompatible(subjectType: string, comparableType: string, comparableTitle = "") {
  const subjectGroup = propertyGroup(subjectType);
  if (subjectGroup === "unknown") return true;
  const comparableGroup = propertyGroup(`${comparableType} ${comparableTitle}`);
  if (comparableGroup === "unknown") return true;
  return subjectGroup === comparableGroup;
}

function extractCondoName(input: string) {
  const text = cleanString(input).replace(/\s+/g, " ");
  const patterns = [
    /\bloteamento\s+(?:denominado\s+)?([A-Za-z\u00C0-\u00FF0-9 .'/-]{4,80})/i,
    /\b(?:condominio|cond\.|edificio)\s+(?:denominado\s+)?([A-Za-z\u00C0-\u00FF0-9 .'/-]{4,80})/i,
    /\bresidencial\s+(?!em\b|de\b|da\b|do\b|das\b|dos\b|no\b|na\b|situado\b|localizado\b|lote\b|terreno\b|casa\b|sobrado\b)([A-Za-z\u00C0-\u00FF0-9 .'/-]{4,70})/i,
    /\b(spazio\s+[A-Za-z\u00C0-\u00FF0-9 .'/-]{3,50})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = cleanCondoCandidate(match?.[1]);
    if (value.length >= 4) return value;
  }
  return "";
}

function cleanCondoCandidate(value: unknown) {
  const candidate = cleanString(value)
    .replace(/[|,.;:]+.*$/, "")
    .replace(/\s+(?:com|contendo|localizado|situado|ocupado)\b.*$/i, "")
    .trim();
  const normalized = normalizeText(candidate);
  if (!normalized) return "";
  if (/^(em|de|da|do|das|dos|no|na|nos|nas|n|numero|lote|quadra)\b/.test(normalized)) return "";
  if (/\b(alvenaria|area|terreno|casa|sobrado|apartamento|imovel|lote)\b/.test(normalized)) return "";
  return candidate;
}

function buildSubjectProfile(input: {
  extraction: AuctionLinkExtraction;
  title: string;
  initialBid: number;
}) {
  const text = `${input.title} ${input.extraction.summary} ${input.extraction.address}`;
  return {
    title: input.title,
    propertyType: input.extraction.propertyType || inferPropertyType(text),
    address: input.extraction.address,
    city: normalizeLocationName(input.extraction.city),
    state: normalizeStateUf(input.extraction.state),
    neighborhood: normalizeLocationName(input.extraction.neighborhood),
    condoName: extractCondoName(text),
    areaM2: firstPositive(input.extraction.privateAreaM2, input.extraction.builtAreaM2, input.extraction.landAreaM2),
    bedrooms: input.extraction.bedrooms || 0,
    parkingSpaces: input.extraction.parkingSpaces || 0,
    initialBid: input.initialBid,
  } satisfies SubjectProfile;
}

function compactQuery(parts: Array<string | number | undefined>) {
  return uniqueStrings(parts.map((part) => cleanString(part)).filter(Boolean), 12).join(" ");
}

function streetForSearch(address: string) {
  return cleanString(address)
    .replace(/\b(?:n[ºo]?|numero)\s*[\d\w-]+/gi, "")
    .split(",")[0]
    .trim();
}

function buildSearchQueries(subject: SubjectProfile) {
  const type = subject.propertyType || "imovel";
  const titleText = normalizeText(subject.title);
  const primaryType = titleText.includes("sobrado") ? "sobrado" : type;
  const cityUf = compactQuery([subject.city, subject.state]);
  const area = subject.areaM2 ? `${Math.round(subject.areaM2)} m2` : "";
  const microLocation = subject.condoName || subject.neighborhood;
  const street = streetForSearch(subject.address);
  const titleCore = compactQuery([subject.title, microLocation, cityUf]);
  const saleCore = compactQuery([primaryType, "venda", microLocation, cityUf, area]);
  const rentCore = compactQuery([primaryType, "aluguel", microLocation, cityUf, area]);
  const saleQueries = uniqueStrings([
    titleCore ? compactQuery([titleCore, "venda"]) : "",
    subject.condoName ? compactQuery([`"${subject.condoName}"`, type, "venda", cityUf]) : "",
    microLocation ? saleCore : "",
    titleText.includes("sobrado") ? compactQuery(["casa", "venda", microLocation, cityUf, area]) : "",
    compactQuery([type, "alto padrao", "venda", subject.city, subject.state, area]),
    compactQuery([type, "venda", subject.neighborhood, subject.city, subject.state, area]),
    street ? compactQuery([street, type, "venda", subject.city, subject.state]) : "",
    titleCore ? compactQuery(["site:vivareal.com.br/imovel", titleCore, "venda"]) : "",
    titleCore ? compactQuery(["site:zapimoveis.com.br/imovel", titleCore, "venda"]) : "",
    titleCore ? compactQuery(["site:imovelweb.com.br", titleCore, "venda"]) : "",
    saleCore ? compactQuery(["site:vivareal.com.br/imovel", saleCore]) : "",
    saleCore ? compactQuery(["site:zapimoveis.com.br/imovel", saleCore]) : "",
    saleCore ? compactQuery(["site:imovelweb.com.br", saleCore]) : "",
    saleCore ? compactQuery(["site:olx.com.br/imoveis", saleCore]) : "",
  ], 10);
  const rentQueries = uniqueStrings([
    titleCore ? compactQuery([titleCore, "aluguel"]) : "",
    subject.condoName ? compactQuery([`"${subject.condoName}"`, type, "aluguel", cityUf]) : "",
    microLocation ? rentCore : "",
    compactQuery([type, "aluguel", subject.neighborhood, subject.city, subject.state, area]),
    titleCore ? compactQuery(["site:vivareal.com.br/imovel", titleCore, "aluguel"]) : "",
    titleCore ? compactQuery(["site:zapimoveis.com.br/imovel", titleCore, "aluguel"]) : "",
    rentCore ? compactQuery(["site:vivareal.com.br/imovel", rentCore]) : "",
    rentCore ? compactQuery(["site:zapimoveis.com.br/imovel", rentCore]) : "",
  ], 5);

  return [
    ...saleQueries.map((query) => ({ query, kind: "sale" as const })),
    ...rentQueries.map((query) => ({ query, kind: "rent" as const })),
  ].filter((item) => item.query.length > 8);
}

async function searchMarketResults(subject: SubjectProfile) {
  const searches = buildSearchQueries(subject);
  const providers = [
    {
      id: "bing" as const,
      url: (query: string) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
      extract: extractBingResults,
    },
    {
      id: "duckduckgo" as const,
      url: (query: string) => `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      extract: extractDuckDuckGoResults,
    },
  ];
  const pages = await Promise.all(
    searches.flatMap((item) => providers.map(async (provider) => {
      const url = provider.url(item.query);
      const fetched = await fetchText(url, SEARCH_TIMEOUT_MS);
      return {
        ...item,
        provider: provider.id,
        url,
        results: fetched.text ? provider.extract(fetched.text, item.kind) : [],
      };
    }))
  );

  const results = pages.flatMap((page) => page.results);
  const seen = new Set<string>();
  const uniqueResults = results.filter((item) => {
    const key = item.url.split("#")[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const resultUrls = uniqueResults
    .filter((item) => isAcceptableGroundedMarketSource(item.url))
    .map((item) => ({
      label: `Resultado ${item.provider}: ${item.title || sourceLabel(item.url)}`,
      url: item.url,
      kind: item.kind,
    }));

  return {
    searchQueries: searches.map((item) => item.query),
    searchedUrls: uniqueSearchedUrls([
      ...resultUrls,
      ...pages.map((item) => ({ label: `${item.provider}: ${item.query}`, url: item.url, kind: item.kind })),
    ]),
    results: uniqueResults,
  };
}

function inferListingKindFromText(value: string, fallback: ListingKind = "sale"): ListingKind {
  const text = normalizeText(value);
  if (/(aluguel|alugar|locacao|rent)/.test(text)) return "rent";
  if (/(venda|comprar|sale)/.test(text)) return "sale";
  return fallback;
}

function searchResultFromMarketSource(source: MarketSearchUrl): SearchResult {
  return {
    title: cleanString(source.label, sourceLabel(source.url)),
    url: source.url,
    snippet: source.label,
    kind: inferListingKindFromText(`${source.label} ${source.url}`, source.kind),
    provider: "google-grounding",
  };
}

function uniqueSearchResults(values: SearchResult[]) {
  const seen = new Set<string>();
  const output: SearchResult[] = [];
  for (const item of values) {
    const key = canonicalMarketUrl(item.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function extractTitle(html: string, fallback: string) {
  return stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || fallback).slice(0, 180);
}

function moneyMatches(text: string) {
  const output: number[] = [];
  const regex = /R\$\s*([\d.]{1,12}(?:,\d{2})?)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const value = currencyFromText(match[1]);
    if (value > 0) output.push(value);
  }
  const compactRegex = /\bRS\s*([1-9]\d{3,8})(?![a-z])/gi;
  while ((match = compactRegex.exec(text))) {
    const value = currencyFromText(match[1]);
    if (value > 0) output.push(value);
  }
  return output;
}

function extractSalePrice(text: string) {
  const values = moneyMatches(text).filter((value) => value >= 40_000 && value <= 30_000_000);
  return values[0] || 0;
}

function extractRentPrice(text: string) {
  const values = moneyMatches(text).filter((value) => value >= 400 && value <= 80_000);
  const lower = normalizeText(text.slice(0, 18_000));
  if (lower.includes("aluguel") || lower.includes("locacao") || lower.includes("alugar")) {
    return values[0] || 0;
  }
  return values.find((value) => value <= 25_000) || 0;
}

function extractArea(text: string) {
  const areaUnit = String.raw`m(?:\s|\u00a0)*(?:2|\u00b2|\u00c2\u00b2)|metros quadrados`;
  const labeledPatterns = [
    new RegExp(String.raw`(?:area|privativa|construida|constru\u00edda|terreno|total|util|\u00fatil)\D{0,45}(\d{2,5}(?:[.,]\d{1,2})?)\s*(?:${areaUnit})`, "gi"),
    new RegExp(String.raw`(\d{2,5}(?:[.,]\d{1,2})?)\s*(?:${areaUnit})\D{0,35}(?:area|privativa|construida|constru\u00edda|terreno|total|util|\u00fatil)`, "gi"),
  ];
  const labeled = labeledPatterns
    .flatMap((pattern) => [...text.matchAll(pattern)].map((match) => asNumber(match[1])))
    .filter((value) => value >= 20 && value <= 20_000);
  if (labeled.length) return labeled[0];

  const matches = [...text.matchAll(new RegExp(String.raw`(\d{2,5}(?:[.,]\d{1,2})?)\s*(?:${areaUnit})`, "gi"))]
    .map((match) => asNumber(match[1]))
    .filter((value) => value >= 20 && value <= 20_000 && (value < 1900 || value > 2035));
  return matches[0] || 0;
}

function extractSmallCount(text: string, labels: string[]) {
  const normalized = normalizeText(text.slice(0, 12_000));
  for (const label of labels) {
    const pattern = new RegExp(`(\\d+)\\s*(?:${label})`, "i");
    const match = normalized.match(pattern);
    const value = asNumber(match?.[1]);
    if (value > 0 && value <= 20) return value;
  }
  return 0;
}

function includesToken(text: string, token: string) {
  const normalizedToken = normalizeText(token);
  if (!normalizedToken || normalizedToken.length < 3) return false;
  return normalizeText(text).includes(normalizedToken);
}

function comparableEvidenceText(comparable: Pick<DeepMarketComparable, "title" | "address" | "neighborhood" | "city" | "state" | "sourceUrl">) {
  return `${comparable.title} ${comparable.address} ${comparable.neighborhood} ${comparable.city} ${comparable.state} ${comparable.sourceUrl}`;
}

function hasLocationEvidence(subject: SubjectProfile, comparable: Pick<DeepMarketComparable, "title" | "address" | "neighborhood" | "city" | "state" | "sourceUrl">) {
  const text = comparableEvidenceText(comparable);
  const cityMatches = subject.city && includesToken(text, subject.city);
  const stateMatches = subject.state && includesToken(text, subject.state);
  const neighborhoodMatches = subject.neighborhood && includesToken(text, subject.neighborhood);
  const condoMatches = subject.condoName && includesToken(text, subject.condoName);

  if (condoMatches || neighborhoodMatches) return true;
  if (cityMatches && (!subject.state || stateMatches || normalizeText(comparable.state) === normalizeText(subject.state))) return true;
  return false;
}

function areaLooksComparable(subject: SubjectProfile, comparable: Pick<DeepMarketComparable, "areaM2">) {
  if (!subject.areaM2 || !comparable.areaM2) return true;
  const ratio = comparable.areaM2 / subject.areaM2;
  return ratio >= 0.35 && ratio <= 2.2;
}

function comparableHasListingValue(comparable: Pick<DeepMarketComparable, "listingType" | "askingPrice" | "monthlyRent">) {
  return comparable.listingType === "sale" ? comparable.askingPrice > 0 : comparable.monthlyRent > 0;
}

function isRelevantComparable(
  subject: SubjectProfile,
  comparable: Omit<DeepMarketComparable, "similarityScore" | "quality" | "notes" | "collectedAt">,
  score: number
) {
  if (!isAcceptableGroundedMarketSource(comparable.sourceUrl)) return false;
  if (!comparableHasListingValue(comparable)) return false;
  if (!propertyTypeCompatible(subject.propertyType, comparable.propertyType, comparable.title)) return false;
  if (!hasLocationEvidence(subject, comparable)) return false;
  if (!areaLooksComparable(subject, comparable)) return false;
  return score >= 45;
}

function scoreComparable(subject: SubjectProfile, comparable: Omit<DeepMarketComparable, "similarityScore" | "quality" | "notes" | "collectedAt">) {
  const text = `${comparable.title} ${comparable.address} ${comparable.neighborhood} ${comparable.city} ${comparable.state} ${comparable.sourceUrl}`;
  let score = 20;

  if (subject.state && includesToken(text, subject.state)) score += 8;
  if (subject.city && includesToken(text, subject.city)) score += 22;
  if (subject.neighborhood && includesToken(text, subject.neighborhood)) score += 12;
  if (subject.condoName && includesToken(text, subject.condoName)) score += 28;
  if (propertyTypeCompatible(subject.propertyType, comparable.propertyType, comparable.title)) score += 12;
  else score -= 26;

  if (subject.areaM2 && comparable.areaM2) {
    const delta = Math.abs(comparable.areaM2 - subject.areaM2) / subject.areaM2;
    if (delta <= 0.15) score += 14;
    else if (delta <= 0.3) score += 9;
    else if (delta <= 0.5) score += 4;
    else score -= 8;
  }

  if (subject.bedrooms && comparable.bedrooms) score += subject.bedrooms === comparable.bedrooms ? 6 : -2;
  if (subject.parkingSpaces && comparable.parkingSpaces) score += subject.parkingSpaces === comparable.parkingSpaces ? 5 : 0;
  if (comparable.listingType === "sale" && comparable.askingPrice) score += 6;
  if (comparable.listingType === "rent" && comparable.monthlyRent) score += 6;
  if (!includesToken(text, subject.city) && !includesToken(text, subject.condoName)) score -= 30;
  if (!isLikelyListingDetailUrl(comparable.sourceUrl)) score -= 24;

  return clampMarketScore(score);
}

function qualityFromScore(score: number): MarketComparableQuality {
  if (score >= 78) return "strong";
  if (score >= 58) return "medium";
  if (score >= 42) return "weak";
  return "discarded";
}

async function hydrateSearchResult(subject: SubjectProfile, result: SearchResult): Promise<DeepMarketComparable | null> {
  const fetched = await fetchText(result.url, PAGE_TIMEOUT_MS);
  const sourceUrl = fetched.finalUrl || result.url;
  if (!isAcceptableGroundedMarketSource(sourceUrl)) return null;
  const html = fetched.text;
  const pageTitle = extractTitle(html, result.title);
  const title = fetched.status >= 400 || /attention required|cloudflare|just a moment|access denied/i.test(pageTitle)
    ? result.title
    : pageTitle;
  const combinedText = stripTags(`${result.title} ${result.snippet} ${sourceUrl} ${html.slice(0, PAGE_TEXT_LIMIT)}`);
  const listingType = result.kind;
  const areaM2 = extractArea(combinedText);
  const askingPrice = listingType === "sale" ? extractSalePrice(combinedText) : 0;
  const monthlyRent = listingType === "rent" ? extractRentPrice(combinedText) : 0;
  const pricePerM2 = listingType === "sale" ? calculatePricePerM2(askingPrice, areaM2) : 0;
  const evidence = `${title} ${result.snippet} ${combinedText.slice(0, 4000)} ${sourceUrl}`;
  const comparableBase = {
    sourceLabel: sourceLabel(sourceUrl),
    sourceUrl,
    listingType,
    propertyType: inferPropertyType(`${title} ${combinedText.slice(0, 1000)}`),
    title,
    address: "",
    neighborhood: subject.neighborhood && includesToken(evidence, subject.neighborhood) ? subject.neighborhood : "",
    city: subject.city && includesToken(evidence, subject.city) ? subject.city : "",
    state: subject.state && includesToken(evidence, subject.state) ? subject.state : "",
    areaM2,
    askingPrice,
    monthlyRent,
    pricePerM2,
    bedrooms: extractSmallCount(combinedText, ["dormitorios", "quartos", "dorms"]),
    parkingSpaces: extractSmallCount(combinedText, ["vagas", "garagens"]),
  };
  const similarityScore = scoreComparable(subject, comparableBase);
  const quality = qualityFromScore(similarityScore);
  if (quality === "discarded" || !isRelevantComparable(subject, comparableBase, similarityScore)) return null;

  const notes = [
    subject.condoName && includesToken(`${title} ${combinedText}`, subject.condoName) ? "Mesmo condominio ou nome muito aderente." : "",
    areaM2 ? `Area capturada: ${areaM2} m2.` : "Area nao confirmada na pagina do comparavel.",
    fetched.status ? `HTTP ${fetched.status}.` : "Pagina do comparavel nao confirmou status HTTP.",
    result.provider === "google-grounding" ? "Referencia derivada de link real retornado pelo Google Search." : "",
  ].filter(Boolean).join(" ");

  return {
    ...comparableBase,
    similarityScore,
    quality,
    notes,
    collectedAt: new Date().toISOString(),
  };
}

function weightedAverage(values: Array<{ value: number; weight: number }>) {
  const totalWeight = values.reduce((total, item) => total + item.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(values.reduce((total, item) => total + item.value * item.weight, 0) / totalWeight);
}

function calculateMarketValue(subject: SubjectProfile, saleComparables: DeepMarketComparable[]) {
  const valid = saleComparables
    .filter((item) => item.quality !== "discarded" && item.similarityScore >= 45 && item.askingPrice > 0)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, 8);

  if (!valid.length) return { low: 0, base: 0, high: 0, confidenceBoost: 0 };

  const withArea = valid.filter((item) => item.pricePerM2 > 0 && item.areaM2 > 0);
  let base = 0;
  if (subject.areaM2 && withArea.length) {
    const sample = withArea.length >= 5
      ? withArea.sort((a, b) => a.pricePerM2 - b.pricePerM2).slice(1, -1)
      : withArea;
    const pricePerM2 = weightedAverage(sample.map((item) => ({
      value: item.pricePerM2,
      weight: Math.max(1, item.similarityScore),
    })));
    base = Math.round(pricePerM2 * subject.areaM2);
  } else {
    const sample = valid.length >= 5
      ? valid.sort((a, b) => a.askingPrice - b.askingPrice).slice(1, -1)
      : valid;
    base = weightedAverage(sample.map((item) => ({
      value: item.askingPrice,
      weight: Math.max(1, item.similarityScore),
    })));
  }

  const strongCount = valid.filter((item) => item.quality === "strong").length;
  return {
    low: base ? Math.round(base * 0.92) : 0,
    base,
    high: base ? Math.round(base * 1.08) : 0,
    confidenceBoost: Math.min(25, valid.length * 4 + strongCount * 3),
  };
}

function calculateRental(subject: SubjectProfile, rentalComparables: DeepMarketComparable[], marketValueBase: number) {
  const valid = rentalComparables
    .filter((item) => item.quality !== "discarded" && item.similarityScore >= 45 && item.monthlyRent > 0)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, 5);

  if (valid.length) {
    return {
      monthlyRent: weightedAverage(valid.map((item) => ({ value: item.monthlyRent, weight: Math.max(1, item.similarityScore) }))),
      referenceUrl: valid[0]?.sourceUrl || "",
      note: "Aluguel calculado por referencias encontradas na pesquisa automatica.",
    };
  }

  if (marketValueBase) {
    const type = normalizeText(subject.propertyType);
    const monthlyYield = type.includes("terreno") ? 0 : type.includes("comercial") ? 0.005 : 0.0042;
    return {
      monthlyRent: monthlyYield ? Math.round(marketValueBase * monthlyYield) : 0,
      referenceUrl: "",
      note: "Aluguel estimado por yield conservador interno; exige validacao manual com anuncio de locacao.",
    };
  }

  return { monthlyRent: 0, referenceUrl: "", note: "Sem base suficiente para estimar aluguel." };
}

function normalizeGroundedComparable(
  subject: SubjectProfile,
  value: unknown,
  fallbackKind: ListingKind,
  allowedSourceUrls: Set<string>
): DeepMarketComparable | null {
  const row = asRecord(value);
  const sourceUrl = cleanString(row.sourceUrl || row.source_url || row.url || row.link);
  if (!isAcceptableGroundedMarketSource(sourceUrl)) return null;
  if (!allowedSourceUrls.has(canonicalMarketUrl(sourceUrl))) return null;

  const kindText = normalizeText(row.listingType || row.listing_type || row.tipo || row.kind);
  const listingType: ListingKind = kindText.includes("alug") || kindText.includes("rent") || fallbackKind === "rent"
    ? "rent"
    : "sale";
  const areaM2 = asNumber(row.areaM2 ?? row.area_m2 ?? row.area ?? row.privateAreaM2 ?? row.private_area_m2);
  const askingPrice = listingType === "sale"
    ? asNumber(row.askingPrice ?? row.asking_price ?? row.price ?? row.preco ?? row.precoPedido ?? row.valorVenda)
    : 0;
  const monthlyRent = listingType === "rent"
    ? asNumber(row.monthlyRent ?? row.monthly_rent ?? row.rent ?? row.aluguel ?? row.aluguelMensal)
    : 0;
  if (listingType === "sale" && !askingPrice) return null;
  if (listingType === "rent" && !monthlyRent) return null;

  const title = cleanString(row.title || row.titulo, "Comparavel de mercado");
  const comparableBase = {
    sourceLabel: cleanString(row.sourceLabel || row.source_label, sourceLabel(sourceUrl)),
    sourceUrl,
    listingType,
    propertyType: cleanString(row.propertyType || row.property_type || row.tipoImovel, inferPropertyType(title)),
    title,
    address: cleanString(row.address || row.endereco),
    neighborhood: normalizeLocationName(row.neighborhood || row.bairro),
    city: normalizeLocationName(row.city || row.cidade),
    state: normalizeStateUf(row.state || row.uf),
    areaM2,
    askingPrice,
    monthlyRent,
    pricePerM2: listingType === "sale" ? calculatePricePerM2(askingPrice, areaM2) : 0,
    bedrooms: asNumber(row.bedrooms ?? row.dormitorios ?? row.quartos),
    parkingSpaces: asNumber(row.parkingSpaces ?? row.parking_spaces ?? row.vagas),
  };
  const rawScore = normalizeExternalSimilarityScore(row.similarityScore ?? row.similarity_score ?? row.similaridade);
  const calculatedScore = scoreComparable(subject, comparableBase);
  const similarityScore = clampMarketScore(rawScore ? Math.min(rawScore, calculatedScore + 8) : calculatedScore);
  const quality = normalizeComparableQuality(row.quality || row.qualidade, similarityScore);
  if (quality === "discarded" || !isRelevantComparable(subject, comparableBase, similarityScore)) return null;

  return {
    ...comparableBase,
    similarityScore,
    quality,
    notes: [cleanString(row.notes || row.observacoes || row.justificativa), "Link validado no grounding do Google Search."]
      .filter(Boolean)
      .join(" "),
    collectedAt: new Date().toISOString(),
  };
}

function normalizeGroundedComparableList(
  subject: SubjectProfile,
  value: unknown,
  fallbackKind: ListingKind,
  allowedSourceUrls: Set<string>
) {
  return (Array.isArray(value) ? value : [])
    .map((item) => normalizeGroundedComparable(subject, item, fallbackKind, allowedSourceUrls))
    .filter((item): item is DeepMarketComparable => Boolean(item))
    .slice(0, MAX_GROUNDED_COMPARABLES);
}

function mergeComparableLists(comparables: DeepMarketComparable[]) {
  const seen = new Set<string>();
  return comparables
    .filter((item) => item.quality !== "discarded")
    .filter((item) => {
      const key = `${item.listingType}:${item.sourceUrl.split("#")[0]}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, 14);
}

function uniqueSearchedUrls(
  values: MarketSearchUrl[]
): MarketSearchUrl[] {
  const seen = new Set<string>();
  const output: MarketSearchUrl[] = [];
  for (const item of values) {
    const url = cleanString(item.url);
    if (!url) continue;
    const key = url.split("#")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      label: cleanString(item.label, sourceLabel(url)),
      url,
      kind: item.kind,
    });
    if (output.length >= 40) break;
  }
  return output;
}

function collectGroundingLinks(response: unknown) {
  const candidates = Array.isArray((response as { candidates?: unknown[] })?.candidates)
    ? ((response as { candidates?: unknown[] }).candidates || [])
    : [];
  const firstCandidate = asRecord(candidates[0]);
  const metadata = asRecord(firstCandidate.groundingMetadata || firstCandidate.grounding_metadata);
  const chunks = Array.isArray(metadata.groundingChunks || metadata.grounding_chunks)
    ? ((metadata.groundingChunks || metadata.grounding_chunks) as unknown[])
    : [];
  const sourceLinks = chunks
    .reduce<MarketSearchUrl[]>((links, chunk) => {
      const web = asRecord(asRecord(chunk).web);
      const url = cleanString(web.uri || web.url);
      if (!isAcceptableGroundedMarketSource(url)) return links;
      const label = cleanString(web.title, sourceLabel(url));
      links.push({
        label,
        url,
        kind: inferListingKindFromText(`${label} ${url}`, "sale"),
      });
      return links;
    }, []);

  return {
    queries: asStringArray(metadata.webSearchQueries || metadata.web_search_queries),
    sourceLinks,
  };
}

function normalizeGroundedMarketResearch(
  subject: SubjectProfile,
  parsed: unknown,
  grounding: ReturnType<typeof collectGroundingLinks>
): DeepMarketResearchResult | null {
  const row = asRecord(parsed);
  const groundedSourceUrls = new Set(grounding.sourceLinks.map((source) => canonicalMarketUrl(source.url)));
  const rawSaleComparables = row.saleComparables || row.sale_comparables || row.comparaveisVenda || row.comparaveis_venda;
  const rawRentalComparables = row.rentalComparables || row.rental_comparables || row.comparaveisAluguel || row.comparaveis_aluguel;
  const saleComparables = normalizeGroundedComparableList(
    subject,
    rawSaleComparables,
    "sale",
    groundedSourceUrls
  );
  const rentalComparables = normalizeGroundedComparableList(
    subject,
    rawRentalComparables,
    "rent",
    groundedSourceUrls
  );
  if (!saleComparables.length && !rentalComparables.length) return null;

  const calculatedMarket = calculateMarketValue(subject, saleComparables);
  const marketValueBase = firstPositive(
    asNumber(row.marketValueBase ?? row.market_value_base ?? row.valorMercadoBase ?? row.valor_mercado_base),
    calculatedMarket.base
  );
  const marketValueLow = firstPositive(
    asNumber(row.marketValueLow ?? row.market_value_low ?? row.valorMercadoConservador),
    calculatedMarket.low,
    marketValueBase ? Math.round(marketValueBase * 0.92) : 0
  );
  const marketValueHigh = firstPositive(
    asNumber(row.marketValueHigh ?? row.market_value_high ?? row.valorMercadoOtimista),
    calculatedMarket.high,
    marketValueBase ? Math.round(marketValueBase * 1.08) : 0
  );
  const rental = calculateRental(subject, rentalComparables, marketValueBase);
  const rentalMonthlyRent = firstPositive(
    asNumber(row.rentalMonthlyRent ?? row.rental_monthly_rent ?? row.aluguelMensal),
    rental.monthlyRent
  );
  const rentalReferenceUrl = cleanString(row.rentalReferenceUrl || row.rental_reference_url, rental.referenceUrl);
  const missingFields = new Set(asStringArray(row.missingFields || row.missing_fields || row.pendencias));
  const cautionNotes = new Set(asStringArray(row.cautionNotes || row.caution_notes || row.ressalvas));
  const rawComparableCount =
    (Array.isArray(rawSaleComparables) ? rawSaleComparables.length : 0) +
    (Array.isArray(rawRentalComparables) ? rawRentalComparables.length : 0);
  const acceptedComparableCount = saleComparables.length + rentalComparables.length;

  if (!marketValueBase) missingFields.add("valor de mercado por comparaveis");
  if (saleComparables.length < MIN_SALE_REFERENCES) missingFields.add(`minimo de ${MIN_SALE_REFERENCES} comparaveis de venda`);
  if (rentalComparables.length < MIN_RENT_REFERENCES) missingFields.add("referencia direta de aluguel");
  if (!subject.areaM2) missingFields.add("area para preco por m2");
  if (rawComparableCount > acceptedComparableCount) {
    cautionNotes.add(`${rawComparableCount - acceptedComparableCount} referencia(s) descartada(s) por link sem grounding do Google, URL invalida ou baixa aderencia.`);
  }
  cautionNotes.add("Pesquisa com Gemini e Google Search; conferir links e aderencia antes de aprovar.");

  const comparableLinks = [
    ...saleComparables.map((item) => ({ label: `Gemini venda: ${item.sourceLabel}`, url: item.sourceUrl, kind: "sale" as const })),
    ...rentalComparables.map((item) => ({ label: `Gemini aluguel: ${item.sourceLabel}`, url: item.sourceUrl, kind: "rent" as const })),
  ];
  const confidenceScore = clampMarketScore(
    firstPositive(asNumber(row.confidenceScore ?? row.confidence_score ?? row.confianca), 0) ||
      ((marketValueBase ? 50 : 25) +
        Math.min(24, saleComparables.length * 6) +
        Math.min(12, rentalComparables.length * 6) +
        (saleComparables.some((item) => item.quality === "strong") ? 8 : 0) -
        Math.max(0, missingFields.size - 1) * 5)
  );

  return {
    status: marketValueBase && saleComparables.length >= MIN_SALE_REFERENCES ? "completed" : "partial",
    searchQueries: uniqueStrings([
      ...asStringArray(row.searchQueries || row.search_queries || row.buscas),
      ...grounding.queries,
    ], 12),
    searchedUrls: uniqueSearchedUrls([...comparableLinks, ...grounding.sourceLinks]),
    saleComparables,
    rentalComparables,
    marketValueLow,
    marketValueBase,
    marketValueHigh,
    rentalMonthlyRent,
    rentalReferenceUrl,
    confidenceScore,
    liquidityScore: clampMarketScore(firstPositive(asNumber(row.liquidityScore ?? row.liquidity_score), 0) || 45 + saleComparables.length * 5),
    estimatedCosts: buildEstimatedCosts(subject.initialBid, marketValueBase),
    missingFields: uniqueStrings(Array.from(missingFields), 12),
    cautionNotes: uniqueStrings(Array.from(cautionNotes), 12),
  };
}

async function generateGeminiGroundedContent(input: {
  apiKey: string;
  model: string;
  prompt: string;
  systemInstruction: string;
}) {
  const { DynamicRetrievalMode, GoogleGenerativeAI } = await import("@google/generative-ai");
  const client = new GoogleGenerativeAI(input.apiKey);
  const toolAttempts = [
    {
      label: "googleSearch",
      tools: [{ googleSearch: {} }],
    },
    {
      label: "googleSearchRetrieval",
      tools: [
        {
          googleSearchRetrieval: {
            dynamicRetrievalConfig: {
              mode: DynamicRetrievalMode.MODE_DYNAMIC,
              dynamicThreshold: 0,
            },
          },
        },
      ],
    },
  ];

  let lastError = "";
  const modelCandidates = uniqueStrings([
    normalizeGeminiModel(input.model),
    "gemini-2.5-flash",
    "gemini-2.0-flash",
  ], 4);
  for (const model of modelCandidates) {
    for (const attempt of toolAttempts) {
      try {
        const genModel = client.getGenerativeModel({
          model,
          tools: attempt.tools,
          generationConfig: {
            temperature: 0.1,
            topP: 0.8,
          },
          systemInstruction: input.systemInstruction,
        } as unknown as Parameters<typeof client.getGenerativeModel>[0]);
        const result = await genModel.generateContent(input.prompt, { timeout: GEMINI_GROUNDED_TIMEOUT_MS });
        return {
          response: result.response,
          rawText: result.response.text(),
          toolName: `${attempt.label}/${model}`,
        };
      } catch (error) {
        lastError = error instanceof Error ? `${attempt.label}/${model}: ${error.message}` : `Falha usando ${attempt.label}/${model}.`;
      }
    }
  }

  throw new Error(lastError || "Falha na pesquisa Gemini/Google.");
}

async function runGeminiGroundedMarketResearch(input: {
  extraction: AuctionLinkExtraction;
  title: string;
  initialBid: number;
}, subject: SubjectProfile): Promise<{
  research: DeepMarketResearchResult | null;
  error: string;
  grounding?: ReturnType<typeof collectGroundingLinks>;
}> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) return { research: null, error: "Gemini nao configurado para pesquisa com Google." };

  const model = await getGeminiModel();
  const subjectPayload = {
    title: input.title,
    propertyType: subject.propertyType,
    address: subject.address,
    neighborhood: subject.neighborhood,
    condoName: subject.condoName,
    city: subject.city,
    state: subject.state,
    areaM2: subject.areaM2,
    bedrooms: subject.bedrooms,
    parkingSpaces: subject.parkingSpaces,
    initialBid: input.initialBid,
  };

  try {
    const systemInstruction = [
      "Voce e o motor de curadoria imobiliaria da Betel.",
      "Use Google Search para encontrar referencias atuais de venda e aluguel de imoveis comparaveis.",
      "Retorne somente JSON valido, sem markdown.",
      "Nunca use leiloes, editais, anuncios de arrematacao ou a propria pagina do leilao como comparavel de mercado.",
      "Se uma informacao nao estiver sustentada por fonte, deixe pendente e explique em cautionNotes.",
      "Prefira precisao a velocidade. Qualidade e confiabilidade sao mais importantes que completar a qualquer custo.",
    ].join("\n");
    const prompt = [
      "Monte uma pesquisa de mercado profunda para o imovel abaixo.",
      "Busque no Google referencias reais de venda e aluguel na mesma cidade, bairro, condominio/loteamento ou padrao equivalente.",
      "Retorne JSON exatamente neste formato:",
      JSON.stringify({
        status: "completed|partial|skipped",
        searchQueries: ["consulta usada"],
        saleComparables: [
          {
            sourceLabel: "Portal ou imobiliaria",
            sourceUrl: "https://...",
            listingType: "sale",
            propertyType: "apartamento|casa|terreno|comercial|imovel",
            title: "Titulo do anuncio",
            address: "Endereco/bairro quando houver",
            neighborhood: "Bairro",
            city: "Cidade",
            state: "UF",
            areaM2: 0,
            askingPrice: 0,
            monthlyRent: 0,
            bedrooms: 0,
            parkingSpaces: 0,
            similarityScore: 0,
            quality: "strong|medium|weak|discarded",
            notes: "Por que e comparavel",
          },
        ],
        rentalComparables: [
          {
            sourceLabel: "Portal ou imobiliaria",
            sourceUrl: "https://...",
            listingType: "rent",
            propertyType: "apartamento|casa|terreno|comercial|imovel",
            title: "Titulo do anuncio",
            address: "Endereco/bairro quando houver",
            neighborhood: "Bairro",
            city: "Cidade",
            state: "UF",
            areaM2: 0,
            askingPrice: 0,
            monthlyRent: 0,
            bedrooms: 0,
            parkingSpaces: 0,
            similarityScore: 0,
            quality: "strong|medium|weak|discarded",
            notes: "Por que e comparavel",
          },
        ],
        marketValueLow: 0,
        marketValueBase: 0,
        marketValueHigh: 0,
        rentalMonthlyRent: 0,
        rentalReferenceUrl: "https://...",
        confidenceScore: 0,
        liquidityScore: 0,
        missingFields: ["pendencia"],
        cautionNotes: ["ressalva"],
      }),
      "",
      "Regras:",
      "- Use no minimo 3 comparaveis de venda quando existirem fontes aderentes.",
      "- Use pelo menos 1 comparavel de aluguel quando existir fonte aderente.",
      "- Para casas/sobrados, diferencie terreno, area construida, bairro e padrao.",
      "- Para apartamentos, priorize mesmo condominio, bairro, area privativa, dormitorios e vagas.",
      "- Para terrenos/lotes, priorize mesmo loteamento/bairro, area, zoneamento e preco por m2.",
      "- Use apenas links de detalhe do anuncio comparavel; nunca use pagina de busca, categoria, mapa ou resultado geral.",
      "- Copie somente URLs reais encontradas nos resultados do Google Search. Nao monte, encurte, corrija ou invente slugs de anuncio.",
      "- Descarte anuncios sem evidencia clara da cidade/bairro ou de tipo de imovel compativel com o alvo.",
      "- Se o valor de mercado for estimado com poucos comparaveis, reduza confidenceScore e explique.",
      "- Nao invente links, valores, areas, quartos ou vagas.",
      "",
      `Imovel alvo: ${JSON.stringify(subjectPayload)}`,
      `Extracao da pagina de leilao: ${JSON.stringify(input.extraction)}`,
    ].join("\n");

    const grounded = await generateGeminiGroundedContent({ apiKey, model, prompt, systemInstruction });
    const grounding = collectGroundingLinks(grounded.response);
    const parsed = pickJsonObject(grounded.rawText);
    if (!parsed) {
      return {
        research: null,
        grounding,
        error: "Gemini/Google retornou resposta sem JSON estruturado.",
      };
    }

    const research = normalizeGroundedMarketResearch(subject, parsed, grounding);
    if (research) {
      research.cautionNotes = uniqueStrings([
        `Pesquisa Gemini/Google executada com ${grounded.toolName}.`,
        ...research.cautionNotes,
      ], 12);
    }
    return {
      research,
      grounding,
      error: research ? "" : "Gemini/Google nao retornou comparaveis aproveitaveis.",
    };
  } catch (error) {
    return {
      research: null,
      error: error instanceof Error ? error.message : "Falha na pesquisa Gemini/Google.",
    };
  }
}

function buildEstimatedCosts(initialBid: number, marketValueBase: number): MarketCostItem[] {
  const bid = initialBid || 0;
  const market = marketValueBase || 0;
  return [
    {
      label: "Comissao leiloeiro",
      value: bid ? Math.round(bid * 0.05) : 0,
      detail: "Estimativa padrao de 5% sobre o lance; confirmar edital.",
    },
    {
      label: "ITBI estimado",
      value: bid ? Math.round(bid * 0.03) : 0,
      detail: "Parametro conservador de 3%; aliquota muda por municipio.",
    },
    {
      label: "Registro/cartorio",
      value: bid ? Math.max(1500, Math.round(bid * 0.01)) : 0,
      detail: "Estimativa inicial para registro e emolumentos.",
    },
    {
      label: "Reserva tecnica",
      value: market ? Math.round(market * 0.02) : 0,
      detail: "Reserva para regularizacao, diligencias, pequenos reparos e imprevistos.",
    },
  ];
}

export async function runDeepMarketResearch(input: {
  extraction: AuctionLinkExtraction;
  title: string;
  initialBid: number;
}) {
  const subject = buildSubjectProfile(input);
  const missingFields: string[] = [];
  const cautionNotes: string[] = [];

  if (!subject.city || !subject.state) {
    return {
      status: "skipped",
      searchQueries: [],
      searchedUrls: [],
      saleComparables: [],
      rentalComparables: [],
      marketValueLow: 0,
      marketValueBase: 0,
      marketValueHigh: 0,
      rentalMonthlyRent: 0,
      rentalReferenceUrl: "",
      confidenceScore: 0,
      liquidityScore: 0,
      estimatedCosts: buildEstimatedCosts(input.initialBid, 0),
      missingFields: ["cidade/uf para pesquisa de mercado"],
      cautionNotes: ["Pesquisa de mercado ignorada: cidade/UF nao foram confirmadas."],
    } satisfies DeepMarketResearchResult;
  }

  const groundedAttempt = await runGeminiGroundedMarketResearch(input, subject);
  const groundedResearch = groundedAttempt.research;
  const needsFallbackSearch =
    !groundedResearch ||
    !groundedResearch.marketValueBase ||
    groundedResearch.saleComparables.length < MIN_SALE_REFERENCES ||
    groundedResearch.rentalComparables.length < MIN_RENT_REFERENCES;

  const search = needsFallbackSearch
    ? await searchMarketResults(subject)
    : {
        searchQueries: [] as string[],
        searchedUrls: [] as Array<{ label: string; url: string; kind: ListingKind }>,
        results: [] as SearchResult[],
      };
  const saleResults = search.results.filter((item) => item.kind === "sale").slice(0, MAX_SALE_PAGES);
  const rentResults = search.results.filter((item) => item.kind === "rent").slice(0, MAX_RENT_PAGES);
  const groundedResults = needsFallbackSearch
    ? (groundedAttempt.grounding?.sourceLinks || []).map(searchResultFromMarketSource)
    : [];
  const fallbackResults = uniqueSearchResults([...groundedResults, ...saleResults, ...rentResults]);
  const hydrated = needsFallbackSearch
    ? await Promise.all(fallbackResults.map((result) => hydrateSearchResult(subject, result)))
    : [];
  const comparables = hydrated.filter((item): item is DeepMarketComparable => Boolean(item));
  const saleComparables = mergeComparableLists([
    ...(groundedResearch?.saleComparables || []),
    ...comparables.filter((item) => item.listingType === "sale"),
  ]);
  const rentalComparables = mergeComparableLists([
    ...(groundedResearch?.rentalComparables || []),
    ...comparables.filter((item) => item.listingType === "rent"),
  ]);
  const calculatedMarketValue = calculateMarketValue(subject, saleComparables);
  const marketValue = {
    low: firstPositive(calculatedMarketValue.low, groundedResearch?.marketValueLow || 0),
    base: firstPositive(calculatedMarketValue.base, groundedResearch?.marketValueBase || 0),
    high: firstPositive(calculatedMarketValue.high, groundedResearch?.marketValueHigh || 0),
    confidenceBoost: calculatedMarketValue.confidenceBoost,
  };
  const rental = calculateRental(subject, rentalComparables, marketValue.base);
  const rentalMonthlyRent = firstPositive(rental.monthlyRent, groundedResearch?.rentalMonthlyRent || 0);
  const rentalReferenceUrl = firstText(rental.referenceUrl, groundedResearch?.rentalReferenceUrl || "");

  if (saleComparables.length < MIN_SALE_REFERENCES) missingFields.push(`minimo de ${MIN_SALE_REFERENCES} comparaveis de venda`);
  if (!marketValue.base) missingFields.push("valor de mercado por comparaveis");
  if (rentalComparables.length < MIN_RENT_REFERENCES) missingFields.push("referencia direta de aluguel");
  if (!subject.areaM2) missingFields.push("area para preco por m2");
  (groundedResearch?.missingFields || []).forEach((field) => missingFields.push(field));
  if (groundedAttempt.error) cautionNotes.push(`Pesquisa Gemini/Google: ${groundedAttempt.error}`);
  cautionNotes.push(...(groundedResearch?.cautionNotes || []));
  if (needsFallbackSearch && !search.results.length && !groundedResults.length && !(groundedResearch?.searchedUrls.length)) {
    cautionNotes.push("Nenhum resultado de mercado aderente foi encontrado na busca automatica.");
  }
  if (saleComparables.length && saleComparables.length < MIN_SALE_REFERENCES) {
    cautionNotes.push(`Apenas ${saleComparables.length} comparavel(is) de venda aderente(s); revisar manualmente antes de aprovar.`);
  }
  if (!rentalComparables.length && rentalMonthlyRent) cautionNotes.push(rental.note);

  const calculatedConfidenceScore = clampMarketScore(
    (marketValue.base ? 48 : 20) +
      marketValue.confidenceBoost +
      Math.min(12, rentalComparables.length * 4) +
      (subject.condoName && saleComparables.some((item) => includesToken(item.title, subject.condoName)) ? 8 : 0) -
      Math.max(0, missingFields.length - 1) * 6
  );
  const confidenceScore = groundedResearch?.confidenceScore
    ? clampMarketScore(Math.round((calculatedConfidenceScore + groundedResearch.confidenceScore) / 2))
    : calculatedConfidenceScore;

  return {
    status: marketValue.base && saleComparables.length >= MIN_SALE_REFERENCES ? "completed" : "partial",
    searchQueries: uniqueStrings([
      ...(groundedResearch?.searchQueries || []),
      ...(groundedAttempt.grounding?.queries || []),
      ...search.searchQueries,
    ], 18),
    searchedUrls: uniqueSearchedUrls([
      ...(groundedResearch?.searchedUrls || []),
      ...(groundedAttempt.grounding?.sourceLinks || []),
      ...search.searchedUrls,
    ]),
    saleComparables,
    rentalComparables,
    marketValueLow: marketValue.low,
    marketValueBase: marketValue.base,
    marketValueHigh: marketValue.high,
    rentalMonthlyRent,
    rentalReferenceUrl,
    confidenceScore,
    liquidityScore: clampMarketScore(45 + Math.min(25, saleComparables.length * 5) + Math.min(15, rentalComparables.length * 5)),
    estimatedCosts: buildEstimatedCosts(input.initialBid, marketValue.base),
    missingFields: uniqueStrings(missingFields, 12),
    cautionNotes: uniqueStrings(cautionNotes, 12),
  } satisfies DeepMarketResearchResult;
}
