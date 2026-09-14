/* eslint-disable @typescript-eslint/no-require-imports -- Offline route and lease regression harness. */
const assert = require('node:assert/strict');
const { loadSource } = require('./helpers/load-source.cjs');
async function main() {
 let actor=null, scope=true, resetCalls=0, fault='', complete=true;
 const response={json:(body,options)=>new Response(JSON.stringify(body),options)};
 const route=loadSource('src/app/api/admin/whatsapp/leads/reset/route.ts',{
  'next/server':{NextResponse:response},'next/cache':{revalidatePath:()=>{}},
  '@/lib/auth/admin-api':{requireAdminApi:async()=>({admin:actor,response:actor?null:response.json({error:'unauthorized'},{status:401})})},
  '@/lib/whatsapp/lead-reset':{canResetBetelLead:async a=>a.role==='owner'&&scope,resetBetelLead:async()=>{resetCalls++;if(fault)throw Error(fault);return {deleted:true,complete};}},
 }, { Error });
 const body={leadId:'00000000-0000-0000-0000-000000000031',conversationId:'00000000-0000-0000-0000-000000000041',confirmation:'RESETAR'};
 const request=b=>new Request('https://fixture.invalid/api/admin/whatsapp/leads/reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
 assert.equal((await route.POST(request(body))).status,401);
 for(const role of ['admin','manager','analyst','viewer','master']){actor={id:'fixture',role};assert.equal((await route.POST(request(body))).status,403);}
 assert.equal(resetCalls,0,'forbidden roles never reach reset');
 actor={id:'fixture',role:'owner'};scope=false;assert.equal((await route.POST(request(body))).status,403);scope=true;
 assert.equal((await route.POST(request({...body,confirmation:''}))).status,400);
 assert.equal((await route.POST(request({...body,conversationId:'bad'}))).status,400);
 assert.equal((await route.POST(request(body))).status,200);
 for(const [reason,status] of [['RESET_MASTER_REQUIRED',403],['RESET_SCOPE_MISMATCH',404],['RESET_ATTENDANCE_BUSY',409],['DB_UNAVAILABLE',503]]){fault=reason;assert.equal((await route.POST(request(body))).status,status);}
 fault='';complete=false;assert.equal((await route.POST(request(body))).status,202);
 let active=true,acquired=0,released=0;
 const db={rpc:async()=>({data:'lease-'+(++acquired),error:null}),from:()=>{const q={select:()=>q,eq:()=>q,gt:()=>q,maybeSingle:async()=>({data:active?{id:'lease'}:null}),delete:()=>{released++;return q},then:resolve=>Promise.resolve({error:null}).then(resolve)};return q;}};
 const reset=loadSource('src/lib/whatsapp/lead-reset.ts',{'@/lib/supabase/admin':{getSupabaseAdminClient:()=>db},'@/lib/storage/r2':{}});
 assert.equal(await reset.canResetBetelLead({id:'x',role:'admin'}),false);
 await reset.withLeadWork({leadId:'fixture'},async()=>{await reset.assertLeadWorkActive();await reset.withLeadWork({leadId:'fixture'},async()=>{});});
 assert.equal(acquired,1,'nested work shares intake lease');assert.equal(released,1);
 await assert.rejects(()=>reset.withLeadWork({leadId:'fixture'},async()=>{throw Error('failure');}),/failure/);assert.equal(released,2,'error releases lease');
 await assert.rejects(()=>reset.withLeadWork({leadId:'fixture'},async()=>{active=false;await reset.assertLeadWorkActive();}),/STALE_WORK/);
 assert.equal(released,3);
 assert.equal(reset.providerMessageTime({}),null,'missing timestamp must not become now');
 assert.equal(reset.providerMessageTime({messageTimestamp:1700000000}),'2023-11-14T22:13:20.000Z');
 const fs=require('node:fs');const source=fs.readFileSync('src/lib/admin/repository/users.ts','utf8');const mocks=Object.fromEntries([...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>[m[1],{}]));
 mocks['@/lib/supabase/admin']={getSupabaseAdminClient:()=>({from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role:actor.role,status:'active'}})})})})})};
 const users=loadSource('src/lib/admin/repository/users.ts',mocks,{},['mayManageOwner']);actor.role='admin';
 assert.equal(await users.mayManageOwner('x','owner'),false);assert.equal(await users.mayManageOwner('x','admin','owner'),false);
 actor.role='owner';assert.equal(await users.mayManageOwner('x','owner'),true);
 console.log('Reset API: authentication, MASTER-only access, organization scope, validation, busy/error/partial states, lease cleanup/expiry and owner promotion restrictions passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
