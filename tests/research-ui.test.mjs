import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Synthetic data and controlled promises only. These test UI ownership, not NTS availability.
const code=fs.readFileSync(new URL('../public/research-ui.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const response=(body,ok=true)=>({ok,json:async()=>body});
const listed=(id='source-a')=>({source_id:id,kind:'decision',title:`합성 목록 ${id}`,case_number:`합성 번호 ${id}`,decision_date:'2026-01-02',url:`https://taxlaw.nts.go.kr/test/${id}`,excerpt:'목록의 합성 요약'});
const search=(query='상속 공제',page=1,total=25,ids=['source-a','source-b'])=>({query,page,retrieved_at:'2026-11-06T01:00:00Z',collections:[{id:'precedent',title:'판례 · 결정례',total,documents:total?ids.map(listed):[]}]});
const detail=(id='source-a',body=`합성 원문 ${id}`)=>({document:{...listed(id),body,scope_note:'합성 확인 범위',related_laws:['상속세 및 증여세법 제21조'],verification_notes:[]}});
const fail=(pending,kind='network')=>kind==='network'?pending.reject(Error('이전 요청 연결 오류')):pending.resolve(response({error:{message:'이전 요청 응답 오류'}},false));

function harness(){
 const handlers=new Map(),nodes=new Map(),calls=[],queued=new Map();
 function node(id='',extra={}){
  let html='',generation=0;
  return {id,isConnected:true,value:'',textContent:'',hidden:true,disabled:false,dataset:{},parent:null,
   get innerHTML(){return html;},set innerHTML(value){html=value;generation++;},get generation(){return generation;},
   contains(child){return child.isConnected&&child.parent===this&&child.parentGeneration===generation;},
   closest(selector){if(selector==='#'+id)return this;const key=selector.match(/^\[data-(.+)\]$/)?.[1]?.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());return key&&Object.hasOwn(this.dataset,key)?this:null;},
   focus(){this.focused=true;},select(){this.selected=true;},classList:{toggle(){}},...extra};
 }
 const emit=(type,target)=>Promise.all((handlers.get(type)||[]).map(fn=>fn({type,target,preventDefault(){}})));
 function replace(){
  for(const value of nodes.values())value.isConnected=false;nodes.clear();
  for(const id of ['researchForm','researchQuery','researchCollection','researchResults','researchError','researchDate','researchIssues','researchIndexed','researchIssueCount','researchDetail'])nodes.set('#'+id,node(id));
  nodes.get('#researchQuery').value='상속 공제';nodes.get('#researchCollection').value='all';
  const button=node('researchSubmit');nodes.set('#researchForm button[type=submit]',button);
  nodes.get('#researchForm').querySelector=selector=>selector==='button[type=submit]'?button:null;
  Object.assign(nodes.get('#researchDetail'),{open:false,showModal(){this.open=true;},close(){this.open=false;},querySelector:()=>node()});
 }
 const context={window:{},URL,heading:()=>'',SeumAnalysis:{researchForm:()=>''},navigator:{clipboard:{writeText:async()=>{}}},document:{
  querySelector:selector=>nodes.get(selector)||null,querySelectorAll:()=>[],
  addEventListener(type,fn){handlers.set(type,[...handlers.get(type)||[],fn]);}
 },fetch:async(path,options)=>{
  calls.push({path,body:options?.body?JSON.parse(options.body):null});
  const pending=queued.get(path)?.shift();if(pending)return pending.promise;
  if(path==='/api/issues')return response({issues:[]});if(path==='/api/library')return response({documents:[]});
  throw Error(`Unexpected request: ${path}`);
 }};
 replace();vm.runInNewContext(code,context);
 const get=selector=>nodes.get(selector);
 const button=(attribute,value='',parent=get('#researchDetail'))=>node('',{dataset:{[attribute]:value},parent,parentGeneration:parent.generation});
 return {calls,context,get,replace,emit,
  defer(path='/api/research'){const pending=deferred();queued.set(path,[...queued.get(path)||[],pending]);return pending;},
  submit:()=>emit('submit',get('#researchForm')),
  edit(id,value,type='input'){const target=get('#'+id);target.value=value;return type?emit(type,target):Promise.resolve();},
  click:target=>emit('click',target),button,
  source:id=>button('researchSource',id,get('#researchResults')),
  async successfulSearch(body=search()){const pending=this.defer(),done=this.submit();pending.resolve(response(body));await done;},
  async open(id='source-a'){const pending=this.defer('/api/research/detail'),done=this.click(this.source(id));pending.resolve(response(detail(id)));await done;},
  blank(){assert.doesNotMatch(get('#researchResults').innerHTML,/합성 목록|공식 검색 결과|이전 요청|검색하고 있습니다/);assert.equal(get('#researchError').textContent,'');}
 };
}

test('a failed new query replaces previous results and offers a safe official link plus manual retry',async()=>{
 const h=harness();await h.successfulSearch();assert.match(h.get('#researchResults').innerHTML,/합성 목록 source-a/);
 await h.edit('researchQuery','변경 검색어 & 비공개');const pending=h.defer(),done=h.submit();assert.doesNotMatch(h.get('#researchResults').innerHTML,/합성 목록/);fail(pending);await done;
 const html=h.get('#researchResults').innerHTML;assert.match(html,/검색 결과가 0건이라는 뜻이 아닙니다/);assert.doesNotMatch(html,/합성 목록|이 페이지에서 표시할 자료가 없습니다/);
 const hrefs=[...html.matchAll(/href="([^"]+)"/g)].map(match=>match[1]);assert.deepEqual(hrefs,['https://taxlaw.nts.go.kr/is/USEISA001M.do']);assert.match(html,/rel="noopener noreferrer"/);assert.match(html,/data-research-search-retry/);
 assert.equal(h.get('#researchForm button[type=submit]').disabled,false);
 const retry=h.defer(),retrying=h.click(h.button('researchSearchRetry','',h.get('#researchResults')));assert.equal(h.calls.at(-1).body.query,'변경 검색어 & 비공개');retry.resolve(response(search('변경 검색어 & 비공개')));await retrying;assert.match(h.get('#researchResults').innerHTML,/합성 목록/);assert.equal(h.get('#researchError').textContent,'');
});

test('identical pending submissions are deduplicated, but an edited revision can search immediately',async()=>{
 const h=harness(),old=h.defer(),oldDone=h.submit();await h.submit();await h.submit();assert.equal(h.calls.length,1);assert.equal(h.get('#researchForm button[type=submit]').disabled,true);
 await h.edit('researchQuery','새 입력');await h.edit('researchQuery','상속 공제');const latest=h.defer(),latestDone=h.submit();assert.equal(h.calls.length,2);
 old.resolve(response(search('이전 입력 판본')));await oldDone;assert.match(h.get('#researchResults').innerHTML,/검색하고 있습니다/);
 latest.resolve(response(search()));await latestDone;assert.match(h.get('#researchResults').innerHTML,/합성 목록/);
});

test('successful empty results are distinct from connection failures',async()=>{
 const h=harness();await h.successfulSearch(search('상속 공제',1,0));assert.match(h.get('#researchResults').innerHTML,/0건/);assert.match(h.get('#researchResults').innerHTML,/이 페이지에서 표시할 자료가 없습니다/);assert.doesNotMatch(h.get('#researchResults').innerHTML,/불러오지 못했습니다|data-research-search-retry/);
});

for(const field of ['researchQuery','researchCollection'])for(const outcome of ['success','error','network'])test(`${field}: editing invalidates delayed ${outcome}, including edit and revert`,async()=>{
 const h=harness(),pending=h.defer(),done=h.submit(),initial=h.get('#'+field).value;
 await h.edit(field,field==='researchQuery'?'증여 공제':'precedent',field==='researchQuery'?'input':'change');await h.edit(field,initial,'change');
 assert.equal(h.get('#researchForm button[type=submit]').disabled,false);
 if(outcome==='success')pending.resolve(response(search()));else fail(pending,outcome);await done;h.blank();
});

for(const field of ['researchQuery','researchCollection'])for(const outcome of ['success','network'])test(`${field}: snapshot detects an edit without an input event before delayed ${outcome}`,async()=>{
 const h=harness(),pending=h.defer(),done=h.submit();await h.edit(field,field==='researchQuery'?'증여 공제':'precedent',null);
 if(outcome==='success')pending.resolve(response(search()));else fail(pending,outcome);await done;h.blank();assert.equal(h.get('#researchForm button[type=submit]').disabled,false);
});

for(const outcome of ['success','error','network'])test(`new submission owns the loading state while an older ${outcome} arrives`,async()=>{
 const h=harness(),old=h.defer(),oldDone=h.submit();await h.edit('researchQuery','최신 검색어',null);const latest=h.defer(),latestDone=h.submit();assert.equal(h.calls.length,2);
 if(outcome==='success')old.resolve(response(search('오래된 결과')));else fail(old,outcome);await oldDone;
 assert.match(h.get('#researchResults').innerHTML,/검색하고 있습니다/);assert.equal(h.get('#researchForm button[type=submit]').disabled,true);assert.equal(h.get('#researchError').textContent,'');
 latest.resolve(response(search('최신 결과')));await latestDone;assert.match(h.get('#researchResults').innerHTML,/최신 결과/);assert.doesNotMatch(h.get('#researchResults').innerHTML,/오래된 결과/);
});

for(const outcome of ['success','network'])test(`older ${outcome} cannot replace a newer failed query`,async()=>{
 const h=harness(),old=h.defer(),oldDone=h.submit();await h.edit('researchQuery','다른 검색어');const latest=h.defer(),latestDone=h.submit();fail(latest);await latestDone;
 const before=h.get('#researchResults').innerHTML;if(outcome==='success')old.resolve(response(search()));else fail(old);await oldDone;
 assert.equal(h.get('#researchResults').innerHTML,before);assert.match(before,/검색 결과가 0건이라는 뜻이 아닙니다/);
});

for(const render of [false,true])for(const outcome of ['success','network'])test(`replacement DOM${render?' with page render':''} ignores old ${outcome} and allows a new request`,async()=>{
 const h=harness(),old=h.defer(),oldDone=h.submit();if(render)h.context.window.SeumResearch.page();h.replace();
 const latest=h.defer(),latestDone=h.submit();if(outcome==='success')old.resolve(response(search('옛 화면')));else fail(old);await oldDone;
 assert.match(h.get('#researchResults').innerHTML,/검색하고 있습니다/);assert.equal(h.get('#researchForm button[type=submit]').disabled,true);
 latest.resolve(response(search('새 화면')));await latestDone;assert.match(h.get('#researchResults').innerHTML,/새 화면/);assert.doesNotMatch(h.get('#researchResults').innerHTML,/옛 화면/);
});

test('invalid new query clears successful results without sending a request',async()=>{
 const h=harness();await h.successfulSearch();await h.edit('researchQuery','가');await h.submit();assert.equal(h.calls.length,1);assert.doesNotMatch(h.get('#researchResults').innerHTML,/합성 목록/);assert.match(h.get('#researchError').textContent,/두 글자 이상/);
});

test('pagination sends page numbers, retries the failed page, and preserves source query/collection/date',async()=>{
 const h=harness();await h.edit('researchCollection','precedent','change');await h.successfulSearch();
 const next=h.defer(),paging=h.click({id:'researchNext',closest:()=>null});assert.deepEqual(h.calls.at(-1).body,{query:'상속 공제',page:2,collection:'precedent'});fail(next);await paging;
 const retry=h.defer(),retrying=h.click(h.button('researchSearchRetry','',h.get('#researchResults')));assert.equal(h.calls.at(-1).body.page,2);retry.resolve(response(search('상속 공제',2)));await retrying;assert.match(h.get('#researchResults').innerHTML,/2페이지/);
 await h.edit('researchDate','2026-10-01','change');const source=h.defer('/api/research/detail'),opening=h.click(h.source('source-b'));
 assert.deepEqual(h.calls.at(-1).body,{query:'상속 공제',page:2,collection:'precedent',source_id:'source-b',transaction_date:'2026-10-01'});fail(source);await opening;
 const html=h.get('#researchDetail').innerHTML;assert.match(html,/자료 ID: source-b/);assert.match(html,/검색어: 상속 공제/);assert.match(html,/합성 목록 source-b/);assert.doesNotMatch(html,/합성 목록 source-a/);
});

for(const outcome of ['success','error','network'])for(const dismiss of ['button','cancel','native-close'])test(`detail ${dismiss} prevents late ${outcome} from appearing after reopening`,async()=>{
 const h=harness();await h.successfulSearch();const old=h.defer('/api/research/detail'),oldDone=h.click(h.source('source-a'));
 if(dismiss==='button')await h.click(h.button('researchClose'));else if(dismiss==='cancel')await h.emit('cancel',h.get('#researchDetail'));else{h.get('#researchDetail').close();await h.emit('close',h.get('#researchDetail'));}
 assert.equal(h.get('#researchDetail').open,false);
 const latest=h.defer('/api/research/detail'),latestDone=h.click(h.source('source-b'));assert.equal(h.get('#researchDetail').open,true);
 // Native close is queued in browsers; an older close event must not cancel a reopened dialog.
 await h.emit('close',h.get('#researchDetail'));
 if(outcome==='success')old.resolve(response(detail('source-a')));else fail(old,outcome);await oldDone;
 assert.match(h.get('#researchDetail').innerHTML,/공식 자료 확인 중/);assert.doesNotMatch(h.get('#researchDetail').innerHTML,/합성 원문 source-a|이전 요청/);
 latest.resolve(response(detail('source-b')));await latestDone;assert.match(h.get('#researchDetail').innerHTML,/합성 원문 source-b/);assert.doesNotMatch(h.get('#researchDetail').innerHTML,/합성 원문 source-a/);
});

for(const action of ['query','collection','date','submit','replace'])for(const outcome of ['success','network'])test(`detail: ${action} change invalidates delayed ${outcome}`,async()=>{
 const h=harness();await h.successfulSearch();const pending=h.defer('/api/research/detail'),done=h.click(h.source('source-a'));
 let searching;if(action==='query')await h.edit('researchQuery','다른 검색어');else if(action==='collection')await h.edit('researchCollection','statute','change');else if(action==='date')await h.edit('researchDate','2026-10-01','change');else if(action==='replace')h.replace();else{const request=h.defer();searching=h.submit();request.resolve(response(search()));}
 if(outcome==='success')pending.resolve(response(detail()));else fail(pending);await done;if(searching)await searching;
 assert.doesNotMatch(h.get('#researchDetail').innerHTML,/합성 원문|이전 요청/);assert.equal(h.get('#researchDetail').open,false);
});

test('silent form changes and detached source buttons cannot open a source with the wrong search context',async()=>{
 const h=harness();await h.successfulSearch();const oldSource=h.source('source-a');await h.edit('researchCollection','question',null);await h.click(oldSource);assert.equal(h.calls.filter(c=>c.path==='/api/research/detail').length,0);
 await h.edit('researchCollection','all','change');await h.successfulSearch();await h.click(oldSource);assert.equal(h.calls.filter(c=>c.path==='/api/research/detail').length,0);
});

test('detail retry reuses source metadata, escapes text, and related laws search the statute collection',async()=>{
 const h=harness();await h.successfulSearch();const pending=h.defer('/api/research/detail'),done=h.click(h.source('source-b'));fail(pending);await done;
 const retry=h.defer('/api/research/detail'),retrying=h.click(h.button('researchRetry'));assert.deepEqual(h.calls.at(-1).body,h.calls.at(-2).body);retry.resolve(response(detail('source-b','합성 원문 <script>bad()</script>')));await retrying;
 assert.match(h.get('#researchDetail').innerHTML,/&lt;script&gt;bad/);assert.doesNotMatch(h.get('#researchDetail').innerHTML,/<script>/);
 const related=h.defer(),following=h.click(h.button('researchRelated','상속세 및 증여세법 제21조'));assert.equal(h.get('#researchDetail').open,false);assert.deepEqual(h.calls.at(-1).body,{query:'상속세 및 증여세법 제21조',page:1,collection:'statute'});related.resolve(response(search('상속세 및 증여세법 제21조')));await following;
});

test('delayed catalog cannot reset an edited collection or write an obsolete error',async()=>{
 const h=harness(),catalog=h.defer('/api/issues'),mount=h.context.window.SeumResearch.mount({live_research_enabled:true});await h.edit('researchCollection','precedent','change');catalog.resolve(response({issues:[]}));await mount;assert.equal(h.get('#researchCollection').value,'precedent');
 const old=h.defer('/api/issues'),oldMount=h.context.window.SeumResearch.mount({live_research_enabled:true});h.replace();fail(old);await oldMount;assert.equal(h.get('#researchError').textContent,'');
});
