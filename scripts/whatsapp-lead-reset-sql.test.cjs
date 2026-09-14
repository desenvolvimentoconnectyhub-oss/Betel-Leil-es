/* eslint-disable @typescript-eslint/no-require-imports -- Isolated PostgreSQL regression harness. */
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const fixture = `
create role anon; create role authenticated; create role service_role;
create table admin_organizations(id uuid primary key,name text,organization_type text,status text);
create table admin_users(id uuid primary key,organization_id uuid,role text,status text);
insert into admin_organizations values('00000000-0000-0000-0000-000000000001','Betel fixture','internal','active'),('00000000-0000-0000-0000-000000000002','Other account','external','active');
insert into admin_users values
 ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','owner','active'),
 ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001','admin','active'),
 ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000002','owner','active'),
 ('00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000001','owner','suspended');
create table whatsapp_instances(id uuid primary key,provider_instance_id text,status text);
create table whatsapp_leads(id uuid primary key default gen_random_uuid(),phone text unique,name text);
create table whatsapp_conversations(id uuid primary key,lead_id uuid references whatsapp_leads(id),instance_id uuid references whatsapp_instances(id),status text);
create table whatsapp_webhook_events(id uuid primary key,instance_id uuid,from_phone text,payload jsonb);
create table whatsapp_conversation_messages(id uuid primary key,lead_id uuid references whatsapp_leads(id),conversation_id uuid references whatsapp_conversations(id),webhook_event_id uuid,provider_message_id text,payload jsonb);
create table whatsapp_lead_files(id uuid primary key,lead_id uuid,conversation_id uuid,message_id uuid,storage_key text);
create table generated_media(id uuid primary key,lead_id uuid,conversation_id uuid,message_id uuid,storage_key text);
create table whatsapp_follow_ups(id uuid primary key,lead_id uuid,conversation_id uuid,status text);
create table whatsapp_lead_profiles(id uuid primary key,lead_id uuid,metadata jsonb);
create table whatsapp_sdr_appointments(id uuid primary key,lead_id uuid,conversation_id uuid);
create table agent_runs(id uuid primary key,whatsapp_lead_id uuid,whatsapp_conversation_id uuid,webhook_event_id uuid,input_payload jsonb,output_payload jsonb,metadata jsonb,error_message text,status text,cost_estimate numeric);
create table communication_outbox(id uuid primary key,run_id uuid,status text,payload jsonb,message_code text);
create table agent_runtime_events(id uuid primary key,run_id uuid,event_type text,payload jsonb);
create table intelligence_memory(id uuid primary key,scope_id text,value jsonb);
`;
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
async function main() {
 const db = new PGlite();
 await db.exec(fixture);
 await db.exec(fs.readFileSync('supabase/migrations/20260914180000_whatsapp_master_lead_reset.sql','utf8'));
 for (const [actor,allowed] of [[11,true],[12,false],[13,false],[14,false],[999,false]]) {
  assert.equal((await db.query('select can_reset_betel_lead($1) allowed',[id(actor)])).rows[0].allowed,allowed);
 }
 await db.exec(`insert into whatsapp_instances values('${id(21)}','fixture-a','connected'),('${id(22)}','fixture-b','connected');
 insert into whatsapp_leads values('${id(31)}','5511999990001','Target'),('${id(32)}','5511999990002','Other');
 insert into whatsapp_conversations values('${id(41)}','${id(31)}','${id(21)}','open'),('${id(42)}','${id(31)}','${id(22)}','archived'),('${id(43)}','${id(32)}','${id(22)}','open');
 insert into whatsapp_webhook_events values('${id(51)}','${id(21)}','5511999990001','{}'),('${id(52)}','${id(22)}','5511999990002','{}');
 insert into whatsapp_conversation_messages values('${id(61)}','${id(31)}','${id(41)}','${id(51)}','owner:old-inbound','{}'),('${id(62)}','${id(32)}','${id(43)}','${id(52)}','other-message','{}');
 insert into whatsapp_lead_files values('${id(71)}','${id(31)}','${id(41)}','${id(61)}','whatsapp-leads/fixture/private.png');
 insert into whatsapp_follow_ups values('${id(81)}','${id(31)}','${id(41)}','queued');
 insert into whatsapp_lead_profiles values('${id(91)}','${id(31)}','{"memory":"old"}');
 insert into whatsapp_sdr_appointments values('${id(101)}','${id(31)}','${id(41)}');
 insert into agent_runs values('${id(111)}','${id(31)}','${id(41)}','${id(51)}','{"text":"old"}','{}','{}',null,'completed',7.5);
 insert into agent_runtime_events values('${id(121)}','${id(111)}','reply','{}');
 insert into communication_outbox values('${id(131)}','${id(111)}','queued','{}','fixture-outbox');
 insert into intelligence_memory values('${id(141)}','${id(31)}','{"old":"context"}');`);
 const reset=(actor=11,conversation=41,confirm=true)=>db.query('select reset_betel_whatsapp_lead($1,$2,$3,$4) result',[id(actor),id(31),id(conversation),confirm]);
 for(const actor of [12,13,14,999]) await assert.rejects(()=>reset(actor),/MASTER_REQUIRED/);
 await assert.rejects(()=>reset(11,43),/SCOPE_MISMATCH/);
 await assert.rejects(()=>reset(11,41,false),/CONFIRM_REQUIRED/);
 const token=(await db.query('select begin_betel_lead_work(p_lead=>$1,p_conversation=>$2) token',[id(31),id(41)])).rows[0].token;
 await assert.rejects(()=>reset(),/ATTENDANCE_BUSY/);
 await db.query('delete from whatsapp_lead_work_leases where id=$1',[token]);
 const outboxToken=(await db.query("select begin_betel_outbox_work('fixture-outbox') token")).rows[0].token;
 assert.ok(outboxToken); await assert.rejects(()=>reset(),/ATTENDANCE_BUSY/);
 await db.query('delete from whatsapp_lead_work_leases where id=$1',[outboxToken]);
 const result=(await reset()).rows[0].result;
 assert.equal(result.deleted,true); assert.equal(result.complete,false);
 for(const table of ['whatsapp_lead_profiles','whatsapp_lead_files','whatsapp_follow_ups','whatsapp_sdr_appointments','intelligence_memory','communication_outbox','agent_runtime_events']) assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0,table);
 for(const table of ['whatsapp_leads','whatsapp_conversations','whatsapp_conversation_messages','whatsapp_webhook_events']) assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,1,table+' isolates other lead');
 assert.equal((await db.query('select count(*)::int n from whatsapp_instances')).rows[0].n,2,'sessions preserved');
 const run=(await db.query('select * from agent_runs')).rows[0]; assert.equal(Number(run.cost_estimate),7.5); assert.equal(run.whatsapp_lead_id,null); assert.deepEqual(run.input_payload,{});
 assert.equal((await reset()).rows[0].result.jobId,result.jobId,'idempotent retry');
 await assert.rejects(()=>db.query('select begin_betel_lead_work(p_lead=>$1)',[id(31)]),/STALE_WORK/);
 const intake=(mode,at,msg='new-message',instance='fixture-a')=>db.query('select begin_betel_lead_work(p_phone=>$1,p_provider_instance=>$2,p_mode=>$3,p_occurred_at=>$4,p_message_id=>$5) token',['5511999990001',instance,mode,at,msg]);
 const future=new Date(Date.now()+5000).toISOString();
 await assert.rejects(()=>intake('inbound','2020-01-01T00:00:00Z'),/OLD_MESSAGE/);
 await assert.rejects(()=>intake('inbound',null),/OLD_MESSAGE/);
 await assert.rejects(()=>intake('inbound',future,'old-inbound'),/OLD_MESSAGE/);
 await assert.rejects(()=>intake('history',future),/WAIT_NEW_CONTACT/);
 await assert.rejects(()=>intake('outbound',future),/WAIT_NEW_CONTACT/);
 await assert.rejects(()=>intake('inbound',future,'new','other-account-instance'),/INSTANCE_SCOPE/);
 const next=(await intake('inbound',future)).rows[0].token;
 assert.ok(next,'fresh inbound can restart');
 await assert.rejects(()=>intake('history','2020-01-01T00:00:00Z'),/OLD_MESSAGE/);
 await db.exec('set role authenticated');
 await assert.rejects(()=>reset(),/permission denied/);
 await db.exec('reset role; set role anon');
 await assert.rejects(()=>reset(),/permission denied/);
 await db.exec('reset role');
 await assert.rejects(()=>db.query("select begin_betel_outbox_work('fixture-outbox')"),/STALE_OUTBOX/);
 if(process.env.BETEL_RESET_SQL_HASHES) console.log(JSON.stringify((await db.query("select proname,md5(regexp_replace(regexp_replace(prosrc,'--[^'||chr(10)||chr(13)||']*','','g'),'[[:space:]]','','g')) hash from pg_proc where proname in ('can_reset_betel_lead','begin_betel_lead_work','betel_reset_json_references','reset_betel_whatsapp_lead','begin_betel_outbox_work') order by proname")).rows));
 await db.close();
 console.log('Reset SQL: MASTER/account checks, confirmation, busy lease, complete scoped deletion, accounting/session preservation, replay/echo/history fences, stale work and RPC permissions passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
