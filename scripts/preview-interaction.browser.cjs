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
      const menu = page.locator('.mobile-tools-dialog');
      const rangeIcon = await menu.getByRole('button', { name: /ページ番号で選択|Select by page number/i }).locator('svg').innerHTML();
      const moveIcon = await menu.getByRole('button', { name: /移動先を指定|Move to page/i }).locator('svg').innerHTML();
      assert.notEqual(moveIcon, rangeIcon, 'Moving and selecting have distinct icons');
      assert.equal(moveIcon, await page.locator('#moveTargetButton svg').innerHTML(), 'Move icon matches desktop');
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
    const dismissBackdrop = async (selector) => {
      if (mobile) await page.touchscreen.tap(2, 2);
      else await page.mouse.click(2, 2);
      await page.locator(selector).waitFor({ state: 'hidden', timeout: 3000 });
    };
    const openMoveTarget = async () => {
      if (mobile) {
        await page.locator('.mobile-edit-dock').getByRole('button', { name: /その他|More/i }).click();
        await page.locator('.mobile-tools-dialog').getByRole('button', { name: /移動先を指定|Move to page/i }).click();
      } else await page.locator('#moveTargetButton').click();
      await page.locator('#moveTargetDialog[open]').waitFor();
    };
    await openMoveTarget();
    const spacing = await page.locator('#moveTargetDialog').evaluate(dialog => {
      const rect = selector => dialog.querySelector(selector).getBoundingClientRect();
      return [
        rect('#moveTargetNumber').top - rect('label[for="moveTargetNumber"]').bottom,
        rect('#moveTargetSide').top - rect('#moveTargetNumber').bottom,
        rect('#moveTargetThumb').top - rect('#moveTargetSide').bottom
      ];
    });
    assert.ok(spacing[0] >= 6 && spacing.slice(1).every(gap => gap >= 12), 'Move target fields and thumbnail have breathing room');
    await page.locator('#moveTargetNumber').fill('5');
    await page.locator('#moveTargetSide').selectOption('after');
    assert.ok(await page.locator('#moveTargetDialog').isVisible(), 'Interacting with fields does not dismiss the dialog');
    await dismissBackdrop('#moveTargetDialog');
    assert.deepEqual(await page.locator('.page-card .source-name').allTextContents(), orderBefore, 'Backdrop cancels the move');
    assert.deepEqual(await page.locator('.page-card.selected .page-order').allTextContents(), ['1','2'], 'Backdrop preserves selection');
    await openMoveTarget();
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
    const splitIcon = await page.locator('#splitButton svg').boundingBox();
    assert.ok(splitIcon && splitIcon.width >= 17 && Math.abs(splitIcon.width - splitIcon.height) < 1, 'Split icon remains square');
    await page.locator('#splitButton').click();
    await page.locator('#splitBoundaries input').nth(2).check();
    assert.ok(await page.locator('#splitDialog').isVisible(), 'Checking a split boundary does not dismiss the dialog');
    await dismissBackdrop('#splitDialog');
    assert.deepEqual(await page.locator('.page-card .source-name').allTextContents(), orderBefore, 'Backdrop cancels splitting');
    await page.locator('#saveOptionsButton').click();
    await page.locator('#splitButton').click();
    assert.equal(await page.locator('#splitBoundaries input:checked').count(), 0, 'Reopening split starts with no pending boundaries');
    await page.locator('#splitBoundaries input').nth(2).check(); // page 4
    await page.locator('#splitBoundaries input').nth(4).check(); // page 6
    const partNames = page.locator('#splitParts input');
    assert.equal(await partNames.count(), 3);
    await partNames.nth(0).fill('申請書');
    await partNames.nth(1).fill('申請書');
    await partNames.nth(2).fill('図面');
    const [zipDownload] = await Promise.all([page.waitForEvent('download'), page.locator('#splitApply').click()]);
    const zip = await fs.readFile(await zipDownload.path());
    const names = [], counts = [], localEntries = [];
    const crc32 = bytes => {
      let crc = 0xffffffff;
      for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
      return (crc ^ 0xffffffff) >>> 0;
    };
    let offset = 0;
    while (zip.readUInt32LE(offset) === 0x04034b50) {
      const size = zip.readUInt32LE(offset + 18), nameLength = zip.readUInt16LE(offset + 26);
      const dataStart = offset + 30 + nameLength + zip.readUInt16LE(offset + 28);
      names.push(zip.toString('utf8', offset + 30, offset + 30 + nameLength));
      const bytes = [...zip.subarray(dataStart, dataStart + size)];
      const crc = crc32(bytes);
      assert.equal(zip.readUInt32LE(offset + 14), crc, 'Local entry CRC matches PDF bytes');
      localEntries.push({offset, size, crc, name: names.at(-1)});
      counts.push(await page.evaluate(async data => (await PDFLib.PDFDocument.load(Uint8Array.from(data))).getPageCount(), bytes));
      offset = dataStart + size;
    }
    assert.deepEqual(names, ['申請書.pdf', '申請書-2.pdf', '図面.pdf']);
    assert.deepEqual(counts, [3,2,7]);
    const centralStart = offset;
    for (const entry of localEntries) {
      assert.equal(zip.readUInt32LE(offset), 0x02014b50);
      assert.equal(zip.readUInt32LE(offset + 16), entry.crc);
      assert.equal(zip.readUInt32LE(offset + 24), entry.size);
      assert.equal(zip.readUInt32LE(offset + 42), entry.offset);
      const length = zip.readUInt16LE(offset + 28);
      assert.equal(zip.toString('utf8', offset + 46, offset + 46 + length), entry.name);
      offset += 46 + length + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
    }
    assert.equal(zip.readUInt32LE(offset), 0x06054b50);
    assert.equal(zip.readUInt16LE(offset + 10), localEntries.length);
    assert.equal(zip.readUInt32LE(offset + 12), offset - centralStart);
    assert.equal(zip.readUInt32LE(offset + 16), centralStart);
    assert.equal(offset + 22, zip.length);
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
    // Use the same embedded encryption library to create a password-protected test PDF.
    const encrypted = await page.evaluate(async () => {
      const payload = document.getElementById('vendorPdfEncryptGzipBase64').textContent.trim();
      const compressed = Uint8Array.from(atob(payload), c => c.charCodeAt(0));
      const source = await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = url;
          script.onload = () => { script.remove(); resolve(); };
          script.onerror = reject;
          document.head.append(script);
        });
      } finally { URL.revokeObjectURL(url); }
      const doc = await PDFLib.PDFDocument.create();
      doc.addPage();
      return [...await PDFEncrypt.encryptPDF(await doc.save(), 'test-password', { algorithm: 'AES-256' })];
    });
    await page.locator('#fileInput').setInputFiles([
      { name: 'locked.pdf', mimeType: 'application/pdf', buffer: Buffer.from(encrypted) },
      { name: 'additional.png', mimeType: 'image/png', buffer: buffer[0].buffer }
    ]);
    await page.locator('#passwordDialog[open]').waitFor();
    await page.locator('#passwordCancelButton').click();
    await page.locator('#busyOverlay').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.page-card').count(), 13, 'Cancellation skips only the protected PDF');
    const cancellation = page.locator('#toastRegion .toast').filter({ hasText: /パスワード入力をキャンセルしました|Password entry was cancelled/ });
    await cancellation.waitFor({ state: 'visible' });
    assert.equal(await cancellation.getAttribute('role'), 'status', 'Cancellation is informational');
    await cancellation.waitFor({ state: 'detached', timeout: 7000 });
    assert.deepEqual(errors, [], 'No unhandled browser errors');
    console.log('PASS preview, header and deletion ' + (mobile ? 'mobile' : 'desktop'));
  } finally {
    await context.close();
  }
}


async function screenshotAndSplitSettings(browser) {
  const password = 'offline-split-test';
  const root = path.resolve(__dirname, '../test-results/mobile-label');
  await fs.mkdir(root, {recursive: true});
  for (const lang of ['ja', 'en']) {
    const mobile = lang === 'ja';
    const context = await browser.newContext({locale: lang, viewport: mobile ? {width:393,height:852} : {width:1360,height:900}, isMobile: mobile, hasTouch: mobile, offline: true});
    const errors = [], requests = [];
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    context.on('request', req => { if (/^https?:/i.test(req.url())) requests.push({url:req.url(),method:req.method(),body:req.postData()}); });
    try {
      await page.goto(pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href);
      await page.locator('#initialDropIcon svg').waitFor();
      if (await page.locator('html').getAttribute('lang') !== lang) await page.locator('#languageButton').click();
      const input = await page.evaluate(async () => {
        const doc = await PDFLib.PDFDocument.create();
        const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
        for (const [i, heading] of ['Project overview','Schedule','Budget'].entries()) {
          const p = doc.addPage([420,594]);
          const green = PDFLib.rgb(.086,.384,.31);
          p.drawRectangle({x:0,y:530,width:420,height:64,color:green});
          p.drawText(heading,{x:24,y:553,size:21,font,color:PDFLib.rgb(1,1,1)});
          p.drawText('SAMPLE DOCUMENT / 0'+(i+1),{x:24,y:498,size:10,font,color:green});
          for(let n=0;n<6;n++){
            p.drawRectangle({x:24,y:450-n*43,width:372,height:28,color:PDFLib.rgb(.93,.95,.94)});
            p.drawRectangle({x:36,y:460-n*43,width:100+((n+i)%4)*48,height:5,color:green});
          }
        }
        const canvas=document.createElement('canvas');
        canvas.width=2200; canvas.height=1200;
        const ctx=canvas.getContext('2d');
        const gradient=ctx.createLinearGradient(0,0,2200,1200);
        gradient.addColorStop(0,'#afc4d5');gradient.addColorStop(1,'#356f61');
        ctx.fillStyle=gradient;ctx.fillRect(0,0,2200,1200);
        const jpg=canvas.toDataURL('image/jpeg',.98).split(',')[1];
        return {pdf:await doc.saveAsBase64(),jpg};
      });
      // Real desktop app screenshots for both README languages, from the same synthetic document.
      const shotContext = await browser.newContext({locale:lang,viewport:{width:1360,height:900},deviceScaleFactor:1,offline:true});
      try {
        const shot = await shotContext.newPage();
        await shot.goto(pathToFileURL(path.resolve(__dirname,'../dist/index.html')).href);
        await shot.locator('#initialDropIcon svg').waitFor();
        if (await shot.locator('html').getAttribute('lang') !== lang) await shot.locator('#languageButton').click();
        await shot.locator('#fileInput').setInputFiles({name:'sample-report.pdf',mimeType:'application/pdf',buffer:Buffer.from(input.pdf,'base64')});
        await shot.waitForFunction(() => document.querySelectorAll('.thumb-frame[data-rendered="true"]').length===3 && document.querySelector('#busyOverlay').hidden);
        await shot.evaluate(() => window.scrollTo(0,0));
        await shot.waitForFunction(() => !document.querySelector('#importStatus')?.textContent);
        const file = lang==='ja'?'screenshot.png':'screenshot-en.png';
        const png=await shot.screenshot({path:path.join(root,file),animations:'disabled'});
        // Temporary transfer through CI logs; no write credentials are required.
        const b64=png.toString('base64');
        for(let pos=0;pos<b64.length;pos+=6000) console.log('BK_SCREENSHOT '+file+' '+(pos/6000)+' '+b64.slice(pos,pos+6000));
        console.log('BK_SCREENSHOT_END '+file+' '+b64.length);
      } finally {await shotContext.close();}
      await page.locator('#fileInput').setInputFiles([
        {name:'report.pdf',mimeType:'application/pdf',buffer:Buffer.from(input.pdf,'base64')},
        {name:'photo.jpg',mimeType:'image/jpeg',buffer:Buffer.from(input.jpg,'base64')}
      ]);
      await page.waitForFunction(() => document.querySelectorAll('.page-card').length===4 && document.querySelector('#busyOverlay').hidden);
      const settings=page.locator('#saveOptionsButton');
      await settings.click();
      await page.locator('#pageNumbersButton').click();
      await page.locator('#imageCompressionButton').click();
      await page.locator('#watermarkButton').click();
      await page.locator('#watermarkEnabled').check();
      await page.locator('#watermarkText').fill('SPLIT TEST');
      await page.locator('#watermarkColor').selectOption('#bf302f');
      await page.locator('#watermarkApply').click();
      await settings.click();
      await page.locator('#saveOptionsPasswordButton').click();
      await page.locator('#outputPasswordEnabled').check();
      await page.locator('#outputPasswordInput').fill(password);
      await page.locator('#outputPasswordConfirmInput').fill(password);
      await page.locator('#outputPasswordForm button[type=submit]').click();
      await page.locator('#outputPasswordDialog').waitFor({state:'hidden'});
      // A selected subset must not affect the split of the entire list.
      await page.locator('.page-card').first().locator('.thumb-frame').click();
      const before=await page.locator('.page-card .source-name').allTextContents();
      await settings.click();
      await page.locator('#splitButton').click();
      await page.locator('#splitBoundaries input').nth(1).check();
      await page.locator('#splitParts input').nth(0).fill('申請書'.repeat(45));
      await page.locator('#splitParts input').nth(1).fill('申請書'.repeat(45));
      const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#splitApply').click()]);
      const zip=await fs.readFile(await download.path());
      await page.locator('#busyOverlay').waitFor({state:'hidden'});
      await page.locator('.toast-message').filter({hasText:/→/}).waitFor();
      assert.deepEqual(await page.locator('.page-card .source-name').allTextContents(),before);
      assert.equal(await page.locator('.page-card.selected').count(),1);
      const entries=[];
      for(let offset=0;zip.readUInt32LE(offset)===0x04034b50;){
        const length=zip.readUInt16LE(offset+26),size=zip.readUInt32LE(offset+18),start=offset+30+length+zip.readUInt16LE(offset+28);
        assert.equal(zip.readUInt16LE(offset+6)&1,0,'ZIP itself is not encrypted');
        const name=zip.toString('utf8',offset+30,offset+30+length);
        assert.ok(Buffer.byteLength(name)<=255 && name.endsWith('.pdf'));
        const bytes=zip.subarray(start,start+size);
        // Confirm the encryption dictionary and reject an unprotected result.
        assert.ok(await page.evaluate(async data => {
          const d=await PDFLib.PDFDocument.load(data,{ignoreEncryption:true,updateMetadata:false});
          const enc=d.context.lookup(d.context.trailerInfo.Encrypt);
          return d.isEncrypted && enc?.get(PDFLib.PDFName.of('V'))?.asNumber()===5;
        },bytes.toString('base64')));
        entries.push({name,bytes});offset=start+size;
      }
      assert.equal(entries.length,2);assert.notEqual(entries[0].name,entries[1].name);
      // Reopen each encrypted PDF in a fresh offline workspace. Wrong password must fail;
      // the correct one must restore two pages. Export without protection for content inspection.
      for (const [index,entry] of entries.entries()) {
        const verify=await context.newPage();
        try{
          await verify.goto(pathToFileURL(path.resolve(__dirname,'../dist/index.html')).href);
          await verify.locator('#initialDropIcon svg').waitFor();
          await verify.locator('#fileInput').setInputFiles({name:entry.name,mimeType:'application/pdf',buffer:entry.bytes});
          await verify.locator('#passwordDialog[open]').waitFor();
          await verify.locator('#passwordInput').fill('wrong-password');
          await verify.locator('#passwordInput').press('Enter');
          await verify.locator('#passwordError:not([hidden])').waitFor();
          await verify.locator('#passwordInput').fill(password);
          await verify.locator('#passwordInput').press('Enter');
          await verify.waitForFunction(()=>document.querySelectorAll('.page-card').length===2 && document.querySelector('#busyOverlay').hidden);
          const [plain]=await Promise.all([verify.waitForEvent('download'),verify.locator('#saveAllButton').click()]);
          const restored=await fs.readFile(await plain.path());
          const info=await verify.evaluate(async data=>{
            const {PDFDocument,PDFName,PDFRawStream,decodePDFRawStream}=PDFLib;
            const pdf=await PDFDocument.load(data);
            const ops=pdf.getPages().map(p=>p.node.Contents().asArray().map(ref=>new TextDecoder().decode(decodePDFRawStream(pdf.context.lookup(ref)).decode())).join('\n'));
            const images=pdf.context.enumerateIndirectObjects().map(x=>x[1]).filter(x=>x instanceof PDFRawStream && x.dict.get(PDFName.of('Subtype'))===PDFName.of('Image')).map(x=>({filter:x.dict.get(PDFName.of('Filter'))?.toString(),width:x.dict.get(PDFName.of('Width'))?.asNumber()}));
            return {ops,images};
          },restored.toString('base64'));
          for (const [i,ops] of info.ops.entries()) {
            const hex=Buffer.from((i+1)+' / 2','ascii').toString('hex').toUpperCase();
            assert.ok(ops.toUpperCase().includes('<'+hex+'> TJ'),'Page numbering restarted inside each PDF');
            assert.match(ops, /\/[^\s]+ Do/,'Watermark image drawing is present on every page');
          }
          if(index===1) assert.ok(info.images.some(x=>x.filter==='/DCTDecode' && x.width<=2000),'Imported JPEG was compressed');
        } finally {await verify.close();}
      }
      assert.deepEqual(errors,[]);
      // PDF.js may expose a virtual font request in the browser's request observer.
      // Only allow GETs for exact keys embedded in this HTML; the context stays offline.
      const assetKeys = await page.evaluate(() => Object.keys(JSON.parse(document.getElementById('vendorPdfAssetEntriesJson').textContent)));
      for (const req of requests) {
        const url = new URL(req.url);
        assert.equal(url.origin,'https://pdf-organizer.invalid','No external HTTP(S) origin is used');
        assert.equal(req.method,'GET');
        assert.equal(req.body,null);
        assert.ok(assetKeys.includes(decodeURIComponent(url.pathname.slice(1))), 'Virtual asset is embedded in the standalone HTML');
      }
      console.log('PASS offline split with password, page numbers, watermark, compression and mixed PDF/JPEG '+lang);
    } finally {await context.close();}
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    const buffer = fixture();
    await exercise(browser, buffer, 1360, 900, false);
    await exercise(browser, buffer, 393, 852, true);
    await screenshotAndSplitSettings(browser);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
