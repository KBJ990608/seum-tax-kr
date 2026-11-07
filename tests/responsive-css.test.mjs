import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../public/accessibility.css',import.meta.url),'utf8');

test('calculator native controls can shrink inside responsive grid cells',()=>{
 assert.match(css,/\.tax-field-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
 assert.match(css,/\.rag-form,\.rag-form label,\.tax-field-grid>\*\{min-width:0\}/);
 assert.match(css,/\.rag-form input,\.rag-form select,\.rag-form textarea\{min-width:0;max-width:100%\}/);
 assert.match(css,/\.tax-money-input input\{flex:1;min-width:0\}/);
 assert.match(css,/@media\(max-width:800px\)\{\.tax-field-grid\{grid-template-columns:minmax\(0,1fr\)\}\}/);
});

test('compact mobile actions retain 44px targets and MARCO text can wrap',()=>{
 assert.match(css,/\.install-app,\.chat-new,\.research-tax-tabs button,\.expert-tabs button\{min-height:44px\}/);
 assert.match(css,/\.chat-mobile-tabs button\{min-width:44px;min-height:44px\}/);
 assert.match(css,/\.marco-panel\{min-width:0;overflow-wrap:anywhere\}/);
 assert.match(css,/\.rag-form button:disabled\{cursor:not-allowed\}/);
});
