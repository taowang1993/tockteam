# Sidebar Note Menu Verification

Implemented the 13-action Obsidian-style sidebar menu. **Open to the Right** is a permanent editable split; there is no Side Peek. Existing **More Note Actions** remains intact.

## Confirmed Findings

Total: **2**, both fixed.

1. **P2 — A body-portaled menu sat beneath the TockTutor route.** The real Desktop route uses its own stacking context, so the shared menu's body portal was visible in the DOM but could not receive pointer clicks. Affected path: `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/sidebar-note-menu.tsx`. Fixed by retaining the menu and submenu in the owning route (`portalled={false}`), not adding a larger global z-index. Verified with unforced Playwright clicks in guarded Electron, including right-click, Shift+F10, Escape/focus restoration, and file actions.

2. **P2 — A failed recovery load could expose the previously active note's recovery panel.** Affected path: `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx`. The sidebar now opens the panel only after the target loads successfully. Verified red→green with an unavailable clicked note while another pane contains an unsaved draft (`tests/route-note-context-menu.test.tsx`).

Self-review applied the code-simplification, security/hardening, and performance references. Filesystem writes remain with the runtime; the added Remote validates paths, revision and vault identity. Native operations retain caller-bound authorization. No new dependency or agent/plugin loop was added.

## Verification

- Workbench package: **365 node tests and 656 component tests passed** (`pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench test`). This includes target-bound navigation, rename/bookmark preservation, recovery/trash, collision-only duplication retries, retained partial-write errors, and cancellation when the target draft changes.
- Desktop adapter: **58 tests passed** (`pnpm -C plugins/tocktutor/packages/tockbot-note-desktop test`), including explicit target authorization and cancellation after authorization.
- Final focused node checks, including shared UI contracts: **205 passed**. Final sidebar/split/panel component checks: **113 passed** (`cd plugins/tocktutor/packages/tockteam-tocktutor-workbench && ./node_modules/.bin/vitest run tests/route-note-context-menu.test.tsx tests/route-split-panes.test.tsx tests/route-panel-controls.test.tsx --environment jsdom`). The later failed-recovery regression was independently verified red→green with `./node_modules/.bin/vitest run tests/route-note-context-menu.test.tsx --environment jsdom` (two tests pass).
- Root suite: **1,450 passed, 17 skipped, zero failed** (`node --test --test-concurrency=4 tests/*.test.ts`, the underlying `pnpm test` command). The 17 skips are explicit environment/guard skips, not silently disabled tests.
- `pnpm run typecheck:tocktutor`, root `pnpm run typecheck` / `tsc --noEmit`, `pnpm run build:tocktutor`, `pnpm run build`, and `node scripts/tocktutor-build-manifest.mjs --check`: passed. Final manifest-focused tests: **5 passed**.
- Guarded real Desktop exercised the 13-item menu, keyboard invocation, dismissal/focus restoration, editable right split, Duplicate, Rename Note, Move Note, Bookmark Note, File Recovery, and Move File to Trash. The original pane retained its unsaved buffer, and its original vault file remained byte-for-byte unchanged. Duplication preserved the clicked file's exact bytes. See `filesystem-proof.json`.
- Canonical screenshots: `menu.png`, `split.png`. Verified **1512 × 949 CSS pixels, 2× device scale, 3024 × 1898 PNG pixels**, built-in dark and no skin. Screenshot publication used a two-file allowlist and a staging-directory rename.
- Built-in dark/light and all four named skins passed the sidebar menu's 13-item inventory, enabled/hover states, viewport bounds, exact computed shell color matching, and normal/selected contrast checks (minimum **11.57:1**). System appearance was forced opposite to the app theme and reduced motion was enabled. See `theme-proof.json` and the coordinated six-run evidence in `../2026-09-26-tocktutor-slash-color-scroll/`. Final dark/opposite-system checks also passed after the recovery/status fixes.
- All four owned Electron runs were stopped explicitly; the guard reported **no remaining descendants**. Root PIDs and outcomes are in `desktop-proof.json`. No browser or app was left running.

The reusable app-scoped check is `scripts/tocktutor-sidebar-menu-checks.js`. It requires a fresh disposable vault and an already guarded Electron endpoint; it never launches an application itself. The initial interactive check was corrected to scope Rename/Bookmark/Move dialogs by name, because an unrelated underlying DSH API-key dialog also exists in the page.

## Limits and Unverified Checks

- `pnpm run test:tocktutor` stopped in the runtime host-death process-inventory test with **spawn EPERM** under the execution guard. Workbench and Desktop adapter suites were run independently afterward. This is an environment-blocked check, not a confirmed product bug.
- React Doctor's changed-file scan reported no diagnostics but failed its maintainability phase; it therefore supplied **no usable score**. No score-regression claim is made.
- Default-app opening and Finder reveal were not exercised against user applications. Their adapter/Host authorization and wrong-target rejection were tested; that is not evidence of actual OS effects. No raw Electron or installed smoke bypassed the guard.
- The split-state Settings navigation attempt encountered an intercepting existing embedded-layout layer. No forced click, DOM removal, or settings-state override was used to hide it. The separate six-appearance proof used fresh isolated runs instead and passed; this intercepted navigation is not counted as a confirmed menu bug.
- Full release/installed-smoke acceptance is not claimed. This change is verified at controller, component, transport, and guarded Desktop workflow levels.

## Build Coordination

Generated outputs also include the other active session's committed slash-menu fixes (`d1e494cd`, `58555f32`), with that session's explicit agreement. No slash-menu source was edited by this task. Unrelated `.beads/reports/2026-09-26-tockcoder-review.md` changes were left untouched.

Package-manager invocations unexpectedly auto-installed before running scripts: an initial global pnpm call normalized a nested React link, and a later pinned-pnpm root test auto-updated the root lockfile. Logs identified both as this task's generated changes. They were restored to the original lock entries, frozen installation passed, and no dependency upgrade was committed. Final root tests were invoked directly to avoid another implicit install.
