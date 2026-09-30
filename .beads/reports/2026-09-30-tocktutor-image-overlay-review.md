# TockTutor Floating Image Overlay

Source: `9f6261ec`. Bead: `tockteam-xg9k`.

The user confirmed **Photo over a Dimmed App**, not a separate full-window page. The shared Reading, Source, and Live Preview viewer now has a transparent content layer over a semantic 80% app-canvas backdrop. A separate title/× Close row is below native window controls; its 36 px labeled button is outside the clipped image viewport. No dialog card or bottom toolbar was added. Existing validated raster bytes, zoom/wheel, pan/drag, fit, dismissal, and focus restoration remain.

## Confirmed Findings

Total confirmed findings: **3**, all fixed; **0 unresolved confirmed findings**.

1. **Medium — App Titlebars Escaped the Dimming Layer.** `plugins/skins/src/client/tailwind.css` and `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/image-viewer.tsx`: the original transparent dialog was above the titlebar, but its dimming layer was below it. The panel-left icon therefore remained bright behind the image viewer. Fixed at the existing Desktop shell seam: only an open image-viewer marker lowers custom app titlebars below the backdrop; normal stacking restores on close. Real Desktop checks proved both Close and Escape restoration and prevented activation of the underlying sidebar. Web and ordinary settings are outside this scoped condition.
2. **Medium — Photo and Exit Shared the Same Unbounded Canvas.** `src/image-viewer.tsx`: the 26 px icon-only close control occupied the native titlebar band; transformed media had no separate clipped area. Fixed with a title/× Close row below the native controls, a 36 px shared outline button, and a separate clipped zoom/pan viewport. Tested at 1512, 1478, 640, and 390 px widths, with a long title and maximum zoom eight. The exit remains hit-testable, and title truncation does not push it outside the window.
3. **Low — The Close Control Was Briefly Washed Out During an Appearance Switch.** The shared button's foreground/background transition reached 1.54:1 contrast in the real-app failing check. Fixed locally with `transition-none`; ordinary shared button behavior is unchanged. Fresh dark/light and skin checks while open now measure at least 11.74:1 for the title and close control.

## Verification

- Before changes, the real-app probe showed transparent viewer content, a bright titlebar above its backdrop, and an icon-only close at y=6. The new component and Desktop-scoping regressions failed before implementation.
- `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/image-viewer.test.tsx tests/image-resize.test.tsx --environment jsdom`: **15 passed**.
- `node --test tests/skins.test.ts tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts`: **35 passed**.
- `pnpm run typecheck:tocktutor`, `pnpm run typecheck`, `pnpm run build:tocktutor`, `pnpm run build`, and `node scripts/tocktutor-build-manifest.mjs --check`: passed.
- `pnpm run test:tocktutor`: passed, including **742** workbench component tests and **167** TockTutor tests.
- `node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts`: **12 passed**.
- `pnpm test`: **1,586 passed, 18 skipped, 0 failed**.
- Final `pnpm run build` and manifest check passed after gallery publication.
- Scoped whitespace checks passed. Unrelated `AGENTS.md`, `tests/right-panel-layout.test.ts`, and pre-existing `.playwright-cli/` files remain untouched.

### Rendered Evidence

Guarded generic Electron 42.3.0 loaded the actual Desktop application, not a component-only imitation, on the secondary display without focus. HOME and user profiles were preserved; isolated app data and a copied fixture vault were used. Canonical capture: 1512 × 949 CSS pixels at DPR 2, 3024 × 1898 PNG, built-in dark/no skin, `/tocktutor/Viewer.md`, Image Viewer over Live Preview, identical authored Markdown and 3872 × 2592 JPEG. Only `tocktutor-image-viewer.png` was replaced transactionally; all 69 other screenshot files retain their hashes. The genuine installed Obsidian image is retained as a same-content reference, not claimed as matching the redesigned geometry.

Default, Navy, Jade, and Ember each passed dark/light with opposite system appearance and changes while open. The 1478 × 1106 user-screenshot size, 640 × 720 and 390 × 720 CSS viewports, long-title truncation, maximum zoom/pan clipping, all three editor modes, keyboard/wheel/drag/fit, Tab trapping, Escape/Close/gutter dismissal, focus return, and restored app chrome passed. Runtime errors: **0**. External requests: **0**. Final root PID 64343 and all descendants stopped; diagnostic roots 42919, 50674, and 61260 likewise stopped completely. Facts and hashes are recorded in `.agents/uiux/tocktutor/content-alignment.json`; temporary detailed probes are under `/tmp/tocktutor-viewer-chrome-20260930`.

## Review and Limitations

Applied the code-simplification, security/hardening, and performance references. The fix reuses the shared Dialog and Button, existing theme tokens, and the existing Desktop compatibility utility; no dependencies, Host authority, native-window code, global palette, or second viewer were added. Raster restrictions and modifier-key handling are unchanged.

React Doctor scanned four scoped files and reported no issues, but its maintainability analysis failed non-fatally; no complete score/regression claim is made. The inline image reader could not display either supplied screenshot or a reduced crop; the user's focused clarification supplied the intended overlay behavior. Verification therefore proves app geometry, stacking, contrast, interactions, and captured pixels, not an exact visual match to unreadable reference pixels. No direct/installed launcher smoke was run for this browser-presentation-only change. No push.
