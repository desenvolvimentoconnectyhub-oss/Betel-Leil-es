/* eslint-disable @typescript-eslint/no-require-imports -- Offline admin API harness. */
const assert=require('node:assert/strict');const{loadSource}=require('./helpers/load-source.cjs');const{NextRequest,NextResponse}=require('next/server');
let authorized=false,saved=[],generated=[];
const route=loadSource('src/app/api/admin/whatsapp/agent-voice/route.ts',{
 '@/lib/auth/admin-api':{requireAdminApi:async()=>authorized?{admin:{id:'owner'},response:null}:{admin:null,response:NextResponse.json({error:'unauthorized'},{status:401})}},
 '@/lib/voice/clones':{createConnectyHubVoiceClone:async()=>{throw Error('Cloning not exercised in JSON test');}},
 '@/lib/voice/config':{getConnectyHubVoiceConfig:async()=>({apiKey:{value:'SERVER_SECRET'},defaultModelId:{value:'model'},defaultVoiceId:{value:''},willianVoiceId:{value:'known-voice'}}),saveConnectyHubVoiceSelection:async id=>saved.push(id)},
 '@/lib/voice/connectyhub':{listConnectyHubVoices:async()=>[{voiceId:'known-voice'}],listConnectyHubVoiceModels:async()=>[{modelId:'model',available:true}],synthesizeConnectyHubVoice:async input=>{generated.push(input);return{audioBase64:'SUQzBA==',chargedCredits:5};}},
});
const post=body=>route.POST(new NextRequest('https://betel.invalid/api/admin/whatsapp/agent-voice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
(async()=>{
 assert.equal((await route.GET()).status,401);assert.equal((await post({action:'synthesize_preview'})).status,401);assert.equal(generated.length,0);
 authorized=true;const catalog=await(await route.GET()).json();assert.equal(catalog.success,true);assert.equal(catalog.models.length,1);assert.ok(!JSON.stringify(catalog).includes('SERVER_SECRET'));
 assert.equal((await post({action:'select_willian_voice',voiceId:'outside-catalog'})).status,404);assert.equal(saved.length,0);
 assert.equal((await post({action:'select_willian_voice',voiceId:'known-voice'})).status,200);assert.deepEqual(saved,['known-voice']);
 assert.equal((await post({action:'synthesize_preview',voiceId:'known-voice'})).status,400);assert.equal(generated.length,0);
 assert.equal((await post({action:'synthesize_preview',voiceId:'known-voice',operationId:'stable-preview-id',text:'Teste autorizado.'})).status,200);assert.equal(generated.length,1);assert.equal(generated[0].operationId,'stable-preview-id');
 console.log('Voice admin authentication, secret redaction, catalog selection and mandatory preview operation passed (offline).');
})().catch(error=>{console.error(error);process.exitCode=1;});
