# Windows Owned-Process Verification Result

Historical failed-run record. Subsequent investigation corrected the measurement fixture and established [scoped private Windows x64 acceptance](2026-09-16-windows-owner-calibrated-result.md). The failed evidence below remains unchanged.

## Decision

**Not accepted. Windows support remains disabled.** The single authorized run [35046453910](https://github.com/taowang1993/tockteam/actions/runs/35046453910) at `38c94b20` failed its final handle-count assertion. No repeat run was launched. GitHub's `main` branch was not updated; only `verify/windows-owned-process-20260916` was published.

## Recorded Facts

- The Windows x64 SDK probe compiled and executed successfully. Its [receipt](windows-owned-process-2026-09-16/sdk.json) records all checked layouts, offsets, and constants.
- The hosted model suite passed 12 tests with eight POSIX-specific skips. These are still model/validation controls, not Windows lifecycle acceptance.
- Fresh runtime/vault tarballs were built and installed. The native worker reached the final missing-executable check, where the expected creation rejection occurred but the total Host handle count rose from **197 to 212**.
- Earlier native flow assertions were traversed before this failure. Their individual receipts were not retained because the worker wrote evidence only after complete success. The installed-module hash comparison was downstream of successful worker exit and also was not reached. Neither missing evidence is retroactively claimed.
- Worker PID **5832** exited. Outer exact-executable inventory recorded `residue: []`; **no emergency termination was used**. The native scratch root was removed, and the workflow's separate package/evidence-root removal step succeeded.

The [failed proof](windows-owned-process-2026-09-16/proof.json) remains explicitly unsuccessful. Its diagnostics preserve the count mismatch; [run metadata](windows-owned-process-2026-09-16/run.json) preserves the failed step and successful cleanup.

## What the Failure Means

It establishes an **unattributed process-wide increase of 15 handles**, not a proven owner leak or a proven harness false positive. The explicit failed-create path acquires one Job and six pipe handles and routes those seven through checked cleanup, but this run retained no acquisition/release ledger. Native internals and surrounding runtime activity remain possible sources. The equality assertion is unchanged.

Independent review agreed that neither attribution is established and blocked Windows enablement. It also found a verification defect: failed runs discarded structured intermediate evidence. A local-only correction now atomically checkpoints completed cases and current phase, retains measured counts/failure details, and collects partial receipts before scratch removal. Evidence writes stay outside the measured count interval. Case success is now recorded only after fixture cleanup, and failure releasing one observer handle cannot skip release of the other. These corrections have not been pushed or run on Windows and cannot recover the historical missing receipts.

## Local Verification

- `node --test tests/owned-process-windows-proof.test.ts`: **5 passed**, covering inventory/termination failures, uncertain residue, clean completion, partial receipt preservation, and cleanup despite evidence-collection failure.
- `node --test --test-concurrency=1 tests/*.test.ts`: **1,301 passed, 14 conditional skips**.
- `./node_modules/.bin/pnpm run typecheck`: passed.
- `node --check scripts/owned-process-windows-proof.mjs` and `git diff --check`: passed.

These checks validate the local harness correction, not the unresolved Windows handle increase.

## Next Discriminator — Requires Separate Authorization

Use one bounded experiment with two fresh workers, rather than repeating the six-case acceptance run:

1. A matched control with the same module/bindings and promise/assertion/timer scaffolding, but a synthetic expected rejection and no owner acquisition.
2. Exactly one missing-executable call with forwarding observers recording existing Job/pipe acquisitions, attribute lifecycle, `CreateProcessW` outcome, and `CloseHandle` arguments/results. Preserve return values and existing last-error retrieval; do not insert native calls between failure and error capture.

Capture global counts before/after and at predetermined microtask/event-loop checkpoints. No warm-up discards, retries, threshold changes, or waiting until equality. Preserve the first mismatch. Balanced explicit releases or a non-reproduction would not explain the original increase by themselves.

`tockteam-fsq` and `tockteam-bon` remain open. Launcher/index integration, isolated index transport, and historical Windows-stall attribution remain incomplete.
