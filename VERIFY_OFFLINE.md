# Verify offline behavior

1. Run `build-offline.bat`.
2. Confirm the build reports a standalone HTML size below the default 6 MB guard.
3. Disconnect the network or enable browser DevTools Offline mode.
4. Open `dist/index.html` in a current Chrome/Edge/Firefox/Safari browser.
5. Load a PDF, reorder/rotate/delete pages, undo, preview, add another PDF, and export.
6. Test at least one Japanese/CJK PDF so the embedded CMaps/fonts path is exercised.
7. Confirm there are no runtime network requests.

The offline artifact keeps dependency libraries gzip-compressed. PDF.js support assets remain fully embedded and are decompressed only when requested, so size reduction must not be achieved by dropping CMaps, fonts, WASM, ICC profiles, or image-decoder support.
