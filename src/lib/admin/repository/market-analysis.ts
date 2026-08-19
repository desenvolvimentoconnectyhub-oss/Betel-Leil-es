import "server-only";

import {
  asArray,
  asNumber,
  asRecord,
  asString,
  getOpportunityById,
  getSupabaseAdminClient,
  normalizeOpportunity,
  type AuctionOpportunity,
  type DataResult,
  type OpportunityDbRow,
} from "./shared";
import {
  buildCeilingTargets,
  calculateMarketDiscount,
  calculatePricePerM2,
  clampMarketScore,
  decisionLabel,
  type MarketAnalysisDecision,
  type MarketAnalysisStatus,
  type MarketComparableQuality,
  type MarketCostItem,
  type MarketPaymentSimulation,
  type MarketRentalEstimate,
  type PropertyMarketAnalysis,
  type PropertyMarketComparable,
  type PropertyMarketSubject,
} from "@/lib/admin/market-analysis";
import {
  buildOpportunityEvaluation,
  marketDecisionFromRecommendation,
} from "@/lib/domain/opportunity-evaluation";
import { normalizeLocationName, normalizeStateUf } from "@/lib/scraper/location-normalization";

export type SavePropertyMarketComparableInput = {
  sourceLabel: string;
  sourceUrl: string;
  listingType: string;
  propertyType: string;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  areaM2: number;
  askingPrice: number;
  soldPrice: number;
  distanceKm: number;
  similarityScore: number;
  quality: MarketComparableQuality;
  notes: string;
};

export type SavePropertyMarketAnalysisInput = {
  opportunityCode: string;
  status: MarketAnalysisStatus;
  analystName: string;
  paymentCondition: string;
  paymentSimulation: MarketPaymentSimulation;
  landAreaM2: number;
  builtAreaM2: number;
  privateAreaM2: number;
  bedrooms: number;
  parkingSpaces: number;
  marketValueLow: number;
  marketValueBase: number;
  marketValueHigh: number;
  rentalEstimate: Omit<
    MarketRentalEstimate,
    "monthlyYieldOnMarketPct" | "annualYieldOnMarketPct" | "monthlyYieldOnBidPct" | "annualYieldOnBidPct"
  >;
  estimatedCosts: MarketCostItem[];
  liquidityScore: number;
  confidenceScore: number;
  legalSignal: string;
  decision: MarketAnalysisDecision;
  decisionReason: string;
  summary: string;
  cautionNotes: string;
  auctionUrl: string;
  referenceUrl: string;
  comparable?: SavePropertyMarketComparableInput;
};

function makeMarketAnalysisCode(opportunityCode: string) {
  const seed = opportunityCode
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12)
    .toUpperCase();

  return `MKT-${seed || Date.now().toString(36).toUpperCase()}`;
}

function numberFromRecord(record: Record<string, unknown>, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = asNumber(record[key], Number.NaN);
    if (Number.isFinite(value) && value > 0) return value;
  }

  return fallback;
}

function stringFromRecord(record: Record<string, unknown>, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }

  return fallback;
}

function firstUrl(...values: unknown[]) {
  for (const value of values) {
    const text = asString(value);
    if (/^https?:\/\//i.test(text)) return text;
  }

  return "";
}

function parseLocalizedNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = asString(value).replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!text) return fallback;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : /^-?\d{1,3}(?:\.\d{3})+$/.test(text)
      ? text.replace(/\./g, "")
      : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDecision(value: string, fallback: MarketAnalysisDecision): MarketAnalysisDecision {
  const normalized = value.toLowerCase();
  if (["excellent", "good", "caution", "review", "reject"].includes(normalized)) {
    return normalized as MarketAnalysisDecision;
  }

  if (normalized.includes("excelente")) return "excellent";
  if (normalized.includes("boa")) return "good";
  if (normalized.includes("caut")) return "caution";
  if (normalized.includes("descart") || normalized.includes("reprov")) return "reject";
  if (normalized.includes("revis")) return "review";
  return fallback;
}

function normalizeStatus(value: string, fallback: MarketAnalysisStatus): MarketAnalysisStatus {
  const normalized = value.toLowerCase();
  if (
    [
      "pending",
      "in_analysis",
      "human_review",
      "approved",
      "approved_with_notes",
      "rejected",
      "insufficient_data",
    ].includes(normalized)
  ) {
    return normalized as MarketAnalysisStatus;
  }

  return fallback;
}

function normalizeQuality(value: string): MarketComparableQuality {
  const normalized = value.toLowerCase();
  if (["strong", "medium", "weak", "discarded"].includes(normalized)) {
    return normalized as MarketComparableQuality;
  }

  if (normalized.includes("fort")) return "strong";
  if (normalized.includes("descart")) return "discarded";
  if (normalized.includes("frac")) return "weak";
  return "medium";
}

function normalizeSimilarityScore(value: unknown, fallback = 50) {
  const score = asNumber(value, fallback);
  if (!Number.isFinite(score)) return fallback;
  if (score > 0 && score <= 1) return clampMarketScore(score * 100, fallback);
  if (score > 1 && score <= 10) return clampMarketScore(score * 10, fallback);
  return clampMarketScore(score, fallback);
}

function extractAreaFromText(text: string, marker: RegExp) {
  const match = text.match(marker);
  if (!match?.[1]) return 0;
  return parseLocalizedNumber(match[1]);
}

function buildSubject(opportunity: AuctionOpportunity, rawPayload: Record<string, unknown>): PropertyMarketSubject {
  const candidate = asRecord(rawPayload.candidate);
  const market = asRecord(rawPayload.marketAnalysis);
  const subject = asRecord(market.subject);
  const text = `${opportunity.summary} ${asString(candidate.description)} ${asString(rawPayload.evidenceNotes)}`;
  const landAreaM2 =
    numberFromRecord(subject, ["landAreaM2", "land_area_m2", "terrainAreaM2"]) ||
    numberFromRecord(candidate, ["landAreaM2", "land_area_m2", "areaTerreno", "area"]) ||
    extractAreaFromText(text, /(?:terreno|area)\D{0,30}(\d+(?:[.,]\d+)?)\s*m/i);
  const builtAreaM2 =
    numberFromRecord(subject, ["builtAreaM2", "built_area_m2", "constructionAreaM2"]) ||
    numberFromRecord(candidate, ["builtAreaM2", "built_area_m2", "areaConstruida"]) ||
    extractAreaFromText(text, /(?:construida|construidos|area total construida)\D{0,30}(\d+(?:[.,]\d+)?)\s*m/i);
  const privateAreaM2 =
    numberFromRecord(subject, ["privateAreaM2", "private_area_m2", "areaPrivativa"]) ||
    numberFromRecord(candidate, ["privateAreaM2", "private_area_m2", "areaPrivativa"]) ||
    extractAreaFromText(text, /(?:privativa|area util)\D{0,30}(\d+(?:[.,]\d+)?)\s*m/i);

  return {
    propertyType: stringFromRecord(subject, ["propertyType", "property_type"], opportunity.propertyType),
    address: stringFromRecord(subject, ["address", "endereco"], opportunity.address),
    city: normalizeLocationName(stringFromRecord(subject, ["city", "cidade"], opportunity.city)),
    state: normalizeStateUf(stringFromRecord(subject, ["state", "uf"], opportunity.state)),
    landAreaM2,
    builtAreaM2,
    privateAreaM2,
    bedrooms: numberFromRecord(subject, ["bedrooms", "dormitorios"], numberFromRecord(candidate, ["bedrooms", "dormitorios"])),
    parkingSpaces: numberFromRecord(subject, ["parkingSpaces", "garagens"], numberFromRecord(candidate, ["parkingSpaces", "garagens"])),
    notes: asString(subject.notes, ""),
  };
}

function normalizeComparable(row: Record<string, unknown>, opportunityId: string): PropertyMarketComparable {
  const areaM2 = asNumber(row.area_m2, asNumber(row.areaM2));
  const askingPrice = asNumber(row.asking_price, asNumber(row.askingPrice));
  const soldPrice = asNumber(row.sold_price, asNumber(row.soldPrice));
  const price = soldPrice || askingPrice;

  return {
    id: asString(row.id, `${opportunityId}-${asString(row.source_label, "comparavel")}`),
    sourceLabel: asString(row.source_label, asString(row.sourceLabel, "Comparavel")),
    sourceUrl: asString(row.source_url, asString(row.sourceUrl)),
    listingType: asString(row.listing_type, asString(row.listingType, "Oferta")),
    propertyType: asString(row.property_type, asString(row.propertyType, "Imovel")),
    address: asString(row.address),
    neighborhood: normalizeLocationName(asString(row.neighborhood, asString(row.bairro))),
    city: normalizeLocationName(asString(row.city, asString(row.cidade))),
    state: normalizeStateUf(asString(row.state, asString(row.uf))),
    areaM2,
    askingPrice,
    soldPrice,
    pricePerM2: asNumber(row.price_per_m2, asNumber(row.pricePerM2, calculatePricePerM2(price, areaM2))),
    distanceKm: asNumber(row.distance_km, asNumber(row.distanceKm)),
    similarityScore: normalizeSimilarityScore(row.similarity_score ?? row.similarityScore, 50),
    quality: normalizeQuality(asString(row.quality, "medium")),
    notes: asString(row.notes),
    collectedAt: asString(row.collected_at, asString(row.collectedAt)),
  };
}

function normalizeCosts(value: unknown): MarketCostItem[] {
  return asArray<Record<string, unknown>>(value, [])
    .map((item) => ({
      label: asString(item.label),
      value: asNumber(item.value),
      detail: asString(item.detail),
    }))
    .filter((item) => item.label || item.value);
}

function calculateYieldPct(monthlyRent: number, baseValue: number) {
  if (!monthlyRent || !baseValue) return 0;
  return Math.round((monthlyRent / baseValue) * 1000) / 10;
}

function buildRentalEstimate(input: {
  raw?: Record<string, unknown>;
  monthlyRent?: number;
  referenceUrl?: string;
  referenceFound?: boolean;
  valueKnown?: boolean;
  notes?: string;
  marketValueBase: number;
  initialBid: number;
}): MarketRentalEstimate {
  const raw = input.raw || {};
  const monthlyRent = asNumber(input.monthlyRent, asNumber(raw.monthlyRent, asNumber(raw.monthly_rent)));
  const referenceUrl = asString(input.referenceUrl, asString(raw.referenceUrl, asString(raw.reference_url)));
  const referenceFound = Boolean(input.referenceFound ?? raw.referenceFound ?? raw.reference_found ?? referenceUrl);
  const valueKnown = Boolean(input.valueKnown ?? raw.valueKnown ?? raw.value_known ?? monthlyRent);
  const monthlyYieldOnMarketPct = calculateYieldPct(monthlyRent, input.marketValueBase);
  const monthlyYieldOnBidPct = calculateYieldPct(monthlyRent, input.initialBid);

  return {
    monthlyRent,
    referenceUrl,
    referenceFound,
    valueKnown,
    monthlyYieldOnMarketPct,
    annualYieldOnMarketPct: Math.round(monthlyYieldOnMarketPct * 12 * 10) / 10,
    monthlyYieldOnBidPct,
    annualYieldOnBidPct: Math.round(monthlyYieldOnBidPct * 12 * 10) / 10,
    notes: asString(input.notes, asString(raw.notes)),
  };
}

function buildPaymentSimulation(raw: Record<string, unknown> = {}): MarketPaymentSimulation {
  return {
    paymentMode: asString(raw.paymentMode, asString(raw.payment_mode, "a_vista")),
    downPaymentPct: asNumber(raw.downPaymentPct, asNumber(raw.down_payment_pct)),
    downPaymentAmount: asNumber(raw.downPaymentAmount, asNumber(raw.down_payment_amount)),
    installmentBalance: asNumber(raw.installmentBalance, asNumber(raw.installment_balance)),
    installmentCount: asNumber(raw.installmentCount, asNumber(raw.installment_count)),
    installmentAmount: asNumber(raw.installmentAmount, asNumber(raw.installment_amount)),
    correctionRule: asString(raw.correctionRule, asString(raw.correction_rule)),
    correctionWarning: asString(raw.correctionWarning, asString(raw.correction_warning)),
  };
}

function decideFromNumbers(realDiscountPct: number, riskScore: number, confidenceScore: number): MarketAnalysisDecision {
  const evaluation = buildOpportunityEvaluation({
    realDiscountPct,
    riskScore,
    confidenceScore,
    marketConfidenceScore: confidenceScore,
  });
  return marketDecisionFromRecommendation(evaluation);
}

function buildFallbackMarketAnalysis(
  opportunity: AuctionOpportunity,
  rawPayload: Record<string, unknown> = {},
  reason = "Analise estruturada ainda nao cadastrada; exibindo calculo preliminar."
): PropertyMarketAnalysis {
  const market = asRecord(rawPayload.marketAnalysis);
  const rentalRaw = asRecord(market.rentalEstimate || rawPayload.rentalEstimate);
  const paymentRaw = asRecord(market.paymentSimulation || rawPayload.paymentSimulation);
  const subject = buildSubject(opportunity, rawPayload);
  const marketValueBase = asNumber(market.marketValueBase, opportunity.appraisalValue);
  const marketValueLow = asNumber(market.marketValueLow, marketValueBase ? Math.round(marketValueBase * 0.9) : 0);
  const marketValueHigh = asNumber(market.marketValueHigh, marketValueBase ? Math.round(marketValueBase * 1.08) : 0);
  const comparableRows = asArray<Record<string, unknown>>(market.comparables, []);
  const comparables = comparableRows.map((item) => normalizeComparable(item, opportunity.id));
  const realDiscountPct = asNumber(market.realDiscountPct, calculateMarketDiscount(opportunity.initialBid, marketValueBase));
  const confidenceScore = clampMarketScore(
    asNumber(market.confidenceScore, comparables.length ? 68 : marketValueBase && opportunity.initialBid ? 48 : 25)
  );
  const decision = normalizeDecision(
    asString(market.decision),
    decideFromNumbers(realDiscountPct, opportunity.riskScore, confidenceScore)
  );
  const areaForPrice = subject.privateAreaM2 || subject.builtAreaM2 || subject.landAreaM2;
  const estimatedCosts = normalizeCosts(market.estimatedCosts);
  const estimatedCostsTotal = estimatedCosts.reduce((total, item) => total + item.value, 0);
  const estimatedNetMargin = asNumber(
    market.estimatedNetMargin,
    marketValueBase && opportunity.initialBid ? Math.round(marketValueBase - opportunity.initialBid - estimatedCostsTotal) : 0
  );

  return {
    id: "",
    opportunityId: "",
    opportunityCode: opportunity.id,
    analysisCode: asString(market.analysisCode, makeMarketAnalysisCode(opportunity.id)),
    status: normalizeStatus(asString(market.status), confidenceScore >= 60 ? "human_review" : "insufficient_data"),
    analystName: asString(market.analystName, "Analise Betel"),
    paymentCondition: asString(market.paymentCondition, "A vista"),
    subject,
    marketValueLow,
    marketValueBase,
    marketValueHigh,
    marketPricePerM2: asNumber(market.marketPricePerM2, calculatePricePerM2(marketValueBase, areaForPrice)),
    initialBid: opportunity.initialBid,
    initialBidPricePerM2: calculatePricePerM2(opportunity.initialBid, areaForPrice),
    realDiscountPct,
    estimatedCosts,
    estimatedNetMargin,
    rentalEstimate: buildRentalEstimate({
      raw: rentalRaw,
      marketValueBase,
      initialBid: opportunity.initialBid,
    }),
    paymentSimulation: buildPaymentSimulation(paymentRaw),
    suggestedCeilingBid: asNumber(market.suggestedCeilingBid, buildCeilingTargets(marketValueBase)[0]?.value || 0),
    ceilingTargets: buildCeilingTargets(marketValueBase),
    scenarios: [
      {
        label: "Conservador",
        marketValue: marketValueLow,
        realDiscountPct: calculateMarketDiscount(opportunity.initialBid, marketValueLow),
        estimatedNetMargin: marketValueLow && opportunity.initialBid ? Math.round(marketValueLow - opportunity.initialBid - estimatedCostsTotal) : 0,
        notes: "Base com margem de seguranca sobre os comparaveis.",
      },
      {
        label: "Base",
        marketValue: marketValueBase,
        realDiscountPct,
        estimatedNetMargin,
        notes: "Referencia principal da analise de mercado.",
      },
      {
        label: "Otimista",
        marketValue: marketValueHigh,
        realDiscountPct: calculateMarketDiscount(opportunity.initialBid, marketValueHigh),
        estimatedNetMargin: marketValueHigh && opportunity.initialBid ? Math.round(marketValueHigh - opportunity.initialBid - estimatedCostsTotal) : 0,
        notes: "Cenario dependente de liquidez, padrao e venda bem executada.",
      },
    ],
    liquidityScore: clampMarketScore(asNumber(market.liquidityScore, opportunity.opportunityScore)),
    confidenceScore,
    legalSignal: asString(market.legalSignal, "Validar acoes possessorias, propter rem e debitos antes de liberar."),
    decision,
    decisionLabel: decisionLabel(decision),
    decisionReason: asString(market.decisionReason, reason),
    summary: asString(
      market.summary,
      "Valor de mercado calculado de forma conservadora com base nos dados financeiros disponiveis. Registrar comparaveis mais proximos aumenta a confianca."
    ),
    cautionNotes: asString(market.cautionNotes, ""),
    comparables,
    sourceLinks: [
      { label: "Fonte do leilao", url: firstUrl(rawPayload.sourceUrl, asRecord(rawPayload.candidate).sourceUrl, rawPayload.targetUrl) },
      { label: "Referencia", url: firstUrl(market.referenceUrl) },
    ].filter((item) => item.url),
    rawPayload,
    updatedAt: asString(market.updatedAt, new Date().toISOString()),
  };
}

function normalizePersistedAnalysis(
  row: Record<string, unknown>,
  opportunity: AuctionOpportunity,
  opportunityUuid: string
): PropertyMarketAnalysis {
  const comparables = asArray<Record<string, unknown>>(row.property_market_comparables, [])
    .map((item) => normalizeComparable(item, opportunity.id))
    .sort((a, b) => b.similarityScore - a.similarityScore);
  const rawPayload = asRecord(row.raw_payload);
  const rentalRaw = asRecord(rawPayload.rentalEstimate);
  const paymentRaw = asRecord(rawPayload.paymentSimulation);
  const subject = {
    ...buildSubject(opportunity, {}),
    ...asRecord(row.subject_property_snapshot),
  } as PropertyMarketSubject & { neighborhood?: string };
  subject.city = normalizeLocationName(subject.city);
  subject.state = normalizeStateUf(subject.state);
  subject.neighborhood = normalizeLocationName((subject as { neighborhood?: unknown }).neighborhood);
  const marketValueBase = asNumber(row.market_value_base, opportunity.appraisalValue);
  const initialBid = opportunity.initialBid;
  const realDiscountPct = asNumber(row.real_discount_pct, calculateMarketDiscount(initialBid, marketValueBase));
  const confidenceScore = clampMarketScore(asNumber(row.confidence_score, comparables.length ? 70 : 45));
  const decision = normalizeDecision(
    asString(row.decision),
    decideFromNumbers(realDiscountPct, opportunity.riskScore, confidenceScore)
  );
  const estimatedCosts = normalizeCosts(row.estimated_costs);
  const estimatedCostsTotal = estimatedCosts.reduce((total, item) => total + item.value, 0);
  const marketValueLow = asNumber(row.market_value_low, marketValueBase ? Math.round(marketValueBase * 0.9) : 0);
  const marketValueHigh = asNumber(row.market_value_high, marketValueBase ? Math.round(marketValueBase * 1.08) : 0);

  return {
    id: asString(row.id),
    opportunityId: opportunityUuid,
    opportunityCode: opportunity.id,
    analysisCode: asString(row.analysis_code, makeMarketAnalysisCode(opportunity.id)),
    status: normalizeStatus(asString(row.status), "human_review"),
    analystName: asString(row.analyst_name, "Analise Betel"),
    paymentCondition: asString(row.payment_condition, "A vista"),
    subject,
    marketValueLow,
    marketValueBase,
    marketValueHigh,
    marketPricePerM2: asNumber(row.market_price_per_m2, calculatePricePerM2(marketValueBase, subject.privateAreaM2 || subject.builtAreaM2 || subject.landAreaM2)),
    initialBid,
    initialBidPricePerM2: asNumber(row.initial_bid_price_per_m2, calculatePricePerM2(initialBid, subject.privateAreaM2 || subject.builtAreaM2 || subject.landAreaM2)),
    realDiscountPct,
    estimatedCosts,
    estimatedNetMargin: asNumber(
      row.estimated_net_margin,
      marketValueBase && initialBid ? Math.round(marketValueBase - initialBid - estimatedCostsTotal) : 0
    ),
    rentalEstimate: buildRentalEstimate({
      raw: rentalRaw,
      marketValueBase,
      initialBid,
    }),
    paymentSimulation: buildPaymentSimulation(paymentRaw),
    suggestedCeilingBid: asNumber(row.suggested_ceiling_bid, buildCeilingTargets(marketValueBase)[0]?.value || 0),
    ceilingTargets: asArray(row.ceiling_targets, buildCeilingTargets(marketValueBase)),
    scenarios: [
      {
        label: "Conservador",
        marketValue: marketValueLow,
        realDiscountPct: calculateMarketDiscount(initialBid, marketValueLow),
        estimatedNetMargin: marketValueLow && initialBid ? Math.round(marketValueLow - initialBid - estimatedCostsTotal) : 0,
        notes: "Base com margem de seguranca sobre os comparaveis.",
      },
      {
        label: "Base",
        marketValue: marketValueBase,
        realDiscountPct,
        estimatedNetMargin: asNumber(row.estimated_net_margin),
        notes: "Referencia principal da analise de mercado.",
      },
      {
        label: "Otimista",
        marketValue: marketValueHigh,
        realDiscountPct: calculateMarketDiscount(initialBid, marketValueHigh),
        estimatedNetMargin: marketValueHigh && initialBid ? Math.round(marketValueHigh - initialBid - estimatedCostsTotal) : 0,
        notes: "Cenario dependente de liquidez, padrao e venda bem executada.",
      },
    ],
    liquidityScore: clampMarketScore(asNumber(row.liquidity_score, opportunity.opportunityScore)),
    confidenceScore,
    legalSignal: asString(row.legal_signal, "Validar juridico antes de comunicar ou operar."),
    decision,
    decisionLabel: decisionLabel(decision),
    decisionReason: asString(row.decision_reason),
    summary: asString(row.summary, "Analise de mercado registrada."),
    cautionNotes: asString(row.caution_notes),
    comparables,
    sourceLinks: asArray<Record<string, unknown>>(row.source_links, [])
      .map((item) => ({ label: asString(item.label), url: firstUrl(item.url) }))
      .filter((item) => item.label && item.url),
    rawPayload,
    updatedAt: asString(row.updated_at),
  };
}

export async function getPropertyMarketAnalysisByOpportunityCode(
  code: string
): Promise<DataResult<PropertyMarketAnalysis | null>> {
  const supabase = getSupabaseAdminClient();
  const mockOpportunity = getOpportunityById(code);

  if (!supabase) {
    return {
      data: mockOpportunity ? buildFallbackMarketAnalysis(mockOpportunity) : null,
      source: "mock",
      reason: "Supabase admin nao configurado.",
    };
  }

  const { data: opportunityRow, error: opportunityError } = await supabase
    .from("auction_opportunities")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (opportunityError || !opportunityRow) {
    return {
      data: mockOpportunity ? buildFallbackMarketAnalysis(mockOpportunity) : null,
      source: "mock",
      reason: opportunityError?.message || "Oportunidade nao encontrada para analise de mercado.",
    };
  }

  const opportunity = normalizeOpportunity(opportunityRow as OpportunityDbRow);
  const opportunityUuid = asString((opportunityRow as Record<string, unknown>).id);

  const { data: analysisRow, error: analysisError } = await supabase
    .from("property_market_analyses")
    .select("*, property_market_comparables(*)")
    .eq("opportunity_id", opportunityUuid)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (analysisError || !analysisRow) {
    const missingTable = Boolean(
      analysisError?.message.toLowerCase().includes("property_market_analyses") ||
        analysisError?.message.toLowerCase().includes("schema cache")
    );
    const reason = missingTable
      ? "Migration de analise de mercado ainda nao aplicada; exibindo calculo preliminar."
      : analysisError?.message || "Analise de mercado ainda nao cadastrada.";

    return {
      data: buildFallbackMarketAnalysis(
        opportunity,
        asRecord((opportunityRow as Record<string, unknown>).raw_payload),
        reason
      ),
      source: "supabase",
      reason,
    };
  }

  return {
    data: normalizePersistedAnalysis(analysisRow as Record<string, unknown>, opportunity, opportunityUuid),
    source: "supabase",
  };
}

export async function savePropertyMarketAnalysisRecord(
  input: SavePropertyMarketAnalysisInput
): Promise<DataResult<{ analysisId: string; analysisCode: string } | null>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      data: null,
      source: "mock",
      reason: "Supabase admin nao configurado.",
    };
  }

  const { data: opportunityRow, error: opportunityError } = await supabase
    .from("auction_opportunities")
    .select("id, code, title, property_type, address, city, state, initial_bid, opportunity_score")
    .eq("code", input.opportunityCode)
    .maybeSingle();

  if (opportunityError || !opportunityRow) {
    return {
      data: null,
      source: "supabase",
      reason: opportunityError?.message || "Oportunidade nao encontrada.",
    };
  }

  const opportunity = opportunityRow as Record<string, unknown>;
  const opportunityId = asString(opportunity.id);
  const opportunityCode = asString(opportunity.code, input.opportunityCode);
  const initialBid = asNumber(opportunity.initial_bid);
  const subjectArea = input.privateAreaM2 || input.builtAreaM2 || input.landAreaM2;
  const marketValueBase = input.marketValueBase;
  const marketValueLow = input.marketValueLow || (marketValueBase ? Math.round(marketValueBase * 0.9) : 0);
  const marketValueHigh = input.marketValueHigh || (marketValueBase ? Math.round(marketValueBase * 1.08) : 0);
  const realDiscountPct = calculateMarketDiscount(initialBid, marketValueBase);
  const ceilingTargets = buildCeilingTargets(marketValueBase);
  const analysisCode = makeMarketAnalysisCode(opportunityCode);
  const estimatedCosts = input.estimatedCosts.filter((item) => item.label || item.value);
  const estimatedCostsTotal = estimatedCosts.reduce((total, item) => total + item.value, 0);
  const rentalEstimate = buildRentalEstimate({
    ...input.rentalEstimate,
    marketValueBase,
    initialBid,
  });
  const downPaymentAmount =
    input.paymentSimulation.downPaymentAmount ||
    (initialBid && input.paymentSimulation.downPaymentPct ? Math.round(initialBid * (input.paymentSimulation.downPaymentPct / 100)) : 0);
  const installmentBalance =
    input.paymentSimulation.installmentBalance ||
    (initialBid && input.paymentSimulation.downPaymentPct ? Math.round(initialBid * (1 - input.paymentSimulation.downPaymentPct / 100)) : 0);
  const paymentSimulation: MarketPaymentSimulation = {
    ...input.paymentSimulation,
    downPaymentAmount,
    installmentBalance,
    installmentAmount:
      input.paymentSimulation.installmentAmount ||
      (installmentBalance && input.paymentSimulation.installmentCount
        ? Math.round(installmentBalance / input.paymentSimulation.installmentCount)
        : 0),
  };
  const normalizedStatus =
    input.status === "approved" && input.cautionNotes ? "approved_with_notes" : input.status;
  const sourceLinks = [
    { label: "Fonte do leilao", url: input.auctionUrl },
    { label: "Referencia", url: input.referenceUrl },
    { label: "Referencia aluguel", url: rentalEstimate.referenceUrl },
  ].filter((item) => item.url);

  const { data: analysisRow, error: analysisError } = await supabase
    .from("property_market_analyses")
    .upsert(
      {
        opportunity_id: opportunityId,
        analysis_code: analysisCode,
        status: normalizedStatus,
        analyst_name: input.analystName || "Analise Betel",
        payment_condition: input.paymentCondition || "A vista",
        subject_property_snapshot: {
          propertyType: asString(opportunity.property_type),
          address: asString(opportunity.address),
          city: normalizeLocationName(asString(opportunity.city)),
          state: normalizeStateUf(asString(opportunity.state)),
          landAreaM2: input.landAreaM2,
          builtAreaM2: input.builtAreaM2,
          privateAreaM2: input.privateAreaM2,
          bedrooms: input.bedrooms,
          parkingSpaces: input.parkingSpaces,
        },
        market_value_low: marketValueLow,
        market_value_base: marketValueBase,
        market_value_high: marketValueHigh,
        market_price_per_m2: calculatePricePerM2(marketValueBase, subjectArea),
        initial_bid_price_per_m2: calculatePricePerM2(initialBid, subjectArea),
        real_discount_pct: realDiscountPct,
        estimated_costs: estimatedCosts,
        estimated_net_margin: marketValueBase && initialBid ? Math.round(marketValueBase - initialBid - estimatedCostsTotal) : 0,
        suggested_ceiling_bid: ceilingTargets[0]?.value || 0,
        ceiling_targets: ceilingTargets,
        liquidity_score: clampMarketScore(input.liquidityScore, asNumber(opportunity.opportunity_score)),
        confidence_score: clampMarketScore(input.confidenceScore, 50),
        legal_signal: input.legalSignal,
        decision: input.decision,
        decision_reason: input.decisionReason,
        summary: input.summary,
        caution_notes: input.cautionNotes,
        source_links: sourceLinks,
        raw_payload: {
          savedFrom: "admin_market_analysis_human_review",
          rentalEstimate,
          paymentSimulation,
          review: {
            status: normalizedStatus,
            reviewedAt: new Date().toISOString(),
            analystName: input.analystName || "Analise Betel",
          },
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "opportunity_id" }
    )
    .select("id, analysis_code")
    .single();

  if (analysisError || !analysisRow) {
    return {
      data: null,
      source: "supabase",
      reason: analysisError?.message || "Nao foi possivel salvar a analise de mercado.",
    };
  }

  const analysisId = asString((analysisRow as Record<string, unknown>).id);
  const comparable = input.comparable;

  if (comparable && (comparable.sourceUrl || comparable.askingPrice || comparable.notes)) {
    const comparableArea = comparable.areaM2;
    const comparablePrice = comparable.soldPrice || comparable.askingPrice;
    const { error: comparableError } = await supabase.from("property_market_comparables").insert({
      analysis_id: analysisId,
      opportunity_id: opportunityId,
      source_label: comparable.sourceLabel || "Comparavel manual",
      source_url: comparable.sourceUrl || null,
      listing_type: comparable.listingType || "Oferta",
      property_type: comparable.propertyType || asString(opportunity.property_type),
      address: comparable.address || null,
      neighborhood: normalizeLocationName(comparable.neighborhood) || null,
      city: normalizeLocationName(comparable.city || asString(opportunity.city)),
      state: normalizeStateUf(comparable.state || asString(opportunity.state)),
      area_m2: comparableArea,
      asking_price: comparable.askingPrice,
      sold_price: comparable.soldPrice,
      price_per_m2: calculatePricePerM2(comparablePrice, comparableArea),
      distance_km: comparable.distanceKm,
      similarity_score: clampMarketScore(comparable.similarityScore, 50),
      quality: comparable.quality,
      notes: comparable.notes || null,
      collected_at: new Date().toISOString(),
      raw_payload: { savedFrom: "admin_market_analysis_quick_form" },
    });

    if (comparableError) {
      return {
        data: {
          analysisId,
          analysisCode: asString((analysisRow as Record<string, unknown>).analysis_code, analysisCode),
        },
        source: "supabase",
        reason: `Analise salva, mas o comparavel nao foi registrado: ${comparableError.message}`,
      };
    }
  }

  await supabase.from("audit_logs").insert({
    opportunity_id: opportunityId,
    actor_name: input.analystName || "Analise Betel",
    event_type: "property_market_analysis_saved",
    status: "registered",
    payload: {
      analysisCode,
      marketValueBase,
      realDiscountPct,
      decision: input.decision,
      confidenceScore: input.confidenceScore,
    },
  });

  return {
    data: {
      analysisId,
      analysisCode: asString((analysisRow as Record<string, unknown>).analysis_code, analysisCode),
    },
    source: "supabase",
  };
}
