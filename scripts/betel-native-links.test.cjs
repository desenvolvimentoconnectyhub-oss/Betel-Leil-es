/* eslint-disable @typescript-eslint/no-require-imports -- Controlled browser/transport contracts. */
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {loadSource}=require('./helpers/load-source.cjs');
const origin='https://betel-leil-es.vercel.app';
const tables={betel_tracked_links:[],whatsapp_leads:[{id:randomUUID(),phone:'5511999000001'}]};
let clicks=[],fail=false;
const db={from(table){let data,action='select',filters=[];const query={
 select(){return query;},eq(k,v){filters.push(r=>r[k]===v);return query;},
 upsert(v){data=v;action='upsert';return query;},
 single(){return Promise.resolve(run(true));},maybeSingle(){return Promise.resolve(run(true));},
 then(a,b){return Promise.resolve(run(false)).then(a,b);}};
 function run(single){if(fail)return {error:{message:'offline'}};const rows=tables[table]||[];
 if(action==='upsert'&&!rows.find(r=>r.dedup_key===data.dedup_key))rows.push({id:randomUUID(),...data});
 const matches=rows.filter(r=>filters.every(f=>f(r)));return {error:null,data:single?matches[0]||null:matches};}
 return query;}};
const mocks={'@/lib/supabase/admin':{getSupabaseAdminClient:()=>db}};
const globals={Request,Response,Headers,process:{env:{BETEL_PUBLIC_APP_URL:origin}},fetch:async()=>{throw Error('Unexpected network');}};
const native=loadSource('src/lib/whatsapp/native-links.ts',mocks,globals);
const visitor=loadSource('src/lib/whatsapp/visitor-journey.ts',mocks,globals);
const route=loadSource('src/app/l/[id]/route.ts',{...mocks,'@/lib/whatsapp/native-links':native,'@/lib/whatsapp/visitor-journey':{...visitor,getBetelVisitor:async()=>null,recordNativeClick:async(link,event,v)=>clicks.push({link,event,v}),createBetelVisitor:async()=>({id:randomUUID(),token:'a'.repeat(64)})}},globals);
async function main(){
 const input={instanceId:'fixture',number:'5511999000001',trackId:'fixture-message',text:'Detalhes https://example.org/property e referencia https://example.net/rent.',actionButton:{choices:[{label:'Aluguel 1',url:'https://example.net/rent'},{label:'Leilao',url:'https://example.org/property'}]}};
 const prepared=await native.prepareBetelNativeLinks(input);
 assert.match(prepared.text,/https:\/\/betel-leil-es.vercel.app\/l\//);assert.equal(tables.betel_tracked_links.length,4);
 assert.ok(tables.betel_tracked_links.every(r=>r.intended_lead_id===tables.whatsapp_leads[0].id&&r.recipient_kind==='direct'));
 const again=await native.prepareBetelNativeLinks(input);assert.equal(JSON.stringify(again),JSON.stringify(prepared));assert.equal(tables.betel_tracked_links.length,4,'stable links on retry');
 assert.equal(JSON.stringify(await native.prepareBetelNativeLinks(prepared)),JSON.stringify(prepared),'no double wrapping');
 const group=await native.prepareBetelNativeLinks({...input,number:'120000@g.us',trackId:'group-fixture'});
 assert.ok(group.text);assert.ok(tables.betel_tracked_links.slice(4).every(r=>r.intended_lead_id===null&&r.recipient_kind==='group'));
 const beforeAuth=tables.betel_tracked_links.length;
 const authText=origin+'/definir-senha#access_token=fixture';
 assert.equal((await native.prepareBetelNativeLinks({...input,text:authText,actionButton:undefined})).text,authText);
 assert.equal(tables.betel_tracked_links.length,beforeAuth,'authentication tokens never enter lead archive');
 const link=tables.betel_tracked_links[0],url=origin+'/l/'+link.id,ctx={params:Promise.resolve({id:link.id})};
 for(const headers of [{'user-agent':'WhatsApp'},{'sec-purpose':'prefetch'}])assert.equal((await route.GET(new Request(url,{headers}),ctx)).status,302);
 assert.equal((await route.HEAD(new Request(url,{method:'HEAD'}),ctx)).status,302);assert.equal(clicks.length,0,'HEAD/previews never record');
 const first=await route.GET(new Request(url),ctx);assert.equal(first.status,200);assert.match(await first.text(),/type="checkbox"/);assert.equal(first.headers.get('set-cookie'),null,'no implicit browser storage');assert.equal(clicks.length,0,'privacy landing not outbound click');
 const direct=new Request(url,{headers:{cookie:'betel_visit_choice=no'}});
 for(let i=0;i<2;i++){const result=await route.GET(direct,ctx);assert.equal(result.status,302);assert.equal(result.headers.get('location'),link.target_url);}
 assert.equal(clicks.length,2);assert.notEqual(clicks[0].event,clicks[1].event,'two clicks distinct');assert.ok(clicks.every(c=>!c.v));
 const post=await route.POST(new Request(url,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:'remember=yes'}),ctx);
 assert.equal(post.status,302);assert.match(post.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);assert.ok(clicks.at(-1).v,'opt-in associates anonymous browser');
 const before=clicks.length;
 assert.equal((await route.POST(new Request(url,{method:'POST',headers:{origin:'https://evil.example'},body:''}),ctx)).status,403);assert.equal(clicks.length,before,'CSRF cannot mutate');
 fail=true;assert.equal((await route.GET(direct,ctx)).status,503);assert.equal(clicks.length,before,'DB failure fails closed');fail=false;
 for(const target of ['javascript:alert(1)','http://localhost/x','https://user:pass@example.org','http://127.0.0.1/x'])assert.equal(native.safeNativeTarget(target),null);
 assert.equal(visitor.privacyDenied(new Request(url,{headers:{'sec-gpc':'1'}})),true);assert.equal(visitor.privacyDenied(new Request(url,{headers:{dnt:'1'}})),true);
 const timeline=loadSource('src/lib/whatsapp/journey-timeline.ts');
 const reply=timeline.interactiveReplyFromPayload({data:{message:{buttonsResponseMessage:{selectedButtonId:'visit',selectedDisplayText:'Quero visitar'}}}});
 assert.equal(reply.id,'visit');assert.equal(reply.label,'Quero visitar');
 assert.equal(timeline.interactiveReplyFromPayload({data:{message:{text:'Uma resposta normal',contextInfo:{quotedMessage:{buttonsResponseMessage:{selectedButtonId:'old'}}}}},chat:{lastMessage:{buttonsResponseMessage:{selectedButtonId:'snapshot'}}}}),null,'quoted and snapshot buttons are not new responses');
 const flow=timeline.interactiveReplyFromPayload({message:{interactiveResponseMessage:{nativeFlowResponseMessage:{paramsJson:'{"id":"continue","display_text":"Continuar"}'}}}});
 assert.equal(flow.id,'continue');assert.equal(flow.label,'Continuar');
 console.log('PASS native links: text/buttons, durable retry, group anonymity, local redirect, HEAD/preview exclusion, explicit consent, CSRF, privacy and quick replies. Network disabled; no campaign sends.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
