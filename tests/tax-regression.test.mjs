import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateTax,proposeTaxInputs} from '../worker/tax.mjs';
const base={transaction_date:'2026-11-02',confirmed:true};
const field=(name,value,quote,origin='user_stated')=>({field:name,value_won:value,quote,origin,reason:'합성 테스트',source_ids:[]});
function envFor(fields,onRequest=()=>{}){return {OPENAI_API_KEY:'synthetic-test-only',__fetch:async(url,options)=>{onRequest(JSON.parse(options.body));return Response.json({status:'completed',model:'test-model',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({fields,unsupported_conditions:[]})}]}]});}};}
for(const tax_kind of ['증여세','상속세'])test(`${tax_kind}: 500,000 KRW tax-base floor is strict and applied after deductions`,()=>{
 for(const [amount,expected] of [[0,0],[499999,0],[500000,50000],[500001,50000]]){
  const result=calculateTax({...base,tax_kind,inputs:{amount,debt:0,prior:0,deduction:0}});
  assert.equal(result.taxable_base,amount);assert.equal(result.calculated_tax,expected);
  if(amount<500000)assert.match(result.steps[1].formula,/50만원 미만/);
 }
 const deducted=calculateTax({...base,tax_kind,inputs:{amount:1000000,debt:1,prior:0,deduction:500000}});
 assert.equal(deducted.taxable_base,499999);assert.equal(deducted.calculated_tax,0);
});
test('inheritance/gift floor is not applied to transfer income tax',()=>{
 const result=calculateTax({...base,tax_kind:'양도소득세',inputs:{amount:499999,acquisition:0,cost:0,deduction:0,basic_deduction:0}});
 assert.equal(result.calculated_tax,29999);
});
test('explicit numeric zero and field-qualified absence survive proposal validation',async()=>{
 const fields=[field('amount',1000000,'100만원'),field('debt',0,'채무 없음'),field('prior',0,'사전증여는 없습니다'),field('deduction',0,'0원')];
 const result=await proposeTaxInputs(envFor(fields),'상속재산 100만원, 채무 없음, 사전증여는 없습니다. 공제 합계액 0원','상속세',[]);
 assert.deepEqual(result.fields.map(f=>f.value_won),[1000000,0,0,0]);assert.deepEqual(result.missing_fields,[]);assert.deepEqual(result.warnings,[]);
});
test('unspecified and ambiguous zero quotes remain unknown',async()=>{
 for(const quote of ['없음','채무 없음','채무가 없는지는 모릅니다']){
  const result=await proposeTaxInputs(envFor([field('prior',0,quote)]),quote,'증여세',[]);
  assert.equal(result.fields[0].value_won,null);assert(result.missing_fields.includes('prior'));
 }
 const result=await proposeTaxInputs(envFor([field('debt',0,'','unknown')]),'증여 예정','증여세',[]);
 assert.equal(result.fields[0].value_won,null);
});
test('proposal rejects wrong tax-kind fields and invalid tax kind',async()=>{
 await assert.rejects(proposeTaxInputs(envFor([field('acquisition',0,'0원')]),'0원','증여세',[]),e=>e.code==='INVALID_TAX_PROPOSAL');
 await assert.rejects(proposeTaxInputs(envFor([field('prior',0,'0원')]),'0원','양도소득세',[]),e=>e.code==='INVALID_TAX_PROPOSAL');
 await assert.rejects(proposeTaxInputs(envFor([]),'','취득세',[]),e=>e.code==='TAX_KIND_REQUIRED');
});
test('AI schema and prompt use only the selected tax-kind fields',async()=>{
 for(const taxKind of ['상속세','증여세','양도소득세'])await proposeTaxInputs(envFor([],request=>{
  const input=JSON.parse(request.input),allowed=request.text.format.schema.properties.fields.items.properties.field.enum;
  assert.deepEqual(Object.keys(input.fields),allowed);assert.equal(input.tax_kind,taxKind);
  assert.equal(allowed.includes('acquisition'),taxKind==='양도소득세');
  assert.equal(input.fields.deduction,taxKind==='양도소득세'?'장기보유특별공제액':'공제 합계액');
 }),'합성 사례',taxKind,[]);
});
