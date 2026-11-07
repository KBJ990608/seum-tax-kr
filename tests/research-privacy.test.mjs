import test from 'node:test';
import assert from 'node:assert/strict';
import {researchPlan,retrieveKnowledge,issues} from '../worker/research.mjs';
import {localDB} from '../scripts/db-local.mjs';
// Synthetic identifiers, fake model replies and mocked transports only.
const model=plan=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(plan)}]}]});
const envFor=plan=>({OPENAI_API_KEY:'synthetic-only',__fetch:async()=>model(plan)});

test('automatic research uses only server-owned issue queries, never model free text',async()=>{
 const markers=['가상고객 010-0000-0000 증여','가상주소 12길 3','계좌 000-000-00000','fake@example.test','https://example.test/private','김가상 증여'];
 for(const marker of markers){
  const plan=await researchPlan(envFor({queries:[marker],issue_ids:['gift-burden']}),marker);
  assert.deepEqual(plan.queries,[issues.find(i=>i.id==='gift-burden').query]);assert(!JSON.stringify(plan).includes(marker));
 }
});
test('each known issue has a deterministic catalog query and duplicate ids are removed',async()=>{
 for(const issue of issues){const plan=await researchPlan(envFor({issue_ids:[issue.id,issue.id,'invented-private-id']}),'합성 질문');assert.deepEqual(plan,{queries:[issue.query],issue_ids:[issue.id]});}
 const ids=issues.slice(0,6).map(i=>i.id),plan=await researchPlan(envFor({issue_ids:ids}),'합성 질문');assert.deepEqual(plan.issue_ids,ids.slice(0,4));assert.deepEqual(plan.queries,issues.slice(0,2).map(i=>i.query));
});
test('missing or invalid classifications abstain before any official request',async()=>{
 for(const plan of [null,[],{},'bad',{issue_ids:'gift-burden'},{issue_ids:[null]}])await assert.rejects(researchPlan(envFor(plan),'합성 질문'),e=>e.code==='RESEARCH_PLAN_INVALID');
 for(const plan of [{queries:['상속공제'],issue_ids:[]},{issue_ids:['private-name']},{issue_ids:[]}])await assert.rejects(researchPlan(envFor(plan),'합성 질문'),e=>e.code==='SEARCH_TERMS_REQUIRED');
});
test('the actual NTS request contains only catalog terms and uses no identifier fallback',async()=>{
 const DB=localDB(),sent=[];
 const env={...envFor({queries:['가상고객 010-0000-0000 증여'],issue_ids:['gift-burden']}),DB,SEUM_LIVE_RESEARCH:'true',__officialFetch:async(url,options)=>{
  const params=new URLSearchParams(options.body);sent.push(JSON.parse(params.get('paramData')));
  return Response.json({status:'SUCCESS',data:{ASEISA001MR01:{searchResultVO:{collectionList:[]}}}});
 }};
 try{await retrieveKnowledge(env,'가상고객 010-0000-0000 증여',[],'2026-11-06');assert.equal(sent.length,1);assert.equal(sent[0].schVcb,issues.find(i=>i.id==='gift-burden').query);assert(!JSON.stringify(sent).includes('010-0000-0000'));}
 finally{DB.close();}
 const blocked={...envFor({queries:['가상고객'],issue_ids:[]}),SEUM_LIVE_RESEARCH:'true',__officialFetch:async()=>{throw Error('must not send');}};
 await assert.rejects(retrieveKnowledge(blocked,'합성 질문',[],'2026-11-06'),e=>e.code==='SEARCH_TERMS_REQUIRED');
});
test('planner requests only catalog ids with no free-text query output field',async()=>{
 let request;await researchPlan({OPENAI_API_KEY:'synthetic-only',__fetch:async(url,options)=>{request=JSON.parse(options.body);return model({issue_ids:['gift-burden']});}},'합성 질문');
 assert.deepEqual(Object.keys(request.text.format.schema.properties),['issue_ids']);assert.deepEqual(request.text.format.schema.properties.issue_ids.items.enum,issues.map(i=>i.id));
});
