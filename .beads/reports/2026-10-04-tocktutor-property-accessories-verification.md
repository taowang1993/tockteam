# Properties Accessory and Matched Reference Verification

Task: `tockteam-qs1w`. Status: **Verified**.

## Confirmed Findings (2)

1. **Low — Accessories were separated from their values.** In `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/live-preview-editor.tsx`, the growing tag input pushed `tags Value Suggestions` to the far edge, and stretching structured text pushed its warning away. The old Desktop reproduced gaps of **292.078 px** and **420.593 px**. **Fixed and verified:** move the existing suggestions button ahead of the input and stop stretching the structured text. The rebuilt Desktop measures **4 px** and **8 px**, while keeping free-form editing, saving, keyboard access, and narrow layouts.
2. **Low — The retained Obsidian references had incomplete frontmatter.** The upper/lower Live Preview references under `.agents/uiux/tocktutor/screenshots/` used an older five-property note. **Fixed and verified:** retake installed Obsidian with the exact nine-property `comparison.md`, then retake TockTutor. Publish only the four allowlisted frames; preserve the previous Obsidian images and metadata in the proof. All **58** other capture files and records are unchanged.

## Rendered Proof

- Four captures use **1512 × 949 CSS pixels**, **2×** device scale, and **3024 × 1898** PNG pixels. Both apps use the exact **1413-byte** comparison note, SHA-256 `6792ccbb22b31fbd55abf417995c5dd0975dd570f4cd7ab8cca4eaa6fb8b84d2`.
- Both upper views show all nine properties. Lower views scroll to **Data**, **Code and Notes**, and **Small Heading** without collapsing Properties; the nine property rows remain present but scroll out of view.
- TockTutor verifies inline `colorScheme === 'dark'` and no root/body skin. Native Obsidian verifies its built-in theme, dark computed body scheme, no custom theme or skin, and the exact property values/types. Obsidian's root inline color scheme is **empty**; it was not changed or represented as `'dark'`.
- Live tag suggestions, free-form tag entry, exact saved YAML bytes, save/reopen, unfinished draft retention across disclosure changes, and Escape focus return passed. The save check accounts for the existing block-list YAML format and preserves all unrelated frontmatter/body bytes.
- The 600-pixel viewport has zero Properties overflow and a visible **2 px** keyboard outline. All eight existing appearance checks passed. Completed tasks retain strikethrough; pending tasks do not gain it.
- Capture-time runtime errors and failed requests: **0**. A cold-start Electron security warning is separate from capture-time errors.
- The gallery decoded all four correct image hashes, showed both image pairs fully, retained **Current Reference** badges, and reported no runtime errors or horizontal overflow.

## Verification Commands

```sh
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/properties-ui.test.tsx tests/properties-suggestions.test.tsx tests/properties-controller.test.tsx tests/property-type-ui.test.tsx tests/property-overlay-ownership.test.tsx --environment jsdom
node --test tests/icons.test.ts tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts tests/tocktutor-gallery.test.ts
pnpm run typecheck
pnpm run typecheck:tocktutor
pnpm -C plugins/ui run typecheck
pnpm run test:tocktutor
pnpm run build:tocktutor
pnpm run build
node scripts/tocktutor-build-manifest.mjs --check
node scripts/stage-dsh.mjs --quick
```

- Test-first: the new tag-control ordering check failed before the source fix. The old real Desktop also failed the spacing assertions before the authorized rebuild.
- Focused components: **41 passed**. Root shared UI/icon checks: **8 passed**. Gallery: **26 passed**. Nested TockTutor suite passed, including **817 workbench component tests** and **13 assistant component tests**; typechecks/builds/manifest/staging passed.
- React Doctor before/after: **0 errors, 5 warnings** in both isolated source scans; no regression.
- The initial nested run hit the existing timing-sensitive `search-index-host-death.test.ts:101` assertion. Its isolated retry and the full nested retry passed. This is not counted as a confirmed bug in this change.
- The optional broad root suite and installed/launcher smokes were not run for this isolated styling change; focused and real Desktop checks cover the touched behavior. Other sessions own SDK acceptance.

## Ownership and Cleanup

`test:tocktutor` has an implicit root build in its nested `pretest`, and the workbench test starts its own build. Those early output writes were identified as this session's side effect, disclosed to both peers, and fingerprinted; no outputs were reverted. Subsequent explicit build/stage writes used the granted writer window. Six frozen SDK source/test hashes matched before, after, and at lease return. Build inclusion is **not SDK acceptance**; no SDK source/report, Git-index, or user-app changes were authorized by these checks.

Owned guard roots **157**, **1331**, and **5182**, with their recorded descendant trees, were stopped. Gallery guard root **7618** and server root/process group **7606** were also stopped and independently checked absent. Playwright lists no browsers. The guard inspection root **92079** was stopped separately. No user cursor, keyboard, native app, preferences, or native DOM was controlled or changed.

Proof, previous references, four source captures, artifact hashes, native state, theme checks, and process receipts:

`.beads/reports/2026-10-04-tocktutor-property-accessories/proof.json`

Gallery:

`.agents/uiux/tocktutor/tocktutor.html`
