/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests. */
const assert = require('node:assert/strict');
const { loadSource } = require('./helpers/load-source.cjs');

function memoryDb() {
  const tables = new Map();
  return { tables, rpc: async () => ({ error: null }), from(table) {
    if (!tables.has(table)) tables.set(table, []);
    let action = 'select', payload, filters = [];
    const run = () => {
      let rows = tables.get(table);
      if (action === 'insert') {
        if (rows.some(row => row.id === payload.id)) return { data: null, error: { code: '23505' } };
        rows.push({ ...payload }); return { data: { ...payload }, error: null };
      }
      rows = rows.filter(row => filters.every(filter => filter(row)));
      if (action === 'update') rows.forEach(row => Object.assign(row, payload));
      return { data: rows, error: null };
    };
    const query = {
      insert(value) { action = 'insert'; payload = value; return query; },
      update(value) { action = 'update'; payload = value; return query; },
      select() { return query; }, order() { return query; }, limit() { return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      is(key, value) { filters.push(row => row[key] === value); return query; },
      maybeSingle() { const result = run(); return Promise.resolve({ ...result, data: Array.isArray(result.data) ? result.data[0] || null : result.data }); },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return query;
  } };
}

async function main() {
  const quality = loadSource('src/lib/domain/market-quality.ts');
  assert.equal(quality.readMonthlyRent({ mainValue: 450000, rent: 2500, period: 'MONTHLY' }, 'RENTAL'), 2500);
  assert.equal(quality.readMonthlyRent({ mainValue: 899000, rent: 4650, period: 'MONTHLY' }, 'RENTAL'), 4650);
  assert.equal(quality.readMonthlyRent({ mainValue: 450000, period: 'MONTHLY' }, 'RENTAL'), 0);
  assert.equal(quality.readMonthlyRent({ rent: 2500, period: 'DAILY' }, 'RENTAL'), 0);
  assert.equal(quality.plausibleMonthlyRent(188601, 588167, 64.8), false);
  assert.equal(quality.plausibleMonthlyRent(99508, 480000, 67), false);
  assert.equal(quality.compatibleMarketTypes('Apartamento', 'Apartamento', 'Casa de 516 m2'), false);
  assert.equal(quality.cleanMarketText('{"url":"https:\\/\\/site"}'), '');
  assert.equal(quality.canonicalReferenceUrl('https://portal.com/busca/apartamentos/12345'), '');
  assert.equal(quality.canonicalReferenceUrl('https://portalzuk.com/imovel/12345'), '');
  assert.equal(quality.canonicalReferenceUrl('https://portal.com/apartamentos/londrina'), '');
  assert.equal(quality.canonicalReferenceUrl('https://portal.com/imovel/12345?utm_campaign=a#foto'), 'https://portal.com/imovel/12345');

  const state = loadSource('src/lib/communication/connection-state.ts');
  for (const value of ['connecting', 'reconnecting', 'disconnected', 'qr_pending']) assert.notEqual(state.normalizedConnectionState(value), 'connected');
  assert.equal(state.resolveConnectionRecords([{ status: 'disconnected', connected: false }, { status: 'connected' }]).connected, false);
  assert.equal(state.resolveConnectionRecords([{ connected: false }, { connected: true }]).connected, false);
  assert.equal(state.resolveConnectionRecords([{ phone: '5500000000000', profile: 'cached' }]).state, 'unknown');
  assert.equal(state.freshConnection('connected', new Date(Date.now() - 100000).toISOString()), false);
  assert.equal(state.freshConnection('disconnected', new Date().toISOString()), false);
  assert.equal(state.freshConnection('connected', new Date().toISOString()), true);
  assert.equal(state.freshConnection('connected', new Date(Date.now() + 100000).toISOString()), false);
  const connectionClient = loadSource('src/lib/communication/connectyhub-client.ts', { '@/lib/supabase/admin': {}, './system-whatsapp-sender': {} }, {}, ['mergeWhatsappAgentSummaries', 'normalizeStatusPayload']);
  assert.equal(connectionClient.normalizeStatusPayload({ status: 'disconnected', connected: false, instance: { status: 'connected' } }).connected, false);
  const newest = connectionClient.mergeWhatsappAgentSummaries([
    { agentKey: 'fixture', status: 'disconnected', updatedAt: '2026-09-14T00:00:00Z' },
    { agentKey: 'fixture', status: 'connected', updatedAt: '2026-09-01T00:00:00Z' },
  ], []);
  assert.equal(newest[0].status, 'disconnected', 'old duplicate must not replace newest instance');

  const research = loadSource('src/lib/scraper/deep-market-research.ts', {
    '@/lib/ai/config': {}, '@/lib/geckoapi/client': {}, '@/lib/google-maps/client': {}, '@/lib/brightdata/client': {}, '@/lib/apify/client': {},
  }, { fetch: () => { throw Error('Offline regression must not fetch'); } }, ['normalizeGeckoApiComparable', 'calculateRental']);
  const subject = { propertyType: 'Apartamento', areaM2: 64.8, city: 'Londrina', state: 'PR', neighborhood: '', condoName: '', address: '', bedrooms: 3, parkingSpaces: 1 };
  const listing = { url: 'https://www.vivareal.com.br/imovel/apartamento-londrina-12345678/', title: 'Apartamento em Londrina', propertyType: 'Apartamento', address: { city: 'Londrina', state: 'PR' }, prices: { mainValue: 450000, rent: 2500, period: 'MONTHLY' }, business: 'RENTAL', attributes: { usableAreas: [67], bedrooms: [3], parkingSpaces: [1] } };
  const normalized = research.normalizeGeckoApiComparable(subject, { target: 'vivareal', label: 'Viva Real' }, 'rent', listing, {});
  assert.ok(normalized);
  assert.equal(normalized.areaM2, 67);
  assert.equal(normalized.monthlyRent, 2500);
  assert.equal(normalized.bedrooms, 3);
  assert.equal(research.normalizeGeckoApiComparable(subject, { target: 'vivareal', label: 'Viva Real' }, 'sale', listing, {}), null);
  assert.equal(research.normalizeGeckoApiComparable(subject, { target: 'vivareal', label: 'Viva Real' }, 'rent', { ...listing, address: {} }, {}), null);
  assert.equal(research.calculateRental(subject, [], 588167).monthlyRent, 0);
  assert.equal(research.calculateRental(subject, [{ ...normalized, monthlyRent: 450000 }], 588167).monthlyRent, 0);

  const publication = loadSource('src/lib/domain/market-publication.ts');
  const comparable = { propertyType: 'Apartamento', city: 'Londrina', state: 'PR', areaM2: 67, askingPrice: 450000, soldPrice: 0, listingType: 'sale', quality: 'strong', similarityScore: 90 };
  const analysis = { subject: { ...subject, privateAreaM2: 64.8 }, comparables: [1,2,3].map(i => ({ ...comparable, sourceUrl: `https://portal.com/imovel/apartamento-${12340+i}` })) };
  assert.equal(publication.selectMarketReferences(analysis).length, 3);
  const creative = loadSource('src/lib/whatsapp/opportunity-publication.ts', { '@/inngest/client': {}, './group-campaigns': {}, '@/lib/communication/connectyhub-client': {}, '@/lib/communication/system-whatsapp-sender': {} }, {}, ['actionButtonForPost', 'appendSourceLinksToCaption']);
  const references = publication.selectMarketReferences(analysis);
  const buttons = creative.actionButtonForPost({ linkFormat: 'source_buttons', publicUrl: 'https://betel.example/fixture', sourceLinks: references });
  assert.equal(buttons.choices.length, 3, 'button format has exactly three source buttons');
  assert.equal(creative.actionButtonForPost({ linkFormat: 'source_links', sourceLinks: references }), undefined);
  const visibleLinks = creative.appendSourceLinksToCaption('Descricao '.repeat(400), '', references);
  for (const ref of references) assert.equal(visibleLinks.split(ref.url).length - 1, 1, 'each visible reference survives caption shortening exactly once');
  assert.equal(publication.selectMarketReferences({ ...analysis, comparables: [...analysis.comparables.slice(0,2), { ...analysis.comparables[0], sourceUrl: analysis.comparables[0].sourceUrl + '?utm_source=duplicate' }] }).length, 2);
  for (const patch of [{ city: 'Curitiba' }, { areaM2: 0 }, { propertyType: 'Casa' }, { listingType: 'rent' }, { quality: 'discarded' }]) {
    assert.equal(publication.selectMarketReferences({ ...analysis, comparables: analysis.comparables.map(c => ({ ...c, ...patch })) }).length, 0);
  }
  const publicDb = memoryDb();
  publicDb.tables.set('property_market_analyses', [{ status: 'approved', raw_payload: {}, 'auction_opportunities.code': 'fixture' }]);
  const approved = loadSource('src/lib/market/approved-publication.ts', { '@/lib/supabase/admin': { getSupabaseAdminClient: () => publicDb } });
  assert.equal(await approved.getApprovedMarketPublication('fixture'), null, 'legacy approval cannot publish without immutable version');
  const approvedSnapshot = { version: 1, analysis, opportunity: { code: 'fixture' }, references: publication.selectMarketReferences(analysis) };
  publicDb.tables.get('property_market_analyses')[0].raw_payload.approvedPublicationId = 'version-fixture';
  publicDb.tables.set('property_market_publication_versions', [{ id: 'version-fixture', opportunity_code: 'fixture', snapshot: approvedSnapshot }]);
  assert.equal((await approved.getApprovedMarketPublication('fixture')).opportunity.code, 'fixture');
  publicDb.tables.get('property_market_analyses')[0].status = 'human_review';
  assert.equal(await approved.getApprovedMarketPublication('fixture'), null, 'editing withdraws the previous public version');

  const db = memoryDb(); let sends = [], rejectButtons = true;
  const transport = { checkWhatsAppSenderConnection: async () => ({ connected: true }),
    sendWhatsAppDestinationMedia: async input => { sends.push(['media', input.trackId]); return { ok: true, externalDeliveryId: 'media-id' }; },
    sendWhatsAppDestinationText: async input => { sends.push(['buttons', input.trackId]); return rejectButtons ? { ok: false, errorMessage: 'HTTP 422 rejected' } : { ok: true, externalDeliveryId: 'button-id' }; },
  };
  const dispatcher = loadSource('src/lib/whatsapp/publication-delivery.ts', { '@/lib/supabase/admin': { getSupabaseAdminClient: () => db }, '@/lib/communication/connectyhub-client': transport });
  const deliveryInput = { campaignId: 'campaign', targetId: 'target', agentKey: 'agent', instanceId: 'instance', destinationJid: 'fixture', caption: 'Fixture', mediaUrl: 'https://image.example/image.jpg', mediaType: 'image', buttonText: 'Referencias', actionButton: { choices: analysis.comparables.map((c,i) => ({ label: `Ref ${i}`, url: c.sourceUrl })) } };
  assert.equal((await dispatcher.dispatchMarketPublication(deliveryInput)).ok, false);
  rejectButtons = false;
  assert.equal((await dispatcher.dispatchMarketPublication(deliveryInput)).ok, true);
  assert.equal(sends.filter(s => s[0] === 'media').length, 1, 'resume must not resend accepted image');
  assert.equal(sends[1][1], sends[2][1], 'button retry uses stable idempotency key');
  await dispatcher.dispatchMarketPublication(deliveryInput);
  assert.equal(sends.length, 3, 'accepted parts are never repeated');
  assert.equal((await dispatcher.dispatchMarketPublication({ ...deliveryInput, caption: 'Changed' })).ok, false);
  const uncertainInput = { ...deliveryInput, targetId: 'uncertain' };
  transport.sendWhatsAppDestinationMedia = async input => { sends.push(['media', input.trackId]); return { ok: false, errorMessage: 'HTTP 503 response lost' }; };
  await dispatcher.dispatchMarketPublication(uncertainInput);
  const count = sends.length;
  assert.equal((await dispatcher.dispatchMarketPublication(uncertainInput)).deliveryUnconfirmed, true);
  assert.equal(sends.length, count, 'uncertain receipt blocks blind retry and buttons');

  const llmDb = memoryDb(); let requests = [], responseMode = 'ok';
  const llm = loadSource('src/lib/ai/connectyhub-llm.ts', { './config': { getGeminiModel: async () => 'flash-3.5', getAIConfig: async () => 'betel-project' }, '@/lib/supabase/admin': { getSupabaseAdminClient: () => llmDb } }, {
    fetch: async (url, options) => { requests.push({ url, ...options }); if (responseMode === 'network') throw Error('response lost'); return { ok: true, headers: new Headers(), json: async () => ({ connectyhub: { request_id: 'receipt', project_id: 'betel-project', credits: 1 }, candidates: [{ finishReason: responseMode === 'limit' ? 'MAX_TOKENS' : 'STOP', content: { parts: responseMode === 'limit' ? [] : [{ text: 'OK', thoughtSignature: 'preserved' }] }, groundingMetadata: { sources: ['source'] } }] }) }; },
  });
  assert.throws(() => new llm.GoogleGenerativeAI('Google-or-WhatsApp-key'), /chy_ai_/);
  const model = new llm.GoogleGenerativeAI('chy_ai_fixture').getGenerativeModel({ model: 'ignored-legacy-model', generationConfig: { responseMimeType: 'application/json' }, tools: [{ googleSearch: {} }], systemInstruction: 'Fixture system' });
  const result = await model.generateContent([{ text: 'Fixture' }, { inlineData: { mimeType: 'image/png', data: 'fixture' } }], { idempotencyKey: 'fixture-operation' });
  assert.equal(result.response.text(), 'OK');
  assert.equal(result.response.candidates[0].content.parts[0].thoughtSignature, 'preserved');
  assert.match(requests[0].url, /^https:\/\/www\.connectyhub\.com\.br\/api\/v1beta\/models\/flash-3.5:generateContent$/);
  const body = JSON.parse(requests[0].body);
  assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'image/png');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.ok(body.tools[0].googleSearch);
  await assert.rejects(model.generateContent('duplicate', { idempotencyKey: 'fixture-operation' }), /ja registrada/);
  assert.equal(requests.length, 1, 'duplicate operation cannot charge again');
  responseMode = 'limit';
  await assert.rejects(model.generateContent('limit fixture', { idempotencyKey: 'fixture-limit-operation' }), /MAX_TOKENS.*Consumo confirmado/);
  const incompleteReceipt = llmDb.tables.get('llm_operation_receipts').find(row => row.id === 'fixture-limit-operation');
  assert.equal(incompleteReceipt.status, 'completed', 'provider settlement and output readiness are separate');
  assert.equal(incompleteReceipt.result_status, 'unusable');
  assert.equal(requests.length, 2, 'incomplete output must not auto-retry');
  assert.match(llm.generationResultIssue({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'Partial text' }] } }] }), /incompleta/);
  responseMode = 'network';
  await assert.rejects(model.generateContent('network fixture', { idempotencyKey: 'fixture-network-operation' }), /response lost/);
  assert.equal(llmDb.tables.get('llm_operation_receipts').find(row => row.id === 'fixture-network-operation').status, 'uncertain');
  await assert.rejects(model.generateContent('network fixture', { idempotencyKey: 'fixture-network-operation' }), /ja registrada/);
  assert.equal(requests.length, 3);
  console.log('Publication, connection, transport and ConnectyHub LLM regressions passed (offline).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
