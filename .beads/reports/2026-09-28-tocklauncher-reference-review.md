# TockLauncher Reference Review — September 28, 2026

## Scope

Compared `.agents/references/tocklauncher.md` with the pinned release/version, current launcher composition, Desktop setup, action and search boundaries, provider behavior, persistence contracts, focused tests, build/verification commands, and recent launcher changes. This is a launcher snapshot review, not a claim of exhaustive coverage of every provider or platform.

## Confirmed Findings

**Total confirmed code bugs: 2.**

1. **[P2 — Medium] Symbolic calculations could hide matching indexed files.** Impact: a user entering `pi` could see the calculator answer without `pi.md` when matching bookmarks or other ordinary results filled the search limit. Affected path: `src/launcher-core-search.ts` (calculation branch of `search`). The file-only lookup was skipped when filename normalization did not change the query, after the mixed-provider search had already capped its results. **Fixed** by running the bounded Simple File Search lookup for every successful calculation; both supported search engines now have a focused regression in `tests/launcher-core-search.test.ts`. **Verification:** the new test failed before the fix (actual: calculator only; expected: calculator and file), then `node --test tests/launcher-core-search.test.ts` passed (29/29). A guarded Desktop proof showed `pi` as the selected Calculator result and indexed `pi.md` under Files at a configured two-result limit.
2. **[P3 — Low] Bundled fonts were blocked by the launcher's own CSP.** Impact: opening the launcher logged 60 font-loading errors; bundled KaTeX glyphs in its shared CSS could not load. Affected paths: `src/launcher-security.ts` and `src/launcher.html` (duplicated static CSP). The launcher CSS includes data-URL fonts, but `default-src 'none'` rejected them because `font-src` was absent. **Fixed in source** by allowing only local and bundled data fonts without opening network connections; `tests/launcher-security.test.ts` checks the source HTML matches the policy. **Verification:** the focused regression failed before the fix and passed afterward; a post-build Desktop console check is pending.

## Reference Reconciliation

- Updated the review date and documented that Simple File Search gets a separate bounded lookup even for punctuation-free calculations, without displacing the calculator answer or widening file access.
- Documented bundled data-font loading and the Chromium limitation: `frame-ancestors` in a file-loaded meta CSP is ignored, so this directive is not an iframe-embedding guarantee. Whether any permitted embedding exists is unverified; launcher IPC continues to reject non-main frames.
- Corrected the Settings proof instructions: the existing script itself spawns Electron and cannot be run as-is under the enforced extended-display guard. The same restriction is now explicit for direct Electron and packaged smoke commands. These are documentation corrections, not additional confirmed product bugs.
- Verified the 24 built-in IDs, 100 reviewed settings rows, package `0.1.14`, DSH `0.1.2-rc.1`, and current application startup/rescan order from source; no change to those claims was needed.

## Verification and Limits

- `node --test --test-name-pattern='symbolic calculations' tests/launcher-core-search.test.ts` — **failed before fix** as intended.
- `node --test tests/launcher-core-search.test.ts` — **29 passed** after fix.
- `node --test tests/launcher-core-search.test.ts tests/launcher-local-extensions.test.ts tests/launcher-file-search.test.ts tests/launcher-ipc.test.ts tests/launcher-renderer-contract.test.ts tests/launcher-integration.test.ts` — **103 passed**.
- `pnpm typecheck` — failed in concurrently edited `tests/review-comments.test.ts:110` (`string` vs `'first' | 'second'`); unrelated to this change. Rerun after the owner finishes that edit. This environment/interleaving failure is **not** counted as a confirmed launcher bug.
- An owned guarded Electron proof (root PID 86697) attached to the returned app-scoped CDP endpoint on the Sidecar display, with both windows visible there and unfocused. Workbench route `http://127.0.0.1:56377/tockcoder` at 1366 × 994 CSS; launcher route `file:///Users/taowang/projects/tockteam/dist/launcher.html`, title `TockLauncher`, ready `true`, query `pi`, Calculator and Files sections, `pi.md`, 750 × 475 native CSS window, device scale 2. An app-scoped CDP viewport override produced 1512 × 949 CSS and a verified 3024 × 1898 PNG; no new page errors during the interaction. The launcher initially logged 60 blocked-font CSP errors and one `frame-ancestors` meta-CSP warning on load, before console collection began; these are not reported as a clean startup. `extended_display.stop` confirmed root and all recorded descendants stopped, with `remaining: []`.
- Full packaged and installed smokes are not claimed; their legacy scripts spawn Electron directly and cannot bypass the guard. Rerun root quality gates and check font loading after peers finish concurrent build/proof work.

Applied the review skill's simplification, security/hardening, and performance references. The fix does not add a capability or dependency, and the second file-only search remains limited to enabled indexed file results and the configured result count.
