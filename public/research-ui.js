window.SeumResearch=(()=>{
 let issues=[],library=null,health=null,result=null,selectedTax='전체',searching=false,query='',pageNumber=1,collection='all',error='',loadVersion=0,searchVersion=0,inputRevision=0,pendingSearch=null,resultContext=null,detailRequest=null,detailOwner=null,detailVersion=0;
 const officialSearchURL='https://taxlaw.nts.go.kr/is/USEISA001M.do';
 const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const kinds={law:'법령',case:'법원 판례',decision:'행정 결정례',interpretation:'예규·해석례',maintenance:'해석 정비'};
 async function api(path,data){const r=await fetch(path,{method:data?'POST':'GET',credentials:'same-origin',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});const d=await r.json();if(!r.ok)throw Error(d.error?.message||'자료를 불러오지 못했습니다.');return d;}
 function visibleIssues(){return issues.filter(i=>selectedTax==='전체'||i.tax===selectedTax||i.tax==='공통');}
 function issueCount(){const count=document.querySelector('#researchIssueCount');if(count)count.textContent=visibleIssues().length+'개 표시 / 전체 '+issues.length+'개';}
 function issueCards(){return visibleIssues().map(i=>`<button class="research-issue" data-research-issue="${E(i.id)}"><span>${E(i.tax)}</span><strong>${E(i.title)}</strong><small>${E(i.facts.join(' · '))}</small><b>관련 근거 검색 ↗</b></button>`).join('');}
 function resultHtml(){if(!result)return `<div class="research-start"><span>⚖</span><h3>쟁점을 고르거나 직접 검색하세요</h3><p>공식 자료의 법령·세법해석례·판례·결정례를 함께 조회합니다.<br>목록의 검색 요약과 실제 확인한 원문은 구분해 표시합니다.</p></div>`;return `<div class="research-result-header"><h3>“${E(result.query)}” 공식 검색 결과</h3><span>${E(new Date(result.retrieved_at).toLocaleString('ko-KR'))} 조회</span></div><div class="research-columns">${result.collections.map(c=>`<section><div class="research-category"><h4>${E(c.title)}</h4><b>${c.total.toLocaleString('ko-KR')}건<span class="research-count">이 페이지 ${c.documents.length}건 표시</span></b></div>${c.documents.length?c.documents.map(d=>`<button class="research-document" data-research-source="${E(d.source_id)}"><span class="tag">${E(kinds[d.kind]||d.kind)}</span> <span class="research-metadata-label">검색 목록</span><strong>${E(d.title)}</strong><small>${E(d.case_number||'')} ${E(d.decision_date||d.effective_from||'시점 확인 필요')}</small><p>${E(d.excerpt||'원문을 열어 본문을 확인하세요.')}</p><span class="research-open">상세 원문·연결 법령 확인 →</span></button>`).join(''):'<p class="research-none">이 페이지에서 표시할 자료가 없습니다.</p>'}</section>`).join('')}</div><div class="research-pagination"><button id="researchPrev" ${pageNumber<=1?'disabled':''}>← 이전</button><span>${pageNumber}페이지 · 분류별 최대 8건</span><button id="researchNext" ${result.collections.every(c=>c.total<=pageNumber*8)?'disabled':''}>다음 →</button></div><p class="rag-help">전체 건수는 국세청 검색 서버의 응답입니다. 결과 수는 질의·시점에 따라 달라지며, 화면에 나타난 모든 자료가 AI 답변에 사용된다는 의미는 아닙니다.</p>`;}
 function page(){invalidateSearch();loadVersion++;return heading('LEGAL RESEARCH & ISSUE MAP','판례·세법, 쟁점으로 연결하다','법령·시행령·시행규칙부터 해석례와 판례까지, 공식 원문을 함께 확인하세요.')+`<section class="panel research-search-panel"><form id="researchForm"><label class="sr-only" for="researchQuery">공식 자료 검색</label><div class="research-input-row"><span>⌕</span><input id="researchQuery" maxlength="100" placeholder="쟁점·조문·사건번호를 검색하세요" value="${E(query)}" required><button class="primary" type="submit">근거 검색</button></div><div class="research-options"><label>자료 종류<select id="researchCollection"><option value="all" ${collection==='all'?'selected':''} >법령 · 해석례 · 판례 전체</option><option value="statute" ${collection==='statute'?'selected':''} >법령 · 시행령 · 시행규칙</option><option value="question" ${collection==='question'?'selected':''} >예규 · 세법해석례</option><option value="precedent" ${collection==='precedent'?'selected':''} >판례 · 결정례</option></select></label><label>적용 기준일 (선택)<input type="date" id="researchDate"></label></div><p class="rag-help">검색어는 국세청 공식 검색으로 전송됩니다. 이름·연락처·주민번호 등 개인정보는 입력하지 마세요.</p></form><div id="researchError" class="rag-error" role="alert" ${error?'':'hidden'}>${E(error)}</div></section><div class="research-layout"><aside class="panel research-issue-panel"><div class="panel-top"><h3>쟁점 지도</h3><span class="tag" id="researchIssueCount">분류 불러오는 중</span></div><div class="research-tax-tabs">${['전체','상속세','증여세','양도소득세'].map(t=>`<button data-research-tax="${t}" class="${selectedTax===t?'active':''}">${t}</button>`).join('')}</div><div id="researchIssues" class="research-issues">${issueCards()}</div><p class="rag-help">분류와 확인할 사실을 안내하는 목록입니다. 개별 쟁점의 법적 결론은 검색 원문과 사례를 검토해 판단합니다.</p></aside><section class="panel research-results" id="researchResults">${resultHtml()}</section></div>${SeumAnalysis.researchForm()}<details class="panel research-indexed"><summary>기존에 등록·색인한 공식 자료 보기</summary><div id="researchIndexed"></div></details><dialog class="research-detail-dialog" id="researchDetail" aria-label="공식 자료 상세" aria-labelledby="researchDetailTitle"></dialog>`;}
 // A response belongs to the submitted input revision and exact DOM, not just an ID.
 function ownsSearchDOM(request){return request.form.isConnected&&document.querySelector('#researchForm')===request.form&&document.querySelector('#researchQuery')===request.input&&document.querySelector('#researchCollection')===request.select&&document.querySelector('#researchResults')===request.target&&document.querySelector('#researchError')===request.errorTarget;}
 function matchesSearch(request){return request&&request.version===searchVersion&&request.revision===inputRevision&&ownsSearchDOM(request)&&request.input.value===request.inputValue&&request.select.value===request.collection;}
 function closeDetail(){detailVersion++;detailRequest=null;detailOwner=null;const dialog=document.querySelector('#researchDetail');if(dialog?.open)dialog.close();}
 function invalidateSearch(){searchVersion++;pendingSearch=null;searching=false;result=null;resultContext=null;error='';pageNumber=1;closeDetail();const button=document.querySelector('#researchForm button[type=submit]');if(button)button.disabled=false;}
 function searchFailureHtml(){return `<div class="research-start research-failure"><h3>공식 검색 결과를 불러오지 못했습니다</h3><p>검색 결과가 0건이라는 뜻이 아닙니다. 이번 검색 결과를 확인하지 못했습니다.<br>다시 시도하거나 국세청 공식 검색에서 직접 확인해 주세요.</p><div class="research-error-actions"><button class="primary" data-research-search-retry>검색 다시 시도</button><a class="source-link" href="${officialSearchURL}" target="_blank" rel="noopener noreferrer">국세청 공식 검색 직접 열기 ↗</a></div><p class="rag-help">직접 열기에는 검색어나 개인정보를 포함하지 않습니다.</p></div>`;}
 async function runSearch(reset=true){
  const form=document.querySelector('#researchForm'),input=document.querySelector('#researchQuery'),select=document.querySelector('#researchCollection'),target=document.querySelector('#researchResults'),errorTarget=document.querySelector('#researchError');
  if(!form||!input||!select||!target||!errorTarget)return;
  const nextPage=reset?1:pageNumber;
  if(pendingSearch&&matchesSearch(pendingSearch)&&pendingSearch.page===nextPage)return;
  invalidateSearch();pageNumber=nextPage;query=input.value.trim();collection=select.value;paintError();
  target.innerHTML=resultHtml();
  if(query.length<2){error='검색어를 두 글자 이상 입력해 주세요.';paintError();return;}
  const button=form.querySelector('button[type=submit]');
  const request={version:searchVersion,revision:inputRevision,form,input,select,target,errorTarget,button,inputValue:input.value,query,page:pageNumber,collection};
  pendingSearch=request;searching=true;if(button)button.disabled=true;
  target.innerHTML='<div class="research-start" role="status">국세청 공식 자료를 검색하고 있습니다…</div>';
  try{
   const data=await api('/api/research',{query:request.query,page:request.page,collection:request.collection});
   if(!matchesSearch(request)||pendingSearch!==request)return;
   result=data;resultContext=request;target.innerHTML=resultHtml();
  }catch(e){
   if(!matchesSearch(request)||pendingSearch!==request)return;
   result=null;resultContext=null;error=e.message;paintError();target.innerHTML=searchFailureHtml();
  }finally{
   if(pendingSearch===request){
    pendingSearch=null;searching=false;
    if(ownsSearchDOM(request)){
     if(button)button.disabled=false;
     // Also discard a programmatic input change that did not dispatch an event.
     if(!matchesSearch(request)){result=null;resultContext=null;error='';paintError();target.innerHTML=resultHtml();}
    }
   }
  }
 }

 function paintError(){const target=document.querySelector('#researchError');if(target){target.hidden=!error;target.textContent=error;}}

 // Only link to an official URL supplied by the search/detail API. Never infer a URL from an identifier.
 function officialURL(value){try{const u=new URL(value);return u.protocol==='https:'&&['nts.go.kr','law.go.kr','scourt.go.kr'].some(host=>u.hostname===host||u.hostname.endsWith('.'+host))?u.href:null;}catch{return null;}}
 async function openDetail(){
  const dialog=document.querySelector('#researchDetail');if(!dialog||!detailRequest)return;
  const request=detailRequest,owner=detailOwner,version=++detailVersion,{document:listed,...payload}=request;
  const ownsContext=()=>!owner||(matchesSearch(owner.search)&&document.querySelector('#researchDate')===owner.dateInput&&owner.dateInput.value===owner.dateValue);
  if(!ownsContext()){closeDetail();return;}
  const current=()=>version===detailVersion&&request===detailRequest&&owner===detailOwner&&dialog.isConnected&&dialog.open&&document.querySelector('#researchDetail')===dialog&&ownsContext();
  dialog.innerHTML='<button data-research-close class="chat-source-close" aria-label="닫기">×</button><h2 id="researchDetailTitle">공식 자료 확인 중</h2><p role="status">공식 상세 원문과 연결 법령을 확인하고 있습니다…</p>';
  if(!dialog.open)dialog.showModal();
  try{const data=await api('/api/research/detail',payload),d=data.document;if(!current())return;
   const url=officialURL(d.url);
   dialog.innerHTML=`<button data-research-close class="chat-source-close" aria-label="닫기">×</button><span class="chat-overline">${E(kinds[d.kind]||d.kind)} · 공식 상세 본문 확인</span><h2 id="researchDetailTitle">${E(d.title)}</h2><div class="research-connection-map"><span>검색 쟁점</span><b>→</b><span>${E(kinds[d.kind]||d.kind)}</span><b>→</b><span>연결 법령</span></div><p class="rag-help">${E(d.case_number||'')} ${E(d.decision_date||d.effective_from||'적용 시점 확인 필요')}<br>${E(d.scope_note)}</p>${url?`<a class="source-link" href="${E(url)}" target="_blank" rel="noopener">공식 원문 열기 ↗</a>`:''}${d.related_laws?.length?`<h3>원문에서 연결한 세법 조문</h3>${d.related_laws.map(l=>`<button class="research-related" data-research-related="${E(l)}">${E(l)} ↗</button>`).join('')}`:''}<details open><summary>확보한 공식 본문</summary><div class="chat-source-excerpt">${E(d.body)}</div></details>${d.verification_notes?.length?`<div class="notice">${d.verification_notes.map(E).join('<br>')}</div>`:''}`;
  }catch(e){if(!current())return;const url=officialURL(listed?.url),reference=[listed?.title,listed?.case_number,listed?.decision_date,'자료 ID: '+request.source_id,'검색어: '+request.query,url].filter(Boolean).join('\n');
   dialog.innerHTML=`<button data-research-close class="chat-source-close" aria-label="닫기">×</button><h2 id="researchDetailTitle">공식 본문을 불러오지 못했습니다</h2><div class="rag-error" role="alert">${E(e.message)}</div><p class="rag-help">확인하지 못한 본문을 생성하거나 검색 요약으로 대신하지 않습니다. 다시 시도하거나 아래 식별정보로 공식 자료를 확인하세요.</p><div class="research-error-actions"><button class="primary" data-research-retry>원문 다시 불러오기</button>${url?`<a class="source-link" href="${E(url)}" target="_blank" rel="noopener">공식 원문 직접 열기 ↗</a>`:'<p class="rag-help">검색 결과에 확인 가능한 공식 원문 주소가 없습니다.</p>'}<button class="text-btn" data-research-copy>자료 식별정보 복사</button></div><label for="researchReference">자료 식별정보</label><textarea class="research-reference" id="researchReference" readonly>${E(reference)}</textarea><p id="researchCopyStatus" role="status"></p>`;
  }
  if(current())dialog.querySelector('[data-research-close]')?.focus({preventScroll:true});
 }

 async function mount(state){
  health=state;const version=++loadVersion,search=searchVersion,form=document.querySelector('#researchForm'),issueTarget=document.querySelector('#researchIssues'),indexed=document.querySelector('#researchIndexed');
  const current=()=>version===loadVersion&&form?.isConnected&&document.querySelector('#researchForm')===form&&document.querySelector('#researchIssues')===issueTarget&&document.querySelector('#researchIndexed')===indexed;
  try{
   const [catalog,stored]=await Promise.all([api('/api/issues'),api('/api/library')]);if(!current())return;
   issues=catalog.issues;library=stored;issueTarget.innerHTML=issueCards();issueCount();
   indexed.innerHTML=(library.documents||[]).map(d=>`<div class="source-entry"><span class="tag">${E(kinds[d.kind]||d.kind)}</span><strong>${E(d.title)}</strong><a class="source-link" target="_blank" rel="noopener" href="${E(d.url)}">공식 원문 ↗</a></div>`).join('');
   if(!health.live_research_enabled&&search===searchVersion){error='공식 통합검색 배포를 준비 중입니다. 기존에 색인된 자료는 아래 자료함에서 확인할 수 있습니다.';paintError();}
  }catch(e){if(current()&&search===searchVersion){error=e.message;paintError();}}
 }
 function inputChanged(event){
  if(['researchQuery','researchCollection'].includes(event.target.id)&&document.querySelector('#'+event.target.id)===event.target){
   inputRevision++;query=document.querySelector('#researchQuery').value;collection=document.querySelector('#researchCollection').value;invalidateSearch();paintError();document.querySelector('#researchResults').innerHTML=resultHtml();
  }else if(event.target.id==='researchDate'&&document.querySelector('#researchDate')===event.target)closeDetail();
 }
 document.addEventListener('input',inputChanged);
 document.addEventListener('change',inputChanged);
 document.addEventListener('cancel',event=>{if(event.target.id==='researchDetail'&&document.querySelector('#researchDetail')===event.target){event.preventDefault();closeDetail();}},true);
 document.addEventListener('close',event=>{if(event.target.id==='researchDetail'&&document.querySelector('#researchDetail')===event.target&&!event.target.open)closeDetail();},true);
 document.addEventListener('submit',event=>{if(event.target.id==='researchForm'&&document.querySelector('#researchForm')===event.target){event.preventDefault();return runSearch();}});
 document.addEventListener('click',async event=>{try{
  const tax=event.target.closest('[data-research-tax]');if(tax){selectedTax=tax.dataset.researchTax;document.querySelectorAll('[data-research-tax]').forEach(b=>b.classList.toggle('active',b===tax));document.querySelector('#researchIssues').innerHTML=issueCards();issueCount();}
  const issue=event.target.closest('[data-research-issue]');if(issue){const item=issues.find(i=>i.id===issue.dataset.researchIssue);document.querySelector('#researchQuery').value=item.query;await runSearch();}
  if(event.target.id==='researchPrev'&&!searching){pageNumber=Math.max(1,pageNumber-1);await runSearch(false);}
  if(event.target.id==='researchNext'&&!searching){pageNumber++;await runSearch(false);}
  const source=event.target.closest('[data-research-source]');if(source&&matchesSearch(resultContext)&&resultContext.target.contains(source)){
   const documentRecord=result.collections.flatMap(c=>c.documents).find(d=>d.source_id===source.dataset.researchSource),dateInput=document.querySelector('#researchDate');
   if(documentRecord&&dateInput){detailRequest={query:resultContext.query,page:resultContext.page,collection:resultContext.collection,source_id:documentRecord.source_id,transaction_date:dateInput.value||null,document:documentRecord};detailOwner={search:resultContext,dateInput,dateValue:dateInput.value};await openDetail();}
  }
  if(event.target.closest('[data-research-search-retry]'))await runSearch(false);
  if(event.target.closest('[data-research-retry]'))await openDetail();
  if(event.target.closest('[data-research-copy]')){const text=document.querySelector('#researchReference');try{await navigator.clipboard.writeText(text.value);document.querySelector('#researchCopyStatus').textContent='자료 식별정보를 복사했습니다.';}catch{text.focus();text.select();document.querySelector('#researchCopyStatus').textContent='아래 선택된 식별정보를 직접 복사해 주세요.';}}
  const relation=event.target.closest('[data-research-related]');if(relation){closeDetail();document.querySelector('#researchQuery').value=relation.dataset.researchRelated;document.querySelector('#researchCollection').value='statute';await runSearch();}
  if(event.target.closest('[data-research-close]'))closeDetail();
 }catch(e){error=e.message;paintError();}});
 return {page,mount};
})();
