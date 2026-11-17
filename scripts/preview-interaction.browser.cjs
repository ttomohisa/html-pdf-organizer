// Browser-level confirmation, pinch zoom, responsive layout and mobile header checks.
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

function fixture() {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAwAAAAQCAIAAACtAwlQAAAAG0lEQVR4nGP8//8/AyHARFqKJRRQwMDAwMAArPAx3ZYoM8AAAAAElFTkSuQmCC', 'base64');
  return Array.from({ length: 12 }, (_, index) => ({
    name: `page-${index+1}.png`, mimeType: 'image/png', buffer: png
  }));
}

async function exercise(browser, buffer, width, height, mobile) {
  const context = await browser.newContext({
    viewport: { width, height }, locale: mobile ? 'ja' : 'en',
    isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href);
    await page.waitForFunction(() => document.getElementById('languageButton')?.textContent.trim() === (document.documentElement.lang === 'ja' ? 'EN' : 'JA'));
    await page.locator('#fileInput').setInputFiles(buffer);
    try {
      await page.waitForFunction(() => document.querySelectorAll('.page-card').length === 12, null, { timeout: 15000 });
    } catch (error) {
      console.error('Import diagnostics', JSON.stringify(await page.evaluate(() => ({
        lang: document.documentElement.lang,
        cards: document.querySelectorAll('.page-card').length,
        notice: document.querySelector('#toastRegion')?.innerText,
        busy: document.querySelector('#busyOverlay')?.hidden,
        workspace: document.querySelector('#workspace')?.hidden,
        error: document.querySelector('#previewError')?.innerText,
        bodyText: document.body?.innerText?.slice(0, 1200)
      }))));
      console.error('Unhandled errors', errors);
      throw error;
    }
    assert.equal(await page.locator('.compact-drop > span').count(), 0, 'No verbose desktop drop hint');
    await page.locator('.page-card [data-action="preview"]').first().click({ force: true });
    await page.locator('#previewDialog[open] .preview-content-frame').waitFor({ timeout: 30000 });
    const level = page.locator('#previewZoomResetButton');
    assert.equal((await level.textContent()).trim(), '100%');
    await page.locator('#previewZoomInButton').click();
    assert.equal((await level.textContent()).trim(), '125%', 'Plus button enlarges');
    await page.locator('#previewZoomOutButton').click();
    assert.equal((await level.textContent()).trim(), '100%', 'Minus button restores');
    if (mobile) {
      assert.equal(await page.locator('[data-i18n="previewFooterKeys"]').isVisible(), false, 'Desktop keys are hidden on phone');
      const stage = await page.locator('#previewStage').boundingBox();
      assert.ok(stage && stage.height > 80, 'Preview stage has room for gestures');
      const session = await context.newCDPSession(page);
      const x = Math.round(stage.x + stage.width / 2), y = Math.round(stage.y + stage.height / 2);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: x - 28, y }, { id: 2, x: x + 28, y }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x - 70, y }, { id: 2, x: x + 70, y }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => document.getElementById('previewZoomResetButton').textContent !== '100%');
      assert.ok(parseInt(await level.textContent(), 10) > 100, 'Pinch-out enlarges preview');
      await level.click();
      assert.equal((await level.textContent()).trim(), '100%', 'Fit button restores page');
    }
    await page.locator('#closePreviewButton').click();
    await page.locator('#previewDialog').waitFor({ state: 'hidden' });
    if (mobile) {
      await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'instant' }));
      await page.waitForFunction(() => document.body.classList.contains('mobile-header-hidden'), { timeout: 5000 });
      await page.evaluate(() => window.scrollBy({ top: -90, behavior: 'instant' }));
      await page.waitForFunction(() => !document.body.classList.contains('mobile-header-hidden'), { timeout: 5000 });
    }
    await page.evaluate(() => { document.getElementById('selectAllButton').click(); document.getElementById('deleteButton').click(); });
    await page.locator('#deleteConfirmDialog[open]').waitFor();
    assert.equal(await page.locator('.page-card').count(), 12, 'Confirm does not delete immediately');
    await page.locator('#deleteConfirmCancelButton').click();
    assert.equal(await page.locator('.page-card').count(), 12, 'Cancel preserves all pages');
    await page.evaluate(() => document.getElementById('deleteButton').click());
    await page.locator('#deleteConfirmApplyButton').click();
    assert.equal(await page.locator('.page-card').count(), 0, 'Confirm deletes all');
    await page.evaluate(() => document.getElementById('undoButton').click());
    assert.equal(await page.locator('.page-card').count(), 12, 'Undo restores every page');
    assert.deepEqual(errors, [], 'No unhandled browser errors');
    console.log('PASS preview, header and deletion ' + (mobile ? 'mobile' : 'desktop'));
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    const buffer = fixture();
    await exercise(browser, buffer, 1360, 900, false);
    await exercise(browser, buffer, 393, 852, true);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
