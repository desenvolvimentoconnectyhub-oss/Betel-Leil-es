/* eslint-disable @typescript-eslint/no-require-imports -- Offline server rendering contract. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const cache = new Map();
const forbidden = () => { throw Error('Operational calls are forbidden in layout tests'); };
const mocks = {
  'server-only': {},
  'next/navigation': { useRouter: () => ({ refresh: forbidden }) },
  'next/link': { __esModule: true, default: ({ children, href, scroll, ...props }) => { void scroll; return React.createElement('a', { ...props, href }, children); } },
  'react-dom': { ...require('react-dom'), useFormStatus: () => ({ pending: false, data: null }) },
  '@/app/admin/oportunidades/actions': { savePropertyMarketAnalysisAction: forbidden, savePropertyQualificationFeedbackAction: forbidden, syncOpportunityWhatsAppGroupsAction: forbidden },
  '@/lib/whatsapp/opportunity-publication': { getOpportunityWhatsAppReferenceStatus: () => ({ ready: false, requiredCount: 3, validCount: 0, reason: 'Fixture' }) },
};
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const localRequire = name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return {};
    if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
    const base = name.startsWith('@/') ? path.join('src', name.slice(2)) : path.resolve(path.dirname(file), name);
    const resolved = [base + '.tsx', base + '.ts'].find(fs.existsSync);
    if (!resolved) throw Error('Missing test module ' + base);
    return load(resolved);
  };
  vm.runInNewContext(code, { exports, module: { exports }, require: localRequire, console, process, Buffer, URL, URLSearchParams, TextDecoder, fetch: forbidden, setTimeout, clearTimeout }, { filename: file });
  return exports;
}
const opportunity = {
  id: 'LAYOUT-FIXTURE', title: 'Apartamento de teste', propertyType: 'apartamento', address: 'Endereço de teste', city: 'Cidade', state: 'SC', sourceName: 'Fixture', sourceType: 'manual', initialBid: 100000, appraisalValue: 200000, discountPct: 50, opportunityScore: 50, riskScore: 90, complianceScore: 20, aiStatus: 'review', legalStatus: 'pendente', stage: 'Revisao', nextAction: 'Conferir documentos', owner: 'Fixture', auctionDate: '', occupancy: 'Ocupado', summary: 'Resumo completo do imóvel', financialSummary: [], riskFlags: [], checklist: [], documents: [], timeline: [], images: [],
};
const analysis = {
  id: 'analysis-fixture', opportunityCode: opportunity.id, opportunityId: opportunity.id, analysisCode: 'FIXTURE', status: 'approved_with_notes', analystName: 'Fixture', paymentCondition: '', subject: { propertyType: 'apartamento', address: opportunity.address, city: 'Cidade', state: 'SC', privateAreaM2: 50, landAreaM2: 0, builtAreaM2: 50, bedrooms: 0, parkingSpaces: 0, notes: '' }, marketValueLow: 180000, marketValueBase: 200000, marketValueHigh: 220000, marketPricePerM2: 4000, initialBid: 100000, initialBidPricePerM2: 2000, realDiscountPct: 50, estimatedCosts: [], estimatedNetMargin: 0, rentalEstimate: { monthlyRent: 0, referenceUrl: '', referenceFound: false, valueKnown: false, monthlyYieldOnMarketPct: 0, annualYieldOnMarketPct: 0, monthlyYieldOnBidPct: 0, annualYieldOnBidPct: 0, notes: '' }, paymentSimulation: { paymentMode: 'a_vista', downPaymentPct: 0, downPaymentAmount: 0, installmentBalance: 0, installmentCount: 0, installmentAmount: 0, correctionRule: '', correctionWarning: '' }, suggestedCeilingBid: 0, ceilingTargets: [], scenarios: [], liquidityScore: 0, confidenceScore: 0, legalSignal: 'Documentação pendente', decision: 'review', decisionLabel: 'Revisar', decisionReason: 'Conferir documentação', summary: 'Resumo da análise preservado', cautionNotes: 'Imóvel ocupado', comparables: [], sourceLinks: [], rawPayload: {}, updatedAt: '2026-09-14T12:00:00Z',
};
const { OpportunityDetailCenter } = load('src/components/admin/opportunity-detail/OpportunityDetailCenter.tsx');
const render = props => renderToStaticMarkup(React.createElement(OpportunityDetailCenter, props));
for (const activeTab of ['visao-geral', 'mercado', 'revisao', 'documentos']) {
  const html = render({ opportunity, analysis, activeTab });
  for (const name of ['opportunityCode', 'analystName', 'marketValueBase', 'liquidityScore', 'confidenceScore', 'summary', 'monthlyRent', 'status', 'whatsappLinkFormat']) {
    assert.equal((html.match(new RegExp('name="' + name + '"', 'g')) || []).length, 1, `${activeTab}: one authoritative ${name}`);
  }
  assert.match(html, /name="liquidityScore"[^>]*value="0"/);
  assert.match(html, /name="confidenceScore"[^>]*value="0"/);
  assert.match(html, /name="whatsappLinkFormat"[^>]*value="source_buttons"/);
  assert.match(html, /Revisão humana:.*?Aprovada com ressalvas/);
  assert.match(html, /Recomendação da análise/);
  assert.match(html, /Salvar revisão/);
  for (const label of ['Aprovar sem enviar', 'Aprovar com ressalvas sem envio', 'Reprovar', 'Aprovar e enviar']) assert.ok(html.includes(label));
  assert.ok(!html.includes('Criar dossie'), 'no inert dossier button');
  assert.ok(!html.includes('Mais acoes'), 'decisions are visible instead of hidden in a menu');
  assert.equal((html.match(/role="tabpanel"/g) || []).length, 8, 'all panels stay mounted for draft preservation');
  const formStart = html.indexOf('<form');
  const dialogStart = html.indexOf('<dialog');
  assert.ok(formStart >= 0 && dialogStart > formStart && html.indexOf('</dialog>') < html.lastIndexOf('</form>'), 'send controls retain native form ownership');
}
const empty = render({ opportunity, analysis: null });
assert.match(empty, /Sem foto real/);
assert.match(empty, /disabled=""[^>]*title="A análise precisa existir antes de preparar o envio"/);
const { OpportunityMessagePhone } = load('src/components/admin/opportunity-detail/OpportunityMessagePhone.tsx');
const approved = { version: 1, opportunity, analysis: { ...analysis, legalSignal: 'Parecer aprovado preservado', rentalEstimate: { ...analysis.rentalEstimate, monthlyRent: 1700 } }, references: [1,2,3].map(i=>({label:`Aluguel ${i}`,url:`https://example.com/imovel/${12340+i}`})) };
const phoneProps = { preview: { opportunity, analysis, approved, publicUrl: 'https://betel.example/fixture' }, sender: 'Remetente simulado', destination: 'Destino simulado', open: true, format: 'source_buttons', test: true };
const testPhone = renderToStaticMarkup(React.createElement(OpportunityMessagePhone, phoneProps));
assert.match(testPhone,/Parecer aprovado preservado/,'test preview uses the approved immutable snapshot');
assert.doesNotMatch(testPhone,/Documentação pendente/,'test preview does not substitute current draft for approved content');
assert.ok(!testPhone.includes('href='),'simulated reference links are inert');
assert.ok(!testPhone.includes('type="submit"'),'preview cannot submit approval or send');
const reviewPhone = renderToStaticMarkup(React.createElement(OpportunityMessagePhone, {...phoneProps,test:false}));
assert.match(reviewPhone,/Documentação pendente/,'approval preview uses current review');
assert.doesNotMatch(reviewPhone,/Parecer aprovado preservado/);
console.log('PASS layout: one form field set across eight mounted panels; zero scores preserved; independent review/recommendation; dialog form ownership; empty state. No network or operations.');
