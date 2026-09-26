# Sidebar-Only Titlebar Divider

User refinement: remove the bottom line across the editor titlebar, relying on the existing background contrast, while retaining the sidebar-side line. Moved the inset separator to `.tocktutor-titlebar-sidebar` and removed it from lower-pane tab strips. No color, sizing, or interaction changes. Source `dcc591c9`; rebuilt outputs `1547c8aa`.

## Verification

- RED: updated `scripts/tocktutor-tab-seam-checks.js` failed against the previous build: `editor-side tab strip has no bottom divider`.
- GREEN: `playwright-cli -s=tabs run-code --filename=/Users/taowang/projects/tockteam/scripts/tocktutor-tab-seam-checks.js` passed 25 assertions in each of built-in dark/light and all four named skins. Checks include editor-side line removal, retained sidebar line, continuous active-tab fill, 40px geometry, single/right/lower panes, and zero runtime errors. Opposite system appearance was used.
- Captures: 1512 × 949 CSS pixels, 2×, 3024 × 1898 PNG. Route `/tocktutor/Original.md`, Live Preview. Published screenshot uses built-in dark, no skin on html or body. Only `dark.png` is allowlisted for publication. Seven owned Electron trees stopped with no remaining descendants.
- `node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/route.test.ts tests/right-panel-layout.test.ts tests/tailwind.test.ts`: 178 passed.
- Using repository-local pnpm 11.21.0: `pnpm test`: 1450 passed, 17 skipped, zero failures. `pnpm run typecheck`, `pnpm run typecheck:tocktutor`, `pnpm run build:tocktutor`, `pnpm run build`, `node scripts/stage-dsh.mjs --quick`, and `node scripts/tocktutor-build-manifest.mjs --check`: passed.
- `pnpm run test:tocktutor` remains blocked by the existing search-index host-death process-inventory `EPERM` (`tockteam-w328`). No claim that the full nested suite passed.
- `react-doctor . --verbose --diff`: score 77; one existing complexity warning in the unchanged sidebar client function, no new warning on the changed titlebar classes.

After verification, source/build ownership transferred to session `01a0dd97` for a separate, user-requested resizer-highlight change. Unrelated report and snapshot modifications remain untouched.
