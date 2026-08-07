import "server-only";

import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import {
  buildCeilingTargets,
  calculateMarketDiscount,
  calculatePricePerM2,
  clampMarketScore,
  type MarketAnalysisDecision,
} from "@/lib/admin/market-analysis";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { ingestAuctionOpportunityRecord } from "@/lib/admin/repository/pipeline";
import { sendWhatsAppAgentReply, sendWhatsAppDestinationText } from "@/lib/communication/connectyhub-client";
import { mirrorRemoteImagesToR2, type StoredImageAsset } from "@/lib/storage/r2";
import { extractAuctionSiteContext, type AuctionSiteDocument, type AuctionSiteExtractionPatch } from "./auction-site-adapters";
import { extractAuctionLinkWithGemini, type AuctionLinkExtraction } from "./auction-link-extractor";
import { cleanHtmlForLlm } from "./scraper-llm";
import { collectImageUrlsFromSourceUrl } from "./scraper-strategies";
import type { DataResult, MutationResult } from "@/lib/admin/repository/shared";

type DbRow = Record<string, unknown>;

type ImportSourceType = "xlsx" | "csv" | "txt" | "manual";

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
  return {
    id: cleanString(row.id),
    batchId: cleanString(row.batch_id),
    rowNumber: asNumber(row.row_number),
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
  const missingFields = Array.isArray(gemini.missingFields)
    ? gemini.missingFields.map((item) => cleanString(item)).filter(Boolean)
    : [];

  return {
    ...row,
    extractionTitle: cleanString(extracted.title, cleanString(subject.address)),
    extractionConfidence: asNumber(gemini.confidenceScore),
    missingFields,
    initialBid: asNumber(extracted.initialBid),
    appraisalValue: asNumber(extracted.appraisalValue),
    imageCount: asNumber(extracted.imageCount),
    documentCount: asNumber(extracted.documentCount),
    adapterKey: cleanString(adapter.key),
    adapterName: cleanString(adapter.name),
  };
}

function normalizeBatch(row: DbRow, rows: LinkScraperRow[] = []): LinkScraperBatch {
  return {
    id: cleanString(row.id),
    originalFilename: cleanString(row.original_filename),
    sourceType: cleanString(row.source_type),
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
}): Promise<MutationResult<{ batchId: string; rowsCreated: number }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const validRows = input.parsed.rows.filter((row) => row.status !== "url_invalida");
  if (!validRows.length) return { ok: false, error: "Nenhum link valido encontrado no arquivo." };

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
    raw_row_payload: { rawValues: row.rawValues },
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
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
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
  const merged: AuctionLinkExtraction = {
    ...gemini,
    title: firstText(gemini.title, adapter.title || ""),
    propertyType: firstText(gemini.propertyType, adapter.propertyType || ""),
    address: firstText(gemini.address, adapter.address || ""),
    city: firstText(gemini.city, adapter.city || ""),
    state: firstText(gemini.state, adapter.state || "").toUpperCase(),
    neighborhood: firstText(gemini.neighborhood, adapter.neighborhood || ""),
    landAreaM2: firstPositive(gemini.landAreaM2, adapter.landAreaM2 || 0),
    builtAreaM2: firstPositive(gemini.builtAreaM2, adapter.builtAreaM2 || 0),
    privateAreaM2: firstPositive(gemini.privateAreaM2, adapter.privateAreaM2 || 0),
    bedrooms: firstPositive(gemini.bedrooms, adapter.bedrooms || 0),
    parkingSpaces: firstPositive(gemini.parkingSpaces, adapter.parkingSpaces || 0),
    initialBid: firstPositive(gemini.initialBid, adapter.initialBid || 0),
    appraisalValue: firstPositive(gemini.appraisalValue, adapter.appraisalValue || 0),
    auctionDate: firstText(gemini.auctionDate, adapter.auctionDate || ""),
    paymentCondition: firstText(gemini.paymentCondition, adapter.paymentCondition || ""),
    occupancy: firstText(gemini.occupancy, adapter.occupancy || ""),
    legalSignal: firstText(gemini.legalSignal, adapter.legalSignal || ""),
    summary: firstText(gemini.summary, adapter.summary || ""),
    cautionNotes: firstText(gemini.cautionNotes, adapter.cautionNotes || ""),
    confidenceScore: Math.max(gemini.confidenceScore || 0, adapter.confidenceScore || 0),
    missingFields: [],
  };

  const missing = new Set([...(gemini.missingFields || []), ...(adapter.missingFields || [])].map((field) => cleanString(field)).filter(Boolean));
  merged.missingFields = [...missing].filter((field) => !fieldHasValue(field, merged));
  return merged;
}

function decidePreliminaryMarket(realDiscountPct: number, confidenceScore: number): MarketAnalysisDecision {
  if (confidenceScore < 35) return "review";
  if (realDiscountPct >= 45) return "excellent";
  if (realDiscountPct >= 32) return "good";
  if (realDiscountPct >= 20) return "caution";
  return "review";
}

async function upsertPreliminaryMarketAnalysis(input: {
  opportunityId: string;
  opportunityCode: string;
  extraction: AuctionLinkExtraction;
  initialBid: number;
  appraisalValue: number;
  auctionUrl: string;
  sourceDomain: string;
  imageCount: number;
  documentCount: number;
  geminiError?: string;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const marketValueBase = input.appraisalValue;
  const marketValueLow = marketValueBase ? Math.round(marketValueBase * 0.9) : 0;
  const marketValueHigh = marketValueBase ? Math.round(marketValueBase * 1.08) : 0;
  const areaM2 = firstPositive(input.extraction.privateAreaM2, input.extraction.builtAreaM2, input.extraction.landAreaM2);
  const realDiscountPct = calculateMarketDiscount(input.initialBid, marketValueBase);
  const confidenceScore = clampMarketScore(
    input.extraction.confidenceScore ||
      (marketValueBase && input.initialBid && areaM2 ? 52 : marketValueBase && input.initialBid ? 42 : 25)
  );
  const decision = decidePreliminaryMarket(realDiscountPct, confidenceScore);
  const ceilingTargets = buildCeilingTargets(marketValueBase);
  const missing = new Set(input.extraction.missingFields || []);
  if (!marketValueBase) missing.add("valor de avaliacao/mercado");
  if (!input.initialBid) missing.add("lance");
  if (!areaM2) missing.add("area");
  if (!input.extraction.legalSignal) missing.add("juridico");

  try {
    await supabase.from("property_market_analyses").upsert(
      {
        opportunity_id: input.opportunityId,
        analysis_code: `MKT-${input.opportunityCode}`.slice(0, 64),
        status: confidenceScore >= 55 ? "human_review" : "insufficient_data",
        analyst_name: "Motor Betel por link",
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
        estimated_costs: [],
        estimated_net_margin: marketValueBase && input.initialBid ? Math.round(marketValueBase - input.initialBid) : 0,
        suggested_ceiling_bid: ceilingTargets[0]?.value || 0,
        ceiling_targets: ceilingTargets,
        liquidity_score: 0,
        confidence_score: confidenceScore,
        legal_signal: input.extraction.legalSignal || "Validar juridico manualmente.",
        decision,
        decision_reason: [
          "Analise preliminar gerada automaticamente a partir do link de leilao.",
          realDiscountPct ? `Desconto preliminar sobre avaliacao/fonte: ${realDiscountPct}%.` : "",
          missing.size ? `Pendencias: ${Array.from(missing).join(", ")}.` : "",
        ].filter(Boolean).join(" "),
        summary:
          input.extraction.summary ||
          "Captura inicial por link enviada pela equipe. Completar comparaveis de mercado antes de liberar teto de lance.",
        caution_notes: [
          input.extraction.cautionNotes,
          input.geminiError ? `Gemini: ${input.geminiError}` : "",
          input.imageCount ? "" : "Nenhuma imagem util capturada.",
        ].filter(Boolean).join("\n"),
        source_links: [{ label: "Link leilao", url: input.auctionUrl }],
        raw_payload: {
          source: "link_batch_scraper",
          sourceDomain: input.sourceDomain,
          extraction: input.extraction,
          imageCount: input.imageCount,
          documentCount: input.documentCount,
          missingFields: Array.from(missing),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "opportunity_id" }
    );
  } catch {
    // The analysis migration may not have been applied in every environment yet.
  }
}

async function processImportRow(row: LinkScraperRow): Promise<{ ok: boolean; opportunityId?: string; error?: string }> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await supabase
    .from("auction_scrape_runs")
    .insert({
      import_row_id: row.id,
      source_url: row.auctionUrl,
      source_domain: row.sourceDomain || sourceDomain(row.auctionUrl),
      status: "running",
      started_at: startedAt,
    })
    .select("id")
    .single();
  if (runError) return { ok: false, error: runError.message };

  const runId = cleanString(run?.id);
  await supabase.from("market_analysis_import_rows").update({ status: "scraping", scrape_run_id: runId }).eq("id", row.id);

  try {
    const response = await fetch(row.auctionUrl, {
      headers: { "User-Agent": "BetelBot/1.0 (+https://betel.com.br)" },
      signal: AbortSignal.timeout(25_000),
    });
    const html = await response.text();
    const visibleText = htmlToText(html);
    const resolvedSourceUrl = response.url || row.auctionUrl;
    const domain = row.sourceDomain || sourceDomain(resolvedSourceUrl);
    const siteContext = extractAuctionSiteContext({
      sourceUrl: resolvedSourceUrl,
      sourceDomain: domain,
      html,
      visibleText,
    });
    const documentLinks = mergeDocumentLinks(
      extractDocumentLinksFromHtml(html, resolvedSourceUrl),
      siteContext.documents
    );
    const gemini = await extractAuctionLinkWithGemini({
      sourceUrl: row.auctionUrl,
      sourceDomain: domain,
      htmlText: [siteContext.llmContext, visibleText].filter(Boolean).join("\n\n"),
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
    const discount = discountPct(appraisalValue, initialBid);
    const genericImageUrls = await collectImageUrlsFromSourceUrl(row.auctionUrl, resolvedSourceUrl);
    const rawImageUrls = uniqueStrings([...siteContext.imageUrls, ...genericImageUrls], 60);
    const opportunityCode = safeBatchCode(row.externalCode || `${domain}-${makeSourceHash(row.auctionUrl)}`, row.rowNumber);
    const images = rawImageUrls.length
      ? await mirrorRemoteImagesToR2({ opportunityCode, imageUrls: rawImageUrls, alt: title, maxImages: 40, referer: row.auctionUrl })
      : ([] as StoredImageAsset[]);

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
      appraisalValue,
      discountPct: discount,
      opportunityScore: discount > 0 ? Math.min(95, 45 + discount) : 50,
      riskScore: 50,
      complianceScore: response.ok ? 65 : 45,
      aiStatus: "Fila IA",
      legalStatus: "Pendente",
      stage: "Entrada",
      nextAction: "Revisar captura por link, extrair edital e completar analise de mercado.",
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
      evidenceNotes: "Captura por link enviado pelo usuario; substitui busca automatica por fontes.",
      rawPayload: {
        importRowId: row.id,
        importBatchId: row.batchId,
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
        htmlTextPreview: visibleText.slice(0, 8000),
        cleanedHtmlPreview: cleanHtmlForLlm(html),
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

    await upsertPreliminaryMarketAnalysis({
      opportunityId: ingest.data.opportunityId,
      opportunityCode,
      extraction,
      initialBid,
      appraisalValue,
      auctionUrl: row.auctionUrl,
      sourceDomain: domain,
      imageCount: images.length,
      documentCount: documentLinks.length,
      geminiError: gemini.error,
    });

    await supabase.from("auction_scrape_runs").update({
      opportunity_id: ingest.data.opportunityId,
      status: response.ok ? "completed" : "partial",
      completed_at: new Date().toISOString(),
      http_status: response.status,
      raw_snapshot_id: ingest.data.snapshotId,
      extracted_payload: {
        title,
        gemini: {
          model: gemini.model,
          error: gemini.error || null,
          confidenceScore: extraction.confidenceScore,
          missingFields: extraction.missingFields,
        },
        adapter: {
          key: siteContext.adapterKey,
          name: siteContext.adapterName,
          confidenceScore: siteContext.extraction.confidenceScore,
          warnings: siteContext.warnings,
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
        appraisalValue,
        discountPct: discount,
        imageCount: images.length,
        documentCount: documentLinks.length,
      },
    }).eq("id", runId);

    await supabase.from("market_analysis_import_rows").update({
      status: "pronto_para_revisao",
      opportunity_id: ingest.data.opportunityId,
      error_message: null,
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
  const withoutMarketValue = readyRows.filter((row) => !(row.initialBid || row.appraisalValue)).length;
  const readyNeedingReview = readyRows.filter((row) => (row.imageCount || 0) <= 0 || !(row.initialBid || row.appraisalValue)).length;
  const needsReview = readyNeedingReview + failed + pending;
  const domains = [...new Set(rows.filter((row) => row.status === "falha").map((row) => row.sourceDomain).filter(Boolean))].slice(0, 6);
  return [
    "Betel AI - analise de mercado concluida",
    `Arquivo/lote: ${batch.originalFilename || batch.id}`,
    `Links: ${rows.length}`,
    `Imoveis analisados: ${success}`,
    `Com foto real: ${withRealPhoto}`,
    withoutRealPhoto ? `Sem foto real: ${withoutRealPhoto}` : "",
    withoutMarketValue ? `Sem lance/avaliacao: ${withoutMarketValue}` : "",
    `Falhas: ${failed}`,
    `Pendentes: ${pending}`,
    `Precisam revisao: ${needsReview}`,
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
}): Promise<MutationResult<{ processed: number; failed: number }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const { data: batchRow, error: batchError } = await supabase
    .from("market_analysis_import_batches")
    .select("*")
    .eq("id", input.batchId)
    .maybeSingle();
  if (batchError || !batchRow) return { ok: false, error: batchError?.message || "Lote nao encontrado." };

  await supabase.from("market_analysis_import_batches").update({
    status: "processando",
    started_at: new Date().toISOString(),
    whatsapp_agent_key: cleanString(input.whatsappAgentKey) || cleanString(batchRow.whatsapp_agent_key) || null,
    whatsapp_instance_id: cleanString(input.whatsappInstanceId) || cleanString(batchRow.whatsapp_instance_id) || null,
    notification_recipient_id: cleanString(input.notificationRecipientId) || cleanString(batchRow.notification_recipient_id) || null,
    notification_status: "pending",
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
  for (const row of ((rowData || []) as DbRow[]).map(normalizeRow)) {
    const result = await processImportRow({ ...row, status: "aguardando_scraper" });
    if (result.ok) processed += 1;
    else failed += 1;
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
    whatsapp_agent_key: cleanString(input.whatsappAgentKey) || cleanString(batchRow.whatsapp_agent_key),
    whatsapp_instance_id: cleanString(input.whatsappInstanceId) || cleanString(batchRow.whatsapp_instance_id),
    notification_recipient_id: cleanString(input.notificationRecipientId) || cleanString(batchRow.notification_recipient_id),
  }, normalizedRows);

  const readyRows = normalizedRows.filter((row) => row.status === "pronto_para_revisao");
  const readyWithRealPhoto = readyRows.filter((row) => (row.imageCount || 0) > 0).length;
  const readyWithoutMarketValue = readyRows.filter((row) => !(row.initialBid || row.appraisalValue)).length;

  await supabase.from("market_analysis_import_batches").update({
    status: failed > 0 && processed === 0 ? "falha" : "concluido",
    completed_at: new Date().toISOString(),
    summary_payload: {
      processed,
      failed,
      ready: readyRows.length,
      withRealPhoto: readyWithRealPhoto,
      withoutRealPhoto: Math.max(readyRows.length - readyWithRealPhoto, 0),
      withoutMarketValue: readyWithoutMarketValue,
      total: normalizedRows.length,
    },
  }).eq("id", input.batchId);

  await sendBatchNotification(input.batchId, finalBatch, normalizedRows);
  return { ok: true, data: { processed, failed } };
}

export async function queueLinkScraperBatch(input: {
  batchId: string;
  whatsappAgentKey?: string;
  whatsappInstanceId?: string;
  notificationRecipientId?: string;
}): Promise<MutationResult<{ batchId: string; queuedRows: number }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const batchId = cleanString(input.batchId);
  if (!batchId) return { ok: false, error: "Lote nao informado." };

  const { data: batchRow, error: batchError } = await supabase
    .from("market_analysis_import_batches")
    .select("id, status, whatsapp_agent_key, whatsapp_instance_id, notification_recipient_id")
    .eq("id", batchId)
    .maybeSingle();
  if (batchError || !batchRow) return { ok: false, error: batchError?.message || "Lote nao encontrado." };

  await supabase.from("market_analysis_import_batches").update({
    status: "processando",
    started_at: new Date().toISOString(),
    whatsapp_agent_key: cleanString(input.whatsappAgentKey) || cleanString(batchRow.whatsapp_agent_key) || null,
    whatsapp_instance_id: cleanString(input.whatsappInstanceId) || cleanString(batchRow.whatsapp_instance_id) || null,
    notification_recipient_id: cleanString(input.notificationRecipientId) || cleanString(batchRow.notification_recipient_id) || null,
    notification_status: "queued",
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
