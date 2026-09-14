/* eslint-disable @typescript-eslint/no-require-imports -- Offline regression harness. */
const assert = require('node:assert/strict');
const {loadSource} = require('./helpers/load-source.cjs');
const offline = {fetch:()=>{throw Error('No paid calls or WhatsApp in regressions');}};
const shared = loadSource('src/lib/admin/repository/shared.ts',{},offline);
const repository = loadSource('src/lib/admin/repository/market-analysis.ts',{'./shared':shared,'./data':{}},offline,['normalizePersistedAnalysis']);
const rental = loadSource('src/lib/domain/rental-references.ts');
const occupancy = loadSource('src/lib/domain/property-occupancy.ts');
const sourceUrl = i => `https://example.com/imovel/aluguel-apartamento-${10000+i}`;
const subject = {propertyType:'Apartamento',city:'Biguaçu',state:'SC',address:'Rua Jordelino João da Rosa, 421',neighborhood:'Vendaval',privateAreaM2:52.73,bedrooms:2,parkingSpaces:1};
const opportunity = {id:'fixture',title:'Apartamento Vendaval',...subject,summary:'',initialBid:172589,appraisalValue:340000};
const rents = Array.from({length:14},(_,i)=>({sourceUrl:sourceUrl(i),sourceLabel:'Provider fixture',listingType:'rent',propertyType:'Apartamento',city:'Biguaçu',state:'SC',neighborhood:i<2?'Vendaval':'Centro',areaM2:50,monthlyRent:1800,askingPrice:0,similarityScore:90-i,quality:'strong',collectedAt:'2026-09-14T12:00:00Z'}));
const sales = rents.map((r,i)=>({...r,sourceUrl:`https://example.com/imovel/venda-apartamento-${20000+i}`,listingType:'sale',monthlyRent:0,askingPrice:340000}));
const row = {id:'analysis',status:'human_review',subject_property_snapshot:subject,market_value_base:340000,market_value_low:310000,market_value_high:360000,estimated_costs:[{label:'Custos informados',value:20000}],raw_payload:{marketResearch:{saleComparables:sales,rentalComparables:rents},rentalEstimate:{monthlyRent:1800,valueKnown:true,referenceUrl:sourceUrl(0)}},property_market_comparables:sales.slice(0,12)};

async function main(){
  const analysis = repository.normalizePersistedAnalysis(row,opportunity,'opportunity-uuid');
  assert.equal(analysis.comparables.length,28,'recover all cached sales and rents from old truncated imports');
  assert.equal(analysis.comparables.filter(c=>c.listingType==='rent').length,14);
  assert.equal(analysis.comparables.find(c=>c.sourceUrl===sourceUrl(0)).askingPrice,1800,'rent uses monthlyRent, never askingPrice sale fallback');
  assert.equal(new Set(analysis.comparables.map(c=>c.id)).size,28);
  const discarded = repository.normalizePersistedAnalysis({...row,property_market_comparables:[...row.property_market_comparables,{...rents[0],quality:'discarded'}]},opportunity,'opportunity-uuid');
  assert.ok(!rental.selectRentalReferences(discarded).some(c=>c.url===sourceUrl(0)),'manual discard overrides cached result');
  assert.equal(rental.selectRentalReferences(analysis).length,3);
  assert.equal(rental.rentalReferenceCandidates(analysis)[0].neighborhood,'Vendaval');
  for(const change of [{listingType:'sale'},{city:'Outra cidade'},{state:'PR'},{propertyType:'Casa'},{areaM2:300},{askingPrice:340000},{quality:'discarded'},{sourceUrl:'https://example.com/aluguel'}]){
    assert.equal(rental.selectRentalReferences({...analysis,comparables:analysis.comparables.filter(c=>c.listingType==='rent').map(c=>({...c,...change}))}).length,0);
  }
  const duplicated = {...analysis,comparables:[analysis.comparables.find(c=>c.listingType==='rent')]};
  duplicated.comparables.push({...duplicated.comparables[0],sourceUrl:duplicated.comparables[0].sourceUrl+'?utm_source=test'});
  assert.equal(rental.selectRentalReferences(duplicated).length,1);
  assert.equal(rental.rentalEconomics(analysis).acquisitionCost,192589);
  assert.ok(rental.rentalEconomics(analysis).grossAnnualYieldPct < 1800*12/172589*100,'costs reduce gross acquisition yield');
  assert.equal(occupancy.confirmedOccupancy('Outras Oportunidades Veículos Bens Diversos Imóveis desocupados Próximos Leilões'),'');
  assert.equal(occupancy.occupancyFromListingText('Imóveis desocupados Imóvel ocupado Este imóvel encontra-se ocupado no momento.'),'Ocupado');
  assert.equal(occupancy.confirmedOccupancy('Não ocupado'),'Desocupado');
  const adapter=loadSource('src/lib/scraper/auction-site-adapters.ts',{},offline);
  const result=adapter.extractAuctionSiteContext({sourceUrl:'https://www.portalzuk.com.br/imovel/sc/biguacu/vendaval/rua-exemplo/37082-231208',sourceDomain:'portalzuk.com.br',html:'<html><title>Leilão de Apartamento - Vendaval - Biguaçu/SC</title><nav>Outras Oportunidades Veículos Bens Diversos Imóveis desocupados</nav><main><h1>Apartamento Vendaval Biguaçu/SC</h1><span>Imóvel ocupado</span><div>Bairro Cj 2 Res. Oliveira</div></main></html>'});
  assert.equal(result.extraction.occupancy,'Ocupado');
  assert.equal(result.extraction.neighborhood,'vendaval','canonical property route wins over unrelated page cards');
  const creative = loadSource('src/lib/whatsapp/opportunity-publication.ts',{'@/inngest/client':{},'./group-campaigns':{},'@/lib/communication/connectyhub-client':{},'@/lib/communication/system-whatsapp-sender':{}},offline);
  const status=creative.getOpportunityWhatsAppReferenceStatus(analysis);
  assert.equal(status.candidateCount,3);
  assert.equal(status.validCount,0);
  assert.equal(status.ready,false,'candidates do not imply verified approved publication');
  let checked=[];
  const prep=loadSource('src/lib/market/prepare-rental-references.ts',{'./reference-access':{verifyMarketReference:async url=>{checked.push(url);return{ok:url!==sourceUrl(0),checkedAt:new Date().toISOString(),...(url===sourceUrl(0)?{error:'HTTP 403'}:{})};}}},offline);
  const prepared=await prep.prepareRentalReferences(analysis);
  assert.equal(prepared.references.length,3,'try other pertinent candidates after failed access');
  assert.ok(checked.length>3);
  assert.ok(!prepared.references.some(c=>c.url===sourceUrl(0)),'HTTP 403 never passes verification');
  assert.equal(analysis.status,'human_review','preparation cannot approve');
  const research=loadSource('src/lib/scraper/deep-market-research.ts',{'@/lib/ai/config':{},'@/lib/geckoapi/client':{},'@/lib/google-maps/client':{},'@/lib/brightdata/client':{},'@/lib/apify/client':{}},offline,['extractRentPrice','calculateRental']);
  assert.equal(research.extractRentPrice('Condomínio R$ 450 IPTU R$ 70 Aluguel R$ 1.450,00'),1450);
  assert.equal(research.extractRentPrice('Aluguel Condomínio R$ 450 Venda R$ 320.000'),0,'navigation rental label cannot turn expenses or sale into rent');
  assert.equal(research.calculateRental(subject,rents.slice(0,2),340000).monthlyRent,0,'two ads do not meet three-reference requirement');
  const {EventEmitter}=require('node:events');
  const requests=[];
  const access=loadSource('src/lib/market/reference-access.ts',{
    'node:dns/promises':{lookup:async()=>[{address:'203.0.113.8',family:4}]},
    'node:https':{request:(url,options,callback)=>{
      const req=new EventEmitter();req.destroy=()=>{};
      req.end=()=>{const target=url.toString();requests.push(target);const res=new EventEmitter();res.setEncoding=()=>{};res.destroy=()=>{};
        res.statusCode=target.endsWith('/')?200:301;res.headers={'content-type':'text/html',...(res.statusCode===301?{location:target+'/'}:{})};
        callback(res);res.emit('data','<html><title>Apartamento para alugar</title></html>');res.emit('end');};return req;
    }},
  },offline);
  assert.equal((await access.verifyMarketReference(sourceUrl(0))).ok,true,'valid trailing-slash redirect is followed exactly');
  assert.deepEqual(requests,[sourceUrl(0),sourceUrl(0)+'/']);
  console.log('Rental recovery, relevance, approval distinction, free preparation, occupancy and acquisition yield regressions passed (offline).');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
