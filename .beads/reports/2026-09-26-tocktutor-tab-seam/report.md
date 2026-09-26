# Active Tab–Editor Seam

Active tabs now join the editor without a bottom line. The separator remains outside each active tab, including right and lower splits. Inactive hover/close behavior is unchanged.

## Correction

The tab already had zero bottom-border width. Its parent's real border remained exposed because the tab strip clipped the overlap. Painting the separator as an inset line lets active tabs cover it without changing the 40px bar. `PaneTabs` now derives its fill from the editor's existing main-pane token, including lower panes. While TockTutor is active, the underlying Desktop titlebar uses border-box sizing and no shadow so its former 41px border/shadow cannot leak below the replacement titlebar. Other Desktop routes retain their existing styling.

## Verification

- RED: screenshot pixels showed `21,21,23` → `43,43,43` → `21,21,23` through the active-tab seam. Light verification additionally caught the underlying titlebar shadow (`250,250,250` instead of `255,255,255`).
- GREEN: `playwright-cli -s=tabs run-code --filename=/Users/taowang/projects/tockteam/scripts/tocktutor-tab-seam-checks.js` passed 19 assertions in each of six appearances. It samples every device-pixel row across six CSS pixels at three positions per active tab, in single/right/lower layouts, and confirms the divider remains elsewhere.
- Final guarded app also passed `scripts/tocktutor-pane-divider-checks.js` (47 assertions) and `scripts/tocktutor-tab-hover-checks.js` (13 assertions).
- All captures: 1512 × 949 CSS at 2×, PNG 3024 × 1898; app appearance tested against opposite system appearance. Canonical published captures use built-in dark and no skin on html or body. Route `/tocktutor/Original.md`, Live Preview, zero observed runtime errors. All nine owned Electron/runtime trees stopped with no remaining descendants.
- `cd plugins/tocktutor/packages/tockteam-tocktutor-workbench && ./node_modules/.bin/vitest run tests/route-panel-controls.test.tsx tests/route-split-panes.test.tsx tests/route-note-context-menu.test.tsx --environment jsdom`: 113 passed.
- From the same directory: `node --test tests/route.test.ts`: 171 passed.
- `node --test tests/right-panel-layout.test.ts tests/tailwind.test.ts` and `node --test tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts`: 14 passed total.
- Root `./node_modules/.bin/tsc --noEmit` and `node scripts/tocktutor-build-manifest.mjs --check`: passed. Coordinated build owner rebuilt and staged all outputs. React Doctor changed-line scan found no issues; maintainability scan was incomplete. Full repository gate and generated-output commit remain with the coordinated integration owner; unrelated environment-blocked checks are not claimed passing here.

Source: `50b0845d`, `d9df1b43`. Updated obsolete nested Header assertions: `c7b4fe73`.
