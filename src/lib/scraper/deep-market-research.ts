import "server-only";

import {
  calculatePricePerM2,
  clampMarketScore,
  type MarketComparableQuality,
  type MarketCostItem,
} from "@/lib/admin/market-analysis";
import type { AuctionLinkExtraction } from "./auction-link-extractor";

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
  provider: "bing" | "duckduckgo";
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
const MAX_SALE_PAGES = 8;
const MAX_RENT_PAGES = 4;

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

function currencyFromText(value: string) {
  const parsed = asNumber(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function firstPositive(...values: number[]) {
  return values.find((value) => Number.isFinite(value) && value > 0) || 0;
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
    city: input.extraction.city,
    state: input.extraction.state,
    neighborhood: input.extraction.neighborhood,
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
  const saleQueries = uniqueStrings([
    subject.condoName ? compactQuery([`"${subject.condoName}"`, type, "venda", cityUf]) : "",
    microLocation ? compactQuery([primaryType, "venda", microLocation, cityUf, area]) : "",
    titleText.includes("sobrado") ? compactQuery(["casa", "venda", microLocation, cityUf, area]) : "",
    compactQuery([type, "alto padrao", "venda", subject.city, subject.state, area]),
    compactQuery([type, "venda", subject.neighborhood, subject.city, subject.state, area]),
    street ? compactQuery([street, type, "venda", subject.city, subject.state]) : "",
  ], 6);
  const rentQueries = uniqueStrings([
    subject.condoName ? compactQuery([`"${subject.condoName}"`, type, "aluguel", cityUf]) : "",
    microLocation ? compactQuery([primaryType, "aluguel", microLocation, cityUf, area]) : "",
    compactQuery([type, "aluguel", subject.neighborhood, subject.city, subject.state, area]),
  ], 3);

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

  return {
    searchQueries: searches.map((item) => item.query),
    searchedUrls: pages.map((item) => ({ label: `${item.provider}: ${item.query}`, url: item.url, kind: item.kind })),
    results: uniqueResults,
  };
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

function scoreComparable(subject: SubjectProfile, comparable: Omit<DeepMarketComparable, "similarityScore" | "quality" | "notes" | "collectedAt">) {
  const text = `${comparable.title} ${comparable.address} ${comparable.neighborhood} ${comparable.city} ${comparable.state} ${comparable.sourceUrl}`;
  let score = 20;

  if (subject.state && includesToken(text, subject.state)) score += 8;
  if (subject.city && includesToken(text, subject.city)) score += 22;
  if (subject.neighborhood && includesToken(text, subject.neighborhood)) score += 12;
  if (subject.condoName && includesToken(text, subject.condoName)) score += 28;
  if (subject.propertyType && includesToken(text, subject.propertyType)) score += 12;

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
  const html = fetched.text;
  const combinedText = stripTags(`${result.title} ${result.snippet} ${html.slice(0, PAGE_TEXT_LIMIT)}`);
  const title = extractTitle(html, result.title);
  const listingType = result.kind;
  const areaM2 = extractArea(combinedText);
  const askingPrice = listingType === "sale" ? extractSalePrice(combinedText) : 0;
  const monthlyRent = listingType === "rent" ? extractRentPrice(combinedText) : 0;
  const pricePerM2 = listingType === "sale" ? calculatePricePerM2(askingPrice, areaM2) : 0;
  const comparableBase = {
    sourceLabel: sourceLabel(fetched.finalUrl || result.url),
    sourceUrl: fetched.finalUrl || result.url,
    listingType,
    propertyType: inferPropertyType(`${title} ${combinedText.slice(0, 1000)}`),
    title,
    address: "",
    neighborhood: subject.neighborhood,
    city: subject.city,
    state: subject.state,
    areaM2,
    askingPrice,
    monthlyRent,
    pricePerM2,
    bedrooms: extractSmallCount(combinedText, ["dormitorios", "quartos", "dorms"]),
    parkingSpaces: extractSmallCount(combinedText, ["vagas", "garagens"]),
  };
  const similarityScore = scoreComparable(subject, comparableBase);
  const quality = qualityFromScore(similarityScore);
  const hasValue = listingType === "sale" ? askingPrice > 0 : monthlyRent > 0;
  if (!hasValue || quality === "discarded") return null;

  const notes = [
    subject.condoName && includesToken(`${title} ${combinedText}`, subject.condoName) ? "Mesmo condominio ou nome muito aderente." : "",
    areaM2 ? `Area capturada: ${areaM2} m2.` : "Area nao confirmada na pagina do comparavel.",
    fetched.status ? `HTTP ${fetched.status}.` : "Pagina do comparavel nao confirmou status HTTP.",
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

  const search = await searchMarketResults(subject);
  const saleResults = search.results.filter((item) => item.kind === "sale").slice(0, MAX_SALE_PAGES);
  const rentResults = search.results.filter((item) => item.kind === "rent").slice(0, MAX_RENT_PAGES);
  const hydrated = await Promise.all([...saleResults, ...rentResults].map((result) => hydrateSearchResult(subject, result)));
  const comparables = hydrated.filter((item): item is DeepMarketComparable => Boolean(item));
  const saleComparables = comparables.filter((item) => item.listingType === "sale").sort((a, b) => b.similarityScore - a.similarityScore);
  const rentalComparables = comparables.filter((item) => item.listingType === "rent").sort((a, b) => b.similarityScore - a.similarityScore);
  const marketValue = calculateMarketValue(subject, saleComparables);
  const rental = calculateRental(subject, rentalComparables, marketValue.base);

  if (saleComparables.length < 3) missingFields.push("minimo de 3 comparaveis de venda");
  if (!marketValue.base) missingFields.push("valor de mercado por comparaveis");
  if (!rentalComparables.length) missingFields.push("referencia direta de aluguel");
  if (!subject.areaM2) missingFields.push("area para preco por m2");
  if (!search.results.length) cautionNotes.push("Nenhum resultado de mercado aderente foi encontrado na busca automatica.");
  if (saleComparables.length && saleComparables.length < 3) {
    cautionNotes.push(`Apenas ${saleComparables.length} comparavel(is) de venda aderente(s); revisar manualmente antes de aprovar.`);
  }
  if (!rentalComparables.length && rental.monthlyRent) cautionNotes.push(rental.note);

  const confidenceScore = clampMarketScore(
    (marketValue.base ? 48 : 20) +
      marketValue.confidenceBoost +
      Math.min(12, rentalComparables.length * 4) +
      (subject.condoName && saleComparables.some((item) => includesToken(item.title, subject.condoName)) ? 8 : 0) -
      Math.max(0, missingFields.length - 1) * 6
  );

  return {
    status: marketValue.base ? "completed" : "partial",
    searchQueries: search.searchQueries,
    searchedUrls: search.searchedUrls,
    saleComparables,
    rentalComparables,
    marketValueLow: marketValue.low,
    marketValueBase: marketValue.base,
    marketValueHigh: marketValue.high,
    rentalMonthlyRent: rental.monthlyRent,
    rentalReferenceUrl: rental.referenceUrl,
    confidenceScore,
    liquidityScore: clampMarketScore(45 + Math.min(25, saleComparables.length * 5) + Math.min(15, rentalComparables.length * 5)),
    estimatedCosts: buildEstimatedCosts(input.initialBid, marketValue.base),
    missingFields: uniqueStrings(missingFields, 12),
    cautionNotes: uniqueStrings(cautionNotes, 12),
  } satisfies DeepMarketResearchResult;
}
