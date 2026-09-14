# Oh-DSH v0.2.0 Final Verification

## Installed Desktop Follow-Up

Source: `347897656531969a59f67ad65155e24863d2d5fd`.

The fresh macOS arm64 installed smoke passed using the user-approved built-in display. Evidence: [Installed Report](oh-dsh-v0.2.0-installed-macos-arm64.json). This is ad-hoc-signed internal evidence, not notarization or public release evidence.

Exact command:

```sh
CI=1 TOCKTEAM_INSTALLED_SMOKE_TEMP_ROOT="$HOME/Library/Caches/tockteam-installed-smoke.noindex/tockteam-installed-smoke-34789765" node scripts/launcher-installed-smoke.mjs --tockteam-launcher-installed-smoke
```

Verified: packaged runtime and resources, renderer isolation and denied permissions, launcher actions, settings restoration after reinstall, validation-failure rollback, Launch Services second-instance toggle delivery with exactly one persistent main process, and complete process-tree/disposable-install cleanup. A post-run process listing found no matching smoke processes.

The earlier failures were not a single visibility race:

- Launch Services required explicit smoke-environment forwarding and temporary app registration (`9ec0a207`, `16629d8c`).
- Trusted runtimes needed ASAR-unpacking (`a31c32fa`) and physical `app.asar.unpacked` candidate paths (`34789765`). Electron returns synthetic device/inode metadata for virtual ASAR paths even for unpacked entries. The physical paths preserve the existing no-follow, descriptor-identity, size, and digest checks.
- Local pnpm 12 rewrote the lockfile during one failed invocation; those incidental changes were removed. The successful runner used the pinned pnpm 11 preparation flow. `CI=1` is required by the existing smoke harness to permit the built-in display; an explicit extended-display variable of `0` is otherwise overridden.

## Source Checks

- `node --test tests/*.test.ts`: 1,286 tests; 1,272 passed, 14 skipped, zero failures.
- `node node_modules/typescript/bin/tsc --noEmit`: passed, including after removal of incidental generated build output.
- `node --test tests/launcher-installed.test.ts tests/trusted-raycast-namespaces.test.ts tests/trusted-raycast-asar.test.mjs`: 33 passed.
- `node --test tests/trusted-raycast-asar.test.mjs tests/trusted-raycast-namespaces.test.ts tests/launcher-packaged.test.ts tests/trusted-raycast-artifact-admission.test.ts tests/launcher-integration.test.ts`: 23 passed.
- `node scripts/check-installed-report.mjs .beads/reports/oh-dsh-v0.2.0-installed-macos-arm64.json`: passed.
- `git diff --check`: passed.

The explicit `.mjs` Electron/ASAR regression is outside the root `.test.ts` glob. It launches Electron in Node mode without windows and proves that virtual paths fail admission while physical unpacked paths pass. It is not included in root coverage claims.

## Independent Review

[Fresh Review](oh-dsh-v0.2.0-installed-followup-review.md): no material introduced findings across correctness, simplification, security, and performance. Reviewed commits `19ac946c..34789765`. Reviewer inspected the successful installed report and log; command execution remained parent-owned.

## Additional Local Gates

- `CI=1 node scripts/launcher-electron-smoke.mjs`: passed the complete bounded launcher fixture flow, including updater, second-instance intents, restart persistence, and graceful quit. Post-run process listing found no matching fixture processes.
- `react-doctor . --scope changed --base 0a902979 --verbose --no-supply-chain --no-score --yes --max-duration 90`: scanned nine changed files, no errors, one known crowded-component warning in `plugins/sidebar/src/client/plugin.tsx:903`. Numeric scoring and supply-chain scanning were not requested from the service; no score-improvement claim is made.

## Hosted CI History

The earlier failing runs are retained here rather than presented as passing evidence. Run `34743595824` passed Nix, runtime, Linux coverage, Windows, and macOS arm64. Its macOS x64 test assumed the latest projection was the initial `ready` message; commit `086e9f1a` separately asserts the handshake and current rendered state so a valid later `patch` is accepted. Fresh root tests and typecheck passed after that test-only correction.

Run `34744036818` then passed Nix, runtime, Linux, and both macOS jobs. Windows failed the native index test's five-second mount-startup watchdog; the other three native-index tests passed. `tockteam-zil` tracks the test-only 15-second cold-start allowance; disposal/drain and closed-connection assertions are unchanged. `cd plugins/tocktutor/packages/tockbot-note-runtime && node scripts/test-search-index.mjs` passed all four locally.

Run `34744544356` passed Windows (including the native-index startup correction), Nix, runtime, Linux, and macOS arm64. macOS x64 found a separate test scheduling race: currency cancellation yielded an event-loop turn while its five-millisecond request timeout could already finish the load. `tockteam-61q` replaces that yield with the mock fetch-start signal and guarantees cleanup through `t.after`. A disposable reproduction with a 25 ms yield produced the identical `Missing expected rejection`; the corrected transport/provider suites passed 33/33 and typecheck passed.

A fresh local root-suite attempt at this point passed 1,271 tests, skipped 14, and failed the unchanged live Translate debounce integration. Focused repetition and a disposable full-message diagnostic identified `Could not translate` / `ConnectTimeoutError: Connect Timeout Error`; the final `abc` query was current but had no translation rows. This is not a passing local root run and is not hidden by a retry or skipped assertion. Hosted root-suite evidence on the final commit remains required. Production code is unchanged since the already-recorded installed and full local source verification.

## Final Hosted Gate

[CI Run 34842993258](https://github.com/taowang1993/tockteam/actions/runs/34842993258) passed all six jobs at `692c0da746dd49ab5aaadcfb33e623b29c2e0f9b`:

- Core checks: Linux x64, Windows x64, macOS x64, and macOS arm64.
- Runtime smoke: pinned build, TockTutor typecheck/tests/build, staging, Web smoke, and Desktop smoke under xvfb.
- Nix package smoke: Linux flake evaluation, canonical full/Web/TUI builds and compatibility aliases, packaged launcher checks, and packaged Web smoke. This is not an all-platform Nix build claim; Nix is unavailable locally.

The final hosted root tests passed unchanged, including the live Translate integration that could not connect from the local machine. The final Linux root-suite coverage artifact is `10346593755` (`root-suite-coverage`, 216,785 bytes), expiring `2026-09-21T12:23:35Z`. It is report-only root-suite coverage, not whole-repository coverage or a threshold gate.

Parent review of the subsequent test-only commits `086e9f1a`, `30854b5b`, and `692c0da7` found no material issues: handshake validation remains explicit, native disposal assertions are unchanged, and currency cancellation now synchronizes with the actual request and always closes its provider. No production source changed after the independently reviewed installed source.

## Selective Audit Closure

- The original immutable audit covers all 34 commits and 67 unique final paths. A mechanical ledger check confirmed exact-once paths and matching initial disposition counts. No Oh-DSH temporary checkout remains under `/tmp` or the session temporary root.
- PNG export: `tockteam-9lt.3`, commits `09178e0c`, `45296153`, and `cd8761b6`; browser-local Desktop/Web composition and opaque PNG browser proof are committed.
- Pinned-summary usability: `tockteam-9lt.6`, commits `389d9bcf`, `e9da9db3`, `3575eb59`, `13153e42`, and browser evidence `466a2943`; approved legacy seam, persistent layout, states, safe rendering, focus, and localization are verified. **This does not claim working RC.1 chat-node projection:** `tockteam-9lt.17` remains an explicitly separate open follow-up. See [Browser Proof](oh-dsh-v0.2.0-browser-proof/proof.json).
- Marketplace, installer, version, and updater protection work: `tockteam-9lt.7` through `.10`, regression commit `602135db`, with updater redaction implementation and focused/root verification committed.
- The initial audit's deferred update-indicator decision was resolved by explicit approval of the direct Desktop title-bar integration: `tockteam-9lt.12`, commit `2abedb91`. No standalone updater package or Web/TUI updater authority was imported.
- The initial deferred coverage decision was resolved by explicit approval of short-lived GitHub Actions root-suite artifacts: `tockteam-9lt.15`. Codecov/service credentials and threshold claims remain excluded.
- Expired catalog entries, alpha-era dependencies, branding, runtime-loop ownership, duplicate staging, and all other rejected/not-applicable upstream changes remain excluded.

Commit this evidence before advancing the skill baseline. Baseline advancement denotes completion of the approved selective audit, not wholesale parity or completion of the separately scoped RC.1 projection follow-up; the parent epic remains open for that follow-up.

## Residual Limits

- Local live Translate verification currently depends on a reachable upstream service; its connection-timeout failure is recorded above. Final hosted verification passed without skipping it.
- `bd preflight --check` failed three inappropriate Go-tool checks (`go test`, `golangci-lint`, `gofmt`), passed three checks, and skipped Go version sync. It is not a valid TockTeam gate; actual TypeScript, root/native tests, build, runtime, package, and installed results are recorded separately. No Go tools or tracker configuration were changed to conceal this mismatch.
- Beads still warns about existing `.beads` permissions `0755`; permissions were not changed.
- Installed macOS evidence is ad-hoc signed, not notarized public-release evidence; the known React maintainability warning remains.
