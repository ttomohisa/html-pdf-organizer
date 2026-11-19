'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const app = pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href;

async function importPages(page, files, count) {
  await page.locator('#fileInput').setInputFiles(files);
  await page.waitForFunction(n => document.querySelectorAll('.page-card').length === n &&
    document.querySelector('#busyOverlay').hidden, count);
}

async function openSettings(page, mobile) {
  if (mobile) {
    await page.locator('.mobile-edit-dock').getByRole('button', { name: /その他|More/i }).click();
    await page.locator('.mobile-tools-dialog').getByRole('button', { name: /透かし|watermark/i }).click();
  } else {
    await page.locator('#watermarkButton').click();
  }
  await page.locator('#watermarkDialog[open]').waitFor();
}

async function savePdf(page, button) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(button).click()]);
  return fs.readFile(await download.path());
}

// Measure the actual colored glyphs, independent of the application's placement calculations.
function redBounds(canvas) {
  const { width, height } = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 18 || data[i] - data[i + 2] < 24) continue;
    const x = (i / 4) % width, y = Math.floor(i / 4 / width);
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return right < 0 ? null : [left / width, top / height, right / width, bottom / height];
}

async function exercise(browser, mobile) {
  const context = await browser.newContext({
    locale: mobile ? 'ja-JP' : 'en-US', hasTouch: mobile, isMobile: mobile, offline: true,
    viewport: mobile ? { width: 360, height: 740 } : { width: 1280, height: 800 }
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(app);
    await page.waitForSelector('#initialDropIcon svg');
    const fixture = await page.evaluate(async () => {
      const doc = await PDFLib.PDFDocument.create();
      const first = doc.addPage([540, 740]);
      first.setCropBox(36, 64, 468, 600);
      first.setRotation(PDFLib.degrees(90));
      // A grayscale original keeps subpixel text antialiasing out of the red-ink measurement.
      const sheet = document.createElement('canvas');
      sheet.width = 600; sheet.height = 468;
      const ctx = sheet.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 600, 468);
      ctx.fillStyle = '#343434';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText('Quarterly report', 36, 72);
      ctx.font = '19px sans-serif';
      ctx.fillText('Financial summary', 36, 125);
      for (let row = 0; row < 4; row++) {
        ctx.fillStyle = row % 2 ? '#ededed' : '#dbdbdb';
        ctx.fillRect(36, 149 + 40 * row, 528, 34);
      }
      const image = await doc.embedPng(sheet.toDataURL('image/png'));
      first.drawImage(image, { x: 504, y: 64, width: 600, height: 468, rotate: PDFLib.degrees(90) });
      doc.addPage([400, 550]).drawText('Notes', { x: 36, y: 470 });
      return Array.from(await doc.save());
    });
    await importPages(page, { name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from(fixture) }, 2);
    await openSettings(page, mobile);
    await page.locator('#watermarkEnabled').check();
    await page.locator('#watermarkText').fill('   ');
    await page.locator('#watermarkApply').click();
    assert.equal(await page.locator('#watermarkDialog').evaluate(el => el.open), true);
    assert.equal(await page.locator('#watermarkText').evaluate(el => el.validity.valid), false);
    await page.locator('#watermarkPresets button').first().click();
    await page.locator('#watermarkText').fill('山田様 配布用');
    await page.locator('#watermarkPlacement').selectOption('bottomRight');
    await page.locator('#watermarkColor').selectOption('#bf302f');
    await page.locator('#watermarkOpacity').press('End');
    await page.locator('#watermarkNext').click();
    await page.locator('#watermarkPreviewPage:not([hidden])').waitFor();
    await page.locator('#watermarkPrevious').click();
    await page.locator('#watermarkPreviewPage:not([hidden])').waitFor();
    const preview = await page.locator('#watermarkPreviewCanvas').evaluate(redBounds);
    assert.ok(preview && preview[0] > 0.6 && preview[1] > 0.75, 'Preview places the red text at the lower right');
    const fits = await page.locator('#watermarkDialog').evaluate(dialog => {
      const rect = dialog.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth + 1 && dialog.scrollWidth <= dialog.clientWidth + 1;
    });
    assert.ok(fits, 'Watermark form fits the viewport');
    if (process.env.PDF_ORGANIZER_SCREENSHOTS) {
      await fs.mkdir(process.env.PDF_ORGANIZER_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.PDF_ORGANIZER_SCREENSHOTS, mobile ? 'mobile.png' : 'desktop.png') });
    }
    await page.locator('#watermarkApply').click();
    await openSettings(page, mobile);
    await page.locator('#watermarkText').fill('Discard this edit');
    await page.locator('#watermarkCancel').click();
    await openSettings(page, mobile);
    assert.equal(await page.locator('#watermarkText').inputValue(), '山田様 配布用');
    await page.locator('#watermarkCancel').click();

    await page.locator('.page-card').first().click();
    const output = await savePdf(page, '#saveSelectedButton');
    const viewer = await context.newPage();
    await viewer.goto(app);
    await viewer.waitForSelector('#initialDropIcon svg');
    await importPages(viewer, { name: 'selected.pdf', mimeType: 'application/pdf', buffer: output }, 1);
    await viewer.locator('.page-card [data-action="preview"]').click();
    const rendered = viewer.locator('#previewCanvasHost .preview-content-frame canvas');
    await rendered.waitFor();
    const saved = await rendered.evaluate(redBounds);
    assert.ok(saved, 'Watermark is present in the re-opened PDF');
    saved.forEach((value, i) => assert.ok(Math.abs(value - preview[i]) < 0.025,
      'Preview ' + JSON.stringify(preview) + ' and exported bounds ' + JSON.stringify(saved) + ' must agree'));
    await openSettings(page, mobile);
    await page.locator('#watermarkEnabled').uncheck();
    await page.locator('#watermarkApply').click();
    assert.equal(await page.locator('#exportBar').evaluate(bar => bar.classList.contains('has-watermark')), false);
    if (!mobile) {
      await openSettings(page, false);
      await page.locator('#watermarkEnabled').check();
      await page.locator('#watermarkText').fill('Private recipient');
      await page.locator('#watermarkApply').click();
      await page.locator('#clearAllButton').click();
      await page.locator('#deleteConfirmApplyButton').click();
      await importPages(page, { name: 'new-workspace.pdf', mimeType: 'application/pdf', buffer: Buffer.from(fixture) }, 2);
      await openSettings(page, false);
      assert.equal(await page.locator('#watermarkEnabled').isChecked(), false);
      assert.notEqual(await page.locator('#watermarkText').inputValue(), 'Private recipient');
    }
    assert.deepEqual(errors, []);
    console.log('PASS offline watermark preview and export (' + (mobile ? 'mobile' : 'desktop') + ')');
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    await exercise(browser, false);
    await exercise(browser, true);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
