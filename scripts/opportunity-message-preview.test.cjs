/* eslint-disable @typescript-eslint/no-require-imports -- Offline publication contract. */
const assert = require('node:assert/strict');
const { loadSource } = require('./helpers/load-source.cjs');
const { formatOpportunityWhatsAppMessage: format } = loadSource('src/lib/domain/opportunity-whatsapp-message.ts');
const { projectMessageReview } = loadSource('src/lib/domain/opportunity-message-review.ts');
const { whatsappPublicationParts: parts } = loadSource('src/lib/domain/whatsapp-publication-parts.ts');
const { selectRentalReferences } = loadSource('src/lib/domain/rental-references.ts');
const opportunity = { id: 'PREVIEW-FIXTURE', title: 'Apartamento de teste', propertyType: 'Apartamento', city: 'Cidade', state: 'SC', initialBid: 100000, appraisalValue: 200000, discountPct: 50, auctionDate: '2026-09-21', images: [{ url: 'https://images.example/fixture.jpg', status: 'mirrored' }] };
const analysis = {
  subject: { propertyType: 'Apartamento', city: 'Cidade', state: 'SC', address: 'Rua Exemplo', privateAreaM2: 50, builtAreaM2: 0, landAreaM2: 0 },
  marketValueBase: 200000, initialBid: 100000, realDiscountPct: 50, ceilingTargets: [], legalSignal: 'Validar documentação', decision: 'review',
  rentalEstimate: { monthlyRent: 1000 }, paymentSimulation: { paymentMode: 'a_vista', downPaymentPct: 0, downPaymentAmount: 0, installmentBalance: 0, installmentCount: 0, installmentAmount: 0, correctionRule: '', correctionWarning: '' },
  sourceLinks: [{ label: 'Fonte do leilao', url: 'https://auction.example/imovel/12345' }], rawPayload: {},
  comparables: [1000,1100,1200].map((price, i) => ({ sourceUrl: `https://rent.example/imovel/apartamento-${12340+i}`, propertyType: 'Apartamento', city: 'Cidade', state: 'SC', areaM2: 50, askingPrice: price, listingType: 'rent', quality: 'strong', similarityScore: 90-i })),
};
const original = JSON.stringify(analysis);
const data = new FormData();
Object.entries({ marketValueBase: 'R$ 250.000,00', monthlyRent: '1.150,00', privateAreaM2: '55,5', legalSignal: 'Parecer revisado', decision: 'good', paymentMode: 'parcelado', downPaymentPct: '25', installmentCount: '30' }).forEach(([key, value]) => data.set(key,value));
const review = projectMessageReview(analysis,data,opportunity.initialBid);
assert.equal(JSON.stringify(analysis), original, 'preview never mutates the saved analysis');
assert.equal(review.marketValueBase,250000);
assert.equal(review.realDiscountPct,60);
assert.equal(review.ceilingTargets[0].value,175000);
assert.equal(review.paymentSimulation.downPaymentAmount,25000);
assert.equal(review.paymentSimulation.installmentAmount,2500);
const references = selectRentalReferences(review);
assert.equal(references.length,3);
const buttons = format(opportunity,review,references,'https://betel.example/opportunity','source_buttons');
for (const expected of [/250\.000,00/, /1\.150,00/, /55,5 m²/, /Parecer revisado/, /Boa oportunidade/, /30x: R\$\s2\.500,00/]) assert.match(buttons.caption,expected);
assert.doesNotMatch(buttons.caption,/https?:\/\//);
assert.equal(buttons.buttonText,'🏠 Quanto este imóvel pode render em aluguel? Estes três anúncios de imóveis comparáveis ajudam a estimar essa renda e avaliar a oportunidade.');
const buttonParts = parts({...buttons,mediaUrl:buttons.imageUrl});
assert.equal(buttonParts.map(p=>p.kind).join(','),'media,text,buttons');
assert.equal(buttonParts[0].text,buttons.caption);
assert.equal(buttonParts[1].text,'Link do leilão');
assert.equal(buttonParts[1].actionButton.choices[0].label,'Ver leilão');
assert.equal(buttonParts[2].text,buttons.buttonText);
assert.equal(buttonParts[2].actionButton.choices.map(c=>c.label).join(','),'Aluguel 1,Aluguel 2,Aluguel 3');
const links = format(opportunity,review,references,'https://betel.example/opportunity','source_links');
assert.equal(links.actionButton,undefined);assert.equal(links.auctionActionButton,undefined);
for(const reference of [...references,{url:links.auctionUrl}]) assert.equal(links.caption.split(reference.url).length-1,1);
assert.equal(parts({...links,mediaUrl:links.imageUrl}).length,1);
const noMedia = parts({...buttons,mediaUrl:''});
assert.equal(noMedia.length,2);
assert.equal(noMedia[0].text,buttons.caption+'\n\nLink do leilão');
assert.equal(noMedia[1].text,buttons.buttonText);
assert.equal(parts({...links,mediaUrl:''})[0].text,links.caption);
console.log('PASS message preview: full shared caption, both formats, part order, absent media, edited review, financial/payment projection and no mutation. Offline.');
