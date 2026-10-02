# TockTutor Properties Alignment — 2026-10-02

## Result

Compact side-by-side Properties rows replace stacked boxed fields. Properties and Assistant are separate accessible titlebar icon buttons, not a segmented sidebar header. Editing, type/row menus, list chips, structured-value safety, unfinished drafts, and exclusive keyboard selection remain intact. Source checkpoints: `631a9046`, `3867c5e8`, `379938f0`.

Only three Workbench UI source files changed: `src/route.tsx`, `src/linked-note-pane.tsx`, and `src/live-preview-editor.tsx`, under `plugins/tocktutor/packages/tockteam-tocktutor-workbench/`. Reused existing ToggleGroup/Tooltip/Button/Input primitives, semantic colors and Tailwind discovery. No new dependencies, shared-control recipe, palette, Host authority, IPC, profile, or agent-loop changes.

Only two explicitly user-approved old assertions in protected `tests/route-linked-panes.test.tsx` were committed. Reverse-hashes reconstruct all pre-existing user bytes. `AGENTS.md`, `tests/right-panel-layout.test.ts`, unrelated test hunks, and old untracked Playwright artifacts remain untouched. Native peer source/build/stage/index/display leases were coordinated; actual captured source/build hashes are retained in canonical metadata.

## Confirmed Findings

**Total: 3 confirmed scoped findings, all fixed and verified; 0 unresolved confirmed findings.**

1. **Medium — Structured preview was hard to read in built-in light mode.** Impact: the nested YAML value and Source Mode warning glyph had 1.98:1 contrast. Affected path: `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/live-preview-editor.tsx`. Fixed locally with semantic `light-dark()` colors in statically discoverable markup: normal text in light, warning color in dark. Real default/skin captures now measure at least 7.76:1 for this hint; built-in light is 17.40:1. No catalog or shared color change.

2. **Low — Tooltips overrode the new titlebar button's visual selected state.** Impact: the semantic radio remained correctly checked but its selected highlight disappeared because Tooltip and ToggleGroup both use `data-state`. Affected path: `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx`. Fixed selected styling against `aria-checked`, verified in the real app across eight appearances and keyboard switches. The original rendered transparent-background check failed before the fix.

3. **Low — Property-type icons retained browser-default borders.** Impact: boxed type controls conflicted with the compact native reference. Affected path: `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/live-preview-editor.tsx`. Explicit `border-0` removes the inherited unstyled button border at the shared trigger. Real final capture shows bare type icons; existing menus still open and cancel correctly.

## Verification

- RED first: titlebar-placement/compact-row component checks, rendered selected-highlight check, measured 1.98:1 light-preview contrast, and canonical gallery tests before new metadata/publication.
- Focused component command: `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/properties-sidebar.test.tsx tests/route-panel-controls.test.tsx tests/route-linked-panes.test.tsx tests/properties-ui.test.tsx tests/property-type-ui.test.tsx tests/properties-suggestions.test.tsx --environment jsdom --maxWorkers=4` — 182 passed. Later selected/contrast-focused reruns passed.
- Full workbench: 788 component tests and 429 Node tests passed; other nested Node checks 99 + 216 + 15 passed. One existing five-second CodeMirror capped-search timeout passed unchanged in isolation and the bounded full rerun.
- `pnpm run typecheck:tocktutor`, `pnpm run build:tocktutor`, `pnpm run typecheck`, `pnpm run build`, `node scripts/stage-dsh.mjs --quick`, and `node scripts/tocktutor-build-manifest.mjs --check` passed.
- Final `pnpm test`: **1,670 passed, 0 failed, 18 optional skips**. An unrelated 20ms Simple File Search deadline test failed once under parallel root load; its unchanged focused test and exact full retries passed. No unrelated source/time-budget fix or waived assertion.
- `node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts` — **19 passed**. Verifies current image hash/geometry, native reference preservation, 29-pixel inline rows, titlebar buttons, nine matched row positions, eight appearance/contrast cases, draft/focus/narrow proof and cleanup.
- React Doctor scoped lint scan: no issues. Maintainability analysis timed out and numerical scoring was disabled; a complete score gate is not claimed.

Guarded generic Electron on display 17, app-scoped Playwright over returned owned CDP only. Exact 1512 × 949 CSS pixels at DPR 2 produces unmodified 3024 × 1898 PNGs. Live Preview uses built-in dark, no root/body skin, collapsed inline Properties and a 470-pixel sidebar. All nine row positions match the installed Obsidian reference within 0.5 CSS pixels. At 240 pixels, client/scroll width is 240 with no overflow. Keyboard selection, unfinished list draft across view switches, and closed-panel focus exclusion passed.

Default Dark/Light and Navy/Jade/Ember in both modes were checked with opposite simulated system appearance. Minimum name/value/Source Mode hint/selected-icon contrast: **5.34 / 12.54 / 7.76 / 9.50 : 1**. Canonical dark/no-skin was restored. Capture/appearance errors and external requests: zero; one pre-existing Vue bundler warning is recorded.

## Canonical Screenshot and Provenance

Only `.agents/uiux/tocktutor/screenshots/tocktutor-imported-properties.png` was transactionally replaced, SHA-256 `fcc3d0f99c074d56fdd4deeb303933ace8084884f483cc5f53b90cc52460ed1e`. The already installed Obsidian 1.13.7 reference remains byte-identical, SHA-256 `22c5efa5ffe4dfa97c1a0f29b23dca62f3757c1dc0b9e1c64e3799c7044fa236`; all 71 unrelated captures also remain unchanged. No new Obsidian launch, installation, update, user profile/vault, account, Keychain or system-clipboard operation.

The note remains 1,413 bytes, SHA-256 `6792ccbb22b31fbd55abf417995c5dd0975dd570f4cd7ab8cca4eaa6fb8b84d2`; the 170-byte registry remains `2a9367198f8ac89fc22fbc76c6a8d4372803559a3c0d9306bed8bac7d65c8fb2`. The shared original Markdown body is unchanged. The canonical gallery remains `.agents/uiux/tocktutor/tocktutor.html`, with current evidence in `propertiesLayoutRefresh` in `content-alignment.json`; the previous paired retake is now explicitly historical, not relabeled.

Final rendered gallery decodes both images, retains 29 surfaces/66 unique images, and has no runtime, request or HTTP errors. Temporary app roots 40888, 46267, 50977 and 58717 stopped with all recorded trees; remaining descendants are empty. Gallery roots 60319 and 63663 likewise stopped; server roots 60300 and 63655 are absent, ports closed, Playwright detached. No temporary verification tree is left running.

## Limits

Row spacing is aligned, not exact pixel identity: native date/list controls, structured-value rendering and note typography still differ. This pass does not repeat exhaustive installed-Obsidian functional, save/recovery or account/native-effect certification. Harness fixes for a hidden-role locator, asynchronous arrow focus, full skin IDs and RGB-versus-sRGB parsing are verification corrections, not product findings. No push. Restart Electron to load the UX changes; reloading the gallery alone is sufficient for its screenshot update.
