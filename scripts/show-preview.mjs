import {chromium} from '@playwright/test';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:false});
const page=await browser.newPage({viewport:null});
await page.goto('http://127.0.0.1:5190/#chat');
await page.waitForSelector('#chatComposer',{state:'visible'});
console.log('Visible local chatbot preview loaded: http://127.0.0.1:5190/#chat');
await new Promise(resolve=>browser.on('disconnected',resolve));
