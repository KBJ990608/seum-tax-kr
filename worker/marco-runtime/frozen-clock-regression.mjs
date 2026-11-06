// Regression for Worker request clocks and Python FileFinder mtime caching.
// Run: node frozen-clock-regression.mjs (requires esbuild + miniflare dev dependencies).
import {Miniflare} from 'miniflare';
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
const root=path.dirname(fileURLToPath(import.meta.url));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'marco-clock-regression-'));
const entry=path.join(tmp,'entry.mjs');
const source=`import {health,dispatch} from './adapter.mjs';
const frozenNow=Date.now();Date.now=()=>frozenNow;
export default {async fetch(request){try{const path=new URL(request.url).pathname;return Response.json(path==='/health'?await health():await dispatch(path,await request.json()));}catch(error){return Response.json({status:'runtime_error',error:error.message},{status:503});}}};`;
let mf;
try{
 await esbuild.build({stdin:{contents:source,resolveDir:root,sourcefile:'frozen-clock-entry.mjs',loader:'js'},outfile:entry,bundle:true,format:'esm',platform:'browser',external:['node:*','ws'],plugins:[{name:'runtime-modules',setup(build){build.onResolve({filter:/\.(wasm|zip|bin|whl)$/},args=>({path:'./runtime/'+path.basename(args.path),external:true}));}}]});
 const modules=[{type:'ESModule',path:entry},...fs.readdirSync(path.join(root,'runtime')).map(name=>({type:name.endsWith('.wasm')?'CompiledWasm':'Data',path:path.join(tmp,'runtime',name),contents:fs.readFileSync(path.join(root,'runtime',name))}))];
 let outbound=0;
 mf=new Miniflare({compatibilityDate:'2026-07-30',compatibilityFlags:['nodejs_compat'],modulesRoot:tmp,modules,outboundService:()=>{outbound++;throw Error('Unexpected network request');}});
 const start=performance.now();const response=await mf.dispatchFetch('https://test.local/health');const health=await response.json();
 if(response.status!==200||health.status!=='ok')throw Error(JSON.stringify(health));
 const coldMs=performance.now()-start;
 const files=JSON.parse(fs.readFileSync(path.join(root,'marco-files.json')));
 const pack=JSON.parse(files['marco/knowledge/korean_tax/knowledge.v1.json']);
 const questions=pack.facts.flatMap(f=>f.questions);
 const ask=async(question)=>{const r=await mf.dispatchFetch('https://test.local/question',{method:'POST',body:JSON.stringify({question,as_of:'2026-11-06'}),headers:{'Content-Type':'application/json'}});return {http:r.status,body:await r.json()};};
 for(let i=0;i<100;i++){const r=await ask(questions[i%questions.length]);if(r.http!==200||r.body.status!=='answered'||r.body.native_evidence?.engine!=='MARCO engine.Session')throw Error(JSON.stringify(r));}
 const concurrent=await Promise.all(questions.slice(0,8).map(ask));if(concurrent.some(r=>r.http!==200||r.body.status!=='answered'))throw Error('Concurrent native answer failure');
 const attack=await ask("__import__('os').system('invalid')");if(attack.body.status!=='insufficient_information')throw Error('Unregistered question accepted');
 const after=await(await mf.dispatchFetch('https://test.local/health')).json();
 if(outbound!==0||after.wasm_linear_memory_bytes!==health.wasm_linear_memory_bytes)throw Error('Unexpected outbound request or memory growth');
 console.log(JSON.stringify({passed:true,frozenClock:true,nodejsCompat:true,declaredQuestions:questions.length,repeatedAnswers:100,concurrentAnswers:8,outboundRequests:outbound,coldWallMs:coldMs,wasmLinearMemoryBytes:after.wasm_linear_memory_bytes,clockWarning:'Worker-reported boot_ms is intentionally zero with a frozen clock; use externally measured wall time.'},null,2));
}finally{if(mf)await mf.dispose();fs.rmSync(tmp,{recursive:true,force:true});}
