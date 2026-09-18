# Historical npm Correction Windows Result

## Outcome

[Run 35169998523](https://github.com/taowang1993/tockteam/actions/runs/35169998523), attempt 1, verified the npm setup correction, but **did not produce a usable historical runner comparison**.

- Dispatched head: `3aee66cbc7246579a7f0a6b6f14154b9f3d905d8`; implementation: `ad27156b`
- Historical job: `105039416422`; duration 7m41s; workflow conclusion: failure
- Windows x64, Node 24.20.0, supervisor Koffi 3.1.6, default threadpool and `C:` temporary volume
- The user explicitly approved proceeding despite the blocked full local fixture gate; that gap remains documented, not silently accepted as passing.

## What Passed

- Actual Windows npm regression: duplicate-file negative control and separate-file nested lifecycle, owned roots 6204 / 6468, cleanup verified.
- Default-file-worker/stalled-descendant control: root 6856 → worker 5248 → descendant 7236; five-second deadline reached; pending phases retained; verified termination and empty final inventory.
- All six pnpm 11.21.0 configured-path probes. These establish configured destinations, not filesystem confinement.
- Both frozen historical installations: root PID 8148 and nested PID 3760 exited 0 without their deadlines. The previous npm duplicate-configuration blocker is therefore resolved on this Windows runner.
- Parent verification of seven source/submodule pins, nine original source/lock/policy hashes, both supervisor-owner hashes, unchanged mode arguments apart from isolation, and successful upload/cleanup steps.

## What Remains Unknown

| Arm | Root PID | Exit | Deadline Reached | Usable Evidence |
| --- | --- | --- | --- | --- |
| Default File Isolation | 8852 | 1 | No | No journal or loaded dependency record |
| No File Isolation | 6224 | 1 | No | No journal or loaded dependency record |

Both arm records have `evidenceIncomplete=true`. Their stdout byte counts are 790 and 788, but the diagnostic retained only counts, not the error text. Its failed-step log contains only the final inconclusive summary. There is no recorded arm error cause to attribute, and absence of a valid journal cannot establish which module or test statement ran.

**Classification: INCONCLUSIVE.** Matching exit codes with missing evidence are not test parity, not reproduction of the original readiness failure, and not proof for or against file-worker isolation as its cause. Successful installs do not establish actual loaded historical native-addon identities. No historical native callback/handle-growth/cancellation attribution or complete Desktop UI acceptance is implied.

## Cleanup and Authority

All 11 attempted diagnostic-owned operations report verified cleanup; both arm inventories and final inventory are empty, `rootRemoved=true`, and `emergencyCleanup=false`. The workflow verified fixture cleanup and removed its receipt scratch. The parent inspected recorded Windows results, not a later live probe of the retired runner.

The legacy diagnostic job was skipped. Exactly one newly authorized Windows run was dispatched; no retry followed. Only `verify/windows-owned-process-20260916` was published. No main push, merge, release, or Desktop launch occurred.

## Evidence and Next Step

Allowlisted evidence under `historical-runner-2026-09-17/`:

- `35169998523-receipt.json` — original bounded receipt; SHA-256 `9af9a42c7d0d2f903b74154bcd480b354daa7740fe34194e08c13f3b973a4d04`
- `35169998523-run.json` / `35169998523-jobs.json` — run identity and step outcomes
- `35169998523-audit.json` — parent assertions and sanitized npm preflight evidence

Raw logs, environment, credentials, and absolute fixture paths are not published. The next diagnostic change should preserve bounded, privacy-reviewed startup error information when no phase journal exists, without adding a wrapper that changes the tested process topology. Review and focused tests should precede any further Windows execution; new run/publication approval is required.

`tockteam-bon` stays open. The npm correction is verified; the historical stall remains unresolved.
