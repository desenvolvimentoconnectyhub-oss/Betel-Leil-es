/* eslint-disable @typescript-eslint/no-require-imports -- Offline clone billing harness. */
const assert=require('node:assert/strict');const{loadSource}=require('./helpers/load-source.cjs');const{File}=require('node:buffer');
const id='22222222-2222-4222-8222-222222222222';const config={projectId:{value:'project'},billingOrganizationId:{value:'org'}};
let calls=[],saved=null,selected=[],mode='ready';
const {ConnectyHubVoiceError}=loadSource('src/lib/voice/transport.ts');
const api=loadSource('src/lib/voice/clones.ts',{
 './config':{getConnectyHubVoiceConfig:async()=>config,saveConnectyHubVoiceSelection:async voice=>selected.push(voice)},
 './connectyhub':{listConnectyHubVoiceModels:async()=>{calls.push('identity');}},
 './receipts':{claimVoiceOperation:async()=>saved||{generation_id:null,charged_credits:null,status:'requested'},recordVoiceReceipt:async(_,patch)=>saved=patch},
 './transport':{ConnectyHubVoiceError,fetchConnectyHubVoice:async(path,options)=>{
   calls.push(path);assert.equal(path,'/voices');assert.equal(options.operationId,'clone-operation-id');
   assert.deepEqual([...options.body.keys()],['name','consent_accepted','remove_background_noise','files']);
   return Response.json({clone:{voice_id:'new-voice',project_id:'project',status:mode},generation:{id,project_id:'project',billing_organization_id:'org',operation:'voice_clone',status:mode==='ready'?'completed':'uncertain',usage:{credits:mode==='ready'?5:0}}});
 }},
},{FormData});
(async()=>{
 const input={operationId:'clone-operation-id',name:'Autorizada',authorized:true,files:[new File(['test'],'voice.mp3',{type:'audio/mpeg'})]};
 await assert.rejects(()=>api.createConnectyHubVoiceClone({...input,authorized:false}),e=>e.code==='consent_required');assert.equal(calls.length,0);
 const result=await api.createConnectyHubVoiceClone(input);assert.equal(result.voiceId,'new-voice');assert.equal(result.chargedCredits,5);assert.deepEqual(calls,['identity','/voices']);assert.equal(saved.status,'completed');
 calls=[];saved=null;selected=[];mode='uncertain';await assert.rejects(()=>api.createConnectyHubVoiceClone(input),e=>e.code==='clone_pending');assert.equal(saved.status,'uncertain');assert.equal(selected.length,0,'Pending clone never replaces approved voice');assert.equal(calls.filter(path=>path==='/voices').length,1);
 console.log('Private clone consent, wallet preflight, exact public multipart contract, billing receipt and pending selection protection passed (offline).');
})().catch(error=>{console.error(error);process.exitCode=1;});
