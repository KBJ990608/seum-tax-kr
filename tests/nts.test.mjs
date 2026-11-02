import test from 'node:test';
import assert from 'node:assert/strict';
import {localDB} from '../scripts/db-local.mjs';
import {searchOfficial,sourceDetail,searchItem,plain,ntsAction} from '../worker/nts.mjs';
import {retrieveKnowledge} from '../worker/research.mjs';
const law={DOC_ID:'law-source',BSC_ID:'100000000000001561',BRKD_ID:'100027612320251001',TEXT_UQNO:'0021005',TEXT_UQNM:'제21조',TEXT_KRN_NM:'일괄공제',NM:'상속세 및 증여세법',TEXT_KRN_CNTN:'검색 단계 요약은 원문과 다릅니다.',ENFR_DT:'20260102',PMG_NO:'21065',SYS_CL_CD:'01',TLAW_CL_CD:'109'};
const decision={DOC_ID:'200000000000013842',NTST_DCM_CL_CD:'08',TTL:'가상 검증용 상속 사건',NTST_DCM_DSCM_CNTN:'조심-2024-부-5573',NTST_DCM_RGT_DT:'20250722',GIST_CNTN:'가상 검증용 검색 요지',NTST_LWS_DFNT_YN:'N'};
function official(callback){return async(url,options)=>{assert.equal(url,'https://taxlaw.nts.go.kr/action.do');const p=new URLSearchParams(options.body),action=p.get('actionId'),params=JSON.parse(p.get('paramData'));return Response.json({status:'SUCCESS',data:{[action]:await callback(action,params)}});};}
test('NTS collection search reports real provider counts, excludes headings, caches and classifies decisions',async()=>{
 const env={DB:localDB()},calls=[];env.__officialFetch=official((action,params)=>{calls.push({action,params});return {searchResultVO:{collectionList:[{nameEn:'statute',totalCount:120,resultList:[law,{...law,TEXT_UQNO:'0003003'}]},{nameEn:'question',totalCount:30,resultList:[]},{nameEn:'precedent',totalCount:400,resultList:[decision]}]}};});
 const result=await searchOfficial(env,'상속공제');assert.equal(result.collections[0].total,120);assert.equal(result.collections[0].documents.length,1);assert.equal(result.collections[2].documents[0].kind,'decision');await searchOfficial(env,'상속공제');assert.equal(calls.length,1);assert.equal(calls[0].params.schVcb,'상속공제');env.DB.close();
});
test('official detail extracts original body and law links, verifies id and never substitutes search snippets',async()=>{
 const env={DB:localDB()};env.__officialFetch=official(()=>({dcmDVO:{ntstDcmId:decision.DOC_ID,ntstDcmDscmCntn:decision.NTST_DCM_DSCM_CNTN,ntstDcmTtl:'검증용 사건',ntstDcmGistCntn:'공식 상세 요지',ntstDcmRgtDt:'20250722'},dcmHwpEditorDVOList:[{dcmFleTy:'html',dcmFleByte:'<p>검증용 원문입니다. 실제 법적 판단을 의미하지 않습니다.</p>'.repeat(10)}],dcmRltnStttList:[{ntstTextNm:'상속세 및 증여세법 제45조'}]}));
 const item=searchItem(decision,'precedent'),doc=await sourceDetail(env,item);assert.equal(doc.metadata_only,false);assert.deepEqual(doc.related_laws,['상속세 및 증여세법 제45조']);assert(!doc.body.includes('<p>'));assert(doc.digest.length===64);assert(doc.verification_notes.some(n=>n.includes('행정 결정례')));
 const bad={__officialFetch:official(()=>({dcmDVO:{ntstDcmId:'999'}}))};await assert.rejects(sourceDetail(bad,item),e=>e.code==='SOURCE_ID_MISMATCH');
 await assert.rejects(sourceDetail({__officialFetch:official(()=>({dcmDVO:{ntstDcmId:decision.DOC_ID}}))},item),e=>e.code==='SOURCE_BODY_UNAVAILABLE');env.DB.close();
});
test('law retrieval selects the transaction-date version and rejects mixed-version text',async()=>{
 const env={DB:localDB()},calls=[];env.__officialFetch=official((action,params)=>{calls.push({action,params});if(action==='ASISTA005PR01')return {txaStttHsryDVOList:[{ntstEnfrDt:'20270101',ntstBrkdId:'300'},{ntstEnfrDt:'20260102',ntstBrkdId:'200',ntstPmgNo:'21065'},{ntstEnfrDt:'20250101',ntstBrkdId:'100',ntstPmgNo:'20000'}]};return {txaStttHsryDVOList:[{ntstTextUqno:'0021005',ntstBrkdId:'200',ntstTextUqnoNm:'제21조',ntstTextCntn:'시점 선택 검증용 원문입니다. 실제 법적 결론을 의미하지 않습니다.'.repeat(6)}]};});
 const item=searchItem(law,'statute'),doc=await sourceDetail(env,item,'2026-11-02');assert.equal(doc.effective_from,'2026-01-02');assert.equal(doc.effective_to,'2026-12-31');assert.equal(calls[1].params.ntstBrkdId,'200');assert(doc.url.includes('ntstBrkdId=200'));
 const wrong={__officialFetch:official((action)=>action==='ASISTA005PR01'?{txaStttHsryDVOList:[{ntstEnfrDt:'20260102',ntstBrkdId:'200'}]}:{txaStttHsryDVOList:[{ntstTextUqno:'0021005',ntstBrkdId:'999',ntstTextCntn:'틀린 버전'}]})};await assert.rejects(sourceDetail(wrong,item,'2026-11-02'),e=>e.code==='LAW_VERSION_UNVERIFIED');env.DB.close();
});
test('official failure becomes an explicit review warning and cannot silently imply full coverage',async()=>{
 const env={DB:localDB(),SEUM_LIVE_RESEARCH:'true',OPENAI_API_KEY:'test-only',__officialFetch:async()=>{throw Error('unavailable');}};
 await env.DB.prepare("INSERT INTO settings VALUES ('vector_store_id','vs-test')").run();env.__fetch=async(url)=>url.endsWith('/search')?Response.json({data:[]}):Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({queries:['상속공제 배우자'],issue_ids:['inherit-deduction','invented-id']})}]}]});
 const result=await retrieveKnowledge(env,'개인 질문',[],'2026-11-02');assert.equal(result.evidence.length,0);assert(result.warnings.some(w=>w.includes('실시간 검색에 실패')));assert.deepEqual(result.research.issue_ids,['inherit-deduction']);env.DB.close();
});
test('HTML normalization retains Korean amendment brackets and strips executable markup',()=>{assert.equal(plain('<p>본문 &lt;개정 2026.1.1&gt;</p><script>bad()</script>'),'본문 <개정 2026.1.1>');});
test('official read retries a transient network failure once but does not retry access denial',async()=>{
 let attempts=0;const result=await ntsAction({__officialFetch:async()=>{attempts++;if(attempts===1)throw Error('temporary network failure');return Response.json({status:'SUCCESS',data:{READ:{verified:true}}});}},'READ',{});assert.equal(result.verified,true);assert.equal(attempts,2);
 attempts=0;await assert.rejects(ntsAction({__officialFetch:async()=>{attempts++;return Response.json({}, {status:403});}},'READ',{}),e=>e.code==='OFFICIAL_SOURCE_HTTP_403');assert.equal(attempts,1);
});
test('optional cache failure does not discard a fresh valid official search response',async()=>{
 const env={DB:{prepare(){throw Error('cache temporarily unavailable');}},__officialFetch:official(()=>({searchResultVO:{collectionList:[{nameEn:'statute',totalCount:1,resultList:[law]}]}}))};const result=await searchOfficial(env,'상속공제');assert.equal(result.collections[0].documents.length,1);
});
test('law paragraphs use article references, not misleading local paragraph numbers',async()=>{
 const env={__officialFetch:official(()=>({txaStttHsryDVOList:[
  {ntstTextUqno:'0021005',ntstTextUqnm:'제21조',ntstTextNm:'일괄공제',ntstBrkdId:law.BRKD_ID,ntstTextCntn:null,rfrnNtstTextUqno:'0021005'},
  {ntstTextUqno:'0001006',ntstTextUqnm:'제1항',ntstTextCntn:'제21조의 첫 항입니다. 같은 조에 속하는 본문을 추출하는 검증용 문장입니다.',rfrnNtstTextUqno:'0021005'},
  {ntstTextUqno:'0002006',ntstTextUqnm:'제2항',ntstTextCntn:'제21조의 두 번째 항입니다. 검색할 법령 본문을 빠뜨리지 않는지 검사합니다.',rfrnNtstTextUqno:'0021005'},
  {ntstTextUqno:'0022005',ntstTextUqnm:'제22조',ntstTextCntn:'다른 조문은 섞이면 안 됩니다.',rfrnNtstTextUqno:'0022005'},
 ]}))};const doc=await sourceDetail(env,searchItem(law,'statute'));assert(doc.body.includes('첫 항'));assert(doc.body.includes('두 번째 항'));assert(!doc.body.includes('다른 조문'));
});
