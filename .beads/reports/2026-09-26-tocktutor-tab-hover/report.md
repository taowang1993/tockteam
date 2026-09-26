# Inactive Note Tabs

Inactive tabs are plain; hover adds a rounded highlight and close button. Active tabs are unchanged. Keyboard focus reveals close; touch keeps it available.

## Verification

- `playwright-cli -s=tabs run-code --filename=scripts/tocktutor-tab-hover-checks.js` against owned extended-display Electron: 13 assertions passed in each of six appearances. Actual Open in New Tab, pointer exit, keyboard activation, close without selection, touch fallback, contrast, and stable geometry verified.
- Canonical captures: dark app/no skin on html or body; 1512 × 949 CSS at 2×, 3024 × 1898 PNG. Idle and hover show Comparison in Live Preview with Original inactive. System appearance deliberately opposite app appearance. Zero observed runtime errors; minimum measured text/control contrast 5.32:1. All eight owned runs and descendants stopped.
- Initial rendered RED caught the rectangular inactive tab. A second RED caught an unavailable workbench alias in the portaled Header; fixed with the shared semantic accent background.
- `cd plugins/tocktutor/packages/tockteam-tocktutor-workbench && ./node_modules/.bin/vitest run tests/route-panel-controls.test.tsx tests/route-note-context-menu.test.tsx --environment jsdom`: 107 passed.
- `node --test tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts`: 7 passed. Root `./node_modules/.bin/tsc --noEmit` passed. React Doctor changed-line scan found no issues; maintainability scan was incomplete.
- Coordinated slash-command session owns generated outputs and the final repository gate; it rebuilt and staged the verified source. Source commits: cc54104c, 56aff321, da76e5f0. No external-app actions were exercised.
