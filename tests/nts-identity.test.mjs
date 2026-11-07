import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceDetail,searchOfficial} from '../worker/nts.mjs';
import {localDB} from '../scripts/db-local.mjs';
import {hash} from '../worker/core.mjs';
// Entirely synthetic metadata and bodies, never live legal evidence.
const item={source_id:'synthetic-law',kind:'law',title:'검증법 제95조',law_title:'검증법',basis_id:'123',version_id:'456',article_id:'0095005',promulgation_number:'30000',effective_from:'2027-01-01',url:'https://taxlaw.nts.go.kr/st/USESTA002M.do?ntstBscId=123&ntstBrkdId=456'};
const text='합성 원문이며 실제 법률 판단에 사용할 수 없는 검증 문장입니다.';
const selected={ntstEnfrDt:'20260102',ntstBrkdId:'200',ntstPmgNo:'21065'};
function fixture(history){const calls=[];return {calls,env:{__officialFetch:async(url,options)=>{
 const form=new URLSearchParams(options.body),action=form.get('actionId'),params=JSON.parse(form.get('paramData'));calls.push({action,params});
 return Response.json({status:'SUCCESS',data:{[action]:{txaStttHsryDVOList:action==='ASISTA005PR01'?history:[{ntstBscId:'123',ntstBrkdId:params.ntstBrkdId,ntstTextUqno:'0095005',ntstTextUqnm:'제95조',ntstTextCntn:text}]}}});
}}};}
test('historical law body, URL, version and promulgation metadata describe one selected version',async()=>{
 const {env,calls}=fixture([selected,{ntstEnfrDt:'20270101',ntstBrkdId:'456',ntstPmgNo:'30000'}]);
 const doc=await sourceDetail(env,item,'2026-11-06');
 assert.equal(doc.version_id,'200');assert.equal(doc.promulgation_number,'21065');assert.equal(doc.effective_from,'2026-01-02');assert.equal(doc.effective_to,'2026-12-31');assert.equal(new URL(doc.url).searchParams.get('ntstBrkdId'),doc.version_id);assert.equal(calls[1].params.ntstPmgNo,doc.promulgation_number);assert(doc.body.includes(text));
 assert.equal(item.version_id,'456');assert.equal(item.promulgation_number,'30000');
});
test('equal effective dates with distinct versions abstain regardless of response order',async()=>{
 const alternatives=[selected,{...selected,ntstBrkdId:'201',ntstPmgNo:'21066'}];
 for(const history of [alternatives,[...alternatives].reverse()]){const {env,calls}=fixture(history);await assert.rejects(sourceDetail(env,item,'2026-11-06'),e=>e.code==='LAW_VERSION_AMBIGUOUS'&&e.source_metadata.metadata_only===true);assert.equal(calls.length,1);}
});
test('exact duplicate history entries remain usable while conflicting identity abstains',async()=>{
 const {env}=fixture([selected,{...selected}]);assert.equal((await sourceDetail(env,item,'2026-11-06')).version_id,'200');
 for(const conflicting of [{...selected,ntstPmgNo:'999'},{...selected,ntstBscId:'999'}]){const {env,calls}=fixture([selected,conflicting]);await assert.rejects(sourceDetail(env,item,'2026-11-06'),e=>e.code==='LAW_VERSION_AMBIGUOUS');assert.equal(calls.length,1);}
});
test('old cached historical metadata cannot bypass corrected law identity validation',async()=>{
 const {env,calls}=fixture([selected]);env.DB=localDB();
 const key='nts:detail:'+await hash(JSON.stringify({parser:3,id:item.source_id,listing_finality:null,basis:item.basis_id,article:item.article_id,version:item.version_id,date:'2026-11-06'}));
 await env.DB.prepare('INSERT INTO source_cache (key,payload,expires_at) VALUES (?,?,?)').bind(key,JSON.stringify({...item,metadata_only:false}),new Date(Date.now()+60000).toISOString()).run();
 const doc=await sourceDetail(env,item,'2026-11-06');assert.equal(doc.version_id,'200');assert.equal(calls.length,2);env.DB.close();
});
function searchEnv(totalCount,resultList=[]){return {__officialFetch:async()=>Response.json({status:'SUCCESS',data:{ASEISA001MR01:{searchResultVO:{collectionList:[{nameEn:'statute',totalCount,resultList}]}}}})};}
test('official search accepts integer counts and numeric strings without manufacturing invalid totals',async()=>{
 for(const value of [0,42,'0','42',' 42 ']){const result=await searchOfficial(searchEnv(value),'합성 검색',{collection:'statute'});assert.equal(result.collections[0].total,Number(value));}
});
test('malformed official counts and document lists reject before reaching result rendering',async()=>{
 for(const value of ['n/a',-1,1.5,'',true,{},9007199254740992])await assert.rejects(searchOfficial(searchEnv(value),'합성 검색',{collection:'statute'}),e=>e.code==='OFFICIAL_SOURCE_FORMAT');
 for(const rows of ['wrong',{},[null],[[]]])await assert.rejects(searchOfficial(searchEnv(1,rows),'합성 검색',{collection:'statute'}),e=>e.code==='OFFICIAL_SOURCE_FORMAT');
});
