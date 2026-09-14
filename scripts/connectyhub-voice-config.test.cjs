/* eslint-disable @typescript-eslint/no-require-imports -- Offline source harness. */
const assert=require('node:assert/strict');
const {loadSource}=require('./helpers/load-source.cjs');
let rows=[], readKeys=[];
const db={from(table){assert.equal(table,'app_config');return{select(){return this;},async in(_,keys){readKeys=keys;return{data:rows,error:null};}};}};
const config=loadSource('src/lib/voice/config.ts',{'@/lib/supabase/admin':{getSupabaseAdminClient:()=>db}},{process:{env:{ELEVENLABS_API_KEY:'provider-secret',CONNECTYHUB_API_TOKEN:'whatsapp-secret',CONNECTYHUB_LLM_API_KEY:'llm-secret'}}});
(async()=>{
 rows=[{key:'elevenlabs_willian_voice_id',value:'old-authorized-voice'},{key:'connectyhub_llm_project_id',value:'own-project'},{key:'connectyhub_llm_billing_organization_id',value:'own-org'}];
 let result=await config.getConnectyHubVoiceConfig();
 assert.equal(result.apiKey.value,'','No credential fallback to provider, WhatsApp or LLM');
 assert.equal(result.willianVoiceId.value,'old-authorized-voice');assert.equal(result.willianVoiceId.source,'legacy');
 assert.equal(result.projectId.value,'own-project');assert.equal(result.billingOrganizationId.value,'own-org');
 assert.ok(!readKeys.includes('elevenlabs_api_key'),'Legacy credential never read');
 rows.push({key:'connectyhub_voice_api_key',value:'dedicated-voice-key'},{key:'connectyhub_voice_agent_voice_id',value:'confirmed-catalog-voice'});
 result=await config.getConnectyHubVoiceConfig();assert.equal(result.apiKey.value,'dedicated-voice-key');assert.equal(result.willianVoiceId.value,'confirmed-catalog-voice');
 console.log('Voice credential isolation, legacy selection and own billing identity passed (offline).');
})().catch(error=>{console.error(error);process.exitCode=1;});
