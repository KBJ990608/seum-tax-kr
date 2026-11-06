import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=name=>fs.readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
test('all public JavaScript parses',()=>{
 for(const file of fs.readdirSync(new URL('../public/',import.meta.url)).filter(f=>f.endsWith('.js')))assert.doesNotThrow(()=>new vm.Script(read(file)),file);
});
test('page and calculator tax restore from URL, including expert legacy URL',()=>{
 const source=read('app.js');const fn=source.slice(source.indexOf('function readRoute()'),source.indexOf('function routeURL()'));
 const route=(hash,pathname='/')=>vm.runInNewContext(fn+';readRoute()', {location:{hash,pathname},URLSearchParams});
 for(const page of ['home','calc','cases','chat','saved','expert'])assert.equal(route('#'+page).page,page);
 assert.equal(route('#calc?tax=gift').tax,'증여세');assert.equal(route('#calc?tax=transfer').tax,'양도소득세');assert.equal(route('', '/expert').page,'expert');assert.equal(route('#home','/expert').page,'home');
});
test('calculator examples match tax type, rather than repeating inheritance facts',()=>{
 const context={window:{},document:{addEventListener(){}},SeumAnalysis:{E:s=>String(s)},SeumMarco:{page:()=>''},heading:()=>''};vm.runInNewContext(read('tax-ui.js'),context);
 const gift=context.window.SeumTax.page('증여세');const transfer=context.window.SeumTax.page('양도소득세');
 assert.match(gift,/placeholder="예: 부모가 성인 자녀/);assert.doesNotMatch(gift,/아버지가 돌아가셨고/);assert.match(transfer,/placeholder="예: 보유한 주택을 양도/);assert.match(transfer,/aria-pressed="true"/);
});
test('failed detail offers retry and copy; only supplied official https URLs become links',async()=>{
 let dialog={innerHTML:'',open:false,isConnected:true,showModal(){this.open=true;},querySelector(){return {focus(){}};}};
 const context={window:{},document:{addEventListener(){},querySelector:s=>s==='#researchDetail'?dialog:null},URL,fetch:async()=>{throw Error('일시적인 연결 오류');}};
 const code=read('research-ui.js').replace('return {page,mount};',"return {page,mount,officialURL,openDetail,setRequest(value){detailRequest=value;}};");vm.runInNewContext(code,context);const research=context.window.SeumResearch;
 assert.equal(research.officialURL('https://evil.example/law.go.kr'),null);assert.equal(research.officialURL('javascript:alert(1)'),null);assert.equal(research.officialURL('https://law.go.kr.evil.example/path'),null);
 research.setRequest({source_id:'abc',query:'상속',collection:'all',page:1,document:{title:'공식 검색 자료',url:'https://www.law.go.kr/법령/상속세및증여세법'}});await research.openDetail();
 assert.match(dialog.innerHTML,/data-research-retry/);assert.match(dialog.innerHTML,/data-research-copy/);assert.match(dialog.innerHTML,/id="researchReference"/);assert.match(dialog.innerHTML,/공식 원문 직접 열기/);assert.match(dialog.innerHTML,/id="researchDetailTitle"/);
 research.setRequest({source_id:'abc',query:'상속',collection:'all',page:1,document:{title:'주소 없는 자료',url:'https://unverified.example/'}});await research.openDetail();assert.doesNotMatch(dialog.innerHTML,/href=/);assert.match(dialog.innerHTML,/확인 가능한 공식 원문 주소가 없습니다/);
});
test('shared accessibility rules and accurate count labels remain present',()=>{
 assert.match(read('index.html'),/accessibility.css/);assert.match(read('index.html'),/본문으로 바로가기/);assert.match(read('index.html'),/aria-label="세무 쟁점 상세"/);
 assert.match(read('chat-ui.js'),/aria-label="상담 답변의 공식 근거"/);
 assert.match(read('research-ui.js'),/이 페이지 \$\{c.documents.length\}건 표시/);assert.match(read('research-ui.js'),/visibleIssues\(\).length\+'개 표시 \/ 전체 '/);
 assert.match(read('accessibility.css'),/prefers-reduced-motion/);assert.match(read('accessibility.css'),/header\{position:static\}/);assert.match(read('accessibility.css'),/focus-visible/);
 for(const file of ['style.css','pwa.css','rag.css','chat.css','research.css','analysis.css'])assert.doesNotMatch(read(file),/font-size:(?:8|9|10|11)px/);
});
test('MARCO unavailable is explicit, and verified requests send only the structured contract',async()=>{
 const nodes=new Map(),handlers={},calls=[];const node=()=>({textContent:'',innerHTML:'',disabled:false,isConnected:true});
 for(const selector of ['#marcoStatus','#marcoStatusDetail','#marcoError','#marcoResult','#taxEngineStatus','#marcoForm button[type=submit]','#taxAnalyzeForm button[type=submit]'])nodes.set(selector,node());
 let ready=false;const values={tax_type:'gift',as_of:'2026-11-06',tax_base_won:'100000000',marco_consent:'on'};
 const context={window:{},document:{querySelector:s=>nodes.get(s),addEventListener:(event,fn)=>(handlers[event]??=[]).push(fn)},FormData:class{constructor(){}*[Symbol.iterator](){yield*Object.entries(values);}},fetch:async(path,options)=>{calls.push({path,options});const data=path==='/api/marco/status'?{configured:ready,engine_verified:ready,engine_commit:'test-version',knowledge_version:'test-knowledge',reason:'연결 준비 중'}:path==='/api/health'?{api_key_configured:false}:{result:{tax_type:'gift',status:'computed',basic_tax_won:10000000,sources:[],rule_trace:[],assumptions:[],limitations:[]},integration:{engine_commit:'test-version',knowledge_version:'test-knowledge'}};return {ok:true,json:async()=>data};}};
 vm.runInNewContext(read('marco-ui.js'),context);const marco=context.window.SeumMarco;await marco.mount();assert.equal(nodes.get('#marcoStatus').textContent,'MARCO 연결 준비 중');assert.equal(nodes.get('#marcoForm button[type=submit]').disabled,true);assert.equal(nodes.get('#taxAnalyzeForm button[type=submit]').disabled,true);
 ready=true;await marco.mount();assert.equal(nodes.get('#marcoForm button[type=submit]').disabled,false);
 const form={id:'marcoForm',isConnected:true,querySelector:()=>nodes.get('#marcoForm button[type=submit]')};await Promise.all(handlers.submit.map(fn=>fn({target:form,preventDefault(){}})));
 const sent=calls.find(call=>call.path==='/api/marco/evaluate');assert.ok(sent);assert.deepEqual(JSON.parse(sent.options.body),{tax_type:'gift',as_of:'2026-11-06',amount_kind:'tax_base',tax_base_won:100000000,basic_rate_only:true,consent:true});assert.match(nodes.get('#marcoResult').innerHTML,/최종 납부세액이 아닙니다/);
});
test('MARCO abstains without zero tax, limits dates, and links only official HTTPS sources',()=>{
 const context={window:{},document:{addEventListener(){}},URL};
 vm.runInNewContext(read('marco-ui.js').replace('return {page,mount};','return {page,mount,resultView,dateBounds,setStatus(value){status=value;}};'),context);
 const marco=context.window.SeumMarco;
 for(const status of ['unsupported','insufficient_information','invalid_input']){
  const html=marco.resultView({result:{status,basic_tax_won:null,reason:'범위 밖인 조건입니다.',limitations:['전문가 검토 필요'],sources:[]}});
  assert.match(html,/범위 밖인 조건입니다/);assert.match(html,/0원 계산 결과가 아닙니다/);assert.match(html,/전문가 검토 필요/);assert.doesNotMatch(html,/<small>원<\/small>/);
 }
 const html=marco.resultView({result:{status:'computed',tax_type:'gift',basic_tax_won:0,sources:[{title:'공식 법령',url:'https://www.law.go.kr/법령/상속세및증여세법'},{title:'가짜 공식 주소',url:'https://law.go.kr.evil.example/'},{title:'HTTP 주소',url:'http://www.nts.go.kr/'}]},integration:{engine_commit:'123456789abcdef'}});
 assert.match(html,/href="https:\/\/www.law.go.kr\//);assert.doesNotMatch(html,/href="https:\/\/law.go.kr.evil/);assert.doesNotMatch(html,/href="http:/);assert.match(html,/엔진 12345678 ·/);
 assert.equal(marco.dateBounds().from,'2026-01-02');assert.equal(marco.dateBounds().through,'2026-11-06');marco.setStatus({supported_from:'2025-01-01',verified_through:'2027-01-01'});assert.equal(marco.dateBounds().through,'2026-11-06');assert.equal(marco.dateBounds().from,'2026-01-02');marco.setStatus({supported_from:'2026-02-01',verified_through:'2026-10-01'});assert.equal(marco.dateBounds().from,'2026-02-01');assert.equal(marco.dateBounds().through,'2026-10-01');
 assert.match(marco.page('상속세'),/https:\/\/github.com\/DoTaeIn\/Marco/);
});
test('native MARCO question panel uses seven choices, requires matching native evidence, and escapes output',()=>{
 const context={window:{},document:{addEventListener(){}},URL};
 vm.runInNewContext(read('marco-ui.js').replace('return {page,mount};','return {page,mount,questionPanel,questionResultView};'),context);
 const marco=context.window.SeumMarco,panel=marco.questionPanel();assert.equal((panel.match(/<option /g)||[]).length,7);assert.doesNotMatch(panel,/textarea/);assert.match(panel,/name="question"/);assert.match(panel,/disabled/);
 const data={result:{status:'answered',topic:'gift-minimum',answer:'공제 후 과세표준을 확인합니다. <script>bad()</script>',native_evidence:{engine:'MARCO engine.Session',verdict:'인정',path:['세법','증여세','과세최저한'],graph_answer:'확인됨'},sources:[{title:'공식 법령',url:'https://www.law.go.kr/법령/상속세및증여세법'}],assumptions:['선언된 질문'],limitations:['개별 판단 제외']},integration:{engine_commit:'123456789'}};
 const html=marco.questionResultView(data,'gift-minimum');assert.match(html,/MARCO engine.Session · 인정/);assert.match(html,/세액 계산 결과가 아닙니다/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/href="https:\/\/www.law.go.kr/);assert.match(html,/개별 판단 제외/);
 assert.throws(()=>marco.questionResultView(data,'inheritance-minimum'),/일치를 확인하지/);
 for(const evidence of [null,{engine:'other',verdict:'인정',path:['a']},{engine:'MARCO engine.Session',verdict:'보류',path:['a']},{engine:'MARCO engine.Session',verdict:'인정',path:[]}])assert.throws(()=>marco.questionResultView({...data,result:{...data.result,native_evidence:evidence}},'gift-minimum'),/판정·경로/);
 const refused=marco.questionResultView({result:{status:'unsupported',reason:'등록되지 않은 질문',answer:'MUST NOT DISPLAY',limitations:['범위 제한']}},'gift-minimum');assert.match(refused,/등록되지 않은 질문/);assert.doesNotMatch(refused,/MUST NOT DISPLAY/);
});
test('native question submit posts exact contract and writes only verified answer into result DOM',async()=>{
 const nodes=new Map(),handlers={},calls=[];
 for(const selector of ['#marcoStatus','#marcoStatusDetail','#marcoForm button[type=submit]','#marcoQuestionForm button[type=submit]','#marcoQuestionError','#marcoQuestionResult','#marcoQuestionForm [name=as_of]','#marcoQuestionDateRange'])nodes.set(selector,{textContent:'',innerHTML:'',disabled:false,isConnected:true});
 const values={question:'사인증여는 증여세야?',as_of:'2026-11-06',marco_question_consent:'on'};let ready=false;
 const context={window:{},URL,document:{querySelector:s=>nodes.get(s),addEventListener:(event,fn)=>(handlers[event]??=[]).push(fn)},FormData:class{*[Symbol.iterator](){yield*Object.entries(values);}},fetch:async(path,options)=>{calls.push({path,options});return {ok:true,json:async()=>path==='/api/marco/status'?{configured:ready,engine_verified:ready,supported_from:'2026-01-02',verified_through:'2026-11-06'}:{result:{status:'answered',topic:'death-gift',answer:'상속의 범위에 포함됩니다.',native_evidence:{engine:'MARCO engine.Session',verdict:'인정',path:['유증','상속']},sources:[],assumptions:[],limitations:[]},integration:{}}};}};
 vm.runInNewContext(read('marco-ui.js'),context);const marco=context.window.SeumMarco;await marco.mount();assert.equal(nodes.get('#marcoQuestionForm button[type=submit]').disabled,true);ready=true;await marco.mount();assert.equal(nodes.get('#marcoQuestionForm button[type=submit]').disabled,false);
 const form={id:'marcoQuestionForm',isConnected:true,querySelector:()=>nodes.get('#marcoQuestionForm button[type=submit]')};const submit=()=>Promise.all(handlers.submit.map(fn=>fn({target:form,preventDefault(){}})));await submit();
 assert.deepEqual(JSON.parse(calls.find(call=>call.path==='/api/marco/question').options.body),{question:'사인증여는 증여세야?',as_of:'2026-11-06',consent:true});assert.match(nodes.get('#marcoQuestionResult').innerHTML,/상속의 범위에 포함됩니다/);assert.match(nodes.get('#marcoQuestionResult').innerHTML,/원본 MARCO 판정과 경로/);
 const before=calls.length;values.question='미등록 자유문장';await submit();assert.equal(calls.length,before);assert.equal(nodes.get('#marcoQuestionResult').innerHTML,'');assert.match(nodes.get('#marcoQuestionError').textContent,/등록된 질문/);
});
test('legacy OpenAI gate fails closed before health and preserves drafts while allowing MARCO',()=>{
 const events=[];
 const makeTarget=(id,isForm=true)=>{const button={disabled:false,dataset:{}},target={id,draft:'작성 중인 내용을 보존',button,matches:selector=>selector==='form'?isForm:selector.split(',').includes('#'+id),querySelectorAll:()=>[button],insertAdjacentHTML(){this.previousElementSibling={innerHTML:'',hidden:false,matches:s=>s==='[data-openai-notice]'};}};if(!isForm){target.disabled=false;target.dataset={};}return target;};
 const forms=['researchAnalyzeForm','taxAnalyzeForm','chatComposer','ragConsultForm'].map(id=>makeTarget(id));const actions=['retryAnalysis','testOpenAI'].map(id=>makeTarget(id,false));
 const context={window:{},document:{querySelectorAll:selector=>selector.includes('#researchAnalyzeForm')?forms:actions,addEventListener:(type,fn,capture)=>events.push({type,fn,capture})}};
 vm.runInNewContext(read('analysis-ui.js'),context);const gate=context.window.SeumOpenAI;gate.pending();assert.equal(gate.ready(),false);for(const form of forms){assert.equal(form.button.disabled,true);assert.equal(form.draft,'작성 중인 내용을 보존');}
 const capture=events.find(e=>e.type==='submit'&&e.capture).fn;
 for(const form of forms){let blocked=false;capture({target:form,preventDefault(){blocked=true;},stopImmediatePropagation(){}});assert.equal(blocked,true);}
 let marcoBlocked=false;capture({target:makeTarget('marcoQuestionForm'),preventDefault(){marcoBlocked=true;},stopImmediatePropagation(){}});assert.equal(marcoBlocked,false);
 gate.setHealth(null);for(const form of forms){assert.equal(form.button.disabled,true);assert.match(form.previousElementSibling.innerHTML,/기존 OpenAI 기능은 연결되지 않았습니다/);assert.match(form.previousElementSibling.innerHTML,/href="#calc"/);}
 gate.setHealth({api_key_configured:false});assert.equal(gate.ready(),false);gate.setHealth({api_key_configured:'true'});assert.equal(gate.ready(),false);
 gate.setHealth({api_key_configured:true});assert.equal(gate.ready(),true);for(const form of forms){assert.equal(form.button.disabled,false);assert.equal(form.previousElementSibling.hidden,true);}for(const action of actions)assert.equal(action.disabled,false);
 gate.pending();for(const form of forms)assert.equal(form.button.disabled,true);
});
test('legacy AI forms render disabled, and health failure and action handlers retain gating',()=>{
 assert.match(read('analysis-ui.js'),/type="submit" disabled data-openai-gated="true">공식 근거로 AI/);
 assert.match(read('tax-ui.js'),/type="submit" disabled data-openai-gated="true">AI로 적용 조건/);
 assert.match(read('chat-ui.js'),/aria-label="질문 보내기" disabled data-openai-gated="true"/);
 assert.match(read('app.js'),/SeumOpenAI.pending\(\);SeumRag.mount/);
 assert.match(read('rag-ui.js'),/SeumOpenAI.setHealth\(null\)/);
 assert.match(read('chat-ui.js'),/if\(busy\|\|!SeumOpenAI.ready\(\)\)return/);
 assert.match(read('tax-ui.js'),/analysisBusy\|\|!SeumOpenAI.ready\(\)/);
 assert.match(read('rag-ui.js'),/index&&SeumOpenAI.ready\(\)/);
});
