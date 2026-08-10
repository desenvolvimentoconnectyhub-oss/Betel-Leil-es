import assert from "node:assert/strict";
import {
  buildOpportunityEvaluation,
  marketDecisionFromRecommendation,
  type OpportunityEvaluationInput,
} from "../src/lib/domain/opportunity-evaluation";

function evaluate(input: OpportunityEvaluationInput) {
  return buildOpportunityEvaluation(input);
}

{
  const result = evaluate({
    initialBid: 340_000,
    marketValueBase: 680_000,
    realDiscountPct: 50,
    saleComparables: 2,
    rentalComparables: 1,
    strongSaleComparables: 0,
    sourceDiversity: 1,
    marketConfidenceScore: 49,
    areaM2: 225,
    locationConfirmed: true,
    documentsCount: 0,
    occupancyKnown: false,
    riskScore: 65,
    complianceScore: 61,
    qualityFlags: ["comparaveis_insuficientes", "ocupacao_precisa_validacao"],
  });

  assert.equal(result.financialPotential.level, "alto");
  assert.equal(result.researchQuality.level, "limitada");
  assert.equal(result.risk.level, "nao_determinado");
  assert.equal(result.finalRecommendation.status, "investigar_antes_de_avancar");
  assert.equal(marketDecisionFromRecommendation(result), "review");
}

{
  const result = evaluate({
    initialBid: 600_000,
    marketValueBase: 1_150_000,
    realDiscountPct: 47.8,
    estimatedCostsTotal: 45_000,
    estimatedNetMargin: 505_000,
    saleComparables: 6,
    rentalComparables: 2,
    strongSaleComparables: 4,
    mediumSaleComparables: 2,
    sourceDiversity: 4,
    marketConfidenceScore: 82,
    marketScore: 88,
    areaM2: 120,
    locationConfirmed: true,
    documentsCount: 3,
    hasOfficialDocument: true,
    occupancyKnown: true,
    riskScore: 28,
    complianceScore: 86,
  });

  assert.equal(result.financialPotential.level, "alto");
  assert.equal(result.researchQuality.level, "solida");
  assert.equal(result.risk.level, "baixo");
  assert.equal(result.finalRecommendation.status, "recomendado_para_avancar");
  assert.equal(marketDecisionFromRecommendation(result), "excellent");
}

{
  const result = evaluate({
    initialBid: 500_000,
    marketValueBase: 680_000,
    realDiscountPct: 26.4,
    estimatedCostsTotal: 35_000,
    estimatedNetMargin: 145_000,
    saleComparables: 4,
    rentalComparables: 1,
    strongSaleComparables: 2,
    mediumSaleComparables: 2,
    sourceDiversity: 2,
    marketConfidenceScore: 66,
    areaM2: 90,
    locationConfirmed: true,
    documentsCount: 2,
    hasOfficialDocument: true,
    occupancyKnown: true,
    riskScore: 45,
    complianceScore: 78,
  });

  assert.equal(result.financialPotential.level, "moderado");
  assert.equal(result.researchQuality.level, "razoavel");
  assert.equal(result.risk.level, "baixo");
  assert.equal(result.finalRecommendation.status, "avancar_com_ressalvas");
  assert.equal(marketDecisionFromRecommendation(result), "caution");
}

{
  const result = evaluate({
    initialBid: 320_000,
    marketValueBase: 700_000,
    realDiscountPct: 54.2,
    saleComparables: 6,
    rentalComparables: 2,
    strongSaleComparables: 4,
    sourceDiversity: 4,
    marketConfidenceScore: 84,
    areaM2: 140,
    locationConfirmed: true,
    documentsCount: 2,
    hasOfficialDocument: true,
    occupancyKnown: true,
    riskScore: 82,
    complianceScore: 40,
    qualityFlags: ["risco_documental_juridico", "debitos_ou_propter_rem"],
  });

  assert.equal(result.financialPotential.level, "alto");
  assert.equal(result.researchQuality.level, "solida");
  assert.equal(result.risk.level, "alto");
  assert.equal(result.finalRecommendation.status, "nao_recomendado");
  assert.equal(marketDecisionFromRecommendation(result), "reject");
}

{
  const result = evaluate({
    initialBid: 96_000,
    marketValueBase: 270_000,
    realDiscountPct: 64.4,
    saleComparables: 0,
    rentalComparables: 0,
    sourceDiversity: 0,
    marketConfidenceScore: 37,
    areaM2: 1080,
    locationConfirmed: true,
    documentsCount: 0,
    occupancyKnown: true,
  });

  assert.equal(result.financialPotential.level, "alto");
  assert.equal(result.researchQuality.level, "insuficiente");
  assert.equal(result.finalRecommendation.status, "analise_inconclusiva");
  assert.equal(marketDecisionFromRecommendation(result), "review");
}

{
  const result = evaluate({
    initialBid: 500_000,
    marketValueBase: 900_000,
    realDiscountPct: 44.4,
    saleComparables: 5,
    rentalComparables: 1,
    strongSaleComparables: 0,
    weakSaleComparables: 5,
    sourceDiversity: 1,
    marketConfidenceScore: 42,
    areaM2: 130,
    locationConfirmed: true,
    documentsCount: 1,
    occupancyKnown: true,
  });

  assert.equal(result.financialPotential.level, "alto");
  assert.notEqual(result.researchQuality.level, "solida");
  assert.equal(result.finalRecommendation.status, "investigar_antes_de_avancar");
}

{
  const result = evaluate({
    initialBid: 420_000,
    marketValueBase: 760_000,
    realDiscountPct: 44.7,
    saleComparables: 4,
    rentalComparables: 1,
    strongSaleComparables: 2,
    sourceDiversity: 3,
    marketConfidenceScore: 72,
    locationConfirmed: true,
    documentsCount: 2,
    hasOfficialDocument: true,
    occupancyKnown: true,
    riskScore: 35,
    complianceScore: 82,
  });

  assert.equal(result.financialPotential.level, "alto");
  assert.notEqual(result.researchQuality.level, "solida");
  assert.equal(result.finalRecommendation.status, "investigar_antes_de_avancar");
}

console.log("opportunity-evaluation tests passed");
