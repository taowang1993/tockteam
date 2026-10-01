# TockTutor Properties Functional-Parity Verification

## Result

The approved Properties workflows are implemented and verified against webobsidian `c41967a93317b2a0f08511c349ef3dbaf78fc882`. Product source checkpoint: `e193bf3f`. Independent source/evidence review found **0 new confirmed findings**, found no blocking gap within the approved scope, and supports closing the verification slice and epic.

The user-requested screenshot comparison now lives in `.agents/uiux/tocktutor/tocktutor.html`, with fresh installed Obsidian 1.13.7 and TockTutor captures recorded in `content-alignment.json` under `propertiesEditingRefresh`. The separate proof gallery was removed. This report's earlier webobsidian observations and retained reference PNG are historical functional evidence only; their serializer differences are not claims about installed Obsidian.

This is functional verification of the supported workflows, not a claim of identical pixels, every possible value, or identical reference keyboard behavior. TockTutor deliberately keeps the safer writing and recovery rules approved in the plan.

## Real-App Evidence

Both apps used copies of the same `Properties.md`, `More.md`, and `.obsidian/types.json` fixtures. The supporting note hashes match. The reference checkout revision was rechecked before the final run; its copied, built server and Web app ran only against temporary vault and state directories.

The parent drove actual pointer and keyboard actions through Playwright attached only to the CDP endpoints returned by `extended_display`. All captures used 1512 × 949 CSS pixels, device scale 2, and 3024 × 1898 PNG pixels. TockTutor used its built-in dark appearance with no skin on the document or body; the reference used its dark appearance. No user profile, vault, settings, plugins, cursor, or system clipboard was used.

Verified in both apps: ordinary property names, rename, editing and adding list items, `#new tag` → `new-tag`, indexed name/tag suggestions, free-form entry, copying `existing, new-tag`, adding/removing a temporary property, all six type-menu choices, and list-to-text conversion. The reference save returned HTTP 200 and its converted value survived reload.

Additional TockTutor checks passed: inline/sidebar updates agree; the Properties/Assistant toggle retains an unfinished list draft; menu Escape/outside dismissal and trigger focus work; conversion shows old/new values and requires explicit loss approval; Escape returns focus; saving updates actual vault bytes; a fresh app reads the saved value and remembered type; unsafe structured YAML retains “Use Source Mode”. The removed Unlink/Pin/Close toolbar stays absent and the titlebar sidebar toggle remains.

An actual malformed-registry failure displayed “Property-type settings could not be saved safely. Your note is unchanged.” The confirmation stayed open, the exact note and malformed settings bytes stayed unchanged, and cancellation/reload recovered normally after the owned fixture was restored. Actual recovery files retain the original two-item list. In a fresh isolated app, the captured owned snapshots were imported as fixtures; the visible recovery list and original-value preview worked, with both “Restore Original” and “Restore as New” available. Neither restore action was executed.

All eight built-in/skin appearance combinations passed measured confirmation text/action contrast, including dark-app/light-system and light-app/dark-system cases. Minimum measured contrast was 5.55:1. The sidebar is bounded to 909 pixels inside the 949-pixel viewport; the confirmation is centered in the full viewport rather than the sidebar. Final renderer/console error counts were zero. TockTutor reported two existing warnings; the reference reported none.

The original functional-run screenshots were published transactionally from an allowlist of exactly three files; the canonical gallery's fresh installed-Obsidian pair has separate provenance in `propertiesEditingRefresh`. Proof, hashes, exact before/after files, recovery source, appearance measurements, and action results:

```text
/Users/taowang/projects/tockteam/.beads/reports/2026-10-01-tocktutor-properties-proof/proof.json
/Users/taowang/projects/tockteam/.agents/uiux/tocktutor/tocktutor.html
```

## Confirmed and Fixed Findings

**Total confirmed findings fixed during implementation/review: 6.** Listed from highest to lowest severity.

1. **High — Literal comment text could be corrupted.** Editing a value interpreted `$&`, `$'`, and `$`` inside authored YAML comments as replacement instructions. Affected path: `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/properties.ts`. **Fixed:** use a replacement callback. RED/GREEN regression tests and exact-byte checks pass; comments, nesting, line endings, and note content remain intact.

2. **High — Registry capacity could fail after an invalid write.** Adding a type to a full 1,000-entry registry could write an oversized registry and fail on reread, leaving a partial result. Affected path: `plugins/tocktutor/packages/tockbot-note-runtime/src/index.ts`. **Fixed:** reject a new entry before writing, while allowing existing keys to change at capacity. RED/GREEN registry and full owning-package checks pass.

3. **High — Properties overlays were behind the workspace.** Body-portaled menus and suggestions could be visible but not clickable beneath the route. Affected paths: workbench `src/live-preview-editor.tsx`, `src/property-suggestions.tsx`, and `plugins/ui/src/popover.tsx`. **Fixed:** menus and suggestions use their existing local ownership pattern; shared defaults remain unchanged. Component RED/GREEN and actual pointer, keyboard, dismissal, and focus checks pass.

4. **Medium — Empty values could not receive a type.** Null was incorrectly treated like unsupported structured YAML. Affected path: workbench `src/live-preview-editor.tsx`. **Fixed:** allow safe type assignment to null while keeping structured/duplicate-name guards. RED/GREEN UI checks and full nested verification pass.

5. **Medium — Long Properties lists grew outside the window.** The sidebar's automatic minimum height defeated its existing scroll owner and put “Add Property” below the viewport. Affected path: workbench `src/route.tsx`. **Fixed:** add the owning sidebar's `min-h-0` guard. Component RED/GREEN checks and actual bounded geometry/scrolling/click-through pass.

6. **Medium — Confirmations were cramped or hard to read.** Inline modals inherited the translated sidebar's placement and button text rules; muted/warning text also missed the required contrast in the default dark appearance. Affected paths: workbench `src/live-preview-editor.tsx` and `plugins/ui/src/alert-dialog.tsx`. **Fixed:** reuse the established workbench body-modal/overlay recipe and matching semantic foregrounds for important messages. Shared defaults remain unchanged. RED/GREEN, centered geometry, explicit approval/cancel/focus, live error recovery, and all eight appearance checks pass.

## Intentional Safety and Accessibility Differences

- TockTutor changes only the intended YAML ranges. The reference's full rewrite dropped comments and the Unicode key, and flattened a nested value into another top-level property. TockTutor retained them, plus the exact note body.
- TockTutor preserves unknown settings and the literal `9007199254740993`. The reference rounded it to `9007199254740992`. Writes remain limited to the current vault's fixed `.obsidian/types.json` path, with revision/generation and filesystem guards.
- TockTutor previews risky conversions, requires approval, and retains recovery copies. The reference converts immediately and continues locally if type persistence fails.
- TockTutor respects the stored Text choice for `aliases`; the reference saves Text but continues to show that built-in property as a list chip.
- TockTutor uses accessible shared menus/listboxes and preserves drafts. Reference pointer behavior was exercised; identical reference keyboard semantics are not claimed.

## Checks Actually Run

Final checks passed:

```sh
pnpm --filter @tockteam/ui run typecheck
pnpm run typecheck:tocktutor
pnpm run test:tocktutor
pnpm run build:tocktutor
node scripts/tocktutor-build-manifest.mjs --check
pnpm run typecheck
pnpm test
pnpm run build
node scripts/stage-dsh.mjs --quick
```

The nested run includes **429 workbench Node tests, 787 workbench component tests, and 13 assistant component tests**, plus the other owning-package suites. Root `pnpm test`: **1,624 passed, 0 failed, 18 skipped**.

Smallest overlay/message regression command, run RED before the fixes and GREEN afterward:

```sh
cd plugins/tocktutor/packages/tockteam-tocktutor-workbench
pnpm exec vitest run --environment jsdom tests/property-overlay-ownership.test.tsx tests/property-type-ui.test.tsx tests/properties-suggestions.test.tsx
```

Final focused result: **16/16 passed**. Sidebar minimum-height regression: `pnpm exec vitest run --environment jsdom tests/properties-sidebar.test.tsx`, **3/3 passed**. Literal-comment, capacity, and null regressions also ran RED/GREEN before their fixes.

## Review, Limits, and Cleanup

Independent source reviews resolved the original three findings and reported **0 new confirmed findings**, with an “OK with notes” verdict. They did not drive the GUI; the parent produced the actual app evidence above. The final independent read-only review confirmed the report against the source, exact files, recovery copy, screenshots, and recorded measurements, with an “OK with notes” verdict. Its saved result is `2026-10-01-tocktutor-properties-proof/independent-review.md`.

Copy was verified through an app-scoped clipboard stub; the system clipboard was untouched. Recovery preview/actions were verified without overwriting the live note. Pixel identity, reference keyboard equivalence, and production clipboard/OS permissions are not certified. A previous touched React Doctor run scored 83/100. A score rerun timed out and process inspection was denied. A final bounded changed-source scan (`CI=1 react-doctor plugins/tocktutor/packages/tockteam-tocktutor-workbench --scope changed --base 1679c334 --yes --no-supply-chain --no-score --no-parallel --max-duration 30 --verbose`) scanned five files with no diagnostics, but reported incomplete results because its maintainability checks failed. No complete final score/regression or earlier scanner-cleanup claim is made; these tool limitations are not counted as product bugs.

Final guarded instances stopped with no remaining descendants: TockTutor root PID **66944** (11 recorded processes), reference **71141** (6), and reopened TockTutor **71780** (31). Earlier attempt instances were also stopped; all named Playwright sessions were closed. No installed or long-lived smoke command ran.

Unrelated edits in `AGENTS.md`, `tests/right-panel-layout.test.ts`, and the remaining `tests/route-linked-panes.test.tsx` hunks are preserved and unstaged. Only the previously approved test expectation hunks were committed. Generated outputs were rebuilt through the owning scripts, never hand-edited. No dependencies, extra composition/runtime/theme layers, worktrees, or push were introduced.
