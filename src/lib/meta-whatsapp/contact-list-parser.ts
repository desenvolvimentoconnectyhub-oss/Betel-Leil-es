import "server-only";

import { inflateRawSync } from "node:zlib";

export type ParsedMetaWhatsAppContactFile = {
  filename: string;
  sourceType: "csv" | "txt" | "xlsx";
  rows: Array<Record<string, string>>;
};

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9{}]+/g, "");
}

function looksLikeHeader(values: string[]) {
  const keys = values.map(normalizeHeader);
  return keys.some((key) =>
    ["nome", "name", "telefone", "phone", "whatsapp", "celular", "email", "cidade", "city", "tags", "var1", "{{1}}"].includes(key)
  );
}

function rowsToObjects(rows: string[][]) {
  const cleaned = rows
    .map((row) => row.map((cell) => cleanString(cell)))
    .filter((row) => row.some(Boolean));
  if (!cleaned.length) return [];

  const hasHeader = looksLikeHeader(cleaned[0]);
  const headers = hasHeader
    ? cleaned[0].map((header, index) => cleanString(header, `coluna_${index + 1}`))
    : ["telefone", "nome", "email", "cidade", "tags"];
  const values = hasHeader ? cleaned.slice(1) : cleaned;

  return values.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      const key = cleanString(header, `coluna_${index + 1}`);
      record[key] = cleanString(row[index]);
    });
    return record;
  });
}

function detectDelimiter(line: string) {
  if (line.includes(";")) return ";";
  if (line.includes("\t")) return "\t";
  return ",";
}

function parseDelimited(text: string) {
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
  return rowsToObjects(rows);
}

function parseText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const firstLine = trimmed.split(/\r?\n/).find(Boolean) || "";
  if (/[;,\t]/.test(firstLine)) return parseDelimited(trimmed);
  return trimmed
    .split(/\r?\n/)
    .map((line) => cleanString(line))
    .filter(Boolean)
    .map((phone) => ({ telefone: phone }));
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

function parseSharedStrings(entries: Map<string, Buffer>) {
  const xml = entries.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  return xmlBlocks(xml, "si").map((item) => xmlText(item));
}

function parseXlsxSheet(buffer: Buffer) {
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
    rows.push(values);
  }

  return rowsToObjects(rows);
}

export async function parseMetaWhatsAppContactFile(file: File): Promise<ParsedMetaWhatsAppContactFile> {
  const filename = cleanString(file.name, "lista-contatos");
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  if (extension === "xls") {
    throw new Error("Arquivo .xls antigo nao e aceito. Salve a planilha como .xlsx e envie novamente.");
  }
  if (!["csv", "txt", "xlsx"].includes(extension)) {
    throw new Error("Envie uma lista em .csv, .txt ou .xlsx.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (extension === "xlsx") {
    return { filename, sourceType: "xlsx", rows: parseXlsxSheet(buffer) };
  }

  const text = buffer.toString("utf8");
  return {
    filename,
    sourceType: extension as "csv" | "txt",
    rows: extension === "txt" ? parseText(text) : parseDelimited(text),
  };
}
