# Windows Owner Handle Discriminator

## Fresh-Worker Result

[Run 35049548891](https://github.com/taowang1993/tockteam/actions/runs/35049548891), commit `3bacfd55df2f14729456261818872d24c2225bde`, completed the two-arm experiment and **failed** the unchanged handle-equality assertion in the missing-executable arm.

| Checkpoint | No-Owner Control | Missing Executable |
| --- | ---: | ---: |
| Before | 187 | 187 |
| Immediately After Returned Promise | 187 | 203 |
| After Expected Rejection | 187 | 203 |
| After One Microtask | 187 | 203 |
| After One Immediate | 187 | 203 |

The growth occurs inside the synchronous native setup/failure path, before promise/timer completion. The control uses the same loaded modules, expected-rejection assertion, deadline wrapper, and fixed checkpoints without calling the owner. No warm-up calls or count thresholds were introduced.

The complete, non-truncated native ledger records one Job and six distinct pipe handles; each has exactly one successful `CloseHandle` result. Attributes were deleted. `CreateProcessW` returned zero, its process/thread output slots remained zero, and the existing `GetLastError` returned `ERROR_FILE_NOT_FOUND` (2). This excludes an omitted release of those seven explicitly acquired handles in this run; it does not yet attribute the other 16 handles.

Both fresh installations resolved the expected module SHA-256 `5b9d9e21df55e4fea8ab67b3136a26b7cb3708eee9b985ad174f60e3de76c75f`. Workers 3984 and 1868 exited, exact-executable inventories were empty, both scratch roots were removed, and neither required emergency cleanup. Workflow package/evidence-root cleanup also succeeded.

Retained evidence: [Control](windows-owner-discriminator-2026-09-16/control.json), [Failed Native Arm](windows-owner-discriminator-2026-09-16/missing-executable.json), [Run Metadata](windows-owner-discriminator-2026-09-16/run.json).

## Verification and Authority

- `node --test tests/owned-process-windows-proof.test.ts`: 11 passed after RED/GREEN regressions for late and immediate count-probe failures.
- `node --test --test-concurrency=1 tests/*.test.ts`: 1,307 passed, 14 conditional skips.
- Ownership model tests: 20 passed locally; Windows models passed 12 with eight POSIX skips.
- Syntax, typecheck, workflow YAML parse, and whitespace checks passed. Independent review accepted the bounded sampler, last-error forwarding, receipt preservation, and cleanup deadline fixes.

The user explicitly selected **Continue Until Fixed**, authorizing targeted review-branch updates and bounded Windows checks through remediation. GitHub `main`, merges, and releases remain outside that authority. Windows public ownership remains disabled.

## Direct Windows SDK Result

[Run 35050595694](https://github.com/taowang1993/tockteam/actions/runs/35050595694), commit `45e685fe91669ab4202d9d6721015aadab0dcf21`, compiled and ran an independent C++ equivalent without Node or Koffi. Both calls were retained:

| Phase | First Call | Second Call |
| --- | ---: | ---: |
| Before | 64 | 112 |
| Job Created | 65 | 113 |
| Three Pipes Created | 72 | 119 |
| Attributes Prepared | 72 | 119 |
| Failed CreateProcessW | 119 | 119 |
| All Seven Explicit Handles Released | 112 | 112 |

The first pipe accounts for one extra handle; the first failed `CreateProcessW` accounts for 47. The second call adds no retained handles. Both report error 2 and seven successful explicit releases. The [native receipt](windows-owner-discriminator-2026-09-16/native-baseline.json), [owner receipt](windows-owner-discriminator-2026-09-16/native-baseline-owner.json), and [run metadata](windows-owner-discriminator-2026-09-16/native-baseline-run.json) preserve these facts. Process 5876 exited without emergency cleanup; the temporary root was removed.

This demonstrates first-use retention on the direct Windows API path. It does not identify the exact internal objects, establish their benignness, or retroactively identify the historical 15 handles.

## Measurement Correction

Independent review endorsed and then reviewed this correction:

- Perform exactly one matching, independent raw-API calibration **in the same worker before any owner invocation**. Retain all first-use counts and the full native ledger; do not discard a warm-up or invoke the owner as calibration.
- Gate continuation on error 2, zero process/thread/PID outputs, attribute deletion, and exactly seven unique acquired handles matched by seven successful **real** closes. A calibration cleanup failure cannot become an accepted baseline.
- Keep all six original native cases and the original handle-count equality assertion unchanged. Add exact acquired/released identity checks to the failed-owner case.
- Add one explicit sensitivity control: suppress one close outside the real-call ledger, require six actual closes and exactly **+1** handle, demonstrate the unchanged equality assertion rejects it, then perform the real close and require restoration of the original count. Preserve failures and cleanup receipts.

Local checks after this correction: 13 focused tests; root suite 1,309 passed with 14 conditional skips; syntax, typecheck, YAML parse, and whitespace checks passed. Model tests exercise the real owner against fake bindings, including failed calibration and failed sensitivity recovery. Subsequent [native verification of the corrected measurement](2026-09-16-windows-owner-calibrated-result.md) passed all six cases and the deliberate leak sensitivity control; the linked report defines the accepted scope.

The original 197 → 212 result and fresh-worker 187 → 203 result remain failed evidence, not acceptance.
