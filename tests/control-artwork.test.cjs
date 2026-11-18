const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const targets=process.env.PDF_ORGANIZER_HTML?[process.env.PDF_ORGANIZER_HTML]:['src/index.template.html','pdf-organizer.html'].map(p=>path.join(root,p));
for(const filename of targets){
 const html=fs.readFileSync(filename,'utf8'),prefix=path.relative(root,filename)+': ';
 test(prefix+'drop area has no decorative tinted background layer',()=>{
  assert.doesNotMatch(html,/\.drop-zone::before\s*\{/);
  assert.match(html,/\.drop-zone\s*\{[^}]*background:\s*var\(--surface\)/);
 });
 test(prefix+'opening screen is plain and its import icon points down',()=>{
  assert.doesNotMatch(html,/class="overview-actions"/);
  assert.match(html,/data-i18n="overviewSummary"/);
  assert.match(html,/upload: `<svg[^\n]+m7\.5 11\.5 4\.5 4\.5 4\.5-4\.5/);
  assert.match(html,/data-i18n="choosePdf">ファイルを選択/);
 });
 test(prefix+'rotation arrows are clear mirrored paths reused by every action surface',()=>{
  const left=html.match(/rotateLeft: `([^`]+)`/)[1],right=html.match(/rotateRight: `([^`]+)`/)[1];
  assert.match(left,/<path d="M3 10a9 9 0 1 1 2\.7 8\.4"\/>/);
  assert.match(left,/<path d="M3 4v6h6"\/>/);
  assert.match(right,/transform="translate\(24 0\) scale\(-1 1\)"/);
  assert.equal([...left.matchAll(/<path[^>]*\/>/g)].map(m=>m[0]).join(''),[...right.matchAll(/<path[^>]*\/>/g)].map(m=>m[0]).join(''));
  assert.match(html,/icons\.rotateLeft/);assert.match(html,/icons\.rotateRight/);
 });
}
