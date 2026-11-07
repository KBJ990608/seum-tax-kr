import test from 'node:test';
import assert from 'node:assert/strict';
import {ntsAction} from '../worker/nts.mjs';
const payload=JSON.stringify({status:'SUCCESS',data:{READ:{verified:true}}});
const quiet={__officialDiagnostic:()=>{}};
function brokenBody(name){return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));controller.error(new DOMException('synthetic private payload must not be logged',name));}}),{headers:{'content-type':'application/json'}});}
test('body-stream timeout is retried once, not mislabeled as invalid JSON',async()=>{
 let calls=0;const diagnostics=[];
 const result=await ntsAction({...quiet,__officialDiagnostic:d=>diagnostics.push(d),__officialFetch:async()=>++calls===1?brokenBody('TimeoutError'):new Response(payload)},'READ',{private_query:'never log this'});
 assert.equal(result.verified,true);assert.equal(calls,2);assert.equal(diagnostics[0].error_type,'TimeoutError');assert.equal(diagnostics[0].body_kind,'unread');assert(!JSON.stringify(diagnostics).includes('private'));assert(!JSON.stringify(diagnostics).includes('query'));
});
test('exhausted body timeout has explicit timeout code, and source body is never used',async()=>{
 let calls=0;await assert.rejects(ntsAction({...quiet,__officialFetch:async()=>{calls++;return brokenBody('AbortError');}},'READ',{}),e=>e.code==='OFFICIAL_SOURCE_TIMEOUT');assert.equal(calls,2);
});
test('body reading remains active after six seconds of streaming',async()=>{
 let calls=0;const result=await ntsAction({...quiet,__officialFetch:async(_url,{signal})=>{calls++;return new Response(new ReadableStream({start(controller){const encoder=new TextEncoder();controller.enqueue(encoder.encode(payload.slice(0,8)));const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);controller.enqueue(encoder.encode(payload.slice(8)));controller.close();},6200);function abort(){clearTimeout(timer);controller.error(signal.reason);}signal.addEventListener('abort',abort,{once:true});}}));}},'READ',{});
 assert.equal(result.verified,true);assert.equal(calls,1);
});
test('HTML and malformed JSON are not retried or treated as evidence',async()=>{
 for(const body of ['<html>upstream unavailable</html>','{"status":']){let calls=0;const diagnostics=[];await assert.rejects(ntsAction({__officialDiagnostic:d=>diagnostics.push(d),__officialFetch:async()=>{calls++;return new Response(body);}},'READ',{}),e=>e.code==='OFFICIAL_SOURCE_FORMAT');assert.equal(calls,1);assert.equal(diagnostics[0].body_kind,body[0]==='<'?'html':'json_like');assert(!JSON.stringify(diagnostics).includes('upstream unavailable'));}
});
test('UTF-8 BOM is accepted only before a valid action envelope',async()=>{
 const result=await ntsAction({...quiet,__officialFetch:async()=>new Response('\uFEFF'+payload)},'READ',{});assert.equal(result.verified,true);
});
test('body size and shared deadline remain bounded',async()=>{
 let calls=0;await assert.rejects(ntsAction({...quiet,__officialFetch:async()=>{calls++;return new Response('x'.repeat(8*1024*1024+1));}},'READ',{}),e=>e.code==='OFFICIAL_SOURCE_TOO_LARGE');assert.equal(calls,1);
 await assert.rejects(ntsAction({...quiet,__officialDeadline:Date.now()-1,__officialFetch:async()=>{throw Error('must not fetch');}},'READ',{}),e=>e.code==='OFFICIAL_SEARCH_TIME_BUDGET');
});
