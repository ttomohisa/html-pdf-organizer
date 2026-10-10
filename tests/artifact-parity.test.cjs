const test=require('node:test'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const {normalizeRelease}=require('./helpers/artifact-parity.cjs');
const gzip=(s,level=6)=>zlib.gzipSync(Buffer.from(s),{level}).toString('base64');
function fixture(reverse=false) {
 const script=(id,payload)=>`<script id="${id}">${payload}</script>`;
 const modules=['vendorPdfEncryptGzipBase64','vendorPdfLibGzipBase64','vendorPdfJsGzipBase64','vendorPptxRendererGzipBase64','vendorPdfWorkerGzipBase64'].map(id=>script(id,gzip(id,reverse?1:9))).join('\n');
 const entries=reverse?{'b':[0,0,2],'a':[0,2,1]}:{'a':[0,0,1],'b':[0,1,2]};
 const manifest={generatedAtUtc:reverse?'2026-10-10T02:00:00Z':'2026-10-10T01:00:00Z',dependencies:{pdfJs:{embeddedAssetCount:2,embeddedAssetBundleCount:1}}};
 return '<style>.app{color:red}</style>\n'+modules+'\n'+script('vendorPdfAssetEntriesJson',JSON.stringify(entries))+'\n'+script('vendorPdfAssetBundlesJson',JSON.stringify([gzip(reverse?'bba':'abb',reverse?1:9)]))+'\n'+script('embeddedDependencyManifest',JSON.stringify(manifest));
}
test('release parity accepts only decoded-equivalent encodings, chunk order, timestamp and CRLF differences',()=>{
 assert.equal(normalizeRelease(fixture()),normalizeRelease(fixture(true).replace(/\n/g,'\r\n')));
});
test('release parity detects changed application CSS and decoded module/support-asset bytes',()=>{
 const html=fixture(),expected=normalizeRelease(html);
 for(const altered of [html.replace('color:red','color:blue'),html.replace(gzip('vendorPdfLibGzipBase64',9),gzip('changed')),html.replace(gzip('abb',9),gzip('acc'))])assert.notEqual(normalizeRelease(altered),expected);
});
test('release parity rejects malformed gzip, extra members, duplicate scripts and invalid asset ranges',()=>{
 const html=fixture(),encoded=gzip('vendorPdfLibGzipBase64',9),bytes=Buffer.from(encoded,'base64'),corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]^=1;
 for(const payload of [encoded+'@',corrupt.toString('base64'),Buffer.concat([bytes,zlib.gzipSync(Buffer.from('extra'))]).toString('base64')])assert.throws(()=>normalizeRelease(html.replace(encoded,payload)));
 for(const altered of [html.replace('"a":[0,0,1]','"a":[0,0,999]'),html.replace('"b":[0,1,2]','"b":[0,0,2]'),html+'<script id="vendorPdfLibGzipBase64">'+encoded+'</script>'])assert.throws(()=>normalizeRelease(altered));
});
