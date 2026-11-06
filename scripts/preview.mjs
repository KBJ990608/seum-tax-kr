import fs from 'node:fs';
import path from 'node:path';
import {Miniflare} from 'miniflare';
import {runtimeModules} from './runtime-modules.mjs';
fs.mkdirSync('.local',{recursive:true});
let local={};if(process.env.SEUM_USE_ENV_FILE==='1'&&fs.existsSync('.env.local')){for(const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m)local[m[1]]=m[2].trim();}}
const args=process.argv.slice(2),arg=(name,fallback)=>{const at=args.indexOf(name);return at<0?fallback:args[at+1]};
const port=Number(arg('--port',process.env.PORT||5190)),host=arg('--host','127.0.0.1');
if(!Number.isInteger(port)||port<1||port>65535||!['127.0.0.1','localhost','0.0.0.0'].includes(host))throw Error('Invalid preview address');
const bindings=Object.fromEntries(Object.entries({OPENAI_API_KEY:local.OPENAI_API_KEY||process.env.SEUM_LOCAL_OPENAI_API_KEY,OPENAI_MODEL:local.OPENAI_MODEL||process.env.SEUM_LOCAL_OPENAI_MODEL,OPENAI_ORGANIZATION:local.OPENAI_ORGANIZATION,OPENAI_VECTOR_STORE_ID:local.OPENAI_VECTOR_STORE_ID,SEUM_LIVE_RESEARCH:local.SEUM_LIVE_RESEARCH,EXPERT_EMAILS:local.EXPERT_EMAILS||process.env.EXPERT_EMAILS}).filter(([,v])=>v!==undefined));
const mf=new Miniflare({host,port,modules:runtimeModules(),compatibilityDate:'2026-07-30',compatibilityFlags:['nodejs_compat'],bindings,d1Databases:['DB'],d1Persist:path.resolve('.local/workerd-d1')});
const db=await mf.getD1Database('DB');
await db.prepare('CREATE TABLE IF NOT EXISTS __local_migrations (name TEXT PRIMARY KEY)').run();
for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort()){
 if(!await db.prepare('SELECT name FROM __local_migrations WHERE name=?').bind(name).first()){
  for(const statement of fs.readFileSync('drizzle/'+name,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
  await db.prepare('INSERT INTO __local_migrations VALUES (?)').bind(name).run();
 }
}
console.log(String(await mf.ready));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await mf.dispose();process.exit(0)});
