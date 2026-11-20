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
    await page.locator('#saveOptionsButton').click();
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
    viewport: mobile ? { width: 320, height: 650 } : { width: 1280, height: 800 }
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
    assert.equal(await page.locator('#workspace h2').count(), 0, 'Workspace has no redundant heading');
    assert.equal(await page.locator('#addButton').isVisible(), !mobile, 'Toolbar Add files is desktop-only');
    if (mobile) {
      await page.locator('.mobile-edit-dock').getByRole('button', { name: /その他|More/i }).click();
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.locator('.mobile-tools-dialog').getByRole('button', { name: /ファイルを追加|Add files/i }).click()
      ]);
      assert.ok(chooser.isMultiple(), 'More still opens the regular file picker');
    }
    const password = page.locator('#outputPasswordButton');
    if (mobile) {
      const passwordBox = await password.boundingBox();
      await page.mouse.move(passwordBox.x + passwordBox.width / 2, passwordBox.y + passwordBox.height / 2);
      await page.mouse.down();
      await password.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
      const pressedBox = await password.boundingBox();
      await page.mouse.up();
      assert.ok(Math.abs(pressedBox.y - passwordBox.y) < 0.5, 'Pressing the password button keeps it centered');
    } else {
      assert.equal(await password.isVisible(), false, 'Desktop password settings are grouped with save settings');
      await page.locator('#saveOptionsButton').click();
      await page.locator('#saveOptionsPasswordButton').click();
      assert.equal(await page.locator('#saveOptionsPanel').isVisible(), false);
    }
    await page.locator('#outputPasswordDialog[open]').waitFor();
    await page.locator('#outputPasswordEnabled').check();
    await page.locator('#outputPasswordInput').fill('Unapplied draft');
    if (mobile) await page.touchscreen.tap(2, 2);
    else await page.mouse.click(2, 2);
    await page.locator('#outputPasswordDialog').waitFor({ state: 'hidden', timeout: 3000 });
    if (mobile) await password.click();
    else {
      await page.locator('#saveOptionsButton').click();
      await page.locator('#saveOptionsPasswordButton').click();
    }
    assert.equal(await page.locator('#outputPasswordEnabled').isChecked(), false);
    assert.equal(await page.locator('#outputPasswordInput').inputValue(), '');
    await page.keyboard.press('Escape');
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
    const saveAll = page.locator('#saveAllButton');
    const watermarkButton = page.locator('#watermarkButton');
    assert.match((await saveAll.innerText()).trim(), /^(すべて保存|Save all)$/);
    assert.match(await watermarkButton.getAttribute('aria-label'), /透かし|Watermark/);
    assert.equal(await watermarkButton.isVisible(), false, 'The stamp button stays off the save bar');
    const cardMarks = page.locator('.thumb-frame .thumbnail-watermark-layer');
    await cardMarks.first().waitFor({ timeout: 3000 });
    await page.waitForFunction(() => document.querySelectorAll('.thumbnail-watermark-layer').length === 2);
    const cardMark = await cardMarks.first().evaluate(redBounds);
    assert.ok(cardMark, 'The card contains the applied watermark');
    cardMark.forEach((value, i) => assert.ok(Math.abs(value - preview[i]) < 0.04, 'The card and preview agree'));
    assert.ok(await cardMarks.first().evaluate(layer => {
      const page = layer.previousElementSibling.getBoundingClientRect();
      const mark = layer.getBoundingClientRect();
      return Math.abs(page.x - mark.x) < 1 && Math.abs(page.y - mark.y) < 1 &&
        Math.abs(page.width - mark.width) < 1 && Math.abs(page.height - mark.height) < 1;
    }), 'The watermark aligns to the page on the card');
    await openSettings(page, mobile);
    await page.locator('#watermarkText').fill('Discard this edit');
    await page.locator('#watermarkCancel').click();
    await openSettings(page, mobile);
    assert.equal(await page.locator('#watermarkText').inputValue(), '山田様 配布用');
    await page.locator('#watermarkText').fill('Discard this too');
    await page.mouse.click(2, 2);
    await page.locator('#watermarkDialog').waitFor({ state: 'hidden', timeout: 3000 });
    await openSettings(page, mobile);
    assert.equal(await page.locator('#watermarkText').inputValue(), '山田様 配布用');
    await page.locator('#watermarkCancel').click();
    assert.deepEqual(await cardMarks.first().evaluate(redBounds), cardMark, 'Unapplied edits leave the card unchanged');

    await page.locator('.page-card [data-action="preview"]').first().click();
    const watermarkLayer = page.locator('.preview-content-frame canvas.preview-watermark-layer');
    await watermarkLayer.waitFor({ timeout: 5000 });
    const actual = await watermarkLayer.evaluate(redBounds);
    assert.ok(actual, 'The normal page preview contains the applied watermark');
    actual.forEach((value, i) => assert.ok(Math.abs(value - preview[i]) < 0.025, 'Both previews agree'));
    await page.locator('#previewZoomInButton').click();
    assert.equal(await page.locator('#previewZoomResetButton').textContent(), '125%');
    assert.ok(await watermarkLayer.evaluate(layer => {
      const canvas = layer.previousElementSibling.getBoundingClientRect();
      const overlay = layer.getBoundingClientRect();
      return Math.abs(overlay.width - canvas.width) < 1 && Math.abs(overlay.height - canvas.height) < 1;
    }), 'The watermark zooms with the page');
    await page.locator('#previewNextButton').click();
    await page.locator('#previewCanvasHost:not([hidden]) .preview-watermark-layer').waitFor();
    assert.ok(await watermarkLayer.evaluate(redBounds), 'The next page also has a watermark');
    await page.locator('#closePreviewButton').click();

    await page.locator('.page-card').first().click();
    assert.ok(await page.locator('#exportBar').evaluate(bar => bar.scrollWidth <= bar.clientWidth + 1),
      'Save controls fit with a selection and the watermark enabled');
    if (mobile && process.env.PDF_ORGANIZER_SCREENSHOTS) {
      await page.screenshot({ path: path.join(process.env.PDF_ORGANIZER_SCREENSHOTS, 'mobile-workspace.png') });
    }
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
    assert.equal(await watermarkButton.isVisible(), false);
    const watermarkEntry = mobile
      ? page.locator('.mobile-edit-dock').getByRole('button', { name: /その他|More/i })
      : page.locator('#saveOptionsButton');
    assert.ok(await watermarkEntry.evaluate(el => el === document.activeElement), 'Closing the dialog restores focus');
    assert.equal(await watermarkButton.evaluate(button => button.classList.contains('is-active')), false);
    assert.equal(await cardMarks.count(), 0, 'Turning off the watermark clears the cards');
    await page.locator('.page-card [data-action="preview"]').first().click();
    await page.locator('#previewCanvasHost:not([hidden]) .preview-content-frame canvas').waitFor();
    assert.equal(await watermarkLayer.count(), 0, 'Turning off the watermark also clears it from the normal preview');
    await page.locator('#closePreviewButton').click();
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
