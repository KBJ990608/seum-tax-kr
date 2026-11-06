// Pinned host adapter. It runs unchanged MARCO Python source, not a JavaScript rewrite.
import {loadPyodide} from './vendor/pyodide-loader.mjs';
import factory from './vendor/pyodide.asm.mjs';
import compiledMain from './runtime/pyodide.asm.wasm';
import numpyWheel from './runtime/numpy-python.zip';
import numpyProvenance from './numpy-provenance.json';
import numpyModules from './numpy-modules.mjs';
import lock from './vendor/pyodide-lock.json';
import files from './marco-files.json';
export const CONTRACT=Object.freeze({upstream_commit:'c7d648a7fd952e750b8b3b0cb017d6b79ba27b13',training_commit:'3a4383b9b52739f65d730dee0dba7cac2c274c18',pack_id:'marco-korean-tax-core-2026-11-06',knowledge_sha256:'ff6ace5449d5c9fa587f2dad3ca923b094d2dc2ae76b1563521333e1cbb4b99c',supported_from:'2026-01-02',verified_through:'2026-11-06'});
const BOOT=`import os, sys, json, gc\nos.chdir('/marco')\nsys.path.insert(0, '/marco')\nfrom marco.knowledge.korean_tax import answer_question, evaluate_scenario, classify_transfer, lookup_fact\ndef _marco_dispatch(path, raw):\n    data = json.loads(raw)\n    if path == '/question':\n        return answer_question(data.get('question'), as_of=data.get('as_of'))\n    if path == '/evaluate':\n        return evaluate_scenario(data)\n    if path == '/classify':\n        return classify_transfer(data.get('transfer_kind'), as_of=data.get('as_of'))\n    if path == '/fact':\n        return lookup_fact(data.get('topic'), as_of=data.get('as_of'))\n    raise ValueError('Unsupported route')\n`;
const RUN=`json.dumps(_marco_dispatch(_marco_path, _marco_request_json), ensure_ascii=False)`;
let runtimePromise=null;let queue=Promise.resolve();let bootStats=null;
function serial(fn){const result=queue.then(fn,fn);queue=result.catch(()=>{});return result}
function execute(py,path,payload){
 py.globals.set('_marco_path',path);py.globals.set('_marco_request_json',JSON.stringify(payload));
 try{return JSON.parse(py.runPython(RUN))}finally{py.globals.delete('_marco_path');py.globals.delete('_marco_request_json');py.runPython('gc.collect()')}
}
async function boot(){
 const began=Date.now();
 // Emscripten's generic browser fallback assumes postMessage/capture listeners.
 globalThis.setImmediate??=((fn,...args)=>setTimeout(fn,0,...args));
 globalThis.clearImmediate??=clearTimeout;
 const py=await loadPyodide({indexURL:'https://marco-runtime.invalid/',lockFileContents:lock,stdout:()=>{},stderr:()=>{},createPyodideModule:settings=>{
  settings.instantiateWasm=(imports,callback)=>{
   const marker=Symbol('Pyodide error marker');imports.env.Jsv_GetError_import=()=>marker;imports.env.JsvError_Check=value=>value===marker;
   WebAssembly.instantiate(compiledMain,imports).then(instance=>callback(instance,compiledMain));return {};
  };return factory(settings);
 }});
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',numpyWheel)),b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==numpyProvenance.slim_sha256)throw Error('Pinned NumPy checksum mismatch');
 // Static precompiled modules comply with workerd's prohibition of runtime compilation.
 for(const [path,compiled] of numpyModules)py._module.preloadedWasm[path]=await py._module.loadWebAssemblyModule(compiled,{loadAsync:true,nodelete:true,allowUndefined:true},path,{});
 await py.unpackArchive(numpyWheel,'zip',{extractDir:'/lib/python3.14/site-packages'});
 // Cloudflare request clocks can leave directory mtimes unchanged. Invalidate
 // Python importer caches after installing bundled files.
 py.runPython("import sys,importlib; sys.path.insert(0, '/lib/python3.14/site-packages'); importlib.invalidate_caches(); import numpy");
 for(const [name,contents] of Object.entries(files)){const split=name.lastIndexOf('/');py.FS.mkdirTree('/marco'+(split<0?'':'/'+name.slice(0,split)));py.FS.writeFile('/marco/'+name,contents)}
 py.runPython('import importlib; importlib.invalidate_caches()');
 py.runPython(BOOT);
 const smoke=execute(py,'/question',{question:'사인증여는 증여세야?',as_of:'2026-11-06'});
 if(smoke.status!=='answered'||smoke.native_evidence?.engine!=='MARCO engine.Session'||smoke.knowledge_sha256!==CONTRACT.knowledge_sha256)throw Error('MARCO native smoke test failed');
 bootStats={boot_ms:Date.now()-began,wasm_linear_memory_bytes:py._module.HEAPU8.byteLength};
 return py;
}
function ensure(){if(!runtimePromise)runtimePromise=boot().catch(error=>{console.error('MARCO_BOOT_FAILED',error.name,error.message);runtimePromise=null;bootStats=null;throw error});return runtimePromise}
function getHealth(py){return {status:'ok',service:'marco-korean-tax',api_version:1,...CONTRACT,execution_mode:'source_bound_rules_and_native_knowledge_graph',runtime:'sites_worker_cpython_wasm',python_version:py.runPython('sys.version'),pyodide_version:py.version,llm_used:false,request_persistence:false,general_freeform_counseling:false,...bootStats,wasm_linear_memory_bytes:py._module.HEAPU8.byteLength}}
export function health(){return serial(async()=>getHealth(await ensure()))}
export function dispatch(path,data){
 if(!['/evaluate','/question','/classify','/fact'].includes(path))return Promise.reject(Error('Unsupported MARCO route'));
 if(!data||Array.isArray(data)||typeof data!=='object')return Promise.reject(Error('MARCO payload must be an object'));
 const text=JSON.stringify(data);if(text.length>24000)return Promise.reject(Error('MARCO payload too large'));
 if(path!=='/evaluate'){
  const keys={question:['question','as_of'],classify:['transfer_kind','as_of'],fact:['topic','as_of']}[path.slice(1)];
  if(Object.keys(data).some(key=>!keys.includes(key)))return Promise.reject(Error('Unexpected MARCO input field'));
  if(path==='/question'&&(typeof data.question!=='string'||data.question.length>2000))return Promise.reject(Error('Invalid MARCO question'));
 }
 return serial(async()=>{const py=await ensure();try{return execute(py,path,JSON.parse(text))}catch(error){runtimePromise=null;bootStats=null;throw error}});
}
