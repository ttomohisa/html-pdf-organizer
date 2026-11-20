'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const app = pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href;

async function downloadPdf(page, button) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(button).click()]);
  const bytes = await fs.readFile(await download.path());
  await page.locator('#busyOverlay').waitFor({ state: 'hidden' });
  return bytes;
}

async function fixtures(page) {
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2560;
    canvas.height = 1800;
    const ctx = canvas.getContext('2d', { alpha: false });
    const image = ctx.createImageData(canvas.width, canvas.height);
    let seed = 1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        const grain = (seed >>> 24) / 7;
        const offset = (y * canvas.width + x) * 4;
        image.data[offset] = 40 + grain + 140 * x / canvas.width;
        image.data[offset + 1] = 55 + grain + 125 * y / canvas.height;
        image.data[offset + 2] = 100 + grain + 60 * Math.sin(x / 120);
        image.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    const jpg = canvas.toDataURL('image/jpeg', 0.96);
    const doc = await PDFLib.PDFDocument.create();
    const first = doc.addPage([540, 780]);
    first.drawImage(await doc.embedJpg(jpg), { x: 20, y: 320, width: 500, height: 351.5625 });
    first.drawText('Searchable text stays in the PDF', { x: 30, y: 710 });
    const png = document.createElement('canvas');
    png.width = png.height = 50;
    const pngCtx = png.getContext('2d');
    pngCtx.fillStyle = 'rgba(30, 100, 60, .5)';
    pngCtx.fillRect(8, 8, 32, 32);
    const second = doc.addPage([420, 600]);
    second.drawText('Page with a transparent graphic', { x: 20, y: 540 });
    second.drawImage(await doc.embedPng(png.toDataURL()), { x: 40, y: 360, width: 100, height: 100 });
    return { jpg: jpg.split(',')[1], pdf: await doc.saveAsBase64() };
  });
}

async function inspectPdf(page, bytes) {
  return page.evaluate(async data => {
    const { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } = PDFLib;
    const pdf = await PDFDocument.load(data);
    const name = value => PDFName.of(value);
    const images = [];
    for (const [, object] of pdf.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFRawStream) || object.dict.get(name('Subtype')) !== name('Image')) continue;
      images.push({
        filter: object.dict.get(name('Filter'))?.toString(),
        width: Number(object.dict.get(name('Width')).toString()),
        height: Number(object.dict.get(name('Height')).toString()),
        bytes: object.getContentsSize()
      });
    }
    const pages = pdf.getPages().map(p => ({
      geometry: [p.getWidth(), p.getHeight(), p.getRotation().angle],
      operators: p.node.Contents().asArray().map(ref =>
        new TextDecoder().decode(decodePDFRawStream(pdf.context.lookup(ref)).decode())
      )
    }));
    return { images, pages };
  }, bytes.toString('base64'));
}

async function exerciseDesktop(browser) {
  const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1280, height: 800 }, offline: true });
  try {
    const page = await context.newPage();
    await page.goto(app);
    await page.locator('#initialDropIcon svg').waitFor();
    const source = await fixtures(page);
    await page.locator('#fileInput').setInputFiles([
      { name: 'with-image.pdf', mimeType: 'application/pdf', buffer: Buffer.from(source.pdf, 'base64') },
      { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(source.jpg, 'base64') }
    ]);
    await page.waitForFunction(() => document.querySelectorAll('.page-card').length === 3 && document.querySelector('#busyOverlay').hidden);
    const compression = page.locator('#imageCompressionButton');
    const settings = page.locator('#saveOptionsButton');
    await settings.waitFor({ timeout: 3000 });
    assert.equal(await compression.isVisible(), false, 'Save options stay tucked away until opened');
    assert.equal(await page.locator('#saveSelectedButton').isVisible(), false, 'Selection-specific save is hidden with no selection');
    assert.equal(await compression.getAttribute('aria-pressed'), 'false');
    const normal = await downloadPdf(page, '#saveAllButton');

    await settings.click();
    assert.equal(await settings.getAttribute('aria-expanded'), 'true');
    await compression.click();
    assert.equal(await compression.getAttribute('aria-pressed'), 'true');
    assert.match(await settings.getAttribute('aria-label'), /適用中/);
    await page.keyboard.press('Escape');
    assert.equal(await settings.getAttribute('aria-expanded'), 'false');
    assert.ok(await settings.evaluate(button => button === document.activeElement));
    await settings.click();
    await page.locator('#filenameInput').click();
    assert.equal(await settings.getAttribute('aria-expanded'), 'false');
    const compact = await downloadPdf(page, '#saveAllButton');
    assert.ok(compact.length < normal.length * .85, 'The high-resolution sample saves meaningful space');
    await page.locator('.toast-message').filter({ hasText: /→/ }).waitFor();
    const before = await inspectPdf(page, normal);
    const after = await inspectPdf(page, compact);
    const jpgs = pdf => pdf.images.filter(img => img.filter === '/DCTDecode');
    const otherImages = pdf => pdf.images.filter(img => img.filter !== '/DCTDecode');
    assert.equal(jpgs(before).length, 2);
    assert.equal(jpgs(after).length, 2);
    assert.ok(jpgs(after).every(img => img.width < 2560 && img.bytes < jpgs(before)[0].bytes));
    assert.deepEqual(otherImages(after), otherImages(before), 'Transparent PNG image data and mask remain intact');
    assert.deepEqual(after.pages, before.pages, 'Page geometry and every text/image drawing instruction stay intact');

    await page.locator('.page-card').nth(1).locator('.thumb-frame').click();
    const pngOnly = await downloadPdf(page, '#saveSelectedButton');
    const only = await inspectPdf(page, pngOnly);
    assert.equal(only.pages.length, 1);
    assert.deepEqual(only.images, otherImages(before), 'An unsupported-only selection still saves normally');
    console.log('PASS offline compression of imported JPEG and PDF JPEG, ' + normal.length + ' → ' + compact.length + ' bytes');
  } finally {
    await context.close();
  }
}

async function exerciseMobile(browser) {
  const context = await browser.newContext({
    locale: 'en-US', viewport: { width: 320, height: 650 }, hasTouch: true, isMobile: true, offline: true
  });
  try {
    const page = await context.newPage();
    await page.goto(app);
    await page.locator('#initialDropIcon svg').waitFor();
    const bytes = await page.evaluate(async () => {
      const doc = await PDFLib.PDFDocument.create();
      doc.addPage([300, 400]).drawText('A text-only page', { x: 15, y: 350, size: 12 });
      return doc.saveAsBase64();
    });
    await page.locator('#fileInput').setInputFiles({ name: 'text-only.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes, 'base64') });
    await page.waitForFunction(() => document.querySelector('.page-card') && document.querySelector('#busyOverlay').hidden);
    const compression = page.locator('#imageCompressionButton');
    assert.equal(await compression.isVisible(), false);
    const more = page.locator('.mobile-edit-dock').getByRole('button', { name: 'More actions' });
    await more.click();
    await page.locator('.mobile-tools-dialog').getByRole('button', { name: /compress images|image compression/i }).click();
    assert.equal(await compression.getAttribute('aria-pressed'), 'true');
    const saved = await inspectPdf(page, await downloadPdf(page, '#saveAllButton'));
    assert.equal(saved.pages.length, 1);
    assert.deepEqual(saved.images, []);
    await page.locator('.toast-message').filter({ hasText: /did not reduce/i }).waitFor();
    await more.click();
    const toggle = page.locator('.mobile-tools-dialog').getByRole('button', { name: /compress images|image compression/i });
    assert.match(await toggle.innerText(), /\(on\)/i);
    await toggle.click();
    assert.equal(await compression.getAttribute('aria-pressed'), 'false');
    console.log('PASS mobile compression toggle and text-only export');
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    await exerciseDesktop(browser);
    await exerciseMobile(browser);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
