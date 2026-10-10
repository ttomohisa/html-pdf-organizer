// Execute the actual preview backdrop handler; native Enter activation is checked separately.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const targets=process.env.PDF_ORGANIZER_HTML?[process.env.PDF_ORGANIZER_HTML]:['src/index.template.html','pdf-organizer.html'].map(p=>path.join(root,p));
function handler(filename){
  const source=fs.readFileSync(filename,'utf8');
  const marker='    elements.previewDialog.addEventListener("click", (event) => {';
  const start=source.indexOf(marker);assert.ok(start>=0);
  const block=source.slice(start,source.indexOf('\n    });',start)+7);
  let listener,closes=0;
  const dialog={getBoundingClientRect:()=>({left:30,right:1150,top:12,bottom:745}),addEventListener:(name,fn)=>{assert.equal(name,'click');listener=fn;}};
  vm.runInNewContext(block,{elements:{previewDialog:dialog},closePreview:()=>closes++});
  return {dialog,click:e=>listener(e),closes:()=>closes};
}
for(const filename of targets){
  test(path.relative(root,filename)+': keyboard and child clicks do not dismiss preview',()=>{
    const h=handler(filename),child={id:'previewNextButton'};
    h.click({target:child,clientX:0,clientY:0,detail:0});
    assert.equal(h.closes(),0,'a bubbled keyboard click is not a backdrop click');
    h.click({target:child,clientX:10,clientY:10,detail:1});
    assert.equal(h.closes(),0,'a child click stays inside the dialog even if its coordinates lie outside');
  });
  test(path.relative(root,filename)+': only a genuine outside dialog click dismisses preview',()=>{
    const h=handler(filename);
    h.click({target:h.dialog,clientX:200,clientY:200,detail:1});assert.equal(h.closes(),0);
    h.click({target:h.dialog,clientX:10,clientY:200,detail:1});assert.equal(h.closes(),1);
  });
}
