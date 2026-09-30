# Palace Photo Viewer and Image Resizing Refinement

Source: `8f3bed69`. Bead: `tockteam-d982`.

## Result

- The app behind the photo contributes only 5% through a 95% semantic-canvas dimming layer, reduced from 20% previously.
- A 36 × 36 circular Lucide X replaces visible Close text. The accessible name remains **Close**; shared focus, keyboard, hit target, and immediate appearance-switch behavior remain.
- Surface 26, **Image Resizing**, now uses the palace JPEG in all three examples. TockTutor and genuine installed Obsidian show byte-identical saved Markdown and photo bytes, including 240, 120 × 120, and 96-pixel authored sizes. The reference does not claim identical editing controls.

## Confirmed Findings

Total confirmed findings: **1**, fixed. **0 unresolved confirmed findings.** Requested extra dimming and label removal are design refinements, not additional counted bugs.

1. **Medium — A Full-Radius Class Alone Did Not Make the Exit Circular.** `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/image-viewer.tsx`: during the first implementation, the normal `.rounded-lg` shared-button utility followed `.rounded-full` in emitted CSS, leaving a computed 9 px radius despite equal 36 px sides. This did not satisfy the requested circle. Fixed with the feature-local `!rounded-full` override rather than changing every shared button or adding a dependency. Fresh real Desktop measurements verify equal 36 px dimensions, full radius, center hit testing, and visible X in all eight appearances and narrow layouts; the maximum-zoom image stays clipped below the exit.

## Verification

- Failing component check: `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/image-viewer.test.tsx --environment jsdom`; the old button returned visible text Close instead of empty text. Subsequent failures cascaded from that failed test's still-mounted dialog.
- Real-app failing check recorded an 80% backdrop, visible Close text, 85.195 × 36 button, and 9 px radius. A second rendered check caught the normal-radius CSS precedence before final capture.
- Final focused check: `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/image-viewer.test.tsx tests/image-resize.test.tsx --environment jsdom`: **15 passed**.
- `node --test tests/skins.test.ts tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts tests/icons.test.ts tests/dsh-lucide-icons.test.ts`: **36 passed**.
- Gallery regressions failed before replacing the previous 80%/labeled-button proof and adding the genuine Image Resizing reference.
- `node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts`: **13 passed** after publication.
- `pnpm run typecheck:tocktutor` and `pnpm run typecheck`: passed.
- `pnpm run test:tocktutor`: passed, including **742** workbench component tests, **418** workbench Node tests, and **167** TockTutor tests.
- `pnpm test`: **1,600 passed, 18 skipped, 0 failed**.
- `pnpm run build:tocktutor`, `pnpm run build`, `node scripts/stage-dsh.mjs --quick`, and `node scripts/tocktutor-build-manifest.mjs --check`: passed. The root build/manifest check ran again after publication.
- Scoped whitespace checks passed; unrelated protected changes were not included.

### Rendered Checks

App-scoped Playwright/CDP attached only to owned `extended_display` endpoints on display 17. Generic Electron 42.3.0 loaded the actual Desktop application; installed Obsidian 1.13.7 loaded its genuine `/Applications/Obsidian.app/Contents/Resources/app.asar`, never the native executable. HOME and user profiles were preserved; vaults and app data were isolated.

TockTutor checked Default, Navy, Jade, and Ember in dark/light, opposite system appearance and changes while open; Reading, Source, and Live Preview; keyboard/wheel zoom, drag/arrow pan and fit; 1478 × 1106, 640 × 720, and 390 × 720 CSS viewports; maximum zoom eight; focus trapping/return; Close/Escape/gutter dismissal; and shell-control restoration without activating the underlying sidebar. The actual X is outside the clipped image viewport at x=1460, y=54, 36 × 36 in the canonical window. Minimum title/control contrast: **11.74:1**. Appearance animation remains disabled on this exit only.

Image resizing exercised the real width field and drag handle: 200 → 240 → 280, one Undo to 240, save and reopen. Exact vault bytes match only the intended first width change; the 120 × 120 and 96-pixel neighbors, authored alt, and caption remain. Obsidian renders those exact saved bytes in Live Preview. Viewer input bytes are unchanged. Source JPEG dimensions are **3872 × 2592**.

All four captures verify **1512 × 949 CSS pixels at DPR 2**, yielding **3024 × 1898 PNGs**, explicit built-in dark and no skin. TockTutor's document inline color scheme is dark. Genuine Obsidian owns dark appearance on the body: `theme-dark`, configured theme `obsidian`, and computed body color scheme dark; its empty document inline color-scheme was recorded honestly, not overwritten. Capture-time console/page errors: **0**. External requests: **0**. Original Obsidian user-registry fingerprint and copied fixture `types.json` are unchanged.

Final Desktop root **12891** and Obsidian root **20753**, and diagnostic roots **94515**, **9366**, **18245**, were explicitly stopped with no remaining descendants. One diagnostic Obsidian window reached the guard's ten-minute limit; a fresh guarded run produced the final screenshots. No owned browser/app/server remains.

Publication allowlist: `tocktutor-image-viewer.png`, `tocktutor-image-resizing.png`, `obsidian-image-viewer.png`, `obsidian-image-resizing.png`. Only these staged candidates are published with rollback; **67 unrelated existing images remain byte-identical**. The freshly captured Obsidian viewer PNG is identical to its earlier hash. Detailed state/hashes are in `.agents/uiux/tocktutor/content-alignment.json`. Temporary runnable probes and full logs: `/tmp/tocktutor-viewer-refinement-20260930`.

## Limitations

The supplied PNG and reduced JPEG could not be displayed inline. Local macOS Vision OCR confirmed **SURFACE 26 / Image Resizing**, its saved-width proof, and the previous missing Obsidian reference; no pixel-exact visual-match claim is made. React Doctor scanned four scoped files and found no issues, but maintainability analysis failed non-fatally; the audit/score is incomplete. Its initial broad scans timed out, then a bounded nested-workspace scan returned partial results. No dependency, account, IPC, Host authority, global palette, native-window behavior, or installed-launcher smoke changed. Protected `AGENTS.md`, `tests/right-panel-layout.test.ts`, existing Playwright outputs, and concurrent Raycast/account work remain untouched. No push.
