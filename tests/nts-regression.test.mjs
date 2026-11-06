import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceDetail,ntsAction,relatedLawReferences} from '../worker/nts.mjs';
// Synthetic bodies only. Field shapes match public NTS responses inspected on
// 2026-11-06 for 소득세법 제95조 and 제도46014-12244, not legal test advice.
const law={source_id:'synthetic-law',kind:'law',title:'검증법 제95조',law_title:'검증법',basis_id:'123',version_id:'456',article_id:'0095005',url:'https://taxlaw.nts.go.kr/st/USESTA002M.do?ntstBscId=123&ntstBrkdId=456'};
const interpretation={source_id:'010000000000053923',kind:'interpretation',title:'합성 검증 문서',case_number:'제도46014-12244',url:'https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000053923'};
function response(data){return {__officialFetch:async(url,options)=>{const action=new URLSearchParams(options.body).get('actionId');return Response.json({status:'SUCCESS',data:{[action]:data}});}};}
const text='합성 원문입니다. 실제 법률이나 세무 판단에 사용할 수 없는 회귀 테스트 본문입니다. '.repeat(4);
test('public law shape uses requested history list, not scheduled future amendments',async()=>{
 const doc=await sourceDetail(response({txaStttHsryDVOList:[{ntstTextUqno:'0095005',ntstBrkdId:'456',ntstTextUqnm:'제95조',ntstTextNm:'검증 조항',ntstTextCntn:text},{ntstTextUqno:'0096005',ntstBrkdId:'456',ntstTextCntn:'다른 조문'}],txaStttSchuDVOList:[{ntstTextUqno:'0095005',ntstBrkdId:'999',ntstTextCntn:'미래 개정문'}]}),law);
 assert(doc.body.includes(text.trim()));assert(!doc.body.includes('미래 개정문'));assert(!doc.body.includes('다른 조문'));assert.equal(doc.metadata_only,false);
});
test('legacy interpretation accepts embedded HTML and ignores empty HWP bytes',async()=>{
 const doc=await sourceDetail(response({dcmDVO:{ntstDcmId:interpretation.source_id,ntstDcmDscmCntn:interpretation.case_number,ntstDcmRgtDt:'20010719'},dcmHwpEditorDVOList:[{dcmFleTy:'hwp',dcmFleByte:''},{dcmFleTy:'html',dcmFleByte:'<html><head></head><body><p>'+text+'</p></body></html>'}],dcmRltnStttList:null}),interpretation);
 assert.equal(doc.decision_date,'2001-07-19');assert.equal(doc.body,text.trim());assert.deepEqual(doc.related_laws,[]);
});
test('malformed action envelopes reject explicitly rather than TypeError',async()=>{
 for(const payload of [null,{}, {status:'SUCCESS',data:'unexpected'}, {status:'SUCCESS',data:{READ:null}}])await assert.rejects(ntsAction({__officialFetch:async()=>Response.json(payload)},'READ',{}),e=>e.code==='OFFICIAL_SOURCE_FORMAT');
});
test('long title alone is not verified body; rejection preserves only official navigation metadata',async()=>{
 const item={...interpretation,title:'검색 제목',excerpt:'검색 요약'};
 await assert.rejects(sourceDetail(response({dcmDVO:{ntstDcmId:item.source_id,ntstDcmTtl:text},dcmHwpEditorDVOList:{unexpected:text}}),item),e=>{
  assert.equal(e.code,'SOURCE_BODY_UNAVAILABLE');assert.equal(e.source_metadata.url,item.url);assert.equal(e.source_metadata.metadata_only,true);assert(!('body' in e.source_metadata));assert(!('excerpt' in e.source_metadata));return true;
 });
});
test('law rejects a different basis even when version and article identifiers match',async()=>{
 await assert.rejects(sourceDetail(response({txaStttHsryDVOList:[{ntstTextUqno:law.article_id,ntstBrkdId:law.version_id,ntstBscId:'999',ntstTextCntn:text}]}),law),e=>e.code==='LAW_VERSION_UNVERIFIED');
});
test('explicit references preserve branch articles and complete names without substring duplicates',()=>{
 assert.deepEqual(relatedLawReferences(['상속세 및 증여세법 제3조'], '「상속세및증여세법」 제3조, 민법 제1057조의 2 및 민법 제1057조의2, 상속세및증여세법 시행령 제12조'),['상속세 및 증여세법 제3조','민법 제1057조의2','상속세및증여세법 시행령 제12조']);
 assert.deepEqual(relatedLawReferences([], '이 문장은 조문을 언급하지 않습니다. 소득세법 관련 검토.'),[]);
 assert.deepEqual(relatedLawReferences([], '가상민법 제1조'),[]);
});
test('related pointers for another document are not accepted',async()=>{
 const doc=await sourceDetail(response({dcmDVO:{ntstDcmId:interpretation.source_id,ntstDcmCntn:text},dcmRltnStttList:[{ntstDcmId:'999',ntstTextNm:'민법 제1조'}]}),interpretation);
 assert.deepEqual(doc.related_laws,[]);
});
test('legacy source relation-list substring duplicates do not become extra legal references',()=>{
 assert.deepEqual(relatedLawReferences(['상속세및증여세법 제18조','증여세법 제18조'],'상속세및증여세법 제18조에 따른 검토'),['상속세및증여세법 제18조']);
 assert.deepEqual(relatedLawReferences(['상속세및증여세법 제18조','증여세법 제18조'],'상속세및증여세법 제18조 및 「증여세법 제18조」라는 별도 원문 표기'),['상속세및증여세법 제18조','증여세법 제18조']);
});
