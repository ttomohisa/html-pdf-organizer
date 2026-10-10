const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const targets=process.env.PDF_ORGANIZER_HTML?[process.env.PDF_ORGANIZER_HTML]:['src/index.template.html','pdf-organizer.html'].map(p=>path.join(root,p));
for(const filename of targets){
 const html=fs.readFileSync(filename,'utf8'),prefix=path.relative(root,filename)+': ';
 test(prefix+'drop area has no decorative tinted background layer',()=>{
  assert.doesNotMatch(html,/\.drop-zone::before\s*\{/);
  assert.match(html,/\.drop-zone\s*\{[^}]*background:\s*var\(--surface\)/);
 });
 test(prefix+'four overview icons use consistent page-based line artwork',()=>{
  const icons=[...html.matchAll(/<span class="overview-action-icon" aria-hidden="true">(<svg[\s\S]*?<\/svg>)<\/span>/g)].map(m=>m[1]);
  assert.equal(icons.length,4);assert.equal(new Set(icons).size,4);
  for(const svg of icons){assert.match(svg,/viewBox="0 0 24 24"/);assert.match(svg,/stroke-width="1\.9"/);assert.match(svg,/stroke-linejoin="round"/);assert.match(svg,/<path d="M(?:9 3h9|5 3h9|8 3h9|4 3h10)/);}
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
