import type { PropertyMarketAnalysis } from "../admin/market-analysis";
import type { AuctionOpportunity } from "../admin/resources";
import { selectRentalReferences } from "./rental-references";
import { canonicalReferenceUrl, compatibleMarketTypes, hasTechnicalMarketText, normalizedText, plausibleMonthlyRent } from "./market-quality";

export type ApprovedMarketPublication = { version: 1; analysis: PropertyMarketAnalysis; opportunity: AuctionOpportunity; references: { label: string; url: string }[] };

export function selectMarketReferences(analysis: PropertyMarketAnalysis) {
  const subject = analysis.subject;
  const area = subject.privateAreaM2 || subject.builtAreaM2 || subject.landAreaM2;
  const seen = new Set<string>();
  return [...analysis.comparables].sort((a,b) => b.similarityScore-a.similarityScore).filter(c => {
    const url = canonicalReferenceUrl(c.sourceUrl);
    if (!url || seen.has(url) || c.quality === "discarded" || c.similarityScore < 58) return false;
    if (/rent|alug/i.test(c.listingType)) return false;
    if (!compatibleMarketTypes(subject.propertyType, c.propertyType, decodeURIComponent(new URL(url).pathname).replace(/[-_/]/g, " "))) return false;
    if (!subject.city || !subject.state || normalizedText(c.city) !== normalizedText(subject.city) || normalizedText(c.state) !== normalizedText(subject.state)) return false;
    if (!(area > 0) || !(c.areaM2 > 0) || c.areaM2 / area < 0.5 || c.areaM2 / area > 1.5 || !(c.askingPrice > 0 || c.soldPrice > 0)) return false;
    seen.add(url);
    return true;
  }).sort((a,b) => b.similarityScore-a.similarityScore).slice(0,3).map((c,i) => ({label:`Referencia ${i+1}`,url:canonicalReferenceUrl(c.sourceUrl)}));
}

export function marketPublicationIssues(analysis: PropertyMarketAnalysis, opportunity: AuctionOpportunity) {
  const issues: string[] = [];
  const area = analysis.subject.privateAreaM2 || analysis.subject.builtAreaM2 || analysis.subject.landAreaM2;
  if (!opportunity.title.trim() || hasTechnicalMarketText(opportunity.title)) issues.push("Revise o titulo do imovel: conteudo ausente ou tecnico.");
  if (!compatibleMarketTypes(analysis.subject.propertyType, opportunity.propertyType, opportunity.title)) issues.push("Tipo de imovel inconsistente com a descricao.");
  if (!(area > 0) || !(analysis.initialBid > 0) || !(analysis.marketValueBase > 0)) issues.push("Area, lance e valor de mercado precisam estar confirmados.");
  if (!(analysis.marketValueLow > 0) || analysis.marketValueLow > analysis.marketValueBase || analysis.marketValueHigh < analysis.marketValueBase) issues.push("Cenarios de mercado inconsistentes.");
  if ([analysis.summary,analysis.legalSignal,analysis.decisionReason].some(hasTechnicalMarketText)) issues.push("Revise resumo, parecer e juridico: conteudo tecnico capturado da fonte.");
  if (!analysis.decisionReason.trim()) issues.push("Informe o motivo da aprovacao.");
  if (!plausibleMonthlyRent(analysis.rentalEstimate.monthlyRent,analysis.marketValueBase,area)) issues.push("Aluguel fora dos limites de plausibilidade; revise a fonte de locacao.");
  if (analysis.rentalEstimate.monthlyRent > 0 && (!analysis.rentalEstimate.valueKnown || !canonicalReferenceUrl(analysis.rentalEstimate.referenceUrl))) issues.push("Aluguel exige referencia de locacao com valor mensal confirmado.");
  if (analysis.rentalEstimate.monthlyRent > 0) {
    const rentUrl = canonicalReferenceUrl(analysis.rentalEstimate.referenceUrl);
    const rentReference = analysis.comparables.find(c => rentUrl && canonicalReferenceUrl(c.sourceUrl) === rentUrl && /rent|alug/i.test(c.listingType)
      && c.quality !== "discarded" && compatibleMarketTypes(analysis.subject.propertyType, c.propertyType)
      && normalizedText(c.city) === normalizedText(analysis.subject.city) && normalizedText(c.state) === normalizedText(analysis.subject.state)
      && c.areaM2 > 0 && area > 0 && c.areaM2 / area >= 0.5 && c.areaM2 / area <= 1.5
      && plausibleMonthlyRent(c.askingPrice, analysis.marketValueBase, c.areaM2) && c.askingPrice > 0);
    if (!rentReference) issues.push("A referencia do aluguel deve corresponder a um comparavel de locacao pertinente e com preco mensal confirmado.");
  }
  if (selectMarketReferences(analysis).length !== 3) issues.push("Selecione tres comparaveis de venda com tipo, cidade/UF, area e preco confirmados.");
  if (selectRentalReferences(analysis).length !== 3) issues.push("A renda locaticia exige tres anuncios de aluguel pertinentes, com preco mensal, tipo, cidade/UF e area confirmados.");
  return issues;
}
