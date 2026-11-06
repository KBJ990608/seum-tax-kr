import fs from 'node:fs';
import assert from 'node:assert/strict';
import worker from '../dist/server/application.js';
import {localDB} from './db-local.mjs';
const text=fs.readFileSync('.env.local','utf8'),manifest=JSON.parse(fs.readFileSync('data/indexed-sources.json','utf8'));
const env={DB:localDB(),OPENAI_API_KEY:text.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim(),OPENAI_ORGANIZATION:text.match(/^OPENAI_ORGANIZATION=(.+)$/m)?.[1]?.trim(),OPENAI_VECTOR_STORE_ID:manifest.store_id};
const origin='https://seum.example';
const health=await(await worker.fetch(new Request(origin+'/api/health'),env,{})).json();assert(health.rag_ready);
const question={question:'2026년 11월 2일 상속이 개시되었습니다. 거주자인 아버지가 사망했고 배우자와 성인 자녀 2명이 있습니다. 상속세 일괄공제와 배우자 공제의 적용 조건 및 확인할 사항을 알려 주세요.',transaction_date:'2026-11-02',consent:true,request_key:crypto.randomUUID()};
const response=await worker.fetch(new Request(origin+'/api/consultations',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'seum_session='+'a'.repeat(64)},body:JSON.stringify(question)}),env,{});
const result=await response.json();assert.equal(response.status,201);if(!result.case?.answer){console.log(JSON.stringify({live:false,reasons:result.case?.reasons}));process.exitCode=1;}else{assert(result.case.answer.response_id);assert(result.case.evidence.length);console.log(JSON.stringify({live:true,status:result.case.status,model:result.case.answer.model,evidence:result.case.evidence.map(d=>({title:d.title,url:d.url})),findings:result.case.answer.answer.findings.length,expert_review:result.case.answer.answer.needs_expert}));}
env.DB.close();
