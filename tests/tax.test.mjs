import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateTax,parseMoney,proposeTaxInputs} from '../worker/tax.mjs';
import {validateAnswer} from '../worker/core.mjs';
import worker from '../dist/server/index.js';
import {localDB} from '../scripts/db-local.mjs';
const origin='https://seum.example',cookie='seum_session='+'f'.repeat(64),request=(path,data,otherCookie=cookie)=>new Request(origin+path,{method:'POST',headers:{Origin:origin,Cookie:otherCookie,'Content-Type':'application/json'},body:JSON.stringify(data)});
const base={tax_kind:'상속세',transaction_date:'2026-11-02',confirmed:true,inputs:{amount:1500000000,debt:0,prior:0,deduction:500000000}};
const reply={summary:'검증용 조건 검토입니다.',findings:[{text:'검증된 법령을 기준으로 조건을 확인합니다.',source_ids:['S1']}],comparisons:[{subject:'고객 사례와 법령',source_ids:['S1'],common_points:'공통 조건',differences:'확인되지 않은 사실',application_notes:'추가 자료 검토'}],recommendations:[],follow_up_questions:[],missing_facts:['공제 적용 조건'],review_items:[],conflicts:[],confidence:'medium',needs_expert:true,review_reasons:[]};
function generated(payload){return Response.json({status:'completed',id:'resp-fixture',model:'test-model',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(payload)}]}]});}
async function fixture(){const env={DB:localDB(),OPENAI_API_KEY:'test-only'};await env.DB.prepare("INSERT INTO settings VALUES ('vector_store_id','vs-fixture')").run();await env.DB.prepare('INSERT INTO documents (id,title,kind,url,body,effective_from,digest,file_id,status,verified_by,verified_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind('law','검증용 법령','law','https://www.law.go.kr/법령/상속세및증여세법','검증용 본문','2026-01-01','digest','file-fixture','active','test',new Date().toISOString()).run();return env;}
test('inheritance and gift progressive bracket boundaries use integer won arithmetic',()=>{
 const expected=[[0,0],[499999,0],[500000,50000],[500001,50000],[100000000,10000000],[100000001,10000000],[500000000,90000000],[1000000000,240000000],[3000000000,1040000000],[4000000000,1540000000]];
 for(const tax_kind of ['상속세','증여세'])for(const [amount,tax]of expected)assert.equal(calculateTax({...base,tax_kind,inputs:{amount,debt:0,prior:0,deduction:0}}).calculated_tax,tax);
 assert.equal(calculateTax(base).calculated_tax,240000000);assert.equal(calculateTax({...base,inputs:{amount:0,debt:0,prior:0,deduction:500000000}}).calculated_tax,0);
});
test('transfer uses user-confirmed expenses and remaining annual deduction with separate local estimate',()=>{
 const result=calculateTax({...base,tax_kind:'양도소득세',inputs:{amount:1000000000,acquisition:600000000,cost:10000000,deduction:0,basic_deduction:2500000}});assert.equal(result.taxable_base,387500000);assert.equal(result.calculated_tax,129060000);assert.equal(result.local_tax_estimate,12906000);
 assert.throws(()=>calculateTax({...base,tax_kind:'양도소득세',inputs:{amount:1,acquisition:0,cost:0,deduction:0,basic_deduction:2500001}}),e=>e.code==='INVALID_BASIC_DEDUCTION');
});
test('unknown amounts, unsupported dates, noninteger money and unconfirmed assumptions are refused',()=>{
 assert.throws(()=>calculateTax({...base,confirmed:false}),e=>e.code==='CONFIRM_INPUTS');assert.throws(()=>calculateTax({...base,transaction_date:'2027-01-01'}),e=>e.code==='RATE_VERSION_UNSUPPORTED');assert.throws(()=>calculateTax({...base,inputs:{amount:100}}),e=>e.code==='MISSING_MONEY');for(const value of [-1,.5,false,' ',Infinity,1e18])assert.throws(()=>calculateTax({...base,inputs:{...base.inputs,amount:value}}));
});
test('Korean amount extraction validates explicit units and rejects guessed or malformed expressions',()=>{
 assert.equal(parseMoney('15억원'),1500000000);assert.equal(parseMoney('1억 5,000만원'),150000000);assert.equal(parseMoney('2천만원'),20000000);assert.equal(parseMoney('1천5백만원'),15000000);assert.equal(parseMoney('2억 3천 5백만원'),235000000);assert.equal(parseMoney('1만2억'),null);assert.equal(parseMoney('0원'),0);assert.equal(parseMoney('10억 이상'),null);assert.equal(parseMoney('미정'),null);
});
test('AI proposal cannot silently change the customer amount or cite an invented legal basis',async()=>{
 const evidence=[{id:'S1'}],question='재산은 15억원입니다.';const fields=[{field:'amount',value_won:150000000,origin:'user_stated',quote:'15억원',reason:'잘못된 단위 변환',source_ids:[]}];
 const env={OPENAI_API_KEY:'fixture',__fetch:async()=>generated({fields,unsupported_conditions:[]})};const result=await proposeTaxInputs(env,question,'상속세',evidence);assert.equal(result.fields[0].value_won,null);assert(result.warnings.length);
 env.__fetch=async()=>generated({fields:[{field:'deduction',value_won:500000000,origin:'legal_rule',quote:'',reason:'가상 근거',source_ids:['S99']}],unsupported_conditions:[]});await assert.rejects(proposeTaxInputs(env,question,'상속세',evidence),e=>['INVALID_TAX_PROPOSAL','UNVERIFIED_CITATION'].includes(e.code));
});
test('tax AI and comparison use retrieved evidence; confirmed calculation is saved to the same owner review',async()=>{
 const env=await fixture(),calls=[];env.__fetch=async(url,options)=>{if(url.endsWith('/search'))return Response.json({data:[{file_id:'file-fixture',score:.9,content:[{type:'text',text:'검증용 법령 원문입니다. 실제 세무 자문이 아닌 테스트 자료로, 공제 적용 조건을 확인하는 구간입니다.'}]}]});const data=JSON.parse(options.body);calls.push(data);if(data.text.format.name==='tax_input_proposal')return generated({fields:[{field:'amount',value_won:1500000000,origin:'user_stated',quote:'15억원',reason:'고객 명시 금액',source_ids:[]}],unsupported_conditions:['공제 적용 사실관계 추가 확인']});return generated(reply);};
 const input={tax_kind:'상속세',question:'상속재산 15억원에 공제를 적용하려 합니다.',transaction_date:'2026-11-02',consent:true,request_key:'tax-analysis-fixture-123'};
 const response=await worker.fetch(request('/api/tax/analyze',input),env,{}),data=await response.json();assert.equal(response.status,201);assert.equal(data.case.answer.tax_proposal,undefined);const proposalResponse=await worker.fetch(request('/api/tax/proposal',{case_id:data.case.id}),env,{});const proposal=await proposalResponse.json();assert.equal(proposalResponse.status,200);assert.equal(proposal.case.answer.tax_proposal.fields[0].value_won,1500000000);const before=calls.length;assert.equal((await worker.fetch(request('/api/tax/proposal',{case_id:data.case.id}),env,{})).status,200);assert.equal(calls.length,before);
 const computed=await worker.fetch(request('/api/tax/calculate',{...base,case_id:data.case.id}),env,{});assert.equal(computed.status,200);const saved=await env.DB.prepare('SELECT answer FROM consultations WHERE id=?').bind(data.case.id).first();assert.equal(JSON.parse(saved.answer).calculation.calculated_tax,240000000);
 const denied=await worker.fetch(request('/api/tax/calculate',{...base,case_id:data.case.id},'seum_session='+'a'.repeat(64)),env,{});assert.equal(denied.status,404);
 const compared=await worker.fetch(request('/api/research/analyze',{question:'배우자와 자녀 둘이 상속하는 사례입니다.',query:'일괄공제',transaction_date:'2026-11-02',consent:true,request_key:'comparison-fixture-123'}),env,{});const result=await compared.json();assert.equal(compared.status,201);assert.equal(result.case.answer.answer.comparisons.length,1);assert(calls.at(-1).instructions.includes('common facts'));env.DB.close();
});
test('comparative reasoning rejects source ids absent from retrieved documents',()=>{assert.throws(()=>validateAnswer({...reply,comparisons:[{...reply.comparisons[0],source_ids:['S404']}]},[{id:'S1',kind:'law',effective_from:'2026-01-01'}],'2026-11-02'),e=>e.code==='UNVERIFIED_CITATION');});
