/* eslint-disable @typescript-eslint/no-require-imports -- Offline routing contract tests. */
const assert=require('node:assert/strict');const {loadSource}=require('./helpers/load-source.cjs');
const id='11111111-1111-4111-8111-111111111111',origin='https://betel-leil-es.vercel.app';
let connection={baseUrl:'https://www.connectyhub.com.br/api/v1',apiToken:'private-test-key'},calls=[],destination='https://ibagy.com.br/imovel/134353',upstreamStatus=200;
const subject=loadSource('src/lib/communication/branded-links.ts',{'./connectyhub-client':{getConnectyHubLinkConnection:async()=>connection}},{Request,Response,Headers,process:{env:{BETEL_PUBLIC_APP_URL:origin}},fetch:async(url,options)=>{
 calls.push({url,options});if(upstreamStatus!==200)return new Response(null,{status:upstreamStatus,headers:{Location:'https://untrusted.example'}});
 return options.method==='HEAD'?new Response(null,{status:302,headers:{Location:destination}}):Response.json({ok:true,destination});
}});
const request=(method='GET',headers={})=>new Request(origin+'/w/'+id+'?destination=https://untrusted.example',{method,headers});
(async()=>{
for(const target of ['https://ibagy.com.br/imovel/134353','https://ibagy.com.br/imovel/134151','https://imobiliariabiguacu.com.br/imovel/5424','https://www.portalzuk.com.br/imovel/sc/biguacu/vendaval/rua-jordelino-joao-da-rosa-421/37082-231208']){
 destination=target;const r=await subject.redirectBetelTrackedLink(request(),id);assert.equal(r.status,302);assert.equal(r.headers.get('location'),target);assert.equal(r.headers.get('authorization'),null);assert.equal(r.headers.get('cache-control'),'private, no-store');
}
assert.ok(calls.every(c=>c.url==='https://www.connectyhub.com.br/api/v1/links/'+id+'/resolve'&&c.options.redirect==='manual'&&c.options.headers.authorization==='Bearer private-test-key'));
for(const req of [request('HEAD'),request('GET',{'user-agent':'WhatsApp'}),request('GET',{'sec-purpose':'prefetch'})]){await subject.redirectBetelTrackedLink(req,id);assert.equal(calls.at(-1).options.method,'HEAD','previews and HEAD cannot count clicks');}
const before=calls.length;assert.equal((await subject.redirectBetelTrackedLink(request(),'../../other')).status,404);assert.equal(calls.length,before);
for(const code of [403,404,410]){upstreamStatus=code;assert.equal((await subject.redirectBetelTrackedLink(request(),id)).status,404);}
for(const code of [301,401,500]){upstreamStatus=code;assert.equal((await subject.redirectBetelTrackedLink(request(),id)).status,503);}
upstreamStatus=200;
for(const target of ['javascript:alert(1)','https://user:secret@example.com','http://127.0.0.1/private','http://localhost./private',origin+'/w/'+id,'https://www.connectyhub.com.br/w/'+id]){destination=target;assert.equal((await subject.redirectBetelTrackedLink(request(),id)).status,503);}
connection={...connection,baseUrl:'https://untrusted.example/api/v1'};const beforeBadOrigin=calls.length;assert.equal((await subject.redirectBetelTrackedLink(request(),id)).status,503);assert.equal(calls.length,beforeBadOrigin,'credentials never leave trusted API origin');
const canonical=env=>loadSource('src/lib/public-origin.ts',{}, {process:{env}}).getBetelPublicOrigin();
assert.equal(canonical({VERCEL_URL:'temporary-preview.example'}),origin);
assert.equal(canonical({BETEL_PUBLIC_APP_URL:'https://configured.example/'}),'https://configured.example');
for(const value of ['http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com/?host=evil'])assert.throws(()=>canonical({BETEL_PUBLIC_APP_URL:value}));
console.log('Branded links: four approved destinations, auth isolation, manual redirects, preview/HEAD, account denial and canonical origin passed offline.');
})().catch(e=>{console.error(e);process.exitCode=1;});
