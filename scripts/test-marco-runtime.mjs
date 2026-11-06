import {Miniflare} from 'miniflare';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runtimeModules} from './runtime-modules.mjs';
import {MARCO_QUESTIONS} from '../worker/marco.mjs';
let outboundCalls=0;
const mf=new Miniflare({modules:runtimeModules(),compatibilityDate:'2026-07-30',compatibilityFlags:['nodejs_compat'],outboundService:()=>{outboundCalls++;throw Error('Unexpected outbound request');}});
const request=async(path,data)=>{const r=await mf.dispatchFetch('https://seum.test'+path,{method:data?'POST':'GET',headers:{Origin:'https://seum.test','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return {status:r.status,data:await r.json()}};
try{
 const began=Date.now();const health=await request('/api/marco/status');assert.equal(health.status,200);assert.equal(health.data.engine_verified,true);assert.equal(health.data.runtime,'sites_worker_cpython_wasm');
 const coldMs=Date.now()-began;let nativeAnswers=0,calculations=0;
 for(const [topic,question]of Object.entries(MARCO_QUESTIONS)){
  const r=await request('/api/marco/question',{question,as_of:'2026-11-06',consent:true});assert.equal(r.status,200,JSON.stringify({topic,response:r.data}));assert.equal(r.data.result.topic,topic);assert.equal(r.data.result.native_evidence.engine,'MARCO engine.Session');nativeAnswers++;
 }
 for(const tax_type of ['gift','inheritance'])for(const tax_base_won of [0,499999,500000,500001,100000000,100000001,600000000]){
  const r=await request('/api/marco/evaluate',{tax_type,as_of:'2026-11-06',amount_kind:'tax_base',tax_base_won,basic_rate_only:true,consent:true});assert.equal(r.status,200);assert.equal(r.data.result.status,'computed');assert.equal(r.data.result.below_minimum,tax_base_won<500000);calculations++;
 }
 const concurrent=await Promise.all(Object.values(MARCO_QUESTIONS).map(question=>request('/api/marco/question',{question,as_of:'2026-11-06',consent:true})));assert.ok(concurrent.every(r=>r.status===200));
 assert.equal((await request('/api/marco/question',{question:"__import__('os').system('false')",as_of:'2026-11-06',consent:true})).status,400);
 assert.equal((await request('/api/marco/question',{question:Object.values(MARCO_QUESTIONS)[0],as_of:'2027-01-01',consent:true})).status,422);
 assert.equal(outboundCalls,0);
 const report={passed:true,runtime:'Cloudflare workerd via Miniflare',coldMs,nativeAnswers,calculations,concurrentAnswers:concurrent.length,outboundCalls,inputAndDateRejections:2,provenance:health.data,limitations:['Local runtime test, not production reliability or complete legal review']};
 fs.writeFileSync('docs/marco-runtime-test.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await mf.dispose()}
