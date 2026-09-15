import { buildCeilingTargets, calculateMarketDiscount, calculatePricePerM2, type PropertyMarketAnalysis, type PropertyMarketComparable } from '../admin/market-analysis';
import { field, numberField } from './market-form-fields';
import { reviewPaymentSimulation } from './review-payment';

/** Read-only projection of fields that affect the outgoing message. No approval or URL verification. */
export function projectMessageReview(analysis: PropertyMarketAnalysis, data: FormData, initialBid: number) {
  const text = (name: string, fallback = '') => data.has(name) ? field(data, name, fallback) : fallback;
  const number = (name: string, fallback = 0) => data.has(name) ? numberField(data, name) : fallback;
  const marketValueBase = number('marketValueBase', analysis.marketValueBase);
  const payment = analysis.paymentSimulation;
  const next: PropertyMarketAnalysis = {
    ...analysis, initialBid, marketValueBase,
    realDiscountPct: calculateMarketDiscount(initialBid, marketValueBase),
    ceilingTargets: buildCeilingTargets(marketValueBase),
    subject: { ...analysis.subject,
      privateAreaM2: number('privateAreaM2', analysis.subject.privateAreaM2),
      builtAreaM2: number('builtAreaM2', analysis.subject.builtAreaM2),
      landAreaM2: number('landAreaM2', analysis.subject.landAreaM2),
    },
    rentalEstimate: { ...analysis.rentalEstimate, monthlyRent: number('monthlyRent', analysis.rentalEstimate.monthlyRent) },
    paymentSimulation: reviewPaymentSimulation({ ...payment,
      paymentMode: data.has('paymentMode') ? field(data, 'paymentMode', 'a_vista') : payment.paymentMode,
      downPaymentPct: number('downPaymentPct', payment.downPaymentPct),
      downPaymentAmount: number('downPaymentAmount', payment.downPaymentAmount),
      installmentBalance: number('installmentBalance', payment.installmentBalance),
      installmentCount: number('installmentCount', payment.installmentCount),
      installmentAmount: number('installmentAmount', payment.installmentAmount),
      correctionRule: text('installmentCorrectionRule', payment.correctionRule),
      correctionWarning: text('installmentCorrectionWarning', payment.correctionWarning),
    }, initialBid),
    legalSignal: data.has('legalSignal') ? field(data, 'legalSignal', 'Validar juridico antes de liberar comunicacao ou lance.') : analysis.legalSignal,
    decision: data.has('decision') ? field(data, 'decision', 'review') as PropertyMarketAnalysis['decision'] : analysis.decision,
  };
  // The save action preserves existing source priority and appends newly entered sources.
  next.sourceLinks = [...analysis.sourceLinks, ...[
    { label: 'Fonte do leilao', url: text('auctionUrl') },
    { label: 'Referencia', url: text('referenceUrl') },
    { label: 'Referencia aluguel', url: text('rentReferenceUrl') },
  ].filter(link => link.url)];
  if (text('comparableSourceUrl') || number('comparableAskingPrice') || text('comparableNotes')) {
    const area = number('comparableAreaM2'), price = number('comparableSoldPrice') || number('comparableAskingPrice');
    const comparable: PropertyMarketComparable = {
      id: 'unsaved-review', sourceLabel: text('comparableSourceLabel', 'Comparavel manual'),
      sourceUrl: text('comparableSourceUrl'), listingType: text('comparableListingType', 'Oferta'),
      propertyType: text('comparablePropertyType', 'Imovel'), address: text('comparableAddress'),
      neighborhood: text('comparableNeighborhood'), city: text('comparableCity', analysis.subject.city),
      state: text('comparableState', analysis.subject.state).toUpperCase(), areaM2: area,
      askingPrice: number('comparableAskingPrice'), soldPrice: number('comparableSoldPrice'),
      pricePerM2: calculatePricePerM2(price, area), distanceKm: number('comparableDistanceKm'),
      similarityScore: Math.min(100, Math.max(0, number('comparableSimilarityScore', 60))),
      quality: text('comparableQuality', 'medium') as PropertyMarketComparable['quality'],
      notes: text('comparableNotes'), collectedAt: '',
    };
    next.comparables = [...analysis.comparables, comparable];
  }
  return next;
}
