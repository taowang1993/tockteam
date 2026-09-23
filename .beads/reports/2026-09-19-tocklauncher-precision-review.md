# TockLauncher precision review

Run time: 2026-09-19T03:58:31.171Z
Issue: tockteam-2oz
Checkout: /Users/taowang/projects/worktrees/launcher

## Findings and changes

- Fixed calculator decimal-place precision for negative and scientific-notation results. At precision 3, -1/3 previously returned -0.3333333333333333 while 1/3 returned 0.333. The numeric-prefix parser now includes the sign and exponent before rounding. This also corrects unit magnitudes and the corresponding copy action.
- Added a public-provider regression covering six signed/scientific/unit cases and their actual copy arguments. The focused test failed before the one-line implementation change, then passed.
- Updated the calculator contract in .agents/references/tocklauncher.md.
- Restored the existing TockTutor React lockfile specifier to match its package manifest. The earlier automation's path-equivalent spelling caused ERR_PNPM_OUTDATED_LOCKFILE and a stale build-manifest hash. Both existing tests failed before restoration and passed afterward. No dependency version or package output changed; this removes the earlier lockfile diff.

## Review scope

Applied all three mandatory review references: simplification, security/hardening, and performance. Read the prior automation memory and launcher contract, then reviewed calculator validation/formatting, search ranking and invalidation, opaque action ownership and publication, IPC guard and renderer boundaries, settings write fencing, window/workbench lifecycle, network URL policy and provider transport, and native workflow/discovery/file/terminal effect boundaries with existing regression coverage. Retained the previous range, allocation, and search fixes. No additional high-confidence findings emerged from these checks; prior broad reviews remain historical evidence rather than fresh native-platform proof.

Security focus: renderer query input reaches main-owned evaluation and finite effects. The fix changes only numeric parsing after bounded evaluation; it does not admit new expressions, effects, destinations, or renderer authority. Complexity remains bounded by the existing expression/collection/output limits; no dependency or architecture change was needed.

## Fresh verification

- node --test --test-name-pattern='calculator precision rounds' tests/launcher-local-extensions.test.ts: failed before implementation (negative division).
- node --test tests/launcher-local-extensions.test.ts: 19 passed.
- node --test tests/launcher-*.test.ts tests/trusted-raycast-*.test.ts tests/cli-launcher.test.ts tests/legacy-launcher-recovery.test.ts tests/ueli-*.test.ts: 824 passed, 14 conditional skips.
- node --test tests/tocktutor-build-manifest.test.ts: 5 passed after correcting the prior lockfile mismatch.
- pnpm test: final run 1,363 passed, 18 conditional skips; exit 0. Initial run had the two explained lockfile/build-manifest failures.
- node --test tests/*.test.mjs: 134 passed; exit 0.
- pnpm typecheck: exit 0.
- pnpm run build: exit 0.
- pnpm audit:ueli-package-feasibility: passed.
- git diff --check: passed.

No Electron/browser/server was launched. Pure calculator formatting and copy payloads were verified through the real provider API; no visual layout or native bridge behavior changed. Native/installed smokes were not rerun, and the existing installed-evidence follow-up (tockteam-r4c) remains unchanged. All verification sessions exited; process inspection found no matching test or smoke processes. No commit, push, checkout switch, or new worktree.

Verdict: corrected within the reviewed source scope; fresh source, type, build and package gates pass. Native installed evidence remains limited to its previously recorded scope.
