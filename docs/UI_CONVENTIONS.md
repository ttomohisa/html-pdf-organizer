# Common UI v1

Fixed components/ui-conventions.{js,css} and lock embed through scripts/embed-ui-conventions.ps1 in build-offline.ps1. No runtime dependency was added.

This tab holds pages, source bytes, selection, and 60-step edit history. Save all pages as PDF and Save selected pages as PDF export the explicit page scope; output name and password are captured before asynchronous generation. Downloads acknowledge delivery to the browser, not disk completion. Generation cannot be stopped; wait until it finishes. Competing edit controls are disabled. Errors remain visible above the workspace.

Removing pages changes the list only; original files remain intact. Existing history restores removed pages; Undo notifications stay while keyboard focus is inside them. Shared language resolves URL, common key, legacy pdf-organizer-language, browser languages, English, without startup writes. Explicit switching writes the common key and keeps pages/history. Header help and language remain reachable during generation.

Human acceptance pending: check desktop/mobile touch layouts, keyboard focus and modal backdrop/Escape, screen-reader announcements, encrypted and selected PDF downloads. Dense thumbnail and fixed export controls retain their compact geometry; verify touch reachability, alongside 44px header targets. Run build-offline.ps1, copy dist/index.html to pdf-organizer.html, node --test. Decoded release parity is tested.

Review follow-up: persistent operation errors and open password validation translate without being replaced by language-storage notices. Export page metadata is copied before awaits; layout/card controls and direct edit handlers are blocked while busy. Source filenames remain literal in progress.
