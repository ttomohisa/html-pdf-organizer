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
      showModal() { this.open = true; }, close() { this.open = false; }, focus() {},
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
  const optional = ['cancelPointerDrag', 'getSelectionEdgeOrder', 'canMoveSelectionToEdge', 'moveSelectionToEdge', 'askToDeleteAll', 'commitDeleteSelected', 'getWatermarkPlacement', 'drawPdfWatermark'];
  optional.push('getPdfJpegSize', 'inspectPdfJpeg', 'reencodePdfJpeg', 'compressPdfImages', 'formatBytes');
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
  vm.runInContext('const { PDFDocument, degrees } = PDFLib;\n' + [initial, helpers, 'let pointerDrag = null;', ...(source.includes('let pendingDeleteAction = null;') ? ['let pendingDeleteAction = null;'] : []), ...names.map(n => extract(source, n)), keyboard, layout, cancellations, controls, revisions,
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
  ctx.renderGrid = () => { vm.runInContext('releaseUnusedDocuments()', ctx); ctx.app.updateUiState(); };
  ctx.refreshSelectionUi = () => ctx.app.updateUiState();
  return { source, app: ctx.app, elements, logs, blobs, cleanup, document, Input, ctx,
    confirmDelete: () => { if (source.includes('let pendingDeleteAction = null;')) vm.runInContext('if (pendingDeleteAction) { const action = pendingDeleteAction; pendingDeleteAction = null; action(); }', ctx); },
    cancelDelete: () => { if (source.includes('let pendingDeleteAction = null;')) { vm.runInContext('pendingDeleteAction = null;', ctx); elements.deleteConfirmDialog.close(); } },
    key: e => listeners.keydown({ target: {}, preventDefault() {}, ctrlKey: false, metaKey: false, shiftKey: false, ...e }),
    cancel: name => name === 'visibilitychange' ? (document.hidden = true, listeners[name]()) : windowListeners[name]({ pointerId: 1, key: 'Escape', preventDefault() {} }),
    layout: (id, value) => elements.pagesGrid.handlers.change[0]({ target: { closest: () => ({ dataset: { imageLayout: id }, value }) } }) };
}
const sourceHasConfirmation = h => h.source.includes('let pendingDeleteAction = null;');
const order = h => Array.from(h.app.state.pages, p => p.pageIndex);
const selected = h => Array.from(h.app.state.selected);
// A 3-by-2 baseline RGB JPEG. A legal JPEG comment gives the source an extra 4 KiB.
const compactJpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAACAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJEAsJf/2Q==', 'base64');
const jpegWithComment = Buffer.concat([compactJpeg.subarray(0, 2), Buffer.from([255, 254, 16, 2]), Buffer.alloc(4096), compactJpeg.subarray(2)]);
for (const filename of targets) {
  const prefix = path.relative(root, filename) + ': ';
  test(prefix + 'compression preserves shared JPEG references, text, drawing commands and special image streams', async () => {
    const h = harness(filename), doc = await PDFLib.PDFDocument.create();
    const photo = await doc.embedJpg(Uint8Array.from(jpegWithComment));
    const special = await doc.embedJpg(Uint8Array.from(jpegWithComment));
    for (let i = 0; i < 2; i++) {
      const p = doc.addPage([320, 240]);
      p.drawText('Readable');
      p.drawImage(photo, { x: 25, y: 35, width: 60, height: 40 });
      p.drawImage(special);
    }
    await doc.flush();
    doc.context.lookup(special.ref).dict.set(PDFLib.PDFName.of('Decode'), doc.context.obj([0, 1, 0, 1, 0, 1]));
    const source = await doc.save();
    await h.app.addFiles([{name:'photos.pdf',type:'application/pdf',size:source.length,arrayBuffer:async()=>source.buffer}]);
    h.ctx.t = (key, values) => key === 'compressionResult' ? key + JSON.stringify(values) : key;
    // The browser tests exercise the real JPEG codec. Here we control its output to test PDF handling.
    let encodes = 0;
    h.ctx.reencodePdfJpeg = async () => { encodes++; return { bytes: new Uint8Array(compactJpeg), width: 3, height: 2 }; };
    const baseline = await output(h, 'compression-off');
    const baselineLength = h.blobs[0].size;
    h.blobs.length = 0;
    h.app.state.compressImages = true;
    const pdf = await output(h, 'compression-on');
    assert.ok(h.blobs[0].size < baselineLength, 'output file is smaller');
    assert.equal(encodes, 1, 'only the eligible shared image is encoded');
    assert.match(h.logs.at(-1)[0], /compressionResult/);
    const name = PDFLib.PDFName.of;
    for (let i = 0; i < pdf.getPageCount(); i++) {
      const p = pdf.getPage(i), original = baseline.getPage(i);
      assert.deepEqual(p.getSize(), original.getSize());
      const contents = page => page.node.Contents().asArray().map(ref => Buffer.from(page.doc.context.lookup(ref).getContents()));
      assert.deepEqual(contents(p), contents(original));
      const assets = page => page.node.Resources().lookup(name('XObject')).entries().map(([,ref]) => ref.toString());
      assert.deepEqual(assets(p), assets(original));
      for (const [,ref] of p.node.Resources().lookup(name('XObject')).entries()) {
        const stream = pdf.context.lookup(ref);
        const expected = stream.dict.has(name('Decode')) ? jpegWithComment : compactJpeg;
        assert.deepEqual(Buffer.from(stream.getContents()), expected);
        assert.equal(stream.dict.lookup(name('Length')).asNumber(), expected.length);
      }
    }
    for (const outcome of ['larger', 'failed']) {
      h.blobs.length = 0;
      h.ctx.reencodePdfJpeg = async () => {
        if (outcome === 'failed') throw new Error('Cannot decode');
        return { bytes: new Uint8Array(jpegWithComment.length + 1), width: 3, height: 2 };
      };
      const fallback = await output(h, 'compression-fallback');
      assert.equal(fallback.getPageCount(), 2);
      const images = fallback.getPage(0).node.Resources().lookup(name('XObject')).entries();
      for (const [,ref] of images) assert.deepEqual(Buffer.from(fallback.context.lookup(ref).getContents()), jpegWithComment);
      assert.match(h.logs.at(-1)[0], /compressionNoSavings/);
    }
  });

  test(prefix + 'JPEG decoder receives raw orientation and rejects split profiles and misleading dimensions', () => {
    const {ctx} = harness(filename);
    assert.equal(typeof ctx.inspectPdfJpeg, 'function');
    const app = (marker, data) => Buffer.concat([compactJpeg.subarray(0, 2),
      Buffer.from([255, marker, 0, data.length + 2]), data, compactJpeg.subarray(2)]);
    const exif = app(0xe1, Buffer.from('Exif\0\0II*\0', 'latin1'));
    assert.deepEqual(Buffer.concat(ctx.inspectPdfJpeg(exif, 3, 2).parts), compactJpeg);
    const icc = chunks => app(0xe2, Buffer.from('ICC_PROFILE\0\x01' + chunks + 'profile', 'latin1'));
    assert.equal(Buffer.from(ctx.inspectPdfJpeg(icc('\x01'), 3, 2).colorProfile).toString(), 'profile');
    assert.equal(ctx.inspectPdfJpeg(icc('\x02'), 3, 2), null);
    assert.equal(ctx.inspectPdfJpeg(compactJpeg, 3, 9), null);
    const giant = Buffer.from(compactJpeg);
    const pos = giant.indexOf(Buffer.from([255,192]));
    giant.writeUInt16BE(25000, pos + 5);
    giant.writeUInt16BE(24000, pos + 7);
    assert.equal(ctx.inspectPdfJpeg(giant, 24000, 25000), null);
  });
}
for (const filename of targets) {
  const prefix = path.relative(root, filename) + ': ';
  test(prefix + 'page range syntax validates every term before returning page indices', () => {
    const source = fs.readFileSync(filename, 'utf8');
    const context = vm.createContext({});
    vm.runInContext(extract(source, 'parsePageRanges'), context);
    const parse = (input, total = 12) => context.parsePageRanges(input, total);
    assert.deepEqual(Array.from(parse('１２、 ２－４ , 3')).sort((a, b) => a - b), [1, 2, 3, 11]);
    assert.deepEqual(Array.from(parse(' 1 ', 1)), [0]);
    assert.deepEqual(Array.from(parse('10 – 12')), [9, 10, 11]);
    for (const input of ['', '0', '-1', '4-2', '1,,2', '2-', '1,13', '1.5', '2 3', '1,', '1-999999999999999999999']) {
      assert.equal(parse(input), null, input);
    }
  });

  test(prefix + 'all and selected exports each add one shared watermark without accumulating marks', async () => {
    const h = await setup(filename, [1, 3]);
    // Browser text rasterization ends at this boundary. The actual PDF writer embeds the PNG.
    h.ctx.createWatermarkCanvas = () => ({
      width: 12, height: 16,
      toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAQCAIAAACtAwlQAAAAG0lEQVR4nGP8//8/AyHARFqKJRRQwMDAwMAArPAx3ZYoM8AAAAAElFTkSuQmCC'
    });
    const settings = { text: 'Draft', placement: 'diagonal', color: '#555555', opacity: 35 };
    for (const [selectedOnly, mark, pageCount] of [[false, settings, 4], [true, settings, 2], [false, null, 4]]) {
      h.app.state.watermark = mark;
      h.blobs.length = 0;
      const pdf = await output(h, 'watermark', selectedOnly);
      assert.equal(pdf.getPageCount(), pageCount);
      const resources = new Set();
      for (const page of pdf.getPages()) {
        const entries = page.node.Resources().lookup(PDFLib.PDFName.of('XObject'))?.entries() || [];
        assert.equal(entries.length, mark ? 1 : 0, 'one overlay per marked output page');
        for (const [, ref] of entries) resources.add(ref.toString());
      }
      assert.equal(resources.size, mark ? 1 : 0, 'reuse the same embedded image throughout an export');
    }
  });

  test(prefix + 'PDF watermark stays centered or padded inside the visible rotated page', () => {
    const { ctx } = harness(filename);
    assert.equal(typeof ctx.drawPdfWatermark, 'function');
    for (const [width, height] of [[600, 400], [2200, 20], [20, 2200]]) {
      const left = 40, bottom = -10;
      for (const rotation of [0, 90, 180, 270]) {
        const viewWidth = rotation % 180 ? height : width;
        const viewHeight = rotation % 180 ? width : height;
        const toView = (x, y) => {
          x -= left; y -= bottom;
          return { 0: [x, y], 90: [y, width - x], 180: [width - x, height - y], 270: [height - y, x] }[rotation];
        };
        for (const placement of ['diagonal', 'center', 'bottomRight']) {
          let opts;
          const page = {
            getRotation: () => ({angle: rotation}),
            getMediaBox: () => ({ x: left, y: bottom, width: width + 50, height: height + 50 }),
            getCropBox: () => ({ x: left - 50, y: bottom - 50, width: width + 50, height: height + 50 }),
            drawImage: (_mark, options) => { opts = options; }
          };
          ctx.drawPdfWatermark(page, { width: 280, height: 80 }, { placement, opacity: 37 });
          const angle = opts.rotate.angle * Math.PI / 180;
          const corners = [[0, 0], [opts.width, 0], [opts.width, opts.height], [0, opts.height]].map(([u, v]) =>
            toView(opts.x + u * Math.cos(angle) - v * Math.sin(angle), opts.y + u * Math.sin(angle) + v * Math.cos(angle)));
          assert.ok(corners.every(([x, y]) => x > 0 && y > 0 && x < viewWidth && y < viewHeight), 'all four corners visible');
          const cx = (corners[0][0] + corners[2][0]) / 2, cy = (corners[0][1] + corners[2][1]) / 2;
          if (placement === 'bottomRight') {
            assert.ok(cx > viewWidth / 2 && cy < viewHeight / 2);
          } else {
            assert.ok(Math.abs(cx - viewWidth / 2) < 0.00001 && Math.abs(cy - viewHeight / 2) < 0.00001);
          }
          const dx = corners[1][0] - corners[0][0], dy = corners[1][1] - corners[0][1];
          assert.ok(Math.abs(Math.atan2(dy, dx) * 180 / Math.PI - (placement === 'diagonal' ? 30 : 0)) < 0.00001);
          assert.equal(opts.opacity, 0.37);
        }
      }
    }
  });
}
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

// Source records must remain restorable for Undo/Redo, but must not accumulate forever.
for (const filename of targets) {
  const prefix = path.relative(root, filename) + ': ';
  test(prefix + 'reclaims source data only after the last history reference expires', async () => {
    const h = await setup(filename, []);
    const state = h.app.state;
    const docId = state.pages[0].docId;
    let disposed = 0;
    state.documents.get(docId).pdfjsDoc.destroy = () => { disposed += 1; };
    h.app.selectAll();
    h.app.deleteSelected();
    if (sourceHasConfirmation(h)) {
      assert.equal(state.pages.length, 4, 'All selected pages require confirmation');
      h.confirmDelete();
    }
    assert.equal(state.pages.length, 0);
    assert.equal(state.documents.has(docId), true, 'Undo still requires the source');
    h.app.undo();
    assert.equal(state.pages.length, 4);
    h.app.redo();
    assert.equal(state.documents.has(docId), true, 'Redo must not discard a restorable file');
    for (let index = 0; index < 65; index++) h.app.performEdit(() => { state.pages = []; });
    assert.equal(state.documents.has(docId), false, 'Evicted Undo history no longer holds the file');
    assert.equal(disposed, 1, 'PDF document is destroyed once');
  });
  test(prefix + 'busy operations cannot change page order, selection, settings or history', async () => {
    const h = await setup(filename, [1]);
    const state = h.app.state;
    const pageId = state.pages[1].id;
    const before = JSON.stringify({ pages: state.pages, selection: [...state.selected], history: state.history });
    h.app.setBusy(true);
    h.app.rotateSelected(90);
    h.app.deleteSelected();
    h.app.selectAll();
    h.app.clearSelection();
    h.app.performEdit(() => { state.pages = []; });
    h.layout(pageId, 'fill');
    h.elements.clearAllButton.click();
    assert.equal(JSON.stringify({ pages: state.pages, selection: [...state.selected], history: state.history }), before);
    assert.equal(h.elements.deleteButton.disabled, true);
    assert.equal(h.elements.filenameInput.disabled, true);
    h.app.setBusy(false);
    assert.equal(h.elements.filenameInput.disabled, false);
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

for (const filename of targets) {
  if (!fs.readFileSync(filename, 'utf8').includes('let pendingDeleteAction = null;')) continue;
  test(path.relative(root, filename) + ': deleting all selected pages is cancelable and undoable', async () => {
    const h = await setup(filename, []);
    h.app.selectAll();
    h.app.deleteSelected();
    assert.equal(h.app.state.pages.length, 4, 'Nothing is removed before confirmation');
    assert.equal(h.elements.deleteConfirmDialog.open, true, 'Confirmation dialog is displayed');
    h.cancelDelete();
    assert.equal(h.app.state.pages.length, 4, 'Cancel preserves all pages');
    h.app.deleteSelected();
    h.confirmDelete();
    assert.equal(h.app.state.pages.length, 0);
    h.app.undo();
    assert.equal(h.app.state.pages.length, 4, 'Deletion can be undone');
  });
}
