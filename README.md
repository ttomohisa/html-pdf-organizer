# PDF Organizer

[![GitHub Pages](https://github.com/ttomohisa/html-pdf-organizer/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/ttomohisa/html-pdf-organizer/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Single HTML](https://img.shields.io/badge/distribution-single%20HTML-0ea5e9)](https://ttomohisa.github.io/html-pdf-organizer/)

[日本語版 README](README.ja.md)

A privacy-focused, single-HTML app for reorganizing PDF pages without uploading the selected files to a server.

## 🚀 Live demo

### [Open PDF Organizer on GitHub Pages](https://ttomohisa.github.io/html-pdf-organizer/)

GitHub Pages delivers the initial HTML. After it loads, PDF parsing, thumbnails, reordering, rotation, preview, and export are processed locally on your device. The PDFs you select are not uploaded by the app.

[![PDF Organizer screenshot](assets/screenshot.png)](https://ttomohisa.github.io/html-pdf-organizer/)

## Features

- Reorder pages by dragging anywhere on a card
- Move multiple selected pages together with a visible stacked drag preview
- Prioritize normal touch scrolling on mobile and start dragging only after a short hold
- Fast edge auto-scroll while dragging beyond the visible area
- Rotate or delete one or more pages
- Preview pages by double-clicking or using the preview button
- Merge pages from multiple PDFs
- Export all pages or selected pages only
- Undo and redo
- Japanese and English UI in the same HTML
- Responsive light and dark layouts
- Embedded SVG favicon
- Embedded PDF.js, pdf-lib, worker, fonts, CMaps, WASM, and related runtime assets

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

1. Add one or more PDFs.
2. Drag cards to change the page order.
3. Select multiple pages and drag one selected card to move the group together.
4. On mobile, briefly hold a card before moving it. A normal vertical swipe scrolls the page.
5. Rotate, preview, or delete pages from the toolbar or card controls.
6. Enter an output filename and export all pages or only the selection.

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
- Embeds dependency files and PDF.js support assets into one HTML file
- Records SHA-256 hashes for the tarballs, PDF.js entry, and worker
- Rejects remaining external script references and unresolved placeholders
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

- Password-protected PDFs are not supported.
- Editing a digitally signed PDF invalidates its signature.
- Bookmarks, attachments, forms, signatures, and other document-level data may not be preserved.
- Large or image-heavy PDFs can consume substantial device memory.
- The current UI accepts files up to 250 MB each.

## Dependencies

| Library | Version | License | Purpose |
| --- | ---: | --- | --- |
| PDF.js | 6.2.108 | Apache-2.0 | Loading, thumbnails, and preview |
| pdf-lib | 1.17.1 | MIT | Page copying, rotation, and export |

Drag and drop is implemented directly with Pointer Events and has no drag-library dependency. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for details.

## Contributing

Bug reports and feature proposals are welcome through GitHub Issues. See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidance.

## License

Copyright © 2026 ttomohisa

Licensed under the [MIT License](LICENSE).
