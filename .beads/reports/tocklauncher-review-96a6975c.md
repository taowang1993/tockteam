# TockLauncher Code Review

## Scope

Snapshot review against `.agents/references/tocklauncher.md`, starting at `fe080d15`. Traced the Desktop assembly, search/action authorization, IPC and window ownership, provider invalidation, Workflow effects, persistence/recovery, network requests, and trusted-child admission/lifecycle. This is not an exhaustive line-by-line audit of every launcher renderer or compatibility module.

Applied all three review references: code simplification, security/hardening, and performance. Re-reviewed the final four-file code/test diff through those perspectives. No new dependencies, renderer authority, or composition mechanisms were added.

## Fixed Findings

- **[P2] Workflow catalog entries were consumed along with public actions** — `src/launcher-workflow.ts:645`. Completion, denial, failure, and cancellation removed the private catalog entry, although subsequent searches continued publishing it. A fresh action therefore failed until a rescan. Retained the catalog until normal invalidation; `LauncherActionStore` remains the single-use authorization boundary. Four integration regressions use real core search, action publication, and Workflow execution, and also reject replay of the consumed ID.
- **[P2] Persistence reads enforced size and identity checks too late** — `src/launcher-persistence.ts:181` and `:838`. A file growing after `stat` was read without a byte bound; replacement bytes could be read before rejection; a FIFO replacement could block a file open. Added opened-handle identity validation before reading, bounded chunk reads with one overflow byte, and nonblocking file opens where supported. Regression tests cover growth, replacement, exact limits, short reads, FIFO replacement, unchanged settings, and descriptor cleanup.

Both defects were reproduced with failing checks before implementation. The original growth check observed 4,194,306 bytes read despite a 2 MiB limit; the replacement check observed 28 replacement bytes read before rejection.

## Verification

| Command | Result |
| --- | --- |
| `node --test tests/launcher-workflow.test.ts tests/launcher-actions.test.ts` | 28 passed |
| `node --test tests/launcher-file-custody.test.ts tests/launcher-persistence.test.ts tests/launcher-external-transactions.test.ts` | 47 passed |
| `node --test tests/launcher-*.test.ts` | 524 passed, 7 skipped, 0 failed |
| `pnpm typecheck` | Passed |
| `pnpm run build` | Passed |
| `pnpm audit:ueli-package-feasibility` | Passed |
| `git diff --check` | Passed |
| `node --test tests/launcher-*.test.ts tests/trusted-raycast-*.test.ts` | 792 passed, 14 skipped, 1 test file failed to load: missing `jsdom` |
| `pnpm -C plugins/tocktutor install --frozen-lockfile --ignore-scripts` | Blocked by existing React link mismatch between the nested lockfile and `../ui` manifest; tracked as `tockteam-kn7` |
| `pnpm audit:installed-evidence` | Correctly rejects older installed evidence after these two runtime-file changes |

No dependency manifests or lockfiles were changed to bypass the setup failure. Conditional artifact/platform tests retain their existing skips. Full root tests, live external-service proofs, Desktop keyboard smoke, packaged smoke, and installed smoke were not run. Keyboard smoke requires immediate permission for foreground control. No Electron app or browser/server was launched; the test-run trusted-child/fixture process check found no matching residue.

## Commits and Verdict

- `4fdbdd3a` — Keep workflow catalog reusable after each authorized invocation.
- `96a6975c` — Bound launcher persistence reads across file growth and replacement.

The two source fixes pass their regression and launcher gates. **Needs attention for release verification:** restore the nested test dependency installation and refresh installed-platform evidence through real smokes; existing release evidence must not be presented as proof of these commits. Nothing was pushed.
