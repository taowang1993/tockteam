# Release Verification — 2026-09-18

Verified runtime source: `a6326d274358413e613c62854c424cabd37b1063`.
Package version: `0.1.14`.

## Hosted Evidence

- [CI 35338312652](https://github.com/taowang1993/tockteam/actions/runs/35338312652): all six jobs passed — macOS arm64, macOS x64, Windows x64, Linux x64, runtime smoke, and Nix evaluation/build/package smokes.
- [Linux baseline 35337301769](https://github.com/taowang1993/tockteam/actions/runs/35337301769): Debian/AppImage installation passed. This baseline alone does not prove rollback.
- [Installed verification 35339263744](https://github.com/taowang1993/tockteam/actions/runs/35339263744): macOS arm64, Windows x64, and Linux x64 passed. Linux recovered from controlled candidate-validation failure by reinstalling the preserved Debian package from baseline run `35337301769`.

The three adjacent `installed-*.json` files are unmodified reports downloaded from the installed workflow. Each passed `inspectInstalledReport` with explicit platform, version, application identity, and source-commit expectations. SHA-256 hashes are recorded in `scripts/ueli/installed-evidence-catalog.json`. Every report records successful process-tree cleanup; the disposable hosted jobs are complete.

## Fixes

- Treat a file deleted after index inventory as an absent candidate, not a fatal native-index failure. Regression covers deleted files, deleted parent directories, and cancellation.
- Isolate the native schema-callback timing replay from unrelated OS watcher notifications. Real watcher/reconciliation coverage remains enabled elsewhere.
- Preserve bounded nested error stacks so installed-proof failures identify the failing operation.
- Respect the existing macOS-only trusted compatibility-command contract. Windows/Linux reports explicitly do not claim Can I Use execution; their supported installation, security, action, settings, lifecycle, and rollback checks remain active.
- Rebuild the tracked TockTutor output and manifest, and replace retired-history evidence references with validated current reports.

## Local Checks

- `pnpm test` — 1,341 passed, 18 platform/optional skips, zero failures after evidence promotion.
- `pnpm typecheck` and `pnpm typecheck:tocktutor` — passed.
- `pnpm -C plugins/tocktutor/packages/tockbot-note-runtime run test:search-index` — passed.
- `node --test plugins/tocktutor/packages/tockbot-note-runtime/tests/search-index-runtime.test.ts plugins/tocktutor/packages/tockbot-note-runtime/tests/search-index-process.test.ts` — passed.
- `node --test --test-name-pattern='^Keyword search reconciles' plugins/tocktutor/packages/tockbot-note-runtime/tests/loader-composition.test.ts` — passed.
- `node scripts/check-release-version.mjs --tag v0.1.14` — passed.
- `pnpm test:ueli-package-feasibility` and `pnpm audit:ueli-package-feasibility` — passed.
- `pnpm audit:installed-evidence` — passed with 27 hosted-verified rows; ancestry and report-hash checks remain enforced.

## Scope

These are verification artifacts, not a published release. No tag or GitHub release was created. macOS proof remains unsigned/internal with an ad-hoc signature, not Developer ID signing or notarization. Windows Control Panel was unavailable; elevation was confirmation-required but uninvoked. Linux rollback is recovery by reinstall, not an atomic package-manager transaction. The historical backup was retained.
