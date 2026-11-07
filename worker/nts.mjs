// Public, read-only requests used by the NTS's own search and detail pages.
// No account, third-party proxy, embedded credential or access-control bypass.
import {ApiError,hash,officialUrl,validDate} from './core.mjs';
const base='https://taxlaw.nts.go.kr';
const collectionNames={statute:'법령·시행령·시행규칙',question:'세법해석례·예규',precedent:'판례·결정례'};
export function plain(value){return String(value||'').replace(/<!H[SE]>/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<(?:br|\/p|\/div|\/tr|\/li|\/h[1-6])\b[^>]*>/gi,'\n').replace(/<\/?[A-Za-z][^>]*>/g,'').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';}).replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g,s=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[s])).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n\n').trim();}
function isoDate(value){const s=String(value||'').replace(/\D/g,'').slice(0,8);if(s.length!==8)return null;try{return validDate(s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6));}catch{return null;}}
async function cached(env,key,ttl,load){
  const id='nts:'+key;
  if(env.DB){try{const row=await env.DB.prepare('SELECT payload FROM source_cache WHERE key=? AND expires_at>?').bind(id,new Date().toISOString()).first();if(row){try{return JSON.parse(row.payload);}catch{}}}catch{/* Cache failure must not prevent a fresh official read. */}}
  const data=await load();
  if(env.DB){try{await env.DB.prepare('INSERT INTO source_cache (key,payload,expires_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at').bind(id,JSON.stringify(data),new Date(Date.now()+ttl).toISOString()).run();}catch{/* The verified response remains usable without cache persistence. */}}
  return data;
}
// Body consumption is part of the timed attempt: receiving headers is not a
// successful read. Large official detail responses can arrive in many chunks.
const maxOfficialBodyBytes=8*1024*1024;
async function officialText(response){
  const reader=response.body?.getReader();if(!reader)return '';
  const decoder=new TextDecoder('utf-8',{ignoreBOM:true}),parts=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxOfficialBodyBytes){await reader.cancel();throw new ApiError(502,'OFFICIAL_SOURCE_TOO_LARGE','공식 원문 응답이 안전한 처리 크기를 초과해 검증을 보류했습니다.');}parts.push(decoder.decode(value,{stream:true}));}parts.push(decoder.decode());return parts.join('');}finally{reader.releaseLock();}
}
function officialDiagnostic(env,actionId,attempt,response,error,text){
  // Only transport metadata and coarse classification. Never log the query,
  // body, cookies, tokens, arbitrary error messages or document identifiers.
  const prefix=text?.trimStart();
  const diagnostic={action:actionId,attempt:attempt+1,status:response?.status||null,error_type:['TimeoutError','AbortError','SyntaxError','TypeError'].includes(error?.name)?error.name:'Other',content_type:response?.headers?.get('content-type')?.slice(0,100)||null,content_encoding:response?.headers?.get('content-encoding')?.slice(0,30)||null,declared_bytes:/^\d+$/.test(response?.headers?.get('content-length')||'')?Number(response.headers.get('content-length')):null,decoded_characters:typeof text==='string'?text.length:null,body_kind:typeof text!=='string'?'unread':!prefix?'empty':prefix.startsWith('<')?'html':/^[{[]/.test(prefix)?'json_like':'other',leading_bom:text?.charCodeAt(0)===0xfeff};
  if(typeof env.__officialDiagnostic==='function')env.__officialDiagnostic(diagnostic);else console.warn('official_source_read',diagnostic);
}
export async function ntsAction(env,actionId,paramData){
  const deadline=env.__officialDeadline||Date.now()+18000;
  for(let attempt=0;attempt<2;attempt++){
    const remaining=deadline-Date.now();if(remaining<200)throw new ApiError(502,'OFFICIAL_SEARCH_TIME_BUDGET','공식 자료 조회 제한 시간에 도달해 확인한 범위만 검토합니다.');
    let response,text;
    try{
      response=await(env.__officialFetch||fetch)(base+'/action.do',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Referer:base+'/is/USEISA001M.do'},body:new URLSearchParams({actionId,paramData:JSON.stringify(paramData)}),signal:AbortSignal.timeout(Math.max(1,Math.min(12000,remaining)))});
      if(!response.ok){if(response.body)await response.body.cancel();throw new ApiError(502,'OFFICIAL_SOURCE_HTTP_'+response.status,'국세청 공식 자료 조회에 실패했습니다.');}
      text=await officialText(response);
      // JSON may legally be preceded by a UTF-8 BOM from a legacy server.
      const result=JSON.parse(text.replace(/^\uFEFF/,''));
      if(!result||result.status!=='SUCCESS'||!result.data||typeof result.data!=='object'||!(actionId in result.data)||!result.data[actionId]||typeof result.data[actionId]!=='object')throw new ApiError(502,'OFFICIAL_SOURCE_FORMAT','공식 검색 응답을 검증하지 못했습니다.');
      return result.data[actionId];
    }catch(error){
      officialDiagnostic(env,actionId,attempt,response,error,text);
      // Never retry access denial or reinterpret HTML as evidence. Only a
      // transient connection/body-stream failure or HTTP 5xx gets one retry.
      const timeout=['AbortError','TimeoutError'].includes(error?.name);
      const retryable=(!(error instanceof ApiError)&&!(error instanceof SyntaxError))||/^OFFICIAL_SOURCE_HTTP_5\d\d$/.test(error?.code||'');
      if(attempt===0&&retryable&&deadline-Date.now()>550){await new Promise(resolve=>setTimeout(resolve,350));continue;}
      if(error instanceof ApiError)throw error;
      if(error instanceof SyntaxError)throw new ApiError(502,'OFFICIAL_SOURCE_FORMAT','공식 자료가 검증 가능한 JSON 원문으로 응답하지 않아 검증을 보류했습니다.');
      if(timeout)throw new ApiError(502,'OFFICIAL_SOURCE_TIMEOUT','국세청 공식 원문 수신 시간이 초과되었습니다. 조회 실패를 자료 없음으로 판단하지 않습니다.');
      throw new ApiError(502,'OFFICIAL_SOURCE_UNAVAILABLE','국세청 공식 자료 서버에서 원문을 끝까지 받지 못했습니다. 조회 실패를 자료 없음으로 판단하지 않습니다.');
    }
  }
}

export function searchItem(row,collection){
  const id=String(row.DOC_ID||'');
  if(collection==='statute'){
    // Only primary law articles here. Chapter headings are not legal provisions.
    if(!/^\d{7}$/.test(String(row.TEXT_UQNO||''))||!String(row.TEXT_UQNO).endsWith('5')||!/^\d+$/.test(row.BSC_ID||'')||!/^\d+$/.test(row.BRKD_ID||''))return null;
    return {source_id:id,collection,kind:'law',title:plain(row.NM||row.LBL2_TTL)+' '+plain(row.TEXT_UQNM)+' '+plain(row.TEXT_KRN_NM),url:base+'/st/USESTA002M.do?'+new URLSearchParams({ntstBscId:row.BSC_ID,ntstBrkdId:row.BRKD_ID,ntstTextUqno:row.TEXT_UQNO,ntstSysClCd:row.SYS_CL_CD||'01',ntstTlawClCd:row.TLAW_CL_CD||''}),excerpt:plain(row.TEXT_KRN_CNTN).slice(0,1000),effective_from:isoDate(row.ENFR_DT),basis_id:row.BSC_ID,version_id:row.BRKD_ID,article_id:row.TEXT_UQNO,law_title:plain(row.NM||row.LBL2_TTL),promulgation_number:row.PMG_NO||'',system_code:row.SYS_CL_CD||'01',tax_code:row.TLAW_CL_CD||'',metadata_only:true};
  }
  if(!/^\d{18}$/.test(id))return null;
  const cl=String(row.NTST_DCM_CL_CD||''),maintenance=cl==='31'||String(row.MAIN_ID||'').startsWith('002_');
  return {source_id:id,collection,kind:maintenance?'maintenance':collection==='question'?'interpretation':cl==='09'?'case':'decision',title:plain(row.TTL),url:base+(collection==='precedent'?'/pd/USEPDA002P.do':'/qt/USEQTA002P.do')+'?ntstDcmId='+id,excerpt:plain(row.GIST_CNTN||row.NTST_DCM_RPLY_CNTN||row.CNTN).slice(0,1600),case_number:plain(row.NTST_DCM_DSCM_CNTN||row.DOCU_NO_STR1?.split(' ')[0]),decision_date:isoDate(row.NTST_DCM_RGT_DT||row.DCM_RGT_DTM_S),category:plain(row.LBL1_TTL||row.NTST_DCM_CL_NM),finality:row.NTST_LWS_DFNT_YN==='Y'?'final':row.NTST_LWS_DFNT_YN==='N'?'not_confirmed':'unknown',metadata_only:true};
}
export async function searchOfficial(env,query,{page=1,limit=8,collection='all'}={}){
  const collections=collection==='all'?Object.keys(collectionNames):[collection];if(collections.some(c=>!collectionNames[c]))throw new ApiError(400,'INVALID_COLLECTION','자료 분류를 확인해 주세요.');
  const key=await hash(JSON.stringify({query,page,limit,collections}));
  return cached(env,'search:'+key,15*60*1000,async()=>{
    const data=await ntsAction(env,'ASEISA001MR01',{schVcb:query,collection:collections.join(','),startCount:page,viewCount:limit,sortField:'SCORE/DESC',searchType:'',wnKey:'',ntstTlawClCdList:[],icldVcbCtl:[],exclVcbCtl:[],rltnStttCtl:[],mainIdCtl:[],useSynonymYn:'N'});
    const list=data.searchResultVO?.collectionList;if(!Array.isArray(list))throw new ApiError(502,'OFFICIAL_SOURCE_FORMAT','공식 검색 결과 목록을 확인하지 못했습니다.');
    return {provider:'국세청 국세법령정보시스템',query,page,limit,retrieved_at:new Date().toISOString(),collections:collections.map(name=>{const c=list.find(c=>c.nameEn===name);return {id:name,title:collectionNames[name],total:Number(c?.totalCount||0),documents:(c?.resultList||[]).map(r=>searchItem(r,name)).filter(Boolean)};})};
  });
}
function listFrom(value,key){return Array.isArray(value)?value:Array.isArray(value?.[key])?value[key]:[];}
// Extract only explicit citations. A related-law entry is a pointer, never proof
// that its current text or historical applicability has been verified.
export function relatedLawReferences(entries,body=''){
  const normalize=value=>plain(value).replace(/(제\s*\d+\s*조)\s*의\s*(\d+)/g,'$1의$2');
  const references=(Array.isArray(entries)?entries:[]).filter(value=>typeof value==='string').map(normalize).filter(Boolean);
  // Longest names first, with a Korean-letter boundary: 증여세법 must not be
  // extracted from inside 상속세및증여세법. Branch articles remain intact.
  const names='상속세\\s*및\\s*증여세법|조세특례제한법|국제조세조정에\\s*관한\\s*법률|지방세특례제한법|국세기본법|국세징수법|소득세법|법인세법|부가가치세법|지방세법|민법|상법';
  const pattern=new RegExp('(?<![가-힣A-Za-z])('+names+')(?:\\s*(시행령|시행규칙))?\\s*[」』]?\\s*제\\s*(\\d+)\\s*조(?:\\s*의\\s*(\\d+))?','g');
  for(const match of plain(body).matchAll(pattern))references.push(normalize(match[1]+(match[2]?' '+match[2]:'')+' 제'+match[3]+'조'+(match[4]?'의'+match[4]:'')));
  // Resolve '동법' only inside one non-nested parenthesis that starts with
  // an explicit supported law. Any intervening law/decree wording makes the
  // reference ambiguous. These remain pointers, never verified provisions.
  for(const scope of plain(body).matchAll(/\(([^()]{1,4000})\)/g)){
    const first=[...scope[1].matchAll(pattern)][0];if(!first||first[2]||!/^[\s「『]*$/.test(scope[1].slice(0,first.index)))continue;
    const after=first.index+first[0].length,law=first[1]+(first[2]?' '+first[2]:'');
    for(const alias of scope[1].matchAll(/(?<![가-힣A-Za-z0-9])동법\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g)){
      if(alias.index<after||/법|령|규칙/.test(scope[1].slice(after,alias.index).replace(/(?<![가-힣A-Za-z0-9])동법(?![가-힣A-Za-z])/g,'')))continue;
      references.push(normalize(law+' 제'+alias[1]+'조'+(alias[2]?'의'+alias[2]:'')));
    }
  }
  const normalizedBody=normalize(body);
  const seen=new Set();return references.filter(value=>{
    const key=value.replace(/\s/g,'');
    // Older NTS relation lists can contain both the full law name and its
    // trailing substring. Suppress only that demonstrable duplicate; retain
    // an explicit standalone occurrence, whose meaning we must not rewrite.
    if(/^증여세법(?:시행령|시행규칙)?제\d+조/.test(key)&&references.some(other=>other.replace(/\s/g,'')==='상속세및'+key)){
      const escaped=[...key].join('\\s*');
      if(!new RegExp('(?<![가-힣A-Za-z])'+escaped+'(?![\\d]|의\\d)').test(normalizedBody))return false;
    }
    if(seen.has(key))return false;seen.add(key);return true;
  });
}
export async function sourceDetail(env,item,transactionDate=null){
  const key=await hash(JSON.stringify({parser:3,id:item.source_id,listing_finality:item.finality||null,basis:item.basis_id,article:item.article_id,version:item.version_id,date:transactionDate}));
  return cached(env,'detail:'+key,6*60*60*1000,async()=>{
    let body,related=[],flags=[],effectiveFrom=item.effective_from||null,effectiveTo=null,url=item.url;
    if(item.kind==='law'){
      let version=item.version_id,promulgation=item.promulgation_number;
      if(transactionDate){
        const history=await ntsAction(env,'ASISTA005PR01',{ntstBscId:item.basis_id,ntstTlawClCd:item.tax_code,ntstSysClCd:item.system_code});
        const versions=listFrom(history,'txaStttHsryDVOList').map(v=>({...v,date:isoDate(v.ntstEnfrDt)})).filter(v=>v.date).sort((a,b)=>b.date.localeCompare(a.date));
        const applicable=versions.find(v=>v.date<=transactionDate);
        if(!applicable)throw new ApiError(422,'HISTORICAL_LAW_UNAVAILABLE','거래 기준일의 법령 버전을 확인하지 못했습니다.');
        version=applicable.ntstBrkdId;promulgation=applicable.ntstPmgNo;effectiveFrom=applicable.date;
        const next=versions.filter(v=>v.date>effectiveFrom).sort((a,b)=>a.date.localeCompare(b.date))[0];if(next)effectiveTo=new Date(Date.parse(next.date)-86400000).toISOString().slice(0,10);
        url=base+'/st/USESTA002M.do?'+new URLSearchParams({ntstBscId:item.basis_id,ntstBrkdId:version,ntstTextUqno:item.article_id,ntstSysClCd:item.system_code,ntstTlawClCd:item.tax_code});
      }
      if(!/^\d+$/.test(String(version||'')))throw new ApiError(422,'LAW_VERSION_UNVERIFIED','법령 버전을 확인하지 못했습니다.');
      const data=await ntsAction(env,'ASISTA002MR03',{ntstBscId:item.basis_id,ntstBrkdId:version,ntstPmgNo:promulgation});
      const allParts=listFrom(data,'txaStttHsryDVOList');
      // NTS numbers paragraphs locally (0001006/0002006). Their article
      // membership is rfrnNtstTextUqno, not a shared numeric prefix.
      const start=allParts.findIndex(p=>String(p.ntstTextUqno)===String(item.article_id));
      if(start<0)throw new ApiError(422,'SOURCE_BODY_UNAVAILABLE','선택한 법령 버전에서 해당 조문을 찾지 못했습니다.');
      const next=allParts.findIndex((p,i)=>i>start&&['2','3','4','5'].includes(String(p.ntstTextUqno).slice(-1)));
      const parts=allParts.slice(start,next<0?undefined:next).filter(p=>!p.rfrnNtstTextUqno||String(p.rfrnNtstTextUqno)===String(item.article_id));
      if(parts.some(p=>(p.ntstBrkdId&&String(p.ntstBrkdId)!==String(version))||(p.ntstBscId&&String(p.ntstBscId)!==String(item.basis_id))))throw new ApiError(422,'LAW_VERSION_UNVERIFIED','법령 원문과 선택 버전이 일치하지 않습니다.');
      if(plain(parts.map(p=>p.ntstTextCntn||'').join('\n')).length<10)throw new ApiError(422,'SOURCE_BODY_UNAVAILABLE','실질적인 조문 본문을 확보하지 못했습니다.');
      body=parts.map(p=>plain([p.ntstTextUqnm||p.ntstTextUqnoNm,p.ntstTextNm||p.ntstBracketTextNm,p.ntstTextCntn,p.ntstTextEnlrDscCntn].filter(Boolean).join(' '))).join('\n');
      item={...item,title:[item.law_title,plain(parts[0].ntstTextUqnm||parts[0].ntstTextUqnoNm),plain(parts[0].ntstTextNm||parts[0].ntstBracketTextNm)].filter(Boolean).join(' ')};
      flags.push('법령 본문과 별도로 부칙·적용례·경과규정 확인 필요');
    }else{
      const data=await ntsAction(env,'ASIQTB002PR01',{dcmDVO:{ntstDcmId:item.source_id}}),doc=data.dcmDVO;
      if(!doc||String(doc.ntstDcmId)!==item.source_id)throw new ApiError(422,'SOURCE_ID_MISMATCH','검색 결과와 원문 식별자가 일치하지 않습니다.');
      const files=listFrom(data,'dcmHwpEditorDVOList');
      const html=files.filter(f=>f&&String(f.dcmFleTy).toLowerCase()==='html'&&typeof f.dcmFleByte==='string').map(f=>plain(f.dcmFleByte)).filter(Boolean);
      const substantive=[plain(doc.ntstDcmGistCntn),plain(doc.ntstDcmCntn),plain(doc.ntstDcmRplyCntn),...html].filter(Boolean);
      if(substantive.join('\n').length<80)throw new ApiError(422,'SOURCE_BODY_UNAVAILABLE','공식 상세 본문을 확보하지 못했습니다. 제목이나 검색 요약을 원문으로 사용하지 않습니다.');
      body=[plain(doc.ntstDcmTtl),plain(doc.ntstDcmGistCntn),plain(doc.ntstDcmCntn),plain(doc.ntstDcmRplyCntn),...html].filter(Boolean).join('\n\n');
      related=relatedLawReferences(listFrom(data,'dcmRltnStttList').filter(r=>r&&(!r.ntstDcmId||String(r.ntstDcmId)===String(item.source_id))).map(r=>r.ntstTextNm),body);
      const number=plain(doc.ntstDcmDscmCntn);if(item.case_number&&number&&item.case_number!==number)throw new ApiError(422,'DOCUMENT_NUMBER_MISMATCH','문서번호가 일치하지 않습니다.');
      // Search metadata is not a substitute for the detailed finality field.
      // A conflicting positive detail cannot silently remove a negative listing.
      let finality=doc.ntstLwsDfntYn==='Y'?'final':doc.ntstLwsDfntYn==='N'?'not_confirmed':'unknown';
      if(finality==='final'&&item.finality==='not_confirmed'){finality='unknown';flags.push('검색 목록과 상세의 확정 상태 불일치: 후속 판결 확인 필요');}
      item={...item,case_number:number||item.case_number,decision_date:isoDate(doc.ntstDcmRgtDt)||item.decision_date,finality};
      if(item.kind==='case'&&finality!=='final')flags.push('판결의 확정·상고심 진행 상태 확인 필요');
      if(item.kind==='decision')flags.push('행정 결정례의 효력과 동일 쟁점 법원 판결 확인 필요');
      if(item.kind==='interpretation')flags.push('행정해석의 정비·변경 여부 및 법원 판결과의 관계 확인 필요');
      if(item.kind==='maintenance')flags.push('해석 정비 내역: 종전 해석을 현행 견해로 적용 금지');
      if(!html.length)flags.push('첨부 전문을 확인하지 못해 공식 상세 화면의 요지·회신 범위로 제한');
    }
    if(!body||body.length<(item.kind==='law'?15:80))throw new ApiError(422,'SOURCE_BODY_UNAVAILABLE','공식 상세 본문을 확보하지 못했습니다. 검색 요약을 법적 근거로 사용하지 않습니다.');
    if(body.length>200000)flags.push('긴 원문 중 관련 구간만 답변에 전달');
    const retrievedAt=new Date().toISOString(),full=body.slice(0,200000);
    return {...item,url:officialUrl(url),body:full,digest:await hash(full),effective_from:effectiveFrom,effective_to:effectiveTo,related_laws:related,verification_notes:flags,verified_at:retrievedAt,metadata_only:false,origin:'nts_live',scope_note:'공식 상세 본문 자동 대조 · 전문가 적용 검토 전'};
  }).catch(error=>{
    // Keep navigation separate from evidence. Callers may display this pointer,
    // but a failed detail request must still reject and must never enter RAG.
    if(error instanceof ApiError){
      try{error.source_metadata={source_id:item.source_id,title:item.title,url:officialUrl(item.url),kind:item.kind,metadata_only:true};}catch{/* Do not preserve an invalid link. */}
    }
    throw error;
  });
}
export function relevantExcerpt(body,query,max=10000){
  if(body.length<=max)return body;
  const terms=[...new Set(query.match(/[가-힣A-Za-z0-9]{2,}/g)||[])].slice(0,20),parts=body.split(/\n\s*\n|\n(?=[①-⑳])/).map((text,i)=>({text,i,score:terms.reduce((s,t)=>s+(text.includes(t)?1:0),0)}));
  const picked=[parts[0],...parts.slice(1).sort((a,b)=>b.score-a.score).slice(0,5)].filter(Boolean).sort((a,b)=>a.i-b.i);return picked.map(p=>p.text).join('\n[… 중간 생략 …]\n').slice(0,max);
}
