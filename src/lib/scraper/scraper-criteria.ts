import "server-only";

import type { ScraperCandidate } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const BETEL_TIME_ZONE = "America/Sao_Paulo";
const DEFAULT_AUCTION_WINDOW_DAYS = 15;

const PORTUGUESE_MONTHS: Record<string, number> = {
  janeiro: 1,
  jan: 1,
  fevereiro: 2,
  fev: 2,
  marco: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  maio: 5,
  mai: 5,
  junho: 6,
  jun: 6,
  julho: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  setembro: 9,
  set: 9,
  outubro: 10,
  out: 10,
  novembro: 11,
  nov: 11,
  dezembro: 12,
  dez: 12,
};

export type ScraperCriteriaSkipReason =
  | "missing_auction_date"
  | "invalid_auction_date"
  | "past_auction_date"
  | "outside_auction_window"
  | "non_real_estate_asset";

export type ScraperCriteriaSkippedCandidate = {
  candidate: ScraperCandidate;
  reason: ScraperCriteriaSkipReason;
  detail: string;
};

export type AuctionWindow = {
  todayIso: string;
  endIso: string;
  windowDays: number;
  today: Date;
  end: Date;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function toSaoPauloDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BETEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function configuredWindowDays() {
  const configured = Number(process.env.BETEL_SCRAPER_AUCTION_WINDOW_DAYS);
  if (Number.isFinite(configured) && configured > 0) return Math.round(configured);
  return DEFAULT_AUCTION_WINDOW_DAYS;
}

export function getAuctionWindow(referenceDate = new Date(), windowDays = configuredWindowDays()): AuctionWindow {
  const today = toSaoPauloDay(referenceDate);
  const end = new Date(today.getTime() + windowDays * DAY_MS);

  return {
    today,
    end,
    windowDays,
    todayIso: toIsoDate(today),
    endIso: toIsoDate(end),
  };
}

function dateFromParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  return date;
}

function inferYearlessDate(day: number, month: number, window: AuctionWindow) {
  const referenceYear = window.today.getUTCFullYear();
  const currentYearDate = dateFromParts(referenceYear, month, day);
  if (currentYearDate && currentYearDate >= window.today) return currentYearDate;

  return dateFromParts(referenceYear + 1, month, day);
}

export function parseAuctionDate(value: string, window = getAuctionWindow()) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const serial = Number(raw.replace(",", "."));
  if (Number.isFinite(serial) && serial >= 30_000 && serial <= 60_000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * DAY_MS);
  }

  const normalized = normalizeText(raw);
  const iso = normalized.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return dateFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dateWithYear = normalized.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (dateWithYear) {
    const year = Number(dateWithYear[3].length === 2 ? `20${dateWithYear[3]}` : dateWithYear[3]);
    return dateFromParts(year, Number(dateWithYear[2]), Number(dateWithYear[1]));
  }

  const dateWithoutYear = normalized.match(/\b(\d{1,2})[-/.](\d{1,2})\b/);
  if (dateWithoutYear) return inferYearlessDate(Number(dateWithoutYear[1]), Number(dateWithoutYear[2]), window);

  const monthName = normalized.match(/\b(\d{1,2})\s*(?:de\s*)?([a-z]+)\s*(?:de\s*)?(\d{2,4})?\b/);
  if (monthName) {
    const month = PORTUGUESE_MONTHS[monthName[2]];
    if (!month) return null;
    const yearText = monthName[3];
    if (!yearText) return inferYearlessDate(Number(monthName[1]), month, window);
    const year = Number(yearText.length === 2 ? `20${yearText}` : yearText);
    return dateFromParts(year, month, Number(monthName[1]));
  }

  return null;
}

function daysBetween(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function isLikelyNonRealEstateAsset(candidate: ScraperCandidate) {
  const text = normalizeText(
    [
      candidate.title,
      candidate.propertyType,
      candidate.address,
      candidate.sourceUrl,
      JSON.stringify(candidate.rawData || {}),
    ].join(" ")
  );

  const realEstateSignals = [
    "imovel",
    "imoveis",
    "apartamento",
    "apto",
    "casa",
    "terreno",
    "lote",
    "sala",
    "loja",
    "galpao",
    "predio",
    "comercial",
    "industrial",
    "rural",
    "fazenda",
    "sitio",
    "area",
    "barracao",
    "sobrado",
  ];

  if (realEstateSignals.some((signal) => text.includes(signal))) return false;

  const nonRealEstateSignals = [
    "veiculo",
    "automovel",
    "carro",
    "moto",
    "caminhao",
    "onibus",
    "trator",
    "maquina",
    "equipamento",
    "sucata",
    "joia",
    "embarcacao",
    "barco",
    "aeronave",
    "gado",
  ];

  return nonRealEstateSignals.some((signal) => text.includes(signal));
}

export function screenScraperCandidatesByWillianPattern(
  candidates: ScraperCandidate[],
  window = getAuctionWindow()
) {
  const accepted: ScraperCandidate[] = [];
  const skipped: ScraperCriteriaSkippedCandidate[] = [];

  for (const candidate of candidates) {
    if (isLikelyNonRealEstateAsset(candidate)) {
      skipped.push({
        candidate,
        reason: "non_real_estate_asset",
        detail: "O item parece ser veiculo, maquina ou outro bem que nao e imovel.",
      });
      continue;
    }

    if (!candidate.auctionDate) {
      skipped.push({
        candidate,
        reason: "missing_auction_date",
        detail: "A data do leilao nao foi encontrada na pagina.",
      });
      continue;
    }

    const auctionDate = parseAuctionDate(candidate.auctionDate, window);
    if (!auctionDate) {
      skipped.push({
        candidate,
        reason: "invalid_auction_date",
        detail: `Data de leilao nao interpretavel: ${candidate.auctionDate}`,
      });
      continue;
    }

    const daysUntilAuction = daysBetween(window.today, auctionDate);
    if (daysUntilAuction < 0) {
      skipped.push({
        candidate,
        reason: "past_auction_date",
        detail: `Leilao ja passou em ${toIsoDate(auctionDate)}.`,
      });
      continue;
    }

    if (daysUntilAuction > window.windowDays) {
      skipped.push({
        candidate,
        reason: "outside_auction_window",
        detail: `Leilao em ${toIsoDate(auctionDate)}, fora da janela ${window.todayIso} a ${window.endIso}.`,
      });
      continue;
    }

    accepted.push({
      ...candidate,
      auctionDate: toIsoDate(auctionDate),
    });
  }

  return {
    accepted,
    skipped,
    window,
  };
}
