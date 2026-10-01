# Properties in the Shared Right Sidebar

Issue: `tockteam-v3zg`. Source checkpoints: `d61d777a`, `87f870a9`.

## Result

Properties now opens beside the full-height note, in the same resizable sidebar as Assistant. The shared selector uses keyboard-accessible radio controls. Switching keeps both views mounted while excluding hidden controls from interaction and the accessibility tree. Properties retains its exact linked note identity, Pin/Unpin, guarded edits, and save controls. Other linked panes keep their layouts. Older saved Properties splits restore as right-sidebar inspectors.

Saved date, checkbox, and exponent-number edits were reopened successfully. Unsubmitted list entries and unsent Assistant text survived same-note switching; changing notes still resets Assistant drafts as before. Pinning Properties preserved its source while another note opened. The copied note and read-only type registry match the genuine Obsidian reference content.

## Confirmed Findings

Total confirmed findings: **2**, fixed and verified.

1. **Medium — list-entry controls could clip at the new 300-pixel sidebar width.** The list form shared a row with existing chips and could shrink below the input's minimum width. Affected path: `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/linked-note-pane.tsx`. Fixed with the owning inspector's full-row list-form recipe; the shared editor and unrelated callers are unchanged. Verified by the focused component regression and real Desktop checks at 600 and 390 CSS pixels, with no input or document overflow.

2. **Low — the initial screenshot destination conflicted with the canonical gallery's exact inventory.** Adding unrelated proof images there failed its enumeration check. Affected path: `.agents/uiux/tocktutor/screenshots`. Moved only this task's new images into `.beads/reports`, without refreshing any gallery baseline or metadata. Verified: `node --test tests/tocktutor-gallery.test.ts` passed 14/14; all 73 original images are unchanged.

## Verification

- Red checks: session/sidebar regressions failed before implementation; real Desktop bounds caught the list clipping before its follow-up fix.
- `pnpm run typecheck` and `pnpm run typecheck:tocktutor` passed.
- `pnpm test`: 1,607 passed, 18 skipped, zero failures.
- `pnpm run test:tocktutor`: 1,148 Node tests and 756 component tests passed. After the clipping correction, `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/route-linked-panes.test.tsx tests/route-panel-controls.test.tsx tests/route-split-panes.test.tsx --environment jsdom` passed 156/156.
- `pnpm run build:tocktutor`, `node scripts/tocktutor-build-manifest.mjs --check`, `pnpm run build`, and `node scripts/stage-dsh.mjs --quick` passed; generated outputs were built, not hand-edited.
- Guarded, app-scoped Electron/Playwright proof passed: switch/draft retention, note binding, keyboard selection/resize/Save-button activation, hidden/inert state, close/reopen, 600/390-pixel layouts, normal-motion rapid reversal, and reduced motion.
- Built-in light/dark and Navy/Jade/Ember were checked against the opposite system appearance. All eight combinations had eight properties, no control overflow, and selector text contrast of at least 10.7:1.
- Canonical screenshots: 1512 × 949 CSS pixels, 2× scale, 3024 × 1898 PNG pixels, Live Preview, built-in dark, no skin on document or body. Runtime errors and external requests: zero; final console errors: zero.
- Both owned Electron/runtime trees were explicitly stopped: roots 93150 and 95999, 17 recorded PIDs each, zero descendants remaining. The window stayed on display 17 without focus. Playwright detached; no verification app/server was left running.
- Only the two new allowlisted screenshots were published. All 73 existing screenshots, protected files, user profiles, and unrelated peer changes were left untouched. No push or account work.

## Verification Limits

React Doctor's changed-file scan reported existing complexity warnings in the owning route/linked pane and a test-only JSON clone warning, not correctness bugs. Its baseline scan timed out, so a numeric before/after score is unavailable. The repository's 18 skips are not counted as confirmed bugs.

## Screenshots

Properties:

```
/Users/taowang/projects/tockteam/.beads/reports/tocktutor-properties-right-sidebar.png
```

Assistant:

```
/Users/taowang/projects/tockteam/.beads/reports/tocktutor-assistant-right-sidebar.png
```

Proof:

```
/Users/taowang/projects/tockteam/.beads/reports/2026-10-01-tocktutor-properties-sidebar.json
```

Restart Electron to see the updated sidebar.
