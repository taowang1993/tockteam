# TockTutor Image Lightbox Parity

Source commit: `063d1405`. Bead: `tockteam-zayl`.

The shared Reading, Source, and Live Preview viewer now uses Obsidian 1.13.7's full-window presentation: an 8 px image inset, centered 13 px title in a 32 px titlebar, and a 26 px close control with an 18 px icon. The card and persistent toolbar are removed. Zoom, pan, fit, dismissal, raster validation, and image editing remain. Neutral black/white media chrome is an explicit pinned compatibility seam, not a replacement for ordinary app tokens.

## Review

Total confirmed findings: **3**, all fixed; **0 unresolved confirmed findings**.

1. **Medium — Keyboard Focus Was Not Assigned to the Viewer.** `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/image-viewer.tsx` passed a ref through a shared function component that does not forward it. The prevented autofocus left keyboard zoom/pan unavailable. Fixed by focusing the actual Radix autofocus event target. Verified with a failing-then-passing active-element assertion and real Desktop keyboard/focus-return checks.
2. **Medium — Wheel Zoom Emitted a Runtime Error.** The same file called `preventDefault()` in React's passive wheel listener. Fixed by leaving modal scroll locking to Radix and retaining only propagation control and zoom handling. Real wheel zoom now passes with zero console/page errors.
3. **Low — Live Preview Displayed the Photo Credit Instead of Its Authored Label.** `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/live-preview-editor-runtime.tsx` used Crepe's title-derived DOM alt. Fixed by using the existing Markdown node's authored alt. A regression with distinct `Photo` alt and `Photo Credit` title failed before the fix and passed afterward.

## Rendered Evidence

Installed Obsidian 1.13.7 ran from `/Applications/Obsidian.app/Contents/Resources/app.asar` through guarded generic Electron 42.3.0. No user profile or native executable was opened. TockTutor used an isolated fixture vault and app data. Both captures are 1512 × 949 CSS pixels at DPR 2, producing 3024 × 1898 PNGs, with built-in dark and no skin. The local JPEG is 3872 × 2592; Markdown and asset hashes are unchanged.

Image, titlebar, and close bounds match the settled reference within 0.03 CSS pixels. Default, Navy, Jade, and Ember each passed dark/light checks with opposite system appearance and changes while open. Keyboard/wheel zoom, drag/arrow pan, zero-to-fit, Escape/close dismissal, and asynchronous focus return passed. Capture-time runtime errors: **0**.

Only `tocktutor-image-viewer.png` and `obsidian-image-viewer.png` were transactionally replaced; all 68 other screenshot files retain their hashes. Geometry, states, hashes, and cleanup are recorded in `.agents/uiux/tocktutor/content-alignment.json`. Final owned roots 27000 (TockTutor) and 20159 (Obsidian), plus earlier diagnostic roots, stopped with no descendants.

## Verification

- `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/image-viewer.test.tsx tests/image-resize.test.tsx --environment jsdom`: **15 passed**.
- `node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts`: **12 passed**.
- `pnpm run test:tocktutor`: passed, including **742** workbench component tests and **167** TockTutor tests.
- `pnpm test`: **1,585 passed, 18 skipped, 0 failed**.
- `pnpm run typecheck:tocktutor`, `pnpm run typecheck`, `pnpm run build:tocktutor`, `pnpm run build`, and `node scripts/tocktutor-build-manifest.mjs --check`: passed.
- Scoped `git diff --check`: passed. The repository-wide check reports unrelated, externally owned `AGENTS.md` whitespace; that file was untouched.

### Unverified or Environment-Limited Checks

React Doctor scanned six scoped files and reported no issues, but its maintainability analysis failed non-fatally, so it is not a complete audit. The inline image reader could not display even a reduced preview; geometry, exact source bytes, actual screenshots, and app-scoped interaction evidence were verified through the guarded Playwright capture. No installed/Electron launcher smoke was run because this is a browser-client presentation change, not a launcher/IPC/package change. Unrelated `AGENTS.md`, `tests/right-panel-layout.test.ts`, and pre-existing `.playwright-cli/` files were left untouched. Nothing was pushed.
