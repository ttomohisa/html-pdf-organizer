# Contributing

Issues and pull requests are welcome. Keep the app browser-local and preserve the single-HTML/offline build design.

## Development

1. Edit `src/index.template.html`.
2. Run `build-offline.bat` on Windows. Copy the resulting `dist/index.html` to the repository root as `pdf-organizer.html`, then include the updated download with the source change.
3. Run `node --test` from the repository root. CI uses Node.js 24.
4. Test the generated app with the network disabled. Check selection, drag reorder, preview, undo/redo, and export on desktop and mobile. See the [offline verification steps](VERIFY_OFFLINE.md).

When preparing a release, update the version in `app.config.json` and the version badge in the HTML template. Add a matching entry to `CHANGELOG.md`. After a pull request merges into `main`, the release workflow builds and tests the merged commit, creates the new version tag, and attaches `pdf-organizer.html` to the GitHub Release. The workflow requires an unused tag.

## Automated regression tests

The Node tests check the source template and checked-in standalone HTML, executing the page controller and bundled pdf-lib against synthetic PDFs. Pull requests also run Playwright in Chromium against the built HTML, covering mobile controls, preview and zoom, targeted moves, split ZIP exports, cancelled input passwords, watermarks, page numbers, and JPEG compression. Node regressions cover Unicode filenames and reuse of parsed source PDFs during split export. Browser regressions also combine split export with AES-256 protection, wrong/correct password reopening, page numbers, watermarks and JPEG compression in an offline context. The preview-interaction script captures genuine Japanese and English desktop screenshots from a synthetic PDF under `test-results/mobile-label/`. The **Build offline HTML** run uploads the browser evidence and the offline build as artifacts.

To run the page-controller tests specifically against a fresh build in Windows PowerShell, set `$env:PDF_ORGANIZER_HTML="dist/index.html"` and `$env:PDF_ORGANIZER_BUNDLE="dist/index.html"`, then run `node --test tests/page-order.test.cjs`. Unset both variables afterward. Optionally set `PDF_ORGANIZER_EXPORT_DIR` to write synthetic result PDFs for inspection.

Generated-artifact checks compare unchanged runtime markup/scripts and all decoded dependency bytes. Only CRLF, build timestamp, valid gzip encoding, and equivalent asset chunk ordering may differ between platforms. Invalid payloads and stale runtime remain failures.

## Shared local-processing wording

The Japanese label 完全ローカル処理 uses the English text Fully local processing. Preserve the existing responsive visibility, functional bottom controls, and Help behavior. Detailed privacy/network explanations are unchanged.
