# PDF Organizer

[![GitHub Pages](https://github.com/ttomohisa/html-pdf-organizer/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/ttomohisa/html-pdf-organizer/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Single HTML](https://img.shields.io/badge/distribution-single%20HTML-0ea5e9)](https://ttomohisa.github.io/html-pdf-organizer/)

[日本語版 README](README.ja.md)

A privacy-focused, single-HTML app for organizing PDF pages, JPG/PNG/WebP images, and PowerPoint (PPTX) slides without uploading selected files to a server.

## 🚀 Live demo

### [Open PDF Organizer on GitHub Pages](https://ttomohisa.github.io/html-pdf-organizer/)

GitHub Pages delivers the initial HTML. After it loads, PDF parsing, thumbnails, reordering, rotation, preview, and export are processed locally on your device. The PDFs you select are not uploaded by the app.

[![PDF Organizer screenshot](assets/screenshot.png)](https://ttomohisa.github.io/html-pdf-organizer/)

## Features

- **Bring PDFs, images, and PowerPoint together** — Mix multiple source files and export them as one PDF.
- **Reorder naturally by moving cards** — Drag single pages or move a multi-page selection together, with touch-friendly behavior on mobile.
- **Edit without breaking your flow** — Rotate, delete, preview, undo, and redo directly from the page list.
- **Preserve more from PowerPoint** — Keep high-fidelity slide rendering while retaining searchable/copyable text and vector information for supported shapes.
- **Flexible export when you need it** — Save all pages or only a selection, adjust image placement, and optionally add AES-256 password protection.
- **Private, single-HTML operation** — Required runtimes are embedded, with Japanese/English UI and no need to upload your files to the app.

## Quick start

### Use the web demo

Just [open the demo](https://ttomohisa.github.io/html-pdf-organizer/). No installation or account is required.

### Use the download file

1. Download [pdf-organizer.html](https://github.com/ttomohisa/html-pdf-organizer/blob/main/pdf-organizer.html) from this repository.
2. Open it in a current Chromium-based browser, Firefox, or Safari.

### Use it fully offline(advance)

1. Download or clone this repository.
2. Double-click `build-offline.bat` on Windows.
3. The first build downloads the exact dependency versions pinned in `versions.json`.
4. Copy the generated `dist/index.html` wherever you need it.
5. Open that single file later without an internet connection.

Python, Node.js, and a local web server are not required. The builder uses Windows PowerShell and the built-in `tar.exe`.

## Usage

1. Add one or more PDF, JPG, PNG, WebP, or PowerPoint (PPTX) files. You can drag and drop them together in one batch.
2. PDF pages, images, and PowerPoint slides appear in the same card list. Drag cards to change the order.
3. Select multiple pages and drag one selected card to move the group together.
4. On mobile, briefly hold a card before moving it. A normal vertical swipe scrolls the page.
5. Rotate, preview, or delete pages from the toolbar or card controls. Image cards also let you choose `Fit`, `Fill`, or `Original Size`.
6. Enter an output filename and export all pages or only the selection. On mobile, selecting pages reveals a compact `Save n` action in the same single-row export bar.

### Export options

Normal export saves an unprotected PDF. When needed, use the lock button in the export bar to protect the output with an AES-256 open password. The password is kept only in browser memory and is cleared on reload. If you do not set one, export works exactly as before without password protection.

### Selecting pages

- Click a card to select it.
- Use the checkbox to add or remove that page without clearing the current selection.
- Hold `Ctrl` / `⌘` while clicking to toggle pages.
- Hold `Shift` while clicking to select a range.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl` / `⌘` + `A` | Select all pages |
| `Ctrl` / `⌘` + `Z` | Undo |
| `Ctrl` / `⌘` + `Shift` + `Z` | Redo |
| `Delete` / `Backspace` | Delete selected pages |
| `Esc` | Clear the selection or close the preview |
| `←` / `→` | Move through pages in the preview |

## Publish with GitHub Pages

The repository includes a workflow that builds the fully embedded HTML and deploys it to GitHub Pages automatically.

1. Push the repository to GitHub as `html-pdf-organizer`.
2. Open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
3. Push to `main`, or manually run **Deploy offline app to GitHub Pages** from the Actions tab.
4. After a successful deployment, the demo is available at `https://ttomohisa.github.io/html-pdf-organizer/`.

Each push to `main` rebuilds `dist/index.html` from pinned dependencies, verifies that no external runtime script references remain, and then publishes the result.

See the [GitHub Pages deployment guide](docs/GITHUB_PAGES.md) for detailed setup and troubleshooting.

## Development and build layout

```text
.
├─ src/index.template.html       # Application template
├─ versions.json                 # Pinned dependency versions and embedded paths
├─ build-offline.bat             # Windows build entry point
├─ build-offline.ps1             # Standalone HTML builder
├─ dist/index.html               # Generated deployment artifact
└─ .github/workflows/
   ├─ build-offline.yml          # Pull request build validation
   └─ deploy-pages.yml           # Automatic Pages deployment from main
```

### Update dependencies

Edit the versions and paths in `versions.json`, then run `build-offline.bat` again.

To discard the package cache and download everything again:

```bat
build-offline.bat -ForceDownload
```

The build process automatically:

- Downloads pinned tarballs from the official npm registry
- Gzip-compresses dependency libraries and embeds PDF.js support assets for lazy decompression; CMaps are grouped into small compressed chunks for better cross-file compression
- Records SHA-256 hashes for the tarballs, PDF.js entry, and worker
- Rejects remaining external script references and unresolved placeholders
- Fails the build if the generated HTML exceeds 4.75 MB by default, catching size regressions
- Stops when an incompatible PDF.js package-layout change requires review
- Generates `dist/dependency-manifest.json`

## Privacy and runtime network protection

The generated HTML includes:

- A Content Security Policy containing `connect-src 'none'`
- External `fetch` blocking in both the main thread and PDF.js worker
- A virtual asset loader that serves only data embedded in the HTML
- Blob URLs for the embedded PDF.js module, pdf-lib, and worker

The GitHub Pages version requires an initial HTML request, but the PDF content selected by the user is not transmitted by the app. For use with the network completely disconnected, open the generated `dist/index.html` locally.

`html-pdf-organizer.invalid` is an internal virtual asset key and is never contacted.

## Limitations

- Password-protected PDFs can be opened with the correct password. The input password is not automatically carried over to the output, so set an output password at export time if protection is still required.
- PDF has no standard native WebP image filter, so WebP is converted locally before embedding. Alpha/lossless WebP uses PNG; opaque lossy WebP uses high-quality JPEG.
- Editing a digitally signed PDF invalidates its signature.
- Bookmarks, attachments, forms, signatures, and other document-level data may not be preserved.
- Large PDFs, high-resolution images, and PowerPoint decks with many slides or charts can consume substantial device memory.
- Complex PowerPoint effects, charts, and unsupported content are rasterized for visual fidelity. Supported basic shapes are overlaid as vectors where possible, and a Unicode text layer is added for search/copy.
- Word (DOCX) input is not supported yet.
- The current UI accepts files up to 250 MB each.

## Dependencies

| Library | Version | License | Purpose |
| --- | ---: | --- | --- |
| PDF.js | 6.2.108 | Apache-2.0 | Loading, thumbnails, and preview |
| @aiden0z/pptx-renderer | 1.2.4 | Apache-2.0 | PPTX parsing and DOM/SVG preview |
| pdf-lib | 1.17.1 | MIT | Page copying, rotation, and export |
| @pdfsmaller/pdf-encrypt | 1.2.0 | MIT | AES-256 password protection for exported PDFs |

Drag and drop is implemented directly with Pointer Events and has no drag-library dependency. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for details.

## Contributing

Bug reports and feature proposals are welcome through GitHub Issues. See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidance.

## License

Copyright © 2026 ttomohisa

Licensed under the [MIT License](LICENSE).

