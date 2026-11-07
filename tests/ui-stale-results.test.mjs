import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Deterministic UI-only tests: controlled network promises, synthetic inputs and
// responses. These exercise the unmodified public scripts, not the tax engine.
const read=name=>fs.readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const response=(body,ok=true)=>({ok,json:async()=>body});
const verified={configured:true,engine_verified:true,supported_from:'2026-01-02',verified_through:'2026-11-06'};
const evaluation={result:{status:'computed',tax_type:'gift',basic_tax_won:10000000,sources:[],rule_trace:[],assumptions:[],limitations:[]},integration:{}};
const answer=(topic='death-gift',text='합성 답변')=>({result:{status:'answered',topic,answer:text,native_evidence:{engine:'MARCO engine.Session',verdict:'인정',path:['합성 경로']},sources:[],assumptions:[],limitations:[]},integration:{}});
const calculation={calculation:{tax_kind:'상속세',calculated_tax:10000000,label:'합성 계산 결과',steps:[],local_tax_estimate:null,exclusions:[],rate_source:'https://www.nts.go.kr/',rate_version:'test'}};
const taxCase=(fields=true)=>({case:{id:'synthetic-case',answer:{tax_kind:'상속세',...(fields?{tax_proposal:{fields:[{field:'amount',value_won:300000000,origin:'user_stated',reason:'합성 입력',source_ids:[]}],unsupported_conditions:[],warnings:[]}}:{})}}});
function harness(script){
 const listeners=new Map(),nodes=new Map(),forms=new Map(),calls=[],queued=new Map(),waiting=new Map();
 const node=()=>({isConnected:true,innerHTML:'',textContent:'',disabled:false,dataset:{},scrollIntoView(){this.scrolled=true;},classList:{toggle(){}}});
 function addForm(id,values){
  const previous=forms.get(id);if(previous){previous.isConnected=false;previous.button.isConnected=false;}
  const form={...node(),id,fields:new Map(),button:{...node(),textContent:'다시 계산'},querySelector(selector){if(selector==='button[type=submit]')return this.button;const name=selector.match(/^\[name=["']?([^\]"']+)["']?\]$/)?.[1];return this.fields.get(name)||null;},closest(selector){return selector==='#'+id?this:null;}};
  for(const [name,value]of Object.entries(values)){
   const checkbox=typeof value==='boolean';
   form.fields.set(name,{...node(),name,value:checkbox?'on':value,type:checkbox?'checkbox':'text',checked:checkbox&&value,closest:selector=>selector==='#'+id?form:null,matches:selector=>selector===`#${id} [name=${name}]`});
  }
  forms.set(id,form);return form;
 }
 const document={
  addEventListener(type,fn){listeners.set(type,[...listeners.get(type)||[],fn]);},
  contains:form=>form.isConnected,
  querySelector(selector){
   if(selector==='#taxEngineStatus')return null;
   const match=selector.match(/^#(marcoForm|marcoQuestionForm|taxCalculationForm|taxAnalyzeForm)(?: (.+))?$/);
   if(match)return match[2]?forms.get(match[1])?.querySelector(match[2]):forms.get(match[1]);
   if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);
  },
  querySelectorAll(selector){return selector==='#taxCalculationForm .tax-field-grid input'?[...forms.get('taxCalculationForm').fields.values()].filter(input=>['amount','debt','prior','deduction'].includes(input.name)):[];}
 };
 const context={window:{},document,URL,crypto:{randomUUID:()=>`synthetic-request-${calls.length}`},heading:()=>'',SeumMarco:{page:()=>''},SeumOpenAI:{ready:()=>true},SeumAnalysis:{E:value=>String(value??''),render:record=>`검토 ${record.id}`},FormData:class{
  constructor(form){this.entries=[...form.fields.values()].filter(input=>input.type!=='checkbox'||input.checked).map(input=>[input.name,input.value]);}
  [Symbol.iterator](){return this.entries[Symbol.iterator]();}
 },fetch:async(path,options)=>{
  calls.push({path,body:options?.body&&JSON.parse(options.body)});
  for(const wake of waiting.get(path)||[])wake();waiting.delete(path);
  if(queued.get(path)?.length)return queued.get(path).shift().promise;
  if(path==='/api/marco/status')return response(verified);
  if(path==='/api/session')return response({});
  throw Error('Unexpected request: '+path);
 }};
 addForm('marcoForm',{tax_type:'gift',as_of:'2026-11-06',tax_base_won:'100000000',marco_consent:true});
 addForm('marcoQuestionForm',{question:'사인증여는 증여세야?',as_of:'2026-11-06',marco_question_consent:true});
 addForm('taxCalculationForm',{transaction_date:'2026-11-06',amount:'10000',debt:'0',prior:'0',deduction:'0',confirmed:true});
 addForm('taxAnalyzeForm',{transaction_date:'2026-11-06',question:'합성 사례의 조건을 검토합니다.',consent:true});
 vm.runInNewContext(read(script),context);
 const emit=(type,target)=>Promise.all((listeners.get(type)||[]).map(fn=>fn({type,target,preventDefault(){}})));
 return {context,forms,calls,addForm,node:selector=>document.querySelector(selector),
  defer(path){const next=deferred();queued.set(path,[...queued.get(path)||[],next]);return next;},
  async reached(path,count=1){if(calls.filter(call=>call.path===path).length>=count)return;await new Promise(resolve=>waiting.set(path,[...waiting.get(path)||[],resolve]));assert.equal(calls.filter(call=>call.path===path).length,count);},
  submit:id=>emit('submit',forms.get(id)),
  edit(id,name,value,type='input'){const input=forms.get(id).fields.get(name);if(input.type==='checkbox')input.checked=value;else input.value=value;return type?emit(type,input):Promise.resolve();},
  disconnect(id){const form=forms.get(id);form.isConnected=false;form.button.isConnected=false;}
 };
}
const blank=(h,result,error)=>{assert.equal(h.node(result).innerHTML,'');assert.equal(h.node(error).textContent,'');};

for(const [id,path,result,error,edits,fixture]of [
 ['marcoForm','/api/marco/evaluate','#marcoResult','#marcoError',[['tax_base_won','200000000'],['as_of','2026-10-01'],['tax_type','inheritance'],['marco_consent',false]],evaluation],
 ['marcoQuestionForm','/api/marco/question','#marcoQuestionResult','#marcoQuestionError',[['question','증여세 과세최저한이 뭐야?'],['as_of','2026-10-01'],['marco_question_consent',false]],answer()]
]){
 for(const [field,value]of edits)for(const outcome of ['success','error','network'])test(`${id}: ${field} edit suppresses delayed ${outcome}`,async()=>{
  const h=harness('marco-ui.js');await h.context.window.SeumMarco.mount();const request=h.defer(path),pending=h.submit(id);
  await h.reached(path);await h.edit(id,field,value,field==='tax_base_won'?'input':'change');
  const button=h.forms.get(id).button;assert.equal(button.disabled,true);await h.submit(id);assert.equal(h.calls.filter(call=>call.path===path).length,1);
  if(outcome==='network')request.reject(Error('지난 요청의 연결 오류'));else request.resolve(response(outcome==='success'?fixture:{error:{message:'지난 요청의 오류'}},outcome==='success'));
  await pending;blank(h,result,error);assert.equal(button.disabled,false);assert.doesNotMatch(button.textContent,/중…/);
 });
 test(`${id}: an edit and revert still invalidate the submitted revision`,async()=>{
  const h=harness('marco-ui.js');await h.context.window.SeumMarco.mount();const request=h.defer(path),pending=h.submit(id);await h.reached(path);
  const field=edits[0][0],previous=h.forms.get(id).fields.get(field).value;await h.edit(id,field,edits[0][1]);await h.edit(id,field,previous);
  await h.edit(id,id==='marcoForm'?'marco_consent':'marco_question_consent',true);request.resolve(response(fixture));await pending;blank(h,result,error);
 });
 test(`${id}: exact snapshot detects programmatic edits without an event`,async()=>{
  const h=harness('marco-ui.js');await h.context.window.SeumMarco.mount();const request=h.defer(path),pending=h.submit(id);await h.reached(path);
  await h.edit(id,edits[0][0],edits[0][1],null);request.resolve(response(fixture));await pending;blank(h,result,error);
 });
 test(`${id}: unchanged input renders a response and fresh retry works after an edit`,async()=>{
  const h=harness('marco-ui.js');await h.context.window.SeumMarco.mount();const first=h.defer(path),pending=h.submit(id);await h.reached(path);first.resolve(response(fixture));await pending;
  assert.notEqual(h.node(result).innerHTML,'');await h.edit(id,'as_of','2026-10-01');blank(h,result,error);
  await h.edit(id,id==='marcoForm'?'marco_consent':'marco_question_consent',true);const second=h.defer(path),retry=h.submit(id);await h.reached(path,2);second.resolve(response(fixture));await retry;assert.notEqual(h.node(result).innerHTML,'');
 });
 test(`${id}: connection refresh invalidates pending reply without unlocking duplicate requests`,async()=>{
  const h=harness('marco-ui.js');await h.context.window.SeumMarco.mount();const request=h.defer(path),pending=h.submit(id);await h.reached(path);
  await h.context.window.SeumMarco.mount();assert.equal(h.forms.get(id).button.disabled,true);await h.submit(id);assert.equal(h.calls.filter(call=>call.path===path).length,1);
  request.resolve(response(fixture));await pending;blank(h,result,error);assert.equal(h.forms.get(id).button.disabled,false);
 });
}

test('MARCO pending completion respects unavailable status after refresh',async()=>{
 const h=harness('marco-ui.js');await h.context.window.SeumMarco.mount();const request=h.defer('/api/marco/evaluate'),pending=h.submit('marcoForm');await h.reached('/api/marco/evaluate');
 const status=h.defer('/api/marco/status'),mount=h.context.window.SeumMarco.mount();status.resolve(response({configured:false,engine_verified:false}));await mount;
 request.resolve(response(evaluation));await pending;blank(h,'#marcoResult','#marcoError');assert.equal(h.forms.get('marcoForm').button.disabled,true);assert.match(h.forms.get('marcoForm').button.textContent,/연결 확인 후/);
});

test('MARCO detached form cannot write errors or release the replacement form request',async()=>{
 const h=harness('marco-ui.js');await h.context.window.SeumMarco.mount();const old=h.defer('/api/marco/evaluate'),pending=h.submit('marcoForm');await h.reached('/api/marco/evaluate');
 h.addForm('marcoForm',{tax_type:'gift',as_of:'2026-11-06',tax_base_won:'200000000',marco_consent:true});await h.context.window.SeumMarco.mount();
 const latest=h.defer('/api/marco/evaluate'),newPending=h.submit('marcoForm');await h.reached('/api/marco/evaluate',2);old.reject(Error('이전 페이지 오류'));await pending;
 blank(h,'#marcoResult','#marcoError');assert.equal(h.forms.get('marcoForm').button.disabled,true);latest.resolve(response(evaluation));await newPending;assert.match(h.node('#marcoResult').innerHTML,/10,000,000/);
});

for(const [field,value]of [['amount','20000'],['transaction_date','2026-10-01'],['confirmed',false]])for(const outcome of ['success','error','network'])test(`manual calculation: ${field} edit suppresses delayed ${outcome}`,async()=>{
 const h=harness('tax-ui.js'),request=h.defer('/api/tax/calculate'),pending=h.submit('taxCalculationForm');await h.reached('/api/tax/calculate');
 await h.edit('taxCalculationForm',field,value,field==='amount'?'input':'change');assert.equal(h.forms.get('taxCalculationForm').button.disabled,true);await h.submit('taxCalculationForm');assert.equal(h.calls.filter(call=>call.path==='/api/tax/calculate').length,1);
 if(outcome==='network')request.reject(Error('이전 요청의 연결 오류'));else request.resolve(response(outcome==='success'?calculation:{error:{message:'이전 요청의 오류'}},outcome==='success'));
 await pending;blank(h,'#taxCalculationResult','#taxCalculationError');assert.equal(h.forms.get('taxCalculationForm').button.disabled,false);assert.equal(h.forms.get('taxCalculationForm').button.dataset.pending,undefined);
});

test('manual calculation: unchanged request displays output, copied analysis date clears output and confirmation',async()=>{
 const h=harness('tax-ui.js'),request=h.defer('/api/tax/calculate'),pending=h.submit('taxCalculationForm');await h.reached('/api/tax/calculate');request.resolve(response(calculation));await pending;
 assert.match(h.node('#taxCalculationResult').innerHTML,/10,000,000/);await h.edit('taxAnalyzeForm','transaction_date','2026-10-01','change');
 assert.equal(h.forms.get('taxCalculationForm').fields.get('transaction_date').value,'2026-10-01');assert.equal(h.forms.get('taxCalculationForm').fields.get('confirmed').checked,false);blank(h,'#taxCalculationResult','#taxCalculationError');
});

test('manual calculation: copied date invalidates pending result even if date is restored',async()=>{
 const h=harness('tax-ui.js'),request=h.defer('/api/tax/calculate'),pending=h.submit('taxCalculationForm');await h.reached('/api/tax/calculate');
 await h.edit('taxAnalyzeForm','transaction_date','2026-10-01','change');await h.edit('taxAnalyzeForm','transaction_date','2026-11-06','change');await h.edit('taxCalculationForm','confirmed',true);
 request.resolve(response(calculation));await pending;blank(h,'#taxCalculationResult','#taxCalculationError');
});

test('manual calculation: a late proposal replaces inputs and invalidates a pending manual reply',async()=>{
 const h=harness('tax-ui.js'),request=h.defer('/api/tax/calculate'),pending=h.submit('taxCalculationForm');await h.reached('/api/tax/calculate');
 const analysis=h.defer('/api/tax/analyze'),analyzing=h.submit('taxAnalyzeForm');await h.reached('/api/tax/analyze');analysis.resolve(response(taxCase()));await analyzing;
 assert.equal(h.forms.get('taxCalculationForm').fields.get('amount').value,30000);assert.equal(h.forms.get('taxCalculationForm').fields.get('confirmed').checked,false);
 request.resolve(response(calculation));await pending;blank(h,'#taxCalculationResult','#taxCalculationError');assert.equal(h.forms.get('taxCalculationForm').button.disabled,false);
});

test('manual calculation: proposal clears completed result even when no fields are available',async()=>{
 const h=harness('tax-ui.js'),request=h.defer('/api/tax/calculate'),pending=h.submit('taxCalculationForm');await h.reached('/api/tax/calculate');request.resolve(response(calculation));await pending;
 const analysis=h.defer('/api/tax/analyze'),analyzing=h.submit('taxAnalyzeForm');await h.reached('/api/tax/analyze');analysis.resolve(response({case:{id:'no-proposal',answer:{}}}));await analyzing;
 assert.equal(h.forms.get('taxCalculationForm').fields.get('amount').value,'');assert.equal(h.forms.get('taxCalculationForm').fields.get('confirmed').checked,false);blank(h,'#taxCalculationResult','#taxCalculationError');
});

test('manual calculation: exact snapshot catches unannounced programmatic changes',async()=>{
 const h=harness('tax-ui.js'),request=h.defer('/api/tax/calculate'),pending=h.submit('taxCalculationForm');await h.reached('/api/tax/calculate');await h.edit('taxCalculationForm','amount','20000',null);
 request.resolve(response(calculation));await pending;blank(h,'#taxCalculationResult','#taxCalculationError');
});

test('manual calculation: edit during session setup prevents stale calculation submission',async()=>{
 const h=harness('tax-ui.js'),session=h.defer('/api/session'),pending=h.submit('taxCalculationForm');await h.reached('/api/session');await h.edit('taxCalculationForm','confirmed',false);session.resolve(response({}));await pending;
 assert.equal(h.calls.some(call=>call.path==='/api/tax/calculate'),false);assert.equal(h.forms.get('taxCalculationForm').button.disabled,false);
});

for(const [field,value]of [['question','바뀐 합성 사례를 검토합니다.'],['transaction_date','2026-10-01'],['consent',false]])for(const stage of ['analysis','proposal'])test(`analysis: ${field} edit during ${stage} cannot apply stale draft`,async()=>{
 const h=harness('tax-ui.js'),analysis=h.defer('/api/tax/analyze'),proposal=h.defer('/api/tax/proposal'),pending=h.submit('taxAnalyzeForm');await h.reached('/api/tax/analyze');
 if(stage==='proposal'){analysis.resolve(response(taxCase(false)));await h.reached('/api/tax/proposal');assert.match(h.node('#taxAnalysisResult').innerHTML,/synthetic-case/);}
 await h.edit('taxAnalyzeForm',field,value);(stage==='analysis'?analysis:proposal).resolve(response(taxCase()));await pending;
 blank(h,'#taxAnalysisResult','#taxAnalyzeError');assert.equal(h.forms.get('taxCalculationForm').fields.get('amount').value,'10000');assert.equal(h.forms.get('taxAnalyzeForm').button.disabled,false);assert.equal(h.forms.get('taxAnalyzeForm').dataset.requestKey,undefined);
 if(stage==='analysis')assert.equal(h.calls.some(call=>call.path==='/api/tax/proposal'),false);
});

test('manual form navigation allows a new request while old completion cannot release it',async()=>{
 const h=harness('tax-ui.js'),old=h.defer('/api/tax/calculate'),pending=h.submit('taxCalculationForm');await h.reached('/api/tax/calculate');
 h.context.window.SeumTax.page('증여세');h.addForm('taxCalculationForm',{transaction_date:'2026-11-06',amount:'20000',debt:'0',prior:'0',deduction:'0',confirmed:true});
 const latest=h.defer('/api/tax/calculate'),newPending=h.submit('taxCalculationForm');await h.reached('/api/tax/calculate',2);old.reject(Error('이전 화면 오류'));await pending;
 blank(h,'#taxCalculationResult','#taxCalculationError');assert.equal(h.forms.get('taxCalculationForm').button.disabled,true);latest.resolve(response(calculation));await newPending;assert.match(h.node('#taxCalculationResult').innerHTML,/10,000,000/);
});

for(const stage of ['analysis','proposal'])for(const change of ['amount','date','confirmation','silent','revert'])test(`analysis ${stage}: newer manual ${change} input is preserved instead of applying proposal`,async()=>{
 const h=harness('tax-ui.js'),analysis=h.defer('/api/tax/analyze'),proposal=h.defer('/api/tax/proposal'),pending=h.submit('taxAnalyzeForm');await h.reached('/api/tax/analyze');
 if(stage==='proposal'){analysis.resolve(response(taxCase(false)));await h.reached('/api/tax/proposal');}
 if(change==='date')await h.edit('taxCalculationForm','transaction_date','2026-10-01','change');
 else if(change==='confirmation')await h.edit('taxCalculationForm','confirmed',false,'change');
 else{
  await h.edit('taxCalculationForm','amount','20000',change==='silent'?null:'input');
  if(change==='revert'){await h.edit('taxCalculationForm','amount','10000');await h.edit('taxCalculationForm','confirmed',true);}
 }
 const values=[...h.forms.get('taxCalculationForm').fields.values()].map(input=>[input.name,input.value,input.checked]);
 (stage==='analysis'?analysis:proposal).resolve(response(taxCase()));await pending;
 assert.deepEqual([...h.forms.get('taxCalculationForm').fields.values()].map(input=>[input.name,input.value,input.checked]),values);
 assert.match(h.node('#taxAnalysisResult').innerHTML,/AI 초안을 자동 적용하지 않았습니다/);
 await h.edit('taxCalculationForm','confirmed',true);const calculating=h.defer('/api/tax/calculate'),calculated=h.submit('taxCalculationForm');await h.reached('/api/tax/calculate');
 assert.equal(h.calls.find(call=>call.path==='/api/tax/calculate').body.case_id,null);calculating.resolve(response(calculation));await calculated;
});

for(const field of ['question','transaction_date','consent'])test(`analysis ${field} edit removes old case association for subsequent manual requests`,async()=>{
 const h=harness('tax-ui.js'),analysis=h.defer('/api/tax/analyze'),pending=h.submit('taxAnalyzeForm');await h.reached('/api/tax/analyze');analysis.resolve(response(taxCase()));await pending;
 for(const name of ['debt','prior','deduction'])await h.edit('taxCalculationForm',name,'0');await h.edit('taxCalculationForm','confirmed',true);
 const first=h.defer('/api/tax/calculate'),calculating=h.submit('taxCalculationForm');await h.reached('/api/tax/calculate');assert.equal(h.calls.find(call=>call.path==='/api/tax/calculate').body.case_id,'synthetic-case');
 await h.edit('taxAnalyzeForm',field,field==='question'?'변경된 합성 설명':field==='transaction_date'?'2026-10-01':false,'change');first.resolve(response(calculation));await calculating;
 blank(h,'#taxCalculationResult','#taxCalculationError');assert.equal(h.forms.get('taxCalculationForm').fields.get('confirmed').checked,false);
 await h.edit('taxCalculationForm','confirmed',true);const next=h.defer('/api/tax/calculate'),retry=h.submit('taxCalculationForm');await h.reached('/api/tax/calculate',2);
 assert.equal(h.calls.filter(call=>call.path==='/api/tax/calculate')[1].body.case_id,null);next.resolve(response(calculation));await retry;
});

for(const stage of ['analysis','proposal'])test(`analysis: stale ${stage} errors do not repopulate cleared errors`,async()=>{
 const h=harness('tax-ui.js'),analysis=h.defer('/api/tax/analyze'),proposal=h.defer('/api/tax/proposal'),pending=h.submit('taxAnalyzeForm');await h.reached('/api/tax/analyze');
 if(stage==='proposal'){analysis.resolve(response(taxCase(false)));await h.reached('/api/tax/proposal');}
 await h.edit('taxAnalyzeForm','question','변경된 합성 설명');(stage==='analysis'?analysis:proposal).reject(Error('이전 분석 오류'));await pending;
 blank(h,'#taxAnalysisResult','#taxAnalyzeError');assert.equal(h.forms.get('taxAnalyzeForm').button.disabled,false);
});
