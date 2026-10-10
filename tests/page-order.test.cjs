// Runs the real application controller and bundled pdf-lib without a browser.
// Only DOM rendering and the PDF.js loading boundary are adapted for Node.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const targets = process.env.PDF_ORGANIZER_HTML ? [path.resolve(process.env.PDF_ORGANIZER_HTML)] : [path.join(root, 'src/index.template.html'), path.join(root, 'pdf-organizer.html')];
const artifact = fs.readFileSync(process.env.PDF_ORGANIZER_BUNDLE || path.join(root, 'pdf-organizer.html'), 'utf8');
const pdfLibSource = zlib.gunzipSync(Buffer.from(artifact.match(/id="vendorPdfLibGzipBase64">([^<]+)<\/script>/)[1], 'base64')).toString();
const library = vm.createContext({ Uint8Array, ArrayBuffer, Array, Date, setTimeout });
vm.runInContext(pdfLibSource, library);
const PDFLib = library.PDFLib;
function extract(source, name) {
  const start = source.search(new RegExp('^    (?:async )?function ' + name + '\\(', 'm'));
  assert(start >= 0, 'Missing controller function: ' + name);
  return source.slice(start, source.indexOf('\n    }', start) + 6);
}
function eventBlock(source, marker) {
  const start = source.indexOf(marker);
  assert(start >= 0, marker);
  return source.slice(start, source.indexOf('\n    });', start) + 8);
}
function harness(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const logs = [], blobs = [], listeners = {}, windowListeners = {}, cleanup = [];
  const noop = () => {};
  function element() {
    const handlers = {};
    return { handlers, textContent: '', value: '', disabled: false, open: false, hidden: false, dataset: {}, style: {},
      classList: { add: noop, remove: noop, toggle: noop }, querySelector: () => null, querySelectorAll: () => [],
      setAttribute: noop, append: noop, remove: noop, addEventListener: (name, fn) => { (handlers[name] ||= []).push(fn); },
      click() { if (!this.disabled) for (const fn of handlers.click || []) fn({}); } };
  }
  const elements = new Proxy({}, { get: (o, key) => o[key] ||= element() });
  class Input {} class Textarea {}
  const document = { body: element(), documentElement: element(), hidden: false, createElement: element,
    querySelector: selector => selector === 'dialog[open]' ? Object.values(elements).find(e => e.open) || null : null,
    querySelectorAll: () => [], addEventListener: (name, fn) => { listeners[name] = fn; } };
  const ctx = vm.createContext({ console, Uint8Array, ArrayBuffer, Blob, Map, Set, Date, crypto: crypto.webcrypto,
    HTMLInputElement: Input, HTMLTextAreaElement: Textarea, document, elements,
    window: { PDFLib, matchMedia: () => ({ matches: false }), addEventListener: (name, fn) => { windowListeners[name] = fn; } },
    URL: { createObjectURL: b => { blobs.push(b); return 'blob:synthetic'; }, revokeObjectURL: noop },
    setTimeout: () => 0, clearTimeout: id => cleanup.push(['timer', id]), requestAnimationFrame: noop,
    renderGrid: noop, refreshSelectionUi: noop, updateOutputPasswordUi: noop, updatePreviewUi: noop,
    t: key => key, showToast: (...args) => logs.push(args), movePreview: noop,
    cleanupDragVisuals: () => cleanup.push(['visuals']), createPointerDragPreview: () => ({ style: {} }), requestPointerDragFrame: noop,
    loadPdfForEditing: async buffer => ({ buffer, pdfjsDoc: { numPages: (await PDFLib.PDFDocument.load(new Uint8Array(buffer))).getPageCount() } })
  });
  const names = ['setBusy', 'pushHistory', 'performEdit', 'reconcileSelection', 'undo', 'redo', 'selectPage', 'ensureTargetSelected', 'rotateSelected', 'deleteSelected', 'selectAll', 'clearSelection', 'addFiles', 'beginPointerDrag', 'finishPointerDrag', 'exportPdf', 'sanitizeFilename', 'updateUiState'];
  const optional = ['cancelPointerDrag', 'getSelectionEdgeOrder', 'canMoveSelectionToEdge', 'moveSelectionToEdge'];
  for (const name of optional) if (source.includes('function ' + name + '(')) names.push(name);
  const initial = source.slice(source.indexOf('    const state = {'), source.indexOf('    function setIcon'));
  const helpers = source.slice(source.indexOf('    const makeId = '), source.indexOf('    const A4_WIDTH = '));
  const keyboard = eventBlock(source, '    document.addEventListener("keydown", (event) => {');
  const layout = eventBlock(source, '    elements.pagesGrid.addEventListener("change", (event) => {');
  const cancellations = source.slice(source.indexOf('    window.addEventListener("pointercancel"'), source.indexOf('    elements.pagesGrid.addEventListener("mousedown"'));
  const revisionStart = source.indexOf('      // Keep a monotonic edit revision');
  const revisions = '{\n' + source.slice(revisionStart, source.indexOf('      const originalShowToast', revisionStart)) + '\n}';
  const controlsStart = source.indexOf('    elements.selectAllButton.addEventListener("click"');
  const controls = source.slice(controlsStart, source.indexOf('    elements.saveSelectedButton.addEventListener', controlsStart));
  vm.runInContext(pdfLibSource, ctx);
  vm.runInContext('const { PDFDocument, degrees } = PDFLib;\n' + [initial, helpers, 'let pointerDrag = null;', ...names.map(n => extract(source, n)), keyboard, layout, cancellations, controls, revisions,
    `globalThis.app = { state, setBusy, updateUiState, addFiles, selectPage, selectAll, clearSelection, rotateSelected, deleteSelected, undo, redo, exportPdf, beginPointerDrag, finishPointerDrag, performEdit, pushHistory,
      moveSelectionToEdge: typeof moveSelectionToEdge === 'function' ? moveSelectionToEdge : null,
      drag: () => pointerDrag,
      restoreDrag: drag => { pointerDrag = drag; },
      startDrag(id, dropIndex, active = true) {
        pointerDrag = { active: false, card: { setPointerCapture() {}, releasePointerCapture() {} }, pageId: id, pointerId: 1, pointerType: 'mouse', activationTimer: 7 };
        if (active) beginPointerDrag({ pointerId: 1, clientX: 1, clientY: 1 });
        pointerDrag.dropIndex = dropIndex;
      }
    };`].join('\n'), ctx);
  ctx.renderGrid = () => ctx.app.updateUiState();
  ctx.refreshSelectionUi = () => ctx.app.updateUiState();
  return { source, app: ctx.app, elements, logs, blobs, cleanup, document, Input,
    key: e => listeners.keydown({ target: {}, preventDefault() {}, ctrlKey: false, metaKey: false, shiftKey: false, ...e }),
    cancel: name => name === 'visibilitychange' ? (document.hidden = true, listeners[name]()) : windowListeners[name]({ pointerId: 1, key: 'Escape', preventDefault() {} }),
    layout: (id, value) => elements.pagesGrid.handlers.change[0]({ target: { closest: () => ({ dataset: { imageLayout: id }, value }) } }) };
}
const order = h => Array.from(h.app.state.pages, p => p.pageIndex);
const selected = h => Array.from(h.app.state.selected);
let fixturePromise;
async function fixture() {
  fixturePromise ||= (async () => {
    const doc = await PDFLib.PDFDocument.create();
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    for (const label of ['A', 'B', 'C', 'D']) { const p = doc.addPage([320, 240]); p.drawText('SYNTHETIC PAGE ' + label, { x: 20, y: 120, size: 24, font }); }
    doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));
    doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
    return doc.save();
  })();
  return fixturePromise;
}
async function setup(filename, indexes = [1]) {
  const h = harness(filename), bytes = await fixture();
  await h.app.addFiles([{ name: 'synthetic-four-pages.pdf', type: 'application/pdf', size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }]);
  for (const i of indexes) h.app.selectPage(h.app.state.pages[i].id, { ctrlKey: true });
  return h;
}
async function output(h, label, selectedOnly = false) {
  await h.app.exportPdf(selectedOnly);
  assert.equal(h.blobs.length, 1, JSON.stringify(h.logs));
  const bytes = Buffer.from(await h.blobs[0].arrayBuffer());
  if (process.env.PDF_ORGANIZER_EXPORT_DIR) {
    fs.mkdirSync(process.env.PDF_ORGANIZER_EXPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.PDF_ORGANIZER_EXPORT_DIR, path.basename(h.filename || 'source') + '-' + label + '.pdf'), bytes);
  }
  return PDFLib.PDFDocument.load(bytes);
}
for (const filename of targets) {
  const prefix = path.relative(root, filename) + ': ';
  test(prefix + 'baseline drag reorder, no-op drop, delete, undo and redo', async () => {
    let h = await setup(filename);
    h.app.startDrag(h.app.state.pages[1].id, 3); h.app.finishPointerDrag({}, false);
    assert.deepEqual(order(h), [0, 2, 3, 1]);
    const history = h.app.state.history.length;
    h.app.startDrag(h.app.state.pages[3].id, 3); h.app.finishPointerDrag({}, false);
    assert.equal(h.app.state.history.length, history);
    h.app.undo(); assert.deepEqual(order(h), [0, 1, 2, 3]);
    h.app.redo(); assert.deepEqual(order(h), [0, 2, 3, 1]);
    h.key({ key: 'Delete' }); assert.deepEqual(order(h), [0, 2, 3]);
    h.filename = filename;
    const pdf = await output(h, 'delete-control'); assert.equal(pdf.getPageCount(), 3);
  });
  test(prefix + 'baseline editing fields and busy state exclude Delete shortcut', async () => {
    const h = await setup(filename);
    h.key({ key: 'Delete', target: new h.Input }); assert.deepEqual(order(h), [0, 1, 2, 3]);
    h.app.setBusy(true); h.key({ key: 'Delete' }); assert.deepEqual(order(h), [0, 1, 2, 3]);
  });
}

for (const filename of targets) {
  const prefix = path.relative(root, filename) + ': ';
  test(prefix + 'moves a noncontiguous selection in current page order and preserves metadata', async () => {
    const h = await setup(filename, [3, 1]);
    assert.equal(typeof h.app.moveSelectionToEdge, 'function');
    const state = h.app.state, ids = selected(h), anchor = state.lastSelectedId;
    state.pages[1].rotation = 90; state.pages[3].imageLayout = 'fill';
    const before = JSON.stringify(state.pages), docs = state.documents, history = state.history.length;
    h.elements.moveStartButton.click();
    assert.deepEqual(order(h), [1, 3, 0, 2]);
    assert.deepEqual(selected(h), ids); assert.equal(state.lastSelectedId, anchor); assert.equal(state.documents, docs);
    assert.equal(state.pages[0].rotation, 90); assert.equal(state.pages[1].imageLayout, 'fill');
    assert.equal(state.history.length, history + 1);
    assert.equal(h.elements.moveStartButton.disabled, true); assert.equal(h.elements.moveEndButton.disabled, false);
    h.app.undo(); assert.equal(JSON.stringify(state.pages), before);
    h.app.redo(); assert.deepEqual(order(h), [1, 3, 0, 2]);
    h.elements.moveEndButton.click(); assert.deepEqual(order(h), [0, 2, 1, 3]);
    assert.deepEqual(selected(h), ids); assert.equal(state.lastSelectedId, anchor);
    assert.equal(h.elements.moveEndButton.disabled, true);
    h.filename = filename;
    const pdf = await output(h, 'move-end');
    assert.equal(pdf.getPageCount(), 4); assert.equal(pdf.getPages()[2].getRotation().angle, 90);
  });
  test(prefix + 'empty, all-selected, already-at-edge and busy moves create no history', async () => {
    const h = await setup(filename, []);
    assert.equal(typeof h.app.moveSelectionToEdge, 'function');
    for (const mode of ['empty', 'all', 'prefix', 'suffix', 'busy', 'invalid']) {
      h.app.clearSelection();
      if (mode === 'all') h.app.selectAll();
      if (mode === 'prefix') { h.app.selectPage(h.app.state.pages[0].id, { ctrlKey: true }); h.app.selectPage(h.app.state.pages[1].id, { ctrlKey: true }); }
      if (mode === 'suffix') h.app.selectPage(h.app.state.pages[3].id);
      if (mode === 'busy' || mode === 'invalid') h.app.selectPage(h.app.state.pages[1].id);
      if (mode === 'busy') h.app.setBusy(true);
      const before = JSON.stringify(h.app.state.pages), history = h.app.state.history.length;
      h.app.state.future.push([{ id: 'redo-sentinel' }]); const future = h.app.state.future.length;
      const edge = mode === 'suffix' ? 'end' : mode === 'invalid' ? 'middle' : 'start';
      h.app.moveSelectionToEdge(edge);
      assert.equal(JSON.stringify(h.app.state.pages), before, mode);
      assert.equal(h.app.state.history.length, history, mode); assert.equal(h.app.state.future.length, future, mode);
      if (mode !== 'invalid') assert.equal(h.elements[edge === 'end' ? 'moveEndButton' : 'moveStartButton'].disabled, true, mode);
      h.app.setBusy(false);
    }
  });
  test(prefix + 'Delete accepted during drag stays deleted after drop and exports only survivors', async () => {
    const h = await setup(filename, [1, 3]);
    const history = h.app.state.history.length;
    h.app.startDrag(h.app.state.pages[1].id, 2);
    h.key({ key: 'Delete' });
    assert.deepEqual(order(h), [0, 2]);
    assert.equal(h.app.drag(), null, 'accepted edit cancels active drag immediately');
    h.app.finishPointerDrag({}, false);
    assert.deepEqual(order(h), [0, 2]); assert.equal(h.app.state.history.length, history + 1);
    assert.deepEqual(selected(h), []); assert.equal(h.app.state.lastSelectedId, null);
    assert(h.cleanup.some(x => x[0] === 'timer')); assert(h.cleanup.some(x => x[0] === 'visuals'));
    h.filename = filename;
    const pdf = await output(h, 'drag-delete'); assert.equal(pdf.getPageCount(), 2);
    h.app.undo(); assert.deepEqual(order(h), [0, 1, 2, 3]);
    h.app.redo(); assert.deepEqual(order(h), [0, 2]);
  });
  test(prefix + 'rotation, image layout, undo and redo cancel drag without overwriting newer edits', async () => {
    for (const operation of ['rotation', 'layout', 'undo', 'redo']) {
      const h = await setup(filename);
      h.app.rotateSelected(90);
      if (operation === 'redo') h.app.undo();
      const id = h.app.state.pages[1].id;
      h.app.startDrag(id, 3);
      if (operation === 'rotation') h.app.rotateSelected(90);
      if (operation === 'layout') h.layout(id, 'original');
      if (operation === 'undo') h.key({ key: 'z', ctrlKey: true });
      if (operation === 'redo') h.elements.redoButton.click();
      const before = JSON.stringify(h.app.state.pages), history = h.app.state.history.length;
      assert.equal(h.app.drag(), null, operation);
      h.app.finishPointerDrag({}, false);
      assert.equal(JSON.stringify(h.app.state.pages), before, operation); assert.equal(h.app.state.history.length, history, operation);
      assert.equal(h.app.state.pages[1].rotation, operation === 'rotation' ? 180 : operation === 'undo' ? 0 : 90);
      if (operation === 'layout') assert.equal(h.app.state.pages[1].imageLayout, 'original');
    }
  });
  test(prefix + 'a stale drop cannot restore pages even if an old drag callback survives', async () => {
    const h = await setup(filename);
    h.app.startDrag(h.app.state.pages[1].id, 3); const oldDrag = h.app.drag();
    h.key({ key: 'Delete' }); const history = h.app.state.history.length;
    h.app.restoreDrag(oldDrag); h.app.finishPointerDrag({}, false);
    assert.deepEqual(order(h), [0, 2, 3]); assert.equal(h.app.state.history.length, history);
  });
  test(prefix + 'moves and busy import/export invalidate active and pending touch drags', async () => {
    for (const active of [true, false]) {
      const h = await setup(filename);
      assert.equal(typeof h.app.moveSelectionToEdge, 'function');
      h.app.startDrag(h.app.state.pages[1].id, 3, active); h.app.moveSelectionToEdge('start');
      assert.equal(h.app.drag(), null); h.app.finishPointerDrag({}, false); assert.deepEqual(order(h), [1, 0, 2, 3]);
      h.app.startDrag(h.app.state.pages[0].id, 3, active); h.app.setBusy(true);
      assert.equal(h.app.drag(), null); assert.equal(h.elements.moveStartButton.disabled, true); assert.equal(h.elements.moveEndButton.disabled, true);
      h.app.finishPointerDrag({}, false); assert.deepEqual(order(h), [1, 0, 2, 3]);
    }
  });
  test(prefix + 'pointercancel, Escape, blur and hidden-document cleanup leave history untouched', async () => {
    for (const event of ['pointercancel', 'keydown', 'blur', 'visibilitychange']) {
      const h = await setup(filename); const history = h.app.state.history.length;
      h.app.startDrag(h.app.state.pages[1].id, 3); h.cancel(event);
      assert.equal(h.app.drag(), null, event); assert.deepEqual(order(h), [0, 1, 2, 3]); assert.equal(h.app.state.history.length, history);
    }
  });
  test(prefix + 'toolbar and mobile More have localized, accessible move controls', () => {
    const source = fs.readFileSync(filename, 'utf8');
    for (const [id, key] of [['moveStartButton', 'moveSelectionStart'], ['moveEndButton', 'moveSelectionEnd']]) {
      assert.match(source, new RegExp('<button[^>]*id="' + id + '"[^>]*data-i18n-aria-label="' + key + '"'));
      assert.match(source, new RegExp('createMobileTool\\(elements\\.' + id + ', icons\\.move(?:Start|End), t\\("' + key + '"\\)\\)'));
    }
    assert.match(source, /moveSelectionStart: "Move selection to start"/);
    assert.match(source, /moveSelectionEnd: "Move selection to end"/);
    assert.match(source, /moveSelectionStart: "選択ページを先頭へ"/);
    assert.match(source, /moveSelectionEnd: "選択ページを末尾へ"/);
  });
}

// Any modal must leave the background editor untouched; browser geometry/focus is checked separately.
for (const filename of targets) {
  test(path.relative(root, filename) + ': native modal dialogs block background editing shortcuts', async () => {
    for (const dialog of ['helpDialog', 'passwordDialog', 'outputPasswordDialog', 'mobileToolsDialog']) {
      for (const event of [{key:'Delete'}, {key:'Backspace'}, {key:'a',ctrlKey:true}, {key:'z',ctrlKey:true}, {key:'Escape'}]) {
        const h = await setup(filename);
        h.app.rotateSelected(90);
        h.elements[dialog].open = true;
        const before = JSON.stringify({pages:h.app.state.pages, selected:selected(h), history:h.app.state.history});
        let prevented = false;
        h.key({...event, preventDefault(){prevented=true;}});
        assert.equal(JSON.stringify({pages:h.app.state.pages, selected:selected(h), history:h.app.state.history}), before, `${dialog}: ${event.key} must not edit behind a modal`);
        assert.equal(prevented, false, `${dialog}: native modal keyboard behavior remains available`);
      }
    }
  });
}
