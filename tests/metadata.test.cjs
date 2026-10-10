// Removing or misdescribing the distributable/runtime metadata must fail this contract.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeRelease } = require('./helpers/artifact-parity.cjs');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
test('app metadata describes the existing standalone output and network policy', () => {
  assert.ok(fs.existsSync(path.join(root, 'app.config.json')), 'app.config.json is required');
  const config = JSON.parse(read('app.config.json'));
  assert.equal(config.build?.output, 'dist/index.html');
  assert.equal(config.build?.blockRuntimeNetwork, true);
  assert.equal(config.version, '1.2.6');
  assert.deepEqual(config.build.aliases, ['pdf-organizer.html']);
  const source = read('src/index.template.html');
  assert.ok(source.includes(`Version ${config.version}`));
  assert.ok(read('pdf-organizer.html').includes(`Version ${config.version}`));
  assert.match(read('pdf-organizer.html'), /connect-src 'none'/);
});

test('committed distribution alias preserves the canonical runtime and decoded assets', { skip: !fs.existsSync(path.join(root, 'dist/index.html')) && 'Run build-offline.ps1 to verify canonical output parity' }, () => {
  assert.ok(normalizeRelease(read('pdf-organizer.html')) === normalizeRelease(read('dist/index.html')), 'Runtime or decoded dependency assets differ from the canonical build');
});
