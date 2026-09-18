# Historical Error Code Windows Result

## Captured Error

[Run 35179238712](https://github.com/taowang1993/tockteam/actions/runs/35179238712), attempt 1, at `d49426e44b4ee72ec821e8a8c020958ead569673`, failed with classification **INCONCLUSIVE**. Historical job `105067619148` took 8m17s. Implementation: `a4d06e6d`.

Both selected tests in both isolation modes now retain:

- Category: `uncaughtException`
- Error code: `ERR_TEST_FAILURE`
- Immediate cause code: **`SQLITE_CANTOPEN`**

This identifies a database-open error in the current replay, not why it could not open or what caused the original historical stall.

| Mode | Root PID | Exit | Keyword Declaration | Persistent Declaration |
| --- | --- | --- | --- | --- |
| Default File Isolation | 8976 | 1 | 4995:1 | 5109:1 |
| No File Isolation | 6556 | 1 | 4995:1 | 5109:1 |

Both reporter streams completed, scanned 1178 bytes, and were nontruncated for text and failure records. Both retained two structured failures; the text-only signal remained `test-failure`. Neither arm reached the 60-second deadline. Coordinates match the previously reconstructed, unchanged instrumented source: they are test declarations, not throw sites or original-source line numbers.

Both still have `evidenceIncomplete=true`. No valid phase journal or loaded dependency identities were retained. Missing and invalid journals are not distinguished; this does not prove no journal was written. Matching failure codes are not behavioral parity or historical causation.

## Source-Only Path-Length Lead

A read-only trace of historical commit `9a709fc995343debed13740065039302a86c21e1` found a specific, falsifiable **diagnostic path-length hypothesis**:

- `plugins/tocktutor/packages/tockbot-note-runtime/tests/loader-composition.test.ts:4973–4977,5069–5080` creates a temporary fixture, then `state` and `vault` directories.
- Historical `src/index.ts:286–289` in that same package appends a 136-character SQLite filename: two SHA-256 hex strings, a separator, and `.sqlite`. Vault and identity hashes are constructed at lines 3483 and 4696–4698.
- Lines 3233–3248 add `search-index/tocktutor-search-v2` beneath state. Lines 428 and 450 construct `sqlite3.Database(databasePath)` without an open callback; asynchronous open errors are therefore a plausible source of the reported uncaught category. This is not a captured exception stack.
- The diagnostic's unchanged `runArm()` places `TMP`, `TEMP`, and `TMPDIR` beneath its owned root and arm data directory. For an identical OS-temp prefix spelling, this adds **40 characters in default mode and 37 in no-isolation mode**. Canonicalization could also change that prefix; its actual length was not retained.

Using `path.win32.join()` and six-character temporary suffixes, the relative database-path suffix is 208 characters for the keyword case and 206 for the persistent case. Thus the main keyword database path is `OS temp prefix length + 249` in default mode, versus `OS temp prefix length + 209` in the original placement. The persistent equivalents are `+247` and `+207`. Journal-related filenames may be longer still.

These are source-derived lengths, **not retained actual Windows paths or measured native path limits**. They make path length a strong next lead but do not establish it: missing parents, permissions, or other open failures remain possible. No temporary-root relocation, database wrapper, original-test modification, or exception handler was introduced in this investigation. In particular, `SQLITE_CANTOPEN` in this replay is not the original run's indexed-candidate assertion failure.

The next useful controlled probe should distinguish deep versus short **owned, writable** paths using the historical SQLite installation, retain only bounded lengths/status/error codes, and preserve volume and cleanup controls. Do not shorten paths and call a later pass a reproduction without separating this setup correction from the original isolation comparison.

## Verification and Cleanup

Explicit user approval covered only the existing verification branch and one Windows run, carrying the unverified full local historical replay gap.

- Windows x64 / Node 24.20.0 / Koffi 3.1.6; existing default threadpool and OS-temp-volume settings preserved.
- npm preflight passed; roots 8564 / 4348 cleaned.
- Sixteen startup process controls and privacy/schema checks passed, including synthetic SQLite-shaped and actual filesystem uncaught errors in both modes. These controls are not executions of the historical database behavior.
- Stalled-descendant control passed: root 2576 → worker 4012 → descendant 6092 reached its five-second deadline and cleaned up.
- Six pnpm path probes and both frozen installs passed; installer roots 5660 / 9952 exited 0.
- Parent audited seven pins, nine original source/lock/policy hashes, unchanged instrumented source and ownership hashes, reporter hash, configured paths, mode arguments, error records, run identity, and step outcomes.
- Reporter SHA-256: `5d554b794645627efd8d1292c1653ac5558c90b804cf90976813798287f5e17c`.
- All 11 diagnostic-owned operations report verified cleanup. Independent arm/final inventories are empty; `rootRemoved=true`, `emergencyCleanup=false`. Artifact upload and fixture/scratch cleanup passed; the unrelated legacy job was skipped.

Cleanup is recorded post-stop evidence, not a later live inspection of a retired runner. Sequential preflight PID reuse does not represent an additional process identity or a live-process claim.

## Evidence and Authority

Allowlisted files in `historical-runner-2026-09-17/`:

- `35179238712-receipt.json` — SHA-256 `18eeb77ab82a7470263d1341695d839d40a5039a24f486a9bd332d51196f4fdf`
- `35179238712-run.json`
- `35179238712-jobs.json`
- `35179238712-audit.json`

No raw logs, arbitrary errors, credentials, environments, or absolute fixture paths are published. No retry followed this run; its authority is consumed. Main remains unchanged; no merge, release, or Desktop launch. Further publication/Windows execution requires fresh approval. `tockteam-bon` remains open; the original stall cause and complete Desktop acceptance remain unproven.
