# TockLauncher review — 2026-09-19

Run recorded: 2026-09-19T03:17:19.579Z
Checkout: /Users/taowang/projects/worktrees/launcher. All commands ran from this checkout; no checkout/worktree changes, commit, or push.

## Findings fixed

- Calculator allocation guard: a trailing zero dimension let enormous outer-array allocations pass the product-only limit (for example zeros(1000000000, 0)). Bound allocation dimensions without changing scalar random/randomInt limits. Regression failed before the fix and passed afterward.
- Initial search cancellation: a search awaiting its first scan could resume after invalidation and publish the unvalidated cached index. Recheck initial-load completion and search ownership before processing results. Regression failed before the fix and passed afterward.
- Excluded favorites: the core removed set membership but retained the favorite ordering entry, so a later favorite write could restore it. Keep ordering synchronized. Current Desktop persistence callback masked this core defect; regression specifically exercises the core's standalone persistence contract.
- Updated tocklauncher.md for the fixed contracts and the existing bounded Translate cache implementation.
- Fixed one equivalent React link specifier in plugins/tocktutor/pnpm-lock.yaml; dependency versions and resolutions did not change. This restored frozen installation and the missing jsdom test dependency.

## Review scope and verdict

Snapshot review of launcher search/action ownership, IPC/preload, window lifecycle, settings/persistence, provider/native-effect boundaries, trusted compatibility admission/state, renderer contracts, and build/package evidence. Applied all three review references: code simplification, security and hardening, and performance optimization. Re-reviewed the changed code with all three perspectives. This is not a claim of exhaustive platform/runtime verification.

The security review treated renderer queries, cached files, and extension messages as untrusted; main-owned actions, user settings, native effects, and Electron responsiveness were the protected assets. Concrete abuse/regression cases were canceled startup reads republishing stale results and zero-size matrices allocating huge outer arrays. Fixes preserve existing Desktop ownership and finite provider authority; no dependencies or permissions were added.

## Fresh verification

- node --test tests/launcher-core-search.test.ts tests/launcher-local-extensions.test.ts tests/launcher-ipc.test.ts tests/launcher-actions.test.ts — 52 passed after the fixes.
- node --test tests/launcher-*.test.ts tests/trusted-raycast-*.test.ts tests/cli-launcher.test.ts — 800 passed, 14 conditional skips, no failures.
- node --test tests/launcher-*.test.mjs tests/trusted-raycast-*.test.mjs tests/ueli-package-feasibility.test.ts — 123 passed, no failures.
- pnpm typecheck — exit 0.
- pnpm run build — exit 0.
- pnpm audit:ueli-package-feasibility — passed.
- pnpm --dir plugins/tocktutor install --frozen-lockfile --ignore-scripts — exit 0 after lockfile correction.
- git diff --check — exit 0.

The initial broader run failed because jsdom was missing; after the single-specifier lock repair and dependency restoration the same test command passed. No app, browser, or server was launched manually; test child-process cleanup completed and no matching test descendants remained in the process check.

## Remaining evidence limitation

pnpm audit:installed-evidence fails because recorded evidence predates runtime changes at a6326d274358413e613c62854c424cabd37b1063. No foreground Electron smoke or installed smoke was run: these changes were verified through the core/provider interfaces; foreground proof requires immediate explicit permission under the launcher reference, and installed proof belongs to a final evidence commit. No new screenshots or installed claims were published. Full pnpm test was not run; verification was scoped to launcher and compatibility suites.

Follow-up: tockteam-r4c (Refresh stale installed launcher evidence). Review/fixes issue tockteam-xnt is closed. Changes remain uncommitted.
