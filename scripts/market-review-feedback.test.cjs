/* eslint-disable @typescript-eslint/no-require-imports -- Offline UI regression harness. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {loadSource}=require('./helpers/load-source.cjs');
const {marketReviewNotices}=loadSource('src/lib/domain/market-review-feedback.ts');
const actions=loadSource('src/app/admin/oportunidades/actions.ts',{'next/cache':{},'next/navigation':{},'@/lib/auth/admin':{},'@/lib/admin/repository':{},'@/lib/scraper':{},'@/lib/whatsapp/opportunity-publication':{},'@/lib/whatsapp/group-campaigns':{}},{fetch:()=>{throw Error('Network prohibited');}},['workflowApprovalParam']);
for(const stage of ['market_review','legal_review','validation','creative','communication','unknown']) {
  const outcome=actions.workflowApprovalParam(stage);
  assert.ok(marketReviewNotices[outcome]?.title,`Missing user feedback for successful ${stage} redirect: ${outcome}`);
}
assert.ok(marketReviewNotices.salva);
let status={pending:false,data:null};
const compiled={exports:{}};
const code=ts.transpileModule(fs.readFileSync('src/components/admin/opportunity-detail/ReviewSubmitButton.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
vm.runInNewContext(code,{exports:compiled.exports,module:compiled,require:name=>name==='react-dom'?{useFormStatus:()=>status}:name==='@/components/ui/button'?{Button:props=>React.createElement('button',props)}:require(name)});
const {ReviewSubmitButton,ReviewSubmissionProgress}=compiled.exports;
const button=value=>renderToStaticMarkup(React.createElement(ReviewSubmitButton,{name:'submitStatus',type:'submit',value},'Aprovar sem envio'));
assert.doesNotMatch(button('approved'),/disabled=/);
assert.equal(renderToStaticMarkup(React.createElement(ReviewSubmissionProgress)),'');
const data=new FormData();data.set('submitStatus','approved');status={pending:true,data};
assert.match(button('approved'),/Verificando e aprovando/);
assert.match(button('approved'),/disabled=""/);
assert.match(button('human_review'),/disabled=""/,'other review actions must wait too');
assert.match(renderToStaticMarkup(React.createElement(ReviewSubmissionProgress)),/role="status"/);
data.set('submitStatus','approve_send_test');
assert.equal(renderToStaticMarkup(React.createElement(ReviewSubmissionProgress)),'','WhatsApp owns its separate progress feedback');
console.log('Every workflow success redirect has feedback; review buttons indicate progress and prevent repeat clicks (offline).');
