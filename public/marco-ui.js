window.SeumMarco=(()=>{
 const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let status=null,version=0;
 // Revisions catch edit-and-revert; snapshots catch silent programmatic edits.
 // Request ownership keeps old completions from unlocking a replacement form.
 const requests=new WeakMap();
 function formState(form){if(!requests.has(form))requests.set(form,{revision:0,pending:null});return requests.get(form);}
 const snapshot=form=>JSON.stringify([...new FormData(form)]);
 function currentRequest(form,request){const state=formState(form);return form.isConnected&&state.pending===request&&state.revision===request.revision&&version===request.version&&snapshot(form)===request.snapshot;}
 function updateButton(form,button,question=false){
  if(!button)return;
  const pending=form&&requests.get(form)?.pending,ready=status?.configured&&status?.engine_verified;
  button.disabled=!!pending||!ready;
  button.textContent=pending?(question?'MARCO 원본 판정 확인 중…':'MARCO 규칙 검증 중…'):ready?(question?'선택한 질문을 MARCO로 확인':'입력한 과세표준으로 MARCO 검증'):(question?'MARCO 연결 확인 후 질문 가능':'MARCO 연결 확인 후 검증 가능');
 }
 function invalidate(form,question=false){
  if(form)formState(form).revision++;
  const prefix=question?'#marcoQuestion':'#marco';
  const result=document.querySelector(prefix+'Result'),error=document.querySelector(prefix+'Error');
  if(result)result.innerHTML='';if(error)error.textContent='';
 }
 function beginRequest(form){const state=formState(form);return state.pending={revision:state.revision,version,snapshot:snapshot(form)};}
 function finishRequest(form,request,button,question=false){const state=formState(form);if(state.pending!==request)return;state.pending=null;if(form.isConnected)updateButton(form,button,question);}
 // Canonical prompts from knowledge.v1.json, pack marco-korean-tax-core-2026-11-06. No answer text is embedded.
 const questionOptions=[{"id": "gift-minimum", "question": "증여세 과세최저한이 뭐야?"}, {"id": "inheritance-minimum", "question": "상속세 과세최저한이 뭐야?"}, {"id": "inheritance-definition", "question": "상속세와 증여세를 어떻게 구분해?"}, {"id": "gift-definition", "question": "증여의 뜻이 뭐야?"}, {"id": "death-gift", "question": "사인증여는 증여세야?"}, {"id": "base-not-assets", "question": "재산가액과 과세표준은 같아?"}, {"id": "same-rates-not-same-base", "question": "상속세와 증여세 세율이 같아?"}];

 const firstSupported='2026-01-02',lastVerified='2026-11-06';
 const shortCommit=value=>String(value||'미제공').slice(0,8);
 function dateBounds(){return {from:status?.supported_from&&status.supported_from>firstSupported?status.supported_from:firstSupported,through:status?.verified_through&&status.verified_through<lastVerified?status.verified_through:lastVerified};}
 function officialURL(value){try{const url=new URL(value);return url.protocol==='https:'&&['nts.go.kr','law.go.kr','scourt.go.kr'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host))?url.href:null;}catch{return null;}}
 async function request(path,body){const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});let data;try{data=await response.json();}catch{throw Error('서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');}if(!response.ok)throw Error(data.error?.message||'MARCO 확인을 완료하지 못했습니다.');return data;}
 function page(kind){return `<section class="panel marco-panel" aria-labelledby="marcoTitle"><div class="panel-top"><div><div class="eyebrow">MARCO · STRUCTURED VERIFICATION</div><h2 id="marcoTitle">확인한 과세표준으로 MARCO 규칙 검증</h2></div><span class="tag gray" id="marcoStatus" role="status">연결 상태 확인 중</span></div><p class="rag-help">출처 기반 세무 규칙 모듈 · <a class="source-link" href="https://github.com/DoTaeIn/Marco" target="_blank" rel="noopener">Powered by MARCO · Created by DoTaeIn ↗</a><br>Knowledge graphs from MARCO by DoTaeIn · CC BY 4.0</p><p class="sub">상속세·증여세의 <strong>공제 후 과세표준</strong>을 직접 입력하는 기본세율 검증입니다. 재산가액에서 공제를 판단하거나 최종 신고세액을 계산하는 기능이 아닙니다.</p><p class="rag-help" id="marcoStatusDetail">연결과 엔진 버전이 확인되기 전에는 검증 결과를 표시하지 않습니다.</p><button class="text-btn" type="button" id="marcoRefresh">연결 상태 다시 확인</button><form id="marcoForm" class="rag-form"><div class="tax-field-grid"><label>검증 세목<select name="tax_type"><option value="inheritance" ${kind==='상속세'?'selected':''}>상속세</option><option value="gift" ${kind==='증여세'?'selected':''}>증여세</option></select></label><label>적용 기준일<input name="as_of" type="date" min="2026-01-02" max="2026-11-06" required><small id="marcoDateRange">검증 범위: 2026-01-02 ~ 2026-11-06</small></label><label>공제 후 과세표준 (원)<input name="tax_base_won" type="number" min="0" max="1000000000000000" step="1" inputmode="numeric" placeholder="예: 100000000" required><small>재산가액이 아닙니다. 금액 단위는 원입니다.</small></label></div><p class="notice">기본세율만 검증합니다. 공제 요건, 세액공제, 할증·중과, 비과세, 양도소득세 및 사실관계 판단은 포함하지 않습니다. 이름·연락처·사건 설명은 입력하거나 전송하지 않습니다.</p><label class="consent"><input name="marco_consent" type="checkbox" required><span>선택한 세목·적용일·과세표준 금액을 확인된 MARCO 실행 환경에서 처리하여 기본세율 규칙을 검증하는 데 동의합니다.</span></label><div id="marcoError" role="alert"></div><button class="primary" type="submit" disabled>MARCO 연결 확인 후 검증 가능</button></form><div id="marcoResult" aria-live="polite"></div>${questionPanel()}</section>`;}
 function questionPanel(){return `<section class="issue-card" aria-labelledby="marcoQuestionTitle"><h3 id="marcoQuestionTitle">MARCO 선언된 세법 질문 확인</h3><p>등록된 7개 질문만 선택할 수 있습니다. 자유문장 이해나 개별 사실관계 판단이 아니며, 세액 계산과 별개입니다. 검증된 런타임의 원본 경로·판정이 있는 답변만 표시합니다.</p><form id="marcoQuestionForm" class="rag-form"><label>등록된 질문<select name="question" required>${questionOptions.map(item=>`<option value="${E(item.question)}">${E(item.question)}</option>`).join('')}</select></label><label>적용 기준일<input name="as_of" type="date" min="2026-01-02" max="2026-11-06" required><small id="marcoQuestionDateRange">검증 범위: 2026-01-02 ~ 2026-11-06</small></label><label class="consent"><input name="marco_question_consent" type="checkbox" required><span>선택한 질문·적용일을 확인된 MARCO 실행 환경에서 처리하여 선언된 세법 지식을 확인하는 데 동의합니다.</span></label><div id="marcoQuestionError" role="alert"></div><button class="primary" type="submit" disabled>MARCO 연결 확인 후 질문 가능</button></form><div id="marcoQuestionResult" aria-live="polite"></div></section>`;}
 function questionResultView(data,selectedTopic){
  const r=data?.result;if(!r)throw Error('질문 응답을 확인하지 못했습니다. 답변을 표시하지 않습니다.');
  const list=value=>Array.isArray(value)?value:[],text=value=>typeof value==='string'?value:JSON.stringify(value??'');
  const limits=`<div class="notice"><strong>적용 가정·한계</strong><ul>${[...list(r.assumptions),...list(r.limitations)].map(item=>`<li>${E(text(item))}</li>`).join('')}</ul></div>`;
  if(r.status!=='answered'){const labels={unsupported:'지원하지 않는 질문',insufficient_information:'추가 정보 필요',invalid_input:'입력값 확인 필요'};if(!labels[r.status])throw Error('질문 처리 상태를 검증하지 못했습니다. 답변을 표시하지 않습니다.');return `<div class="notice"><h4>${labels[r.status]}</h4><p>${E(r.reason||'선택한 질문과 적용일을 확인해 주세요.')}</p><p>확인된 답변을 제공하지 못했습니다.</p></div>${limits}`;}
  const evidence=r.native_evidence,path=evidence?.path,hasPath=(typeof path==='string'&&path.trim().length>0)||(Array.isArray(path)&&path.length>0);
  if(r.topic!==selectedTopic||typeof r.answer!=='string'||!r.answer.trim()||evidence?.engine!=='MARCO engine.Session'||evidence?.verdict!=='인정'||!hasPath)throw Error('원본 MARCO 판정·경로 또는 선택한 질문과의 일치를 확인하지 못했습니다. 답변을 표시하지 않습니다.');
  return `<div class="analysis-summary"><strong>선택한 세법 질문의 확인 답변</strong><p>${E(r.answer)}</p></div><p class="rag-help">세액 계산 결과가 아닙니다. 엔진 ${E(shortCommit(data.integration?.engine_commit))} · 지식 기준 ${E(data.integration?.knowledge_version||'미제공')}</p><details open><summary>원본 MARCO 판정과 경로</summary><p>${E(evidence.engine)} · ${E(evidence.verdict)}</p><p>${E(text(path))}</p>${evidence.graph_answer?`<p>그래프 답변: ${E(text(evidence.graph_answer))}</p>`:''}</details><ul>${list(r.sources).map(source=>{const url=officialURL(source?.url);return `<li>${url?`<a class="source-link" href="${E(url)}" target="_blank" rel="noopener">${E(source.title||source.id||'공식 근거')} ↗</a>`:E(text(source))}</li>`;}).join('')}</ul>${limits}`;
 }
 async function mount(){
  const target=document.querySelector('#marcoStatus');if(!target)return;
  const current=++version;status=null;
  const form=document.querySelector('#marcoForm'),questionForm=document.querySelector('#marcoQuestionForm');
  const button=document.querySelector('#marcoForm button[type=submit]'),questionButton=document.querySelector('#marcoQuestionForm button[type=submit]');
  invalidate(form);invalidate(questionForm,true);updateButton(form,button);updateButton(questionForm,questionButton,true);
  target.textContent='연결 상태 확인 중';
  try{
   const data=await request('/api/marco/status');if(current!==version||!target.isConnected)return;
   status=data;const bounds=dateBounds(),dateInput=document.querySelector('#marcoForm [name=as_of]');
   if(dateInput){dateInput.min=bounds.from;dateInput.max=bounds.through;}
   const dateLabel=document.querySelector('#marcoDateRange');if(dateLabel)dateLabel.textContent=`검증 범위: ${bounds.from} ~ ${bounds.through}`;
   const ready=data.configured&&data.engine_verified;target.textContent=ready?'엔진 연결·버전 확인됨':'MARCO 연결 준비 중';
   document.querySelector('#marcoStatusDetail').textContent=ready?`${data.runtime==='sites_worker_cpython_wasm'?'이 Site 서버에서 원본 MARCO Python을 직접 실행합니다. OpenAI·별도 서버로 전송하거나 입력값을 저장하지 않습니다.':'외부 MARCO 서버: '+(data.service_origin||'주소 확인 필요')} 엔진 ${shortCommit(data.engine_commit)} · 세법 확장 ${shortCommit(data.training_commit)} · 지식 기준 ${data.knowledge_version||'미제공'}`:(data.reason||'MARCO 실행 상태가 확인되지 않았습니다. 기존 세액 계산은 아래에서 이용할 수 있습니다.');
   const questionDate=document.querySelector('#marcoQuestionForm [name=as_of]');if(questionDate){questionDate.min=bounds.from;questionDate.max=bounds.through;}
   const questionRange=document.querySelector('#marcoQuestionDateRange');if(questionRange)questionRange.textContent=`검증 범위: ${bounds.from} ~ ${bounds.through}`;
   updateButton(form,button);updateButton(questionForm,questionButton,true);
  }catch(error){
   if(current!==version||!target.isConnected)return;
   target.textContent='연결 확인 실패';document.querySelector('#marcoStatusDetail').textContent=error.message;
   updateButton(form,button);updateButton(questionForm,questionButton,true);
  }
  const label=document.querySelector('#taxEngineStatus');
  if(label)try{
   const health=await request('/api/health');if(current!==version||!label.isConnected)return;
   label.textContent=health.api_key_configured?'기존 OpenAI 분석 · 키 등록됨, 실제 호출 결과 확인 필요':'기존 OpenAI 분석 · 연결 필요 (MARCO와 별도)';
   const analysisButton=document.querySelector('#taxAnalyzeForm button[type=submit]');
   if(analysisButton){analysisButton.disabled=!health.api_key_configured||analysisButton.dataset?.pending==='true';if(!health.api_key_configured)analysisButton.textContent='OpenAI 연결 후 상황 분석 가능';}
  }catch{if(current===version&&label.isConnected)label.textContent='기존 OpenAI 분석 · 연결 상태 확인 실패';}
 }
 function resultView(data){
  const r=data.result;if(!r)throw Error('검증 결과를 확인하지 못했습니다. 결과를 적용하지 않았습니다.');
  const labels={computed:'기본세율 계산 완료',unsupported:'지원 범위 밖',insufficient_information:'추가 정보 필요',invalid_input:'입력값 확인 필요'},computed=r.status==='computed';
  if(!labels[r.status]||(computed&&(!Number.isSafeInteger(r.basic_tax_won)||r.basic_tax_won<0)))throw Error('검증 응답 형식을 확인하지 못했습니다. 결과를 적용하지 않았습니다.');
  const items=value=>Array.isArray(value)?value:value?[value]:[];
  const describe=value=>typeof value==='string'?value:Object.entries(value||{}).map(([key,val])=>`${key}: ${typeof val==='object'?JSON.stringify(val):val}`).join(' · ');
  const sourceView=source=>{const url=officialURL(typeof source==='string'?source:source?.url),label=typeof source==='string'?source:source?.title||source?.name||source?.id||'공식 근거';return url?`<a class="source-link" href="${E(url)}" target="_blank" rel="noopener">${E(label)} ↗</a>`:E(describe(source));};
  return `<div class="tax-calculation-result"><span>MARCO 기본세율 검증 · ${E(r.tax_type==='gift'?'증여세':r.tax_type==='inheritance'?'상속세':'세목 확인 필요')}</span>${computed?`<strong>${r.basic_tax_won.toLocaleString('ko-KR')}<small>원</small></strong><p>최종 납부세액이 아닙니다. ${E(labels[r.status])}${r.below_minimum?' · 과세최저한 미만':''}</p>`:`<h3>${E(labels[r.status])}</h3><p>${E(describe(r.reason||r.message||'지원 조건과 입력값을 확인해 주세요.'))}</p><p>기본세액을 산출하지 않았습니다. 0원 계산 결과가 아닙니다.</p>`}</div><p class="rag-help">출처 기반 규칙 모듈 · 엔진 ${E(shortCommit(data.integration?.engine_commit))} · 지식 기준 ${E(data.integration?.knowledge_version||'미제공')}</p><details><summary>적용 규칙과 근거 확인</summary><ul>${items(r.rule_trace).map(x=>`<li>${E(describe(x))}</li>`).join('')}</ul><ul>${items(r.sources).map(x=>`<li>${sourceView(x)}</li>`).join('')}</ul></details><div class="notice"><strong>적용 가정·한계</strong><ul>${[...items(r.assumptions),...items(r.limitations)].map(x=>`<li>${E(describe(x))}</li>`).join('')}</ul></div>`;
 }
 document.addEventListener('click',event=>{if(event.target.closest('#marcoRefresh'))mount();});
 function onEdit(event){
  const form=event.target.closest('#marcoForm')||event.target.closest('#marcoQuestionForm');if(!form)return;
  const question=form.id==='marcoQuestionForm',consent=question?'marco_question_consent':'marco_consent';
  invalidate(form,question);
  if(event.target.name!==consent)form.querySelector(`[name=${consent}]`).checked=false;
 }
 document.addEventListener('input',onEdit);
 document.addEventListener('change',onEdit);
 document.addEventListener('submit',async event=>{
  if(event.target.id!=='marcoForm')return;event.preventDefault();
  const form=event.target,button=form.querySelector('button[type=submit]'),error=document.querySelector('#marcoError');
  if(formState(form).pending||button.disabled||!status?.configured||!status?.engine_verified)return;
  error.textContent='';document.querySelector('#marcoResult').innerHTML='';
  const values=Object.fromEntries(new FormData(form)),amount=Number(values.tax_base_won);
  if(values.marco_consent!=='on'||!Number.isSafeInteger(amount)||amount<0||values.tax_base_won.trim()===''){error.textContent='과세표준 금액과 MARCO 처리 안내 동의를 확인해 주세요.';return;}
  const bounds=dateBounds();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(values.as_of)||values.as_of<bounds.from||values.as_of>bounds.through){error.textContent=`검증 가능한 적용일은 ${bounds.from}부터 ${bounds.through}까지입니다.`;return;}
  const pending=beginRequest(form);updateButton(form,button);
  try{
   const data=await request('/api/marco/evaluate',{tax_type:values.tax_type,as_of:values.as_of,amount_kind:'tax_base',tax_base_won:amount,basic_rate_only:true,consent:true});
   if(!currentRequest(form,pending))return;document.querySelector('#marcoResult').innerHTML=resultView(data);
  }catch(e){if(currentRequest(form,pending))error.textContent=e.message;}
  finally{finishRequest(form,pending,button);}
 });
 document.addEventListener('submit',async event=>{
  if(event.target.id!=='marcoQuestionForm')return;event.preventDefault();
  const form=event.target,button=form.querySelector('button[type=submit]'),error=document.querySelector('#marcoQuestionError');
  if(formState(form).pending||button.disabled||!status?.configured||!status?.engine_verified)return;
  const values=Object.fromEntries(new FormData(form)),selected=questionOptions.find(item=>item.question===values.question),bounds=dateBounds();
  error.textContent='';document.querySelector('#marcoQuestionResult').innerHTML='';
  if(!selected||values.marco_question_consent!=='on'){error.textContent='등록된 질문과 MARCO 처리 안내 동의를 확인해 주세요.';return;}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(values.as_of)||values.as_of<bounds.from||values.as_of>bounds.through){error.textContent=`검증 가능한 적용일은 ${bounds.from}부터 ${bounds.through}까지입니다.`;return;}
  const pending=beginRequest(form);updateButton(form,button,true);
  try{
   const data=await request('/api/marco/question',{question:selected.question,as_of:values.as_of,consent:true});
   if(currentRequest(form,pending))document.querySelector('#marcoQuestionResult').innerHTML=questionResultView(data,selected.id);
  }catch(e){if(currentRequest(form,pending))error.textContent=e.message;}
  finally{finishRequest(form,pending,button,true);}
 });
 return {page,mount};
})();
