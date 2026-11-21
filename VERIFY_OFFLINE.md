# Verify offline behavior

1. On Windows, run `build-offline.bat`. Allow the first build to download its pinned dependencies.
2. Confirm the build succeeds and the standalone HTML is at or below the default 4.75 MiB limit.
3. Disconnect the network or enable browser DevTools Offline mode.
4. Open the local `dist/index.html` in a current version of Chrome, Edge, Firefox, or Safari. For the distributed copy, repeat with `pdf-organizer.html`.
5. Add a multipage PDF and a JPEG. Reorder and rotate pages, delete one, undo and redo, then preview the result. Include a Japanese/CJK PDF that uses a predefined CMap to check the embedded support assets.
6. Open **Save settings**. Apply a watermark, enable page numbers and compress a large RGB JPEG. On a phone, change the output filename in the same panel. Export all pages, then export a selection. Reopen both PDFs and check the page order, watermark, and bottom-center numbers. The selected export should start at 1. Confirm earlier searchable text is still selectable.
7. Test password protection with **Save settings → Password**. Open the protected download with the password you set.
8. In the Network panel, check that editing and exporting made no HTTP(S) requests. Local file and blob URLs are expected.

The offline artifact keeps dependency libraries gzip-compressed. PDF.js support assets required by this app remain embedded and are decompressed only when requested. CMaps, standard fonts, WASM image decoders/fallbacks, and ICC profiles must remain available; size reduction must not trade away PDF rendering compatibility.
