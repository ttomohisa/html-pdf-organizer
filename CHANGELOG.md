# Changelog

## 1.1.0 — 2026-08-03


- Renamed the project to **Paper Playground**.
- Added Parrondo's Paradox.
- Added FPUT Recurrence.
- Added the Minimal Naming Game.
- Added the BML Traffic Model.
- Added Daisyworld.
- Expanded the catalog and both README files to ten simulations.

## 1.0.0 — 2026-08-03

- Initial five simulations: Kac Ring, Yard-Sale Wealth Exchange, Axelrod Cultural Dissemination, El Farol Bar Problem, and Granovetter Threshold Model.

## Unreleased

- Reduced the standalone HTML by about 13% by excluding PDF.js helper modules unused by this app and packing CMaps into small gzip chunks while preserving rendering support.
- Tightened the default standalone-size regression guard from 6 MB to 4 MB.

- Added password-protected PDF input support. Correct passwords are requested in-browser, and edited output is saved without password protection.

- Smartphone page grid changed to three columns.
- Added live card reflow while drag-reordering before drop.
- Added app-like mobile edit dock and simplified per-card actions.
- Added Undo action to deletion/clear-all toasts.
- Reduced standalone HTML size by gzip-compressing embedded dependency payloads during the offline build.
- Added a default 6 MB build-size guard to catch future dependency-size regressions.
