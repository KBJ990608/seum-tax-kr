// Browser rendering fixtures only. These are NOT real model answers.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const threadId='c'.repeat(32),turns=[],errors=[],created='2026-11-02T00:00:00Z';
const context=await browser.newContext({viewport:{width:1500,height:1050}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/chat/**',async route=>{
 const request=route.request(),path=new URL(request.url()).pathname;let data;
 if(path==='/api/chat/messages'){
  const input=request.postDataJSON(),id='fixture-case-'+(turns.length+1);const row={id,question:input.question,transaction_date:'2026-11-02',status:'needs_review',created_at:created,updated_at:created,reasons:['[UI 검증용] 적용 시점 추가 확인'],expert_reply:'',evidence:[{id:'S1',title:'[UI 검증용] 소득세법 조문',kind:'law',url:'https://www.law.go.kr/법령/소득세법',effective_from:'2026-01-01',excerpt:'화면 배치 검증을 위한 원문 자리입니다. 실제 법률 안내가 아닙니다.'}],answer:{model:'UI fixture · 실제 AI 아님',answer:{summary:'[화면 검증용 응답] 먼저 증여 당시와 양도 예정일의 자료를 함께 준비해 주세요. 이 문장은 화면 배치 검증용입니다.',findings:[{text:'[UI 검증용] 근거와 적용 시점을 함께 확인합니다.',source_ids:['S1']}],recommendations:[{action:'[UI 검증용] 계약서와 신고서를 준비하세요.',reason:'추천 행동과 출처 버튼의 화면 배치를 확인하는 예시입니다.',source_ids:['S1']}],follow_up_questions:['[UI 검증용] 증여일을 알려주실 수 있나요?'],missing_facts:['증여일'],conflicts:[],review_items:[{issue:'[UI 검증용] 개정 전후 적용 시점',why_uncertain:'시점 확인이 필요하다는 표시의 배치를 점검합니다.',source_ids:['S1'],question_for_expert:'적용 법령과 부칙을 확인해 주세요.'}]}}};turns.push(row);data={thread_id:threadId,case:row};
 }else if(path==='/api/chat/threads')data={threads:turns.length?[{id:threadId,title:turns[0].question,turns:turns.length,created_at:created,updated_at:created}]:[]};
 else data={thread:{id:threadId,transaction_date:'2026-11-02'},turns};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
await page.goto('http://127.0.0.1:5190/');await page.locator('nav [data-page=chat]').click();await page.waitForSelector('#chatComposer');
assert.equal(await page.locator('#ragConsultForm').count(),0);await page.screenshot({path:'.local/chat-desktop-welcome.png',fullPage:true});
await page.locator('#chatInput').fill('[UI 검증용] 증여받은 토지를 양도하고 싶습니다.');await page.locator('#chatConsent').check();await page.locator('#chatSend').click();
await page.getByText('이렇게 진행해 보세요',{exact:true}).waitFor();await page.locator('#chatReviewPane').getByText('[UI 검증용] 개정 전후 적용 시점',{exact:true}).waitFor();
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:'.local/chat-desktop-answer.png',fullPage:true});
await page.locator('.chat-actions [data-chat-source]').first().click();await page.locator('#chatSourceDialog[open]').waitFor();assert(await page.locator('#chatSourceDialog').innerText().then(t=>t.includes('실제 법률 안내가 아닙니다.')));await page.locator('[data-close-source]').click();
await page.locator('#chatInput').fill('2022년에 증여받았습니다.');await page.locator('#chatSend').click();await page.waitForFunction(()=>document.querySelectorAll('.chat-user').length===2&&document.querySelectorAll('.chat-assistant').length===2);await page.reload();await page.locator('nav [data-page=chat]').click();await page.waitForFunction(()=>document.querySelectorAll('.chat-user').length===2);
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.local/chat-mobile-answer.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
await page.locator('.chat-mobile-tabs [data-chat-panel=review]').click();await page.locator('#chatReviewPane').waitFor({state:'visible'});assert.equal(await page.locator('.chat-surface').isVisible(),false);await page.screenshot({path:'.local/chat-mobile-review.png',fullPage:true});
await page.locator('.chat-mobile-tabs [data-chat-panel=chat]').click();await page.locator('.chat-new.small-screen').click();await page.getByText('어떤 상황이신가요?',{exact:true}).waitFor();assert.deepEqual(errors,[]);
await page.goto('http://127.0.0.1:5190/expert');await page.getByText('담당자 전용 검토함',{exact:true}).waitFor();
console.log('PASS: chatbot replaces form, two turns and reload, cited action steps, separate expert issues, source dialog, new chat, mobile tabs/no overflow, protected reviewer page. AI responses in this browser test were explicit UI fixtures.');await browser.close();
