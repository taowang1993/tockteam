# Inline Properties Verification

Task: `tockteam-ae0l`. Confirmed findings: **2**, both fixed and verified.

1. **Medium — Permanent Boxes and Oversized Inline Values.** Editable Properties above the note used the default boxed controls, unlike the compact sidebar and Obsidian reference. Affected path: `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/live-preview-editor.tsx`. Reused compact, transparent, borderless rows and controls without changing editing callbacks, shared primitives, or disclosure behavior. The component regression failed first; the real Desktop now shows 24-pixel value controls and 29-pixel rows. Source/test/generated output saved in `fdde9d0d`.
2. **Low — Narrow-Window Tag Overflow.** The first compact-row implementation overflowed by four pixels at a 600-pixel window width. Affected path: the same file. The value/name split now scales down, and tag chips include their padding within their maximum width. The real browser check failed before the correction and passed afterward: all nine rows and their parent have identical client/scroll widths of 224 pixels.

## Verification

- `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/properties-ui.test.tsx tests/properties-sidebar.test.tsx tests/route-panel-controls.test.tsx tests/route-linked-panes.test.tsx tests/property-type-ui.test.tsx tests/properties-suggestions.test.tsx tests/property-overlay-ownership.test.tsx tests/editor-adapters.test.tsx --environment jsdom --maxWorkers=4`: **300 passed**.
- `pnpm run test:tocktutor`: **816 workbench + 13 assistant tests passed**.
- `pnpm test`: **1,828 passed, 18 existing optional skips, zero failures** before returning the shared source lease.
- `pnpm run typecheck:ui`, `pnpm run typecheck:tocktutor`, `pnpm run typecheck`, `pnpm run build:tocktutor`, `pnpm run build`, `node scripts/stage-dsh.mjs --quick`, and `node scripts/tocktutor-build-manifest.mjs --check`: passed.
- `node --test tests/tocktutor-gallery.test.ts`: verifies the current images, archived evidence, preserved references, expanded disclosure, borderless appearance, and final gallery proof. Its updated styling assertion failed before publication.
- Complete, isolated React Doctor scans of the original and final source file: **zero errors and five existing warnings in both**, no new warning categories; both large-function complexity measures decreased. The earlier repository scan was time-limited and is not treated as a clean complete scan. No remote score was requested.

Real Desktop checks used only owned, guarded extended-display instances. Editing a separate test note, adding a tag, saving, closing/reopening, exact saved-file bytes, unfinished-input retention across disclosure, and type-menu Escape/focus return passed. Sidebar input styles and row geometry match the pre-fix measurements. Keyboard focus remains visible with a two-pixel outline.

Default, Navy, Jade, and Ember each passed in Light and Dark, including appearance opposite to the emulated system preference. Minimum measured value contrast was **11.74:1**; the structured-source hint minimum was **8.49:1**. Runtime error arrays were empty. The canonical captures explicitly use the built-in dark appearance, no active skin, Properties expanded, and 1512 × 949 CSS pixels at 2× scale, producing 3024 × 1898 images. Completed task text remains crossed out; pending text does not.

## Publication and Boundaries

Only the two TockTutor Live Preview images were replaced transactionally. All other **60** capture images and metadata records, including every Obsidian reference, were preserved. Both gallery pairs decoded, displayed fully, retained their honest Earlier Reference badges, and passed error/overflow checks. Prior Properties-expanded and completed-task proofs remain archived.

The proof records source/artifact hashes, interaction and appearance checks, capture geometry, and cleanup. All owned app/browser/server runs are stopped; the earlier diagnostic root is also absent. The SDK source bytes matched their frozen record at the explicit lease handback. Later peer SDK edits are separately owned; these TockTutor checks do not accept that work. No push or user-app control occurred.

Evidence: `.beads/reports/2026-10-03-tocktutor-inline-properties/proof.json`.

## Separate Concerns

An appearance-navigation attempt after closing a linked test view did not restore an editor. That concern was not investigated or classified as an introduced bug here. Final appearance/capture checks ran in a separate clean owned profile. The five pre-existing Doctor warnings are scanner observations, not additional confirmed findings in this scoped report.
