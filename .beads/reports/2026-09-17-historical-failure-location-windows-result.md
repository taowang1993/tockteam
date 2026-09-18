# Historical Failure Location Windows Result

## New Evidence, Not Historical Attribution

[Run 35177122567](https://github.com/taowang1993/tockteam/actions/runs/35177122567), attempt 1, at `113d137ff18c7a77d334c2cc94c0adb042dd39ca`, failed with classification **INCONCLUSIVE**. Historical job `105061172292` ran for 7m16s. Implementation: `009c600e`.

The new structured evidence attributes an **`uncaughtException` to both selected historical tests in both file-isolation modes**. This is more specific than the previous generic `test-failure` signal. It identifies Node's failure category and associated test declarations, not the underlying exception, its throw site, or the original historical startup-stall cause.

| Mode | Root PID | Exit | Keyword Declaration | Persistent Declaration | Node Category |
| --- | --- | --- | --- | --- | --- |
| Default File Isolation | 8772 | 1 | 4995:1 | 5109:1 | `uncaughtException` for Both |
| No File Isolation | 4872 | 1 | 4995:1 | 5109:1 | `uncaughtException` for Both |

The declaration coordinates were independently checked against reconstruction of the unchanged instrumented historical source. They are **not original-source line numbers or exception stack locations**. Both streams completed without either text-scan or failure-record truncation; each scanned 1178 TAP bytes and retained two structured failures. Their only text-pattern signal remained `test-failure`.

Neither arm reached its 60-second deadline. Both still have `evidenceIncomplete=true`: no valid journal or actual loaded dependency identities were retained. This does not prove no journal was written; missing and invalid journals share the same fail-closed result. Matching categories and exit codes do not establish parity, reproduce the original failure, or establish file isolation as a cause.

## Scope and Controls

The user explicitly selected **Run One Windows Check**, authorizing publication only to the existing verification branch and one bounded run with the full local historical replay gap retained. Windows x64 / Node 24.20.0 / Koffi 3.1.6, default threadpool, and OS temporary-volume settings were preserved.

- npm regression passed; roots 2088 / 7036 cleaned.
- All twelve reporter process controls passed on Windows: missing import, generic bootstrap error, failing hook, syntax error, selected-test error, and output overflow in both modes. The existing preflight also exercised the new pure privacy/schema/location/count/truncation controls. Roots: 1908, 9152, 9064, 8444, 3972, 8924, 8616, 5904, 9096, 4948, 7052, 5408. This is verification of the diagnostic controls, not historical behavior.
- Negative control passed: root 8012 → worker 9412 → descendant 6940, five-second deadline and pending phases, verified cleanup.
- Six pnpm configured-path probes and both frozen historical installs passed. Installer roots 3568 / 6792 exited 0. Configured package-manager paths are not filesystem confinement of trusted lifecycle scripts.
- Parent verified seven source/submodule pins, nine original source/lock/policy hashes, unchanged instrumented historical source and ownership hashes, exact mode arguments, reporter hash, run identity, and step outcomes.
- Reporter SHA-256: `31643fb3f2560e1880a49114754a1401b4c4e092e1889e8579ffaf1894089311`.

## Cleanup and Artifacts

All 11 diagnostic-owned operations report verified cleanup. Arm and final independent inventories are empty, `rootRemoved=true`, and `emergencyCleanup=false`. Artifact upload and fixture/scratch cleanup steps passed. The unrelated legacy diagnostic job was skipped. These are recorded post-stop runner checks, not a later live inspection of a retired runner.

Allowlisted evidence under `historical-runner-2026-09-17/`:

- `35177122567-receipt.json` — SHA-256 `1af1d0bb6a10396579cf6ff233ff7d7b36f579ad9bef5439bded4b1d2ee01e9e`
- `35177122567-run.json` and `35177122567-jobs.json`
- `35177122567-audit.json` — parent checks and sanitized preflight evidence

No raw logs, arbitrary error text, credentials, environment, or absolute fixture paths are published. The temporary local runtime had already been removed after empty process inventory verification.

## Next Discriminator and Authority

Focus the next local investigation on the **uncaught exceptions associated with the selected tests**, rather than assuming a generic module-startup failure or repeating the same comparison. A targeted candidate is fixed error-code evidence, including SQLite's known error codes, from the existing reporter's error/cause objects. SQLite remains a hypothesis, not an identified source. Do not add global exception handlers, suppress errors, weaken journal validation, or change the original tests to force completion.

No retry followed this run. Its publication/run authority is consumed. Main remains unchanged; no merge, release, or Desktop launch occurred. Further Windows publication/execution requires fresh approval after any local correction and review. `tockteam-bon` remains open; full local historical replay and historical causation remain unverified.
