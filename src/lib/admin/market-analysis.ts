import type { ResourceTone } from "./resources";

export type MarketAnalysisStatus =
  | "pending"
  | "in_analysis"
  | "human_review"
  | "approved"
  | "approved_with_notes"
  | "rejected"
  | "insufficient_data";

export type MarketAnalysisDecision = "excellent" | "good" | "caution" | "review" | "reject";
export type MarketComparableQuality = "strong" | "medium" | "weak" | "discarded";

export type PropertyMarketSubject = {
  propertyType: string;
  address: string;
  city: string;
  state: string;
  landAreaM2: number;
  builtAreaM2: number;
  privateAreaM2: number;
  bedrooms: number;
  parkingSpaces: number;
  notes: string;
};

export type PropertyMarketComparable = {
  id: string;
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
  pricePerM2: number;
  distanceKm: number;
  similarityScore: number;
  quality: MarketComparableQuality;
  notes: string;
  collectedAt: string;
};

export type MarketCostItem = {
  label: string;
  value: number;
  detail: string;
};

export type MarketCeilingTarget = {
  label: string;
  targetDiscountPct: number;
  value: number;
  rationale: string;
};

export type MarketScenario = {
  label: string;
  marketValue: number;
  realDiscountPct: number;
  estimatedNetMargin: number;
  notes: string;
};

export type MarketRentalEstimate = {
  monthlyRent: number;
  referenceUrl: string;
  referenceFound: boolean;
  valueKnown: boolean;
  monthlyYieldOnMarketPct: number;
  annualYieldOnMarketPct: number;
  monthlyYieldOnBidPct: number;
  annualYieldOnBidPct: number;
  notes: string;
};

export type MarketPaymentSimulation = {
  paymentMode: string;
  downPaymentPct: number;
  downPaymentAmount: number;
  installmentBalance: number;
  installmentCount: number;
  installmentAmount: number;
  correctionRule: string;
  correctionWarning: string;
};

export type PropertyMarketAnalysis = {
  id: string;
  opportunityId: string;
  opportunityCode: string;
  analysisCode: string;
  status: MarketAnalysisStatus;
  analystName: string;
  paymentCondition: string;
  subject: PropertyMarketSubject;
  marketValueLow: number;
  marketValueBase: number;
  marketValueHigh: number;
  marketPricePerM2: number;
  initialBid: number;
  initialBidPricePerM2: number;
  realDiscountPct: number;
  estimatedCosts: MarketCostItem[];
  estimatedNetMargin: number;
  rentalEstimate: MarketRentalEstimate;
  paymentSimulation: MarketPaymentSimulation;
  suggestedCeilingBid: number;
  ceilingTargets: MarketCeilingTarget[];
  scenarios: MarketScenario[];
  liquidityScore: number;
  confidenceScore: number;
  legalSignal: string;
  decision: MarketAnalysisDecision;
  decisionLabel: string;
  decisionReason: string;
  summary: string;
  cautionNotes: string;
  comparables: PropertyMarketComparable[];
  sourceLinks: Array<{ label: string; url: string }>;
  updatedAt: string;
};

export function clampMarketScore(value: number, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function calculateMarketDiscount(initialBid: number, marketValue: number) {
  if (!initialBid || !marketValue) return 0;
  return Math.max(0, Math.min(95, Math.round(((marketValue - initialBid) / marketValue) * 1000) / 10));
}

export function calculatePricePerM2(value: number, areaM2: number) {
  if (!value || !areaM2) return 0;
  return Math.round(value / areaM2);
}

export function buildCeilingTargets(marketValueBase: number): MarketCeilingTarget[] {
  return [30, 40].map((targetDiscountPct) => ({
    label: `${targetDiscountPct}%`,
    targetDiscountPct,
    value: marketValueBase ? Math.round(marketValueBase * (1 - targetDiscountPct / 100)) : 0,
    rationale: `Teto para manter ${targetDiscountPct}% abaixo do valor de mercado base.`,
  }));
}

export function decisionLabel(decision: MarketAnalysisDecision) {
  const labels: Record<MarketAnalysisDecision, string> = {
    excellent: "Excelente oportunidade",
    good: "Boa oportunidade",
    caution: "Oportunidade com cautela",
    review: "Revisar antes de avancar",
    reject: "Descartar",
  };

  return labels[decision];
}

export function decisionTone(decision: MarketAnalysisDecision): ResourceTone {
  if (decision === "excellent" || decision === "good") return "green";
  if (decision === "caution" || decision === "review") return "yellow";
  if (decision === "reject") return "red";
  return "muted";
}

export function statusTone(status: MarketAnalysisStatus): ResourceTone {
  if (status === "approved") return "green";
  if (status === "approved_with_notes" || status === "human_review" || status === "in_analysis") return "yellow";
  if (status === "rejected") return "red";
  return "muted";
}
