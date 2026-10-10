const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const targets = process.env.PDF_ORGANIZER_HTML ? [process.env.PDF_ORGANIZER_HTML] : ['src/index.template.html', 'pdf-organizer.html'];

for (const filename of targets) {
  const source = fs.readFileSync(path.resolve(root, filename), 'utf8');
  test(`${filename}: header shows the canonical patch version`, () => {
    assert.match(source, /class="version-badge" title="Version 1\.2\.5">v1\.2\.5<\/span>/);
    assert.match(source, /data-i18n="privacyNote">完全ローカル処理<\/span>/);
  });
  test(`${filename}: repeated language changes preserve privacy and accessible header controls`, () => {
    const element = (dataset = {}) => ({ dataset, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } });
    const privacy = element({ i18n: 'privacyNote' });
    const help = element({ i18nTitle: 'helpTitle', i18nAriaLabel: 'helpTitle' });
    const languageButton = element();
    const saved = {};
    const document = { documentElement: {}, querySelector: () => null, querySelectorAll: selector => ({
      '[data-i18n]': [privacy], '[data-i18n-html]': [], '[data-i18n-title]': [help], '[data-i18n-aria-label]': [help]
    }[selector]) };
    const ctx = vm.createContext({ document, elements: { languageButton, previewDialog: { open: false } },
      state: { pages: [] }, localStorage: { setItem: (key, value) => { saved[key] = value; } },
      updateUiState() {}, updatePasswordVisibilityUi() {} });
    const translations = source.slice(source.indexOf('    const translations = {'), source.indexOf('    const LANGUAGE_STORAGE_KEY'));
    const functions = source.slice(source.indexOf('    function t('), source.indexOf('    const makeId ='));
    vm.runInContext(translations + '\nlet currentLanguage = "ja"; const LANGUAGE_STORAGE_KEY = "pdf-organizer-language";\n' + functions + '\nglobalThis.apply = applyLanguage;', ctx);
    for (const language of ['ja', 'en', 'ja', 'en']) {
      ctx.apply(language);
      const japanese = language === 'ja';
      assert.equal(document.documentElement.lang, language);
      assert.equal(languageButton.textContent, japanese ? 'EN' : 'JA');
      assert.equal(languageButton.attributes['aria-label'], japanese ? 'Switch to English' : '日本語に切り替え');
      assert.equal(languageButton.title, languageButton.attributes['aria-label']);
      assert.equal(help.attributes['aria-label'], japanese ? '使い方と注意事項' : 'How to use & notes');
      assert.equal(help.title, help.attributes['aria-label']);
      assert.equal(privacy.textContent, japanese ? '完全ローカル処理' : 'Everything is processed on this device');
      assert.equal(saved['pdf-organizer-language'], language);
    }
  });
}
