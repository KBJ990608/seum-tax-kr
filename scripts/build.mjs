import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),assets={};
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else{const key='/'+path.relative('public',file).replaceAll('\\','/');assets[key]={type:types[path.extname(file)]||'application/octet-stream',encoding:file.endsWith('.png')?'base64':'text',body:fs.readFileSync(file,file.endsWith('.png')?'base64':'utf8')};}}}
scan('public');
const output=path.resolve(root,'dist');
if(path.dirname(output)!==fs.realpathSync(root)||path.basename(output)!=='dist'||fs.lstatSync(output,{throwIfNoEntry:false})?.isSymbolicLink())throw Error('Unsafe build output path');
// Resolve this dependency-free Worker strictly inside the checkout. Avoid
// reading parent directories to discover unrelated package/tsconfig files.
const result=await build({entryPoints:[path.join(root,'worker/index.mjs')],outfile:'dist/server/application.js',write:false,bundle:true,format:'esm',platform:'browser',target:'es2022',tsconfigRaw:{compilerOptions:{}},plugins:[{name:'local-worker',setup(b){
  b.onResolve({filter:/^virtual:seum-assets$/},()=>({path:'assets',namespace:'seum'}));
  b.onLoad({filter:/.*/,namespace:'seum'},()=>({contents:'export default '+JSON.stringify(assets),loader:'js'}));
  b.onResolve({filter:/.*/},args=>{const file=args.kind==='entry-point'?path.resolve(args.path):path.resolve(path.dirname(args.importer),args.path);if(!file.startsWith(root+path.sep)||(!args.path.startsWith('.')&&args.kind!=='entry-point'))throw Error('Worker imports must stay in checkout');return {path:file,namespace:'local-source'};});
  b.onLoad({filter:/.*/,namespace:'local-source'},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:args.path.endsWith('.json')?'json':'js'}));
}}]});
fs.rmSync(output,{recursive:true,force:true});
fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/.openai',{recursive:true});
fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');
for(const file of result.outputFiles)fs.writeFileSync(file.path,file.contents);
console.log('Built server API and '+Object.keys(assets).length+' embedded public assets.');

// Runtime binaries are reproducible, checksum-pinned build artifacts, not secrets.
const runtimeRoot=path.join(root,'worker/marco-runtime');
const runtimeManifest=JSON.parse(fs.readFileSync(path.join(runtimeRoot,'runtime-manifest.json'),'utf8'));
function binariesValid(){
 if(!['marco-files.json','vendor/pyodide.asm.mjs','vendor/pyodide.asm.original.mjs'].every(name=>fs.existsSync(path.join(runtimeRoot,name))))return false;
 const sha=value=>createHash('sha256').update(value).digest('hex');
 if(sha(fs.readFileSync(path.join(runtimeRoot,'vendor/pyodide.asm.mjs')))!=='ebaf218caf8e93ade36f380cc7e3db9b2ac4ba1fe3a44318247bcfc9198f7297'||sha(fs.readFileSync(path.join(runtimeRoot,'vendor/pyodide.asm.original.mjs')))!=='f7cdc8ece80678ceb712f8e65ebe6d3a83203a180c399865f49612a051693635')return false;
 const files=JSON.parse(fs.readFileSync(path.join(runtimeRoot,'marco-files.json'),'utf8'));
 const sources=JSON.parse(fs.readFileSync(path.join(runtimeRoot,'source-manifest.json'),'utf8'));
 if(!sources.every(item=>typeof files[item.path]==='string'&&sha(files[item.path])===item.sha256))return false;
 return runtimeManifest.every(item=>{const file=path.join(runtimeRoot,'runtime',path.basename(item.path));if(!fs.existsSync(file))return false;const bytes=fs.readFileSync(file);return bytes.length===item.bytes&&createHash('sha256').update(bytes).digest('hex')===item.sha256;});}
if(!binariesValid())execFileSync('python3',[path.join(runtimeRoot,'prepare-runtime.py'),'--cache',path.join(root,'.cache/marco-runtime')],{stdio:'inherit'});
if(!binariesValid())throw Error('MARCO runtime files failed checksums');
// Keep the edge validation contract synchronized with the exact pinned Python
// pack. It validates evidence; the actual answer still comes from MARCO.
const sourceFiles=JSON.parse(fs.readFileSync(path.join(runtimeRoot,'marco-files.json'),'utf8'));
const packText=sourceFiles['marco/knowledge/korean_tax/knowledge.v1.json'],pack=JSON.parse(packText);
const expectedEvidence={knowledge_sha256:createHash('sha256').update(packText).digest('hex'),tax_types:pack.tax_types,facts:pack.facts.map(({questions,...fact})=>fact)};
if(JSON.stringify(JSON.parse(fs.readFileSync('data/marco-evidence-contract.json','utf8')))!==JSON.stringify(expectedEvidence))throw Error('MARCO evidence contract differs from pinned knowledge pack');

await build({entryPoints:[path.join(runtimeRoot,'adapter.mjs')],outfile:'dist/server/marco-runtime.js',bundle:true,format:'esm',platform:'browser',target:'es2022',external:['node:*','ws'],plugins:[{name:'compiled-runtime-modules',setup(b){b.onResolve({filter:/\.(wasm|zip)$/},args=>({path:'./runtime/'+path.basename(args.path).replace(/\.zip$/,'.bin'),external:true}));}}]});
fs.mkdirSync('dist/server/runtime',{recursive:true});
for(const item of runtimeManifest)fs.copyFileSync(path.join(runtimeRoot,'runtime',path.basename(item.path)),path.join(root,'dist/server/runtime',path.basename(item.path).replace(/\.zip$/,'.bin')));
fs.writeFileSync('dist/server/index.js',`import application from './application.js';
import * as marcoRuntime from './marco-runtime.js';
export default {fetch(request,env,ctx){return application.fetch(request,{...env,__marcoRuntime:marcoRuntime},ctx)}};
`);
console.log('Built pinned MARCO Python runtime with '+runtimeManifest.length+' separate modules.');
