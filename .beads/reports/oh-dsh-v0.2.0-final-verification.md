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

## Outstanding Final Gates

Hosted CI for the follow-up commits remains pending. Run `34743595824` passed Nix, runtime, Linux coverage, Windows, and macOS arm64. Its macOS x64 test assumed the latest projection was the initial `ready` message; commit `086e9f1a` separately asserts the handshake and current rendered state so a valid later `patch` is accepted. Fresh root tests and typecheck passed after that test-only correction.

Run `34744036818` then passed Nix, runtime, Linux, and both macOS jobs. Windows failed the native index test's five-second mount-startup watchdog; the other three native-index tests passed. `tockteam-zil` tracks the test-only 15-second cold-start allowance; disposal/drain and closed-connection assertions are unchanged. `cd plugins/tocktutor/packages/tockbot-note-runtime && node scripts/test-search-index.mjs` passed all four locally.

Do not advance the Oh-DSH baseline or close `tockteam-9lt.16` until the final hosted evidence is verified and committed.

`bd preflight` emitted a generic Go-project checklist, not executable TockTeam validation; it is not counted as a passing project gate.
