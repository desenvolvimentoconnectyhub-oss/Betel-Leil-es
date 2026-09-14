/* eslint-disable @typescript-eslint/no-require-imports -- Offline source regression harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadSource } = require('./helpers/load-source.cjs');
const file = 'src/app/api/webhooks/connectyhub/route.ts';
const policy = loadSource('src/lib/whatsapp/webhook-message-policy.ts');
const imports = [...fs.readFileSync(file,'utf8').matchAll(/from\s+["']([^"']+)["']/g)].map(match=>match[1]);
const mocks = Object.fromEntries(imports.map(name=>[name,{}]));
delete mocks['node:crypto'];
let ackCalls = 0;
mocks['@/lib/whatsapp/webhook-message-policy'] = policy;
mocks['@/lib/communication/connectyhub-client'] = { CONNECTYHUB_PROVIDER:'connectyhub',normalizeWhatsAppNumber:value=>String(value||'').split('@')[0].replace(/\D/g,'') };
mocks['@/lib/whatsapp/publication-events'] = { reconcilePublicationEvent:async()=>{ackCalls++;return {ok:true,skipped:true};} };
const route = loadSource(file,mocks,{fetch:()=>{throw Error('Network forbidden');}},['extractWebhookMessage','persistWebhookCrm','processWhatsappAgentRuntime','eventHash','findKnownBetelOutboundEcho']);
const chat = { phone:'5511999990000',owner:'5511888880000',wa_chatid:'5511999990000@s.whatsapp.net',wa_lastMessageType:'AudioMessage',wa_lastMsgTimestamp:1789400043794 };
const snapshot = { event:'chats',instanceId:'fixture-instance',data:{EventType:'chats',owner:chat.owner,chat},ingest:{messageId:null} };
const inbound = { event:'messages',instanceId:'fixture-instance',data:{EventType:'messages',chat,message:{id:'5511888880000:ABC123',messageid:'ABC123',fromMe:false,wasSentByApi:false,type:'text',messageType:'Conversation',text:'Quero saber como funciona',owner:chat.owner,sender_pn:chat.phone}} };

function auditDb(outboundRows=[]) {
  const calls=[];
  return {calls,from(table){
    if(!['whatsapp_instances','whatsapp_webhook_events','whatsapp_conversation_messages'].includes(table))throw Error('Unexpected CRM/lead mutation: '+table);
    let filters=[],action='select',value;
    const result=()=>({error:null,data:table==='whatsapp_instances'?{id:'local-fixture',agent_key:'fixture-agent',provider_instance_id:'fixture-instance'}:table==='whatsapp_webhook_events'?{id:'event-fixture'}:outboundRows.filter(row=>filters.every(fn=>fn(row)))[0]||null});
    const q={select(){return q;},eq(k,v){filters.push(row=>row[k]===v);return q;},in(k,vs){filters.push(row=>vs.includes(row[k]));return q;},order(){return q;},limit(){return q;},upsert(v){action='upsert';value=v;return q;},update(v){action='update';value=v;return q;},maybeSingle(){calls.push({table,action,value});return Promise.resolve(result());},then(resolve,reject){calls.push({table,action,value});return Promise.resolve(result()).then(resolve,reject);}};return q;
  }};
}

async function main(){
  assert.equal(policy.webhookMessagePolicy(snapshot).kind,'control');
  const extractedSnapshot=route.extractWebhookMessage(snapshot);
  assert.equal(extractedSnapshot.messageType,'unknown','chat lastMessageType cannot create audio');
  assert.equal(extractedSnapshot.providerMessageId,'');
  assert.equal(extractedSnapshot.mediaUrl,'');
  const db=auditDb();
  const result=await route.persistWebhookCrm(db,snapshot);
  assert.equal(result.skipped,true);
  assert.equal(result.reason,'non_message_event');
  assert.ok(db.calls.some(call=>call.table==='whatsapp_webhook_events'&&call.action==='upsert'),'raw technical event retained for audit');
  assert.ok(!db.calls.some(call=>call.table==='whatsapp_conversation_messages'),'technical event never becomes a message');
  assert.equal((await route.processWhatsappAgentRuntime(db,snapshot,{ok:true,text:'Audio recebido'})).reason,'not_an_inbound_message');
  for(const event of ['presence','history','messages_update','connection','contacts','chats']){
    assert.equal(policy.webhookMessagePolicy({...inbound,event}).kind,'control');
  }
  await route.persistWebhookCrm(db,{...inbound,event:'messages_update'});
  assert.equal(ackCalls,1,'ACK still reaches publication reconciliation');
  assert.equal(policy.webhookMessagePolicy(inbound).kind,'inbound');
  assert.equal(route.extractWebhookMessage(inbound).messageType,'text','real text overrides stale audio summary');
  const own=structuredClone(inbound);own.data.message.fromMe=true;own.data.message.wasSentByApi=true;own.data.message.type='audio';own.data.message.messageType='AudioMessage';delete own.data.message.text;own.data.message.content={URL:'https://fixture.invalid/voice.ogg',mimetype:'audio/ogg'};
  assert.equal(policy.webhookMessagePolicy(own).kind,'outbound');
  assert.equal(route.extractWebhookMessage(own).fromApi,true);
  assert.equal((await route.processWhatsappAgentRuntime(db,own,{ok:true})).reason,'not_an_inbound_message');
  const audio=structuredClone(own);audio.data.message.fromMe=false;audio.data.message.wasSentByApi=false;
  assert.equal(policy.webhookMessagePolicy(audio).kind,'inbound');
  assert.equal(route.extractWebhookMessage(audio).messageType,'audio');
  const quoted=structuredClone(inbound);quoted.data.message.content={contextInfo:{quotedMessage:{audioMessage:{mimetype:'audio/ogg',URL:'https://fixture.invalid/quoted.ogg'},fromMe:true}}};
  assert.equal(policy.webhookMessagePolicy(quoted).kind,'inbound','quoted outbound must not reverse current sender');
  assert.equal(route.extractWebhookMessage(quoted).mediaUrl,'','quoted audio must not become inbound media');
  assert.equal(route.extractWebhookMessage(quoted).mediaMimeType,'');
  const missingDirection=structuredClone(inbound);delete missingDirection.data.message.fromMe;
  assert.equal(policy.webhookMessagePolicy(missingDirection).kind,'unknown');
  const missingId=structuredClone(inbound);delete missingId.data.message.id;delete missingId.data.message.messageid;
  assert.equal(policy.webhookMessagePolicy(missingId).kind,'unknown');
  assert.equal(route.eventHash({...inbound,sentAt:'first'}),route.eventHash({...inbound,sentAt:'redelivery'}),'redelivery keeps identity hash');
  const outboundDb=auditDb([{id:'stored-outbound',instance_id:'local-fixture',direction:'outbound',provider_message_id:'5511888880000:ABC123'}]);
  const echo=await route.findKnownBetelOutboundEcho(outboundDb,{conversationId:'',eventId:'new-event',instanceId:'local-fixture',accountPhone:'5511888880000',providerMessageId:'ABC123',text:'',receivedAt:new Date().toISOString()});
  assert.equal(echo.id,'stored-outbound','prefixed delivery ID matches bare webhook ID');
  assert.equal(policy.messageUsableForRuntime({direction:'inbound',payload:snapshot}),false);
  assert.equal(policy.messageUsableForRuntime({direction:'outbound',payload:{runtime_excluded:true}}),false);
  assert.equal(policy.messageUsableForRuntime({direction:'inbound',payload:inbound}),true);
  console.log('Webhook event/direction/media, audit-only CRM, runtime guard, ACK, redelivery, echo ID and context regressions passed (offline).');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
