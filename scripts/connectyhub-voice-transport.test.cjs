/* eslint-disable @typescript-eslint/no-require-imports -- Offline transport harness. */
const assert=require('node:assert/strict');const{loadSource}=require('./helpers/load-source.cjs');
let config={apiKey:{value:'ch_voice_'+'1'.repeat(64)},projectId:{value:'project'},billingOrganizationId:{value:'organization'}},calls=[],mode='ok';
const transport=loadSource('src/lib/voice/transport.ts',{'./config':{CONNECTYHUB_VOICE_ORIGIN:'https://www.connectyhub.com.br',getConnectyHubVoiceConfig:async()=>config}},{fetch:async(url,options)=>{calls.push({url,options});if(mode==='timeout')throw Error('timeout');if(mode==='balance')return Response.json({error:{code:'voice_insufficient_credits'}},{status:402});return Response.json({models:[]});}});
(async()=>{
 await transport.fetchConnectyHubVoice('/models');assert.equal(calls[0].url,'https://www.connectyhub.com.br/api/v1/voice/models');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.headers.Authorization,`Bearer ${config.apiKey.value}`);
 for(const path of ['https://api.elevenlabs.io','/../panel/voices','/generations/../../secret','/voices?api_key=secret'])await assert.rejects(()=>transport.fetchConnectyHubVoice(path),/invalido/);
 await assert.rejects(()=>transport.fetchConnectyHubVoice('/generations',{body:'{}'}),/identificador/);
 assert.equal(calls.length,1,'Invalid paths and missing idempotency never reach network');
 mode='timeout';await assert.rejects(()=>transport.fetchConnectyHubVoice('/generations',{body:'{}',operationId:'stable-operation'}),e=>e.code==='connection_uncertain');assert.equal(calls.length,2,'Exactly one dispatch on timeout');
 mode='balance';await assert.rejects(()=>transport.fetchConnectyHubVoice('/models'),e=>e.status===402&&e.code==='voice_insufficient_credits');
 config={...config,apiKey:{value:'ch_live_whatsapp_key'}};const before=calls.length;await assert.rejects(()=>transport.fetchConnectyHubVoice('/models'),e=>e.code==='voice_key_missing');assert.equal(calls.length,before);
 console.log('Public Voice origin, dedicated authentication, private path rejection, idempotency and no automatic timeout retry passed (offline).');
})().catch(error=>{console.error(error);process.exitCode=1;});
