import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),assets={};
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else{const key='/'+path.relative('public',file).replaceAll('\\','/');assets[key]={type:types[path.extname(file)]||'application/octet-stream',encoding:file.endsWith('.png')?'base64':'text',body:fs.readFileSync(file,file.endsWith('.png')?'base64':'utf8')};}}}
scan('public');
const output=path.resolve(root,'dist');
if(path.dirname(output)!==fs.realpathSync(root)||path.basename(output)!=='dist'||fs.lstatSync(output,{throwIfNoEntry:false})?.isSymbolicLink())throw Error('Unsafe build output path');
// Resolve this dependency-free Worker strictly inside the checkout. Avoid
// reading parent directories to discover unrelated package/tsconfig files.
const result=await build({entryPoints:[path.join(root,'worker/index.mjs')],outfile:'dist/server/index.js',write:false,bundle:true,format:'esm',platform:'browser',target:'es2022',tsconfigRaw:{compilerOptions:{}},plugins:[{name:'local-worker',setup(b){
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
