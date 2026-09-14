/* eslint-disable @typescript-eslint/no-require-imports -- Offline public contract harness. */
const assert=require('node:assert/strict');const {loadSource}=require('./helpers/load-source.cjs');
const generationId='11111111-1111-4111-8111-111111111111';
const config={apiKey:{value:'ch_voice_'+'a'.repeat(64)},projectId:{value:'project'},billingOrganizationId:{value:'organization'},willianVoiceId:{value:'voice'},defaultVoiceId:{value:''},defaultModelId:{value:'eleven_multilingual_v2'}};
let receipt,calls=[],mode='completed',leaseValid=true;
const transport=loadSource('src/lib/voice/transport.ts');
const client=loadSource('src/lib/voice/connectyhub.ts',{
 './config':{getConnectyHubVoiceConfig:async()=>config},
 './receipts':{voiceOperationId:()=> 'stable-included-preview-id',claimVoiceOperation:async()=>receipt||{status:'requested',generation_id:null,charged_credits:null},recordVoiceReceipt:async(_,patch)=>{if(receipt?.status!=='completed'||patch.status==='completed')receipt=patch;}},
 '@/lib/whatsapp/lead-reset':{assertLeadWorkActive:async()=>{if(!leaseValid)throw Error('lease expired');}},
 './transport':{ConnectyHubVoiceError:transport.ConnectyHubVoiceError,fetchConnectyHubVoice:async(path,options={})=>{
  calls.push({path,options});
  if(path==='/models')return Response.json({project_id:'project',billing_organization_id:mode==='wrong-billing-catalog'?'other-org':'organization',models:[{model_id:'eleven_multilingual_v2',name:'Multilingual',available:true}]});
  if(mode==='timeout')throw new transport.ConnectyHubVoiceError('uncertain','connection_uncertain',503);
  if(path.endsWith('/audio'))return new Response(mode==='bad-audio'?'not audio':new Uint8Array([73,68,51,4]),{headers:{'content-type':mode==='bad-audio'?'text/html':'audio/mpeg'}});
  return Response.json({id:generationId,project_id:mode==='wrong-project'?'other-project':'project',billing_organization_id:'organization',operation:mode==='included'?'voice_clone_preview':'text_to_speech',voice_id:'voice',model_id:'eleven_multilingual_v2',status:['processing','failed'].includes(mode)?mode:'completed',usage:{credits:['processing','included'].includes(mode)?0:5},audio:{content_type:'audio/mpeg',bytes:4}});
 }},
});
const input={operationId:'same-operation-id',voiceId:'voice',modelId:'eleven_multilingual_v2',text:'Uma frase de teste.'};
(async()=>{
 const first=await client.synthesizeConnectyHubVoice(input);assert.equal(first.chargedCredits,5);assert.equal(calls.length,3);assert.equal(calls[1].options.operationId,input.operationId);
 await client.synthesizeConnectyHubVoice(input);assert.equal(calls[3].path,`/generations/${generationId}`);assert.ok(!calls[3].options.body,'Completed replay is read-only');
 mode='bad-audio';await assert.rejects(()=>client.synthesizeConnectyHubVoice(input),/arquivo invalido/);assert.equal(receipt.status,'completed');assert.equal(receipt.charged_credits,5);
 receipt=null;calls=[];mode='processing';await assert.rejects(()=>client.synthesizeConnectyHubVoice(input),/processing/);assert.equal(calls.length,2);assert.equal(receipt.generation_id,generationId);
 receipt=null;mode='failed';await assert.rejects(()=>client.synthesizeConnectyHubVoice(input),/failed/);assert.equal(receipt.status,'failed','Terminal failure is not relabeled uncertain');
 receipt=null;mode='wrong-project';calls=[];await assert.rejects(()=>client.synthesizeConnectyHubVoice(input),/divergente/);assert.equal(calls.length,2,'Never download another project audio');
 receipt=null;mode='wrong-billing-catalog';calls=[];await assert.rejects(()=>client.synthesizeConnectyHubVoice(input),/conta pagadora/);assert.equal(calls.length,1);assert.equal(calls[0].path,'/models','Another payer is blocked before generation');
 receipt=null;mode='timeout';calls=[];await assert.rejects(()=>client.synthesizeConnectyHubVoice(input));assert.equal(calls.length,2,'Timeout never retries automatically');
 mode='completed';await client.synthesizeConnectyHubVoice(input);assert.equal(calls[3].options.operationId,input.operationId,'Explicit retry preserves key after timeout without ID');
 leaseValid=false;calls=[];await assert.rejects(()=>client.synthesizeConnectyHubVoice(input),/lease expired/);assert.equal(calls.length,0,'Reset work fence checked before synthesis');
 receipt=null;mode='included';calls=[];const included=await client.previewConnectyHubClone('voice');assert.equal(included.chargedCredits,0);assert.equal(calls[1].path,'/voices/voice/preview');
 await client.previewConnectyHubClone('voice');assert.equal(calls.filter(call=>call.path==='/voices/voice/preview').length,1,'Included clone preview is recovered without a second creation or debit');
 console.log('Voice generation, receipt recovery, timeout idempotency, project guard, pending/failed states, invalid audio and reset lease passed (offline).');
})().catch(error=>{console.error(error);process.exitCode=1;});
