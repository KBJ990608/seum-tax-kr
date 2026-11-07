import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceDetail} from '../worker/nts.mjs';
import {hash,validateAnswer} from '../worker/core.mjs';
import {localDB} from '../scripts/db-local.mjs';
const item={source_id:'200000000000000001',kind:'case',title:'합성 확정 상태 검증',case_number:'합성2026누1',url:'https://taxlaw.nts.go.kr/pd/USEPDA002P.do?ntstDcmId=200000000000000001'};
const text='합성 본문이며 실제 판례나 법률 판단을 의미하지 않습니다. '.repeat(10);
const response=state=>({__officialFetch:async()=>Response.json({status:'SUCCESS',data:{ASIQTB002PR01:{dcmDVO:{ntstDcmId:item.source_id,ntstDcmDscmCntn:item.case_number,ntstDcmCntn:text,...(state===undefined?{}:{ntstLwsDfntYn:state})}}}})});
const answer={summary:'합성 검토',findings:[{text:'합성 결론',source_ids:['S1','S2']}],missing_facts:[],conflicts:[],confidence:'high',needs_expert:false,review_reasons:[]};
for(const [listing,detail,expected]of [['final','N','not_confirmed'],['final',undefined,'unknown'],['final','unexpected','unknown'],['final','Y','final'],['not_confirmed','Y','unknown'],['not_confirmed','N','not_confirmed'],['unknown','Y','final']])test(`detail finality ${listing}/${detail} resolves conservatively to ${expected}`,async()=>{
 const doc=await sourceDetail(response(detail),{...item,finality:listing});assert.equal(doc.finality,expected);
 const verdict=validateAnswer(answer,[{id:'S1',kind:'law',effective_from:'2026-01-01'},{...doc,id:'S2'}],'2026-11-06');
 assert.equal(verdict.needs_expert,expected!=='final');
 if(expected!=='final'){assert(doc.verification_notes.some(n=>n.includes('확정')));assert(verdict.review_reasons.some(n=>n.includes('확정')));}
 if(listing==='not_confirmed'&&detail==='Y')assert(doc.verification_notes.some(n=>n.includes('불일치')));
});
test('new parser cache namespace ignores stale final metadata but reuses verified detail',async()=>{
 const DB=localDB(),oldKey='nts:detail:'+await hash(JSON.stringify({parser:2,id:item.source_id,date:null}));
 await DB.prepare('INSERT INTO source_cache (key,payload,expires_at) VALUES (?,?,?)').bind(oldKey,JSON.stringify({...item,body:text,finality:'final'}),'2099-01-01T00:00:00.000Z').run();
 let reads=0;const upstream=response('N').__officialFetch,env={DB,__officialFetch:async(...args)=>{reads++;return upstream(...args);}};
 try{for(let i=0;i<2;i++)assert.equal((await sourceDetail(env,{...item,finality:'final'})).finality,'not_confirmed');assert.equal(reads,1);}finally{DB.close();}
});

test('new negative search status is reconciled even after a positive detail was cached',async()=>{
 const DB=localDB();let reads=0;const upstream=response('Y').__officialFetch,env={DB,__officialFetch:async(...args)=>{reads++;return upstream(...args);}};
 try{
  assert.equal((await sourceDetail(env,{...item,finality:'final'})).finality,'final');
  const doc=await sourceDetail(env,{...item,finality:'not_confirmed'});assert.equal(doc.finality,'unknown');assert.equal(reads,2);
  assert.equal(validateAnswer(answer,[{id:'S1',kind:'law',effective_from:'2026-01-01'},{...doc,id:'S2'}],'2026-11-06').needs_expert,true);
  assert.equal((await sourceDetail(env,{...item,finality:'not_confirmed'})).finality,'unknown');assert.equal(reads,2);
 }finally{DB.close();}
});
