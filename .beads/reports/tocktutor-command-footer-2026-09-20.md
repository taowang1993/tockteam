# Command Palette Footer

Matched the existing Obsidian screenshot's compact, centered inline hints: `↑↓ to navigate`, `↵ to use`, `esc to dismiss`. Removed the boxed key treatment and divider; reduced the footer row to 32px. Preserved semantic theme colors, accessible key names, keyboard commands, disabled-command rules, and the app status bar.

The grey commands are intentional: Go Forward requires forward navigation history; Reopen Closed Note requires a recently closed tab.

## Verification

- RED: `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/route-panel-controls.test.tsx --environment jsdom -t 'filters and executes searchable command controls'` failed on the old footer text.
- GREEN: `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/route-panel-controls.test.tsx --environment jsdom` — 70 passed.
- Workbench `run build`, root `pnpm run typecheck`, and root `pnpm run build` passed.
- `node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts` — 4 passed after screenshot publication.
- `pnpm test` — 1356 passed, 18 skipped, 2 failures outside this footer: the pre-existing `tocktutor-note-links` utility is missing from the Tailwind test allowlist, and the workspace setup test's frozen-lockfile installation fails. Neither was changed to make this task pass.
- React Doctor: unchanged 68/100, four existing complexity warnings.
- Real Desktop Playwright/CDP: confirmed 32px height, centered 12px text, borderless/shadowless keys, no divider; exercised ArrowDown, ArrowUp, Enter, and Escape without changing the fixture note.

[Refreshed Screenshot](../../.agents/uiux/tocktutor/screenshots/tocktutor-command-palette.png) · [Capture Proof](tocktutor-command-footer-2026-09-20.json)

Capture: 1512 × 949 CSS pixels, 2× scale, 3024 × 1898 image; built-in dark theme, no skin; Command Palette over UIUX Comparison in Live Preview. Inspected against the Obsidian reference and transactionally refreshed only the allowlisted palette screenshot and its evidence. No uncaught renderer errors; the previously recorded `workspaces.startSession is not a function` startup console error remains outside scope. Both verification app process trees were stopped and verified. No commit or push under the active conservative profile.
