# Whole Launcher Branch Verification

## Scope and Verdict

The requested PR covers the entire `launcher` branch against `main`, preserving its history. This is not a Backspace-only PR. The branch introduces the TockLauncher Desktop surface, its provider/local-tool/settings integration, reviewed trusted Raycast extensions, and packaging and verification infrastructure.

The four whole-branch review areas were Launcher Host/persistence, trusted runtime, surface/packaging, and evidence. Their blocking findings were repaired. The strong follow-up review is **CLEAR / OK with notes** through `59ee1338f6fc80d06e5e3efcb98873c3e4c3c17c`.

## Source Identity

- Runtime/UI and independent app verification: `fbf6adb384021dba3f296193929fd36142f77c16`.
- Installed source: `59ee1338f6fc80d06e5e3efcb98873c3e4c3c17c`. The only intervening changes update two exact smoke/report API-key expectations and their regression tests; application behavior is unchanged.
- Subsequent changes are this evidence directory and the installed-evidence catalog. Historical reports are retained unchanged and are not current-source approval.

## Verification

| Check | Result |
| --- | --- |
| `pnpm test` after installed smoke | 1,179 passed, 14 skipped, zero failures; 1,193 total |
| `pnpm run typecheck` | Passed |
| `pnpm test:launcher:electron` at `fbf6adb3` | Passed; fresh launch, renderer isolation/CSP/preload, search/actions, providers/tools, settings, keyboard/focus, second instance, persistence/restart, graceful quit |
| `pnpm test:launcher:installed` at `59ee1338` | Passed on macOS arm64 with disposable installation and data under a `.noindex` cache directory |
| Installed report validation | Zero failures; exact source identity, package/resources/notices, bounded vendor scan, renderer security, settings/reinstall/rollback, native second instance and cleanup |
| `pnpm audit:installed-evidence` | Passed; 27 rows, fresh checked-in macOS report; Windows/Linux remain workflow-required |
| `git diff --check` | Passed |
| Whole-branch redacted Gitleaks scan | No leaks through the runtime/UI commit; final publication scan is recorded in the PR handoff |

The first installed attempt at `fbf6adb3` failed because the smoke's exact API list omitted the already-reviewed `trustedRaycastFirstUse` method. Both stale expectation lists were corrected at `59ee1338`; exact equality remains enforced. Regression tests reject both a missing first-use method and an unexpected Host method. Each source commit received only one installed attempt.

## Independent App Proof

The fresh verifier drove the real Desktop renderer and trusted command runtime/IPC via app-scoped Playwright CDP. It did not write application code or launch another app. See [independent-verification.md](independent-verification.md) for its complete verdict and limitations.

- Kaomoji: native text deletion, fresh empty-root Backspace, Escape/menu behavior, and five trusted repeated Backspace events retaining the command after the query became empty. Screenshot: [kaomoji-retained.png](kaomoji-retained.png).
- Can I Use: actual nested AAC browser details popped to feature root with Backspace and Escape; repeated Backspace did not close that root; ordinary text deletion and fresh root exit passed. Assertions: [caniuse-check.log](caniuse-check.log).
- Composition-marked events retained the command without default prevention. This was synthetic, not a real OS IME session.
- Google Translate: trusted arrows reached the native select without default prevention, and focus stayed on the select. Its value did not change in the inactive native-popup environment; successful native selection change was not proven. Screenshot: [native-select.png](native-select.png).
- Trust failed-read regression: actual bundled trust-view source in an isolated DOM section with a fake bridge removed stale controls during loading/failure; retained detached buttons emitted no fake actions. Returning to Google emitted only the Google action. This is controlled component proof, not a real failing Host IPC. Screenshot: [trust-failed-read.png](trust-failed-read.png).

## Cleanup and User Safety

- Background host PID 91146 / Electron PID 91206 and their descendants stopped; CDP port 56061 closed; disposable profile removed and temporary trusted workspaces restored. The three authenticated checkpoints reported zero focused windows and retained the user's existing frontmost app. Protected live profiles were byte-identical before and after this background proof. See [background-cleanup.json](background-cleanup.json).
- The initial harness invocation failed during TypeScript parsing, before starting any app. Its process exited; retry used the same harness with Node's required transform flag.
- The user explicitly approved the subsequent visible Desktop/installed verification sequence. Every temporary macOS Electron launch used `--use-mock-keychain`.
- Source Desktop smoke root 94007 and failed installed root 95080 exited and were checked for residue. Successful installed root 96560 exited; its report confirms `processTreesGone`, `smokeRootRemoved`, and `temporaryInstallRemoved` are all true. No verification-owned app/browser/server remained at slot release, and no SecurityAgent was observed.
- No commands targeted the user's dev-app PID 74748 or process group 74571. They were no longer present at the final process check; this report does not claim the user's app was still running then.

## Limits

- macOS evidence is local, ad-hoc signed execution only: no Developer ID signing, notarization, public distribution, or Windows/Linux execution is claimed.
- Native cross-app selected-text/Paste behavior, physical hardware key autorepeat, a real OS IME session, and successful native language-popup selection remain unverified by the independent inactive proof.
- Trusted Raycast extensions remain trusted account-level local code, not OS-sandboxed plugins. Renderer and IPC isolation are preserved.
- External shared-file saves preserve detectable displaced/conflicting versions and revoke transaction authority on grant retirement. A brief missing-file interval is accepted; writes through already-displaced descriptors after final validation cannot be absolutely fenced.
- The fourteen skipped tests remain skipped; no coverage is inferred from them.

## Installed Evidence

[installed-smoke.json](installed-smoke.json) is the unchanged successful report for `59ee1338f6fc80d06e5e3efcb98873c3e4c3c17c`.

SHA-256: `88fceae382ccd293306832bacdb859033f4c268a748bd5c497973d7d86f2da7f`.
