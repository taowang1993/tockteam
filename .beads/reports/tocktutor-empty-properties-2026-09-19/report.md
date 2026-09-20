# Quieter metadata-free notes

Beads: tockteam-3we. Captured 2026-09-19T08:28:06.743Z.

Design read: daily note reading benefits from making content primary and keeping optional metadata unobtrusive. The supplied Obsidian reference omits an empty Properties section; TockTutor reserved a large block above the note for it. Both TockTutor modes now omit the empty section while notes with metadata retain existing controls.

This run resumed the interrupted implementation: live-preview-editor.tsx shows Properties only when parsed fields exist. route.tsx adds Add Property to More Note Actions using the existing note value dialog and onSetProperty boundary. It rejects blank and duplicate names, preserves input on failure, cancels without a write, and is disabled for non-Markdown documents or unavailable handlers. No dependency or Host changes. Previous uncommitted work preserved; no commit or push.

Verification:
- Previous RED logs /tmp/tutor-empty-red.log and /tmp/tutor-empty-action-red.log show missing-property-menu and empty-header failures before implementation.
- pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx tests/route-panel-controls.test.tsx --environment jsdom — 109 tests passed.
- pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench typecheck — passed.
- node scripts/tocktutor-build-manifest.mjs — passed against prior successful workbench/root build and quick stage. This run made test/evidence changes only; implementation was already built by the interrupted run.
- node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts — 4 passed; git diff --check passed.
- React Doctor package score 69, same four pre-existing complexity warnings.
- node /tmp/tutor-empty-verify.mjs — real isolated Electron, Playwright CDP, Reading and Live Preview at 1512 and 820 widths. Empty header absent, no overflow, matching body heading top 173.5 CSS pixels; first property through keyboard-accessible note actions, focus, blank/duplicate validation, Escape, existing metadata, and Source Mode verified. Explicit Cmd+S persists fields while original Markdown body remains exact; canonical shared note hash unchanged. First harness attempts assumed autosave or sent save outside the workbench; fixed to focus the workbench and explicitly save before checking disk.
- Six fresh screenshots inspected, plus matching prior before/Obsidian references. Exact geometry, note route/content/mode, explicit dark/no skin and file hashes recorded. No TockTutor page/console errors during verification; known unrelated TockCoder startup/CSP messages appeared on initial CLI attachment.
- All launched app trees, including earlier interrupted-run captures and retries, are stopped and verified before transactional allowlisted publication. CLI detached.

Test diagnosis: a malformed empty Canvas fixture in the new disabled-action test triggers an existing CanvasBoard state-effect loop. Inspector traced repeated setSelectedNodeIds(new Set()) while document is null. That separate defect is tracked as tockteam-v2r. The disabled-action test now uses valid empty Canvas JSON, and closes the menu before cleanup. Also updated the existing stale max-w-3xl assertion to the already-implemented 700px column. No diagnostic instrumentation remains.

Next candidates: H4–H6 typography and remaining document-title/body spacing compared with Obsidian. Avoid repeating this completed empty-properties improvement.
