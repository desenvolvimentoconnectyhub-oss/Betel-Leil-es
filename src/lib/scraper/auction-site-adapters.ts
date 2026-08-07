import "server-only";

import { extractImageUrlsFromHtml } from "./scraper-strategies";
import { sortLikelyPropertyImageUrls } from "./quality";

export type AuctionSiteDocument = {
  label: string;
  url: string;
  kind: string;
};

export type AuctionSiteExtractionPatch = {
  title?: string;
  propertyType?: string;
  address?: string;
  city?: string;
  state?: string;
  neighborhood?: string;
  landAreaM2?: number;
  builtAreaM2?: number;
  privateAreaM2?: number;
  bedrooms?: number;
  parkingSpaces?: number;
  initialBid?: number;
  appraisalValue?: number;
  auctionDate?: string;
  paymentCondition?: string;
  occupancy?: string;
  legalSignal?: string;
  summary?: string;
  cautionNotes?: string;
  confidenceScore?: number;
  missingFields?: string[];
};

export type AuctionSiteContext = {
  adapterKey: string;
  adapterName: string;
  extraction: AuctionSiteExtractionPatch;
  imageUrls: string[];
  documents: AuctionSiteDocument[];
  llmContext: string;
  warnings: string[];
};

type AdapterProfile = {
  key: string;
  name: string;
  domains: string[];
  initialBidLabels: string[];
  appraisalLabels: string[];
  auctionDateLabels: string[];
  paymentLabels: string[];
  occupancyLabels: string[];
  legalLabels: string[];
  areaLabels: {
    privateAreaM2: string[];
    builtAreaM2: string[];
    landAreaM2: string[];
  };
  documentSignals: string[];
};

const COMMON_INITIAL_BID_LABELS = [
  "lance inicial",
  "lance minimo",
  "lance minimo inicial",
  "valor minimo",
  "valor minimo de venda",
  "preco minimo",
  "maior lance",
  "lance atual",
  "valor do lance",
];

const COMMON_APPRAISAL_LABELS = [
  "valor de avaliacao",
  "avaliacao",
  "valor avaliado",
  "valor do imovel",
  "valor de mercado",
];

const COMMON_DATE_LABELS = [
  "data do leilao",
  "data de encerramento",
  "encerramento",
  "fecha em",
  "termina em",
  "fim do leilao",
  "1 leilao",
  "2 leilao",
];

const COMMON_PAYMENT_LABELS = ["forma de pagamento", "condicao de pagamento", "pagamento", "pagamento aceito"];
const COMMON_OCCUPANCY_LABELS = ["ocupacao", "situacao do imovel", "imovel ocupado", "imovel desocupado"];
const COMMON_LEGAL_LABELS = ["onus", "acao", "processo", "propter rem", "posse", "matricula", "edital"];

const COMMON_AREA_LABELS = {
  privateAreaM2: ["area privativa", "area util", "area do apartamento"],
  builtAreaM2: ["area construida", "area total construida", "area edificada"],
  landAreaM2: ["area do terreno", "terreno", "area total", "area do lote"],
};

const COMMON_DOCUMENT_SIGNALS = [
  "edital",
  "matricula",
  "laudo",
  "anexo",
  "documento",
  "certidao",
  "processo",
  "cri",
  "download",
  "arquivo",
];

const PROFILES: AdapterProfile[] = [
  {
    key: "superbid",
    name: "Superbid",
    domains: ["superbid.net", "superbid.com.br"],
    initialBidLabels: ["oferta inicial", "lance atual", ...COMMON_INITIAL_BID_LABELS],
    appraisalLabels: ["avaliacao do bem", "valor de venda", ...COMMON_APPRAISAL_LABELS],
    auctionDateLabels: ["fim da oferta", "encerramento da oferta", ...COMMON_DATE_LABELS],
    paymentLabels: COMMON_PAYMENT_LABELS,
    occupancyLabels: COMMON_OCCUPANCY_LABELS,
    legalLabels: COMMON_LEGAL_LABELS,
    areaLabels: COMMON_AREA_LABELS,
    documentSignals: [...COMMON_DOCUMENT_SIGNALS, "termo", "condicoes"],
  },
  {
    key: "faleiloes",
    name: "Faleiloes",
    domains: ["faleiloes.com.br"],
    initialBidLabels: ["lance minimo", "valor minimo", ...COMMON_INITIAL_BID_LABELS],
    appraisalLabels: ["valor de avaliacao", "avaliado em", ...COMMON_APPRAISAL_LABELS],
    auctionDateLabels: ["data e hora", "inicio do leilao", ...COMMON_DATE_LABELS],
    paymentLabels: COMMON_PAYMENT_LABELS,
    occupancyLabels: COMMON_OCCUPANCY_LABELS,
    legalLabels: COMMON_LEGAL_LABELS,
    areaLabels: COMMON_AREA_LABELS,
    documentSignals: COMMON_DOCUMENT_SIGNALS,
  },
  {
    key: "flexleiloes",
    name: "Flex Leiloes",
    domains: ["flexleiloes.com.br"],
    initialBidLabels: ["lance minimo", "valor minimo", "2 leilao", ...COMMON_INITIAL_BID_LABELS],
    appraisalLabels: ["avaliacao", "valor da avaliacao", ...COMMON_APPRAISAL_LABELS],
    auctionDateLabels: ["data do leilao", "encerramento", ...COMMON_DATE_LABELS],
    paymentLabels: COMMON_PAYMENT_LABELS,
    occupancyLabels: COMMON_OCCUPANCY_LABELS,
    legalLabels: COMMON_LEGAL_LABELS,
    areaLabels: COMMON_AREA_LABELS,
    documentSignals: COMMON_DOCUMENT_SIGNALS,
  },
  {
    key: "lance-no-leilao",
    name: "Lance no Leilao",
    domains: ["lancenoleilao.com.br"],
    initialBidLabels: ["lance inicial", "lance minimo", ...COMMON_INITIAL_BID_LABELS],
    appraisalLabels: ["valor de avaliacao", "avaliacao", ...COMMON_APPRAISAL_LABELS],
    auctionDateLabels: ["data do leilao", "data final", ...COMMON_DATE_LABELS],
    paymentLabels: COMMON_PAYMENT_LABELS,
    occupancyLabels: COMMON_OCCUPANCY_LABELS,
    legalLabels: COMMON_LEGAL_LABELS,
    areaLabels: COMMON_AREA_LABELS,
    documentSignals: COMMON_DOCUMENT_SIGNALS,
  },
  {
    key: "leilao-br",
    name: "Plataforma Leilao.br",
    domains: ["leilao.br"],
    initialBidLabels: ["lance minimo", "lance inicial", "valor minimo", ...COMMON_INITIAL_BID_LABELS],
    appraisalLabels: ["avaliacao", "valor de avaliacao", ...COMMON_APPRAISAL_LABELS],
    auctionDateLabels: ["data do leilao", "encerramento", "data de encerramento", ...COMMON_DATE_LABELS],
    paymentLabels: COMMON_PAYMENT_LABELS,
    occupancyLabels: COMMON_OCCUPANCY_LABELS,
    legalLabels: COMMON_LEGAL_LABELS,
    areaLabels: COMMON_AREA_LABELS,
    documentSignals: [...COMMON_DOCUMENT_SIGNALS, "lote"],
  },
  {
    key: "sato-leiloes",
    name: "Sato Leiloes",
    domains: ["satoleiloes.com.br"],
    initialBidLabels: ["proximo lance", "lance inicial", "valor do lance", ...COMMON_INITIAL_BID_LABELS],
    appraisalLabels: ["avaliacao comitente", ...COMMON_APPRAISAL_LABELS],
    auctionDateLabels: ["1 leilao", "2 leilao", "datahora pregao", ...COMMON_DATE_LABELS],
    paymentLabels: COMMON_PAYMENT_LABELS,
    occupancyLabels: COMMON_OCCUPANCY_LABELS,
    legalLabels: COMMON_LEGAL_LABELS,
    areaLabels: COMMON_AREA_LABELS,
    documentSignals: [...COMMON_DOCUMENT_SIGNALS, "todos"],
  },
];

function cleanString(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value: string) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00b2/g, "2")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string) {
  return cleanString(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style[\s\S]*?<\/style>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article|dd|dt)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function moneyToNumber(value: string) {
  const normalized = cleanString(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const clean = cleanString(value);
  if (!clean) return 0;
  const numeric = clean.replace(/[^\d,.-]/g, "");
  if (/^-?\d+(?:\.\d+)?$/.test(numeric)) {
    const parsed = Number(numeric);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return moneyToNumber(clean);
}

function areaToNumber(value: string) {
  const normalized = cleanString(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function findAfterLabels(text: string, labels: string[], pattern: RegExp) {
  const normalized = normalizeText(text);
  for (const label of labels) {
    const index = normalized.indexOf(normalizeText(label));
    if (index < 0) continue;
    const slice = normalized.slice(index, index + 260);
    const match = slice.match(pattern);
    if (match?.[1]) return cleanString(match[1]);
  }
  return "";
}

function findMoneyAfterLabels(text: string, labels: string[]) {
  const value = findAfterLabels(text, labels, /(?:r\$\s*)?([\d.]+,\d{2})/i);
  return value ? moneyToNumber(value) : 0;
}

function findAreaAfterLabels(text: string, labels: string[]) {
  const value = findAfterLabels(text, labels, /([\d.]+(?:,\d{1,2})?|\d+)\s*m(?:2|\u00b2)/i);
  return value ? areaToNumber(value) : 0;
}

function findDateAfterLabels(text: string, labels: string[]) {
  return findAfterLabels(text, labels, /(\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s+\d{1,2}:\d{2})?|\d{4}-\d{2}-\d{2})/i);
}

function dateFromUnknown(value: unknown) {
  const clean = cleanString(value);
  if (!clean) return "";
  return clean.match(/\d{4}-\d{2}-\d{2}/)?.[0] || clean.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/)?.[0] || clean;
}

function findSentenceAfterLabels(text: string, labels: string[]) {
  const normalized = normalizeText(text);
  for (const label of labels) {
    const index = normalized.indexOf(normalizeText(label));
    if (index < 0) continue;
    const slice = text.slice(Math.max(0, index), Math.min(text.length, index + 420));
    const cleaned = cleanString(slice.replace(/\s+/g, " "));
    if (cleaned) return cleaned.slice(0, 320);
  }
  return "";
}

function profileForDomain(domain: string) {
  const cleanDomain = cleanString(domain).replace(/^www\./i, "").toLowerCase();
  return PROFILES.find((profile) =>
    profile.domains.some((profileDomain) => cleanDomain === profileDomain || cleanDomain.endsWith(`.${profileDomain}`))
  );
}

function metaContent(html: string, names: string[]) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeHtml(match[1]);
    }
  }
  return "";
}

function titleFromHtml(html: string, fallback: string) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = h1 || metaContent(html, ["og:title", "twitter:title"]) || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  return decodeHtml(title.replace(/<[^>]+>/g, " ")) || fallback;
}

function resolveUrl(value: string, baseUrl: string) {
  const clean = decodeHtml(value).replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
  if (!clean || clean.startsWith("data:") || clean.startsWith("blob:")) return "";
  try {
    return new URL(clean, baseUrl).toString();
  } catch {
    return "";
  }
}

function documentKind(signalText: string) {
  const normalized = normalizeText(signalText);
  if (normalized.includes("matricula")) return "matricula";
  if (normalized.includes("edital")) return "edital";
  if (normalized.includes("laudo")) return "laudo";
  if (normalized.includes("certidao")) return "certidao";
  if (normalized.includes("processo")) return "processo";
  return "documento";
}

function extractDocuments(html: string, baseUrl: string, profile: AdapterProfile) {
  const documents: AuctionSiteDocument[] = [];
  const signals = [...new Set([...profile.documentSignals, ...COMMON_DOCUMENT_SIGNALS])];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html))) {
    const url = resolveUrl(match[1], baseUrl);
    if (!url) continue;
    const label = htmlToText(match[2]);
    const normalized = normalizeText(`${label} ${url}`);
    const isDocument = /\.(pdf|docx?|xlsx?|zip)(?:[?#]|$)/i.test(url) || signals.some((signal) => normalized.includes(normalizeText(signal)));
    if (!isDocument) continue;
    documents.push({ label: label || documentKind(normalized), url, kind: documentKind(normalized) });
  }

  const quotedDocPattern = /["'`](https?:\\?\/\\?\/[^"'`\\\s]+?\.(?:pdf|docx?|xlsx?|zip)(?:\?[^"'`\s\\]*)?)["'`]/gi;
  let quotedMatch: RegExpExecArray | null;
  while ((quotedMatch = quotedDocPattern.exec(html))) {
    const url = resolveUrl(quotedMatch[1], baseUrl);
    if (!url) continue;
    documents.push({ label: documentKind(url), url, kind: documentKind(url) });
  }

  const seen = new Set<string>();
  return documents.filter((document) => {
    if (seen.has(document.url)) return false;
    seen.add(document.url);
    return true;
  }).slice(0, 30);
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function scriptJsonBlocks(html: string) {
  const blocks: unknown[] = [];
  const ldPattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch: RegExpExecArray | null;
  while ((ldMatch = ldPattern.exec(html))) {
    const parsed = safeJsonParse(decodeHtml(ldMatch[1]));
    if (parsed) blocks.push(parsed);
  }

  const nextData = html.match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (nextData) {
    const parsed = safeJsonParse(decodeHtml(nextData));
    if (parsed) blocks.push(parsed);
  }

  const inertiaPattern = /<[^>]+\bdata-page=(["'])([\s\S]*?)\1[^>]*>/gi;
  let inertiaMatch: RegExpExecArray | null;
  while ((inertiaMatch = inertiaPattern.exec(html))) {
    const parsed = safeJsonParse(decodeHtml(inertiaMatch[2]));
    if (parsed) blocks.push(parsed);
  }

  return blocks;
}

function firstCleanString(...values: unknown[]) {
  for (const value of values) {
    const clean = cleanString(value);
    if (clean) return clean;
  }
  return "";
}

function findSatoLot(blocks: unknown[]) {
  for (const block of blocks) {
    const page = asRecord(block);
    const props = asRecord(page?.props);
    const lot = asRecord(props?.loteInit);
    if (lot) return lot;
  }
  return null;
}

function extractAddressFromSatoText(text: string) {
  const afterAddress = cleanString(text.split(/endere[cç]o:/i)[1] || "");
  if (!afterAddress) return "";
  return cleanString(
    afterAddress
      .replace(/\b(?:matr[ií]cula|observa[cç][aã]o|vistoria|consta|im[oó]vel\s+ser[aá])[\s\S]*$/i, "")
      .replace(/\s+/g, " ")
  ).slice(0, 240);
}

function extractSatoImageUrls(lot: Record<string, unknown>, baseUrl: string) {
  return asArray(lot.imagens_lote)
    .map((item) => {
      const image = asRecord(item);
      const file = asRecord(image?.arquivo);
      const openUrls = asRecord(file?.leilaoAbertoUrl);
      const closedUrls = asRecord(file?.leilaoFechadoUrl);
      const url = firstCleanString(
        openUrls?.x4,
        openUrls?.x8,
        openUrls?.x2,
        openUrls?.x1,
        closedUrls?.x4,
        closedUrls?.x8,
        closedUrls?.x2,
        closedUrls?.x1,
        file?.signedUrl,
        file?.url
      );
      return resolveUrl(url, baseUrl);
    })
    .filter(Boolean);
}

function extractSatoDocuments(lot: Record<string, unknown>, baseUrl: string) {
  const documents: AuctionSiteDocument[] = [];
  const lotDocuments = asArray(lot.documentos_lote);
  const auction = asRecord(lot.leilao);
  const auctionDocuments = asArray(auction?.arquivos_do_leilao);

  [...lotDocuments, ...auctionDocuments].forEach((item) => {
    const document = asRecord(item);
    const file = asRecord(document?.arquivo);
    const label = firstCleanString(document?.descricao, file?.nome, file?.titulo, file?.name, "Documento");
    const url = resolveUrl(firstCleanString(file?.viewerUrl, file?.signedUrl, file?.url), baseUrl);
    if (!url) return;
    documents.push({ label, url, kind: documentKind(label) });
  });

  const seen = new Set<string>();
  return documents.filter((document) => {
    if (seen.has(document.url)) return false;
    seen.add(document.url);
    return true;
  });
}

function extractSatoInertiaContext(blocks: unknown[], baseUrl: string, domain: string) {
  const cleanDomain = cleanString(domain).replace(/^www\./i, "").toLowerCase();
  if (cleanDomain !== "satoleiloes.com.br" && !cleanDomain.endsWith(".satoleiloes.com.br")) {
    return { extraction: {} as AuctionSiteExtractionPatch, imageUrls: [] as string[], documents: [] as AuctionSiteDocument[], text: "" };
  }

  const lot = findSatoLot(blocks);
  if (!lot) return { extraction: {} as AuctionSiteExtractionPatch, imageUrls: [] as string[], documents: [] as AuctionSiteDocument[], text: "" };

  const auction = asRecord(lot.leilao);
  const sequence = firstCleanString(lot.sequencia);
  const titleOnly = firstCleanString(lot.titulo);
  const title = cleanString([sequence, titleOnly].filter(Boolean).join(" - "));
  const descriptionText = htmlToText(firstCleanString(lot.descricao));
  const cityState = inferCityState(`${title} ${descriptionText}`);
  const firstAuctionDate = dateFromUnknown(firstCleanString(auction?.data_hora_inicio, lot.datahora_pregao));
  const secondAuctionDate = dateFromUnknown(firstCleanString(auction?.data_hora_inicio_segundo_leilao, lot.datahora_pregao_segundo_leilao));
  const secondAuctionBid = numberFromUnknown(firstCleanString(lot.lance_inicial_segundo_leilao, auction?.menorlanceInicialSegLeilao));
  const initialBid = numberFromUnknown(firstCleanString(lot.proximoLance, lot.lance_minimo, lot.lance_inicial, auction?.menorlanceInicial));
  const appraisalValue = numberFromUnknown(firstCleanString(lot.avaliacao_comitente, lot.avaliacao));
  const address = extractAddressFromSatoText(descriptionText);
  const auctionNotes = [
    firstAuctionDate ? `1 leilao: ${firstAuctionDate}` : "",
    secondAuctionDate ? `2 leilao: ${secondAuctionDate}` : "",
    secondAuctionBid ? `lance inicial do 2 leilao: R$ ${secondAuctionBid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "",
  ].filter(Boolean).join("; ");

  const extraction: AuctionSiteExtractionPatch = {
    title,
    propertyType: inferPropertyType(`${title} ${descriptionText}`),
    address,
    city: cityState.city,
    state: cityState.state,
    initialBid: initialBid || undefined,
    appraisalValue: appraisalValue || undefined,
    auctionDate: firstAuctionDate || secondAuctionDate || undefined,
    landAreaM2: findAreaAfterLabels(`${title} ${descriptionText}`, COMMON_AREA_LABELS.landAreaM2) || undefined,
    builtAreaM2: findAreaAfterLabels(descriptionText, COMMON_AREA_LABELS.builtAreaM2) || undefined,
    privateAreaM2: findAreaAfterLabels(descriptionText, COMMON_AREA_LABELS.privateAreaM2) || undefined,
    summary: descriptionText.slice(0, 600),
    cautionNotes: auctionNotes || undefined,
  };

  return {
    extraction,
    imageUrls: extractSatoImageUrls(lot, baseUrl),
    documents: extractSatoDocuments(lot, baseUrl),
    text: [title, descriptionText, auctionNotes].filter(Boolean).join("\n"),
  };
}

function walkStructuredData(value: unknown, baseUrl: string, output: { extraction: AuctionSiteExtractionPatch; images: string[] }) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => walkStructuredData(item, baseUrl, output));
    return;
  }
  if (typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  const type = cleanString(record["@type"] || record.type).toLowerCase();
  const name = cleanString(record.name || record.title || record.headline);
  const description = cleanString(record.description);
  const address = record.address;
  const offers = record.offers;

  if (!output.extraction.title && name && /product|offer|event|realestate|residence|apartment|house|place|singlefamilyresidence/i.test(type)) {
    output.extraction.title = name;
  }
  if (!output.extraction.summary && description) output.extraction.summary = description.slice(0, 600);

  if (typeof address === "string" && !output.extraction.address) output.extraction.address = address;
  if (address && typeof address === "object" && !Array.isArray(address)) {
    const addressRecord = address as Record<string, unknown>;
    output.extraction.address = output.extraction.address || cleanString(addressRecord.streetAddress);
    output.extraction.city = output.extraction.city || cleanString(addressRecord.addressLocality);
    output.extraction.state = output.extraction.state || cleanString(addressRecord.addressRegion).toUpperCase();
  }

  const image = record.image || record.thumbnailUrl || record.contentUrl;
  if (typeof image === "string") output.images.push(resolveUrl(image, baseUrl));
  if (Array.isArray(image)) image.forEach((item) => typeof item === "string" && output.images.push(resolveUrl(item, baseUrl)));

  if (offers && typeof offers === "object") {
    const offerRecord = Array.isArray(offers) ? offers[0] as Record<string, unknown> | undefined : offers as Record<string, unknown>;
    const price = moneyToNumber(cleanString(offerRecord?.price || offerRecord?.lowPrice));
    if (price && !output.extraction.initialBid) output.extraction.initialBid = price;
    if (!output.extraction.auctionDate) output.extraction.auctionDate = cleanString(offerRecord?.availabilityStarts || offerRecord?.validFrom);
  }

  const date = cleanString(record.startDate || record.endDate || record.datePublished);
  if (date && !output.extraction.auctionDate) output.extraction.auctionDate = date;

  Object.values(record).forEach((item) => walkStructuredData(item, baseUrl, output));
}

function inferPropertyType(text: string) {
  const normalized = normalizeText(text);
  if (normalized.includes("apartamento") || normalized.includes("apto")) return "apartamento";
  if (normalized.includes("terreno") || normalized.includes("lote")) return "terreno";
  if (normalized.includes("galpao") || normalized.includes("industrial")) return "industrial";
  if (normalized.includes("sala") || normalized.includes("loja") || normalized.includes("comercial")) return "comercial";
  if (normalized.includes("rural") || normalized.includes("fazenda") || normalized.includes("sitio")) return "rural";
  if (normalized.includes("casa") || normalized.includes("sobrado")) return "casa";
  return "";
}

function inferCityState(text: string) {
  const match = cleanString(text).match(/(?:em\s+)?([\p{L} .'-]{3,80})\/([A-Z]{2})\b/iu);
  if (!match) return { city: "", state: "" };
  const city = cleanString(match[1].split(/[-|]/).pop());
  return { city, state: cleanString(match[2]).toUpperCase() };
}

function buildLlmContext(profile: AdapterProfile, extraction: AuctionSiteExtractionPatch, documents: AuctionSiteDocument[], imageUrls: string[]) {
  const rows = [
    `Adaptador: ${profile.name}`,
    `Titulo: ${extraction.title || ""}`,
    `Tipo: ${extraction.propertyType || ""}`,
    `Endereco: ${extraction.address || ""}`,
    `Cidade/UF: ${extraction.city || ""}/${extraction.state || ""}`,
    `Area privativa: ${extraction.privateAreaM2 || 0}`,
    `Area construida: ${extraction.builtAreaM2 || 0}`,
    `Area terreno: ${extraction.landAreaM2 || 0}`,
    `Lance: ${extraction.initialBid || 0}`,
    `Avaliacao: ${extraction.appraisalValue || 0}`,
    `Data leilao: ${extraction.auctionDate || ""}`,
    `Pagamento: ${extraction.paymentCondition || ""}`,
    `Ocupacao: ${extraction.occupancy || ""}`,
    `Sinal juridico: ${extraction.legalSignal || ""}`,
    `Documentos encontrados: ${documents.map((document) => `${document.kind}:${document.url}`).slice(0, 8).join(" | ")}`,
    `Imagens encontradas: ${imageUrls.length}`,
  ];
  return rows.filter((row) => !row.endsWith(": ") && !row.endsWith(": 0") && !row.endsWith(": /")).join("\n");
}

export function extractAuctionSiteContext(input: {
  sourceUrl: string;
  sourceDomain: string;
  html: string;
  visibleText?: string;
}): AuctionSiteContext {
  const profile = profileForDomain(input.sourceDomain);
  const fallbackProfile: AdapterProfile = {
    key: "generic-auction",
    name: "Generico de leilao",
    domains: [],
    initialBidLabels: COMMON_INITIAL_BID_LABELS,
    appraisalLabels: COMMON_APPRAISAL_LABELS,
    auctionDateLabels: COMMON_DATE_LABELS,
    paymentLabels: COMMON_PAYMENT_LABELS,
    occupancyLabels: COMMON_OCCUPANCY_LABELS,
    legalLabels: COMMON_LEGAL_LABELS,
    areaLabels: COMMON_AREA_LABELS,
    documentSignals: COMMON_DOCUMENT_SIGNALS,
  };
  const activeProfile = profile || fallbackProfile;
  const structuredOutput = { extraction: {} as AuctionSiteExtractionPatch, images: [] as string[] };
  const structuredBlocks = scriptJsonBlocks(input.html);
  const satoContext = extractSatoInertiaContext(structuredBlocks, input.sourceUrl, input.sourceDomain);
  structuredBlocks.forEach((block) => walkStructuredData(block, input.sourceUrl, structuredOutput));
  structuredOutput.extraction = { ...structuredOutput.extraction, ...satoContext.extraction };
  const text = cleanString([input.visibleText, satoContext.text].filter(Boolean).join("\n\n")) || htmlToText(input.html);

  const title = titleFromHtml(input.html, structuredOutput.extraction.title || "");
  const cityState = inferCityState(`${title} ${text.slice(0, 1200)}`);
  const extraction: AuctionSiteExtractionPatch = {
    ...structuredOutput.extraction,
    title: structuredOutput.extraction.title || title,
    propertyType: structuredOutput.extraction.propertyType || inferPropertyType(`${title} ${text.slice(0, 2000)}`),
    city: structuredOutput.extraction.city || cityState.city,
    state: structuredOutput.extraction.state || cityState.state,
    initialBid: structuredOutput.extraction.initialBid || findMoneyAfterLabels(text, activeProfile.initialBidLabels),
    appraisalValue: structuredOutput.extraction.appraisalValue || findMoneyAfterLabels(text, activeProfile.appraisalLabels),
    auctionDate: structuredOutput.extraction.auctionDate || findDateAfterLabels(text, activeProfile.auctionDateLabels),
    paymentCondition: structuredOutput.extraction.paymentCondition || findSentenceAfterLabels(text, activeProfile.paymentLabels),
    occupancy: structuredOutput.extraction.occupancy || findSentenceAfterLabels(text, activeProfile.occupancyLabels),
    legalSignal: structuredOutput.extraction.legalSignal || findSentenceAfterLabels(text, activeProfile.legalLabels),
    privateAreaM2: structuredOutput.extraction.privateAreaM2 || findAreaAfterLabels(text, activeProfile.areaLabels.privateAreaM2),
    builtAreaM2: structuredOutput.extraction.builtAreaM2 || findAreaAfterLabels(text, activeProfile.areaLabels.builtAreaM2),
    landAreaM2: structuredOutput.extraction.landAreaM2 || findAreaAfterLabels(text, activeProfile.areaLabels.landAreaM2),
  };

  const imageUrls = sortLikelyPropertyImageUrls([
    ...satoContext.imageUrls,
    ...extractImageUrlsFromHtml(input.html, input.sourceUrl),
    ...structuredOutput.images,
  ].filter(Boolean)).slice(0, 50);
  const documents = [...satoContext.documents, ...extractDocuments(input.html, input.sourceUrl, activeProfile)]
    .filter((document, index, all) => all.findIndex((item) => item.url === document.url) === index)
    .slice(0, 30);
  const foundSignals = [
    extraction.title,
    extraction.initialBid,
    extraction.appraisalValue,
    extraction.privateAreaM2 || extraction.builtAreaM2 || extraction.landAreaM2,
    imageUrls.length,
    documents.length,
  ].filter(Boolean).length;
  extraction.confidenceScore = profile ? Math.min(75, 20 + foundSignals * 10) : Math.min(45, 10 + foundSignals * 7);
  extraction.missingFields = [
    extraction.initialBid ? "" : "lance",
    extraction.appraisalValue ? "" : "valor de avaliacao",
    extraction.auctionDate ? "" : "data do leilao",
    (extraction.privateAreaM2 || extraction.builtAreaM2 || extraction.landAreaM2) ? "" : "area",
  ].filter(Boolean);

  return {
    adapterKey: activeProfile.key,
    adapterName: activeProfile.name,
    extraction,
    imageUrls,
    documents,
    llmContext: buildLlmContext(activeProfile, extraction, documents, imageUrls),
    warnings: profile ? [] : ["Dominio sem adaptador especifico; perfil generico usado."],
  };
}
