# TockLauncher Reference Review — September 28, 2026

## Scope

Compared `.agents/references/tocklauncher.md` with the pinned release/version, current launcher composition, Desktop setup, action and search boundaries, provider behavior, persistence contracts, focused tests, build/verification commands, and recent launcher changes. This is a launcher snapshot review, not a claim of exhaustive coverage of every provider or platform.

## Confirmed Findings

**Total confirmed code bugs: 1.**

1. **[P2 — Medium] Symbolic calculations could hide matching indexed files.** Impact: a user entering `pi` could see the calculator answer without `pi.md` when matching bookmarks or other ordinary results filled the search limit. Affected path: `src/launcher-core-search.ts` (calculation branch of `search`). The file-only lookup was skipped when filename normalization did not change the query, after the mixed-provider search had already capped its results. **Fixed** by running the bounded Simple File Search lookup for every successful calculation; both supported search engines now have a focused regression in `tests/launcher-core-search.test.ts`. **Verification:** the new test failed before the fix (actual: calculator only; expected: calculator and file), then `node --test tests/launcher-core-search.test.ts` passed (29/29). The real local Calculator adapter also returned `calculator:instantResult` for `pi` in a direct source check.

## Reference Reconciliation

- Updated the review date and documented that Simple File Search gets a separate bounded lookup even for punctuation-free calculations, without displacing the calculator answer or widening file access.
- Corrected the Settings proof instructions: the existing script itself spawns Electron and cannot be run as-is under the enforced extended-display guard. The same restriction is now explicit for direct Electron and packaged smoke commands. These are documentation corrections, not additional confirmed product bugs.
- Verified the 24 built-in IDs, 100 reviewed settings rows, package `0.1.14`, DSH `0.1.2-rc.1`, and current application startup/rescan order from source; no change to those claims was needed.

## Verification and Limits

- `node --test --test-name-pattern='symbolic calculations' tests/launcher-core-search.test.ts` — **failed before fix** as intended.
- `node --test tests/launcher-core-search.test.ts` — **29 passed** after fix.
- `node --test tests/launcher-core-search.test.ts tests/launcher-local-extensions.test.ts tests/launcher-file-search.test.ts tests/launcher-ipc.test.ts tests/launcher-renderer-contract.test.ts tests/launcher-integration.test.ts` — **103 passed**.
- `pnpm typecheck` — failed in concurrently edited `tests/review-comments.test.ts:110` (`string` vs `'first' | 'second'`); unrelated to this change. Rerun after the owner finishes that edit. This environment/interleaving failure is **not** counted as a confirmed launcher bug.
- Full Desktop visual, packaged and installed smokes are not claimed yet; the legacy scripts spawn Electron and cannot bypass the enforced extended-display guard. A guarded owned app proof, if available, must record exact geometry/state/runtime errors, clean its entire process tree, and distinguish native-size overlay screenshots from the project-wide full-screen geometry contract.

Applied the review skill's simplification, security/hardening, and performance references. The fix does not add a capability or dependency, and the second file-only search remains limited to enabled indexed file results and the configured result count.
