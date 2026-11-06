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
 const context={window:{},document:{querySelector:s=>nodes.get(s),addEventListener:(event,fn)=>handlers[event]=fn},FormData:class{constructor(){}*[Symbol.iterator](){yield*Object.entries(values);}},fetch:async(path,options)=>{calls.push({path,options});const data=path==='/api/marco/status'?{configured:ready,engine_verified:ready,engine_commit:'test-version',knowledge_version:'test-knowledge',reason:'연결 준비 중'}:path==='/api/health'?{api_key_configured:false}:{result:{tax_type:'gift',status:'computed',basic_tax_won:10000000,sources:[],rule_trace:[],assumptions:[],limitations:[]},integration:{engine_commit:'test-version',knowledge_version:'test-knowledge'}};return {ok:true,json:async()=>data};}};
 vm.runInNewContext(read('marco-ui.js'),context);const marco=context.window.SeumMarco;await marco.mount();assert.equal(nodes.get('#marcoStatus').textContent,'MARCO 연결 준비 중');assert.equal(nodes.get('#marcoForm button[type=submit]').disabled,true);assert.equal(nodes.get('#taxAnalyzeForm button[type=submit]').disabled,true);
 ready=true;await marco.mount();assert.equal(nodes.get('#marcoForm button[type=submit]').disabled,false);
 const form={id:'marcoForm',isConnected:true,querySelector:()=>nodes.get('#marcoForm button[type=submit]')};await handlers.submit({target:form,preventDefault(){}});
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
