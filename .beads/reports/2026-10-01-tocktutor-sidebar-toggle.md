# TockTutor Sidebar Segmented Toggle

Issue: `tockteam-ph35`. The previous Switch request, `tockteam-a17j`, was superseded by the user's explicit Source/Preview-style segmented-control request.

## Result

Properties and Assistant now share a compact, two-icon segmented control modeled on TockBot's artifact toolbar. It reuses the existing `@tockteam/ui` ToggleGroup and Tooltip, Lucide icons, semantic colors, and local Tailwind classes. There is one sliding selected highlight, accessible option names, visible keyboard focus, and immediate settling with reduced motion. No new dependency, feature stylesheet, shared component fork, or runtime authority was introduced.

Both panels remain mounted. Note edits, unfinished property values, and unsent Assistant messages survive switching and sidebar close/reopen. The existing resize handle remains usable.

## Verification

- Test-first: the new compact-control check failed on the old `PropertiesAssistant` text; both new checks subsequently passed.
- Final focused command: `cd plugins/tocktutor/packages/tockteam-tocktutor-workbench && ./node_modules/.bin/vitest run tests/route-panel-controls.test.tsx --environment jsdom` — **114/114 passed**.
- `pnpm run typecheck:tocktutor`, root/shared-UI typechecks, and the shared UI's eight component/ref/icon checks passed.
- `pnpm run build:tocktutor`, `pnpm run build`, and `node scripts/tocktutor-build-manifest.mjs --check` passed. `node scripts/stage-dsh.mjs --quick` refreshed the old staged browser bundle before final Desktop proof.
- `pnpm test` — **1,613 passed, 18 skipped, zero failed**.
- React Doctor comparison: **zero new diagnostics**; the existing baseline remains two errors and 97 warnings. No score was returned.
- Owned-path `git diff --check` passed.

App-scoped Playwright attached only to an owned Electron instance launched by `extended_display` on extended display **17**. The real-app proof passed mouse selection, selecting the already-active choice, Arrow-key focus, Enter/Space selection, visible focus, 200 ms sliding/reversal, reduced motion, edit/draft preservation, inert closed/hidden panels, 470-pixel keyboard resizing, and a 600-pixel narrow window without overflow.

Appearance was changed through the real Settings UI: Default, Navy, Jade, and Ember in both light and dark modes. All eight combinations retained the 86-pixel compact control and essential-icon contrast of at least **5.48:1**; the app's chosen appearance remained independent of the opposite simulated system appearance.

## Screenshots and Runtime Proof

Only these two allowlisted proof screenshots were published transactionally; the comparison gallery was not refreshed:

- `.beads/reports/tocktutor-sidebar-toggle-properties.png`
- `.beads/reports/tocktutor-sidebar-toggle-assistant.png`

Both are unaltered real-app captures of `/tocktutor/Properties.md` in Live Preview, with **1512 × 949 CSS pixels**, **2× device scale**, and **3024 × 1898 device pixels**. At capture time the root color scheme was explicitly dark and no TockTeam skin was present on root or body. Selected mode, bounds, content, hashes, and other visible-state facts are recorded in `.beads/reports/2026-10-01-tocktutor-sidebar-toggle.json`.

There were **zero runtime errors or external requests**. The console contained two existing development-startup warnings and ten Canvas readback warnings from the theme contrast probe, not application failures. Both owned Electron/server trees stopped: **44 recorded PIDs**, zero remaining. Playwright reported no active sessions after detaching.

The temporary note was restored and saved byte-for-byte to its original 447 bytes; its imported property-type registry stayed unchanged. The three protected paths, all 73 existing gallery captures, and unrelated Playwright artifacts were preserved.

## Existing Check Limitations

The full `pnpm run test:tocktutor` still encounters one pre-existing protected component test: `tests/route-linked-panes.test.tsx` expects a `Show Assistant` Switch instead of Properties/Assistant radio options. The same failure was reproduced before this implementation. Its other 34 checks and 744 current workbench component checks pass; the workbench's 420 Node checks also pass. That user-owned test was not edited or bypassed, and the full TockTutor suite is **not claimed green**.

An unrestricted `git diff --check` also reports pre-existing trailing whitespace in protected `AGENTS.md`; it was left untouched. Neither limitation is a new confirmed bug in this change.

Restart Electron to load the rebuilt control.
