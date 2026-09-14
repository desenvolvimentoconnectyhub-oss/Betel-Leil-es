/* eslint-disable @typescript-eslint/no-require-imports -- Offline source regression harness. */
const assert = require('node:assert/strict');
const { loadSource } = require('./helpers/load-source.cjs');

async function main() {
  const observations = [];
  const lifecycle = loadSource('src/lib/communication/instance-lifecycle.ts', { '@/lib/supabase/admin': {} });
  const { ConnectyHubRequestError: RemoteError, isMissingInstanceError } = lifecycle;
  for (const status of [402,403,408,429,500]) assert.equal(isMissingInstanceError(new RemoteError('failure',status,'instance_not_found')),false);
  assert.equal(isMissingInstanceError(new RemoteError('proxy',404,'')),false);
  assert.equal(isMissingInstanceError(new RemoteError('token',401,'provider_invalid_token')),false);
  for (const status of [404,410]) assert.equal(isMissingInstanceError(new RemoteError('missing',status,'instance_not_found')),true);
  const configs = [{ key:'CONNECTYHUB_API_TOKEN',value:'ch_live_offline_fixture_token_only' },{ key:'CONNECTYHUB_API_URL',value:'https://fixture.invalid/api/v1' }];
  const db = { from: () => ({ select: () => ({ in: async () => ({ data: configs }) }) }) };
  let response = {}, fail = false, archived = false;
  const requests = [];
  const client = loadSource('src/lib/communication/connectyhub-client.ts', {
    '@/lib/supabase/admin': { getSupabaseAdminClient: () => db }, './system-whatsapp-sender': {},
    './instance-lifecycle': { ...lifecycle, locallyArchivedInstance: async () => archived, observeInstance: async input => { observations.push(input); return { archived, observed:1 }; } },
  }, { fetch: async (url,options) => { requests.push({ url,options }); if(fail) throw Error('timeout'); return new Response(JSON.stringify(response.body), { status: response.status || 200 }); } }, ['connectyhubRequest','buildConnectBody','configFrom','resolveConnectyHubInstanceId','findConfiguredWillianInstanceId','persistConnectyHubInstance']);
  const body = client.buildConnectBody({});
  assert.equal(body.systemName,'ConnectyHub');
  assert.equal(body.browser,'auto');
  await client.connectyhubRequest('/instances/fixture/connect',{ body });
  assert.equal(JSON.parse(requests.at(-1).options.body).systemName,'ConnectyHub','actual connect transport carries new label');
  assert.equal(observations.length,0,'pairing is not a status observation');
  response = { body: { instance:{id:'fixture',status:'connected',provider:{status:{connected:true,loggedIn:true}}} } };
  await client.connectyhubRequest('/instances/fixture/status');
  assert.equal(observations.at(-1).observation,'connected');
  response.body.instance.status = 'disconnected';
  await client.connectyhubRequest('/instances/fixture/status',{dailyCleanup:true});
  assert.equal(observations.at(-1).observation,'connected','live connected provider cannot be archived because of stored disconnected summary');
  response.body.instance.status = 'qr_pending';
  response.body.instance.provider.status = { connected:false,loggedIn:false };
  await client.connectyhubRequest('/instances/fixture/status');
  assert.equal(observations.at(-1).observation,'unknown','QR cannot be expired as disconnected');
  response.body.instance.status = 'disconnected';
  await client.connectyhubRequest('/instances/fixture/status',{ dailyCleanup:true });
  assert.equal(observations.at(-1).observation,'disconnected');
  assert.equal(observations.at(-1).dailyCleanup,true);
  for (const status of [402,403,404,410,500]) {
    response = { status,body:{error:{code:'instance_not_found',message:'fixture'}} };
    await assert.rejects(()=>client.connectyhubRequest('/instances/fixture/status'));
    assert.equal(observations.at(-1).observation,[404,410].includes(status)?'missing':'unknown');
  }
  fail = true;
  await assert.rejects(()=>client.connectyhubRequest('/instances/fixture/status'));
  assert.equal(observations.at(-1).observation,'unknown');
  fail = false;
  response = { body:{instance:{id:'different-instance',status:'disconnected'}} };
  await assert.rejects(()=>client.connectyhubRequest('/instances/fixture/status'));
  assert.equal(observations.at(-1).observation,'unknown','wrong identity must not archive');
  response = { body:{instance:{id:'fixture',status:'connected'}} };
  archived = true;
  await assert.rejects(()=>client.connectyhubRequest('/instances/fixture/status'), /arquivada/);
  assert.equal(await client.resolveConnectyHubInstanceId({instanceId:'fixture'}),'','archived identity is not a valid sender');
  assert.equal(await client.findConfiguredWillianInstanceId({instanceId:'fixture'}),'','pairing cannot reuse archived identity');
  await assert.rejects(()=>client.persistConnectyHubInstance({instanceId:'fixture',instanceName:'fixture'}),/arquivada/);
  const requestsBeforeCleared = requests.length;
  assert.equal(await client.resolveConnectyHubInstanceId({instanceId:'',instanceBindingCleared:true}),'');
  assert.equal(requests.length,requestsBeforeCleared,'cleared binding cannot search for another instance automatically');
  assert.equal(client.configFrom(['FIXTURE'],new Map([['FIXTURE','']]),'fallback',true).value,'','cleared pointer does not resurrect via env/default');
  assert.equal(client.configFrom(['FIXTURE'],new Map([['FIXTURE','']]),'fallback').value,'fallback','empty credentials still use configured environment/default');
  console.log('WhatsApp label, identity, missing/access, QR and lifecycle transport regressions passed (offline).');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
