'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const file of ['src/index.template.html', 'pdf-organizer.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  test(file + ': smaller workspace keeps the real file input and source privacy label', () => {
    assert.doesNotMatch(html, /<footer(?:\s|>)/);
    assert.doesNotMatch(html, /fileFallbackButton|fileFallbackInput|overviewLabel|workspaceGuideIcon/);
    assert.match(html, /data-i18n="addPdf">ファイルを追加/);
    assert.match(html, /workspaceGuideBodyMobile">長押しして並び替え/);
    assert.match(html, /data-i18n="overviewSummary">並べ替えや回転、削除をして/);
    assert.doesNotMatch(html, /<ul class="overview-actions">/);
    assert.doesNotMatch(html, /data-i18n="dropDescription"/);
    assert.match(html, /data-i18n="choosePdf">ファイルを選択/);
    assert.doesNotMatch(html, /mobile-header-hidden/);
    assert.match(html, /@media \(max-width: 760px\) \{\s*\.privacy-promise \{ display: none !important; \}/);
    assert.match(html, /data-i18n="privacyNote">完全ローカル処理/);
    assert.match(html, /id="fileInput" type="file"/);
    assert.match(html, /addPdf: "Add files"/);
    assert.match(html, /workspaceGuideBodyMobile: "Touch and hold to reorder"/);
  });
  test(file + ': help keeps usable steps, warnings and bilingual licenses', () => {
    assert.match(html, /<details class="help-shortcuts">/);
    assert.match(html, /data-i18n="openSource">オープンソース/);
    assert.match(html, /limitPptx: "PowerPoint fonts/);
    assert.match(html, /helpPrivacy: "読み込みから編集・保存までブラウザ内で処理します。/);
    for (const value of ['MIT License', 'Apache-2.0', 'pdf-lib', '@pdfsmaller/pdf-encrypt', '@aiden0z/pptx-renderer']) assert.ok(html.includes(value), value);
    assert.doesNotMatch(html, /data-i18n="helpModals"/);
  });
}
test('release workflow publishes only merged main PR after checks', () => {
  const yaml = fs.readFileSync(path.join(root, '.github/workflows/release-on-merge.yml'), 'utf8');
  for (const expected of ['types: [closed]', 'pull_request.merged == true', "pull_request.base.ref == 'main'", './build-offline.ps1', 'node --test', 'gh release create', '--target', '--generate-notes', 'contents: write']) assert.ok(yaml.includes(expected), expected);
});
