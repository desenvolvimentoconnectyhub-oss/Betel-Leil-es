/* eslint-disable @typescript-eslint/no-require-imports -- Offline source harness. */
const assert=require('node:assert/strict');
const {loadSource}=require('./helpers/load-source.cjs');
const rows=new Map();let unavailable=false;
const db={from(table){assert.equal(table,'voice_operation_receipts');let action='select',value,filters=[];const run=()=>{
 if(unavailable)return {error:{code:'08006'},data:null};
 if(action==='insert'){if(rows.has(value.id))return {error:{code:'23505'},data:null};const row={generation_id:null,charged_credits:null,audio_expires_at:null,...value};rows.set(row.id,row);return{data:row,error:null};}
 const row=[...rows.values()].find(r=>filters.every(f=>f(r)));
 if(action==='update'&&row)Object.assign(row,value);
 return{data:row||null,error:null};
 };const q={insert(v){action='insert';value=v;return q;},update(v){action='update';value=v;return q;},select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},neq(k,v){filters.push(r=>r[k]!==v);return q;},single:async()=>run(),then(resolve,reject){return Promise.resolve(run()).then(resolve,reject);}};return q;}};
const api=loadSource('src/lib/voice/receipts.ts',{'@/lib/supabase/admin':{getSupabaseAdminClient:()=>db}});
(async()=>{
 const input={operationId:api.voiceOperationId('one-inbound-one-part'),body:JSON.stringify({text:'synthetic speech'}),projectId:'project',billingOrganizationId:'org',voiceId:'voice',modelId:'model'};
 await api.claimVoiceOperation(input);await api.claimVoiceOperation(input);assert.equal(rows.size,1,'Repeated operation reuses its receipt');
 for(const patch of [{body:'different speech'},{projectId:'other-project'},{billingOrganizationId:'other-org'},{voiceId:'other-voice'},{modelId:'other-model'}])await assert.rejects(()=>api.claimVoiceOperation({...input,...patch}),/outra configuracao/);
 await api.recordVoiceReceipt(input.operationId,{generation_id:'generation',status:'completed',charged_credits:5,audio_expires_at:null});
 await api.recordVoiceReceipt(input.operationId,{generation_id:null,status:'uncertain',charged_credits:null,audio_expires_at:null});
 assert.equal(rows.get(input.operationId).charged_credits,5);assert.equal(rows.get(input.operationId).status,'completed');
 assert.ok(!JSON.stringify([...rows.values()]).includes('synthetic speech'),'Receipts contain no speech content');
 unavailable=true;await assert.rejects(()=>api.claimVoiceOperation({...input,operationId:api.voiceOperationId('new-operation')}),/antes da geracao/);
 console.log('Voice receipt reuse, payload/account conflict, confirmed charge preservation and fail-before-charge passed (offline).');
})().catch(error=>{console.error(error);process.exitCode=1;});
