// Browser-level confirmation, pinch zoom, responsive layout and mobile header checks.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
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
    // The initial HTML already has a Japanese label; wait for the embedded runtime to finish initializing.
    await page.waitForFunction(() => !!document.querySelector('#initialDropIcon svg') && !!document.querySelector('#helpButton svg'), null, { timeout: 30000 });
    assert.equal(await page.locator('#initialDropZone h2').count(), 0, 'No redundant first-run heading');
    assert.ok(await page.locator('[data-i18n="overviewSummary"]').isVisible(), 'The overview explains the tool');
    const icon = await page.locator('#initialDropIcon').boundingBox();
    const picker = await page.locator('#initialAddButton').boundingBox();
    assert.ok(icon && picker && picker.y - (icon.y + icon.height) >= 10, 'The file picker has space below its icon');
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
    // The first import must land at the *visible* editing toolbar, not at the workspace heading.
    await page.waitForFunction((isMobile) => {
      const toolbar = document.querySelector(isMobile ? '.mobile-edit-dock' : '.toolbar');
      const header = document.querySelector('.app-header');
      if (!toolbar || (isMobile && toolbar.hidden) || !document.querySelector('#busyOverlay').hidden) return false;
      const styles = getComputedStyle(toolbar);
      const inset = styles.position === 'sticky' ? (parseFloat(styles.top) || 0) : 0;
      return Math.abs(toolbar.getBoundingClientRect().top - inset) < 3 &&
        (!isMobile || header.getBoundingClientRect().bottom < 0);
    }, mobile, { timeout: 15000 });
    const editingBar = page.locator(mobile ? '.mobile-edit-dock' : '.toolbar');
    assert.deepEqual(await editingBar.evaluate(bar => {
      const inner = bar.querySelector('.mobile-dock-actions, #undoButton');
      return [
        getComputedStyle(bar).paddingTop,
        getComputedStyle(bar).marginBottom,
        getComputedStyle(inner).backgroundColor,
        getComputedStyle(inner).borderTopWidth === '0px' || getComputedStyle(inner).borderTopColor === 'rgba(0, 0, 0, 0)'
      ];
    }), ['8px', '16px', 'rgba(0, 0, 0, 0)', true], 'The editing bar uses flat controls and 8px spacing');
    assert.equal(await page.locator('#addButton').isVisible(), !mobile, 'Only the desktop editing toolbar has the top add button');
    if (mobile) {
      await page.locator('.mobile-edit-dock').getByRole('button', { name: /その他|More/i }).click();
      assert.equal(await page.locator('.mobile-tools-dialog').getByRole('button', { name: /^(やり直す|Redo)$/i }).count(), 0);
      await page.locator('.mobile-tools-close').click();
      assert.ok(await page.locator('.mobile-edit-dock').getByRole('button', { name: /^(やり直す|Redo)$/i }).isVisible());
    }
    if (!mobile) {
      const originalViewport = page.viewportSize();
      for (const width of [1451, 1600]) {
        await page.setViewportSize({ width, height: 680 });
        assert.ok(await editingBar.evaluate(bar => bar.scrollWidth <= bar.clientWidth + 1),
          'Editing actions fit at ' + width + 'px');
      }
      await page.setViewportSize(originalViewport);
      const selectAll = page.locator('#selectAllButton');
      const beforeSelection = await selectAll.boundingBox();
      await selectAll.click();
      const afterSelection = await selectAll.boundingBox();
      assert.ok(Math.abs(afterSelection.x - beforeSelection.x) < 0.5, 'The page count does not shift toolbar actions');
      await page.locator('#clearSelectionButton').click();
      const redo = await page.locator('#redoButton').boundingBox();
      const add = await page.locator('.toolbar #addButton').boundingBox();
      assert.ok(add.x >= redo.x + redo.width && add.x - (redo.x + redo.width) <= 16 && Math.abs(add.y - redo.y) < 1,
        'Add files sits directly to the right of Redo');
      assert.ok(await page.locator('.toolbar').evaluate(toolbar => toolbar.scrollWidth <= toolbar.clientWidth + 1),
        'All actions fit at the desktop width');
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#addButton').click()]);
      assert.ok(chooser.isMultiple());
    }
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
    // All four corners remain reachable at maximum zoom, including the upper left.
    for (let i = 0; i < 8; i++) await page.locator('#previewZoomInButton').click();
    assert.equal((await level.textContent()).trim(), '300%');
    for (const corner of [[0,0],[1,0],[0,1],[1,1]]) {
      const visible = await page.evaluate(([right,bottom]) => {
        const stage = document.querySelector('#previewStage');
        const frame = stage.querySelector('.preview-content-frame');
        stage.scrollLeft = right ? stage.scrollWidth : 0;
        stage.scrollTop = bottom ? stage.scrollHeight : 0;
        const r = frame.getBoundingClientRect(), v = stage.getBoundingClientRect();
        const x = right ? r.right : r.left, y = bottom ? r.bottom : r.top;
        return x >= v.left - 1 && x <= v.left + stage.clientWidth + 1 &&
          y >= v.top - 1 && y <= v.top + stage.clientHeight + 1;
      }, corner);
      assert.ok(visible, 'Zoomed page corner reachable: ' + corner);
    }
    await level.click();
    await page.locator('#previewSelection').check();
    await page.locator('#previewNextButton').click();
    await page.locator('#previewSelection').check();
    await page.locator('#previewPreviousButton').click();
    assert.ok(await page.locator('#previewSelection').isChecked(), 'Preview selection survives navigation');
        await page.locator('#closePreviewButton').click();
    await page.locator('#previewDialog').waitFor({ state: 'hidden' });
    assert.deepEqual(await page.locator('.page-card.selected .page-order').allTextContents(), ['1','2']);
    assert.ok(await page.locator('.page-card .source-name').first().isVisible(), 'Multiple source names are visible');
    const orderBefore = await page.locator('.page-card .source-name').allTextContents();
    if (mobile) {
      await page.locator('.mobile-edit-dock').getByRole('button', { name: /その他|More/i }).click();
      await page.locator('.mobile-tools-dialog').getByRole('button', { name: /移動先を指定|Move to page/i }).click();
    } else await page.locator('#moveTargetButton').click();
    await page.locator('#moveTargetNumber').fill('1');
    assert.ok(await page.locator('#moveTargetApply').isDisabled(), 'Cannot target a selected page');
    await page.locator('#moveTargetNumber').fill('5');
    await page.locator('#moveTargetSide').selectOption('after');
    await page.locator('#moveTargetThumb canvas').waitFor();
    await page.locator('#moveTargetApply').click();
    assert.deepEqual(await page.locator('.page-card .source-name').allTextContents(), [...orderBefore.slice(2,5),...orderBefore.slice(0,2),...orderBefore.slice(5)]);
    await page.evaluate(() => document.getElementById('undoButton').click());
    assert.deepEqual(await page.locator('.page-card .source-name').allTextContents(), orderBefore);
    await page.evaluate(() => document.getElementById('clearSelectionButton').click());

    await page.locator('#saveOptionsButton').click();
    await page.locator('#splitButton').click();
    await page.locator('#splitBoundaries input').nth(2).check(); // page 4
    await page.locator('#splitBoundaries input').nth(4).check(); // page 6
    const partNames = page.locator('#splitParts input');
    assert.equal(await partNames.count(), 3);
    await partNames.nth(0).fill('申請書');
    await partNames.nth(1).fill('申請書');
    await partNames.nth(2).fill('図面');
    const [zipDownload] = await Promise.all([page.waitForEvent('download'), page.locator('#splitApply').click()]);
    const zip = await fs.readFile(await zipDownload.path());
    const names = [], counts = [];
    let offset = 0;
    while (zip.readUInt32LE(offset) === 0x04034b50) {
      const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26);
      const dataStart = offset + 30 + nameLength + zip.readUInt16LE(offset + 28);
      names.push(zip.toString('utf8', offset + 30, offset + 30 + nameLength));
      const bytes = [...zip.subarray(dataStart, dataStart + size)];
      counts.push(await page.evaluate(async data => (await PDFLib.PDFDocument.load(Uint8Array.from(data))).getPageCount(), bytes));
      offset = dataStart + size;
    }
    assert.deepEqual(names, ['申請書.pdf', '申請書-2.pdf', '図面.pdf']);
    assert.deepEqual(counts, [3,2,7]);
    assert.equal(zip.readUInt32LE(offset), 0x02014b50, 'ZIP central directory follows local entries');
    await page.locator('#busyOverlay').waitFor({ state: 'hidden' });
    assert.deepEqual(await page.locator('.page-card .source-name').allTextContents(), orderBefore, 'Split does not change the workspace');
    const openRanges = async () => {
      if (mobile) {
        await page.locator('.mobile-edit-dock').getByRole('button', { name: /その他|More/i }).click();
        await page.locator('.mobile-tools-dialog').getByRole('button', { name: /ページ番号で選択|Select by page number/i }).click();
      } else {
        await page.locator('#selectPageRangesButton').click();
      }
      await page.locator('#pageRangesDialog[open]').waitFor();
    };
    const selectedNumbers = () => page.locator('.page-card.selected .page-order').allTextContents();
    await page.locator('.page-card').first().locator('.thumb-frame').click();
    assert.deepEqual(await selectedNumbers(), ['1']);
    await openRanges();
    const rangeField = page.locator('#pageRangesInput');
    assert.equal(await rangeField.evaluate(input => input === document.activeElement), true);
    await rangeField.fill('2-4, 13');
    await rangeField.press('Enter');
    await page.locator('#pageRangesError').waitFor();
    assert.deepEqual(await selectedNumbers(), ['1'], 'A bad range leaves the whole prior selection intact');
    await rangeField.fill('１２、２－４, 3');
    await rangeField.press('Enter');
    await page.locator('#pageRangesDialog').waitFor({ state: 'hidden' });
    assert.deepEqual(await selectedNumbers(), ['2', '3', '4', '12']);
    await openRanges();
    await rangeField.fill('7');
    await page.keyboard.press('Escape');
    assert.deepEqual(await selectedNumbers(), ['2', '3', '4', '12'], 'Closing the dialog leaves the selection intact');
    await openRanges();
    await rangeField.fill('7');
    if (mobile) await page.touchscreen.tap(2, 2);
    else await page.mouse.click(2, 2);
    await page.locator('#pageRangesDialog').waitFor({ state: 'hidden', timeout: 3000 });
    assert.deepEqual(await selectedNumbers(), ['2', '3', '4', '12'], 'Backdrop dismisses the dialog without applying the input');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#saveSelectedButton').click()]);
    const saved = [...await fs.readFile(await download.path())];
    assert.equal(await page.evaluate(async data => (await PDFLib.PDFDocument.load(Uint8Array.from(data))).getPageCount(), saved), 4);
    await page.locator('#busyOverlay').waitFor({ state: 'hidden' });
    await page.locator('.page-card').first().locator('.thumb-frame').click();
    await page.evaluate(() => document.querySelector('#moveEndButton').click());
    await openRanges();
    await rangeField.fill('1, 12');
    await rangeField.press('Enter');
    await page.locator('#pageRangesDialog').waitFor({ state: 'hidden' });
    assert.deepEqual(await page.locator('.page-card.selected .source-name').allTextContents(), ['page-2.png', 'page-1.png'],
      'Page numbers follow the order after moving a page');
    assert.equal(await page.locator('#initialOverview').isVisible(), false, 'Intro hides after import');
    assert.equal(await page.locator('#initialDropZone').isVisible(), false, 'Drop area hides after import');
    if (mobile) {
      await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'instant' }));
      const scrolledHeader = await page.locator('.app-header').evaluate(el => ({
        position: getComputedStyle(el).position,
        bottom: el.getBoundingClientRect().bottom
      }));
      assert.equal(scrolledHeader.position, 'static', 'Mobile header participates in normal scrolling');
      assert.ok(scrolledHeader.bottom < 0, 'Mobile header leaves the viewport when scrolling down');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      const restoredHeader = await page.locator('.app-header').boundingBox();
      assert.ok(restoredHeader && restoredHeader.y >= -1, 'Mobile header returns at the top of the page');
    }
    await page.evaluate(() => { document.getElementById('selectAllButton').click(); document.getElementById('deleteButton').click(); });
    await page.locator('#deleteConfirmDialog[open]').waitFor();
    assert.equal(await page.locator('.page-card').count(), 12, 'Confirm does not delete immediately');
    await page.locator('#deleteConfirmCancelButton').click();
    assert.equal(await page.locator('.page-card').count(), 12, 'Cancel preserves all pages');
    await page.evaluate(() => document.getElementById('deleteButton').click());
    await page.locator('#deleteConfirmApplyButton').click();
    assert.equal(await page.locator('.page-card').count(), 0, 'Confirm deletes all');
    assert.ok(await page.locator('#emptyState').isVisible(), 'The empty workspace is visible');
    assert.ok(await page.locator('#selectPageRangesButton').isDisabled(), 'Range selection is disabled with no pages');
    assert.equal(await page.locator('.workspace-guide').isVisible(), false, 'Reorder hint is hidden with no pages');
    await page.evaluate(() => document.getElementById('undoButton').click());
    assert.equal(await page.locator('.page-card').count(), 12, 'Undo restores every page');
    assert.ok(await page.locator('.workspace-guide').isVisible(), 'Undo restores the reorder hint');
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
