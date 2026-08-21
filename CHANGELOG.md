# Changelog

## 1.2.1 — 2026-08-21

- Fixed PowerPoint PDF export failing in Chromium because SVG `foreignObject` rendered through a `blob:` URL tainted the export canvas.
- Switched the temporary slide rasterization URL to a self-contained `data:` URL so JPEG generation remains origin-clean.
- Improved PowerPoint media export by inlining blob-backed HTML images, clipped SVG images, tiled picture fills, and chart canvases before rasterization.
- Kept the existing selectable Unicode text layer and compatible SVG vector overlays unchanged.

## 1.2.0 — 2026-08-21

- Added PowerPoint (`.pptx`) input using `@aiden0z/pptx-renderer` 1.2.4.
- Added native DOM/SVG thumbnails and large previews for PowerPoint slides.
- Added hybrid PowerPoint-to-PDF export: a fidelity-preserving slide image, selectable/searchable Unicode text layer, and vector overlays for compatible simple SVG paths.
- PowerPoint slides can be mixed with existing PDF pages and images, reordered, multi-selected, rotated, deleted, previewed, and exported together.
- Kept PowerPoint processing fully local by embedding the standalone browser renderer into the generated single HTML.
- Word input is intentionally not included yet.

## 1.1.0 — 2026-08-20

- Added password-protected PDF input and optional AES-256 password protection for exported PDFs.
- Added show/hide controls to output password fields for easier password entry and confirmation.
- Added JPG / PNG / WebP files as single pages alongside PDFs.
- Added per-image `Fit` / `Fill` / `Original Size` placement.
- Improved image-card placement controls so PDF and image cards stay aligned.
- Refined mobile export UX to keep the fixed save bar to a single row; the selected-page action appears contextually with its page count.
- Improved WebP export: alpha/lossless WebP stays lossless via PNG, while opaque lossy WebP uses high-quality JPEG to avoid oversized PDF output.
- Improved smartphone page editing with a three-column grid, mobile edit dock, and live drag reflow.
- Added undo actions for destructive operations.
- Reduced the standalone HTML size while preserving PDF.js CMaps, standard fonts, and decoding support.

## 1.0.0 — 2026-08-03

- Initial release.
- Added local-only PDF page reordering, rotation, deletion, preview, merge, and export.
- Added Japanese / English UI and fully embedded offline dependencies.
