import {marcoStatus,marcoEvaluate,marcoQuestion} from './marco.mjs';
import assets from 'virtual:seum-assets';
import corpus from '../data/corpus.json';
import indexedSources from '../data/indexed-sources.json';
import {retrieveKnowledge,issues} from './research.mjs';
import {searchOfficial,sourceDetail} from './nts.mjs';
import {taxKinds,calculateTax,proposeTaxInputs} from './tax.mjs';
import {ApiError,json,hash,validDate,officialUrl,checkedText,openai,retrieve,generate} from './core.mjs';
export {ApiError};
const now=()=>new Date().toISOString();
const rows=async(stmt)=>(await stmt.all()).results||[];
const parse=(value,fallback)=>{try{return JSON.parse(value);}catch{return fallback;}};
// Seed only the immutable, successfully indexed official-source release. This is
// deployment data backfill, never a public administrative write endpoint.
const releases=new WeakMap();
async function ensureSourceRelease(env){
  if(!env.DB||!env.OPENAI_VECTOR_STORE_ID||env.OPENAI_VECTOR_STORE_ID!==indexedSources.store_id)return;
  if(releases.has(env.DB))return releases.get(env.DB);
  const pending=(async()=>{for(const doc of corpus){
    const digest=await hash(doc.body),id=await hash(doc.url+'|'+digest);
    const indexed=indexedSources.documents.find(d=>d.id===id&&d.digest===digest&&d.status==='active'&&d.indexed_at);
    if(!indexed)continue;
    await env.DB.prepare('INSERT INTO documents (id,title,kind,url,body,effective_from,effective_to,case_number,decision_date,digest,file_id,status,verified_by,verified_at,indexed_at,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,doc.title,doc.kind,officialUrl(doc.url),doc.body,doc.effective_from||null,doc.effective_to||null,doc.case_number||null,doc.decision_date||null,digest,indexed.file_id,'active','official-source-import',indexed.indexed_at,indexed.indexed_at,doc.notes+' · 공식 원문 수집·색인 확인 자료이며 개별 사건 적용은 전문가 검토 대상입니다.').run();
  }})();releases.set(env.DB,pending);try{await pending;}catch(error){releases.delete(env.DB);throw error;}
}
async function audit(env,id,actor,action,detail){await env.DB.prepare('INSERT INTO audit (id,case_id,actor,action,detail,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),id,actor,action,JSON.stringify(detail),now()).run();}
function expert(request,env){const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email')?.toLowerCase();const allowed=(env.EXPERT_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);if(!id||!email)throw new ApiError(401,'SIGN_IN_REQUIRED','담당자 로그인이 필요합니다.');if(!allowed.includes(email))throw new ApiError(403,'EXPERT_REQUIRED','검토 담당자 권한이 없습니다.');return {id,email};}
function session(request){const match=request.headers.get('Cookie')?.match(/(?:^|;\s*)seum_session=([a-f0-9]{64})(?:;|$)/);return match?.[1]||null;}
function publicCase(row){return {id:row.id,question:row.question,transaction_date:row.transaction_date,status:row.status,answer:parse(row.answer,null),evidence:parse(row.evidence,[]),reasons:parse(row.reasons,[]),expert_reply:row.expert_reply,reviewed_at:row.reviewed_at,created_at:row.created_at,updated_at:row.updated_at};}
async function body(request){if(!request.headers.get('content-type')?.includes('application/json'))throw new ApiError(415,'JSON_REQUIRED','JSON 요청만 지원합니다.');const declared=Number(request.headers.get('content-length')||0);if(declared>150000)throw new ApiError(413,'TOO_LARGE','요청이 너무 큽니다.');const text=await request.text();if(new TextEncoder().encode(text).length>150000)throw new ApiError(413,'TOO_LARGE','요청이 너무 큽니다.');try{return JSON.parse(text);}catch{throw new ApiError(400,'INVALID_JSON','요청 형식을 확인해 주세요.');}}
function sameOrigin(request){const origin=request.headers.get('Origin');if(!origin||origin!==new URL(request.url).origin)throw new ApiError(403,'ORIGIN_REQUIRED','이 사이트에서 보낸 요청만 허용합니다.');}
async function quota(env,key,max){const result=await env.DB.prepare('INSERT INTO rate_limits (key,count) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key).first();if(result.count>max)throw new ApiError(429,'RATE_LIMIT','오늘의 신청·AI 이용 한도에 도달했습니다. 잠시 후 다시 이용해 주세요.');}
async function indexDocument(env,doc){
  let setting=await env.DB.prepare("SELECT value FROM settings WHERE key='vector_store_id'").first();let store=env.OPENAI_VECTOR_STORE_ID||setting?.value;
  if(!store){const created=await openai(env,'/vector_stores',{name:'SEUM verified Korean tax law and cases'});await env.DB.prepare("INSERT INTO settings (key,value) VALUES ('vector_store_id',?) ON CONFLICT(key) DO NOTHING").bind(created.id).run();setting=await env.DB.prepare("SELECT value FROM settings WHERE key='vector_store_id'").first();store=setting.value;}
  let fileId=doc.file_id;
  if(!fileId){const form=new FormData();form.set('purpose','assistants');form.set('file',new File([JSON.stringify({title:doc.title,kind:doc.kind,source_url:doc.url,effective_from:doc.effective_from,effective_to:doc.effective_to,case_number:doc.case_number,decision_date:doc.decision_date,notes:doc.notes,text:doc.body},null,2)],doc.id+'.txt',{type:'text/plain'}));fileId=(await openai(env,'/files',form,'POST',true)).id;await env.DB.prepare("UPDATE documents SET file_id=?,status='uploaded' WHERE id=?").bind(fileId,doc.id).run();}
  if(!['indexing','active'].includes(doc.status)){await openai(env,'/vector_stores/'+encodeURIComponent(store)+'/files',{file_id:fileId,attributes:{document_id:doc.id,kind:doc.kind,verified:true}});await env.DB.prepare("UPDATE documents SET status='indexing' WHERE id=?").bind(doc.id).run();}
  const file=await openai(env,'/vector_stores/'+encodeURIComponent(store)+'/files/'+encodeURIComponent(fileId),undefined,'GET');
  const status=file.status==='completed'?'active':file.status==='failed'?'failed':'indexing';await env.DB.prepare('UPDATE documents SET status=?,indexed_at=? WHERE id=?').bind(status,status==='active'?now():null,doc.id).run();return {id:doc.id,status};
}
async function submitConsultation(request,env,data,chatThread=null,priorEvidence=[]){
    const token=session(request);if(!token)throw new ApiError(401,'SESSION_REQUIRED','화면을 새로고침한 뒤 다시 신청해 주세요.');
    if(data.consent!==true)throw new ApiError(400,'CONSENT_REQUIRED','상담 저장 및 OpenAI 전송 안내에 동의해 주세요.');
    const question=checkedText(data.question,'상담 내용',6000,chatThread?1:5),date=validDate(data.transaction_date||null),customer=checkedText(data.customer||'','이름·별칭',80),contact=checkedText(data.contact||'','연락처',150);
    const history=Array.isArray(data.history)?data.history.slice(-10).map(m=>({role:m.role==='assistant'?'assistant':'user',text:checkedText(m.text,'이전 대화',6000)})):[];
    const key=checkedText(data.request_key,'요청 번호',70,16);if(!/^[\w-]+$/.test(key))throw new ApiError(400,'INVALID_INPUT','요청 번호를 확인해 주세요.');
    const owner=await hash(token),requestKey=await hash(owner+key),existing=await env.DB.prepare('SELECT * FROM consultations WHERE request_key=?').bind(requestKey).first();if(existing)return json({case:publicCase(existing),duplicate:true},existing.status==='processing'?202:200);
    const day=now().slice(0,10);await quota(env,'global:'+day,100);await quota(env,'client:'+day+await hash(request.headers.get('cf-connecting-ip')||token),8);
    const id=crypto.randomUUID(),created=now();await env.DB.prepare('INSERT INTO consultations (id,owner_hash,request_key,question,transaction_date,customer,contact,history,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,owner,requestKey,question,date,customer,contact,JSON.stringify(history),created,created).run();
    if(chatThread)await env.DB.prepare('INSERT INTO chat_turns (case_id,thread_id,created_at) VALUES (?,?,?) ON CONFLICT(case_id) DO NOTHING').bind(id,chatThread,created).run();
    let evidence=[];try{if(!env.OPENAI_API_KEY)throw new ApiError(503,'OPENAI_NOT_CONFIGURED','OpenAI API 키가 아직 연결되지 않았습니다. 자동 답변은 생성하지 않았고 전문가 검토 신청을 접수했습니다.');const retrieval=await retrieveKnowledge(env,question,history,date,priorEvidence);evidence=retrieval.evidence;const generated=await generate(env,question,history,date,evidence,data.analysis_mode||'consult');if(data.tax_kind)generated.tax_kind=data.tax_kind;generated.research=retrieval.research;if(retrieval.warnings.length){generated.answer.needs_expert=true;generated.answer.review_reasons=[...new Set([...generated.answer.review_reasons,...retrieval.warnings])];}const status=generated.answer.needs_expert?'needs_review':'draft_ready';await env.DB.prepare('UPDATE consultations SET status=?,answer=?,evidence=?,reasons=?,updated_at=? WHERE id=?').bind(status,JSON.stringify(generated),JSON.stringify(evidence),JSON.stringify(generated.answer.review_reasons),now(),id).run();}catch(e){const safe=e instanceof ApiError?e:new ApiError(502,'ANALYSIS_FAILED','자동 검토를 완료하지 못했습니다. 전문가가 확인할 수 있도록 신청을 저장했습니다.');await env.DB.prepare("UPDATE consultations SET status='needs_review',evidence=?,reasons=?,updated_at=? WHERE id=?").bind(JSON.stringify(evidence),JSON.stringify([{code:safe.code,message:safe.message}]),now(),id).run();}
    await audit(env,id,'customer','submitted',{consent:true});return json({case:publicCase(await env.DB.prepare('SELECT * FROM consultations WHERE id=?').bind(id).first())},201);
}
async function api(request,env){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(['POST','PUT','PATCH','DELETE'].includes(method))sameOrigin(request);
  await ensureSourceRelease(env);
  if(path==='/api/marco/status'&&method==='GET')return json(await marcoStatus(env));
  if(path==='/api/marco/evaluate'&&method==='POST'){if(env.DB)await quota(env,'marco:'+now().slice(0,10)+await hash(request.headers.get('cf-connecting-ip')||session(request)||'anonymous'),100);return json(await marcoEvaluate(env,await body(request)));}
  if(path==='/api/marco/question'&&method==='POST'){if(env.DB)await quota(env,'marco:'+now().slice(0,10)+await hash(request.headers.get('cf-connecting-ip')||session(request)||'anonymous'),100);return json(await marcoQuestion(env,await body(request)));}
  if(path==='/api/health'){let db=false,counts=[];if(env.DB){try{counts=await rows(env.DB.prepare('SELECT kind,status,count(*) as count FROM documents GROUP BY kind,status'));db=true;}catch{}}return json({api_key_configured:!!env.OPENAI_API_KEY,database_ready:db,model:env.OPENAI_MODEL||'gpt-4.1-mini',sources:counts,prepared_sources:corpus.length,rag_ready:db&&counts.some(c=>c.status==='active'),live_research_enabled:env.SEUM_LIVE_RESEARCH==='true',research_provider:'국세청 국세법령정보시스템',issue_count:issues.length,expert_configured:!!env.EXPERT_EMAILS,answer_policy:'verified-retrieval-only'});}
  if(path==='/api/session'&&method==='POST'){let token=session(request);if(!token)token=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');return json({ready:true},200,{'Set-Cookie':`seum_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`});}
  if(path==='/api/library'&&method==='GET'){const list=env.DB?await rows(env.DB.prepare('SELECT id,title,kind,url,effective_from,effective_to,case_number,decision_date,status,verified_at,notes FROM documents ORDER BY kind,title')):[];return json({documents:list,prepared:corpus.map(({body,...doc})=>({...doc,status:'prepared'}))});}
  if(path.startsWith('/api/expert/'))expert(request,env);
  if(!env.DB)throw new ApiError(503,'DATABASE_NOT_READY','신청·검토함 데이터베이스 연결이 아직 준비되지 않았습니다.');
  if(path==='/api/tax/calculate'&&method==='POST'){
    const input=await body(request),calculation=calculateTax(input);
    if(input.case_id){const token=session(request);if(!token)throw new ApiError(401,'SESSION_REQUIRED','계산 검토 기록을 저장하려면 같은 브라우저의 대화가 필요합니다.');const owner=await hash(token),row=await env.DB.prepare('SELECT * FROM consultations WHERE id=? AND owner_hash=?').bind(input.case_id,owner).first();if(!row)throw new ApiError(404,'NOT_FOUND','계산과 연결할 검토 기록이 없습니다.');const generated=parse(row.answer,null);if(!generated?.tax_proposal)throw new ApiError(400,'TAX_REVIEW_REQUIRED','세액 검토 기록에만 계산 결과를 연결할 수 있습니다.');if(row.status==='resolved')throw new ApiError(409,'REVIEW_CLOSED','검토가 완료된 기록입니다. 새 세액 검토를 시작해 주세요.');
      if(generated.tax_proposal.tax_kind&&generated.tax_proposal.tax_kind!==calculation.tax_kind)throw new ApiError(400,'TAX_KIND_MISMATCH','검토한 세목과 계산 세목이 다릅니다. 새 AI 검토를 진행해 주세요.');if(row.transaction_date!==calculation.transaction_date)throw new ApiError(400,'REVIEW_DATE_CHANGED','기준일이 변경됐습니다. 해당 날짜로 AI 적용 조건을 다시 검토해 주세요.');
      const result=await env.DB.prepare('UPDATE consultations SET answer=?,updated_at=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify({...generated,calculation}),now(),row.id,row.version).run();if(!result.meta?.changes)throw new ApiError(409,'VERSION_CONFLICT','검토 기록이 변경됐습니다. 다시 확인해 주세요.');await audit(env,row.id,'customer','calculation_confirmed',{rate_version:calculation.rate_version});
    }return json({calculation});
  }
  if(path==='/api/tax/analyze'&&method==='POST'){
    const input=await body(request);if(!taxKinds.includes(input.tax_kind))throw new ApiError(400,'TAX_KIND_REQUIRED','세목을 선택해 주세요.');
    const question=checkedText(input.question,'상황 설명',5700,5);
    return submitConsultation(request,env,{question:'[세액 계산 적용 조건 검토 · '+input.tax_kind+']\n'+question,transaction_date:input.transaction_date,request_key:input.request_key,consent:input.consent,tax_kind:input.tax_kind});
  }
  if(path==='/api/tax/proposal'&&method==='POST'){
    const input=await body(request),token=session(request);if(!token)throw new ApiError(401,'SESSION_REQUIRED','같은 브라우저의 검토 기록이 필요합니다.');
    const id=checkedText(input.case_id,'검토 번호',80,1),owner=await hash(token),row=await env.DB.prepare('SELECT * FROM consultations WHERE id=? AND owner_hash=?').bind(id,owner).first();if(!row)throw new ApiError(404,'NOT_FOUND','검토 기록이 없습니다.');const generated=parse(row.answer,null);
    if(!generated||!taxKinds.includes(generated.tax_kind))throw new ApiError(400,'TAX_REVIEW_REQUIRED','공식 근거를 확인한 세액 검토가 먼저 필요합니다.');if(generated.tax_proposal)return json({case:publicCase(row)});if(row.status==='resolved')throw new ApiError(409,'REVIEW_CLOSED','검토 완료된 기록입니다. 새 검토를 시작해 주세요.');
    if(generated.tax_proposal_pending&&Date.now()-Date.parse(row.updated_at)<120000)return json({case:publicCase(row),proposal_pending:true},202);
    if((generated.tax_proposal_attempts||0)>=3)throw new ApiError(429,'PROPOSAL_LIMIT','이 검토의 입력 초안 생성 횟수에 도달했습니다. 전문가에게 확인해 주세요.');
    const requestId=crypto.randomUUID(),reserved={...generated,tax_proposal_pending:true,tax_proposal_request:requestId,tax_proposal_attempts:(generated.tax_proposal_attempts||0)+1};const lock=await env.DB.prepare('UPDATE consultations SET answer=?,updated_at=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(reserved),now(),id,row.version).run();if(!lock.meta?.changes)throw new ApiError(409,'VERSION_CONFLICT','검토 기록이 변경됐습니다. 다시 확인해 주세요.');
    try{const proposal=await proposeTaxInputs(env,row.question,generated.tax_kind,parse(row.evidence,[])),answer={...generated.answer};if(proposal.requires_review){answer.needs_expert=true;answer.review_reasons=[...new Set([...answer.review_reasons,'계산 입력값 또는 공제 적용 조건 추가 확인 필요',...proposal.warnings,...proposal.unsupported_conditions])];}
      const final={...reserved,answer,tax_proposal:proposal,tax_proposal_pending:false};const saved=await env.DB.prepare('UPDATE consultations SET answer=?,reasons=?,status=?,updated_at=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(final),JSON.stringify(answer.review_reasons),answer.needs_expert?'needs_review':'draft_ready',now(),id,row.version+1).run();if(!saved.meta?.changes)throw new ApiError(409,'VERSION_CONFLICT','담당자 검토가 변경됐습니다. 다시 확인해 주세요.');await audit(env,id,'customer','tax_proposal_created',{});return json({case:publicCase(await env.DB.prepare('SELECT * FROM consultations WHERE id=?').bind(id).first())});
    }catch(error){await env.DB.prepare("UPDATE consultations SET answer=json_set(answer,'$.tax_proposal_pending',json('false')),updated_at=?,version=version+1 WHERE id=? AND json_extract(answer,'$.tax_proposal_request')=?").bind(now(),id,requestId).run();throw error;}
  }
  if(path==='/api/research/analyze'&&method==='POST'){
    const input=await body(request),question=checkedText(input.question,'비교할 사례',5600,5),query=checkedText(input.query||'','검토 쟁점',100);
    return submitConsultation(request,env,{question:'[판례·세법 비교 분석]\n검토 쟁점: '+query+'\n고객 사례: '+question,transaction_date:input.transaction_date,request_key:input.request_key,consent:input.consent,analysis_mode:'comparison'});
  }
  if(path==='/api/issues'&&method==='GET')return json({issues,note:'쟁점 분류이며 법적 결론이 아닙니다. 각 쟁점의 법령·판례·해석례는 공식 검색에서 조회합니다.'});
  if(path==='/api/research'&&method==='POST'){
    if(env.SEUM_LIVE_RESEARCH!=='true')throw new ApiError(503,'LIVE_RESEARCH_NOT_ENABLED','공식 통합검색 연결을 준비 중입니다. 등록된 원문은 아래 자료함에서 볼 수 있습니다.');
    const input=await body(request),query=checkedText(input.query,'검색어',100,2),collection=input.collection||'all',page=Number(input.page||1);if(!Number.isInteger(page)||page<1||page>100)throw new ApiError(400,'INVALID_PAGE','페이지를 확인해 주세요.');
    const day=now().slice(0,10);await quota(env,'research-global:'+day,500);await quota(env,'research-client:'+day+await hash(request.headers.get('cf-connecting-ip')||session(request)||'anonymous'),60);
    return json(await searchOfficial(env,query,{collection,page,limit:8}));
  }
  if(path==='/api/research/detail'&&method==='POST'){
    if(env.SEUM_LIVE_RESEARCH!=='true')throw new ApiError(503,'LIVE_RESEARCH_NOT_ENABLED','공식 통합검색 연결을 준비 중입니다.');
    const input=await body(request),query=checkedText(input.query,'검색어',100,2),sourceId=checkedText(input.source_id,'자료 번호',150,1),page=Number(input.page||1),collection=input.collection||'all';
    if(!Number.isInteger(page)||page<1||page>100)throw new ApiError(400,'INVALID_PAGE','페이지를 확인해 주세요.');
    await quota(env,'research-detail:'+now().slice(0,10)+await hash(request.headers.get('cf-connecting-ip')||session(request)||'anonymous'),80);
    const search=await searchOfficial(env,query,{page,collection,limit:8}),item=search.collections.flatMap(c=>c.documents).find(d=>d.source_id===sourceId);if(!item)throw new ApiError(404,'SOURCE_NOT_FOUND','현재 검색 결과에서 확인되는 자료만 열 수 있습니다.');
    return json({document:await sourceDetail(env,item,validDate(input.transaction_date||null))});
  }
  const chatToken=session(request);
  if(path.startsWith('/api/chat/')&&!chatToken)throw new ApiError(401,'SESSION_REQUIRED','화면을 새로고침한 뒤 다시 대화해 주세요.');
  if(path==='/api/chat/threads'&&method==='GET'){
    return json({threads:await rows(env.DB.prepare('SELECT t.id,t.title,t.transaction_date,t.created_at,t.updated_at,(SELECT count(*) FROM chat_turns m WHERE m.thread_id=t.id) AS turns FROM chat_threads t WHERE t.owner_hash=? ORDER BY t.updated_at DESC LIMIT 50').bind(await hash(chatToken)))});
  }
  const threadRoute=path.match(/^\/api\/chat\/threads\/([a-f0-9]{32})$/);
  if(threadRoute&&method==='GET'){
    const thread=await env.DB.prepare('SELECT id,title,transaction_date,created_at,updated_at FROM chat_threads WHERE id=? AND owner_hash=?').bind(threadRoute[1],await hash(chatToken)).first();if(!thread)throw new ApiError(404,'NOT_FOUND','대화를 찾을 수 없습니다.');
    const turns=await rows(env.DB.prepare('SELECT c.* FROM consultations c JOIN chat_turns m ON m.case_id=c.id WHERE m.thread_id=? ORDER BY m.created_at,c.rowid').bind(thread.id));return json({thread,turns:turns.map(publicCase)});
  }
  if(path==='/api/chat/messages'&&method==='POST'){
    const data=await body(request),owner=await hash(chatToken),requestKey=checkedText(data.request_key,'요청 번호',70,16),question=checkedText(data.question,'질문',6000,1);
    if(data.consent!==true)throw new ApiError(400,'CONSENT_REQUIRED','대화 저장 및 AI 전송 안내에 동의해 주세요.');
    if(!/^[\w-]+$/.test(requestKey))throw new ApiError(400,'INVALID_INPUT','요청 번호를 확인해 주세요.');
    let threadId=data.thread_id;if(threadId&&!/^[a-f0-9]{32}$/.test(threadId))throw new ApiError(400,'INVALID_THREAD','대화 번호를 확인해 주세요.');
    if(!threadId){threadId=(await hash(owner+'|'+requestKey)).slice(0,32);const created=now();await env.DB.prepare('INSERT INTO chat_threads (id,owner_hash,title,transaction_date,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(threadId,owner,question.slice(0,60),validDate(data.transaction_date||null),created,created).run();}
    const thread=await env.DB.prepare('SELECT * FROM chat_threads WHERE id=? AND owner_hash=?').bind(threadId,owner).first();if(!thread)throw new ApiError(404,'NOT_FOUND','대화를 찾을 수 없습니다.');
    const key=await hash(threadId+'|'+requestKey),locked=await env.DB.prepare('UPDATE chat_threads SET pending_key=?,pending_at=? WHERE id=? AND (pending_key IS NULL OR pending_at<?)').bind(key,now(),threadId,new Date(Date.now()-600000).toISOString()).run();
    if(!locked.meta?.changes)throw new ApiError(409,'CHAT_BUSY','앞선 답변을 확인 중입니다. 잠시 후 다시 확인해 주세요.');
    try{
      const previous=(await rows(env.DB.prepare('SELECT c.question,c.answer,c.evidence,c.transaction_date FROM consultations c JOIN chat_turns m ON m.case_id=c.id WHERE m.thread_id=? ORDER BY m.created_at DESC,c.rowid DESC LIMIT 8').bind(threadId))).reverse();
      const history=previous.flatMap(c=>[{role:'user',text:c.question},...(parse(c.answer,null)?.answer?[{role:'assistant',text:parse(c.answer,null).answer.summary}]:[])]);
      const date=validDate(data.transaction_date||thread.transaction_date||null);
      const priorEvidence=previous.slice(-2).flatMap(c=>parse(c.evidence,[]));
      const response=await submitConsultation(request,env,{question,history,transaction_date:date,request_key:key,consent:true},threadId,priorEvidence),result=await response.json();
      await env.DB.prepare('UPDATE chat_threads SET transaction_date=?,updated_at=? WHERE id=?').bind(date,now(),threadId).run();return json({...result,thread_id:threadId},response.status);
    }finally{await env.DB.prepare('UPDATE chat_threads SET pending_key=NULL,pending_at=NULL WHERE id=? AND pending_key=?').bind(threadId,key).run();}
  }
  if(path==='/api/consultations'&&method==='GET'){const token=session(request);if(!token)return json({cases:[]});const list=await rows(env.DB.prepare('SELECT * FROM consultations WHERE owner_hash=? ORDER BY created_at DESC LIMIT 50').bind(await hash(token)));return json({cases:list.map(publicCase)});}
  if(path==='/api/consultations'&&method==='POST')return submitConsultation(request,env,await body(request));
  const requested=path.match(/^\/api\/consultations\/([\w-]+)$/);if(requested&&method==='GET'){const token=session(request);const row=token?await env.DB.prepare('SELECT * FROM consultations WHERE id=? AND owner_hash=?').bind(requested[1],await hash(token)).first():null;if(!row)throw new ApiError(404,'NOT_FOUND','신청 건을 찾을 수 없습니다.');return json({case:publicCase(row)});}
  if(path==='/api/expert/me')return json({authorized:true});
  if(path==='/api/expert/connection/test'&&method==='POST'){await openai(env,'/models/'+encodeURIComponent(env.OPENAI_MODEL||'gpt-4.1-mini'),undefined,'GET');return json({api_reachable:true,model:env.OPENAI_MODEL||'gpt-4.1-mini'});}
  const analyze=path.match(/^\/api\/expert\/cases\/([\w-]+)\/analyze$/);
  if(analyze&&method==='POST'){
    const actor=expert(request,env),row=await env.DB.prepare('SELECT * FROM consultations WHERE id=?').bind(analyze[1]).first();if(!row)throw new ApiError(404,'NOT_FOUND','신청 건이 없습니다.');if(row.status==='resolved')throw new ApiError(409,'REVIEW_CLOSED','완료된 검토는 먼저 검토 중 상태로 변경해 주세요.');
    const retrieval=await retrieveKnowledge(env,row.question,parse(row.history,[]),row.transaction_date),evidence=retrieval.evidence,generated=await generate(env,row.question,parse(row.history,[]),row.transaction_date,evidence);generated.research=retrieval.research;if(retrieval.warnings.length){generated.answer.needs_expert=true;generated.answer.review_reasons.push(...retrieval.warnings);}
    const result=await env.DB.prepare('UPDATE consultations SET answer=?,evidence=?,reasons=?,status=?,updated_at=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(generated),JSON.stringify(evidence),JSON.stringify(generated.answer.review_reasons),generated.answer.needs_expert?'needs_review':'draft_ready',now(),row.id,row.version).run();if(!result.meta?.changes)throw new ApiError(409,'VERSION_CONFLICT','검토 건이 수정되었습니다. 다시 열어 주세요.');await audit(env,row.id,actor.email,'analysis_retried',{});return json({updated:true});
  }
  if(path==='/api/expert/cases'&&method==='GET')return json({cases:await rows(env.DB.prepare('SELECT id,question,transaction_date,customer,status,reasons,created_at,updated_at FROM consultations ORDER BY created_at DESC LIMIT 150'))});
  const detail=path.match(/^\/api\/expert\/cases\/([\w-]+)$/);
  if(detail&&method==='GET'){const row=await env.DB.prepare('SELECT * FROM consultations WHERE id=?').bind(detail[1]).first();if(!row)throw new ApiError(404,'NOT_FOUND','신청 건이 없습니다.');return json({case:row,audit:await rows(env.DB.prepare('SELECT * FROM audit WHERE case_id=? ORDER BY created_at DESC').bind(detail[1]))});}
  if(detail&&method==='PATCH'){const actor=expert(request,env),data=await body(request),status=checkedText(data.status,'상태',30);if(!['in_review','needs_information','resolved'].includes(status))throw new ApiError(400,'INVALID_STATUS','상태를 확인해 주세요.');const notes=checkedText(data.internal_notes||'','내부 검토',20000),reply=checkedText(data.expert_reply||'','고객 전달 의견',12000);if(status==='resolved'&&(data.confirmed!==true||reply.length<10))throw new ApiError(400,'REVIEW_CONFIRMATION','최종 검토 확인과 고객 전달 의견을 작성해 주세요.');const version=Number(data.version);const result=await env.DB.prepare('UPDATE consultations SET status=?,internal_notes=?,expert_reply=?,reviewed_by=?,reviewed_at=?,updated_at=?,version=version+1 WHERE id=? AND version=?').bind(status,notes,reply,actor.email,now(),now(),detail[1],version).run();if(!result.meta?.changes)throw new ApiError(409,'VERSION_CONFLICT','다른 담당자가 수정했습니다. 다시 열어 최신 내용을 확인해 주세요.');await audit(env,detail[1],actor.email,'review_updated',{status});return json({saved:true});}
  if(path==='/api/expert/sources'&&method==='GET')return json({documents:await rows(env.DB.prepare('SELECT * FROM documents ORDER BY verified_at DESC')),prepared:corpus});
  if(path==='/api/expert/sources'&&method==='POST'){
    const actor=expert(request,env),data=await body(request);if(data.verified!==true)throw new ApiError(400,'VERIFY_REQUIRED','원문·메타데이터 확인을 먼저 완료해 주세요.');
    const title=checkedText(data.title,'자료 제목',250,3),kind=checkedText(data.kind,'자료 종류',30),url=officialUrl(data.url),text=checkedText(data.body,'원문',100000,100),effectiveFrom=validDate(data.effective_from||null),effectiveTo=validDate(data.effective_to||null),caseNumber=checkedText(data.case_number||'','사건번호',100),decisionDate=validDate(data.decision_date||null),notes=checkedText(data.notes||'','자료 메모',2000);
    if(!['law','case','interpretation','guidance'].includes(kind))throw new ApiError(400,'INVALID_SOURCE','자료 종류를 확인해 주세요.');if(kind==='law'&&!effectiveFrom)throw new ApiError(400,'DATE_REQUIRED','법령 시행일을 등록해 주세요.');if(effectiveFrom&&effectiveTo&&effectiveTo<effectiveFrom)throw new ApiError(400,'INVALID_DATE','시행 종료일이 시작일보다 빠릅니다.');if(kind==='case'&&(!caseNumber||!decisionDate))throw new ApiError(400,'CASE_METADATA','판례 사건번호와 선고일이 필요합니다.');
    const digest=await hash(text),id=await hash(url+'|'+digest);await env.DB.prepare('INSERT INTO documents (id,title,kind,url,body,effective_from,effective_to,case_number,decision_date,digest,verified_by,verified_at,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,title,kind,url,text,effectiveFrom,effectiveTo,caseNumber||null,decisionDate,digest,actor.email,now(),notes).run();await audit(env,id,actor.email,'source_verified',{digest,url});return json({id,status:'pending'},201);
  }
  const index=path.match(/^\/api\/expert\/sources\/([a-f0-9]+)\/index$/);if(index&&method==='POST'){const doc=await env.DB.prepare('SELECT * FROM documents WHERE id=?').bind(index[1]).first();if(!doc)throw new ApiError(404,'NOT_FOUND','자료가 없습니다.');return json(await indexDocument(env,doc));}
  throw new ApiError(404,'NOT_FOUND','요청한 기능을 찾을 수 없습니다.');
}
export default {async fetch(request,env,ctx){try{const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return await api(request,env);const name=url.pathname==='/'||url.pathname==='/expert'?'/index.html':url.pathname;const asset=assets[name];if(!asset)return new Response('Not found',{status:404});const bytes=asset.encoding==='base64'?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body;return new Response(bytes,{headers:{'Content-Type':asset.type,'Cache-Control':name==='/sw.js'?'no-cache':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}});}catch(e){return json({error:{code:e instanceof ApiError?e.code:'SERVER_ERROR',message:e instanceof ApiError?e.message:'요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',...(e instanceof ApiError&&e.source_metadata?{source_metadata:e.source_metadata}:{})}},e instanceof ApiError?e.status:500);}}};
