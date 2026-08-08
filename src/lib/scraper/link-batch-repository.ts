import "server-only";

import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import {
  buildCeilingTargets,
  calculateMarketDiscount,
  calculatePricePerM2,
  clampMarketScore,
  type MarketAnalysisDecision,
  type MarketCostItem,
} from "@/lib/admin/market-analysis";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { ingestAuctionOpportunityRecord } from "@/lib/admin/repository/pipeline";
import { sendWhatsAppAgentReply, sendWhatsAppDestinationText } from "@/lib/communication/connectyhub-client";
import { deletePublicR2Object, mirrorRemoteImagesToR2, type StoredImageAsset } from "@/lib/storage/r2";
import { extractAuctionSiteContext, type AuctionSiteDocument, type AuctionSiteExtractionPatch } from "./auction-site-adapters";
import { extractAuctionLinkWithGemini, type AuctionLinkExtraction } from "./auction-link-extractor";
import { runDeepMarketResearch, type DeepMarketComparable, type DeepMarketResearchResult } from "./deep-market-research";
import { auctionApiFetchHeaders, auctionPageFetchHeaders } from "./http";
import { cleanHtmlForLlm } from "./scraper-llm";
import { collectImageUrlsFromSourceUrl, looksLikeBotChallenge } from "./scraper-strategies";
import type { DataResult, MutationResult } from "@/lib/admin/repository/shared";

type DbRow = Record<string, unknown>;

type ImportSourceType = "xlsx" | "csv" | "txt" | "manual";
export type LinkAnalysisDepth = "standard" | "deep";

const DEFAULT_ANALYSIS_DEPTH: LinkAnalysisDepth = "deep";
const ANALYSIS_DEPTH_LABELS: Record<LinkAnalysisDepth, string> = {
  standard: "Analise padrao",
  deep: "Analise profunda",
};

const ANALYSIS_DEPTH_PROFILES: Record<LinkAnalysisDepth, {
  llmTextLimit: number;
  maxImages: number;
  fetchTimeoutMs: number;
  minimumConfidence: number;
  requireDocuments: boolean;
}> = {
  standard: {
    llmTextLimit: 30_000,
    maxImages: 24,
    fetchTimeoutMs: 25_000,
    minimumConfidence: 45,
    requireDocuments: false,
  },
  deep: {
    llmTextLimit: 60_000,
    maxImages: 40,
    fetchTimeoutMs: 35_000,
    minimumConfidence: 65,
    requireDocuments: false,
  },
};

export type LinkScraperBatchStatus = "draft" | "aguardando_inicio" | "processando" | "concluido" | "falha" | "cancelado";
export type LinkScraperRowStatus =
  | "importado"
  | "duplicado"
  | "url_invalida"
  | "aguardando_inicio"
  | "aguardando_scraper"
  | "scraping"
  | "scraper_concluido"
  | "extracao_concluida"
  | "analise_mercado_pendente"
  | "pronto_para_revisao"
  | "falha";

export type ParsedLinkImportRow = {
  rowNumber: number;
  externalCode: string;
  auctionUrl: string;
  sourceDomain: string;
  cityHint: string;
  stateHint: string;
  auctionDateHint: string;
  propertyTypeHint: string;
  status: LinkScraperRowStatus;
  errorMessage: string;
  rawValues: string[];
};

export type ParsedLinkImportFile = {
  filename: string;
  sourceType: ImportSourceType;
  rows: ParsedLinkImportRow[];
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  ignoredRowCount: number;
};

export type LinkScraperBatch = {
  id: string;
  originalFilename: string;
  sourceType: string;
  analysisDepth: LinkAnalysisDepth;
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  status: LinkScraperBatchStatus;
  startedAt: string;
  completedAt: string;
  whatsappAgentKey: string;
  whatsappInstanceId: string;
  notificationRecipientId: string;
  notificationStatus: string;
  createdAt: string;
  updatedAt: string;
  rows: LinkScraperRow[];
};

export type LinkScraperRow = {
  id: string;
  batchId: string;
  rowNumber: number;
  analysisDepth: LinkAnalysisDepth;
  externalCode: string;
  auctionUrl: string;
  sourceDomain: string;
  cityHint: string;
  stateHint: string;
  auctionDateHint: string;
  propertyTypeHint: string;
  status: LinkScraperRowStatus;
  opportunityId: string;
  scrapeRunId: string;
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
  extractionTitle?: string;
  extractionConfidence?: number;
  missingFields?: string[];
  initialBid?: number;
  appraisalValue?: number;
  imageCount?: number;
  documentCount?: number;
  adapterKey?: string;
  adapterName?: string;
  qualityFlags?: string[];
};

export type ScraperNotificationRecipient = {
  id: string;
  sectorName: string;
  recipientName: string;
  recipientType: string;
  whatsappNumber: string;
  whatsappJid: string;
  isGroup: boolean;
  isActive: boolean;
  notes: string;
};

export type WhatsappAgentOption = {
  id: string;
  agentKey: string;
  instanceName: string;
  phone: string;
  status: string;
  connected: boolean;
  providerInstanceId: string;
};

export type LinkScraperDashboardData = {
  batches: LinkScraperBatch[];
  recipients: ScraperNotificationRecipient[];
  whatsappAgents: WhatsappAgentOption[];
  metrics: {
    totalBatches: number;
    totalRows: number;
    readyRows: number;
    failedRows: number;
    processingBatches: number;
    legacyCandidates: number;
  };
  legacyPreview: ScraperLegacyCleanupPreview;
};

export type ScraperLegacyCleanupPreview = {
  matchedOpportunities: number;
  blockedOpportunities: number;
  archivedOpportunities: number;
  readyToArchiveOpportunities: number;
  readyToDeleteOpportunities: number;
  sample: Array<{
    id: string;
    code: string;
    title: string;
    ownerName: string;
    stage: string;
    reason: string;
  }>;
};

export type ScraperLegacyCleanupExecutionSummary = {
  runId: string;
  matchedOpportunities: number;
  blockedOpportunities: number;
  archivedOpportunities: number;
  alreadyArchivedOpportunities: number;
  deletedOpportunities: number;
  readyToDeleteOpportunities: number;
};

export type MarketAnalysisResetSummary = {
  batchesFound: number;
  rowsFound: number;
  opportunitiesFound: number;
  assetsFound: number;
  r2ObjectsFound: number;
  r2ObjectsDeleted: number;
  r2ObjectsFailed: number;
  externalAssetsSkipped: number;
  rowsDeleted: number;
  batchesDeleted: number;
  notificationsDeleted: number;
  opportunitiesDeleted: number;
  assetsDeleted: number;
  scrapeRunsDeleted: number;
  sourceSnapshotsDeleted: number;
  aiAnalysisRunsDeleted: number;
  marketAnalysesDeleted: number;
  marketComparablesDeleted: number;
  relatedRowsDeleted: number;
  failures: string[];
};

type LegacyCleanupCandidate = {
  row: DbRow;
  reason: string;
  blocked: boolean;
  blockReasons: string[];
  related: Record<string, DbRow[]>;
};

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
};

type AuctionPageSupplement = {
  html: string;
  text: string;
  imageUrls: string[];
  documentLinks: AuctionSiteDocument[];
  source: string;
  warnings: string[];
};

const HTML_ENTITY_MAP: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  quot: "\"",
  lt: "<",
  gt: ">",
  apos: "'",
  aacute: "a",
  agrave: "a",
  acirc: "a",
  atilde: "a",
  eacute: "e",
  ecirc: "e",
  iacute: "i",
  oacute: "o",
  ocirc: "o",
  otilde: "o",
  uacute: "u",
  ccedil: "c",
  Aacute: "A",
  Agrave: "A",
  Acirc: "A",
  Atilde: "A",
  Eacute: "E",
  Ecirc: "E",
  Iacute: "I",
  Oacute: "O",
  Ocirc: "O",
  Otilde: "O",
  Uacute: "U",
  Ccedil: "C",
  deg: "o",
  ordm: "o",
  ordf: "a",
  sup2: "2",
};

function cleanString(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(cleanString(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asRecord(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asMoneyNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = cleanString(value);
  if (!raw) return fallback;
  const stripped = raw.replace(/[^\d,.-]/g, "");
  if (!stripped) return fallback;
  const normalized = stripped.includes(",")
    ? stripped.replace(/\./g, "").replace(",", ".")
    : stripped;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (entity, name) => HTML_ENTITY_MAP[name] || HTML_ENTITY_MAP[String(name).toLowerCase()] || entity)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function normalizeAnalysisDepth(value: unknown): LinkAnalysisDepth {
  const normalized = cleanString(value).toLowerCase();
  return normalized === "standard" || normalized === "padrao" ? "standard" : DEFAULT_ANALYSIS_DEPTH;
}

function analysisDepthProfile(value: unknown) {
  return ANALYSIS_DEPTH_PROFILES[normalizeAnalysisDepth(value)];
}

function normalizeCode(value: string) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
}

function safeBatchCode(value: string, rowNumber: number) {
  return normalizeCode(value).slice(0, 72) || `LINK-${Date.now().toString(36).toUpperCase()}-${rowNumber}`;
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function xmlBlocks(xml: string, tag: string) {
  return [...xml.matchAll(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "gi"))].map((match) => match[0]);
}

function xmlAttribute(xml: string, attribute: string) {
  const match = xml.match(new RegExp(`${attribute}="([^"]*)"`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function xmlText(xml: string, tag = "t") {
  return [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))]
    .map((match) => decodeXml(match[1].replace(/<[^>]+>/g, "")))
    .join("");
}

function columnIndex(reference: string, fallback: number) {
  const letters = (reference.match(/[A-Z]+/i)?.[0] || "").toUpperCase();
  if (!letters) return fallback;
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return value - 1;
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const min = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("Arquivo XLSX invalido ou corrompido.");
}

function readZipEntries(buffer: Buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, Buffer>();
  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const entry: ZipEntry = {
      method: buffer.readUInt16LE(offset + 10),
      compressedSize: buffer.readUInt32LE(offset + 20),
      localHeaderOffset: buffer.readUInt32LE(offset + 42),
      name: buffer.toString("utf8", offset + 46, offset + 46 + buffer.readUInt16LE(offset + 28)),
    };
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    offset += 46 + nameLength + extraLength + commentLength;

    const localOffset = entry.localHeaderOffset;
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) continue;
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);

    if (entry.method === 0) entries.set(entry.name, compressed);
    if (entry.method === 8) entries.set(entry.name, inflateRawSync(compressed));
  }

  return entries;
}

function parseSharedStrings(entries: Map<string, Buffer>) {
  const xml = entries.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  return xmlBlocks(xml, "si").map((item) => xmlText(item));
}

function parseXlsxRows(buffer: Buffer) {
  const entries = readZipEntries(buffer);
  const sharedStrings = parseSharedStrings(entries);
  const sheetName = [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))[0];
  if (!sheetName) throw new Error("Nenhuma aba encontrada no XLSX.");

  const xml = entries.get(sheetName)?.toString("utf8") || "";
  const rows: string[][] = [];
  for (const rowBlock of xmlBlocks(xml, "row")) {
    const values: string[] = [];
    let fallbackIndex = 0;
    for (const match of rowBlock.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attrs = match[1];
      const body = match[2];
      const cellIndex = columnIndex(xmlAttribute(attrs, "r"), fallbackIndex);
      const type = xmlAttribute(attrs, "t");
      const rawValue = cleanString(xmlText(body, "v"));
      const value = type === "s" ? cleanString(sharedStrings[Number(rawValue)]) : type === "inlineStr" ? xmlText(body) : rawValue;
      values[cellIndex] = value;
      fallbackIndex = cellIndex + 1;
    }
    rows.push(values.map((value) => cleanString(value)));
  }
  return rows;
}

function detectDelimiter(line: string) {
  if (line.includes(";")) return ";";
  if (line.includes("\t")) return "\t";
  return ",";
}

function parseDelimitedRows(text: string) {
  const delimiter = detectDelimiter(text.split(/\r?\n/).find((line) => line.trim()) || "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows.map((item) => item.map((cellValue) => cleanString(cellValue)));
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function sourceDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function excelSerialToIso(value: string) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return value;
  const excelEpoch = Date.UTC(1899, 11, 30);
  const date = new Date(excelEpoch + serial * 86400000);
  return date.toISOString().slice(0, 10);
}

function looksLikeHeader(row: string[]) {
  const headers = row.map(normalizeHeader);
  return headers.some((header) => ["codigo", "code", "link", "url", "cidade", "city", "data", "leilao"].includes(header));
}

function headerValue(record: Record<string, string>, names: string[]) {
  for (const name of names) {
    const found = Object.entries(record).find(([key]) => normalizeHeader(key) === name);
    if (found?.[1]) return cleanString(found[1]);
  }
  return "";
}

function mapRows(rows: string[][]) {
  const cleaned = rows
    .map((row) => row.map((cell) => cleanString(cell)))
    .filter((row) => row.some(Boolean));
  const hasHeader = cleaned.length > 0 && looksLikeHeader(cleaned[0]);
  const headers = hasHeader ? cleaned[0] : [];
  const values = hasHeader ? cleaned.slice(1) : cleaned;
  const mapped: ParsedLinkImportRow[] = [];
  let ignoredRowCount = 0;

  values.forEach((row, index) => {
    const rowNumber = (hasHeader ? index + 2 : index + 1);
    let externalCode = "";
    let auctionUrl = "";
    let cityHint = "";
    let stateHint = "";
    let auctionDateHint = "";
    let propertyTypeHint = "";

    if (hasHeader) {
      const record: Record<string, string> = {};
      headers.forEach((header, headerIndex) => {
        record[cleanString(header, `coluna_${headerIndex + 1}`)] = cleanString(row[headerIndex]);
      });
      externalCode = headerValue(record, ["codigo", "code", "id", "referencia"]);
      auctionUrl = headerValue(record, ["link", "url", "auctionurl", "linkleilao"]);
      cityHint = headerValue(record, ["cidade", "city", "municipio"]);
      stateHint = headerValue(record, ["uf", "estado", "state"]);
      auctionDateHint = headerValue(record, ["data", "dataleilao", "auctiondate"]);
      propertyTypeHint = headerValue(record, ["tipo", "tipodoimovel", "propertytype"]);
    } else {
      const urlIndex = row.findIndex(isHttpUrl);
      if (urlIndex < 0) {
        ignoredRowCount += 1;
        return;
      }
      externalCode = cleanString(row[0]);
      auctionUrl = cleanString(row[urlIndex]);
      cityHint = cleanString(row[urlIndex + 1]);
      auctionDateHint = cleanString(row[urlIndex + 2]);
    }

    auctionDateHint = excelSerialToIso(auctionDateHint);
    const validUrl = isHttpUrl(auctionUrl);
    mapped.push({
      rowNumber,
      externalCode,
      auctionUrl,
      sourceDomain: sourceDomain(auctionUrl),
      cityHint,
      stateHint,
      auctionDateHint,
      propertyTypeHint,
      status: validUrl ? "aguardando_inicio" : "url_invalida",
      errorMessage: validUrl ? "" : "URL de leilao invalida.",
      rawValues: row,
    });
  });

  return { rows: mapped, ignoredRowCount };
}

export function parsePropertyLinkImportBuffer(input: {
  filename: string;
  buffer: Buffer;
}): ParsedLinkImportFile {
  const filename = cleanString(input.filename, "links-imoveis");
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  if (extension === "xls") throw new Error("Arquivo .xls antigo nao e aceito. Salve como .xlsx.");
  if (!["csv", "txt", "xlsx"].includes(extension)) throw new Error("Envie um arquivo .xlsx, .csv ou .txt.");

  const sourceType = extension as ImportSourceType;
  const rawRows = extension === "xlsx"
    ? parseXlsxRows(input.buffer)
    : extension === "txt"
      ? input.buffer.toString("utf8").split(/\r?\n/).map((line) => [line])
      : parseDelimitedRows(input.buffer.toString("utf8"));
  const mapped = mapRows(rawRows);
  const validRowCount = mapped.rows.filter((row) => row.status !== "url_invalida").length;
  const invalidRowCount = mapped.rows.length - validRowCount;
  return {
    filename,
    sourceType,
    rows: mapped.rows,
    rowCount: mapped.rows.length,
    validRowCount,
    invalidRowCount,
    ignoredRowCount: mapped.ignoredRowCount,
  };
}

export async function parsePropertyLinkImportFile(file: File): Promise<ParsedLinkImportFile> {
  return parsePropertyLinkImportBuffer({
    filename: cleanString(file.name, "links-imoveis"),
    buffer: Buffer.from(await file.arrayBuffer()),
  });
}

function normalizeRow(row: DbRow): LinkScraperRow {
  const rawPayload = asRecord(row.raw_row_payload);
  return {
    id: cleanString(row.id),
    batchId: cleanString(row.batch_id),
    rowNumber: asNumber(row.row_number),
    analysisDepth: normalizeAnalysisDepth(rawPayload.analysisDepth || rawPayload.analysis_depth),
    externalCode: cleanString(row.external_code),
    auctionUrl: cleanString(row.auction_url),
    sourceDomain: cleanString(row.source_domain),
    cityHint: cleanString(row.city_hint),
    stateHint: cleanString(row.state_hint),
    auctionDateHint: cleanString(row.auction_date_hint),
    propertyTypeHint: cleanString(row.property_type_hint),
    status: cleanString(row.status, "aguardando_inicio") as LinkScraperRowStatus,
    opportunityId: cleanString(row.opportunity_id),
    scrapeRunId: cleanString(row.scrape_run_id),
    errorMessage: cleanString(row.error_message),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at),
  };
}

function mergeRowExtraction(row: LinkScraperRow, run: DbRow | undefined): LinkScraperRow {
  if (!run) return row;
  const extracted = asRecord(run.extracted_payload);
  const gemini = asRecord(extracted.gemini);
  const subject = asRecord(extracted.subject);
  const adapter = asRecord(extracted.adapter);
  const deepAnalysis = asRecord(extracted.deepAnalysis);
  const missingFields = Array.isArray(gemini.missingFields)
    ? gemini.missingFields.map((item) => cleanString(item)).filter(Boolean)
    : [];
  const qualityFlags = Array.isArray(deepAnalysis.qualityFlags)
    ? deepAnalysis.qualityFlags.map((item) => cleanString(item)).filter(Boolean)
    : [];

  return {
    ...row,
    analysisDepth: normalizeAnalysisDepth(extracted.analysisDepth || row.analysisDepth),
    extractionTitle: cleanString(extracted.title, cleanString(subject.address)),
    extractionConfidence: asNumber(gemini.confidenceScore),
    missingFields,
    initialBid: asNumber(extracted.initialBid),
    appraisalValue: asNumber(extracted.appraisalValue),
    imageCount: asNumber(extracted.imageCount),
    documentCount: asNumber(extracted.documentCount),
    adapterKey: cleanString(adapter.key),
    adapterName: cleanString(adapter.name),
    qualityFlags,
  };
}

function normalizeBatch(row: DbRow, rows: LinkScraperRow[] = []): LinkScraperBatch {
  const mappingPayload = asRecord(row.mapping_payload);
  return {
    id: cleanString(row.id),
    originalFilename: cleanString(row.original_filename),
    sourceType: cleanString(row.source_type),
    analysisDepth: normalizeAnalysisDepth(mappingPayload.analysisDepth || mappingPayload.analysis_depth),
    rowCount: asNumber(row.row_count),
    validRowCount: asNumber(row.valid_row_count),
    invalidRowCount: asNumber(row.invalid_row_count),
    status: cleanString(row.status, "draft") as LinkScraperBatchStatus,
    startedAt: cleanString(row.started_at),
    completedAt: cleanString(row.completed_at),
    whatsappAgentKey: cleanString(row.whatsapp_agent_key),
    whatsappInstanceId: cleanString(row.whatsapp_instance_id),
    notificationRecipientId: cleanString(row.notification_recipient_id),
    notificationStatus: cleanString(row.notification_status),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at),
    rows,
  };
}

function normalizeRecipient(row: DbRow): ScraperNotificationRecipient {
  return {
    id: cleanString(row.id),
    sectorName: cleanString(row.sector_name),
    recipientName: cleanString(row.recipient_name),
    recipientType: cleanString(row.recipient_type, "sector"),
    whatsappNumber: cleanString(row.whatsapp_number),
    whatsappJid: cleanString(row.whatsapp_jid),
    isGroup: row.is_group === true,
    isActive: row.is_active !== false,
    notes: cleanString(row.notes),
  };
}

function normalizeWhatsappAgent(row: DbRow): WhatsappAgentOption {
  const status = cleanString(row.status);
  const normalizedStatus = status.toLowerCase();
  return {
    id: cleanString(row.id),
    agentKey: cleanString(row.agent_key),
    instanceName: cleanString(row.instance_name),
    phone: cleanString(row.phone),
    status,
    connected:
      !["deleted", "archived", "inactive", "disabled"].includes(normalizedStatus) &&
      (["connected", "open", "online"].includes(normalizedStatus) || Boolean(row.connected_at)),
    providerInstanceId: cleanString(row.provider_instance_id),
  };
}

function isUsableWhatsappAgent(agent: WhatsappAgentOption) {
  if (!agent.id || !agent.providerInstanceId || !agent.connected) return false;
  const name = `${agent.instanceName} ${agent.agentKey}`.toLowerCase();
  if (name.includes("health-check") || name === "test" || name.includes(" test ")) return false;
  return !["deleted", "archived", "inactive", "disabled"].includes(agent.status.toLowerCase());
}

async function listWhatsappAgents(): Promise<WhatsappAgentOption[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("id, agent_key, instance_name, phone, status, connected_at, provider_instance_id")
    .neq("status", "deleted")
    .not("provider_instance_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return ((data || []) as DbRow[]).map(normalizeWhatsappAgent).filter(isUsableWhatsappAgent);
}

async function resolveProviderInstanceId(localInstanceId: string) {
  const instanceId = cleanString(localInstanceId);
  const supabase = getSupabaseAdminClient();
  if (!supabase || !instanceId) return "";

  const { data } = await supabase
    .from("whatsapp_instances")
    .select("provider_instance_id")
    .eq("id", instanceId)
    .maybeSingle();

  return cleanString((data as DbRow | null)?.provider_instance_id);
}

async function listRecipients(): Promise<ScraperNotificationRecipient[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("scraper_notification_recipients")
    .select("*")
    .eq("is_active", true)
    .order("sector_name", { ascending: true });
  if (error) return [];
  return ((data || []) as DbRow[]).map(normalizeRecipient);
}

const LEGACY_CLEANUP_FILTERS = ["raw_payload.collectionMode=scraper_target", "raw_payload.targetCode exists", "owner antigo"];

const LEGACY_USAGE_TABLES = [
  "opportunity_matches",
  "bid_strategies",
  "auction_sessions",
  "post_auction_cases",
  "dossiers",
  "legal_reviews",
  "property_market_analyses",
  "opportunity_validation_runs",
  "opportunity_validation_steps",
  "subscriber_opportunity_access",
  "advisory_contracts",
] as const;

const LEGACY_ARCHIVE_RELATED_TABLES = [
  "source_snapshots",
  "ai_analysis_runs",
  "legal_reviews",
  "dossiers",
  "opportunity_matches",
  "bid_strategies",
  "auction_sessions",
  "post_auction_cases",
  "property_market_analyses",
  "opportunity_validation_runs",
  "opportunity_validation_steps",
  "audit_logs",
] as const;

function legacyCandidateReason(row: DbRow) {
  const raw = asRecord(row.raw_payload);
  const ownerName = cleanString(row.owner_name);
  const collectionMode = cleanString(raw.collectionMode);
  const hasTargetCode = Boolean(raw.targetCode);
  if (collectionMode === "scraper_target") return "collectionMode=scraper_target";
  if (hasTargetCode) return "raw_payload.targetCode";
  if (ownerName === "Renata - Buscadora de Imoveis") return "owner antigo";
  return "";
}

function stageBlockReason(row: DbRow) {
  const stage = cleanString(row.stage).toLowerCase();
  if (stage.includes("contrato")) return "etapa com contrato";
  if (stage.includes("aprovado")) return "etapa aprovada";
  if (stage.includes("investidor")) return "etapa com investidor";
  if (stage.includes("arremat")) return "etapa pos-arrematacao";
  return "";
}

function groupRowsByOpportunity(rows: DbRow[]) {
  const grouped = new Map<string, DbRow[]>();
  rows.forEach((row) => {
    const opportunityId = cleanString(row.opportunity_id);
    if (!opportunityId) return;
    const list = grouped.get(opportunityId) || [];
    list.push(row);
    grouped.set(opportunityId, list);
  });
  return grouped;
}

async function safeRelatedRows(table: string, opportunityIds: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !opportunityIds.length) return [] as DbRow[];
  try {
    const { data, error } = await supabase.from(table).select("*").in("opportunity_id", opportunityIds).limit(5000);
    if (error) return [];
    return (data || []) as DbRow[];
  } catch {
    return [];
  }
}

async function safeArchivedIds(opportunityIds: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !opportunityIds.length) return new Set<string>();
  try {
    const { data, error } = await supabase
      .from("scraper_legacy_archives")
      .select("opportunity_id, archive_status")
      .in("opportunity_id", opportunityIds)
      .in("archive_status", ["archived", "deleted"]);
    if (error) return new Set<string>();
    return new Set(((data || []) as DbRow[]).map((row) => cleanString(row.opportunity_id)).filter(Boolean));
  } catch {
    return new Set<string>();
  }
}

async function getLegacyCleanupCandidates(): Promise<LegacyCleanupCandidate[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("auction_opportunities")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(5000);
  if (error) return [];

  const base = ((data || []) as DbRow[])
    .map((row) => ({ row, reason: legacyCandidateReason(row) }))
    .filter((item) => item.reason);
  const opportunityIds = base.map((item) => cleanString(item.row.id)).filter(Boolean);
  const usageEntries = await Promise.all(
    LEGACY_USAGE_TABLES.map(async (table) => [table, groupRowsByOpportunity(await safeRelatedRows(table, opportunityIds))] as const)
  );

  return base.map((item) => {
    const opportunityId = cleanString(item.row.id);
    const related: Record<string, DbRow[]> = {};
    const blockReasons = [stageBlockReason(item.row)].filter(Boolean);

    usageEntries.forEach(([table, grouped]) => {
      const rows = grouped.get(opportunityId) || [];
      related[table] = rows;
      if (rows.length) blockReasons.push(`${table}:${rows.length}`);
    });

    return {
      row: item.row,
      reason: item.reason,
      blocked: blockReasons.length > 0,
      blockReasons,
      related,
    };
  });
}

export async function getScraperLegacyCleanupPreview(): Promise<ScraperLegacyCleanupPreview> {
  const empty: ScraperLegacyCleanupPreview = {
    matchedOpportunities: 0,
    blockedOpportunities: 0,
    archivedOpportunities: 0,
    readyToArchiveOpportunities: 0,
    readyToDeleteOpportunities: 0,
    sample: [],
  };
  const candidates = await getLegacyCleanupCandidates();
  if (!candidates.length) return empty;

  const opportunityIds = candidates.map((item) => cleanString(item.row.id)).filter(Boolean);
  const archivedIds = await safeArchivedIds(opportunityIds);
  const blocked = candidates.filter((item) => item.blocked);

  return {
    matchedOpportunities: candidates.length,
    blockedOpportunities: blocked.length,
    archivedOpportunities: archivedIds.size,
    readyToArchiveOpportunities: candidates.filter((item) => !item.blocked && !archivedIds.has(cleanString(item.row.id))).length,
    readyToDeleteOpportunities: candidates.filter((item) => !item.blocked && archivedIds.has(cleanString(item.row.id))).length,
    sample: candidates.slice(0, 12).map((item) => ({
      id: cleanString(item.row.id),
      code: cleanString(item.row.code),
      title: cleanString(item.row.title),
      ownerName: cleanString(item.row.owner_name),
      stage: cleanString(item.row.stage),
      reason: item.blocked ? `${item.reason} | bloqueado: ${item.blockReasons.join(", ")}` : item.reason,
    })),
  };
}

export async function getLinkScraperDashboardData(): Promise<DataResult<LinkScraperDashboardData>> {
  const supabase = getSupabaseAdminClient();
  const empty: LinkScraperDashboardData = {
    batches: [],
    recipients: [],
    whatsappAgents: [],
    metrics: { totalBatches: 0, totalRows: 0, readyRows: 0, failedRows: 0, processingBatches: 0, legacyCandidates: 0 },
    legacyPreview: {
      matchedOpportunities: 0,
      blockedOpportunities: 0,
      archivedOpportunities: 0,
      readyToArchiveOpportunities: 0,
      readyToDeleteOpportunities: 0,
      sample: [],
    },
  };

  if (!supabase) return { data: empty, source: "mock", reason: "Supabase admin nao configurado." };

  const [batchResult, recipients, whatsappAgents, legacyPreview] = await Promise.all([
    supabase.from("market_analysis_import_batches").select("*").order("created_at", { ascending: false }).limit(20),
    listRecipients(),
    listWhatsappAgents(),
    getScraperLegacyCleanupPreview(),
  ]);

  if (batchResult.error) {
    return { data: empty, source: "mock", reason: batchResult.error.message };
  }

  const batchIds = ((batchResult.data || []) as DbRow[]).map((row) => cleanString(row.id)).filter(Boolean);
  const rowResult = batchIds.length
    ? await supabase
        .from("market_analysis_import_rows")
        .select("*")
        .in("batch_id", batchIds)
        .order("row_number", { ascending: true })
    : { data: [], error: null };

  const baseRows = rowResult.error ? [] : ((rowResult.data || []) as DbRow[]).map(normalizeRow);
  let rows = baseRows;
  if (baseRows.length) {
    const { data: runData } = await supabase
      .from("auction_scrape_runs")
      .select("import_row_id, extracted_payload, created_at")
      .in("import_row_id", baseRows.map((row) => row.id))
      .order("created_at", { ascending: false });
    const latestRunByRow = new Map<string, DbRow>();
    ((runData || []) as DbRow[]).forEach((run) => {
      const rowId = cleanString(run.import_row_id);
      if (rowId && !latestRunByRow.has(rowId)) latestRunByRow.set(rowId, run);
    });
    rows = baseRows.map((row) => mergeRowExtraction(row, latestRunByRow.get(row.id)));
  }

  const rowsByBatch = new Map<string, LinkScraperRow[]>();
  rows.forEach((row) => {
    const list = rowsByBatch.get(row.batchId) || [];
    list.push(row);
    rowsByBatch.set(row.batchId, list);
  });

  const batches = ((batchResult.data || []) as DbRow[]).map((row) => normalizeBatch(row, rowsByBatch.get(cleanString(row.id)) || []));
  const allRows = batches.flatMap((batch) => batch.rows);

  return {
    data: {
      batches,
      recipients,
      whatsappAgents,
      legacyPreview,
      metrics: {
        totalBatches: batches.length,
        totalRows: allRows.length,
        readyRows: allRows.filter((row) => row.status === "pronto_para_revisao").length,
        failedRows: allRows.filter((row) => row.status === "falha" || row.status === "url_invalida").length,
        processingBatches: batches.filter((batch) => batch.status === "processando").length,
        legacyCandidates: legacyPreview.matchedOpportunities,
      },
    },
    source: "supabase",
  };
}

export async function createScraperNotificationRecipient(input: {
  sectorName: string;
  recipientName?: string;
  whatsappNumber?: string;
  whatsappJid?: string;
  isGroup?: boolean;
  notes?: string;
}): Promise<MutationResult<{ id: string }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const sectorName = cleanString(input.sectorName);
  const whatsappNumber = cleanString(input.whatsappNumber).replace(/\D/g, "");
  const whatsappJid = cleanString(input.whatsappJid);
  if (!sectorName) return { ok: false, error: "Informe o setor." };
  if (!whatsappNumber && !whatsappJid) return { ok: false, error: "Informe o numero ou JID do WhatsApp." };

  const { data, error } = await supabase
    .from("scraper_notification_recipients")
    .insert({
      sector_name: sectorName,
      recipient_name: cleanString(input.recipientName) || sectorName,
      recipient_type: input.isGroup ? "group" : "sector",
      whatsapp_number: whatsappNumber || null,
      whatsapp_jid: whatsappJid || null,
      is_group: input.isGroup === true,
      notes: cleanString(input.notes) || null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: cleanString(data?.id) } };
}

export async function createLinkScraperBatch(input: {
  parsed: ParsedLinkImportFile;
  whatsappAgentKey?: string;
  whatsappInstanceId?: string;
  notificationRecipientId?: string;
  analysisDepth?: LinkAnalysisDepth | string;
}): Promise<MutationResult<{ batchId: string; rowsCreated: number }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const validRows = input.parsed.rows.filter((row) => row.status !== "url_invalida");
  if (!validRows.length) return { ok: false, error: "Nenhum link valido encontrado no arquivo." };
  const analysisDepth = normalizeAnalysisDepth(input.analysisDepth);
  const profile = analysisDepthProfile(analysisDepth);

  const { data: batch, error: batchError } = await supabase
    .from("market_analysis_import_batches")
    .insert({
      original_filename: input.parsed.filename,
      source_type: input.parsed.sourceType,
      row_count: input.parsed.rowCount,
      valid_row_count: input.parsed.validRowCount,
      invalid_row_count: input.parsed.invalidRowCount,
      status: "aguardando_inicio",
      whatsapp_agent_key: cleanString(input.whatsappAgentKey) || null,
      whatsapp_instance_id: cleanString(input.whatsappInstanceId) || null,
      notification_recipient_id: cleanString(input.notificationRecipientId) || null,
      mapping_payload: {
        analysisDepth,
        analysisLabel: ANALYSIS_DEPTH_LABELS[analysisDepth],
        profile,
        ignoredRowCount: input.parsed.ignoredRowCount,
        invalidRows: input.parsed.rows.filter((row) => row.status === "url_invalida"),
      },
    })
    .select("id")
    .single();

  if (batchError) return { ok: false, error: batchError.message };
  const batchId = cleanString(batch?.id);

  const rowsPayload = validRows.map((row) => ({
    batch_id: batchId,
    row_number: row.rowNumber,
    external_code: row.externalCode || null,
    auction_url: row.auctionUrl,
    source_domain: row.sourceDomain || null,
    city_hint: row.cityHint || null,
    state_hint: row.stateHint || null,
    auction_date_hint: row.auctionDateHint || null,
    property_type_hint: row.propertyTypeHint || null,
    status: "aguardando_inicio",
    raw_row_payload: { rawValues: row.rawValues, analysisDepth },
  }));

  const { error: rowsError } = await supabase.from("market_analysis_import_rows").insert(rowsPayload);
  if (rowsError) return { ok: false, error: rowsError.message };

  return { ok: true, data: { batchId, rowsCreated: rowsPayload.length } };
}

function titleFromHtml(html: string, domain: string) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = h1 || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  return cleanString(title.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "), `Imovel em leilao - ${domain}`);
}

function htmlToText(html: string) {
  return decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDocumentLinksFromHtml(html: string, baseUrl: string) {
  const documents: Array<{ label: string; url: string; kind: string }> = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html))) {
    try {
      const url = new URL(match[1], baseUrl).toString();
      const label = cleanString(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
      const normalized = `${label} ${url}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const isDocument =
        /\.(pdf|docx?|xlsx?|zip)(?:[?#]|$)/i.test(url) ||
        /edital|matricula|laudo|anexo|documento|processo|certidao/.test(normalized);
      if (!isDocument) continue;
      const kind = normalized.includes("matricula")
        ? "matricula"
        : normalized.includes("edital")
          ? "edital"
          : normalized.includes("laudo")
            ? "laudo"
            : "documento";
      documents.push({ label: label || kind, url, kind });
    } catch {}
  }

  const seen = new Set<string>();
  return documents.filter((document) => {
    if (seen.has(document.url)) return false;
    seen.add(document.url);
    return true;
  }).slice(0, 20);
}

function emptyAuctionPageSupplement(source = ""): AuctionPageSupplement {
  return { html: "", text: "", imageUrls: [], documentLinks: [], source, warnings: [] };
}

function isDomain(value: string, domain: string) {
  const clean = cleanString(value).replace(/^www\./i, "").toLowerCase();
  return clean === domain || clean.endsWith(`.${domain}`);
}

function firstKnown(...values: unknown[]) {
  return values.find((value) => value !== null && value !== undefined && cleanString(value) !== "") ?? "";
}

function escapeHtml(value: unknown) {
  return cleanString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveSupplementUrl(value: unknown, baseUrl: string) {
  const clean = cleanString(value).replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
  if (!clean || clean.startsWith("data:") || clean.startsWith("blob:")) return "";
  try {
    return new URL(clean, baseUrl).toString();
  } catch {
    return "";
  }
}

function formatMoneyForSupplement(value: number) {
  return value > 0 ? `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";
}

function centralSulLotIdFromUrl(value: string) {
  try {
    const pathname = new URL(value).pathname;
    return cleanString(pathname.match(/\/lote\/(\d+)\b/i)?.[1] || pathname.match(/\/lotes\/(\d+)\b/i)?.[1]);
  } catch {
    return "";
  }
}

function normalizeCentralSulLotPayload(payload: unknown) {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const body = asRecord(root.body);
  const candidates = [
    root,
    data,
    body,
    asRecord(data.lot),
    asRecord(data.lote),
    asRecord(body.lot),
    asRecord(body.lote),
    asRecord(root.lot),
    asRecord(root.lote),
  ];
  return candidates.find((candidate) =>
    cleanString(candidate.id || candidate.title || candidate.description || candidate.minimum_bid || candidate.value)
  ) || {};
}

function centralSulImageUrls(lot: DbRow, baseUrl: string) {
  const photos = [
    ...asArray(lot.photos),
    ...asArray(lot.images),
    ...asArray(lot.fotos),
    ...asArray(lot.gallery),
  ];
  return uniqueStrings(
    photos.flatMap((item) => {
      const photo = asRecord(item);
      return [
        photo.image_url,
        photo.thumbnail_url,
        photo.url,
        photo.original_url,
        photo.file_url,
        asRecord(photo.file).url,
        asRecord(photo.file).download_url,
      ].map((url) => resolveSupplementUrl(url, baseUrl));
    }),
    40
  );
}

function centralSulDocumentLinks(lot: DbRow, baseUrl: string): AuctionSiteDocument[] {
  const documents = [
    lot.file,
    ...asArray(lot.files),
    ...asArray(lot.documents),
    ...asArray(lot.documentos),
    ...asArray(lot.attachments),
  ];

  return mergeDocumentLinks(documents.map((item) => {
    const document = asRecord(item);
    const nestedFile = asRecord(document.file);
    const label = firstText(
      cleanString(document.name),
      cleanString(document.title),
      cleanString(document.label),
      cleanString(document.description),
      cleanString(nestedFile.name),
      cleanString(nestedFile.title),
      "Documento"
    );
    const url = resolveSupplementUrl(firstKnown(
      document.download_url,
      document.url,
      document.file_url,
      nestedFile.download_url,
      nestedFile.url,
      nestedFile.file_url
    ), baseUrl);
    const normalized = `${label} ${url}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const kind = normalized.includes("matricula")
      ? "matricula"
      : normalized.includes("edital")
        ? "edital"
        : normalized.includes("laudo")
          ? "laudo"
          : "documento";
    return { label, url, kind };
  }));
}

const ASTAVERO_DOMAINS = ["oesteleiloes.com.br", "topleiloes.com.br"];

function isAstaveroDomain(value: string) {
  return ASTAVERO_DOMAINS.some((domain) => isDomain(value, domain));
}

function astaveroIdsFromUrl(value: string) {
  try {
    const pathname = new URL(value).pathname;
    const match = pathname.match(/\/pregao\/([0-9a-f]{24})(?:\/|-)([0-9a-f]{24})(?:\/|$)/i);
    if (!match) return null;
    return { auctionId: match[1], lotId: match[2] };
  } catch {
    return null;
  }
}

function formatDateForSupplement(value: unknown) {
  const clean = cleanString(value);
  if (!clean) return "";
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})T?(\d{2})?:?(\d{2})?/);
  if (!iso) return clean;
  const [, year, month, day, hour, minute] = iso;
  return `${day}/${month}/${year}${hour && minute ? ` ${hour}:${minute}` : ""}`;
}

function formatAreaForSupplement(value: number) {
  return value > 0 ? `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m2` : "";
}

function areaFromText(value: string) {
  const normalized = decodeHtmlEntities(value);
  const patterns = [
    /area\s+(?:rural\s+)?com\s+([\d.]+(?:,\d{1,4})?)\s*m(?:2|²)/i,
    /area\s+de\s+([\d.]+(?:,\d{1,4})?)\s*m(?:2|²)/i,
    /([\d.]+(?:,\d{1,4})?)\s*m(?:2|²)/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const area = asMoneyNumber(match?.[1]);
    if (area > 0) return area;
  }
  return 0;
}

function isLikelySupplementImageUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) return false;
  if (!/\.(?:jpe?g|png|webp|avif)(?:[?#]|$)/i.test(value)) return false;
  const normalized = value.toLowerCase();
  return ![
    "logo",
    "favicon",
    "whatsapp",
    "facebook",
    "instagram",
    "youtube",
    "banner",
    "modal",
    "popup",
    "edital",
    "matricula",
    "parcelamento",
    "proposta",
    "de_desconto",
    "desconto.png",
    "desconto.jpg",
    "tarja",
    "retirado",
    "selo",
  ].some((signal) => normalized.includes(signal));
}

const PESTANA_CHARACTERISTIC_LABELS: Record<string, string> = {
  "1759180483479": "Descricao completa",
  "1759180486051": "Situacao",
  "1759180487526": "Data 1o Leilao",
  "1759180490557": "Valor 1o Leilao",
  "1759180492589": "Data 2o Leilao",
  "1759180494620": "Valor 2o Leilao",
  "1759180496725": "Area Total",
  "1759180497769": "Area Privativa",
  "1759180500119": "Area de Terreno",
  "1759180501812": "Area Construida",
  "1759180502843": "Permite visitacao",
  "1759180503875": "Debitos",
  "1759180506907": "Tipo",
  "1759180508941": "Matricula",
  "1759180515049": "Bairro",
  "1759180517085": "Logradouro",
  "1759180520114": "Numero",
  "1759180523151": "Complemento",
  "1759180526185": "Distancia do Metro",
  "1759180529217": "Acao Judicial",
  "11111": "UF",
  "22222": "Cidade",
};

type PestanaCharacteristicEntry = {
  label: string;
  value: string;
  typeId: string;
};

function pestanaIdsFromUrl(value: string) {
  try {
    const pathname = new URL(value).pathname;
    const match = pathname.match(/\/agenda-de-leiloes\/(\d+)\/(\d+)(?:\/|$)/i);
    if (!match) return null;
    return { auctionId: match[1], lotId: match[2] };
  } catch {
    return null;
  }
}

function normalizePestanaText(value: string) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00b2/g, "2")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulPestanaValue(value: unknown) {
  const clean = cleanString(value);
  if (!clean) return "";
  const normalized = normalizePestanaText(clean);
  if (["nao informado", "nao informada", "null", "undefined", "-"].includes(normalized)) return "";
  return clean;
}

function pestanaAssets(lot: DbRow) {
  return asArray(lot.bens)
    .map(asRecord)
    .sort((a, b) => asNumber(a.ordem, 999) - asNumber(b.ordem, 999));
}

function pestanaCharacteristicEntries(lot: DbRow): PestanaCharacteristicEntry[] {
  return pestanaAssets(lot).flatMap((asset) =>
    asArray(asset.caracteristicas).map((item) => {
      const characteristic = asRecord(item);
      const typeId = cleanString(characteristic.tipo);
      return {
        typeId,
        label: cleanString(characteristic.nome, PESTANA_CHARACTERISTIC_LABELS[typeId] || typeId),
        value: meaningfulPestanaValue(characteristic.valor),
      };
    }).filter((entry) => entry.label && entry.value)
  );
}

function pestanaCharacteristicValue(entries: PestanaCharacteristicEntry[], labels: string[]) {
  const targets = labels.map(normalizePestanaText);
  return entries.find((entry) =>
    targets.includes(normalizePestanaText(entry.label)) ||
    targets.includes(normalizePestanaText(entry.typeId))
  )?.value || "";
}

function pestanaMoneyFromLot(lot: DbRow, cardLot: DbRow, keys: string[]) {
  const law = asRecord(lot.informacoesLei9514);
  const cardLaw = asRecord(firstKnown(cardLot.footer && asRecord(cardLot.footer).leilaoLei, cardLot.informacoesLei9514));
  const footer = asRecord(cardLot.footer);
  return firstPositive(
    ...keys.flatMap((key) => [
      asMoneyNumber(lot[key]),
      asMoneyNumber(cardLot[key]),
      asMoneyNumber(law[key]),
      asMoneyNumber(cardLaw[key]),
      asMoneyNumber(footer[key]),
    ])
  );
}

function pestanaMediaUrl(value: unknown) {
  const clean = cleanString(value);
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;
  return `https://ged.pestanaleiloes.com.br/ged/${clean.replace(/^\/+/, "")}`;
}

function pestanaImageUrls(lot: DbRow, cardLot: DbRow) {
  const assets = [...pestanaAssets(lot), ...pestanaAssets(cardLot)];
  const urls = assets.flatMap((asset) => {
    const main = asRecord(asset.imagemPrincipal);
    return [
      main.original,
      main.media,
      main.pequena,
      asset.imagemPlaceholder,
      ...asArray(asset.imagens).flatMap((item) => {
        const image = asRecord(item);
        return [image.original, image.media, image.pequena];
      }),
    ].map(pestanaMediaUrl);
  });
  return uniqueStrings(urls.filter(isLikelySupplementImageUrl), 50);
}

function pestanaDocumentLinks(lot: DbRow): AuctionSiteDocument[] {
  const documents = [
    ...asArray(lot.documentos),
    ...pestanaAssets(lot).flatMap((asset) => asArray(asset.documentos)),
  ];

  return mergeDocumentLinks(documents.map((item) => {
    const document = asRecord(item);
    const label = cleanString(document.nome || document.label || document.titulo, "Documento");
    const url = cleanString(document.link || document.url || document.href);
    const normalized = normalizePestanaText(`${label} ${url}`);
    const kind = normalized.includes("matricula")
      ? "matricula"
      : normalized.includes("edital")
        ? "edital"
        : "documento";
    return { label, url, kind };
  }));
}

function buildPestanaSupplement(input: {
  lot: DbRow;
  cardLot: DbRow;
  ids: { auctionId: string; lotId: string };
  sourceUrl: string;
  apiUrl: string;
}) {
  const entries = pestanaCharacteristicEntries(input.lot);
  const assets = pestanaAssets(input.lot);
  const primaryAsset = assets.find((asset) => normalizePestanaText(pestanaCharacteristicValue(
    asArray(asset.caracteristicas).map((item) => {
      const characteristic = asRecord(item);
      const typeId = cleanString(characteristic.tipo);
      return {
        typeId,
        label: cleanString(characteristic.nome, PESTANA_CHARACTERISTIC_LABELS[typeId] || typeId),
        value: meaningfulPestanaValue(characteristic.valor),
      };
    }).filter((entry) => entry.label && entry.value),
    ["Tipo"]
  )) !== "vaga de garagem") || assets[0] || {};
  const title = firstText(cleanString(input.lot.descricao), cleanString(primaryAsset.descricao), `Lote ${input.ids.lotId}`);
  const law = asRecord(input.lot.informacoesLei9514);
  const cardFooter = asRecord(input.cardLot.footer);
  const footerLaw = asRecord(firstKnown(cardFooter.leilaoLei, input.cardLot.informacoesLei9514));
  const description = firstText(
    pestanaCharacteristicValue(entries, ["Descricao completa"]),
    cleanString(primaryAsset.descricao),
    cleanString(input.lot.descricao)
  );
  const observation = uniqueStrings(pestanaAssets(input.lot).map((asset) => cleanString(asset.observacao)).filter(Boolean), 4).join("\n");
  const street = pestanaCharacteristicValue(entries, ["Logradouro"]);
  const number = pestanaCharacteristicValue(entries, ["Numero"]);
  const complement = pestanaCharacteristicValue(entries, ["Complemento"]);
  const neighborhood = pestanaCharacteristicValue(entries, ["Bairro"]);
  const city = pestanaCharacteristicValue(entries, ["Cidade"]);
  const state = pestanaCharacteristicValue(entries, ["UF"]).toUpperCase();
  const address = [street, number].filter(Boolean).join(", ");
  const propertyType = pestanaCharacteristicValue(entries, ["Tipo"]) || inferPropertyType(`${title} ${description}`, "");
  const occupancy = pestanaCharacteristicValue(entries, ["Situacao"]) || firstText(
    normalizePestanaText(observation).includes("ocupado") ? "Ocupado" : "",
    normalizePestanaText(observation).includes("desocupado") ? "Desocupado" : ""
  );
  const privateArea = firstPositive(asMoneyNumber(pestanaCharacteristicValue(entries, ["Area Privativa"])), areaFromText(description));
  const landArea = asMoneyNumber(pestanaCharacteristicValue(entries, ["Area de Terreno", "Area Total"]));
  const builtArea = asMoneyNumber(pestanaCharacteristicValue(entries, ["Area Construida"]));
  const firstAuctionValue = firstPositive(
    asMoneyNumber(pestanaCharacteristicValue(entries, ["Valor 1o Leilao"])),
    asMoneyNumber(firstKnown(law.valorLeilao1, footerLaw.valorLeilao1, cardFooter.valorLeilao1))
  );
  const secondAuctionValue = firstPositive(
    asMoneyNumber(pestanaCharacteristicValue(entries, ["Valor 2o Leilao"])),
    asMoneyNumber(firstKnown(law.valorLeilao2, footerLaw.valorLeilao2, cardFooter.valorLeilao2))
  );
  const minimumBid = pestanaMoneyFromLot(input.lot, input.cardLot, ["lanceMinimo", "valorInicial", "valorFiltro", "lanceInicial", "valor"]);
  const firstAuctionDate = firstText(
    pestanaCharacteristicValue(entries, ["Data 1o Leilao"]),
    formatDateForSupplement(cardFooter.date)
  );
  const secondAuctionDate = pestanaCharacteristicValue(entries, ["Data 2o Leilao"]);
  const documents = pestanaDocumentLinks(input.lot);
  const imageUrls = pestanaImageUrls(input.lot, input.cardLot);
  const extraFields = entries
    .filter((entry) => !["descricao completa"].includes(normalizePestanaText(entry.label)))
    .map((entry) => `${entry.label}: ${entry.value}`);

  const text = [
    "Fonte complementar Pestana Leiloes",
    `Titulo: ${title}`,
    `Lote: ${cleanString(input.lot.numero, input.ids.lotId)}`,
    propertyType ? `Tipo: ${propertyType}` : "",
    address ? `Endereco: ${[address, complement].filter(Boolean).join(" - ")}` : "",
    neighborhood ? `Bairro: ${neighborhood}` : "",
    city || state ? `Cidade/UF: ${[city, state].filter(Boolean).join("/")}` : "",
    occupancy ? `Ocupacao: ${occupancy}` : "",
    privateArea ? `Area privativa: ${formatAreaForSupplement(privateArea)}` : "",
    landArea ? `Area do terreno: ${formatAreaForSupplement(landArea)}` : "",
    builtArea ? `Area construida: ${formatAreaForSupplement(builtArea)}` : "",
    firstAuctionValue ? `Valor 1o Leilao: ${formatMoneyForSupplement(firstAuctionValue)}` : "",
    secondAuctionValue ? `Valor 2o Leilao: ${formatMoneyForSupplement(secondAuctionValue)}` : "",
    minimumBid ? `Lance minimo: ${formatMoneyForSupplement(minimumBid)}` : "",
    firstAuctionDate ? `Data 1o Leilao: ${firstAuctionDate}` : "",
    secondAuctionDate ? `Data 2o Leilao: ${secondAuctionDate}` : "",
    asMoneyNumber(input.lot.incrementoMinimo) ? `Incremento minimo: ${formatMoneyForSupplement(asMoneyNumber(input.lot.incrementoMinimo))}` : "",
    pestanaCharacteristicValue(entries, ["Debitos"]) ? `Debitos: ${pestanaCharacteristicValue(entries, ["Debitos"])}` : "",
    pestanaCharacteristicValue(entries, ["Acao Judicial"]) ? `Acao Judicial: ${pestanaCharacteristicValue(entries, ["Acao Judicial"])}` : "",
    pestanaCharacteristicValue(entries, ["Matricula"]) ? `Matricula: ${pestanaCharacteristicValue(entries, ["Matricula"])}` : "",
    description ? `Descricao completa: ${description}` : "",
    observation ? `Observacoes: ${observation}` : "",
    extraFields.length ? `Caracteristicas: ${uniqueStrings(extraFields, 40).join(" | ")}` : "",
    imageUrls.length ? `Galeria de imagens: ${imageUrls.join(" | ")}` : "",
    documents.length ? `Documentos: ${documents.map((document) => `${document.label}: ${document.url}`).join(" | ")}` : "",
  ].filter(Boolean).join("\n");

  const html = [
    `<h1>${escapeHtml(title)}</h1>`,
    `<section>${escapeHtml(text)}</section>`,
    imageUrls.map((url) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(title)}" />`).join("\n"),
    documents.map((document) => `<a href="${escapeHtml(document.url)}">${escapeHtml(document.label)}</a>`).join("\n"),
  ].filter(Boolean).join("\n");

  return {
    html,
    text,
    imageUrls,
    documentLinks: documents,
    source: input.apiUrl,
    warnings: [],
  } satisfies AuctionPageSupplement;
}

async function fetchPestanaSupplement(input: { sourceUrl: string; resolvedSourceUrl: string; timeoutMs: number }) {
  const ids = pestanaIdsFromUrl(input.resolvedSourceUrl) || pestanaIdsFromUrl(input.sourceUrl);
  if (!ids) {
    return {
      ...emptyAuctionPageSupplement("pestana_leiloes_api"),
      warnings: ["Pestana: link sem ids de leilao/lote para consulta complementar."],
    };
  }

  const origin = (() => {
    try {
      return new URL(input.resolvedSourceUrl || input.sourceUrl).origin;
    } catch {
      return "https://www.pestanaleiloes.com.br";
    }
  })();
  const apiUrl = `${origin}/api/v2/lote/por-leilao?idLeilao=${encodeURIComponent(ids.auctionId)}`;
  const timeout = Math.min(Math.max(input.timeoutMs, 12_000), 40_000);
  const headers = auctionApiFetchHeaders(input.resolvedSourceUrl || input.sourceUrl);

  try {
    const response = await fetch(apiUrl, {
      headers,
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) {
      return {
        ...emptyAuctionPageSupplement("pestana_leiloes_api"),
        warnings: [`Pestana: API de lote retornou HTTP ${response.status}.`],
      };
    }

    const lots = asArray(await response.json()).map(asRecord);
    const lot = lots.find((candidate) => cleanString(candidate.id) === ids.lotId) || {};
    if (!cleanString(lot.id || lot.descricao)) {
      return {
        ...emptyAuctionPageSupplement("pestana_leiloes_api"),
        warnings: ["Pestana: API nao retornou o lote solicitado."],
      };
    }

    const cardsApiUrl = `${origin}/api/v2/lote/cards-por-ids`;
    let cardLot: DbRow = {};
    try {
      const cardsResponse = await fetch(cardsApiUrl, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: [Number(ids.lotId)] }),
        signal: AbortSignal.timeout(timeout),
      });
      if (cardsResponse.ok) {
        cardLot = asArray(await cardsResponse.json()).map(asRecord).find((candidate) => cleanString(candidate.id) === ids.lotId) || {};
      }
    } catch {}

    return buildPestanaSupplement({
      lot,
      cardLot,
      ids,
      sourceUrl: input.resolvedSourceUrl || input.sourceUrl,
      apiUrl,
    });
  } catch {
    return {
      ...emptyAuctionPageSupplement("pestana_leiloes_api"),
      warnings: ["Pestana: API complementar indisponivel."],
    };
  }
}

function astaveroAttachmentUrl(item: unknown, baseUrl: string) {
  const attachment = asRecord(item);
  return resolveSupplementUrl(firstKnown(
    attachment.url,
    attachment.href,
    attachment.download_url,
    attachment.file_url,
    attachment.path && attachment.arquivo ? `${cleanString(attachment.path)}${cleanString(attachment.arquivo)}` : ""
  ), baseUrl);
}

function astaveroImageUrls(lot: DbRow, baseUrl: string) {
  const attachments = [
    lot.image,
    ...asArray(lot.anexos),
    ...asArray(lot.fotos),
    ...asArray(lot.images),
    ...asArray(lot.galeria),
  ];
  return uniqueStrings(
    attachments
      .map((item) => {
        if (typeof item === "string") return resolveSupplementUrl(item, baseUrl);
        return astaveroAttachmentUrl(item, baseUrl);
      })
      .filter(isLikelySupplementImageUrl),
    50
  );
}

function astaveroDocumentLinks(lot: DbRow, auction: DbRow, baseUrl: string): AuctionSiteDocument[] {
  const attachments = [
    ...asArray(auction.anexos),
    ...asArray(lot.anexos),
    ...asArray(lot.documents),
    ...asArray(lot.documentos),
  ];

  return mergeDocumentLinks(attachments.map((item) => {
    const attachment = asRecord(item);
    const label = firstText(
      cleanString(attachment.nome),
      cleanString(attachment.titulo),
      cleanString(attachment.label),
      cleanString(attachment.arquivo),
      "Documento"
    );
    const url = astaveroAttachmentUrl(item, baseUrl);
    const normalized = `${label} ${url}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const isDocument =
      /\.(pdf|docx?|xlsx?|zip)(?:[?#]|$)/i.test(url) ||
      /edital|matricula|laudo|documento|processo|certidao/.test(normalized);
    if (!isDocument) return { label: "", url: "", kind: "" };
    const kind = normalized.includes("matricula")
      ? "matricula"
      : normalized.includes("edital")
        ? "edital"
        : normalized.includes("laudo")
          ? "laudo"
          : "documento";
    return { label, url, kind };
  }));
}

function normalizeAstaveroPayload(payload: unknown, lotId: string) {
  const root = asRecord(payload);
  const detailedLot = asRecord(root.lote);
  const lots = asArray(root.lotes).map(asRecord);
  const lot = cleanString(detailedLot._id) === lotId || cleanString(detailedLot.nome || detailedLot.detalhada)
    ? detailedLot
    : lots.find((candidate) => cleanString(candidate._id) === lotId) || detailedLot || {};
  return {
    auction: asRecord(root.leilao),
    lot,
  };
}

function buildAstaveroSupplement(payload: unknown, ids: { auctionId: string; lotId: string }, sourceUrl: string, apiUrl: string): AuctionPageSupplement {
  const { auction, lot } = normalizeAstaveroPayload(payload, ids.lotId);
  const values = asRecord(lot.v);
  const addressData = asRecord(lot.d);
  const sellerData = asRecord(lot.w);
  const dates = asRecord(firstKnown(lot.datas, auction.datas));
  const title = firstText(cleanString(lot.nome), titleFromHtml("", "astavero"));
  const descriptionText = htmlToText(cleanString(firstKnown(lot.detalhada, lot.descricao, lot.description, lot.motivo)));
  const landArea = firstPositive(
    areaFromText(`${title}\n${descriptionText}`),
    asMoneyNumber(firstKnown(addressData.area, addressData.area_m2, lot.area_m2, lot.area))
  );
  const appraisalValue = firstPositive(
    asMoneyNumber(firstKnown(values.avaliacao, values.corrigido, lot.avaliacao, lot.valor_avaliacao)),
    asMoneyNumber(firstKnown(values.primeira, lot.valor))
  );
  const auctionRound = asNumber(firstKnown(lot.praca, auction.praca));
  const firstRoundBid = asMoneyNumber(firstKnown(values.primeira, values.lance1));
  const secondRoundBid = asMoneyNumber(firstKnown(values.segunda, values.lance2));
  const currentBid = firstPositive(
    asMoneyNumber(firstKnown(values.valor, values.atual, values.maior, lot.valor)),
    auctionRound > 1 ? secondRoundBid : firstRoundBid,
    firstRoundBid,
    secondRoundBid
  );
  const increment = asMoneyNumber(firstKnown(values.incremento, lot.incremento));
  const commissionPct = asNumber(firstKnown(values.comissao, lot.comissao));
  const city = cleanString(addressData.cidade);
  const state = cleanString(addressData.uf);
  const address = cleanString(firstKnown(addressData.endereco, addressData.local, addressData.visita));
  const payment = firstText(cleanString(auction.pix), cleanString(auction.pagto), "Pagamento a Vista");
  const auctionDate = formatDateForSupplement(firstKnown(dates.leilao, dates.d, dates.d1, dates.d2, dates.encerrado));
  const baseUrl = sourceUrl || apiUrl;
  const imageUrls = astaveroImageUrls(lot, baseUrl);
  const documentLinks = astaveroDocumentLinks(lot, auction, baseUrl);

  const text = [
    "Fonte complementar Astavero Leiloes",
    `Titulo: ${title}`,
    cleanString(lot.lote) ? `Lote: ${cleanString(lot.lote)}` : "",
    address ? `Endereco: ${address}` : "",
    city || state ? `Cidade/UF: ${[city, state].filter(Boolean).join("/")}` : "",
    cleanString(sellerData.nome || sellerData.snome) ? `Vendedor: ${cleanString(firstKnown(sellerData.nome, sellerData.snome))}` : "",
    landArea ? `Area do terreno: ${formatAreaForSupplement(landArea)}` : "",
    appraisalValue ? `Valor de avaliacao: ${formatMoneyForSupplement(appraisalValue)}` : "",
    currentBid ? `Lance inicial/proximo lance: ${formatMoneyForSupplement(currentBid)}` : "",
    firstRoundBid ? `1 leilao: ${formatMoneyForSupplement(firstRoundBid)} em ${formatDateForSupplement(firstKnown(dates.d1, dates.d))}` : "",
    secondRoundBid ? `2 leilao: ${formatMoneyForSupplement(secondRoundBid)} em ${formatDateForSupplement(dates.d2)}` : "",
    increment ? `Incremento: ${formatMoneyForSupplement(increment)}` : "",
    commissionPct ? `Comissao: ${commissionPct}%` : "",
    auctionDate ? `Data do leilao: ${auctionDate}` : "",
    payment ? `Pagamento: ${payment}` : "",
    cleanString(lot.status) ? `Status: ${cleanString(lot.status)}` : "",
    descriptionText ? `Descricao do lote: ${descriptionText}` : "",
    imageUrls.length ? `Galeria de imagens: ${imageUrls.join(" | ")}` : "",
    documentLinks.length ? `Documentos: ${documentLinks.map((document) => `${document.label}: ${document.url}`).join(" | ")}` : "",
  ].filter(Boolean).join("\n");

  const html = [
    `<h1>${escapeHtml(title)}</h1>`,
    `<section>${escapeHtml(text)}</section>`,
    imageUrls.map((url) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(title)}" />`).join("\n"),
    documentLinks.map((document) => `<a href="${escapeHtml(document.url)}">${escapeHtml(document.label)}</a>`).join("\n"),
  ].filter(Boolean).join("\n");

  return {
    html,
    text,
    imageUrls,
    documentLinks,
    source: apiUrl,
    warnings: [],
  };
}

function buildCentralSulSupplement(lot: DbRow, sourceUrl: string, apiUrl: string): AuctionPageSupplement {
  const auction = asRecord(firstKnown(lot.auction, lot.leilao));
  const title = firstText(cleanString(lot.title), cleanString(lot.titulo), titleFromHtml("", "centralsuldeleiloes.com.br"));
  const descriptionText = htmlToText(cleanString(firstKnown(lot.description, lot.descricao)));
  const auctionDescriptionText = htmlToText(cleanString(firstKnown(auction.description, auction.descricao)));
  const appraisalValue = asMoneyNumber(firstKnown(lot.value, lot.appraisal_value, lot.appraisalValue, lot.avaliacao));
  const minimumBid = firstPositive(
    asMoneyNumber(firstKnown(lot.minimum_bid, lot.minimumBid, lot.lance_minimo, lot.lanceMinimo)),
    asMoneyNumber(firstKnown(lot.initial_bid, lot.initialBid, lot.lance_inicial))
  );
  const currentBid = asMoneyNumber(firstKnown(lot.current_bid, lot.currentBid, lot.maior_lance));
  const auctionDate = cleanString(firstKnown(lot.time_limit, lot.ends_at, lot.date_limit, lot.data_limite, lot.data_fim));
  const increment = asMoneyNumber(firstKnown(lot.increment, lot.incremento));
  const processCode = cleanString(firstKnown(lot.code, lot.process, lot.process_number, lot.numero_processo));
  const baseUrl = sourceUrl || apiUrl;
  const imageUrls = centralSulImageUrls(lot, baseUrl);
  const documentLinks = centralSulDocumentLinks(lot, baseUrl);

  const text = [
    "Fonte complementar Central Sul de Leiloes",
    `Titulo: ${title}`,
    processCode ? `Processo: ${processCode}` : "",
    appraisalValue ? `Avaliacao: ${formatMoneyForSupplement(appraisalValue)}` : "",
    minimumBid ? `Lance minimo: ${formatMoneyForSupplement(minimumBid)}` : "",
    currentBid ? `Maior lance atual: ${formatMoneyForSupplement(currentBid)}` : "",
    increment ? `Incremento: ${formatMoneyForSupplement(increment)}` : "",
    auctionDate ? `Lances serao aceitos ate: ${auctionDate}` : "",
    descriptionText ? `Descricao do lote: ${descriptionText}` : "",
    auctionDescriptionText ? `Condicoes do leilao: ${auctionDescriptionText}` : "",
    imageUrls.length ? `Galeria de imagens: ${imageUrls.join(" | ")}` : "",
    documentLinks.length ? `Documentos: ${documentLinks.map((document) => `${document.label}: ${document.url}`).join(" | ")}` : "",
  ].filter(Boolean).join("\n");

  const html = [
    `<h1>${escapeHtml(title)}</h1>`,
    `<section>${escapeHtml(text)}</section>`,
    imageUrls.map((url) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(title)}" />`).join("\n"),
    documentLinks.map((document) => `<a href="${escapeHtml(document.url)}">${escapeHtml(document.label)}</a>`).join("\n"),
  ].filter(Boolean).join("\n");

  return {
    html,
    text,
    imageUrls,
    documentLinks,
    source: apiUrl,
    warnings: [],
  };
}

async function fetchCentralSulSupplement(input: { sourceUrl: string; resolvedSourceUrl: string; timeoutMs: number }) {
  const lotId = centralSulLotIdFromUrl(input.resolvedSourceUrl) || centralSulLotIdFromUrl(input.sourceUrl);
  if (!lotId) return emptyAuctionPageSupplement("central_sul_api");

  const origin = (() => {
    try {
      return new URL(input.resolvedSourceUrl || input.sourceUrl).origin;
    } catch {
      return "https://www.centralsuldeleiloes.com.br";
    }
  })();
  const endpoints = [
    `${origin}/api/v2/web/lot/${lotId}`,
    `${origin}/api/lot/${lotId}`,
  ];

  for (const apiUrl of endpoints) {
    try {
      const response = await fetch(apiUrl, {
        headers: auctionApiFetchHeaders(input.resolvedSourceUrl || input.sourceUrl),
        signal: AbortSignal.timeout(Math.min(Math.max(input.timeoutMs, 12_000), 35_000)),
      });
      if (!response.ok) continue;
      const payload = await response.json();
      const lot = normalizeCentralSulLotPayload(payload);
      if (!cleanString(lot.id || lot.title || lot.description)) continue;
      return buildCentralSulSupplement(lot, input.resolvedSourceUrl || input.sourceUrl, apiUrl);
    } catch {}
  }

  return {
    ...emptyAuctionPageSupplement("central_sul_api"),
    warnings: ["Central Sul: API complementar indisponivel."],
  };
}

async function fetchAstaveroSupplement(input: { sourceUrl: string; resolvedSourceUrl: string; timeoutMs: number; domain: string }) {
  const ids = astaveroIdsFromUrl(input.resolvedSourceUrl) || astaveroIdsFromUrl(input.sourceUrl);
  const source = isDomain(input.domain, "oesteleiloes.com.br")
    ? "oeste_leiloes_api"
    : isDomain(input.domain, "topleiloes.com.br")
      ? "top_leiloes_api"
      : "astavero_api";
  if (!ids) {
    return {
      ...emptyAuctionPageSupplement(source),
      warnings: ["Astavero: link sem ids de pregao/lote para consulta complementar."],
    };
  }

  const origin = (() => {
    try {
      return new URL(input.resolvedSourceUrl || input.sourceUrl).origin;
    } catch {
      return `https://${input.domain}`;
    }
  })();
  const apiUrl = `${origin}/app/pregao/init`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: origin,
        ...auctionApiFetchHeaders(input.resolvedSourceUrl || input.sourceUrl),
      },
      body: JSON.stringify({ id: ids.auctionId, idl: ids.lotId, cadastro: "" }),
      signal: AbortSignal.timeout(Math.min(Math.max(input.timeoutMs, 12_000), 35_000)),
    });
    if (!response.ok) {
      return {
        ...emptyAuctionPageSupplement(source),
        warnings: [`Astavero: API complementar retornou HTTP ${response.status}.`],
      };
    }

    const payload = await response.json();
    const supplement = buildAstaveroSupplement(payload, ids, input.resolvedSourceUrl || input.sourceUrl, apiUrl);
    if (!cleanString(supplement.text)) {
      return {
        ...emptyAuctionPageSupplement(source),
        warnings: ["Astavero: API complementar nao trouxe dados do lote."],
      };
    }
    return supplement;
  } catch {
    return {
      ...emptyAuctionPageSupplement(source),
      warnings: ["Astavero: API complementar indisponivel."],
    };
  }
}

async function fetchAuctionPageSupplement(input: {
  sourceUrl: string;
  resolvedSourceUrl: string;
  domain: string;
  timeoutMs: number;
}) {
  if (isDomain(input.domain, "pestanaleiloes.com.br")) {
    return fetchPestanaSupplement(input);
  }
  if (isDomain(input.domain, "centralsuldeleiloes.com.br")) {
    return fetchCentralSulSupplement(input);
  }
  if (isAstaveroDomain(input.domain)) {
    return fetchAstaveroSupplement(input);
  }
  return emptyAuctionPageSupplement();
}

function inferPropertyType(text: string, fallback: string) {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (fallback) return fallback;
  if (normalized.includes("apartamento") || normalized.includes("apto")) return "apartamento";
  if (normalized.includes("terreno") || normalized.includes("lote")) return "terreno";
  if (normalized.includes("galpao") || normalized.includes("industrial")) return "industrial";
  if (normalized.includes("sala") || normalized.includes("loja") || normalized.includes("comercial")) return "comercial";
  if (normalized.includes("rural") || normalized.includes("fazenda") || normalized.includes("sitio")) return "rural";
  if (normalized.includes("casa") || normalized.includes("sobrado")) return "casa";
  return "imovel";
}

function findMoneyAfter(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[^\\dR$]{0,60}(?:R\\$)?\\s*([\\d.]+,\\d{2})`, "i");
    const match = text.match(pattern);
    if (match) return asNumber(match[1]);
  }
  return 0;
}

function discountPct(appraisalValue: number, initialBid: number) {
  if (appraisalValue <= 0 || initialBid <= 0) return 0;
  return Math.max(0, Math.round(((appraisalValue - initialBid) / appraisalValue) * 100));
}

function makeSourceHash(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function firstPositive(...values: number[]) {
  return values.find((value) => Number.isFinite(value) && value > 0) || 0;
}

function firstText(...values: string[]) {
  return values.find((value) => cleanString(value)) || "";
}

function uniqueStrings(values: string[], limit = 60) {
  const seen = new Set<string>();
  return values
    .map((value) => cleanString(value))
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, limit);
}

function mergeDocumentLinks(...lists: Array<Array<AuctionSiteDocument | { label: string; url: string; kind: string }>>) {
  const seen = new Set<string>();
  return lists
    .flat()
    .map((document) => ({
      label: cleanString(document.label, cleanString(document.kind, "documento")),
      url: cleanString(document.url),
      kind: cleanString(document.kind, "documento"),
    }))
    .filter((document) => document.url)
    .filter((document) => {
      if (seen.has(document.url)) return false;
      seen.add(document.url);
      return true;
    })
    .slice(0, 30);
}

function fieldHasValue(field: string, extraction: AuctionLinkExtraction) {
  const normalized = field
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized.includes("lance")) return extraction.initialBid > 0;
  if (normalized.includes("avaliacao") || normalized.includes("mercado")) return extraction.appraisalValue > 0;
  if (normalized.includes("data")) return Boolean(extraction.auctionDate);
  if (normalized.includes("area")) return Boolean(extraction.privateAreaM2 || extraction.builtAreaM2 || extraction.landAreaM2);
  if (normalized.includes("jurid")) return Boolean(extraction.legalSignal);
  if (normalized.includes("cidade")) return Boolean(extraction.city);
  if (normalized.includes("estado") || normalized.includes("uf")) return Boolean(extraction.state);
  return false;
}

function mergeAuctionExtraction(gemini: AuctionLinkExtraction, adapter: AuctionSiteExtractionPatch): AuctionLinkExtraction {
  const trustedAdapter = (adapter.confidenceScore || 0) >= 70;
  const pickText = (geminiValue: string, adapterValue?: string) =>
    trustedAdapter ? firstText(adapterValue || "", geminiValue) : firstText(geminiValue, adapterValue || "");
  const pickNumber = (geminiValue: number, adapterValue?: number) =>
    trustedAdapter ? firstPositive(adapterValue || 0, geminiValue) : firstPositive(geminiValue, adapterValue || 0);
  const merged: AuctionLinkExtraction = {
    ...gemini,
    title: pickText(gemini.title, adapter.title),
    propertyType: pickText(gemini.propertyType, adapter.propertyType),
    address: pickText(gemini.address, adapter.address),
    city: pickText(gemini.city, adapter.city),
    state: pickText(gemini.state, adapter.state).toUpperCase(),
    neighborhood: pickText(gemini.neighborhood, adapter.neighborhood),
    landAreaM2: pickNumber(gemini.landAreaM2, adapter.landAreaM2),
    builtAreaM2: pickNumber(gemini.builtAreaM2, adapter.builtAreaM2),
    privateAreaM2: pickNumber(gemini.privateAreaM2, adapter.privateAreaM2),
    bedrooms: pickNumber(gemini.bedrooms, adapter.bedrooms),
    parkingSpaces: pickNumber(gemini.parkingSpaces, adapter.parkingSpaces),
    initialBid: pickNumber(gemini.initialBid, adapter.initialBid),
    appraisalValue: pickNumber(gemini.appraisalValue, adapter.appraisalValue),
    auctionDate: pickText(gemini.auctionDate, adapter.auctionDate),
    paymentCondition: pickText(gemini.paymentCondition, adapter.paymentCondition),
    occupancy: pickText(gemini.occupancy, adapter.occupancy),
    legalSignal: pickText(gemini.legalSignal, adapter.legalSignal),
    summary: firstText(gemini.summary, adapter.summary || ""),
    cautionNotes: firstText(gemini.cautionNotes, adapter.cautionNotes || ""),
    confidenceScore: Math.max(gemini.confidenceScore || 0, adapter.confidenceScore || 0),
    missingFields: [],
  };

  const missing = new Set([...(gemini.missingFields || []), ...(adapter.missingFields || [])].map((field) => cleanString(field)).filter(Boolean));
  merged.missingFields = [...missing].filter((field) => !fieldHasValue(field, merged));
  return merged;
}

function hasUsableAuctionEvidence(input: {
  extraction: AuctionSiteExtractionPatch;
  imageCount: number;
  documentCount: number;
  supplementText: string;
}) {
  const extraction = input.extraction;
  const hardSignals = [
    extraction.initialBid,
    extraction.appraisalValue,
    extraction.privateAreaM2 || extraction.builtAreaM2 || extraction.landAreaM2,
    extraction.address,
    extraction.city && extraction.state,
  ].filter(Boolean).length;
  const supportSignals = [
    extraction.title && !/just a moment|attention required|access denied/i.test(extraction.title),
    extraction.summary && !/just a moment|attention required|access denied/i.test(extraction.summary),
    input.imageCount,
    input.documentCount,
    cleanString(input.supplementText),
  ].filter(Boolean).length;

  return hardSignals >= 2 || (hardSignals >= 1 && supportSignals >= 2);
}

type LinkAnalysisQualityReview = {
  analysisDepth: LinkAnalysisDepth;
  qualityFlags: string[];
  missingFields: string[];
  cautionNotes: string[];
  confidenceScore: number;
  requiresReview: boolean;
};

type LinkAnalysisQualityGate = {
  passed: boolean;
  issues: string[];
};

type ProcessImportRowResult = {
  ok: boolean;
  opportunityId?: string;
  error?: string;
  blocked?: boolean;
};

function isMarketAnalysisMissingField(field: unknown) {
  const normalized = cleanString(field)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (!normalized) return false;
  return ![
    "auctiondate",
    "data do leilao",
    "address",
    "endereco",
    "neighborhood",
    "bairro",
    "edital",
    "edital/matricula",
    "matricula",
    "documento",
    "documento oficial",
    "certidao",
    "processo",
    "juridico",
    "legalsignal",
    "legal signal",
    "legal",
    "onus",
    "oneriacoes",
    "propter rem",
    "posse",
    "occupancy",
    "ocupacao",
    "paymentcondition",
    "payment condition",
    "condicao de pagamento",
    "forma de pagamento",
    "pagamento",
  ].some((ignored) => normalized.includes(ignored));
}

function marketAnalysisMissingFields(fields: Iterable<unknown>) {
  return Array.from(fields).filter(isMarketAnalysisMissingField).map((field) => cleanString(field));
}

function buildLinkAnalysisQualityReview(input: {
  analysisDepth: LinkAnalysisDepth;
  extraction: AuctionLinkExtraction;
  initialBid: number;
  appraisalValue: number;
  imageCount: number;
  documentCount: number;
  responseOk: boolean;
  geminiError?: string;
  adapterWarnings?: string[];
}) {
  const profile = analysisDepthProfile(input.analysisDepth);
  const flags: string[] = [];
  const missingFields = new Set<string>(marketAnalysisMissingFields(input.extraction.missingFields || []));
  const cautionNotes: string[] = [];
  const areaM2 = firstPositive(input.extraction.privateAreaM2, input.extraction.builtAreaM2, input.extraction.landAreaM2);

  function flag(code: string, missingField: string, note: string) {
    flags.push(code);
    missingFields.add(missingField);
    cautionNotes.push(note);
  }

  if (!input.responseOk) flag("http_nao_confirmado", "captura http", "A pagina nao respondeu com sucesso; revisar captura antes da decisao.");
  if (!input.imageCount) flag("sem_foto_real", "foto real", "Nenhuma foto real foi confirmada para o imovel.");
  if (!input.initialBid) flag("sem_lance", "lance", "Lance inicial/proximo lance nao foi encontrado com seguranca.");
  if (!input.appraisalValue) flag("sem_valor_avaliacao_ou_mercado", "valor de avaliacao/mercado", "Valor de avaliacao ou mercado nao foi confirmado por fonte.");
  if (!areaM2) flag("sem_area", "area", "Area do imovel nao foi confirmada.");
  if (!input.extraction.auctionDate) flag("sem_data_leilao", "data do leilao", "Data do leilao nao foi confirmada.");
  if (!input.extraction.city || !input.extraction.state) flag("sem_cidade_uf", "cidade/uf", "Cidade ou UF nao foram confirmadas.");
  if (!input.extraction.address || input.extraction.address.toLowerCase().includes("nao informado")) {
    flag("sem_endereco", "endereco", "Endereco completo nao foi confirmado.");
  }

  if (input.geminiError) flag("gemini_indisponivel", "leitura ia", `Gemini nao concluiu a leitura: ${input.geminiError}`);
  if (input.adapterWarnings?.length) {
    cautionNotes.push(`Avisos do adaptador: ${input.adapterWarnings.join(" | ")}`);
    if (input.adapterWarnings.some((warning) => warning.toLowerCase().includes("generico"))) flags.push("adaptador_generico");
  }

  let confidenceScore = input.extraction.confidenceScore || 0;
  if (!confidenceScore) confidenceScore = input.initialBid && input.imageCount && areaM2 ? 55 : 35;
  if (input.analysisDepth === "deep") {
    confidenceScore = Math.min(confidenceScore + 8, 92);
    if (!input.imageCount) confidenceScore = Math.min(confidenceScore, 55);
    if (!input.initialBid) confidenceScore = Math.min(confidenceScore, 45);
    if (!input.appraisalValue) confidenceScore = Math.min(confidenceScore, 60);
    if (!areaM2) confidenceScore = Math.min(confidenceScore, 58);
    confidenceScore = Math.max(15, confidenceScore - Math.max(0, flags.length - 2) * 4);
  }

  const criticalFlags = flags.filter((flagCode) =>
    ["sem_foto_real", "sem_lance", "sem_valor_avaliacao_ou_mercado", "sem_area", "sem_cidade_uf"].includes(flagCode)
  );
  const requiresReview = input.analysisDepth === "deep"
    ? criticalFlags.length > 0 || confidenceScore < profile.minimumConfidence
    : confidenceScore < profile.minimumConfidence;

  return {
    analysisDepth: input.analysisDepth,
    qualityFlags: uniqueStrings(flags, 20),
    missingFields: uniqueStrings(Array.from(missingFields), 30),
    cautionNotes: uniqueStrings(cautionNotes, 20),
    confidenceScore: clampMarketScore(confidenceScore),
    requiresReview,
  } satisfies LinkAnalysisQualityReview;
}

function applyDeepMarketResearchToQualityReview(
  review: LinkAnalysisQualityReview,
  marketResearch: DeepMarketResearchResult | null
) {
  if (!marketResearch) return review;

  const profile = analysisDepthProfile(review.analysisDepth);
  const flags = new Set(review.qualityFlags);
  const missingFields = new Set(review.missingFields);
  const cautionNotes = new Set(review.cautionNotes);

  if (marketResearch.marketValueBase > 0) {
    flags.delete("sem_valor_avaliacao_ou_mercado");
    missingFields.delete("valor de avaliacao/mercado");
  }

  if (marketResearch.saleComparables.length < 3) {
    flags.add("comparaveis_insuficientes");
    missingFields.add("minimo de 3 comparaveis de venda");
  }

  if (!marketResearch.rentalComparables.length) {
    flags.add("aluguel_sem_referencia_direta");
    missingFields.add("referencia direta de aluguel");
  }

  marketAnalysisMissingFields(marketResearch.missingFields).forEach((field) => missingFields.add(field));
  marketResearch.cautionNotes.forEach((note) => cautionNotes.add(note));

  const confidenceScore = marketResearch.marketValueBase
    ? clampMarketScore(Math.round((review.confidenceScore + marketResearch.confidenceScore) / 2))
    : Math.min(review.confidenceScore, marketResearch.confidenceScore || review.confidenceScore);
  const requiresReview =
    review.requiresReview ||
    !marketResearch.marketValueBase ||
    marketResearch.saleComparables.length < 3 ||
    confidenceScore < profile.minimumConfidence;

  return {
    ...review,
    qualityFlags: uniqueStrings(Array.from(flags), 24),
    missingFields: uniqueStrings(Array.from(missingFields), 36),
    cautionNotes: uniqueStrings(Array.from(cautionNotes), 30),
    confidenceScore: clampMarketScore(confidenceScore),
    requiresReview,
  } satisfies LinkAnalysisQualityReview;
}

function evaluateLinkAnalysisQualityGate(input: {
  analysisDepth: LinkAnalysisDepth;
  title: string;
  extraction: AuctionLinkExtraction;
  qualityReview: LinkAnalysisQualityReview;
  marketResearch: DeepMarketResearchResult | null;
  initialBid: number;
  marketValueBase: number;
  imageCount: number;
  documentCount: number;
}) {
  const profile = analysisDepthProfile(input.analysisDepth);
  const issues = new Set<string>();
  const areaM2 = firstPositive(input.extraction.privateAreaM2, input.extraction.builtAreaM2, input.extraction.landAreaM2);

  if (!input.title) issues.add("titulo do imovel");
  if (!input.initialBid) issues.add("lance inicial/proximo lance");
  if (!input.marketValueBase) issues.add("valor de mercado calculado");
  if (!areaM2) issues.add("area do imovel");
  if (!input.extraction.city || !input.extraction.state) issues.add("cidade/UF");
  if (!input.imageCount) issues.add("foto real do imovel");
  if (input.analysisDepth === "deep") {
    if (!input.marketResearch || input.marketResearch.status !== "completed") issues.add("pesquisa de mercado completa");
    if ((input.marketResearch?.saleComparables.length || 0) < 3) issues.add("minimo de 3 comparaveis de venda");
    if (!input.marketResearch?.rentalComparables.length) issues.add("referencia direta de aluguel");
  }

  if (input.qualityReview.confidenceScore < profile.minimumConfidence) {
    issues.add(`confianca minima de ${profile.minimumConfidence}%`);
  }

  marketAnalysisMissingFields(input.qualityReview.missingFields).forEach((field) => {
    const clean = cleanString(field);
    if (clean) issues.add(clean);
  });

  return {
    passed: issues.size === 0,
    issues: uniqueStrings(Array.from(issues), 40),
  } satisfies LinkAnalysisQualityGate;
}

function decidePreliminaryMarket(realDiscountPct: number, confidenceScore: number): MarketAnalysisDecision {
  if (confidenceScore < 35) return "review";
  if (realDiscountPct >= 45) return "excellent";
  if (realDiscountPct >= 32) return "good";
  if (realDiscountPct >= 20) return "caution";
  return "review";
}

function marketSourceLinks(input: {
  auctionUrl: string;
  marketResearch: DeepMarketResearchResult | null;
}) {
  const links = [
    { label: "Link leilao", url: input.auctionUrl },
    ...(input.marketResearch?.searchedUrls || []).map((item) => ({ label: `Busca: ${item.label}`, url: item.url })),
    ...(input.marketResearch?.saleComparables || []).map((item) => ({ label: `Comparavel venda: ${item.sourceLabel}`, url: item.sourceUrl })),
    ...(input.marketResearch?.rentalComparables || []).map((item) => ({ label: `Comparavel aluguel: ${item.sourceLabel}`, url: item.sourceUrl })),
  ];
  const seen = new Set<string>();
  return links
    .map((link) => ({ label: cleanString(link.label, "Fonte"), url: cleanString(link.url) }))
    .filter((link) => link.url)
    .filter((link) => {
      if (seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    })
    .slice(0, 30);
}

function estimatedCostTotal(costs: MarketCostItem[]) {
  return costs.reduce((total, item) => total + (Number(item.value) || 0), 0);
}

function buildRentalEstimatePayload(input: {
  marketResearch: DeepMarketResearchResult | null;
  marketValueBase: number;
  initialBid: number;
}) {
  const monthlyRent = input.marketResearch?.rentalMonthlyRent || 0;
  return {
    monthlyRent,
    referenceUrl: input.marketResearch?.rentalReferenceUrl || "",
    referenceFound: Boolean(input.marketResearch?.rentalReferenceUrl),
    valueKnown: Boolean(input.marketResearch?.rentalComparables.length),
    monthlyYieldOnMarketPct: input.marketValueBase && monthlyRent ? Math.round((monthlyRent / input.marketValueBase) * 10000) / 100 : 0,
    annualYieldOnMarketPct: input.marketValueBase && monthlyRent ? Math.round(((monthlyRent * 12) / input.marketValueBase) * 10000) / 100 : 0,
    monthlyYieldOnBidPct: input.initialBid && monthlyRent ? Math.round((monthlyRent / input.initialBid) * 10000) / 100 : 0,
    annualYieldOnBidPct: input.initialBid && monthlyRent ? Math.round(((monthlyRent * 12) / input.initialBid) * 10000) / 100 : 0,
    notes: input.marketResearch?.rentalComparables.length
      ? "Aluguel baseado em referencias encontradas na pesquisa profunda."
      : monthlyRent
        ? "Aluguel estimado por yield conservador; validar com anuncio de locacao."
        : "Aluguel ainda pendente de referencia.",
  };
}

async function replaceDeepMarketComparables(input: {
  analysisId: string;
  opportunityId: string;
  comparables: DeepMarketComparable[];
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !input.analysisId) return;

  await supabase
    .from("property_market_comparables")
    .delete()
    .eq("analysis_id", input.analysisId)
    .eq("raw_payload->>source", "deep_market_research");

  const rows = input.comparables
    .filter((comparable) => comparable.quality !== "discarded")
    .slice(0, 12)
    .map((comparable) => {
      const referenceValue = firstPositive(comparable.askingPrice, comparable.monthlyRent);
      return {
        analysis_id: input.analysisId,
        opportunity_id: input.opportunityId,
        source_label: comparable.sourceLabel,
        source_url: comparable.sourceUrl,
        listing_type: comparable.listingType === "rent" ? "Aluguel" : "Venda",
        property_type: comparable.propertyType,
        address: comparable.address || null,
        neighborhood: comparable.neighborhood || null,
        city: comparable.city || null,
        state: comparable.state || null,
        area_m2: comparable.areaM2,
        asking_price: referenceValue,
        sold_price: 0,
        price_per_m2: comparable.pricePerM2,
        distance_km: 0,
        similarity_score: comparable.similarityScore,
        quality: comparable.quality,
        notes: comparable.notes,
        collected_at: comparable.collectedAt,
        raw_payload: {
          source: "deep_market_research",
          listingType: comparable.listingType,
          askingPrice: comparable.askingPrice,
          monthlyRent: comparable.monthlyRent,
        },
      };
    });

  if (rows.length) await supabase.from("property_market_comparables").insert(rows);
}

async function upsertPreliminaryMarketAnalysis(input: {
  opportunityId: string;
  opportunityCode: string;
  analysisDepth: LinkAnalysisDepth;
  qualityReview: LinkAnalysisQualityReview;
  extraction: AuctionLinkExtraction;
  initialBid: number;
  appraisalValue: number;
  auctionAppraisalValue: number;
  marketResearch: DeepMarketResearchResult | null;
  auctionUrl: string;
  sourceDomain: string;
  imageCount: number;
  documentCount: number;
  geminiError?: string;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const marketValueBase = firstPositive(input.marketResearch?.marketValueBase || 0, input.appraisalValue);
  const marketValueLow = firstPositive(input.marketResearch?.marketValueLow || 0, marketValueBase ? Math.round(marketValueBase * 0.9) : 0);
  const marketValueHigh = firstPositive(input.marketResearch?.marketValueHigh || 0, marketValueBase ? Math.round(marketValueBase * 1.08) : 0);
  const marketValueSource = input.marketResearch?.marketValueBase ? "comparaveis_web" : input.auctionAppraisalValue ? "avaliacao_leilao" : "indisponivel";
  const areaM2 = firstPositive(input.extraction.privateAreaM2, input.extraction.builtAreaM2, input.extraction.landAreaM2);
  const realDiscountPct = calculateMarketDiscount(input.initialBid, marketValueBase);
  const confidenceScore = clampMarketScore(
    input.marketResearch?.confidenceScore ||
      input.qualityReview.confidenceScore ||
      input.extraction.confidenceScore ||
      (marketValueBase && input.initialBid && areaM2 ? 52 : marketValueBase && input.initialBid ? 42 : 25)
  );
  const decision = decidePreliminaryMarket(realDiscountPct, confidenceScore);
  const ceilingTargets = buildCeilingTargets(marketValueBase);
  const estimatedCosts = input.marketResearch?.estimatedCosts || [];
  const rentalEstimate = buildRentalEstimatePayload({
    marketResearch: input.marketResearch,
    marketValueBase,
    initialBid: input.initialBid,
  });
  const missing = new Set(marketAnalysisMissingFields(input.extraction.missingFields || []));
  if (!marketValueBase) missing.add("valor de avaliacao/mercado");
  if (!input.initialBid) missing.add("lance");
  if (!areaM2) missing.add("area");
  marketAnalysisMissingFields(input.qualityReview.missingFields).forEach((field) => missing.add(field));
  const sourceLinks = marketSourceLinks({ auctionUrl: input.auctionUrl, marketResearch: input.marketResearch });

  try {
    const { data: analysisRow } = await supabase.from("property_market_analyses").upsert(
      {
        opportunity_id: input.opportunityId,
        analysis_code: `MKT-${input.opportunityCode}`.slice(0, 64),
        status: marketValueBase ? "human_review" : "insufficient_data",
        analyst_name: input.analysisDepth === "deep" ? "Motor Betel por link profundo" : "Motor Betel por link",
        payment_condition: input.extraction.paymentCondition || "Validar edital",
        subject_property_snapshot: {
          propertyType: input.extraction.propertyType,
          address: input.extraction.address,
          city: input.extraction.city,
          state: input.extraction.state,
          neighborhood: input.extraction.neighborhood,
          landAreaM2: input.extraction.landAreaM2,
          builtAreaM2: input.extraction.builtAreaM2,
          privateAreaM2: input.extraction.privateAreaM2,
          bedrooms: input.extraction.bedrooms,
          parkingSpaces: input.extraction.parkingSpaces,
        },
        market_value_low: marketValueLow,
        market_value_base: marketValueBase,
        market_value_high: marketValueHigh,
        market_price_per_m2: calculatePricePerM2(marketValueBase, areaM2),
        initial_bid_price_per_m2: calculatePricePerM2(input.initialBid, areaM2),
        real_discount_pct: realDiscountPct,
        estimated_costs: estimatedCosts,
        estimated_net_margin: marketValueBase && input.initialBid ? Math.round(marketValueBase - input.initialBid - estimatedCostTotal(estimatedCosts)) : 0,
        suggested_ceiling_bid: ceilingTargets[0]?.value || 0,
        ceiling_targets: ceilingTargets,
        liquidity_score: input.marketResearch?.liquidityScore || 0,
        confidence_score: confidenceScore,
        legal_signal: input.extraction.legalSignal || "Fora do escopo da analise de mercado.",
        decision,
        decision_reason: [
          `${ANALYSIS_DEPTH_LABELS[input.analysisDepth]} gerada automaticamente a partir do link de leilao.`,
          `Fonte do mercado: ${marketValueSource}.`,
          input.marketResearch ? `Comparaveis venda: ${input.marketResearch.saleComparables.length}; aluguel: ${input.marketResearch.rentalComparables.length}.` : "",
          realDiscountPct ? `Desconto preliminar sobre mercado: ${realDiscountPct}%.` : "",
          input.qualityReview.qualityFlags.length ? `Flags de curadoria: ${input.qualityReview.qualityFlags.join(", ")}.` : "",
          missing.size ? `Pendencias: ${Array.from(missing).join(", ")}.` : "",
        ].filter(Boolean).join(" "),
        summary:
          input.extraction.summary ||
          "Captura inicial por link enviada pela equipe. Completar comparaveis de mercado antes de liberar teto de lance.",
        caution_notes: [
          input.extraction.cautionNotes,
          ...input.qualityReview.cautionNotes,
          ...(input.marketResearch?.cautionNotes || []),
          input.geminiError ? `Gemini: ${input.geminiError}` : "",
          input.imageCount ? "" : "Nenhuma imagem util capturada.",
        ].filter(Boolean).join("\n"),
        source_links: sourceLinks,
        raw_payload: {
          source: "link_batch_scraper",
          sourceDomain: input.sourceDomain,
          analysisDepth: input.analysisDepth,
          marketValueSource,
          auctionAppraisalValue: input.auctionAppraisalValue,
          rentalEstimate,
          marketResearch: input.marketResearch,
          qualityReview: input.qualityReview,
          extraction: input.extraction,
          imageCount: input.imageCount,
          documentCount: input.documentCount,
          missingFields: Array.from(missing),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "opportunity_id" }
    ).select("id").single();

    const analysisId = cleanString((analysisRow as DbRow | null)?.id);
    if (analysisId && input.marketResearch) {
      await replaceDeepMarketComparables({
        analysisId,
        opportunityId: input.opportunityId,
        comparables: [...input.marketResearch.saleComparables, ...input.marketResearch.rentalComparables],
      });
    }
  } catch {
    // The analysis migration may not have been applied in every environment yet.
  }
}

async function processImportRow(row: LinkScraperRow, options: { analysisDepth?: LinkAnalysisDepth | string } = {}): Promise<ProcessImportRowResult> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const analysisDepth = normalizeAnalysisDepth(options.analysisDepth || row.analysisDepth);
  const profile = analysisDepthProfile(analysisDepth);
  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await supabase
    .from("auction_scrape_runs")
    .insert({
      import_row_id: row.id,
      source_url: row.auctionUrl,
      source_domain: row.sourceDomain || sourceDomain(row.auctionUrl),
      adapter_key: `link_batch_${analysisDepth}`,
      status: "running",
      started_at: startedAt,
      extracted_payload: {
        analysisDepth,
        profile,
        queuedAt: startedAt,
      },
    })
    .select("id")
    .single();
  if (runError) return { ok: false, error: runError.message };

  const runId = cleanString(run?.id);
  await supabase.from("market_analysis_import_rows").update({ status: "scraping", scrape_run_id: runId }).eq("id", row.id);

  try {
    const response = await fetch(row.auctionUrl, {
      cache: "no-store",
      headers: auctionPageFetchHeaders(),
      signal: AbortSignal.timeout(profile.fetchTimeoutMs),
    });
    const html = await response.text();
    const resolvedSourceUrl = response.url || row.auctionUrl;
    const domain = row.sourceDomain || sourceDomain(resolvedSourceUrl);
    const pageBlocked = looksLikeBotChallenge(html, titleFromHtml(html, domain), resolvedSourceUrl);
    const supplement = await fetchAuctionPageSupplement({
      sourceUrl: row.auctionUrl,
      resolvedSourceUrl,
      domain,
      timeoutMs: profile.fetchTimeoutMs,
    });
    const enrichedHtml = [html, supplement.html].filter(Boolean).join("\n\n");
    const visibleText = cleanString([htmlToText(html), supplement.text].filter(Boolean).join("\n\n"));
    const siteContext = extractAuctionSiteContext({
      sourceUrl: resolvedSourceUrl,
      sourceDomain: domain,
      html: enrichedHtml,
      visibleText,
    });
    await supabase.from("market_analysis_import_rows").update({ status: "scraper_concluido" }).eq("id", row.id);
    const documentLinks = mergeDocumentLinks(
      extractDocumentLinksFromHtml(enrichedHtml, resolvedSourceUrl),
      supplement.documentLinks,
      siteContext.documents
    );
    if (pageBlocked && !hasUsableAuctionEvidence({
      extraction: siteContext.extraction,
      imageCount: siteContext.imageUrls.length + supplement.imageUrls.length,
      documentCount: documentLinks.length,
      supplementText: supplement.text,
    })) {
      throw new Error(
        `Pagina protegida ou desafio anti-bot em ${domain || "fonte"}; a coleta automatica nao recebeu dados suficientes para cadastrar o imovel.`
      );
    }
    const gemini = await extractAuctionLinkWithGemini({
      sourceUrl: row.auctionUrl,
      sourceDomain: domain,
      htmlText: [siteContext.llmContext, visibleText].filter(Boolean).join("\n\n"),
      analysisDepth,
      maxInputChars: profile.llmTextLimit,
      hints: {
        city: row.cityHint,
        state: row.stateHint,
        auctionDate: row.auctionDateHint,
        propertyType: row.propertyTypeHint,
      },
    });
    const extraction = mergeAuctionExtraction(gemini.extraction, siteContext.extraction);
    const title = firstText(extraction.title, titleFromHtml(html, domain));
    const initialBid = firstPositive(
      extraction.initialBid,
      findMoneyAfter(visibleText, ["lance", "valor minimo", "valor do lance", "preco minimo"])
    );
    const appraisalValue = firstPositive(
      extraction.appraisalValue,
      findMoneyAfter(visibleText, ["avaliacao", "valor de avaliacao", "valor avaliado"])
    );
    const genericImageUrls = await collectImageUrlsFromSourceUrl(row.auctionUrl, resolvedSourceUrl);
    const rawImageUrls = uniqueStrings([...siteContext.imageUrls, ...supplement.imageUrls, ...genericImageUrls], 60);
    const opportunityCode = safeBatchCode(row.externalCode || `${domain}-${makeSourceHash(row.auctionUrl)}`, row.rowNumber);
    const images = rawImageUrls.length
      ? await mirrorRemoteImagesToR2({ opportunityCode, imageUrls: rawImageUrls, alt: title, maxImages: profile.maxImages, referer: row.auctionUrl })
      : ([] as StoredImageAsset[]);
    const usableImageCount = images.filter((image) => image.status === "mirrored" || image.status === "external").length;
    let qualityReview = buildLinkAnalysisQualityReview({
      analysisDepth,
      extraction,
      initialBid,
      appraisalValue,
      imageCount: usableImageCount,
      documentCount: documentLinks.length,
      responseOk: response.ok,
      geminiError: gemini.error,
      adapterWarnings: [...siteContext.warnings, ...supplement.warnings],
    });
    const marketResearch = analysisDepth === "deep"
      ? await runDeepMarketResearch({ extraction, title, initialBid })
      : null;
    qualityReview = applyDeepMarketResearchToQualityReview(qualityReview, marketResearch);
    const marketValueBase = firstPositive(marketResearch?.marketValueBase || 0, appraisalValue);
    const marketValueSource = marketResearch?.marketValueBase ? "comparaveis_web" : appraisalValue ? "avaliacao_leilao" : "indisponivel";
    const discount = discountPct(marketValueBase, initialBid);
    const qualityGate = evaluateLinkAnalysisQualityGate({
      analysisDepth,
      title,
      extraction,
      qualityReview,
      marketResearch,
      initialBid,
      marketValueBase,
      imageCount: usableImageCount,
      documentCount: documentLinks.length,
    });
    const qualityGateMessage = qualityGate.passed
      ? ""
      : `Trava de qualidade: analise incompleta. Campos pendentes: ${qualityGate.issues.join(", ")}.`;
    extraction.confidenceScore = qualityReview.confidenceScore;
    extraction.missingFields = qualityReview.missingFields;
    extraction.cautionNotes = uniqueStrings([
      extraction.cautionNotes,
      ...qualityReview.cautionNotes,
    ], 30).join("\n");
    await supabase.from("market_analysis_import_rows").update({ status: "extracao_concluida" }).eq("id", row.id);

    const ingest = await ingestAuctionOpportunityRecord({
      code: opportunityCode,
      title,
      propertyType: firstText(extraction.propertyType, inferPropertyType(`${title} ${visibleText.slice(0, 2000)}`, row.propertyTypeHint)),
      address: firstText(extraction.address, row.cityHint, "Nao informado"),
      city: firstText(extraction.city, row.cityHint, "Nao informado"),
      state: firstText(extraction.state, row.stateHint).toUpperCase(),
      sourceName: domain || "Link de leilao",
      sourceType: "auction_link",
      initialBid,
      appraisalValue: marketValueBase,
      discountPct: discount,
      opportunityScore: Math.max(20, (discount > 0 ? Math.min(95, 45 + discount) : 50) - qualityReview.qualityFlags.length * 3),
      riskScore: !qualityGate.passed || qualityReview.requiresReview ? 65 : 50,
      complianceScore: response.ok && qualityGate.passed && !qualityReview.requiresReview ? 72 : 45,
      aiStatus: analysisDepth === "deep" ? "Analise profunda" : "Fila IA",
      legalStatus: extraction.legalSignal ? "Informado na fonte" : "Nao avaliado nesta fase",
      stage: !qualityGate.passed || qualityReview.requiresReview ? "Revisao humana" : "Entrada",
      nextAction: !qualityGate.passed
        ? `Completar campos obrigatorios antes de aprovar a analise: ${qualityGate.issues.join(", ")}.`
        : qualityReview.requiresReview
        ? "Completar curadoria de mercado: valores, fotos reais, area e comparaveis antes de liberar decisao."
        : "Revisar captura por link e completar analise de mercado.",
      owner: "Upload de Links - Analise de Mercado",
      auctionDate: firstText(extraction.auctionDate, row.auctionDateHint),
      occupancy: firstText(extraction.occupancy, "Nao informado"),
      summary: firstText(
        extraction.summary,
        "Oportunidade criada a partir de link enviado pela equipe. Requer revisao humana antes de uso comercial."
      ),
      sourceUrl: row.auctionUrl,
      externalId: row.auctionUrl,
      collectionMode: "uploaded_auction_link",
      evidenceNotes: `${ANALYSIS_DEPTH_LABELS[analysisDepth]} por link enviado pelo usuario; flags: ${qualityReview.qualityFlags.join(", ") || "sem flags criticas"}.`,
      rawPayload: {
        importRowId: row.id,
        importBatchId: row.batchId,
        analysisDepth,
        analysisProfile: profile,
        marketValueSource,
        auctionAppraisalValue: appraisalValue,
        marketValueBase,
        marketResearch,
        qualityReview,
        qualityGate,
        sourceUrl: row.auctionUrl,
        sourceDomain: domain,
        httpStatus: response.status,
        geminiExtraction: {
          model: gemini.model,
          error: gemini.error || null,
          extraction,
          rawText: gemini.rawText ? gemini.rawText.slice(0, 12000) : "",
        },
        siteAdapter: {
          key: siteContext.adapterKey,
          name: siteContext.adapterName,
          extraction: siteContext.extraction,
          documents: siteContext.documents,
          imageUrls: siteContext.imageUrls,
          warnings: siteContext.warnings,
        },
        pageSupplement: {
          source: supplement.source,
          warnings: supplement.warnings,
          imageCount: supplement.imageUrls.length,
          documentCount: supplement.documentLinks.length,
          textPreview: supplement.text.slice(0, 4000),
        },
        htmlTextPreview: visibleText.slice(0, 8000),
        cleanedHtmlPreview: cleanHtmlForLlm(enrichedHtml),
        media: {
          images,
          documents: documentLinks,
          sourceImageUrls: rawImageUrls,
          mirroredCount: images.filter((image) => image.status === "mirrored").length,
          externalCount: images.filter((image) => image.status === "external").length,
          failedCount: images.filter((image) => image.status === "failed").length,
        },
      },
    });

    if (!ingest.ok || !ingest.data) {
      throw new Error(ingest.error || "Falha ao criar oportunidade.");
    }

    if (images.length) {
      await supabase.from("auction_scrape_assets").insert(
        images.map((image, index) => ({
          scrape_run_id: runId,
          opportunity_id: ingest.data?.opportunityId,
          asset_type: "image",
          source_url: image.sourceUrl,
          storage_path: image.storageKey || image.url,
          sort_order: index + 1,
          raw_payload: image,
        }))
      );
    }

    if (documentLinks.length) {
      await supabase.from("auction_scrape_assets").insert(
        documentLinks.map((document, index) => ({
          scrape_run_id: runId,
          opportunity_id: ingest.data?.opportunityId,
          asset_type: document.kind,
          source_url: document.url,
          storage_path: document.url,
          caption: document.label,
          sort_order: index + 1,
          raw_payload: document,
        }))
      );
    }

    await supabase.from("market_analysis_import_rows").update({ status: "analise_mercado_pendente" }).eq("id", row.id);

    await upsertPreliminaryMarketAnalysis({
      opportunityId: ingest.data.opportunityId,
      opportunityCode,
      analysisDepth,
      qualityReview,
      extraction,
      initialBid,
      appraisalValue: marketValueBase,
      auctionAppraisalValue: appraisalValue,
      marketResearch,
      auctionUrl: row.auctionUrl,
      sourceDomain: domain,
      imageCount: usableImageCount,
      documentCount: documentLinks.length,
      geminiError: gemini.error,
    });

    await supabase.from("auction_scrape_runs").update({
      opportunity_id: ingest.data.opportunityId,
      status: response.ok && qualityGate.passed ? "completed" : "partial",
      completed_at: new Date().toISOString(),
      http_status: response.status,
      error_message: qualityGate.passed ? null : qualityGateMessage,
      raw_snapshot_id: ingest.data.snapshotId,
      extracted_payload: {
        analysisDepth,
        profile,
        title,
        gemini: {
          model: gemini.model,
          error: gemini.error || null,
          confidenceScore: extraction.confidenceScore,
          missingFields: extraction.missingFields,
        },
        deepAnalysis: {
          qualityFlags: qualityReview.qualityFlags,
          missingFields: qualityReview.missingFields,
          cautionNotes: qualityReview.cautionNotes,
          requiresReview: qualityReview.requiresReview,
          minimumConfidence: profile.minimumConfidence,
          qualityGate,
        },
        adapter: {
          key: siteContext.adapterKey,
          name: siteContext.adapterName,
          confidenceScore: siteContext.extraction.confidenceScore,
          warnings: siteContext.warnings,
        },
        pageDiagnostics: {
          blockedByAntiBot: pageBlocked,
          httpStatus: response.status,
          resolvedSourceUrl,
        },
        subject: {
          propertyType: extraction.propertyType,
          address: extraction.address,
          city: extraction.city,
          state: extraction.state,
          neighborhood: extraction.neighborhood,
          landAreaM2: extraction.landAreaM2,
          builtAreaM2: extraction.builtAreaM2,
          privateAreaM2: extraction.privateAreaM2,
          bedrooms: extraction.bedrooms,
          parkingSpaces: extraction.parkingSpaces,
        },
        initialBid,
        appraisalValue: marketValueBase,
        auctionAppraisalValue: appraisalValue,
        marketValueSource,
        marketResearch,
        discountPct: discount,
        imageCount: usableImageCount,
        documentCount: documentLinks.length,
      },
    }).eq("id", runId);

    await supabase.from("market_analysis_import_rows").update({
      status: "pronto_para_revisao",
      opportunity_id: ingest.data.opportunityId,
      error_message: qualityGate.passed ? null : qualityGateMessage,
    }).eq("id", row.id);

    return { ok: true, opportunityId: ingest.data.opportunityId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar link.";
    await supabase.from("auction_scrape_runs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: message,
    }).eq("id", runId);
    await supabase.from("market_analysis_import_rows").update({
      status: "falha",
      error_message: message,
    }).eq("id", row.id);
    return { ok: false, error: message };
  }
}

function buildBatchMessage(batch: LinkScraperBatch, rows: LinkScraperRow[]) {
  const readyRows = rows.filter((row) => row.status === "pronto_para_revisao");
  const success = readyRows.length;
  const failed = rows.filter((row) => row.status === "falha" || row.status === "url_invalida").length;
  const pending = rows.filter((row) => !["pronto_para_revisao", "falha", "url_invalida"].includes(row.status)).length;
  const withRealPhoto = readyRows.filter((row) => (row.imageCount || 0) > 0).length;
  const withoutRealPhoto = Math.max(success - withRealPhoto, 0);
  const withoutMarketValue = readyRows.filter((row) => !(row.appraisalValue || 0)).length;
  const readyWithQualityIssues = readyRows.filter((row) =>
    row.errorMessage.toLowerCase().includes("trava de qualidade") ||
    (row.qualityFlags || []).length > 0
  ).length;
  const readyNeedingReview = readyRows.filter((row) => (row.imageCount || 0) <= 0 || !(row.appraisalValue || 0)).length;
  const needsReview = readyNeedingReview + failed + pending;
  const qualityBlockedRow = rows.find((row) =>
    row.status === "falha" && row.errorMessage.toLowerCase().includes("trava de qualidade")
  );
  const domains = [...new Set(rows.filter((row) => row.status === "falha").map((row) => row.sourceDomain).filter(Boolean))].slice(0, 6);
  return [
    qualityBlockedRow ? "Betel AI - analise pausada por dados incompletos" : "Betel AI - analise de mercado concluida",
    `Arquivo/lote: ${batch.originalFilename || batch.id}`,
    `Modo: ${ANALYSIS_DEPTH_LABELS[batch.analysisDepth || DEFAULT_ANALYSIS_DEPTH]}`,
    `Links: ${rows.length}`,
    `Imoveis analisados: ${success}`,
    `Com foto real: ${withRealPhoto}`,
    withoutRealPhoto ? `Sem foto real: ${withoutRealPhoto}` : "",
    withoutMarketValue ? `Sem valor de mercado: ${withoutMarketValue}` : "",
    readyWithQualityIssues ? `Com pendencias de curadoria: ${readyWithQualityIssues}` : "",
    `Falhas: ${failed}`,
    `Pendentes: ${pending}`,
    `Precisam revisao: ${needsReview}`,
    qualityBlockedRow ? `Processo parado na linha ${qualityBlockedRow.rowNumber}: ${qualityBlockedRow.errorMessage}` : "",
    domains.length ? `Dominios com falha: ${domains.join(", ")}` : "",
    "Acesse Analise de mercado > Imoveis analisados para revisar os resultados.",
  ].filter(Boolean).join("\n");
}

async function sendBatchNotification(batchId: string, batch: LinkScraperBatch, rows: LinkScraperRow[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  const recipient = batch.notificationRecipientId
    ? (await supabase.from("scraper_notification_recipients").select("*").eq("id", batch.notificationRecipientId).maybeSingle()).data as DbRow | null
    : null;
  const normalizedRecipient = recipient ? normalizeRecipient(recipient) : null;
  const messageText = buildBatchMessage(batch, rows);
  const recipientNumber = normalizedRecipient?.whatsappNumber || "";
  const recipientJid = normalizedRecipient?.whatsappJid || "";
  const agentKey = batch.whatsappAgentKey || "multichannel-dispatch";
  const providerInstanceId = await resolveProviderInstanceId(batch.whatsappInstanceId);

  if (!recipientNumber && !recipientJid) {
    await supabase.from("scraper_process_notifications").insert({
      batch_id: batchId,
      whatsapp_agent_key: agentKey,
      whatsapp_instance_id: batch.whatsappInstanceId || null,
      recipient_id: batch.notificationRecipientId || null,
      message_text: messageText,
      status: "skipped",
      error_message: "Destinatario WhatsApp nao configurado.",
    });
    return;
  }

  const trackId = `SCR-BATCH-${batchId}`;
  const delivery = recipientJid
    ? await sendWhatsAppDestinationText({
        agentKey,
        instanceId: providerInstanceId || undefined,
        destinationJid: recipientJid,
        text: messageText,
        trackId,
      })
    : await sendWhatsAppAgentReply({
        agentKey,
        instanceId: providerInstanceId || undefined,
        number: recipientNumber,
        text: messageText,
        trackId,
      });

  await supabase.from("scraper_process_notifications").insert({
    batch_id: batchId,
    whatsapp_agent_key: agentKey,
    whatsapp_instance_id: batch.whatsappInstanceId || null,
    recipient_id: batch.notificationRecipientId || null,
    recipient_number: recipientNumber || null,
    recipient_jid: recipientJid || null,
    message_text: messageText,
    status: delivery.ok ? "sent" : "failed",
    provider: "connectyhub",
    provider_message_id: delivery.externalDeliveryId || null,
    provider_response: delivery,
    error_message: delivery.errorMessage || null,
    sent_at: delivery.ok ? new Date().toISOString() : null,
  });

  await supabase.from("market_analysis_import_batches").update({
    notification_status: delivery.ok ? "sent" : "failed",
  }).eq("id", batchId);
}

export async function startLinkScraperBatch(input: {
  batchId: string;
  whatsappAgentKey?: string;
  whatsappInstanceId?: string;
  notificationRecipientId?: string;
  analysisDepth?: LinkAnalysisDepth | string;
}): Promise<MutationResult<{ processed: number; failed: number; stoppedByQualityGate?: boolean; stopReason?: string }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const { data: batchRow, error: batchError } = await supabase
    .from("market_analysis_import_batches")
    .select("*")
    .eq("id", input.batchId)
    .maybeSingle();
  if (batchError || !batchRow) return { ok: false, error: batchError?.message || "Lote nao encontrado." };
  const batchPayload = asRecord(batchRow.mapping_payload);
  const analysisDepth = normalizeAnalysisDepth(input.analysisDepth || batchPayload.analysisDepth || batchPayload.analysis_depth);

  await supabase.from("market_analysis_import_batches").update({
    status: "processando",
    started_at: new Date().toISOString(),
    whatsapp_agent_key: cleanString(input.whatsappAgentKey) || cleanString(batchRow.whatsapp_agent_key) || null,
    whatsapp_instance_id: cleanString(input.whatsappInstanceId) || cleanString(batchRow.whatsapp_instance_id) || null,
    notification_recipient_id: cleanString(input.notificationRecipientId) || cleanString(batchRow.notification_recipient_id) || null,
    notification_status: "pending",
    mapping_payload: {
      ...batchPayload,
      analysisDepth,
      analysisLabel: ANALYSIS_DEPTH_LABELS[analysisDepth],
      profile: analysisDepthProfile(analysisDepth),
    },
  }).eq("id", input.batchId);

  const { data: rowData, error: rowError } = await supabase
    .from("market_analysis_import_rows")
    .select("*")
    .eq("batch_id", input.batchId)
    .in("status", ["aguardando_inicio", "aguardando_scraper", "falha"])
    .order("row_number", { ascending: true });
  if (rowError) return { ok: false, error: rowError.message };

  await supabase
    .from("market_analysis_import_rows")
    .update({ status: "aguardando_scraper" })
    .eq("batch_id", input.batchId)
    .eq("status", "aguardando_inicio");

  let processed = 0;
  let failed = 0;
  let stoppedByQualityGate = false;
  let stopReason = "";
  for (const row of ((rowData || []) as DbRow[]).map(normalizeRow)) {
    const result = await processImportRow({ ...row, status: "aguardando_scraper", analysisDepth }, { analysisDepth });
    if (result.ok) {
      processed += 1;
      continue;
    }

    failed += 1;
    if (result.blocked) {
      stoppedByQualityGate = true;
      stopReason = result.error || "Analise incompleta.";
      break;
    }
  }

  if (stoppedByQualityGate) {
    await supabase
      .from("market_analysis_import_rows")
      .update({ status: "aguardando_inicio" })
      .eq("batch_id", input.batchId)
      .eq("status", "aguardando_scraper");
  }

  const { data: finalRows } = await supabase
    .from("market_analysis_import_rows")
    .select("*")
    .eq("batch_id", input.batchId)
    .order("row_number", { ascending: true });
  let normalizedRows = ((finalRows || []) as DbRow[]).map(normalizeRow);
  if (normalizedRows.length) {
    const { data: runData } = await supabase
      .from("auction_scrape_runs")
      .select("import_row_id, extracted_payload, created_at")
      .in("import_row_id", normalizedRows.map((row) => row.id))
      .order("created_at", { ascending: false });
    const latestRunByRow = new Map<string, DbRow>();
    ((runData || []) as DbRow[]).forEach((run) => {
      const rowId = cleanString(run.import_row_id);
      if (rowId && !latestRunByRow.has(rowId)) latestRunByRow.set(rowId, run);
    });
    normalizedRows = normalizedRows.map((row) => mergeRowExtraction(row, latestRunByRow.get(row.id)));
  }
  const finalBatch = normalizeBatch({
    ...asRecord(batchRow),
    mapping_payload: {
      ...batchPayload,
      analysisDepth,
      analysisLabel: ANALYSIS_DEPTH_LABELS[analysisDepth],
      profile: analysisDepthProfile(analysisDepth),
    },
    whatsapp_agent_key: cleanString(input.whatsappAgentKey) || cleanString(batchRow.whatsapp_agent_key),
    whatsapp_instance_id: cleanString(input.whatsappInstanceId) || cleanString(batchRow.whatsapp_instance_id),
    notification_recipient_id: cleanString(input.notificationRecipientId) || cleanString(batchRow.notification_recipient_id),
  }, normalizedRows);

  const readyRows = normalizedRows.filter((row) => row.status === "pronto_para_revisao");
  const readyWithRealPhoto = readyRows.filter((row) => (row.imageCount || 0) > 0).length;
  const readyWithoutMarketValue = readyRows.filter((row) => !(row.appraisalValue || 0)).length;

  await supabase.from("market_analysis_import_batches").update({
    status: stoppedByQualityGate || (failed > 0 && processed === 0) ? "falha" : "concluido",
    completed_at: new Date().toISOString(),
    summary_payload: {
      processed,
      failed,
      stoppedByQualityGate,
      stopReason,
      ready: readyRows.length,
      withRealPhoto: readyWithRealPhoto,
      withoutRealPhoto: Math.max(readyRows.length - readyWithRealPhoto, 0),
      withoutMarketValue: readyWithoutMarketValue,
      analysisDepth,
      analysisLabel: ANALYSIS_DEPTH_LABELS[analysisDepth],
      total: normalizedRows.length,
    },
  }).eq("id", input.batchId);

  await sendBatchNotification(input.batchId, finalBatch, normalizedRows);
  return { ok: true, data: { processed, failed, stoppedByQualityGate, stopReason } };
}

export async function queueLinkScraperBatch(input: {
  batchId: string;
  whatsappAgentKey?: string;
  whatsappInstanceId?: string;
  notificationRecipientId?: string;
  analysisDepth?: LinkAnalysisDepth | string;
}): Promise<MutationResult<{ batchId: string; queuedRows: number }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const batchId = cleanString(input.batchId);
  if (!batchId) return { ok: false, error: "Lote nao informado." };

  const { data: batchRow, error: batchError } = await supabase
    .from("market_analysis_import_batches")
    .select("id, status, whatsapp_agent_key, whatsapp_instance_id, notification_recipient_id, mapping_payload")
    .eq("id", batchId)
    .maybeSingle();
  if (batchError || !batchRow) return { ok: false, error: batchError?.message || "Lote nao encontrado." };
  const batchPayload = asRecord(batchRow.mapping_payload);
  const analysisDepth = normalizeAnalysisDepth(input.analysisDepth || batchPayload.analysisDepth || batchPayload.analysis_depth);

  await supabase.from("market_analysis_import_batches").update({
    status: "processando",
    started_at: new Date().toISOString(),
    whatsapp_agent_key: cleanString(input.whatsappAgentKey) || cleanString(batchRow.whatsapp_agent_key) || null,
    whatsapp_instance_id: cleanString(input.whatsappInstanceId) || cleanString(batchRow.whatsapp_instance_id) || null,
    notification_recipient_id: cleanString(input.notificationRecipientId) || cleanString(batchRow.notification_recipient_id) || null,
    notification_status: "queued",
    mapping_payload: {
      ...batchPayload,
      analysisDepth,
      analysisLabel: ANALYSIS_DEPTH_LABELS[analysisDepth],
      profile: analysisDepthProfile(analysisDepth),
    },
  }).eq("id", batchId);

  await supabase
    .from("market_analysis_import_rows")
    .update({ status: "aguardando_scraper" })
    .eq("batch_id", batchId)
    .eq("status", "aguardando_inicio");

  const { count } = await supabase
    .from("market_analysis_import_rows")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .in("status", ["aguardando_scraper", "falha"]);

  return { ok: true, data: { batchId, queuedRows: count || 0 } };
}

export async function retryLinkScraperRow(input: {
  rowId: string;
}): Promise<MutationResult<{ rowId: string }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const { data, error } = await supabase
    .from("market_analysis_import_rows")
    .select("*")
    .eq("id", input.rowId)
    .maybeSingle();

  if (error || !data) return { ok: false, error: error?.message || "Linha nao encontrada." };

  const row = normalizeRow(data as DbRow);
  const result = await processImportRow(row);
  if (!result.ok) return { ok: false, error: result.error || "Falha no retry." };

  return { ok: true, data: { rowId: row.id } };
}

export async function recordLegacyCleanupDryRun(): Promise<MutationResult<ScraperLegacyCleanupPreview>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };
  const preview = await getScraperLegacyCleanupPreview();
  const { error } = await supabase.from("scraper_legacy_cleanup_runs").insert({
    mode: "dry_run",
    status: "completed",
    filter_payload: {
      filters: LEGACY_CLEANUP_FILTERS,
    },
    matched_opportunities_count: preview.matchedOpportunities,
    matched_snapshots_count: 0,
    matched_runs_count: 0,
    archived_opportunities_count: preview.archivedOpportunities,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: preview };
}

async function createCleanupRun(mode: "archive" | "delete") {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { runId: "", error: "Supabase admin nao configurado." };
  const { data, error } = await supabase
    .from("scraper_legacy_cleanup_runs")
    .insert({
      mode,
      status: "running",
      filter_payload: { filters: LEGACY_CLEANUP_FILTERS },
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  return { runId: cleanString(data?.id), error: error?.message || "" };
}

async function finishCleanupRun(input: {
  runId: string;
  status: "completed" | "failed";
  matched: number;
  blocked: number;
  archived?: number;
  deleted?: number;
  errorMessage?: string;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !input.runId) return;
  await supabase.from("scraper_legacy_cleanup_runs").update({
    status: input.status,
    matched_opportunities_count: input.matched,
    archived_opportunities_count: input.archived || 0,
    deleted_opportunities_count: input.deleted || 0,
    error_message: input.errorMessage || null,
    completed_at: new Date().toISOString(),
    filter_payload: {
      filters: LEGACY_CLEANUP_FILTERS,
      blockedOpportunities: input.blocked,
    },
  }).eq("id", input.runId);
}

async function archiveRelatedByTable(opportunityIds: string[]) {
  const entries = await Promise.all(
    LEGACY_ARCHIVE_RELATED_TABLES.map(async (table) => [table, await safeRelatedRows(table, opportunityIds)] as const)
  );
  return Object.fromEntries(entries.map(([table, rows]) => [table, groupRowsByOpportunity(rows)])) as Record<string, Map<string, DbRow[]>>;
}

export async function archiveLegacyScraperOpportunities(input: {
  confirmation: string;
}): Promise<MutationResult<ScraperLegacyCleanupExecutionSummary>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };
  if (cleanString(input.confirmation).toUpperCase() !== "ARQUIVAR LEGADO") {
    return { ok: false, error: "Digite ARQUIVAR LEGADO para confirmar o arquivamento." };
  }

  const { runId, error: runError } = await createCleanupRun("archive");
  if (!runId) return { ok: false, error: runError || "Nao foi possivel criar o run de limpeza." };

  try {
    const candidates = await getLegacyCleanupCandidates();
    const opportunityIds = candidates.map((item) => cleanString(item.row.id)).filter(Boolean);
    const archivedIds = await safeArchivedIds(opportunityIds);
    const eligible = candidates.filter((item) => !item.blocked && !archivedIds.has(cleanString(item.row.id)));
    const relatedByTable = await archiveRelatedByTable(eligible.map((item) => cleanString(item.row.id)).filter(Boolean));

    const archiveRows = eligible.map((item) => {
      const opportunityId = cleanString(item.row.id);
      return {
        cleanup_run_id: runId,
        opportunity_id: opportunityId,
        opportunity_code: cleanString(item.row.code),
        title: cleanString(item.row.title),
        owner_name: cleanString(item.row.owner_name),
        stage: cleanString(item.row.stage),
        reason: item.reason,
        blocked: false,
        archive_status: "archived",
        opportunity_snapshot: item.row,
        source_snapshots: relatedByTable.source_snapshots?.get(opportunityId) || [],
        ai_analysis_runs: relatedByTable.ai_analysis_runs?.get(opportunityId) || [],
        legal_reviews: relatedByTable.legal_reviews?.get(opportunityId) || [],
        dossiers: relatedByTable.dossiers?.get(opportunityId) || [],
        opportunity_matches: relatedByTable.opportunity_matches?.get(opportunityId) || [],
        bid_strategies: relatedByTable.bid_strategies?.get(opportunityId) || [],
        auction_sessions: relatedByTable.auction_sessions?.get(opportunityId) || [],
        post_auction_cases: relatedByTable.post_auction_cases?.get(opportunityId) || [],
        property_market_analyses: relatedByTable.property_market_analyses?.get(opportunityId) || [],
        validation_pipelines: relatedByTable.opportunity_validation_runs?.get(opportunityId) || [],
        validation_steps: relatedByTable.opportunity_validation_steps?.get(opportunityId) || [],
        audit_logs: relatedByTable.audit_logs?.get(opportunityId) || [],
        archived_at: new Date().toISOString(),
      };
    });

    if (archiveRows.length) {
      const { error } = await supabase
        .from("scraper_legacy_archives")
        .upsert(archiveRows, { onConflict: "opportunity_id" });
      if (error) throw new Error(error.message);

      await supabase
        .from("auction_opportunities")
        .update({
          stage: "Legado scraper arquivado",
          next_action: "Registro arquivado para limpeza segura do scraper legado.",
          updated_at: new Date().toISOString(),
        })
        .in("id", archiveRows.map((row) => row.opportunity_id));
    }

    const summary: ScraperLegacyCleanupExecutionSummary = {
      runId,
      matchedOpportunities: candidates.length,
      blockedOpportunities: candidates.filter((item) => item.blocked).length,
      archivedOpportunities: archiveRows.length,
      alreadyArchivedOpportunities: archivedIds.size,
      deletedOpportunities: 0,
      readyToDeleteOpportunities: archiveRows.length + archivedIds.size,
    };
    await finishCleanupRun({
      runId,
      status: "completed",
      matched: summary.matchedOpportunities,
      blocked: summary.blockedOpportunities,
      archived: summary.archivedOpportunities,
    });
    return { ok: true, data: summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao arquivar legado.";
    await finishCleanupRun({ runId, status: "failed", matched: 0, blocked: 0, errorMessage: message });
    return { ok: false, error: message };
  }
}

async function safeDeleteByOpportunity(table: string, opportunityIds: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !opportunityIds.length) return;
  try {
    await supabase.from(table).delete().in("opportunity_id", opportunityIds);
  } catch {}
}

function isMarketAnalysisUploadedOpportunity(row: DbRow) {
  const rawPayload = asRecord(row.raw_payload);
  const ownerName = cleanString(row.owner_name).toLowerCase();

  return (
    ownerName.includes("upload de links") ||
    cleanString(rawPayload.collectionMode) === "uploaded_auction_link" ||
    Boolean(cleanString(rawPayload.importRowId) || cleanString(rawPayload.importBatchId))
  );
}

function normalizeR2StorageKey(value: unknown) {
  const rawValue = cleanString(value).replace(/^\/+/, "");
  if (!rawValue) return "";
  if (rawValue.startsWith("opportunities/")) return rawValue;

  try {
    const pathname = new URL(rawValue).pathname.replace(/^\/+/, "");
    const opportunityIndex = pathname.indexOf("opportunities/");
    return opportunityIndex >= 0 ? pathname.slice(opportunityIndex) : "";
  } catch {
    return "";
  }
}

function extractR2StorageKeyFromAsset(asset: DbRow) {
  const rawPayload = asRecord(asset.raw_payload);
  return firstText(
    normalizeR2StorageKey(rawPayload.storageKey),
    normalizeR2StorageKey(rawPayload.storage_key),
    normalizeR2StorageKey(asset.storage_path),
    normalizeR2StorageKey(rawPayload.url)
  );
}

function isMissingRelationError(error: unknown) {
  const message = error instanceof Error ? error.message : cleanString(error);
  return message.includes("Could not find the table") || message.includes("does not exist") || message.includes("schema cache");
}

export async function resetMarketAnalysisTestData(input: {
  confirmation: string;
}): Promise<MutationResult<MarketAnalysisResetSummary>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };
  const admin = supabase;
  if (cleanString(input.confirmation).toUpperCase() !== "LIMPAR ANALISE") {
    return { ok: false, error: "Digite LIMPAR ANALISE para confirmar a limpeza." };
  }

  const failures: string[] = [];
  const pageSize = 1000;

  async function selectAll(table: string, columns: string) {
    const rows: DbRow[] = [];
    for (let from = 0; from < 10_000; from += pageSize) {
      const { data, error } = await admin
        .from(table)
        .select(columns)
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`${table}: ${error.message}`);
      const page = ((data || []) as unknown as DbRow[]);
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows;
  }

  async function selectByIds(table: string, columns: string, column: string, ids: string[]) {
    const selected: DbRow[] = [];
    const cleanIds = uniqueStrings(ids, 10_000);
    for (let index = 0; index < cleanIds.length; index += 250) {
      const chunk = cleanIds.slice(index, index + 250);
      const { data, error } = await admin.from(table).select(columns).in(column, chunk);
      if (error) throw new Error(`${table}: ${error.message}`);
      selected.push(...(((data || []) as unknown as DbRow[])));
    }
    return selected;
  }

  async function deleteByIds(table: string, column: string, ids: string[]) {
    let deleted = 0;
    const cleanIds = uniqueStrings(ids, 10_000);
    for (let index = 0; index < cleanIds.length; index += 250) {
      const chunk = cleanIds.slice(index, index + 250);
      const { count, error } = await admin.from(table).delete({ count: "exact" }).in(column, chunk);
      if (error) throw new Error(`${table}: ${error.message}`);
      deleted += count || 0;
    }
    return deleted;
  }

  async function optionalDeleteByIds(table: string, column: string, ids: string[]) {
    try {
      return await deleteByIds(table, column, ids);
    } catch (error) {
      if (isMissingRelationError(error)) return 0;
      throw error;
    }
  }

  try {
    const importRows = await selectAll("market_analysis_import_rows", "id,batch_id,opportunity_id,scrape_run_id");
    const importBatches = await selectAll("market_analysis_import_batches", "id");
    const allOpportunities = await selectAll("auction_opportunities", "id,owner_name,raw_payload");
    const uploadedOpportunities = allOpportunities.filter(isMarketAnalysisUploadedOpportunity);

    const rowIds = uniqueStrings(importRows.map((row) => cleanString(row.id)), 10_000);
    const batchIds = uniqueStrings([
      ...importBatches.map((row) => cleanString(row.id)),
      ...importRows.map((row) => cleanString(row.batch_id)),
    ], 10_000);
    const opportunityIds = uniqueStrings([
      ...uploadedOpportunities.map((row) => cleanString(row.id)),
      ...importRows.map((row) => cleanString(row.opportunity_id)),
    ], 10_000);

    const runsByRows = rowIds.length
      ? await selectByIds("auction_scrape_runs", "id,opportunity_id,import_row_id,raw_snapshot_id", "import_row_id", rowIds)
      : [];
    const runsByOpportunities = opportunityIds.length
      ? await selectByIds("auction_scrape_runs", "id,opportunity_id,import_row_id,raw_snapshot_id", "opportunity_id", opportunityIds)
      : [];
    const scrapeRunIds = uniqueStrings([
      ...importRows.map((row) => cleanString(row.scrape_run_id)),
      ...runsByRows.map((row) => cleanString(row.id)),
      ...runsByOpportunities.map((row) => cleanString(row.id)),
    ], 10_000);

    const snapshotsByOpportunities = opportunityIds.length
      ? await selectByIds("source_snapshots", "id,opportunity_id", "opportunity_id", opportunityIds)
      : [];
    const snapshotIds = uniqueStrings([
      ...runsByRows.map((row) => cleanString(row.raw_snapshot_id)),
      ...runsByOpportunities.map((row) => cleanString(row.raw_snapshot_id)),
      ...snapshotsByOpportunities.map((row) => cleanString(row.id)),
    ], 10_000);

    const assetsByRuns = scrapeRunIds.length
      ? await selectByIds("auction_scrape_assets", "id,scrape_run_id,opportunity_id,asset_type,storage_path,raw_payload", "scrape_run_id", scrapeRunIds)
      : [];
    const assetsByOpportunities = opportunityIds.length
      ? await selectByIds("auction_scrape_assets", "id,scrape_run_id,opportunity_id,asset_type,storage_path,raw_payload", "opportunity_id", opportunityIds)
      : [];
    const assetMap = new Map<string, DbRow>();
    [...assetsByRuns, ...assetsByOpportunities].forEach((asset) => {
      const id = cleanString(asset.id);
      if (id) assetMap.set(id, asset);
    });
    const assets = [...assetMap.values()];
    const assetIds = uniqueStrings(assets.map((asset) => cleanString(asset.id)), 10_000);
    const imageAssets = assets.filter((asset) => cleanString(asset.asset_type, "image") === "image");
    const r2StorageKeys = uniqueStrings(imageAssets.map(extractR2StorageKeyFromAsset), 10_000);

    const r2Results = [];
    for (const storageKey of r2StorageKeys) {
      const result = await deletePublicR2Object(storageKey);
      r2Results.push(result);
      if (result.status === "failed" || result.status === "unavailable") {
        failures.push(`${storageKey}: ${result.error || result.status}`);
      }
    }

    const baseSummary: MarketAnalysisResetSummary = {
      batchesFound: batchIds.length,
      rowsFound: rowIds.length,
      opportunitiesFound: opportunityIds.length,
      assetsFound: assets.length,
      r2ObjectsFound: r2StorageKeys.length,
      r2ObjectsDeleted: r2Results.filter((item) => item.status === "deleted").length,
      r2ObjectsFailed: r2Results.filter((item) => item.status === "failed" || item.status === "unavailable").length,
      externalAssetsSkipped: imageAssets.length - r2StorageKeys.length,
      rowsDeleted: 0,
      batchesDeleted: 0,
      notificationsDeleted: 0,
      opportunitiesDeleted: 0,
      assetsDeleted: 0,
      scrapeRunsDeleted: 0,
      sourceSnapshotsDeleted: 0,
      aiAnalysisRunsDeleted: 0,
      marketAnalysesDeleted: 0,
      marketComparablesDeleted: 0,
      relatedRowsDeleted: 0,
      failures,
    };

    if (baseSummary.r2ObjectsFailed > 0) {
      return {
        ok: false,
        data: baseSummary,
        error: "A limpeza foi interrompida porque uma ou mais imagens do R2 nao puderam ser apagadas.",
      };
    }

    let relatedRowsDeleted = 0;
    const marketComparablesDeleted = await optionalDeleteByIds("property_market_comparables", "opportunity_id", opportunityIds);
    const marketAnalysesDeleted = await optionalDeleteByIds("property_market_analyses", "opportunity_id", opportunityIds);
    const validationStepsDeleted = await optionalDeleteByIds("opportunity_validation_steps", "opportunity_id", opportunityIds);
    const validationRunsDeleted = await optionalDeleteByIds("opportunity_validation_runs", "opportunity_id", opportunityIds);
    relatedRowsDeleted += validationStepsDeleted + validationRunsDeleted;

    for (const table of [
      "legal_reviews",
      "dossiers",
      "post_auction_cases",
      "auction_sessions",
      "bid_strategies",
      "opportunity_matches",
      "admin_alerts",
      "communication_outbox",
      "agent_runs",
      "intelligence_reports",
      "advisory_contracts",
      "audit_logs",
      "scraper_legacy_archives",
    ]) {
      relatedRowsDeleted += await optionalDeleteByIds(table, "opportunity_id", opportunityIds);
    }

    const aiAnalysisRunsDeleted = await optionalDeleteByIds("ai_analysis_runs", "opportunity_id", opportunityIds);
    const assetsDeleted = await deleteByIds("auction_scrape_assets", "id", assetIds);
    const scrapeRunsDeleted = await deleteByIds("auction_scrape_runs", "id", scrapeRunIds);
    const sourceSnapshotsDeleted = await deleteByIds("source_snapshots", "id", snapshotIds);
    const notificationsDeleted = await optionalDeleteByIds("scraper_process_notifications", "batch_id", batchIds);
    const rowsDeleted = await deleteByIds("market_analysis_import_rows", "id", rowIds);
    const batchesDeleted = await deleteByIds("market_analysis_import_batches", "id", batchIds);
    const opportunitiesDeleted = await deleteByIds("auction_opportunities", "id", opportunityIds);

    return {
      ok: true,
      data: {
        ...baseSummary,
        rowsDeleted,
        batchesDeleted,
        notificationsDeleted,
        opportunitiesDeleted,
        assetsDeleted,
        scrapeRunsDeleted,
        sourceSnapshotsDeleted,
        aiAnalysisRunsDeleted,
        marketAnalysesDeleted,
        marketComparablesDeleted,
        relatedRowsDeleted,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao limpar analises de mercado.";
    return { ok: false, error: message };
  }
}

export async function deleteArchivedLegacyScraperOpportunities(input: {
  confirmation: string;
}): Promise<MutationResult<ScraperLegacyCleanupExecutionSummary>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };
  if (cleanString(input.confirmation).toUpperCase() !== "DELETAR LEGADO ARQUIVADO") {
    return { ok: false, error: "Digite DELETAR LEGADO ARQUIVADO para confirmar a exclusao." };
  }

  const { runId, error: runError } = await createCleanupRun("delete");
  if (!runId) return { ok: false, error: runError || "Nao foi possivel criar o run de delete." };

  try {
    const candidates = await getLegacyCleanupCandidates();
    const candidateIds = new Set(candidates.filter((item) => !item.blocked).map((item) => cleanString(item.row.id)).filter(Boolean));
    const { data: archiveRows, error } = await supabase
      .from("scraper_legacy_archives")
      .select("id, opportunity_id")
      .eq("archive_status", "archived")
      .eq("blocked", false)
      .limit(5000);
    if (error) throw new Error(error.message);

    const eligibleArchives = ((archiveRows || []) as DbRow[]).filter((row) => candidateIds.has(cleanString(row.opportunity_id)));
    const opportunityIds = eligibleArchives.map((row) => cleanString(row.opportunity_id)).filter(Boolean);

    await safeDeleteByOpportunity("source_snapshots", opportunityIds);
    await safeDeleteByOpportunity("auction_scrape_assets", opportunityIds);
    await safeDeleteByOpportunity("auction_scrape_runs", opportunityIds);

    if (opportunityIds.length) {
      const { error: deleteError } = await supabase.from("auction_opportunities").delete().in("id", opportunityIds);
      if (deleteError) throw new Error(deleteError.message);

      await supabase.from("scraper_legacy_archives").update({
        archive_status: "deleted",
        deleted_at: new Date().toISOString(),
        delete_run_id: runId,
      }).in("opportunity_id", opportunityIds);
    }

    const summary: ScraperLegacyCleanupExecutionSummary = {
      runId,
      matchedOpportunities: candidates.length,
      blockedOpportunities: candidates.filter((item) => item.blocked).length,
      archivedOpportunities: eligibleArchives.length,
      alreadyArchivedOpportunities: eligibleArchives.length,
      deletedOpportunities: opportunityIds.length,
      readyToDeleteOpportunities: Math.max(0, eligibleArchives.length - opportunityIds.length),
    };
    await finishCleanupRun({
      runId,
      status: "completed",
      matched: summary.matchedOpportunities,
      blocked: summary.blockedOpportunities,
      deleted: summary.deletedOpportunities,
    });
    return { ok: true, data: summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao deletar legado arquivado.";
    await finishCleanupRun({ runId, status: "failed", matched: 0, blocked: 0, errorMessage: message });
    return { ok: false, error: message };
  }
}
