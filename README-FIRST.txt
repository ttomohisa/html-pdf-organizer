PDF Organizer - repository bundle

Main source: src/index.template.html
Build offline single HTML: build-offline.bat or .\build-offline.ps1
Output: dist/index.html

Open pdf-organizer.html in a current Chrome, Edge, Firefox, or Safari browser.
This file includes the app and its runtime dependencies. It works offline.

To rebuild after editing the source, run the builder on Windows. The first
build downloads the packages pinned in versions.json. Copy dist/index.html
to pdf-organizer.html to update the checked-in download.
