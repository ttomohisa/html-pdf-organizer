# Contributing

Issues and pull requests are welcome. Keep the app browser-local and preserve the single-HTML/offline build design.

## Development

1. Edit `src/index.template.html`.
2. Run `build-offline.bat` on Windows.
3. Test `dist/index.html` with the network disabled.
4. Check desktop and smartphone interactions, especially selection, drag reorder, preview, rotate, delete/undo, and export.

## Automated regression tests

With Node.js 22 or newer, run `node --test tests/*.test.cjs`. This checks the source template and checked-in standalone HTML, executing the actual page controller and bundled pdf-lib against synthetic PDFs. DOM rendering and the PDF.js loading boundary are adapted for Node; this does not replace browser rendering, touch, password, or conversion checks. No test files leave the process.

To test a fresh build on Windows PowerShell, set `$env:PDF_ORGANIZER_HTML="dist/index.html"` and `$env:PDF_ORGANIZER_BUNDLE="dist/index.html"`, then run the same command. Unset both variables afterward. Optionally set `PDF_ORGANIZER_EXPORT_DIR` to write synthetic result PDFs for independent inspection.

Generated-artifact checks compare unchanged runtime markup/scripts and all decoded dependency bytes. Only CRLF, build timestamp, valid gzip encoding, and equivalent asset chunk ordering may differ between platforms. Invalid payloads and stale runtime remain failures.
