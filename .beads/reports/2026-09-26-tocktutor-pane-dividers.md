# TockTutor Pane Tabs and Dividers

## Delivered

- Quiet 1px pane rules highlight at 2px on hover, drag, and keyboard focus; no center grip. The hit targets remain wider than the visible line.
- Highlight geometry stays inside the panes, below the 40px window titlebar. Applied to Files, Assistant, and both split directions.
- Each top-row pane has its own aligned titlebar tabs and close controls. Lower splits have their own tab row above their content.
- Closing a split's final tab removes that split after the existing save checks. The surviving note and recently closed tab behavior are preserved.
- Existing rounded inactive-tab hover, visible close button, keyboard, and touch behavior are retained.

Reference inspected: `/Users/taowang/research/tockbot/apps/web/src/styles/design-system/layout.css`. Reused its distinction between a broad resize hit target and pane-border feedback, not its pill handle or private components.

## Verification

TDD reproduced missing second-pane tabs (expected 2, received 1), then final-tab closure leaving an empty split. The rendered check additionally caught the titlebar measuring 41px because its border was outside the declared 40px height; `box-border` fixes that seam.

Commands:

```sh
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/route-split-panes.test.tsx tests/route-panel-controls.test.tsx tests/route-linked-panes.test.tsx --environment jsdom
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec tsc --noEmit -p tsconfig.json
node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/package-boundary.test.ts
node --test tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts
pnpm run typecheck
playwright-cli -s=tutor-dividers run-code --filename=/Users/taowang/projects/tockteam/scripts/tocktutor-pane-divider-checks.js
```

Results: 139 focused component tests, 5 boundary tests, 7 shared-UI checks, and both typechecks passed. The browser script passed **47 assertions in each of six appearances**: built-in Dark and Light, Deep Current, Jade Circuit, Porcelain, and Ember Dusk. Each used the opposite system appearance, reduced motion, isolated application data and vault, and an owned extended-display Electron/CDP session.

Verified actual split creation, tab alignment before/after pointer and keyboard resize, both divider axes, Files/Assistant feedback, lower/right tab closure, surviving note, 1512 × 949 CSS pixels at 2×, and zero page runtime errors. Highlight contrast ranged from 5.05:1 to 18.90:1. The separate tab-hover owner also reran the existing real Desktop hover proof after extraction: 13/13 passed.

React Doctor reported no diagnostics in the new `pane-tabs.tsx` or changed `pane-layout.tsx`. Its broad changed-file scan still includes existing route/editor and concurrently owned slash-form diagnostics; this is not a clean whole-workbench audit.

## Evidence and Cleanup

Only `2026-09-26-tocktutor-pane-dividers/dark-hover.png` is published as a canonical screenshot. It is 3024 × 1898 pixels, captured on `/tocktutor/Original.md` with two Live Preview panes and the right divider hovered. Its dark color scheme and absence of skin attributes on both document and body were verified before transactional publication. Six adjacent JSON files record measured states and checks.

All owned Electron runs were stopped through `extended_display.stop`, which verified `remaining: []` for each complete process tree. Final roots: 48035, 50114, 52978, 53840, 55141, and 56027. The initial diagnostic root 43866 was also stopped; its temporarily modified-DOM screenshot was not published. The named Playwright session was detached.

This evidence covers source through `0d824a05`. A separate concurrent user request to remove the horizontal border beneath active tabs is owned by the tab-hover session; its later seam correction is outside this capture's scope. Generated artifacts and combined full-suite gates are coordinated with the slash-form session, which owns their rebuild and commit.
