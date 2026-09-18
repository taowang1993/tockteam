# Windows Launcher Owner Result

## Accepted Scope

Native Windows x64 public-owner dispatch and the launcher command runner pass at commit `7cf344b8ab8764480d2b8e8a0a7124e87f78a7bc`, [run 35059495694](https://github.com/taowang1993/tockteam/actions/runs/35059495694). This is runner-level acceptance, not Electron/Desktop acceptance or indexed-search readiness. Non-x64 Windows remains fail-closed.

The runner resolves the owner from the staged runtime, scrubs the environment, validates the selected executable, preserves explicit `cmd.exe /D /S /C` quoting, and awaits completion and cleanup. There is no `taskkill` fallback.

## Failure and Correction

Job accounting alone was insufficient: run `35057754170`, normal-exit attempt 4, returned with shell PID 7956 and direct child PID 740 signaled, but descendant PID 10004 still returning `WAIT_TIMEOUT` (258). Every retained handle was unsignaled before release. Final inventory was empty without emergency termination: premature completion, not a persistent orphan.

The corrected owner associates a private completion port before creation. It processes at most 64 notifications per tick and retains at most 1024 lifetime birth identities, including the root. It reuses the root handle and opens descendants with non-inheritable `SYNCHRONIZE`-only handles; observer handles never authorize termination. Settlement requires an empty notification queue, matching birth/accounting totals, zero active processes, closed pipes, and signaled retained process handles. The five-second teardown deadline remains enforced.

Missing or malformed births, duplicate PIDs, failed opens (including error 87), failed waits, exceeded limits, and release failures cannot report successful cleanup. **Availability ceiling:** sufficiently short-lived or inaccessible descendants may cause cleanup rejection despite eventual termination. There is no absence shortcut, retry-until-success, or stabilization delay.

The SDK probe now checks completion-port API signatures, pointer/DWORD widths, structure offsets, and constants. Independent raw calibration and the missing-executable ledger each account for eight explicit handles: one Job, one completion port, and six pipe ends. Leak sensitivity withholds one actual release, observes exactly +1, and performs the eighth real release to restore the baseline.

## Native Evidence

All receipts and workflow metadata are retained in [`windows-launcher-owner-2026-09-16/`](windows-launcher-owner-2026-09-16/).

| Run | Result | Meaning |
| --- | --- | --- |
| 35056475354 | Failed | First immediate retained-handle failure after successful workflow output. |
| 35057254385 | Passed | Unfixed six-mode discriminator pass; not acceptance evidence. |
| 35057754170 | Failed | Repeated normal exits localized the unsignaled descendant. |
| 35059495694 | Passed | Corrected owner: six private lifecycle cases and thirteen public runner checks. |

The corrected run covers arguments/Unicode/spaces/shell metacharacters, eight fixed normal-exit checks, cancellation, timeout, overflow, and nonzero exit. All three retained process handles were 258 before each workflow action and 0 immediately at settlement. Repetitions are a fixed test matrix, not polling until success. Independent inventory was empty, emergency cleanup was false, and the temporary root was removed.

Fresh-package installed hashes match the committed generated modules:

- Private Windows owner: `9395fbbc98f8319a7fd32e54875543bc69312e199348cb0c99134b3fa1dadcfc`
- Public owner: `d43d13553610b86406da75c1caba98c25e501330da8872af9dbd3412d96d593a`

Native handle counts:

- Cold raw calibration: `187 → 196 → 211 → 203` (before, before create, after create, after eight verified releases).
- Owner failed creation: `212 → 212`.
- Real withheld-release control: `212 → 213 → 212`.

These counts do not establish the identity or benignness of the historical +15, or historical cancellation causation. Earlier cold-calibration and failed receipts remain preserved.

## Verification

- RED: the model failed when `ActiveProcesses === 0` but a retained descendant remained unsignaled. GREEN: completion remains pending until the descendant is signaled.
- `node --test --test-timeout=30000 plugins/tocktutor/packages/tockbot-note-runtime/tests/owned-process-windows.test.ts plugins/tocktutor/packages/tockbot-note-runtime/tests/owned-process.test.ts` — 25 passed.
- `node --test --test-timeout=30000 plugins/tocktutor/packages/tockbot-note-runtime/tests/owned-process-windows.test.ts tests/owned-process-windows-proof.test.ts` — 29 passed.
- `node --test --test-concurrency=1 tests/*.test.ts` — 1312 passed, 14 skipped, zero failures.
- Runtime and root typechecks, runtime build, generated build manifest, `pnpm run build`, and `git diff --check` passed.
- Independent source review found no remaining implementation issue; native evidence was then validated separately against the unchanged immediate-handle assertions, ledgers, sensitivity control, artifact hashes, and cleanup receipts.

## Remaining Work

Electron/staged Desktop acceptance remains separate. Authenticated bounded indexed-search child transport and reproduction of the historical startup stall are still pending. `tockteam-fsq` and `tockteam-bon` remain open. No merge, main-branch push, or release is authorized by this result.
