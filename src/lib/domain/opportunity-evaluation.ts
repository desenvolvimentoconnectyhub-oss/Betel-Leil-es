import type { MarketAnalysisDecision, MarketComparableQuality, PropertyMarketAnalysis } from "../admin/market-analysis";
import type { AuctionOpportunity, ResourceTone } from "../admin/resources";

export type FinancialPotentialLevel = "alto" | "moderado" | "baixo" | "nao_calculado";
export type ResearchQualityLevel = "solida" | "razoavel" | "limitada" | "insuficiente";
export type OpportunityRiskLevel = "baixo" | "moderado" | "alto" | "nao_determinado";
export type FinalRecommendationStatus =
  | "recomendado_para_avancar"
  | "avancar_com_ressalvas"
  | "investigar_antes_de_avancar"
  | "nao_recomendado"
  | "analise_inconclusiva";

export type OpportunityEvaluationRules = {
  version: string;
  financial: {
    highDiscountPct: number;
    moderateDiscountPct: number;
    lowDiscountPct: number;
    positiveMarginPct: number;
  };
  research: {
    solidSaleComparables: number;
    reasonableSaleComparables: number;
    limitedSaleComparables: number;
    solidStrongComparables: number;
    minConfidenceForReasonable: number;
    minConfidenceForSolid: number;
    minSourceDiversityForReasonable: number;
    minSourceDiversityForSolid: number;
  };
  risk: {
    highRiskScore: number;
    moderateRiskScore: number;
    minComplianceForLowRisk: number;
  };
};

export type OpportunityEvaluationInput = {
  initialBid?: number;
  marketValueBase?: number;
  realDiscountPct?: number;
  estimatedCostsTotal?: number;
  estimatedNetMargin?: number;
  rentalMonthlyRent?: number;
  saleComparables?: number;
  rentalComparables?: number;
  strongSaleComparables?: number;
  mediumSaleComparables?: number;
  weakSaleComparables?: number;
  sourceDiversity?: number;
  marketConfidenceScore?: number;
  confidenceScore?: number;
  marketScore?: number;
  areaM2?: number;
  locationConfirmed?: boolean;
  documentsCount?: number;
  hasOfficialDocument?: boolean;
  occupancyKnown?: boolean;
  riskScore?: number;
  complianceScore?: number;
  missingFields?: string[];
  qualityFlags?: string[];
  cautionNotes?: string[];
};

export type EvaluationFacet<TLevel extends string> = {
  level: TLevel;
  label: string;
  score: number;
  tone: ResourceTone;
  explanation: string;
  reasons: string[];
  missingItems: string[];
};

export type FinalRecommendation = {
  status: FinalRecommendationStatus;
  label: string;
  tone: ResourceTone;
  explanation: string;
  nextActions: string[];
};

export type OpportunityEvaluation = {
  ruleVersion: string;
  financialPotential: EvaluationFacet<FinancialPotentialLevel>;
  researchQuality: EvaluationFacet<ResearchQualityLevel>;
  risk: EvaluationFacet<OpportunityRiskLevel>;
  finalRecommendation: FinalRecommendation;
};

export const DEFAULT_OPPORTUNITY_EVALUATION_RULES: OpportunityEvaluationRules = {
  version: "2.0",
  financial: {
    highDiscountPct: 40,
    moderateDiscountPct: 25,
    lowDiscountPct: 10,
    positiveMarginPct: 8,
  },
  research: {
    solidSaleComparables: 5,
    reasonableSaleComparables: 3,
    limitedSaleComparables: 1,
    solidStrongComparables: 3,
    minConfidenceForReasonable: 55,
    minConfidenceForSolid: 70,
    minSourceDiversityForReasonable: 2,
    minSourceDiversityForSolid: 3,
  },
  risk: {
    highRiskScore: 75,
    moderateRiskScore: 55,
    minComplianceForLowRisk: 75,
  },
};

type ComparableLike = {
  listingType?: string;
  quality?: MarketComparableQuality | string;
  sourceUrl?: string;
  sourceLabel?: string;
};

const RISK_HIGH_PATTERNS = [
  "debito",
  "debitos",
  "propter",
  "penhora",
  "indisponibilidade",
  "risco documental",
  "acao judicial",
  "processo judicial",
];

const RISK_UNKNOWN_PATTERNS = [
  "ocupacao",
  "matricula",
  "documento",
  "edital",
  "validacao juridica",
  "validacao",
];

function clampScore(value: number, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function cleanText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^Trava atual:\s*/i, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function uniqueTexts(values: Array<string | undefined | null>, limit = 12) {
  const seen = new Set<string>();
  return values
    .map((item) => cleanText(String(item || "")))
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, limit);
}

function calculateDiscountPct(initialBid?: number, marketValueBase?: number) {
  const bid = positiveNumber(initialBid);
  const market = positiveNumber(marketValueBase);
  if (!bid || !market) return 0;
  return Math.max(0, Math.min(95, Math.round(((market - bid) / market) * 1000) / 10));
}

function calculateMarginPct(input: OpportunityEvaluationInput) {
  const bid = positiveNumber(input.initialBid);
  const costs = positiveNumber(input.estimatedCostsTotal);
  const investment = bid + costs;
  if (!investment || typeof input.estimatedNetMargin !== "number" || !Number.isFinite(input.estimatedNetMargin)) return 0;
  return Math.round((input.estimatedNetMargin / investment) * 1000) / 10;
}

function formatPct(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function assessFinancialPotential(input: OpportunityEvaluationInput, rules: OpportunityEvaluationRules) {
  const initialBid = positiveNumber(input.initialBid);
  const marketValueBase = positiveNumber(input.marketValueBase);
  const discountPct = positiveNumber(input.realDiscountPct) || calculateDiscountPct(initialBid, marketValueBase);
  const marginPct = calculateMarginPct(input);

  if (!discountPct && (!initialBid || !marketValueBase)) {
    return {
      level: "nao_calculado" as const,
      label: "Nao calculado",
      score: 0,
      tone: "muted" as ResourceTone,
      explanation: "Ainda falta lance ou valor de mercado para medir o potencial financeiro.",
      reasons: ["lance ou valor de mercado ainda nao esta completo"],
      missingItems: ["lance inicial", "valor de mercado"],
    };
  }

  const reasons = [`desconto aparente de ${formatPct(discountPct)} sobre o valor de mercado usado`];
  if (!initialBid || !marketValueBase) reasons.push("lance ou valor de mercado veio de calculo preliminar");
  if (marginPct) reasons.push(`margem estimada de ${formatPct(marginPct)} sobre o investimento`);

  const score = clampScore(30 + discountPct * 1.15 + Math.max(0, marginPct) * 0.5);
  const high = discountPct >= rules.financial.highDiscountPct && marginPct >= -5;
  const moderate = discountPct >= rules.financial.moderateDiscountPct || marginPct >= rules.financial.positiveMarginPct;
  const low = discountPct >= rules.financial.lowDiscountPct || marginPct > 0;

  if (high) {
    return {
      level: "alto" as const,
      label: "Alto",
      score,
      tone: "green" as ResourceTone,
      explanation: "O preco parece atrativo, mas isso ainda depende da qualidade da pesquisa e da leitura de risco.",
      reasons,
      missingItems: [],
    };
  }

  if (moderate) {
    return {
      level: "moderado" as const,
      label: "Moderado",
      score,
      tone: "yellow" as ResourceTone,
      explanation: "Existe vantagem financeira aparente, mas ela nao e forte o suficiente para decidir sozinha.",
      reasons,
      missingItems: [],
    };
  }

  return {
    level: "baixo" as const,
    label: "Baixo",
    score: low ? score : clampScore(score * 0.75),
    tone: "red" as ResourceTone,
    explanation: "O desconto ou a margem nao sustentam uma recomendacao forte neste momento.",
    reasons,
    missingItems: [],
  };
}

function assessResearchQuality(input: OpportunityEvaluationInput, rules: OpportunityEvaluationRules) {
  const marketValueBase = positiveNumber(input.marketValueBase);
  const saleComparables = Math.max(0, Math.round(positiveNumber(input.saleComparables)));
  const rentalComparables = Math.max(0, Math.round(positiveNumber(input.rentalComparables)));
  const strongSaleComparables = Math.max(0, Math.round(positiveNumber(input.strongSaleComparables)));
  const mediumSaleComparables = Math.max(0, Math.round(positiveNumber(input.mediumSaleComparables)));
  const sourceDiversity = Math.max(0, Math.round(positiveNumber(input.sourceDiversity)));
  const confidence = clampScore(positiveNumber(input.marketConfidenceScore) || positiveNumber(input.confidenceScore));
  const marketScore = positiveNumber(input.marketScore);
  const areaM2 = positiveNumber(input.areaM2);
  const locationConfirmed = input.locationConfirmed !== false;
  const missingItems = uniqueTexts([
    !marketValueBase ? "valor de mercado defendido por fonte" : "",
    !areaM2 ? "area base do imovel" : "",
    !locationConfirmed ? "cidade e UF confirmadas" : "",
    saleComparables < rules.research.reasonableSaleComparables ? "minimo de 3 comparaveis de venda" : "",
    sourceDiversity < rules.research.minSourceDiversityForReasonable ? "mais de uma fonte de comparaveis" : "",
    !rentalComparables ? "referencia de aluguel" : "",
  ]);

  let score = 0;
  if (marketValueBase) score += 18;
  if (areaM2) score += 12;
  if (locationConfirmed) score += 10;
  score += Math.min(25, saleComparables * 7);
  score += Math.min(15, strongSaleComparables * 5 + mediumSaleComparables * 2);
  score += Math.min(10, sourceDiversity * 4);
  if (rentalComparables) score += 8;
  if (confidence) score = Math.round((score + confidence) / 2);
  if (marketScore) score = Math.round(score * 0.65 + marketScore * 0.35);
  score = clampScore(score);

  const reasons = [
    `${saleComparables} comparavel(is) de venda`,
    `${rentalComparables} referencia(s) de aluguel`,
    `${sourceDiversity} fonte(s) de mercado`,
    `${strongSaleComparables} comparavel(is) forte(s) e ${mediumSaleComparables} medio(s)`,
    confidence ? `confianca de mercado em ${confidence}/100` : "",
  ].filter(Boolean);

  const solid =
    marketValueBase &&
    areaM2 &&
    locationConfirmed &&
    saleComparables >= rules.research.solidSaleComparables &&
    strongSaleComparables >= rules.research.solidStrongComparables &&
    sourceDiversity >= rules.research.minSourceDiversityForSolid &&
    confidence >= rules.research.minConfidenceForSolid;
  const reasonable =
    marketValueBase &&
    areaM2 &&
    locationConfirmed &&
    saleComparables >= rules.research.reasonableSaleComparables &&
    sourceDiversity >= rules.research.minSourceDiversityForReasonable &&
    confidence >= rules.research.minConfidenceForReasonable;
  const limited = marketValueBase && saleComparables >= rules.research.limitedSaleComparables;

  if (solid) {
    return {
      level: "solida" as const,
      label: "Solida",
      score,
      tone: "green" as ResourceTone,
      explanation: "A base de pesquisa tem volume, fontes diferentes e comparaveis fortes o suficiente para defender o valor.",
      reasons,
      missingItems: [],
    };
  }

  if (reasonable) {
    return {
      level: "razoavel" as const,
      label: "Razoavel",
      score,
      tone: "yellow" as ResourceTone,
      explanation: "A pesquisa ja sustenta uma leitura operacional, mas ainda merece conferencia antes de liberar sem humano.",
      reasons,
      missingItems,
    };
  }

  if (limited) {
    return {
      level: "limitada" as const,
      label: "Limitada",
      score,
      tone: "yellow" as ResourceTone,
      explanation: "Existe algum material de mercado, mas a base ainda e pequena ou pouco diversa para uma conclusao final.",
      reasons,
      missingItems,
    };
  }

  return {
    level: "insuficiente" as const,
    label: "Insuficiente",
    score,
    tone: "red" as ResourceTone,
    explanation: "Ainda nao ha pesquisa suficiente para defender o valor de mercado com seguranca.",
    reasons,
    missingItems,
  };
}

function includesAnyToken(values: string[], patterns: string[]) {
  return values.some((value) => patterns.some((pattern) => value.includes(pattern)));
}

function assessRisk(input: OpportunityEvaluationInput, rules: OpportunityEvaluationRules) {
  const riskScore = clampScore(positiveNumber(input.riskScore));
  const complianceScore = clampScore(positiveNumber(input.complianceScore));
  const signals = uniqueTexts([
    ...(input.qualityFlags || []),
    ...(input.cautionNotes || []),
    ...(input.missingFields || []),
  ], 20);
  const highSignal = includesAnyToken(signals, RISK_HIGH_PATTERNS);
  const unknownSignal = includesAnyToken(signals, RISK_UNKNOWN_PATTERNS);
  const documentsCount = Math.max(0, Math.round(positiveNumber(input.documentsCount)));
  const hasOfficialDocument = input.hasOfficialDocument === true || documentsCount > 0;
  const occupancyKnown = input.occupancyKnown === true;
  const missingItems = uniqueTexts([
    !occupancyKnown ? "ocupacao do imovel" : "",
    !hasOfficialDocument ? "documento oficial ou matricula" : "",
    unknownSignal ? signals.find((item) => RISK_UNKNOWN_PATTERNS.some((pattern) => item.includes(pattern))) : "",
  ]);

  const inferredRiskScore = clampScore(
    riskScore ||
      25 +
        signals.length * 8 +
        missingItems.length * 12 +
        (complianceScore ? Math.max(0, 65 - complianceScore) * 0.7 : 12)
  );
  const reasons = [
    riskScore ? `risco operacional em ${riskScore}/100` : "",
    complianceScore ? `compliance em ${complianceScore}/100` : "",
    documentsCount ? `${documentsCount} documento(s) localizado(s)` : "",
    occupancyKnown ? "ocupacao informada" : "",
    ...signals.slice(0, 4),
  ].filter(Boolean);

  if (inferredRiskScore >= rules.risk.highRiskScore || highSignal) {
    const highScore = Math.max(inferredRiskScore, rules.risk.highRiskScore);
    return {
      level: "alto" as const,
      label: "Alto",
      score: highScore,
      tone: "red" as ResourceTone,
      explanation: "Ha sinal de risco que pode mudar a decisao ou exigir leitura juridica antes de avancar.",
      reasons,
      missingItems,
    };
  }

  if (missingItems.length) {
    return {
      level: "nao_determinado" as const,
      label: "Nao determinado",
      score: inferredRiskScore,
      tone: "yellow" as ResourceTone,
      explanation: "O risco ainda nao esta fechado porque faltam confirmacoes basicas, principalmente ocupacao ou documentos.",
      reasons,
      missingItems,
    };
  }

  if (inferredRiskScore >= rules.risk.moderateRiskScore || signals.length || complianceScore < rules.risk.minComplianceForLowRisk) {
    return {
      level: "moderado" as const,
      label: "Moderado",
      score: inferredRiskScore,
      tone: "yellow" as ResourceTone,
      explanation: "Nao ha bloqueio forte, mas ainda existem pontos para conferencia antes de uma aprovacao limpa.",
      reasons,
      missingItems,
    };
  }

  return {
    level: "baixo" as const,
    label: "Baixo",
    score: inferredRiskScore,
    tone: "green" as ResourceTone,
    explanation: "Nao foram encontrados sinais relevantes de risco na camada operacional atual.",
    reasons,
    missingItems: [],
  };
}

function firstActions(...groups: string[][]) {
  const actions = uniqueTexts(groups.flat(), 5);
  return actions.length ? actions : ["registrar revisao humana com a conclusao final"];
}

function buildFinalRecommendation(input: {
  financial: ReturnType<typeof assessFinancialPotential>;
  research: ReturnType<typeof assessResearchQuality>;
  risk: ReturnType<typeof assessRisk>;
}) {
  const { financial, research, risk } = input;

  if (research.level === "insuficiente") {
    return {
      status: "analise_inconclusiva" as const,
      label: "Analise inconclusiva",
      tone: "red" as ResourceTone,
      explanation: "Nao existe pesquisa suficiente para dizer se a oportunidade e boa ou ruim.",
      nextActions: firstActions(research.missingItems, risk.missingItems),
    };
  }

  if (risk.level === "alto") {
    return {
      status: "nao_recomendado" as const,
      label: "Nao recomendado agora",
      tone: "red" as ResourceTone,
      explanation: "O risco identificado pesa mais do que o potencial financeiro neste momento.",
      nextActions: firstActions(risk.missingItems, research.missingItems),
    };
  }

  if (financial.level === "alto" && research.level === "solida" && risk.level === "baixo") {
    return {
      status: "recomendado_para_avancar" as const,
      label: "Recomendado para avancar",
      tone: "green" as ResourceTone,
      explanation: "O preco e atrativo, a pesquisa esta forte e nao ha risco operacional relevante nesta etapa.",
      nextActions: ["enviar para a proxima etapa do pipeline"],
    };
  }

  if (
    (financial.level === "alto" || financial.level === "moderado") &&
    (research.level === "solida" || research.level === "razoavel") &&
    (risk.level === "baixo" || risk.level === "moderado")
  ) {
    return {
      status: "avancar_com_ressalvas" as const,
      label: "Avancar com ressalvas",
      tone: "yellow" as ResourceTone,
      explanation: "A oportunidade tem potencial, mas ainda precisa de conferencia antes de seguir sem humano.",
      nextActions: firstActions(research.missingItems, risk.missingItems),
    };
  }

  if (financial.level === "alto" || financial.level === "moderado") {
    return {
      status: "investigar_antes_de_avancar" as const,
      label: "Investigar antes de avancar",
      tone: "yellow" as ResourceTone,
      explanation: "O preco parece interessante, mas a pesquisa ou o risco ainda nao estao fechados.",
      nextActions: firstActions(research.missingItems, risk.missingItems),
    };
  }

  return {
    status: "investigar_antes_de_avancar" as const,
    label: "Baixo potencial preliminar",
    tone: "yellow" as ResourceTone,
    explanation: "A vantagem financeira ainda nao sustenta uma aprovacao automatica.",
    nextActions: firstActions(research.missingItems, risk.missingItems),
  };
}

export function buildOpportunityEvaluation(
  input: OpportunityEvaluationInput,
  rules: OpportunityEvaluationRules = DEFAULT_OPPORTUNITY_EVALUATION_RULES
): OpportunityEvaluation {
  const financialPotential = assessFinancialPotential(input, rules);
  const researchQuality = assessResearchQuality(input, rules);
  const risk = assessRisk(input, rules);
  const finalRecommendation = buildFinalRecommendation({ financial: financialPotential, research: researchQuality, risk });

  return {
    ruleVersion: rules.version,
    financialPotential,
    researchQuality,
    risk,
    finalRecommendation,
  };
}

export function marketDecisionFromRecommendation(evaluation: OpportunityEvaluation): MarketAnalysisDecision {
  if (evaluation.finalRecommendation.status === "recomendado_para_avancar") return "excellent";
  if (evaluation.finalRecommendation.status === "avancar_com_ressalvas") return "caution";
  if (evaluation.finalRecommendation.status === "nao_recomendado") return "reject";
  return "review";
}

export function countComparableSources(comparables: ComparableLike[]) {
  const hosts = new Set<string>();
  comparables.forEach((item) => {
    const sourceUrl = String(item.sourceUrl || "").trim();
    if (sourceUrl) {
      try {
        hosts.add(new URL(sourceUrl).hostname.replace(/^www\./, ""));
        return;
      } catch {
        hosts.add(sourceUrl.toLowerCase());
        return;
      }
    }

    const sourceLabel = String(item.sourceLabel || "").trim();
    if (sourceLabel) hosts.add(sourceLabel.toLowerCase());
  });

  return hosts.size;
}

export function countComparableQualities(comparables: ComparableLike[]) {
  return comparables.reduce(
    (counts, comparable) => {
      const quality = String(comparable.quality || "").toLowerCase();
      if (quality === "strong") counts.strong += 1;
      else if (quality === "medium") counts.medium += 1;
      else if (quality === "weak") counts.weak += 1;
      else if (quality === "discarded") counts.discarded += 1;
      return counts;
    },
    { strong: 0, medium: 0, weak: 0, discarded: 0 }
  );
}

export function isRentalComparable(comparable: ComparableLike) {
  const listingType = String(comparable.listingType || "").toLowerCase();
  return listingType.includes("rent") || listingType.includes("aluguel") || listingType.includes("locacao");
}

export function isSaleComparable(comparable: ComparableLike) {
  const listingType = String(comparable.listingType || "").toLowerCase();
  return !isRentalComparable(comparable) && !listingType.includes("discard");
}

export function buildOpportunityEvaluationInputFromAnalysis(
  opportunity: AuctionOpportunity,
  analysis: PropertyMarketAnalysis | null
): OpportunityEvaluationInput {
  const comparables = analysis?.comparables || [];
  const saleComparables = comparables.filter(isSaleComparable);
  const rentalComparables = comparables.filter(isRentalComparable);
  const saleQuality = countComparableQualities(saleComparables);
  const areaM2 =
    positiveNumber(analysis?.subject.privateAreaM2) ||
    positiveNumber(analysis?.subject.builtAreaM2) ||
    positiveNumber(analysis?.subject.landAreaM2);
  const documents = opportunity.documents || [];
  const documentText = documents.map((item) => `${item.label} ${item.status} ${item.source}`).join(" ").toLowerCase();
  const occupancy = String(opportunity.occupancy || "").trim().toLowerCase();
  const occupancyKnown = Boolean(occupancy && !["nao informado", "nao informada", "n/a", "-"].includes(occupancy));
  const cautionNotes = (analysis?.cautionNotes || "")
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    initialBid: analysis?.initialBid || opportunity.initialBid,
    marketValueBase: analysis?.marketValueBase || opportunity.appraisalValue,
    realDiscountPct: analysis?.realDiscountPct || opportunity.discountPct,
    estimatedCostsTotal: analysis?.estimatedCosts.reduce((sum, item) => sum + item.value, 0) || 0,
    estimatedNetMargin: analysis?.estimatedNetMargin || 0,
    rentalMonthlyRent: analysis?.rentalEstimate.monthlyRent || 0,
    saleComparables: saleComparables.length,
    rentalComparables: rentalComparables.length,
    strongSaleComparables: saleQuality.strong,
    mediumSaleComparables: saleQuality.medium,
    weakSaleComparables: saleQuality.weak,
    sourceDiversity: countComparableSources(saleComparables),
    marketConfidenceScore: analysis?.confidenceScore || 0,
    confidenceScore: analysis?.confidenceScore || opportunity.complianceScore,
    marketScore: analysis?.liquidityScore || opportunity.opportunityScore,
    areaM2,
    locationConfirmed: Boolean((analysis?.subject.city || opportunity.city) && (analysis?.subject.state || opportunity.state)),
    documentsCount: documents.length,
    hasOfficialDocument: /matricula|edital|documento oficial|laudo/.test(documentText),
    occupancyKnown,
    riskScore: opportunity.riskScore,
    complianceScore: opportunity.complianceScore,
    missingFields: [],
    qualityFlags: opportunity.riskFlags.map((item) => item.label),
    cautionNotes,
  };
}
