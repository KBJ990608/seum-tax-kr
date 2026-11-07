import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {marcoStatus,marcoEvaluate,marcoQuestion,MARCO_QUESTIONS,MARCO_CONTRACT} from '../worker/marco.mjs';
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/marco-contract.json','utf8'));
const scenario={tax_type:'gift',as_of:'2026-11-06',amount_kind:'tax_base',tax_base_won:499999,basic_rate_only:true,consent:true};
function env(result=fixture.success,health=fixture.health){const calls=[];return {calls,MARCO_SERVICE_URL:'https://marco.example.test',__marcoFetch:async(url,options)=>{calls.push({url,options});return Response.json(url.endsWith('/health')?health:result);}};}
test('MARCO is unavailable without a configured endpoint, never a fabricated success',async()=>{const result=await marcoStatus({});assert.equal(result.configured,false);assert.equal(result.engine_verified,false);await assert.rejects(marcoEvaluate({},scenario),e=>e.code==='MARCO_NOT_VERIFIED');});
test('MARCO health validates exact upstream and knowledge hash, execution scope and no LLM',async()=>{assert.equal((await marcoStatus(env())).engine_verified,true);for(const changes of [{upstream_commit:'wrong'},{knowledge_sha256:'wrong'},{llm_used:true},{request_persistence:true},{execution_mode:'unknown'}])assert.equal((await marcoStatus(env(fixture.success,{...fixture.health,...changes}))).engine_verified,false);});
test('MARCO rejects unsupported/private endpoint forms without a network request',async()=>{for(const url of ['http://marco.example.test','https://127.0.0.1','https://localhost','https://x.local','https://marco.example.test/path','https://user:pass@marco.example.test','https://marco.example.test/?secret=a']){const e={...env(),MARCO_SERVICE_URL:url};assert.equal((await marcoStatus(e)).engine_verified,false);assert.equal(e.calls.length,0);}});
test('MARCO requires consent, strict fields, integer money and validated bounded date before any request',async()=>{for(const input of [{...scenario,consent:false},{...scenario,contact:'do-not-send@example.test'},{...scenario,tax_base_won:0.5},{...scenario,tax_base_won:true},{...scenario,amount_kind:'total_assets'},{...scenario,as_of:'2026-11-07'},{...scenario,as_of:'2026-02-30'},{...scenario,tax_type:'transfer'}]){const e=env();await assert.rejects(marcoEvaluate(e,input));assert.equal(e.calls.length,0);}});
test('MARCO forwards only five structured fields and keeps exact zero, sources, provenance',async()=>{const e=env();const out=await marcoEvaluate(e,scenario);assert.equal(out.result.basic_tax_won,0);assert.equal(out.integration.knowledge_sha256,MARCO_CONTRACT.knowledge_sha256);const sent=JSON.parse(e.calls[1].options.body);assert.deepEqual(sent,{tax_type:'gift',as_of:'2026-11-06',amount_kind:'tax_base',tax_base_won:499999,basic_rate_only:true});assert.equal(e.calls[1].options.redirect,'error');});
test('MARCO rejects wrong result versions, inputs, unsupported arithmetic or fabricated source URLs',async()=>{for(const patch of [{knowledge_sha256:'changed'},{tax_type:'inheritance'},{tax_base_won:500000},{basic_tax_won:49999},{below_minimum:false},{source_ids:['invented']},{sources:[{...fixture.success.sources[0],url:'https://law.go.kr.evil.test'}]}])await assert.rejects(marcoEvaluate(env({...fixture.success,...patch}),scenario));});
test('MARCO semantic abstention stays abstention, never a zero-tax result',async()=>{const out=await marcoEvaluate(env(fixture.abstain),scenario);assert.equal(out.result.status,'unsupported');assert.equal(out.result.basic_tax_won,null);await assert.rejects(marcoEvaluate(env({...fixture.abstain,basic_tax_won:0}),scenario));});

test('native MARCO question requires matching graph proof and preserves sources',async()=>{
 const e=env(fixture.question),input={question:MARCO_QUESTIONS['death-gift'],as_of:'2026-11-06',consent:true};
 const out=await marcoQuestion(e,input);assert.equal(out.result.tax_type,'inheritance');assert.equal(out.result.native_evidence.engine,'MARCO engine.Session');assert.deepEqual(JSON.parse(e.calls[1].options.body),{question:input.question,as_of:input.as_of});
 for(const patch of [{topic:'gift-definition'},{as_of:'2026-11-07'},{basic_tax_won:0},{native_evidence:{...fixture.question.native_evidence,engine:'JavaScript'}},{native_evidence:{...fixture.question.native_evidence,path:[]}}])await assert.rejects(marcoQuestion(env({...fixture.question,...patch}),input));
});
test('undeclared or malformed MARCO questions never reach engine',async()=>{
 for(const patch of [{question:'임의의 개인정보가 담긴 질문'},{as_of:'2026-11-07'},{consent:false},{contact:'synthetic@example.test'}]){
  const e=env(fixture.question);await assert.rejects(marcoQuestion(e,{question:MARCO_QUESTIONS['death-gift'],as_of:'2026-11-06',consent:true,...patch}));assert.equal(e.calls.length,0);
 }
});
test('Sites local runtime uses no network and retains separate training provenance',async()=>{
 let calls=[];const e={__marcoRuntime:{health:async()=>({...fixture.health,runtime:'sites_worker_cpython_wasm',training_commit:'3a4383b9b52739f65d730dee0dba7cac2c274c18'}),dispatch:async(path,input)=>{calls.push({path,input});return fixture.success;}}};
 const out=await marcoEvaluate(e,scenario);assert.equal(out.result.basic_tax_won,0);assert.equal(out.integration.runtime,'sites_worker_cpython_wasm');assert.equal(out.integration.service_origin,null);assert.equal(calls[0].path,'/evaluate');
});

test('calculation evidence must cite the applied tax-specific rule, not merely an allowed source',async()=>{
 const unrelated=fixture.question.sources[0];
 for(const patch of [
  {sources:[unrelated],source_ids:[unrelated.id],rule_trace:['placeholder without applied rule']},
  {rule_trace:[{...fixture.success.rule_trace[0],right_won:500001}]},
  {rule_trace:[{...fixture.success.rule_trace[0],result:false}]},
  {rule_trace:[{...fixture.success.rule_trace[0],source_ids:['ita-2']}]},
  {rate_percent:10},{progressive_deduction_won:0},
  {source_ids:[...fixture.success.source_ids,...fixture.success.source_ids]},
 ])await assert.rejects(marcoEvaluate(env({...fixture.success,...patch}),scenario),e=>e.code==='MARCO_RESULT_UNVERIFIED');
});
test('question proof must match the pinned answer, exact fact trace and connected graph path',async()=>{
 const input={question:MARCO_QUESTIONS['death-gift'],as_of:'2026-11-06',consent:true};
 for(const patch of [
  {answer:'다른 답변',native_evidence:{...fixture.question.native_evidence,graph_answer:'다른 답변'}},
  {rule_trace:[{...fixture.question.rule_trace[0],fact_id:'gift-minimum'}]},
  {source_ids:fixture.success.source_ids,sources:fixture.success.sources},
  {native_evidence:{...fixture.question.native_evidence,path:[['a','b','c'],['x','y','z']]}},
  {native_evidence:{...fixture.question.native_evidence,graph_node:'gift_minimum'}},
  {tax_type:'gift'},
 ])await assert.rejects(marcoQuestion(env({...fixture.question,...patch}),input),e=>e.code==='MARCO_RESULT_UNVERIFIED');
});
