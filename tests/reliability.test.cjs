'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const targets = process.env.PDF_ORGANIZER_HTML
  ? [path.resolve(process.env.PDF_ORGANIZER_HTML)]
  : [path.join(root, 'src/index.template.html'), path.join(root, 'pdf-organizer.html')];

function functionSource(source, name) {
  const start = source.search(new RegExp('^    function ' + name + '\\(', 'm'));
  assert(start >= 0, 'Missing application function ' + name);
  const end = source.indexOf('\n    }', start);
  assert(end > start, 'Unterminated application function ' + name);
  return source.slice(start, end + 6);
}

function pptxFixture(source) {
  const colorStart = source.indexOf('    const pptxCssColor = ');
  assert(colorStart >= 0);
  const colorEnd = source.indexOf('\n    };', colorStart);
  assert(colorEnd > colorStart);
  const context = vm.createContext({
    rgb: (r, g, b) => ({ r, g, b }),
    getComputedStyle: (element) => element.style,
  });
  const code = [
    'const PPTX_POINT_SCALE = 72 / 96;',
    source.slice(colorStart, colorEnd + 7),
    functionSource(source, 'pptxVectorPathIsOpaque'),
    functionSource(source, 'addPptxVectorOverlay'),
    'globalThis.overlay = addPptxVectorOverlay;'
  ].join('\n');
  vm.runInContext(code, context);

  function makePath(color = 'rgb(255, 0, 0)', options = {}) {
    const slide = { style: { opacity: '1', filter: 'none', mixBlendMode: 'normal' },
      parentElement: null, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    const svg = { style: { opacity: options.parentOpacity || '1', filter: 'none', mixBlendMode: 'normal' },
      parentElement: slide, viewBox: { baseVal: { x: 0, y: 0, width: 100, height: 100 } },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      querySelector: () => null };
    const element = {
      parentElement: svg,
      style: { fill: color, stroke: 'none', opacity: '1', fillOpacity: options.fillOpacity || '1',
        strokeOpacity: '1', mixBlendMode: 'normal', filter: 'none', strokeWidth: '0' },
      closest: (selector) => selector === 'svg' ? svg : null,
      hasAttribute: () => false,
      getAttribute: () => 'M0 0 L10 0 L10 10 Z',
    };
    slide.querySelectorAll = () => [element];
    return { slide, path: element };
  }
  return { overlay: context.overlay, makePath };
}

for (const filename of targets) {
  const title = path.relative(root, filename) + ': ';
  const source = fs.readFileSync(filename, 'utf8');

  test(title + 'PPTX vector overlay keeps fully opaque basic shapes', () => {
    const { overlay, makePath } = pptxFixture(source);
    const { slide } = makePath();
    const calls = [];
    overlay({ drawSvgPath: (d, options) => calls.push({ d, options }) }, slide, 400);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.opacity, 1);
  });

  test(title + 'PPTX vector overlay does not double-paint alpha or overlapping shapes', () => {
    const { overlay, makePath } = pptxFixture(source);
    for (const [color, options] of [
      ['rgba(255, 0, 0, 0.5)', {}],
      ['rgb(255, 0, 0)', { fillOpacity: '0.5' }],
      ['rgb(255, 0, 0)', { parentOpacity: '0.5' }],
    ]) {
      const { slide, path: transparentPath } = makePath(color, options);
      const opaque = makePath().path;
      opaque.parentElement = transparentPath.parentElement;
      slide.querySelectorAll = () => [opaque, transparentPath];
      const calls = [];
      overlay({ drawSvgPath: (d, opts) => calls.push({ d, opts }) }, slide, 400);
      assert.equal(calls.length, 0, 'Skip all overlays if transparency would change layer compositing');
    }
  });

  test(title + 'failed thumbnails display a retry control without modifying page data', () => {
    const children = [];
    function element() {
      return {
        children: [], dataset: {}, style: {}, textContent: '', isConnected: true, handlers: {},
        setAttribute() {}, append(...items) { this.children.push(...items); },
        replaceChildren(...items) { this.children = items; },
        addEventListener(type, handler) { this.handlers[type] = handler; },
      };
    }
    const frame = element();
    frame.dataset.rendered = '';
    const state = { pages: [{ id: 'test-page' }], isBusy: false };
    const queue = [];
    const context = vm.createContext({
      state,
      elements: { pagesGrid: { querySelector: () => frame } },
      CSS: { escape: (value) => value },
      document: { createElement: element },
      enqueueThumbnail: (id) => queue.push(id),
      t: (key) => key,
      console: { warn() {} },
    });
    vm.runInContext(functionSource(source, 'showThumbnailError'), context);
    vm.runInContext('showThumbnailError("test-page", new Error("render failed"));', context);
    assert.equal(frame.dataset.rendered, 'error');
    const wrapper = frame.children[0];
    const retry = wrapper.children[1];
    assert.equal(retry.textContent, 'thumbnailRetry');
    const event = { preventDefault() {}, stopPropagation() {} };
    state.isBusy = true;
    retry.handlers.click(event);
    assert.deepEqual(queue, [], 'retry is blocked during export');
    state.isBusy = false;
    retry.handlers.click(event);
    assert.deepEqual(queue, ['test-page']);
    assert.equal(frame.dataset.rendered, '');
    assert.equal(state.pages.length, 1);
  });
}
