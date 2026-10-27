const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
for(const file of ['src/index.template.html','pdf-organizer.html'])test(file+': timeout pauses during focus but explicit Close still dismisses',()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8');const start=source.indexOf('    function showToast(');const code=source.slice(start,source.indexOf('\n    }',start)+6);
 let toast;const timers=[];const document={activeElement:null,querySelector:()=>({textContent:'',setAttribute(){}}),createElement(){return {handlers:{},children:[],setAttribute(){},append(...nodes){this.children.push(...nodes)},addEventListener(type,fn){this.handlers[type]=fn},contains(node){return this.children.includes(node)},remove(){this.removed=true}}}};
 const context={document,elements:{toastRegion:{append(node){toast=node}}},icons:{warning:'',info:'',close:''},t:key=>key,setTimeout:fn=>timers.push(fn)};
 vm.runInNewContext(code+';showToast("removed pages");',context);const close=toast.children.at(-1);document.activeElement=close;timers.shift()();assert.equal(Boolean(toast.removed),false,'keyboard focus pauses expiration');close.handlers.click();assert.equal(toast.removed,true,'explicit dismissal must not wait for blur');
});
