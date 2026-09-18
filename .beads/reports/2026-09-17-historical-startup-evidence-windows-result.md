# Historical Startup Evidence Windows Result

## Outcome

[Run 35172654646](https://github.com/taowang1993/tockteam/actions/runs/35172654646), attempt 1, at `c1bba2e3b485245834e3cfb51679089d9203dcd6`, verified the new reporter controls on Windows but did **not identify the historical arm failure cause**. Historical job `105047437672` failed after 8m47s. Implementation: `5af871c3`.

The single run and publication only to the existing verification branch were explicitly approved, carrying the previously documented full-local-replay gap. Windows x64 / Node 24.20.0 / Koffi 3.1.6 and default threadpool/temporary-volume settings were retained.

## Verified Scope

- npm configuration regression passed; owned roots 7012 / 5804 cleaned.
- All eight new Windows reporter controls passed: missing static import, invalid TypeScript, selected-test failure, and output overflow, each under default and no-file-isolation modes. Roots: 8772, 8288, 4816, 2500, 6760, 7328, 8604, 1344. Assertions cover sensitive-marker exclusion, root-versus-worker topology, original stdout accounting, the existing output-limit rejection, independent empty inventories, and fixture removal. This does not make them historical-test executions.
- Stalled-descendant negative control passed: 6976 → 8064 → 8648, five-second deadline, pending phase evidence, cleanup verified.
- All six pnpm configured-path probes and both frozen historical installs passed. Installer roots 8136 / 892 exited 0.
- Parent verified seven source/submodule pins, nine original hashes, unchanged instrumented historical test bytes, unchanged ownership hashes, mode argument difference, and the reporter hash against the exact dispatched commit.
- Reporter SHA-256: `ec687f1529d80d455d9e4bfde7abb1d392327f68214a30645b39fc695bd344e2`.

## Actual Historical Arm Evidence

| Mode | Root PID | Exit | Deadline | Reporter Bytes Scanned | Observed Signals |
| --- | --- | --- | --- | --- | --- |
| Default File Isolation | 7896 | 1 | Not Reached | 1177 | `test-failure` |
| No File Isolation | 7188 | 1 | Not Reached | 1176 | `test-failure` |

Both reporter streams reached their completion marker without scan truncation. Neither contained any other recognized allowlisted error code/name/category. That is **not evidence that no specific error existed**: only selected signals are retained, not arbitrary error text.

Both arms still have `evidenceIncomplete=true`, with no valid historical phase journal or loaded dependency identity record. Reporter completion does not establish test success, which selected test ran, or complete error disclosure. A generic `test-failure` signal cannot distinguish module loading, test execution, journal initialization, or another failure. No additional specificity can be recovered from the published artifact.

**Classification: INCONCLUSIVE.** Matching failed exits are not parity and do not explain the original historical stall/cancellation. No production repair or Desktop acceptance is claimed.

## Cleanup and Retained Evidence

All 11 diagnostic-owned operations report verified cleanup. Both arm and final independent inventories are empty, `rootRemoved=true`, and `emergencyCleanup=false`. Upload, fixture verification, and receipt-scratch cleanup steps passed. The unrelated legacy diagnostic job was skipped. These are recorded runner checks, not a later live inventory of the retired runner.

Allowlisted evidence under `historical-runner-2026-09-17/`:

- `35172654646-receipt.json` — SHA-256 `61a1d0a3ae788e71e7f9c3a30957508cbd444cafe39ce7610c61400603dd5edd`
- `35172654646-run.json` and `35172654646-jobs.json` — identity and step outcomes
- `35172654646-audit.json` — parent assertions and sanitized preflight evidence

No raw logs, environment, credentials, or absolute fixture paths are published. The temporary official local runtime was removed after its process inventory was verified empty.

## Next Boundary

No retry followed this run. Main remains unpushed; no merge, release, or Desktop launch occurred. `tockteam-bon` remains open.

Another unchanged run would not add a useful discriminator. The next local diagnostic design should identify the failing test and bounded source location directly from structured Node test events, without depending only on formatted-output keyword matching or publishing arbitrary messages. It needs its own focused controls and privacy review before any newly authorized Windows run. The full local historical replay remains unverified because of the recorded dependency download/build blocker.
