/* eslint-disable @typescript-eslint/no-require-imports -- Offline action contract. */
const assert = require('node:assert/strict');
const { loadSource } = require('./helpers/load-source.cjs');
const calls = [];
let sendFails = false;
const actions = loadSource('src/app/admin/oportunidades/actions.ts', {
  'next/cache': { revalidatePath() {} },
  'next/navigation': { redirect(url) { throw new Error('REDIRECT ' + url); } },
  '@/lib/auth/admin': { requireCurrentAdmin: async () => ({ id: 'fixture', name: 'Fixture' }) },
  '@/lib/admin/repository': {
    getOpenOpportunityWorkflowTaskForAdminRecord: async () => ({ data: { stageKey: 'market_review' } }),
    adminCanApproveWorkflowStage: async () => true,
    savePropertyMarketAnalysisRecord: async input => { calls.push('save:' + input.status); return { data: { id: 'fixture' } }; },
    advanceOpportunityAfterMarketApprovalRecord: async () => { calls.push('advance'); return { ok: true }; },
  },
  '@/lib/scraper': {},
  '@/lib/whatsapp/group-campaigns': {},
  '@/lib/whatsapp/opportunity-publication': {
    scheduleOpportunityWhatsAppPublication: async () => { calls.push('send'); return sendFails ? { ok: false, error: 'Destino indisponível' } : { ok: true, data: { campaignId: 'fixture' } }; },
  },
}, { URLSearchParams, fetch: () => { throw Error('Network forbidden'); } });
async function run(status, notes = '', previous = 'human_review') {
  calls.length = 0;
  const form = new FormData();
  for (const [key, value] of Object.entries({ opportunityCode: 'FIXTURE', marketValueBase: '200000', status: previous, submitStatus: status, cautionNotes: notes })) form.set(key, value);
  try { await actions.savePropertyMarketAnalysisAction(form); throw Error('Expected redirect'); }
  catch (error) { assert.match(error.message, /^REDIRECT /); return decodeURIComponent(error.message.replaceAll('+', ' ')); }
}
(async () => {
  assert.match(await run('approved_with_notes'), /Descreva as ressalvas/);
  assert.deepEqual(calls, [], 'missing notes cannot save, approve or send');
  await run('approved_with_notes', 'Ocupação exige acompanhamento');
  assert.deepEqual(calls, ['save:approved_with_notes', 'advance']);
  await run('approved');
  assert.deepEqual(calls, ['save:approved', 'advance'], 'approval without sending stays separate');
  await run('rejected');
  assert.deepEqual(calls, ['save:rejected']);
  await run('approve_send_specific_group');
  assert.deepEqual(calls, ['save:approved', 'advance', 'send'], 'one final action approves then requests sending');
  sendFails = true;
  assert.match(await run('approve_send_specific_group'), /Análise aprovada, mas o envio não foi concluído/);
  assert.deepEqual(calls, ['save:approved', 'advance', 'send']);
  assert.match(await run('approve_send_test_number'), /teste tambem exige revisao humana/);
  assert.deepEqual(calls, ['save:human_review'], 'test cannot bypass existing approval guard');
  console.log('PASS decision contract: required notes; approval/rejection without send; one final approve/send action; distinct send failure; test guard. All operations mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
