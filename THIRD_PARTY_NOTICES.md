# Third-Party Notices

PDF Organizer is distributed under the MIT License. The generated standalone HTML embeds the following pinned dependencies:

## pdf-lib 1.17.1

- Project: pdf-lib
- License: MIT
- Embedded file: `dist/pdf-lib.min.js` from the npm package during the build

The upstream license text is included in the downloaded npm package cache and the minified distribution retains its upstream notices.

## PDF.js 6.2.108

- Project: Mozilla PDF.js
- License: Apache License 2.0
- Embedded files: browser module, worker module, CMaps, standard fonts, WASM, ICC profiles, and image-decoder assets available in the npm package

The upstream license and asset-specific license files are included in the downloaded npm package cache. Do not delete upstream notices when changing dependency versions.

## Updating dependencies

Edit `versions.json`, run `build-offline.bat`, and review `dist/dependency-manifest.json`, the upstream release notes, and all license files in `.cache` before publishing the new output.
