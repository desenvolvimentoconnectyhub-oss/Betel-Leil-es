/* eslint-disable @typescript-eslint/no-require-imports -- Offline regression suite. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {loadSource}=require('./helpers/load-source.cjs');
const domain=loadSource('src/lib/domain/whatsapp-destination-scope.ts');
const scope={agentKey:'a',instanceId:'new',phone:'5511999999999'};
const rows=[{id:'old-group',agent_key:'a',instance_id:'old',provider:'connectyhub',jid:'old@g.us',name:'Old',status:'paused'}, {id:'new-group',agent_key:'a',instance_id:'new',provider:'connectyhub',jid:'new@g.us',name:'New',status:'paused'}, {id:'other',agent_key:'b',instance_id:'new',provider:'connectyhub',jid:'other@g.us',status:'paused'}];
function harness({groups=[], changed=false, missing=false, collision=false}={}){
 const queries=[], writes=[], calls=[];
 let reads=0;
 const instance={id:'new',agent_key:'a',provider_instance_id:'remote-new',status:'connected',phone:scope.phone};
 const db={from(table){const filters=[]; let write=false; const q={
  select(){return q},eq(k,v){filters.push([k,v]);return q},neq(){return q},not(){return q},order(){return q},limit(){return q},
  update(v){write=true;writes.push({table,type:'update',v});return q},insert(v){write=true;writes.push({table,type:'insert',v});return q},upsert(v){write=true;writes.push({table,type:'upsert',v});return q},
  maybeSingle(){return q},in(){return q},
  then(resolve){queries.push({table,filters});let data=[];
   if(table==='whatsapp_instances'){reads++;data=missing?null:{...instance,phone:changed&&reads>1?'5511888888888':instance.phone};}
   if(table==='whatsapp_group_destinations')data=write?{id:'inserted'}:filters.some(([k])=>k==='jid')?(collision?rows[0]:null):rows.filter(r=>filters.every(([k,v])=>r[k]===v));
   return Promise.resolve({data,error:null}).then(resolve);
  }};return q;
 }};
 const mod=loadSource('src/lib/whatsapp/group-campaigns.ts',{
  '@/lib/supabase/admin':{getSupabaseAdminClient:()=>db},
  '@/lib/communication/connectyhub-client':{CONNECTYHUB_PROVIDER:'connectyhub',WILLIAN_AGENT_KEY:'a',listConnectyHubWhatsAppGroups:async input=>{calls.push(input);return{ok:true,instanceId:'remote-new',groups};}},
  '@/lib/communication/willian-agent-config':{},'./publication-delivery':{},
 });
 return {mod,calls,queries,writes};
}
(async()=>{
 assert.equal(domain.groupListEntries({groups:[]}).length,0);
 assert.throws(()=>domain.groupListEntries({success:false,groups:[]}));
 assert.throws(()=>domain.groupListEntries({message:'not connected'}));
 assert.equal(domain.groupListEntries({data:{groups:[{id:'one'}]}}).length,1);
 const normalized=rows.map(r=>({agentKey:r.agent_key,instanceId:r.instance_id,jid:r.jid}));
 assert.equal(domain.destinationsInScope(normalized,scope,[]).length,0);
 assert.equal(domain.destinationsInScope(normalized,scope,['new@g.us']).length,1);
 assert.notEqual(domain.destinationScopeKey(scope),domain.destinationScopeKey({...scope,phone:'5511888888888'}));
 assert.notEqual(domain.destinationScopeKey(scope),domain.destinationScopeKey({...scope,instanceId:'old'}));

 let h=harness();
 let result=await h.mod.syncWhatsAppCommunityDestinations({...scope,noParticipants:true});
 assert.equal(result.ok,true);assert.equal(result.groups,0);assert.equal(result.data.destinations.length,0,'zero current groups must not revive any persisted rows');assert.equal(h.writes.length,0);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].instanceId,'remote-new');assert.equal(h.calls[0].noParticipants,true);
 assert.equal(h.queries.filter(q=>q.table==='whatsapp_instances').every(q=>q.filters.some(([k,v])=>k==='agent_key'&&v==='a')),true,'no global fallback');

 h=harness({groups:[{jid:'new@g.us'}]});result=await h.mod.getWhatsAppCommunityData('a');
 assert.equal(result.ok,true);assert.equal(result.destinations.length,1);assert.equal(result.destinations[0].id,'new-group');
 h=harness({groups:[]});result=await h.mod.getWhatsAppCommunityData('a');assert.equal(result.destinations.length,0,'ordinary catalog read also uses live membership');

 h=harness({changed:true});await assert.rejects(()=>h.mod.syncWhatsAppCommunityDestinations({...scope,noParticipants:true}),/conexão mudou/);assert.equal(h.writes.length,0,'number swap during remote response must fail before writes');
 h=harness({missing:true});await assert.rejects(()=>h.mod.readCurrentWhatsAppGroups('a'),/Nenhuma instância/);assert.equal(h.calls.length,0);
 h=harness();await assert.rejects(()=>h.mod.syncWhatsAppCommunityDestinations({...scope,instanceId:'old'}),/instância mudou/);assert.equal(h.calls.length,0);
 h=harness({collision:true,groups:[{jid:'old@g.us',participants:[]}]});await assert.rejects(()=>h.mod.syncWhatsAppCommunityDestinations({...scope,noParticipants:true}),/outra instância/);assert.equal(h.writes.length,0,'same JID must never transfer ownership or history to another instance');

 // Execute the actual provider function against controlled HTTP dependencies.
 const source=fs.readFileSync('src/lib/communication/connectyhub-client.ts','utf8');
 const start=source.indexOf('export async function listConnectyHubWhatsAppGroups(');const end=source.indexOf('\nexport async function ',start+1);
 let requests=0;let payload={groups:[]};
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(source.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,URLSearchParams,Error,
 cleanString:(v,f='')=>v||f,WILLIAN_AGENT_KEY:'a',resolveAgentProviderInstanceId:async()=>({config:{apiToken:'offline'},instanceId:'remote-new'}),
 connectyhubRequest:async()=>{requests++;if(payload instanceof Error)throw payload;return payload;},groupListEntries:domain.groupListEntries,normalizeGroupPayload:v=>v,sanitizePayload:v=>v,
 });
 const list=module.exports.listConnectyHubWhatsAppGroups;
 assert.equal((await list({agentKey:'a'})).groups.length,0);assert.equal(requests,1,'valid empty list must not fall back to POST or chat history');
 payload=new Error('provider unavailable');await assert.rejects(()=>list({}),/provider unavailable/);assert.equal(requests,2,'provider failure must not become successful empty data');
  payload={bad:'shape'};await assert.rejects(()=>list({}),/inválida/);
 // Run the real effect body with a transport that ignores abort, simulating a late response.
 const panel=fs.readFileSync('src/components/admin/opportunity-detail/OpportunityWhatsAppSendPanel.tsx','utf8');
 const bodyStart=panel.indexOf('    if (!agentKey || !panelOpen || !selectedAgent)');
 const bodyEnd=panel.indexOf('  }, [agentKey, panelOpen, scopeKey, selectedAgent]);',bodyStart);
 function effectHarness(){
  const timers=[],published=[],states=[],pending=[];
  const effectModule={exports:{}};
  vm.runInNewContext(ts.transpileModule('module.exports = function(){\n'+panel.slice(bodyStart,bodyEnd)+'\n}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{
   module:effectModule,agentKey:scope.agentKey,panelOpen:true,selectedAgent:scope,scopeKey:domain.destinationScopeKey(scope),AbortController,Error,
   window:{setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){}},
   fetch:()=>new Promise(resolve=>pending.push(resolve)),
   setFreshDestinations:value=>published.push(value),setAutoSyncState:value=>states.push(value),setAutoSyncMessage(){},
   destinationScopeKey:domain.destinationScopeKey,destinationsInScope:domain.destinationsInScope,
  });
  const cleanup=effectModule.exports();timers.shift()();
  return {cleanup,timers,published,states,pending};
 }
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 let fx=effectHarness();fx.cleanup();fx.pending.shift()({ok:true,json:async()=>({success:true,data:{ok:true,...scope,data:{ok:true,destinations:[{...scope,jid:'new@g.us'}]}}})});await flush();
 assert.equal(fx.published.filter(Boolean).length,0,'late response after sender change cannot restore old groups');
 fx=effectHarness();fx.pending.shift()({ok:true,json:async()=>({success:true,data:{ok:true,...scope,data:{ok:true,destinations:[]}}})});await flush();
 assert.equal(fx.states.at(-1),'done');assert.equal(fx.published.at(-1).items.length,0,'empty response replaces old groups');
 fx=effectHarness();const wrong=()=>({ok:true,json:async()=>({success:true,data:{ok:true,...scope,instanceId:'old',data:{ok:true,destinations:[]}}})});fx.pending.shift()(wrong());await flush();fx.timers.shift()();fx.pending.shift()(wrong());await flush();
 assert.equal(fx.states.at(-1),'error');assert.equal(fx.published.filter(Boolean).length,0,'wrong connection echo must fail after one bounded retry');
 console.log('PASS group isolation: current instance and phone, authoritative empty, old catalog, other agent, reconnect race, missing instance, preserved historical ownership, provider errors, no chat fallback. Offline; no real writes or sends.');
})().catch(e=>{console.error(e);process.exitCode=1});
