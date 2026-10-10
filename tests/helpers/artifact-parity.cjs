// Canonical decoded release comparison. This helper never changes shipped HTML.
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
function gunzip(value) {
  assert.equal(typeof value, 'string');
  const bytes = Buffer.from(value, 'base64');
  assert.equal(bytes.toString('base64'), value, 'Canonical Base64');
  assert.ok(bytes.length >= 18 && bytes.subarray(0, 4).equals(Buffer.from([31,139,8,0])), 'Plain gzip envelope');
  const result = zlib.inflateRawSync(bytes.subarray(10), {info:true,maxOutputLength:32*1024*1024});
  assert.equal(result.engine.bytesWritten + 18, bytes.length, 'Exactly one complete gzip member');
  assert.deepEqual(zlib.gunzipSync(bytes), result.buffer, 'Valid gzip checksum and size');
  return result.buffer;
}
function normalizeRelease(html) {
  html = html.replace(/\r\n/g, '\n');
  const fields = new Map();
  const read = id => {
    const matches = [...html.matchAll(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`, 'g'))];
    assert.equal(matches.length, 1, `Exactly one ${id}`);
    fields.set(id, matches[0][1]); return matches[0][1];
  };
  const replacements = new Map();
  for (const id of ['vendorPdfEncryptGzipBase64','vendorPdfLibGzipBase64','vendorPdfJsGzipBase64','vendorPptxRendererGzipBase64','vendorPdfWorkerGzipBase64']) replacements.set(id, gunzip(read(id)).toString('base64'));
  const entries = JSON.parse(read('vendorPdfAssetEntriesJson'));
  const bundles = JSON.parse(read('vendorPdfAssetBundlesJson')).map(gunzip);
  const ranges = bundles.map(() => []), decoded = Object.create(null);
  for (const key of Object.keys(entries).sort()) {
    const entry = entries[key];
    if (typeof entry === 'string') decoded[key] = gunzip(entry).toString('base64');
    else {
      assert.ok(Array.isArray(entry) && entry.length === 3 && entry.every(Number.isSafeInteger), 'Valid bundled asset range');
      const [index,offset,length] = entry;
      assert.ok(index >= 0 && index < bundles.length && offset >= 0 && length > 0 && offset + length <= bundles[index].length, 'Asset range stays inside bundle');
      ranges[index].push([offset,length]);
      decoded[key] = bundles[index].subarray(offset,offset+length).toString('base64');
    }
  }
  for (const [index,parts] of ranges.entries()) {
    let end = 0;
    for (const [offset,length] of parts.sort((a,b)=>a[0]-b[0])) { assert.equal(offset,end,'No bundle gaps or overlapping assets'); end += length; }
    assert.equal(end,bundles[index].length,'All bundle bytes are accounted for');
  }
  const manifest = JSON.parse(read('embeddedDependencyManifest'));
  assert.ok(Number.isFinite(Date.parse(manifest.generatedAtUtc)), 'Valid build timestamp');
  assert.equal(manifest.dependencies.pdfJs.embeddedAssetCount,Object.keys(entries).length);
  assert.equal(manifest.dependencies.pdfJs.embeddedAssetBundleCount,bundles.length);
  manifest.generatedAtUtc = '<build-time>';
  replacements.set('vendorPdfAssetEntriesJson', JSON.stringify(decoded));
  replacements.set('vendorPdfAssetBundlesJson', '[]');
  replacements.set('embeddedDependencyManifest', JSON.stringify(manifest));
  // Replace only the exact payload text of each already-validated unique script.
  for (const [id,value] of replacements) html = html.replace(new RegExp(`(<script[^>]*id="${id}"[^>]*>)[\\s\\S]*?(<\\/script>)`), (_,open,close)=>open+value+close);
  return html;
}
module.exports = {normalizeRelease};
