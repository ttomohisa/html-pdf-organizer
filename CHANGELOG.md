# Changelog

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
