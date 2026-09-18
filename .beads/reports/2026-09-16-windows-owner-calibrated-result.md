# Windows Owner Calibrated Native Verification

## Result

**Follow-up:** Public launcher testing later exposed a descendant-settlement race beyond this historical private-owner gate. The [corrected completion-port owner and native runner result](2026-09-16-windows-launcher-owner-result.md) supersede that settlement scope; the original receipts below remain unchanged.

**The Windows verification blocker is resolved.** [Run 35051759204](https://github.com/taowang1993/tockteam/actions/runs/35051759204) passed all six native lifecycle cases, independent raw-Windows calibration, deliberate leak detection, and process cleanup on Windows Server 2025 x64 / Node 24.20.0.

Tested commit: `437f1814f1fac7a2e28f64d15f3d03d44d2bcb58`.
Fresh installed owner SHA-256: `5b9d9e21df55e4fea8ab67b3136a26b7cb3708eee9b985ad174f60e3de76c75f`.

Evidence: [Full Proof](windows-owner-calibrated-2026-09-16/proof.json), [SDK Layouts](windows-owner-calibrated-2026-09-16/sdk.json), [Run Metadata](windows-owner-calibrated-2026-09-16/run.json).

## Diagnosis and Correction

The old check treated a process-wide handle count as if it measured only the owner's explicit handles. The [fresh-worker and independent C++ experiments](2026-09-16-windows-owner-discriminator.md) showed first-use retention on the raw Windows API path even without Node/Koffi. Every explicitly acquired Job/pipe handle was successfully released.

The corrected fixture executes one independent raw-API calibration in the same worker **before calling the owner**. It retains, rather than discards, the first-use counts and requires an exact seven-acquisition/seven-real-close ledger, error 2, zero process/thread/PID outputs, and attribute deletion before continuing. It does not retry until stable or raise a threshold.

In this accepted run, calibration recorded:

- Before setup: **187** handles.
- With its seven explicit handles, before `CreateProcessW`: **195** (one additional setup handle).
- Immediately after failed raw `CreateProcessW`: **210** (15 additional handles).
- After all seven explicit handles were closed: **203**.

This identifies measurement confounding and repairs the test, not a demonstrated omission in the product owner's cleanup. The exact internal Windows objects and the original historical 15 handles were not enumerated; their identity or benignness is not claimed. Prior failed receipts remain unchanged.

## Native Acceptance

| Case | Result |
| --- | --- |
| Unicode Arguments, Explicit Environment, Stdin EOF, Output Counts | Passed |
| Normal Root Exit with Detached Descendant | Passed; exact Job membership and both retained handles signaled |
| Cancellation | Passed; exact Job membership and both retained handles signaled |
| Output Overflow | Passed; exact Job membership and both retained handles signaled |
| Abrupt Host Death | Passed; child terminated through kill-on-close ownership |
| Failed Creation Releases Handles | Passed; **212 → 212**, exact seven real releases |

The original zero-growth assertion is unchanged. A separate negative control suppresses one close **outside** the real-call ledger: only six native releases occur and the count rises **212 → 213**. The original equality assertion rejects it. Finally, the real seventh close succeeds and restores **212**. Its full receipt is retained.

Worker 8668 exited; final exact-executable inventory was empty, no emergency termination was used, and the native scratch root was removed. Workflow package/evidence-root cleanup also passed. The parent independently checked the installed-module digest, all three acquisition/release ledgers, six case receipts, negative-control restoration, and cleanup fields before publishing these allowlisted files.

## Local Checks and Scope

- `node --test tests/owned-process-windows-proof.test.ts`: **13 passed**.
- `node --test --test-concurrency=1 tests/*.test.ts`: **1,309 passed, 14 conditional skips**.
- `node --test --test-timeout=30000 plugins/tocktutor/packages/tockbot-note-runtime/tests/owned-process-windows.test.ts plugins/tocktutor/packages/tockbot-note-runtime/tests/owned-process.test.ts`: **20 passed locally**; Windows recorded **12 passed, 8 POSIX skips**.
- `node --check scripts/owned-process-windows-proof.mjs`, `pnpm run typecheck`, workflow YAML parse, and `git diff --check`: passed.
- Independent review accepted the implementation before native execution and independently checked the final native artifacts and acceptance scope afterward.

This accepts the **private Windows x64 owner implementation and its fresh-package dependency resolution** for the tested lifecycle contract. Public dispatch remains deliberately disabled; launcher/index integration and isolated search transport are separate unfinished work. No Windows ARM64, Desktop installation, search-index readiness, or historical search-stall resolution is claimed. `tockteam-fsq` and `tockteam-bon` remain open.

Only the existing review branch was published. GitHub `main` was not updated; no merge or release was performed.
