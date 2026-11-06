import http from 'node:http';
import fs from 'node:fs';
import worker from '../dist/server/index.js';
import { localDB } from './db-local.mjs';
fs.mkdirSync('.local',{recursive:true});
let local={};if(process.env.SEUM_USE_ENV_FILE==='1'&&fs.existsSync('.env.local')){for(const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m)local[m[1]]=m[2].trim();}}
const args=process.argv.slice(2),arg=(name,fallback)=>{const at=args.indexOf(name);return at<0?fallback:args[at+1]};
const port=Number(arg('--port',process.env.PORT||5190)),host=arg('--host','127.0.0.1');
if(!Number.isInteger(port)||port<1||port>65535||!['127.0.0.1','localhost','0.0.0.0'].includes(host))throw Error('Invalid preview address');
const env={MARCO_SERVICE_URL:local.MARCO_SERVICE_URL||process.env.MARCO_SERVICE_URL,DB:localDB('.local/preview.sqlite'),OPENAI_API_KEY:local.OPENAI_API_KEY||process.env.SEUM_LOCAL_OPENAI_API_KEY,OPENAI_MODEL:local.OPENAI_MODEL||process.env.SEUM_LOCAL_OPENAI_MODEL,OPENAI_ORGANIZATION:local.OPENAI_ORGANIZATION,OPENAI_VECTOR_STORE_ID:local.OPENAI_VECTOR_STORE_ID,SEUM_LIVE_RESEARCH:local.SEUM_LIVE_RESEARCH,EXPERT_EMAILS:local.EXPERT_EMAILS||process.env.EXPERT_EMAILS};
http.createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const request=new Request((req.headers['x-forwarded-proto']==='https'?'https':'http')+'://'+(req.headers.host||'127.0.0.1:'+port)+req.url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});const response=await worker.fetch(request,env,{});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}).listen(port,host,()=>console.log('http://'+host+':'+port));
