// Execute the shipped drag handlers with explicit event sequences. DOM/capture,
// animation and time are adapters; these are not physical-browser touch tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const targets = process.env.PDF_ORGANIZER_HTML ? [process.env.PDF_ORGANIZER_HTML] : ['src/index.template.html', 'pdf-organizer.html'].map(p => path.join(root, p));
function extract(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n    }', start) + 6);
}
function harness(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const listeners = [], timers = new Map(), trace = [], history = [];
  let timerId = 0, time = 1000, previewCount = 0;
  const classList=()=>{const values=new Set();return{add(...xs){xs.forEach(x=>values.add(x));},remove(...xs){xs.forEach(x=>values.delete(x));},toggle(x,on){if(on)values.add(x);else values.delete(x);},contains:x=>values.has(x)}};
  const target = name => ({ addEventListener(type, fn, options) { listeners.push({ name, type, fn, options }); }, classList: classList() });
  const grid = target('grid'), win = target('window'), doc = target('document');
  doc.body = target('body'); doc.documentElement = target('html'); doc.hidden = false;
  doc.querySelector = () => null; doc.querySelectorAll=()=>[];
  const cards = ['A','B','C','D','E','F'].map(id => ({
    dataset: { pageId: id }, classList: classList(),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    closest: selector => selector === '.page-card' ? cards.find(c => c.dataset.pageId === id) : null,
    setPointerCapture(id) { trace.push(['capture', id]); },
    releasePointerCapture(id) { trace.push(['release', id]); }
  }));
  grid.querySelectorAll = () => cards;
  const state = { pages: cards.map(c => ({ id: c.dataset.pageId, rotation: 0 })), selected: new Set(['B','C']), pageRevision: 0, isBusy: false, suppressClickUntil: 0 };
  win.setTimeout = (fn,delay) => { timers.set(++timerId,{fn,at:time+delay}); return timerId; };
  function advance(ms){const until=time+ms; for(;;){const next=[...timers.entries()].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;timers.delete(next[0]);time=next[1].at;next[1].fn();}time=until;}
  const ctx = vm.createContext({ state, elements: { pagesGrid: grid }, window: win, document: doc, navigator: {},
    Date: { now: () => time }, Math, Set, Array,
    clearTimeout: id => timers.delete(id),
    clonePages: () => state.pages.map(p => ({ ...p })),
    refreshSelectionUi() {}, renderGrid() { trace.push(['render']); },
    pushHistory: snapshot => history.push(snapshot),
    createPointerDragPreview() { previewCount++; return { style: {},remove(){previewCount=Math.max(0,previewCount-1)} }; },
    requestPointerDragFrame() { vm.runInContext('if(pointerDrag?.active) pointerDrag.dropIndex = pointerDrag.latestPoint.clientX > 200 ? 4 : 0;', ctx); }
  });
  const names = ['cancelPointerDrag','cleanupDragVisuals','beginPointerDrag','finishPointerDrag'];
  if(source.includes('function preparePointerDrag(')) names.push('preparePointerDrag');
  const handlers = source.slice(source.indexOf('    const TOUCH_DRAG_HOLD_MS'), source.indexOf('    elements.pagesGrid.addEventListener("mousedown"'));
  vm.runInContext('let pointerDrag = null;\n' + names.map(n => extract(source,n)).join('\n') + '\n' + handlers + '\n globalThis.getDrag = () => pointerDrag; globalThis.cancelDrag = cancelPointerDrag;', ctx);
  const layoutStart=source.indexOf('      function captureDragLayout(event)');
  const layoutEnd=source.indexOf('      function stableRect',layoutStart);
  vm.runInContext('let dragLayoutSnapshot=null;\n'+source.slice(layoutStart,layoutEnd)+'\nglobalThis.getLayout=()=>dragLayoutSnapshot;',ctx);
  function emit(name, type, extra = {}) {
    const event = { target: cards[1], pointerId: 7, pointerType: 'touch', button: 0, isPrimary: true, clientX: 10, clientY: 10, cancelable: true, prevented: false, preventDefault() { if(this.cancelable) this.prevented = true; }, ...extra };
    if(type.startsWith('touch')) delete event.pointerType;
    trace.push([type, event.cancelable]);
    const match = listeners.filter(l => l.name === name && l.type === type).sort((a,b)=>Number(!!(b.options===true||b.options?.capture))-Number(!!(a.options===true||a.options?.capture)));
    for(const l of match) l.fn(event);
    return event;
  }
  const touch = (id=41,x=10,y=10) => ({ identifier:id, clientX:x, clientY:y });
  function fingerDown(extra={}) {
    emit('grid','pointerdown', extra);
    const e = { touches:[touch()], changedTouches:[touch()], ...extra };
    emit('window','touchstart',e); emit('grid','touchstart',e);
  }
  return { source,state, cards, listeners, history, trace, doc, touch, emit, fingerDown,advance,
    hold() { advance(210); },
    nextGesture() { advance(500); },
    move(x=300,y=40,extra={}) { emit('grid','pointermove',{clientX:x,clientY:y}); return emit('grid','touchmove',{ touches:[touch(41,x,y)], changedTouches:[touch(41,x,y)], ...extra }); },
    end(id=41) { emit('window','touchend',{ touches:[], changedTouches:[touch(id)] }); },
    cancel(id=41) { emit('window','touchcancel',{ touches:[], changedTouches:[touch(id)] }); },
    drag:()=>ctx.getDrag(), layout:()=>ctx.getLayout(), ghosts:()=>previewCount, cancelEdit:()=>ctx.cancelDrag(), timers:()=>timers.size,
    order:()=>Array.from(state.pages,p=>p.id) };
}
for(const filename of targets) {
  const prefix=path.relative(root,filename)+': ';
  test(prefix+'held touch survives pointer cancellation and finishes with its own touch identifier',()=>{
    const h=harness(filename); h.fingerDown(); h.hold(); assert.ok(h.drag()?.active);
    // A simulated browser pointer-stream handoff, not a captured Android trace.
    h.emit('window','pointercancel'); h.emit('grid','lostpointercapture');
    assert.ok(h.drag()?.active,'pointer cancellation must not discard the live touch gesture');
    assert.equal(h.move().prevented,true); h.end(999); assert.ok(h.drag()?.active);
    h.end(); assert.deepEqual(h.order(),['A','D','E','F','B','C']); assert.equal(h.ghosts(),0); assert.equal(h.drag(),null);
    assert.equal(h.history.length,1);
  });
  test(prefix+'quick swipe abandons hold without preventing native scroll',()=>{
    const h=harness(filename); h.fingerDown(); assert.equal(h.move(10,30).prevented,false); h.hold();
    assert.equal(h.drag(),null); assert.equal(h.ghosts(),0); assert.equal(h.timers(),0);
  });
  test(prefix+'touchmove listener is nonpassive before a gesture starts',()=>{
    const h=harness(filename); const l=h.listeners.find(l=>l.name==='grid'&&l.type==='touchmove');
    assert.equal(l.options?.passive,false); assert.equal(h.drag(),null);
  });
  test(prefix+'small pre-hold movement permits scroll, active movement prevents it',()=>{
    const h=harness(filename); h.fingerDown(); assert.equal(h.move(12,12).prevented,false); h.hold();
    assert.equal(h.move().prevented,true); assert.equal(h.drag().latestPoint.clientX,300);
  });
  test(prefix+'genuine touchcancel clears active and pending gestures without reorder',()=>{
    for(const active of [false,true]) { const h=harness(filename); h.fingerDown(); if(active)h.hold(); h.cancel(); h.hold();
      assert.equal(h.drag(),null); assert.equal(h.ghosts(),0); assert.equal(h.history.length,0); }
  });
  test(prefix+'a second finger cancels pending and active gestures without blocking pinch',()=>{
    for(const active of [false,true]) { const h=harness(filename); h.fingerDown(); if(active)h.hold();
      const e=h.emit('window','touchstart',{touches:[h.touch(),h.touch(42)],changedTouches:[h.touch(42)]});
      h.hold(); assert.equal(e.prevented,false); assert.equal(h.drag(),null); assert.equal(h.ghosts(),0); }
  });
  test(prefix+'uncancelable scrolling never becomes or remains a held drag',()=>{
    for(const active of [false,true]) { const h=harness(filename); h.fingerDown(); if(active)h.hold();
      const e=h.move(12,12,{cancelable:false}); h.hold(); assert.equal(e.prevented,false); assert.equal(h.drag(),null); assert.equal(h.ghosts(),0); }
  });
  test(prefix+'touch owns only its identifier and ignores accompanying pointer movement/up',()=>{
    const h=harness(filename); h.fingerDown(); h.hold();
    h.emit('grid','pointermove',{clientX:300}); h.emit('window','pointerup');
    assert.ok(h.drag()?.active); assert.equal(h.drag().latestPoint.clientX,10);
    assert.equal(h.move(300,40,{changedTouches:[h.touch(999,300,40)],touches:[h.touch()]}).prevented,false);
    assert.equal(h.drag().latestPoint.clientX,10); h.cancel(999); assert.ok(h.drag()?.active); h.cancel();
  });
  test(prefix+'repeated touch reorders remain usable after edit and modal-style interruption',()=>{
    const h=harness(filename); h.fingerDown(); h.hold(); h.move(); h.end();
    assert.deepEqual(h.order(),['A','D','E','F','B','C']);
    h.nextGesture(); h.state.pages[4].rotation=90; h.state.pageRevision++;
    h.fingerDown(); h.hold(); h.emit('window','blur'); assert.equal(h.drag(),null); assert.equal(h.ghosts(),0);
    h.nextGesture(); h.fingerDown(); h.hold(); h.move(1,40); h.end();
    assert.deepEqual(h.order(),['B','C','A','D','E','F']); assert.equal(h.state.pages[0].rotation,90); assert.equal(h.ghosts(),0);
  });
  test(prefix+'editing cancels touch and a late end cannot restore an old snapshot',()=>{
    const h=harness(filename); h.fingerDown(); h.hold(); h.cancelEdit(); h.state.pages=h.state.pages.filter(p=>p.id!=='B'); h.state.pageRevision++;
    h.end(); assert.deepEqual(h.order(),['A','C','D','E','F']); assert.equal(h.ghosts(),0);
  });
  test(prefix+'compatibility mouse events cannot start a second drag immediately after touch',()=>{
    const h=harness(filename); h.fingerDown(); h.hold(); h.move(); h.end();
    h.emit('grid','pointerdown',{pointerType:'mouse',pointerId:1}); assert.equal(h.drag(),null);
    h.nextGesture(); h.emit('grid','pointerdown',{pointerType:'mouse',pointerId:1});
    h.emit('grid','pointermove',{pointerType:'mouse',pointerId:1,clientX:300}); assert.ok(h.drag()?.active);
    h.emit('window','pointerup',{pointerType:'mouse',pointerId:1}); assert.equal(h.drag(),null);
  });
  test(prefix+'active touch layout is not replaced by compatibility pointer events',()=>{
    const h=harness(filename); h.fingerDown(); h.hold(); const layout=h.layout(); assert.ok(layout);
    h.emit('grid','pointerdown',{pointerType:'mouse',pointerId:99}); assert.equal(h.layout(),layout);
  });
  test(prefix+'opening a modal before hold cancels the candidate, then closing permits a fresh gesture',()=>{
    const h=harness(filename); h.fingerDown(); h.doc.querySelector=()=>({open:true}); h.hold();
    assert.equal(h.drag(),null); assert.equal(h.ghosts(),0); h.doc.querySelector=()=>null;
    h.nextGesture(); h.fingerDown(); h.hold(); assert.ok(h.drag()?.active); h.cancel();
  });
  test(prefix+'visibility loss and Escape clear held touch previews',()=>{
    for(const type of ['visibilitychange','keydown']) { const h=harness(filename); h.fingerDown(); h.hold();
      if(type==='visibilitychange') { h.doc.hidden=true; h.emit('document',type); }
      else h.emit('window',type,{key:'Escape'});
      assert.equal(h.drag(),null); assert.equal(h.ghosts(),0); assert.equal(h.history.length,0);
    }
  });
  test(prefix+'stationary hold protects a later context menu retargeted outside the source card',()=>{
    for(const targetName of ['grid','body']) {
      const h=harness(filename);h.fingerDown();h.advance(209);assert.equal(h.drag().active,false);
      h.advance(1);assert.ok(h.drag().active);h.advance(1200);assert.ok(h.drag().active);
      const event=h.emit('document','contextmenu',{target:{nodeName:targetName,closest:()=>null}});
      assert.equal(event.prevented,true,'late native callout must be suppressed while the touch drag owns the gesture');
      assert.ok(h.drag().active);h.move();h.end();assert.deepEqual(h.order(),['A','D','E','F','B','C']);assert.equal(h.ghosts(),0);
    }
  });
  test(prefix+'active touch source stays hit-testable while the ghost stays transparent',()=>{
    const h=harness(filename);h.fingerDown();h.hold();
    assert.equal(h.doc.body.classList.contains('is-touch-sorting'),true);
    assert.match(h.source,/body\.is-touch-sorting \.page-card\.drag-source\s*\{[^}]*pointer-events:\s*auto/);
    assert.match(h.source,/\.pointer-drag-preview\s*\{[^}]*pointer-events:\s*none/);
    h.cancel();assert.equal(h.doc.body.classList.contains('is-touch-sorting'),false);assert.equal(h.ghosts(),0);
  });
  test(prefix+'unrelated native context menus remain available outside active touch dragging',()=>{
    const h=harness(filename),outside={closest:()=>null};
    assert.equal(h.emit('document','contextmenu',{target:outside}).prevented,false);
    h.fingerDown();assert.equal(h.emit('document','contextmenu',{target:outside}).prevented,false);h.cancel();
    h.nextGesture();h.emit('grid','pointerdown',{pointerType:'mouse'});h.emit('grid','pointermove',{pointerType:'mouse',clientX:300});
    assert.equal(h.emit('document','contextmenu',{target:outside}).prevented,false);
  });
  test(prefix+'mouse and pen still reorder through Pointer Events',()=>{
    for(const pointerType of ['mouse','pen']) { const h=harness(filename);
      h.emit('grid','pointerdown',{pointerType}); h.emit('grid','pointermove',{pointerType,clientX:300});
      assert.ok(h.drag()?.active); h.emit('window','pointerup',{pointerType}); assert.equal(h.drag(),null); assert.equal(h.history.length,1); }
  });
}
