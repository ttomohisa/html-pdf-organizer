// Source CSS contracts only. Actual bounds/scrolling are covered by native QA.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../src/index.template.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
test('password forms constrain a scrollable body between visible header and actions',()=>{
 assert.match(css,/\.password-dialog\[open\]\s*\{[^}]*display:\s*flex/);
 assert.match(css,/\.password-dialog\s*>\s*form\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*min-height:\s*0/);
 assert.match(css,/\.password-dialog \.dialog-body\s*\{[^}]*min-height:\s*0[^}]*flex:\s*1\s+1\s+auto/);
});
test('More actions has its own shrinking list scroller',()=>{
 assert.match(css,/\.mobile-tools-dialog\[open\]\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/);
 assert.match(css,/\.mobile-tools-list\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/);
});
test('preview stage may shrink below260px without covering the footer',()=>{
 assert.match(css,/\.preview-stage\s*\{[^}]*min-height:\s*0/);
});
test('modal dialogs lock document scrolling',()=>{
 assert.match(css,/html:has\(dialog\[open\]\)\s*\{[^}]*overflow:\s*hidden/);
});
test('short narrow screens can scroll cards past the editing dock',()=>{
 assert.match(css,/@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*480px\)\s*\{\s*\.mobile-edit-dock\s*\{[^}]*position:\s*static/);
});
