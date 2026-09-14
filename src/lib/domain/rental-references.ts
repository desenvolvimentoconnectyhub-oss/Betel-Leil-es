import type { PropertyMarketAnalysis, PropertyMarketComparable } from "../admin/market-analysis";
import { canonicalReferenceUrl, compatibleMarketTypes, normalizedText, plausibleMonthlyRent } from "./market-quality";

export function rentalReferenceScope(analysis: PropertyMarketAnalysis, comparable: PropertyMarketComparable) {
  const subject = analysis.subject;
  const evidence = normalizedText(`${comparable.address} ${comparable.notes}`);
  if (subject.condoName && evidence.includes(normalizedText(subject.condoName))) return 0;
  const street = normalizedText(subject.address).split(/,|\b\d+\b/)[0].trim();
  if (street.length > 12 && normalizedText(comparable.address).startsWith(street)) return 1;
  if (subject.neighborhood && normalizedText(subject.neighborhood) === normalizedText(comparable.neighborhood)) return 2;
  return 3;
}

export function rentalReferenceCandidates(analysis: PropertyMarketAnalysis) {
  const area = analysis.subject.privateAreaM2 || analysis.subject.builtAreaM2 || analysis.subject.landAreaM2;
  const seen = new Set<string>();
  return analysis.comparables.filter(c => {
    const url = canonicalReferenceUrl(c.sourceUrl);
    if (!url || seen.has(url) || !/rent|alug/i.test(c.listingType) || c.quality === "discarded" || c.similarityScore < 58) return false;
    const description = decodeURIComponent(new URL(url).pathname).replace(/[-_/]/g, " ");
    if (!compatibleMarketTypes(analysis.subject.propertyType, c.propertyType, description)) return false;
    if (!analysis.subject.city || !analysis.subject.state || normalizedText(c.city) !== normalizedText(analysis.subject.city) || normalizedText(c.state) !== normalizedText(analysis.subject.state)) return false;
    if (!(area > 0) || !(c.areaM2 > 0) || c.areaM2 / area < 0.5 || c.areaM2 / area > 1.5 || !(c.askingPrice > 0) || !plausibleMonthlyRent(c.askingPrice, analysis.marketValueBase, c.areaM2)) return false;
    seen.add(url);
    return true;
  }).sort((a,b) => rentalReferenceScope(analysis,a) - rentalReferenceScope(analysis,b)
    || (a.distanceKm > 0 && b.distanceKm > 0 ? a.distanceKm - b.distanceKm : 0)
    || b.similarityScore - a.similarityScore);
}

export function selectRentalReferences(analysis: PropertyMarketAnalysis) {
  return rentalReferenceCandidates(analysis).slice(0,3).map((c,i) => ({ label: `Aluguel ${i+1}`, url: canonicalReferenceUrl(c.sourceUrl) }));
}

export function rentalEconomics(analysis: PropertyMarketAnalysis) {
  const acquisitionCost = analysis.initialBid + analysis.estimatedCosts.reduce((sum,c) => sum + c.value,0);
  return { acquisitionCost, grossAnnualYieldPct: acquisitionCost > 0 ? analysis.rentalEstimate.monthlyRent * 12 / acquisitionCost * 100 : 0 };
}
