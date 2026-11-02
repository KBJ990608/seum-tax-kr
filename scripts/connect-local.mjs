// Local-only secret entry. Never hosted in public/, never print request bodies or keys.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createPublicKey,publicEncrypt,constants} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const workspace=fs.realpathSync(process.cwd());
const target=path.join(workspace,'.env.local');
const approvedWorkspace='C:\\Users\\user\\Desktop\\AI\\seum-tax';
if(workspace.toLowerCase()!==approvedWorkspace.toLowerCase())throw Error('Wrong approved workspace');
const helper='C:/Users/user/.codex/plugins/cache/openai-curated-remote/openai-developers/1.3.13/scripts/openai-platform-api-key.mjs';
if(!fs.existsSync(helper))throw Error('Secure local writer unavailable');
const ORG='org-ZDKBk7laDDK9GPkRrVqyLFOx';
const port=5195,origin='http://127.0.0.1:'+port,nonce=randomBytes(32).toString('hex');
let verified=false,busy=false,lastAttempt=0;
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{
  if(req.headers.host!=='127.0.0.1:'+port)return send(res,403,{error:'Local host only'});
  if(req.url==='/status'&&req.method==='GET')return send(res,200,{verified,organization:ORG,hosted:false});
  if(req.url==='/'&&req.method==='GET'){
    const html=fs.readFileSync(new URL('./connect-local.html',import.meta.url),'utf8').replaceAll('__NONCE__',nonce);
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`});return res.end(html);
  }
  if(req.url!=='/connect'||req.method!=='POST')return send(res,404,{error:'Not found'});
  if(req.headers.origin!==origin||req.headers['x-seum-setup']!==nonce)return send(res,403,{error:'이 PC의 연결 화면에서만 설정할 수 있습니다.'});
  if(busy||Date.now()-lastAttempt<3000)return send(res,429,{error:'진행 중인 확인이 끝난 뒤 다시 시도해 주세요.'});
  if(!req.headers['content-type']?.includes('application/json'))return send(res,415,{error:'요청 형식을 확인해 주세요.'});
  let raw='';for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>12000)return send(res,413,{error:'입력값이 너무 깁니다.'});}
  let input;try{input=JSON.parse(raw);}catch{return send(res,400,{error:'입력 형식을 확인해 주세요.'});}raw='';
  if(!input||typeof input!=='object'||input.consent!==true||typeof input.key!=='string'||!/^sk-[A-Za-z0-9_-]{20,700}$/.test(input.key.trim()))return send(res,400,{error:'API 키와 보안 저장 동의를 확인해 주세요.'});
  busy=true;lastAttempt=Date.now();let key=input.key.trim();input.key='';
  try{
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'OpenAI-Organization':ORG,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',input:'Reply only: Connected',max_output_tokens:32,store:false}),signal:AbortSignal.timeout(60000)});
    const result=await response.json();
    if(!response.ok){const code=result.error?.code;if(code==='mismatched_organization')return send(res,400,{error:'이 키는 충전된 조직의 키가 아닙니다. API 키 페이지에서 현재 조직이 아래 ID와 같은지 확인한 뒤 발급해 주세요.'});if(result.error?.type==='insufficient_quota')return send(res,400,{error:'이 키의 조직에 사용할 수 있는 크레딧이 없습니다. 추가 결제 전에 키의 조직을 확인해 주세요.'});return send(res,400,{error:'키를 검증하지 못했습니다. 키의 유효성·모델 권한을 확인해 주세요.'});}
    if(result.status!=='completed')return send(res,400,{error:'연결 확인 응답이 완료되지 않았습니다.'});
    const prep=JSON.parse(execFileSync(process.execPath,[helper,'prepare','--name','Seum verified organization'],{encoding:'utf8',windowsHide:true}));
    const publicKey=createPublicKey({key:prep.recipient_public_key_jwk,format:'jwk'});
    const cipher=publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(key)).toString('base64url');
    execFileSync(process.execPath,[helper,'decrypt','--private-key',prep.private_key_path,'--ciphertext',cipher,'--target',target,'--workspace',workspace,'--env-name','OPENAI_API_KEY'],{encoding:'utf8',windowsHide:true});
    let env=fs.readFileSync(target,'utf8');env=env.replace(/^OPENAI_ORGANIZATION=.*\r?\n?/gm,'').trimEnd()+'\nOPENAI_ORGANIZATION='+ORG+'\n';fs.writeFileSync(target,env,{mode:0o600});
    verified=true;console.log('Verified organization API access and saved to approved .env.local.');return send(res,200,{verified:true,message:'실제 API 연결과 로컬 보안 저장이 완료됐습니다. 채팅에 ‘입력 완료’라고 알려주시면 앱 서버 등록과 RAG 색인을 이어갑니다.'});
  }catch{return send(res,500,{error:'보안 연결을 완료하지 못했습니다. 키 값은 출력하거나 기록하지 않았습니다.'});}finally{key='';busy=false;}
});
server.listen(port,'127.0.0.1',()=>console.log(origin));
