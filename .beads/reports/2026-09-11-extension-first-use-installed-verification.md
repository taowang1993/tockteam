# Installed first-use verification

## Result

The one authorized serialized inactive macOS installed first-use check passed on immutable source commit `156478b55fc55ad28440e36c653c3f33b52718c3` (short `156478b5`). No ordinary foreground smoke, LaunchServices launch, user-profile path, or Keychain interaction was used. macOS Electron `--use-mock-keychain` was passed on the actual executable argv and the app-side packaged gate was active.

Evidence artifact: `2026-09-11-extension-first-use-installed-verification.json`.

## Commands

Prerequisites, serialized before the installed check:

```sh
pnpm test
./node_modules/.bin/tsc --noEmit
node scripts/build.mjs
git diff --check
```

Results:

- `pnpm test`: 1,163 tests; 1,149 passed, 14 skipped, 0 failed. Log: `/tmp/launcher-final-pnpm-test.log`.
- `tsc --noEmit`: passed. Log: `/tmp/launcher-final-typecheck.log`.
- `node scripts/build.mjs`: passed. Log: `/tmp/launcher-final-build.log`.
- `git diff --check`: passed. Log: `/tmp/launcher-final-diff-check.log`.
- Post-installed `pnpm test`: 1,163 tests; 1,149 passed, 14 skipped, 0 failed. Log: `/tmp/launcher-final-post-installed-test.log`.

Exactly one installed command was then run:

```sh
TOCKTEAM_INSTALLED_SMOKE_TEMP_ROOT="$PWD/.noindex/tockteam-installed-first-use" TOCKTEAM_INSTALLED_SMOKE_REPORT="$PWD/.noindex/tockteam-installed-first-use-report.json" TOCKTEAM_INSTALLED_SMOKE_DIAGNOSTICS="$PWD/.noindex/tockteam-installed-first-use-diagnostics.json" pnpm run test:launcher:installed -- --tockteam-launcher-installed-first-use-smoke
```

Result: passed. Log: `/tmp/launcher-installed-first-use.log`.

## Verified flow

- Immutable packaged ASAR and ad-hoc internal macOS bundle were validated.
- Direct executable path was inside the disposable `.noindex` install root; no LaunchServices or real Applications directory was used.
- Actual argv included `--use-mock-keychain`, dedicated first-use flag, loopback CDP, disposable `--user-data-dir`, installed smoke flag, and toggle.
- Cold Can I Use search entered explicit approval, exact candidate digest was installed/approved/enabled, preferences were collected and persisted, details/back navigation worked, and the browser effect was denied.
- Warm reopen opened directly without approval.
- Translate/Kaomoji legacy preferences/state/trust files remained unchanged.
- `externalEffectsInvoked: false`; `warmReopen: true`; `detailRows: 14`.
- Startup and completion authenticated focus checkpoints both reported zero focused windows; no focus event was emitted.

## Process and cleanup

- Root Electron PID: `43150`; observed owned PID set is retained in the JSON artifact.
- Cleanup evidence has `rootPid: 43150`, `residuePids: []`, and `processTreesGone: true`.
- Disposable install and smoke roots were removed only after verified cleanup (`temporaryInstallRemoved: true`, `smokeRootRemoved: true`).
- Independent post-run checks found zero installed app/path residue.
- No screenshots were captured by the installed harness. Prior source screenshots remain prior-source evidence only and are not claimed as installed screenshots.

## Plan reconciliation

Source/browser implementation and acceptance were already complete. This run closes the bounded macOS installed Can I Use evidence gap. Remaining limits are broader installed/platform evidence (including Translate/Kaomoji installed flows) and installed screenshots. No release or push action was taken.

## Final Acceptance

Independent reviewer run `d38ef909-1d1a-4d5b-ae56-b76b9cf2fafe` reviewed evidence-only commit `900b3a7b` and returned **OK**, with no findings. Application code remains at the verified `156478b5`; subsequent changes are documentation/evidence only. The parent closed `tockteam-dnw` and returned the exclusive testing reservation to Tutor Pi.

The parent independently verified report SHA-256 `63b14feed637369ead6836552e4729a6b90c58ac0e8fb36d741f8e6f7626d98a` and confirmed all 49 recorded PIDs and disposable roots absent at 17:31:24 UTC. See [independent cleanup check](extension-first-use-visuals/installed-cleanup-check.json). The report's `artifactSha256` and `childSha256` identify the Can I Use extension archive and child, not Desktop `app.asar`.

## Prior-Source Visuals

These retained screenshots come from the previously accepted browser proof `extension-first-use-browser-6OlDb5`, not the installed run. The retry screenshots show an intentionally injected preparation failure.

- [Extensions — Light](extension-first-use-visuals/extensions-light.png)
- [Extensions — Dark](extension-first-use-visuals/extensions-dark.png)
- [Retry State — Light](extension-first-use-visuals/approval-error-light.png)
- [Retry State — Dark](extension-first-use-visuals/approval-error-dark.png)
