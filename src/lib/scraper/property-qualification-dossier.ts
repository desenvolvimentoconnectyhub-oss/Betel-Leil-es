import "server-only";

import {
  calculateMarketDiscount,
  calculatePricePerM2,
  clampMarketScore,
  type MarketComparableQuality,
} from "@/lib/admin/market-analysis";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { StoredImageAsset } from "@/lib/storage/r2";
import type { AuctionLinkExtraction } from "./auction-link-extractor";
import type { AuctionSiteDocument } from "./auction-site-adapters";
import type { DeepMarketComparable, DeepMarketResearchResult } from "./deep-market-research";

type QualificationMode = "off" | "shadow" | "active";
type QualificationStatus = "shadow" | "auto_candidate" | "human_review" | "blocked";
type EvidenceStatus = "passed" | "warning" | "blocked" | "info";
type EvidenceCategory = "identity" | "image" | "market" | "document" | "compliance" | "risk" | "source";

type QualityReviewSnapshot = {
  qualityFlags: string[];
  missingFields: string[];
  cautionNotes: string[];
  confidenceScore: number;
  requiresReview: boolean;
};

type QualityGateSnapshot = {
  passed: boolean;
  issues: string[];
};

type EvidenceItem = {
  category: EvidenceCategory;
  label: string;
  status: EvidenceStatus;
  score: number;
  sourceUrl?: string;
  details: string;
  rawPayload?: Record<string, unknown>;
};

type ResearchAuditStep = {
  stepKey: string;
  label: string;
  status: EvidenceStatus;
  summary: string;
  sourceUrl?: string;
  details?: Record<string, unknown>;
};

type ResearchAuditSource = {
  category: string;
  label: string;
  url: string;
  status: EvidenceStatus;
  detail: string;
};

type PlaybookRule = {
  key: string;
  label: string;
  status: EvidenceStatus;
  score: number;
  weight: number;
  detail: string;
};

type DossierBuildResult = {
  mode: Exclude<QualificationMode, "off">;
  version: string;
  status: QualificationStatus;
  readinessStatus: Exclude<QualificationStatus, "shadow">;
  propertyType: string;
  scores: {
    identity: number;
    market: number;
    image: number;
    documentation: number;
    compliance: number;
    risk: number;
    overall: number;
  };
  blockers: string[];
  recommendations: string[];
  playbook: {
    type: string;
    label: string;
    rules: PlaybookRule[];
  };
  evidence: EvidenceItem[];
  audit: {
    processSteps: ResearchAuditStep[];
    sourceInventory: ResearchAuditSource[];
    conclusionBasis: Record<string, unknown>;
  };
  sections: {
    identity: Record<string, unknown>;
    market: Record<string, unknown>;
    images: Record<string, unknown>;
    documents: Record<string, unknown>;
    compliance: Record<string, unknown>;
    source: Record<string, unknown>;
  };
};

export type PersistPropertyQualificationDossierInput = {
  opportunityId: string;
  opportunityCode: string;
  scrapeRunId: string;
  sourceUrl: string;
  sourceDomain: string;
  analysisDepth: string;
  title: string;
  initialBid: number;
  auctionAppraisalValue: number;
  marketValueBase: number;
  extraction: AuctionLinkExtraction;
  qualityReview: QualityReviewSnapshot;
  qualityGate: QualityGateSnapshot;
  marketResearch: DeepMarketResearchResult | null;
  images: StoredImageAsset[];
  documents: Array<AuctionSiteDocument | { label: string; url: string; kind: string }>;
  rawImageUrls: string[];
  adapter: {
    key: string;
    name: string;
    warnings: string[];
    confidenceScore: number;
  };
  pageDiagnostics: {
    httpStatus: number;
    resolvedSourceUrl: string;
    blockedByAntiBot: boolean;
  };
};

const QUALIFICATION_VERSION = "qualification-v2-shadow-1";

function cleanString(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function normalizeText(value: unknown) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: Array<string | undefined>, limit = 40) {
  const seen = new Set<string>();
  return values
    .map((value) => cleanString(value))
    .filter(Boolean)
    .filter((value) => {
      const key = normalizeText(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function qualificationMode(): QualificationMode {
  const raw = normalizeText(process.env.BETEL_QUALIFICATION_V2_MODE || "shadow");
  if (raw === "off" || raw === "disabled" || raw === "desligado") return "off";
  if (raw === "active" || raw === "ativo") return "active";
  return "shadow";
}

function safeDossierCode(value: string) {
  return cleanString(value, "OPP")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, 52) || "OPP";
}

function firstPositive(...values: number[]) {
  return values.find((value) => Number.isFinite(value) && value > 0) || 0;
}

function classifyPropertyType(input: PersistPropertyQualificationDossierInput) {
  const text = normalizeText(`${input.extraction.propertyType} ${input.title} ${input.extraction.summary}`);
  if (text.includes("apartamento") || text.includes("apto")) return "apartamento";
  if (text.includes("terreno") || text.includes("lote") || text.includes("gleba")) return "terreno";
  if (text.includes("rural") || text.includes("fazenda") || text.includes("sitio") || text.includes("chacara")) return "rural";
  if (text.includes("galpao") || text.includes("sala") || text.includes("loja") || text.includes("comercial") || text.includes("industrial")) {
    return "comercial";
  }
  if (text.includes("casa") || text.includes("sobrado")) return "casa";
  return "imovel";
}

function evidenceStatus(score: number, critical = false): EvidenceStatus {
  if (score >= 80) return "passed";
  if (score >= 50) return "warning";
  return critical ? "blocked" : "warning";
}

function rule(input: {
  key: string;
  label: string;
  ok: boolean;
  partial?: boolean;
  weight: number;
  detailOk: string;
  detailMissing: string;
}) {
  const score = input.ok ? 100 : input.partial ? 55 : 0;
  return {
    key: input.key,
    label: input.label,
    status: input.ok ? "passed" : input.partial ? "warning" : "blocked",
    score,
    weight: input.weight,
    detail: input.ok ? input.detailOk : input.detailMissing,
  } satisfies PlaybookRule;
}

function weightedScore(rules: PlaybookRule[]) {
  const weight = rules.reduce((total, item) => total + item.weight, 0);
  if (!weight) return 0;
  return clampMarketScore(Math.round(rules.reduce((total, item) => total + item.score * item.weight, 0) / weight));
}

function subjectArea(input: PersistPropertyQualificationDossierInput) {
  return firstPositive(input.extraction.privateAreaM2, input.extraction.builtAreaM2, input.extraction.landAreaM2);
}

function buildPlaybook(input: PersistPropertyQualificationDossierInput, propertyType: string) {
  const extraction = input.extraction;
  const areaM2 = subjectArea(input);
  const hasLocation = Boolean(extraction.city && extraction.state);
  const hasAddress = Boolean(extraction.address && !normalizeText(extraction.address).includes("nao informado"));
  const hasMarket = Boolean(input.marketResearch?.marketValueBase || input.marketValueBase);
  const saleComparables = input.marketResearch?.saleComparables || [];
  const strongSaleComparables = saleComparables.filter((item) => item.quality === "strong").length;
  const realImages = input.images.filter((image) => image.status === "mirrored" || image.status === "external").length;
  const text = normalizeText(`${extraction.summary} ${extraction.legalSignal} ${extraction.cautionNotes}`);

  const rules: PlaybookRule[] = [
    rule({
      key: "tipo_confirmado",
      label: "Tipo confirmado",
      ok: Boolean(extraction.propertyType),
      weight: 8,
      detailOk: `Tipo identificado como ${extraction.propertyType}.`,
      detailMissing: "Tipo do imovel ainda nao foi confirmado por fonte.",
    }),
    rule({
      key: "localizacao_confirmada",
      label: "Localizacao confirmada",
      ok: hasLocation && hasAddress,
      partial: hasLocation,
      weight: 14,
      detailOk: "Endereco e cidade/UF estao presentes.",
      detailMissing: "Localizacao precisa de endereco, bairro ou cidade/UF mais confiavel.",
    }),
    rule({
      key: "area_base",
      label: "Area base",
      ok: areaM2 > 0,
      weight: 12,
      detailOk: `Area base encontrada: ${areaM2} m2.`,
      detailMissing: "Area base nao foi confirmada.",
    }),
    rule({
      key: "lance_e_mercado",
      label: "Lance e mercado",
      ok: input.initialBid > 0 && hasMarket,
      partial: input.initialBid > 0 || hasMarket,
      weight: 14,
      detailOk: "Lance e valor de mercado estao presentes.",
      detailMissing: "Faltam lance, valor de mercado por comparaveis ou avaliacao confiavel.",
    }),
    rule({
      key: "comparaveis_fortes",
      label: "Comparaveis fortes",
      ok: saleComparables.length >= 5 || strongSaleComparables >= 3,
      partial: saleComparables.length >= 3,
      weight: 18,
      detailOk: `Base com ${saleComparables.length} comparavel(is), ${strongSaleComparables} forte(s).`,
      detailMissing: `Base atual tem ${saleComparables.length} comparavel(is); precisa ampliar a pesquisa.`,
    }),
    rule({
      key: "fotos_reais",
      label: "Fotos reais",
      ok: realImages >= 3,
      partial: realImages > 0,
      weight: 10,
      detailOk: `${realImages} foto(s) util(is) confirmada(s).`,
      detailMissing: "Galeria ainda nao tem fotos reais suficientes.",
    }),
  ];

  if (propertyType === "apartamento") {
    rules.push(
      rule({
        key: "condominio_ou_bairro",
        label: "Condominio ou bairro",
        ok: saleComparables.some((item) => normalizeText(item.notes).includes("condominio") || normalizeText(item.title).includes(normalizeText(extraction.neighborhood))),
        partial: Boolean(extraction.neighborhood),
        weight: 12,
        detailOk: "Comparaveis priorizam condominio ou bairro aderente.",
        detailMissing: "Precisa buscar comparaveis no mesmo condominio, rua ou bairro.",
      }),
      rule({
        key: "quartos_vagas",
        label: "Dormitorios e vagas",
        ok: extraction.bedrooms > 0 || extraction.parkingSpaces > 0,
        weight: 6,
        detailOk: "Dormitorios ou vagas foram identificados.",
        detailMissing: "Dormitorios e vagas ainda nao foram confirmados.",
      })
    );
  }

  if (propertyType === "casa") {
    rules.push(
      rule({
        key: "area_construida_terreno",
        label: "Terreno e construcao",
        ok: extraction.builtAreaM2 > 0 && extraction.landAreaM2 > 0,
        partial: extraction.builtAreaM2 > 0 || extraction.landAreaM2 > 0,
        weight: 14,
        detailOk: "Area construida e terreno estao separados.",
        detailMissing: "Casa/sobrado precisa separar area construida e area de terreno.",
      }),
      rule({
        key: "ocupacao",
        label: "Ocupacao",
        ok: Boolean(extraction.occupancy && !normalizeText(extraction.occupancy).includes("nao informado")),
        partial: text.includes("ocup"),
        weight: 8,
        detailOk: `Ocupacao informada: ${extraction.occupancy}.`,
        detailMissing: "Ocupacao precisa ser confirmada para casa/sobrado.",
      })
    );
  }

  if (propertyType === "terreno") {
    rules.push(
      rule({
        key: "area_terreno",
        label: "Area do terreno",
        ok: extraction.landAreaM2 > 0 || areaM2 > 0,
        weight: 16,
        detailOk: "Area do terreno encontrada.",
        detailMissing: "Terreno precisa de area total para preco por m2.",
      }),
      rule({
        key: "zoneamento",
        label: "Zoneamento",
        ok: text.includes("zoneamento") || text.includes("uso do solo"),
        partial: input.documents.some((document) => normalizeText(`${document.label} ${document.kind}`).includes("edital")),
        weight: 10,
        detailOk: "Sinal de zoneamento/uso do solo identificado.",
        detailMissing: "Zoneamento ou restricao urbanistica ainda nao foi verificado.",
      })
    );
  }

  if (propertyType === "comercial") {
    rules.push(
      rule({
        key: "liquidez_locacao",
        label: "Liquidez e locacao",
        ok: Boolean(input.marketResearch?.rentalComparables.length),
        partial: Boolean(input.marketResearch?.rentalMonthlyRent),
        weight: 12,
        detailOk: "Referencia de aluguel comercial encontrada.",
        detailMissing: "Imovel comercial precisa de base de locacao ou yield validado.",
      }),
      rule({
        key: "vocacao_comercial",
        label: "Vocacao comercial",
        ok: text.includes("comercial") || text.includes("galpao") || text.includes("loja") || text.includes("sala"),
        weight: 8,
        detailOk: "Vocacao comercial aparece na fonte.",
        detailMissing: "Vocacao comercial precisa ser confirmada.",
      })
    );
  }

  if (propertyType === "rural") {
    rules.push(
      rule({
        key: "area_rural",
        label: "Area rural",
        ok: extraction.landAreaM2 >= 10_000 || normalizeText(`${extraction.summary} ${input.title}`).includes("hectare"),
        partial: extraction.landAreaM2 > 0,
        weight: 16,
        detailOk: "Area rural identificada.",
        detailMissing: "Rural precisa de area em hectares ou m2 bem definida.",
      }),
      rule({
        key: "ambiental_acesso",
        label: "Ambiental e acesso",
        ok: text.includes("car") || text.includes("ambiental") || text.includes("acesso"),
        weight: 10,
        detailOk: "Ha sinal de verificacao ambiental, CAR ou acesso.",
        detailMissing: "Rural precisa levantar CAR, acesso e restricoes ambientais.",
      })
    );
  }

  return {
    type: propertyType,
    label: playbookLabel(propertyType),
    rules,
  };
}

function playbookLabel(type: string) {
  const labels: Record<string, string> = {
    apartamento: "Playbook de apartamento",
    casa: "Playbook de casa/sobrado",
    terreno: "Playbook de terreno/lote",
    comercial: "Playbook comercial/industrial",
    rural: "Playbook rural",
    imovel: "Playbook imobiliario generico",
  };
  return labels[type] || labels.imovel;
}

function comparableQualityCounts(comparables: DeepMarketComparable[]) {
  return comparables.reduce<Record<MarketComparableQuality, number>>(
    (counts, item) => {
      counts[item.quality] += 1;
      return counts;
    },
    { strong: 0, medium: 0, weak: 0, discarded: 0 }
  );
}

function sourceDiversity(comparables: DeepMarketComparable[]) {
  const hosts = new Set<string>();
  comparables.forEach((item) => {
    try {
      hosts.add(new URL(item.sourceUrl).hostname.replace(/^www\./, ""));
    } catch {
      if (item.sourceLabel) hosts.add(item.sourceLabel);
    }
  });
  return hosts.size;
}

function buildMarketScore(input: PersistPropertyQualificationDossierInput) {
  const market = input.marketResearch;
  const sales = market?.saleComparables || [];
  const rentals = market?.rentalComparables || [];
  const counts = comparableQualityCounts(sales);
  const diversity = sourceDiversity(sales);
  const marketValueBase = firstPositive(market?.marketValueBase || 0, input.marketValueBase);
  const areaM2 = subjectArea(input);
  let score = 0;

  if (marketValueBase) score += 25;
  score += Math.min(25, sales.length * 4);
  score += Math.min(18, counts.strong * 6 + counts.medium * 3);
  score += Math.min(12, diversity * 3);
  if (rentals.length) score += 8;
  if (areaM2 && calculatePricePerM2(marketValueBase, areaM2)) score += 7;
  if (market?.confidenceScore) score = Math.round((score + market.confidenceScore) / 2);

  return {
    score: clampMarketScore(score),
    counts,
    diversity,
    marketValueBase,
    marketPricePerM2: calculatePricePerM2(marketValueBase, areaM2),
    realDiscountPct: calculateMarketDiscount(input.initialBid, marketValueBase),
  };
}

function documentKindCounts(documents: PersistPropertyQualificationDossierInput["documents"]) {
  const counts: Record<string, number> = {};
  documents.forEach((document) => {
    const kind = normalizeText(document.kind || document.label || "documento") || "documento";
    counts[kind] = (counts[kind] || 0) + 1;
  });
  return counts;
}

function imageKind(image: StoredImageAsset) {
  const text = normalizeText(`${image.url} ${image.sourceUrl} ${image.alt}`);
  if (text.includes("mapa") || text.includes("maps") || text.includes("satellite")) return "mapa";
  if (text.includes("fachada") || text.includes("frente")) return "fachada";
  if (text.includes("intern") || text.includes("sala") || text.includes("quarto") || text.includes("cozinha")) return "interior";
  if (text.includes("aerea") || text.includes("drone")) return "aerea";
  if (text.includes("documento") || text.includes("edital") || text.includes("matricula")) return "documento";
  return "foto";
}

function buildImageSection(images: StoredImageAsset[], rawImageUrls: string[]) {
  const usable = images.filter((image) => image.status === "mirrored" || image.status === "external");
  const mirrored = images.filter((image) => image.status === "mirrored");
  const failed = images.filter((image) => image.status === "failed");
  const kinds = usable.reduce<Record<string, number>>((counts, image) => {
    const kind = imageKind(image);
    counts[kind] = (counts[kind] || 0) + 1;
    return counts;
  }, {});
  const variety = Object.keys(kinds).length;
  const score = clampMarketScore(
    (usable.length ? 35 : 0) +
      Math.min(30, usable.length * 6) +
      Math.min(15, mirrored.length * 3) +
      Math.min(10, variety * 4) -
      Math.min(20, failed.length * 4)
  );

  return {
    score,
    usableCount: usable.length,
    mirroredCount: mirrored.length,
    externalCount: usable.length - mirrored.length,
    failedCount: failed.length,
    rawCandidateCount: rawImageUrls.length,
    kinds,
  };
}

function uniqueAuditSources(sources: ResearchAuditSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (!source.url) return false;
    const key = normalizeText(source.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildResearchAudit(input: PersistPropertyQualificationDossierInput, context: {
  propertyType: string;
  identityScore: number;
  market: ReturnType<typeof buildMarketScore>;
  images: ReturnType<typeof buildImageSection>;
  documentationScore: number;
  complianceScore: number;
  complianceFlags: string[];
  blockers: string[];
  recommendations: string[];
  readinessStatus: Exclude<QualificationStatus, "shadow">;
}) {
  const documents = input.documents.slice(0, 12).map((document) => ({
    category: "documento",
    label: document.label || document.kind || "Documento capturado",
    url: document.url,
    status: "info" as EvidenceStatus,
    detail: document.kind || "Documento localizado na fonte.",
  }));
  const searchedUrls = (input.marketResearch?.searchedUrls || []).slice(0, 16).map((source) => ({
    category: source.kind === "rent" ? "aluguel" : "comparavel",
    label: source.label || (source.kind === "rent" ? "Busca de aluguel" : "Busca de venda"),
    url: source.url,
    status: "info" as EvidenceStatus,
    detail: source.kind === "rent" ? "Fonte usada para referencia de aluguel." : "Fonte usada para comparaveis de venda.",
  }));
  const comparableUrls = [
    ...(input.marketResearch?.saleComparables || []),
    ...(input.marketResearch?.rentalComparables || []),
  ].slice(0, 18).map((comparable) => ({
    category: comparable.listingType === "rent" ? "aluguel" : "comparavel",
    label: comparable.sourceLabel || comparable.title || "Comparavel",
    url: comparable.sourceUrl,
    status: comparable.quality === "strong" ? "passed" as EvidenceStatus : comparable.quality === "weak" ? "warning" as EvidenceStatus : "info" as EvidenceStatus,
    detail: `${comparable.city}/${comparable.state}; similaridade ${comparable.similarityScore}/100.`,
  }));
  const imageSources = input.images.slice(0, 12).map((image) => ({
    category: "imagem",
    label: image.alt || "Imagem do imovel",
    url: image.sourceUrl || image.url,
    status: image.status === "failed" ? "warning" as EvidenceStatus : "passed" as EvidenceStatus,
    detail: image.status === "mirrored" ? "Imagem aceita e espelhada no R2." : `Status da imagem: ${image.status}.`,
  }));

  const sourceInventory = uniqueAuditSources([
    {
      category: "leilao",
      label: input.sourceDomain || "Fonte original",
      url: input.sourceUrl,
      status: input.pageDiagnostics.httpStatus >= 200 && input.pageDiagnostics.httpStatus < 400 ? "passed" : "warning",
      detail: `Link original processado com HTTP ${input.pageDiagnostics.httpStatus || "nao informado"}.`,
    },
    {
      category: "pagina",
      label: "URL resolvida",
      url: input.pageDiagnostics.resolvedSourceUrl,
      status: input.pageDiagnostics.blockedByAntiBot ? "warning" : "passed",
      detail: input.pageDiagnostics.blockedByAntiBot ? "Pagina apresentou desafio ou bloqueio durante a coleta." : "Pagina aberta para coleta automatizada.",
    },
    ...documents,
    ...searchedUrls,
    ...comparableUrls,
    ...imageSources,
  ]);

  const processSteps: ResearchAuditStep[] = [
    {
      stepKey: "fonte_original",
      label: "Captura da fonte original",
      status: input.pageDiagnostics.httpStatus >= 200 && input.pageDiagnostics.httpStatus < 400 ? "passed" : "warning",
      summary: `${input.sourceDomain || "Fonte"} processada com adaptador ${input.adapter.name || input.adapter.key}.`,
      sourceUrl: input.sourceUrl,
      details: {
        httpStatus: input.pageDiagnostics.httpStatus,
        resolvedSourceUrl: input.pageDiagnostics.resolvedSourceUrl,
        adapter: input.adapter,
      },
    },
    {
      stepKey: "extracao",
      label: "Extracao e normalizacao",
      status: context.identityScore >= 75 ? "passed" : context.identityScore >= 50 ? "warning" : "blocked",
      summary: `${context.propertyType}; identidade ${context.identityScore}/100.`,
      details: {
        missingFields: input.qualityReview.missingFields,
        qualityFlags: input.qualityReview.qualityFlags,
        confidenceScore: input.qualityReview.confidenceScore,
      },
    },
    {
      stepKey: "imagens",
      label: "Curadoria de imagens",
      status: evidenceStatus(context.images.score, true),
      summary: `${context.images.usableCount} imagem(ns) util(is), ${context.images.mirroredCount} espelhada(s) no R2, ${context.images.failedCount} falha(s).`,
      details: {
        rawCandidateCount: context.images.rawCandidateCount,
        imageKinds: context.images.kinds,
      },
    },
    {
      stepKey: "mercado",
      label: "Pesquisa de mercado",
      status: evidenceStatus(context.market.score, true),
      summary: `${input.marketResearch?.saleComparables.length || 0} comparavel(is) de venda, ${input.marketResearch?.rentalComparables.length || 0} de aluguel, ${context.market.diversity} fonte(s).`,
      details: {
        status: input.marketResearch?.status || "skipped",
        searchedUrls: input.marketResearch?.searchedUrls || [],
        searchQueries: input.marketResearch?.searchQueries || [],
        marketValueBase: context.market.marketValueBase,
        marketPricePerM2: context.market.marketPricePerM2,
      },
    },
    {
      stepKey: "documentos_compliance",
      label: "Documentos e compliance",
      status: evidenceStatus(context.complianceScore),
      summary: `${input.documents.length} documento(s); ${context.complianceFlags.length ? context.complianceFlags.length : "nenhum"} alerta(s) preliminar(es).`,
      details: {
        documents: input.documents,
        complianceFlags: context.complianceFlags,
        cautionNotes: input.qualityReview.cautionNotes,
      },
    },
    {
      stepKey: "conclusao",
      label: "Criterios de conclusao",
      status: context.readinessStatus === "auto_candidate" ? "passed" : context.readinessStatus === "blocked" ? "blocked" : "warning",
      summary: `Status ${context.readinessStatus}; ${context.blockers.length} bloqueio(s), ${context.recommendations.length} recomendacao(oes).`,
      details: {
        blockers: context.blockers,
        recommendations: context.recommendations,
        qualityGate: input.qualityGate,
      },
    },
  ];

  return {
    processSteps,
    sourceInventory,
    conclusionBasis: {
      market: context.market,
      images: context.images,
      documentationScore: context.documentationScore,
      complianceScore: context.complianceScore,
      complianceFlags: context.complianceFlags,
      qualityGate: input.qualityGate,
      qualityReview: input.qualityReview,
      readinessStatus: context.readinessStatus,
      blockers: context.blockers,
      recommendations: context.recommendations,
    },
  };
}

function hasRiskText(input: PersistPropertyQualificationDossierInput, tokens: string[]) {
  const text = normalizeText([
    input.extraction.occupancy,
    input.extraction.legalSignal,
    input.extraction.cautionNotes,
    input.extraction.summary,
    input.qualityReview.cautionNotes.join(" "),
    input.qualityReview.missingFields.join(" "),
  ].join(" "));
  return tokens.some((token) => text.includes(token));
}

function buildDossier(input: PersistPropertyQualificationDossierInput, mode: Exclude<QualificationMode, "off">): DossierBuildResult {
  const propertyType = classifyPropertyType(input);
  const playbook = buildPlaybook(input, propertyType);
  const identityScore = weightedScore(playbook.rules.filter((item) =>
    ["tipo_confirmado", "localizacao_confirmada", "area_base", "condominio_ou_bairro", "quartos_vagas", "area_construida_terreno", "area_terreno", "area_rural"].includes(item.key)
  ));
  const market = buildMarketScore(input);
  const images = buildImageSection(input.images, input.rawImageUrls);
  const documentCounts = documentKindCounts(input.documents);
  const hasOfficialDocument = input.documents.some((document) => /edital|matricula|laudo|processo|certidao/i.test(`${document.kind} ${document.label}`));
  const documentationScore = clampMarketScore((input.documents.length ? 35 : 0) + (hasOfficialDocument ? 35 : 0) + Math.min(30, input.documents.length * 5));
  const complianceFlags = uniqueStrings([
    hasRiskText(input, ["ocupad", "posse", "desocup"]) ? "ocupacao_precisa_validacao" : "",
    hasRiskText(input, ["debito", "condominio", "iptu", "propter"]) ? "debitos_ou_propter_rem" : "",
    hasRiskText(input, ["penhora", "onus", "alienacao", "fiduciaria", "processo"]) ? "risco_documental_juridico" : "",
    input.documents.length ? "" : "sem_documentos_oficiais_capturados",
    input.adapter.warnings.length ? "adaptador_com_ressalvas" : "",
    input.pageDiagnostics.blockedByAntiBot ? "pagina_com_desafio_antibot" : "",
  ], 20);
  const complianceScore = clampMarketScore(
    82 -
      Math.min(35, complianceFlags.length * 9) +
      (hasOfficialDocument ? 8 : 0) +
      (input.extraction.occupancy && !normalizeText(input.extraction.occupancy).includes("nao informado") ? 4 : 0)
  );
  const riskScore = clampMarketScore(100 - complianceScore + Math.min(25, input.qualityReview.qualityFlags.length * 4));
  const overall = clampMarketScore(Math.round(
    identityScore * 0.22 +
      market.score * 0.34 +
      images.score * 0.14 +
      documentationScore * 0.1 +
      complianceScore * 0.14 +
      input.qualityReview.confidenceScore * 0.06
  ));
  const blockers = uniqueStrings([
    ...input.qualityGate.issues.map((issue) => `Trava atual: ${issue}`),
    input.qualityReview.requiresReview ? "Revisao atual ainda exige humano" : "",
    market.score < 70 ? "Pesquisa de mercado ainda nao esta profunda o suficiente" : "",
    images.usableCount < 1 ? "Sem foto real confirmada" : "",
    input.extraction.city && input.extraction.state ? "" : "Cidade/UF nao confirmadas",
    subjectArea(input) ? "" : "Area base nao confirmada",
  ], 30);
  const recommendations = uniqueStrings([
    market.counts.strong < 3 ? "Ampliar busca de comparaveis fortes antes de liberar sem humano." : "",
    input.marketResearch?.rentalComparables.length ? "" : "Buscar referencia direta de aluguel ou justificar yield por tipo de imovel.",
    documentationScore < 70 ? "Capturar edital, matricula, laudo ou documento oficial quando a fonte disponibilizar." : "",
    complianceFlags.length ? `Validar sinais de compliance: ${complianceFlags.join(", ")}.` : "",
    propertyType === "terreno" ? "Adicionar verificacao de zoneamento e preco por m2 de lote equivalente." : "",
    propertyType === "rural" ? "Adicionar verificacao de CAR, acesso e restricoes ambientais." : "",
    propertyType === "comercial" ? "Adicionar base de locacao e liquidez comercial local." : "",
  ], 20);
  const readinessStatus: Exclude<QualificationStatus, "shadow"> = blockers.length
    ? overall < 55 ? "blocked" : "human_review"
    : overall >= 88 && market.score >= 85 && images.score >= 75 && complianceScore >= 75
      ? "auto_candidate"
      : "human_review";

  const evidence: EvidenceItem[] = [
    {
      category: "identity",
      label: "Identidade do imovel",
      status: evidenceStatus(identityScore, true),
      score: identityScore,
      sourceUrl: input.sourceUrl,
      details: `${playbook.label}: ${identityScore}/100.`,
      rawPayload: { propertyType, rules: playbook.rules },
    },
    {
      category: "market",
      label: "Base de comparaveis",
      status: evidenceStatus(market.score, true),
      score: market.score,
      details: `${input.marketResearch?.saleComparables.length || 0} venda, ${input.marketResearch?.rentalComparables.length || 0} aluguel, ${market.diversity} fonte(s).`,
      rawPayload: market,
    },
    {
      category: "image",
      label: "Galeria real",
      status: evidenceStatus(images.score, true),
      score: images.score,
      details: `${images.usableCount} foto(s) util(is), ${images.mirroredCount} espelhada(s) no R2.`,
      rawPayload: images,
    },
    {
      category: "document",
      label: "Documentos oficiais",
      status: evidenceStatus(documentationScore),
      score: documentationScore,
      details: `${input.documents.length} documento(s) capturado(s).`,
      rawPayload: { counts: documentCounts, hasOfficialDocument },
    },
    {
      category: "compliance",
      label: "Compliance preliminar",
      status: evidenceStatus(complianceScore),
      score: complianceScore,
      details: complianceFlags.length ? complianceFlags.join(", ") : "Sem alerta preliminar forte nesta camada.",
      rawPayload: { flags: complianceFlags },
    },
    {
      category: "source",
      label: "Fonte e adaptador",
      status: input.adapter.key.includes("generic") ? "warning" : "passed",
      score: input.adapter.confidenceScore,
      sourceUrl: input.sourceUrl,
      details: `${input.adapter.name || input.adapter.key}; HTTP ${input.pageDiagnostics.httpStatus}.`,
      rawPayload: { adapter: input.adapter, pageDiagnostics: input.pageDiagnostics },
    },
  ];
  const audit = buildResearchAudit(input, {
    propertyType,
    identityScore,
    market,
    images,
    documentationScore,
    complianceScore,
    complianceFlags,
    blockers,
    recommendations,
    readinessStatus,
  });

  return {
    mode,
    version: QUALIFICATION_VERSION,
    status: mode === "shadow" ? "shadow" : readinessStatus,
    readinessStatus,
    propertyType,
    scores: {
      identity: identityScore,
      market: market.score,
      image: images.score,
      documentation: documentationScore,
      compliance: complianceScore,
      risk: riskScore,
      overall,
    },
    blockers,
    recommendations,
    playbook,
    evidence,
    audit,
    sections: {
      identity: {
        title: input.title,
        propertyType,
        address: input.extraction.address,
        city: input.extraction.city,
        state: input.extraction.state,
        neighborhood: input.extraction.neighborhood,
        privateAreaM2: input.extraction.privateAreaM2,
        builtAreaM2: input.extraction.builtAreaM2,
        landAreaM2: input.extraction.landAreaM2,
        bedrooms: input.extraction.bedrooms,
        parkingSpaces: input.extraction.parkingSpaces,
      },
      market: {
        marketValueBase: market.marketValueBase,
        marketPricePerM2: market.marketPricePerM2,
        realDiscountPct: market.realDiscountPct,
        saleComparables: input.marketResearch?.saleComparables.length || 0,
        rentalComparables: input.marketResearch?.rentalComparables.length || 0,
        qualityCounts: market.counts,
        sourceDiversity: market.diversity,
        liquidityScore: input.marketResearch?.liquidityScore || 0,
      },
      images,
      documents: {
        count: input.documents.length,
        counts: documentCounts,
        hasOfficialDocument,
        links: input.documents.slice(0, 20),
      },
      compliance: {
        flags: complianceFlags,
        occupancy: input.extraction.occupancy,
        legalSignal: input.extraction.legalSignal,
        cautionNotes: uniqueStrings([
          input.extraction.cautionNotes,
          ...input.qualityReview.cautionNotes,
          ...(input.marketResearch?.cautionNotes || []),
        ], 30),
      },
      source: {
        sourceUrl: input.sourceUrl,
        sourceDomain: input.sourceDomain,
        analysisDepth: input.analysisDepth,
        adapter: input.adapter,
        pageDiagnostics: input.pageDiagnostics,
      },
    },
  };
}

export async function persistPropertyQualificationDossier(input: PersistPropertyQualificationDossierInput) {
  const mode = qualificationMode();
  if (mode === "off") return { ok: true, skipped: true, mode };

  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, skipped: true, mode, error: "Supabase admin nao configurado." };

  const dossier = buildDossier(input, mode);
  const now = new Date().toISOString();
  const dossierCode = `DQ-${safeDossierCode(input.opportunityCode)}`;

  try {
    const { data, error } = await supabase.from("property_qualification_dossiers").upsert(
      {
        opportunity_id: input.opportunityId,
        scrape_run_id: input.scrapeRunId || null,
        dossier_code: dossierCode,
        mode: dossier.mode,
        version: dossier.version,
        status: dossier.status,
        readiness_status: dossier.readinessStatus,
        property_type: dossier.propertyType,
        identity_score: dossier.scores.identity,
        market_score: dossier.scores.market,
        image_score: dossier.scores.image,
        documentation_score: dossier.scores.documentation,
        compliance_score: dossier.scores.compliance,
        risk_score: dossier.scores.risk,
        confidence_score: input.qualityReview.confidenceScore,
        overall_score: dossier.scores.overall,
        blockers: dossier.blockers,
        recommendations: dossier.recommendations,
        property_playbook: dossier.playbook,
        identity_evidence: dossier.sections.identity,
        market_evidence: dossier.sections.market,
        image_evidence: dossier.sections.images,
        document_evidence: dossier.sections.documents,
        compliance_evidence: dossier.sections.compliance,
        source_snapshot: dossier.sections.source,
        raw_payload: {
          qualityGate: input.qualityGate,
          qualityReview: input.qualityReview,
          marketResearchStatus: input.marketResearch?.status || "skipped",
          readinessStatus: dossier.readinessStatus,
          evidenceCount: dossier.evidence.length,
          auditTrail: dossier.audit.processSteps,
          sourceInventory: dossier.audit.sourceInventory,
          conclusionBasis: dossier.audit.conclusionBasis,
        },
        updated_at: now,
      },
      { onConflict: "opportunity_id,version" }
    ).select("id").single();

    if (error) return { ok: false, skipped: false, mode, error: error.message };

    const dossierId = cleanString((data as { id?: unknown } | null)?.id);
    if (dossierId) {
      await supabase.from("property_qualification_evidence").delete().eq("dossier_id", dossierId);
      const evidenceRows = dossier.evidence.map((item, index) => ({
        dossier_id: dossierId,
        opportunity_id: input.opportunityId,
        category: item.category,
        label: item.label,
        status: item.status,
        score: item.score,
        source_url: item.sourceUrl || null,
        details: item.details,
        sort_order: index + 1,
        raw_payload: item.rawPayload || {},
      }));
      if (evidenceRows.length) {
        await supabase.from("property_qualification_evidence").insert(evidenceRows);
      }
    }

    return {
      ok: true,
      skipped: false,
      mode,
      data: {
        dossierId,
        dossierCode,
        status: dossier.status,
        readinessStatus: dossier.readinessStatus,
        overallScore: dossier.scores.overall,
        blockers: dossier.blockers,
      },
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      mode,
      error: error instanceof Error ? error.message : "Falha ao salvar dossie de qualificacao.",
    };
  }
}
