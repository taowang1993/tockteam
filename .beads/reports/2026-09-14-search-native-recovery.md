# Native Search Recovery Verification

## Outcome

The reproducible native SQLite lifecycle defects are repaired. The original intermittent Windows cancellation in run `34684879638` is **not conclusively explained**; `tockteam-bon` remains open. Passing historical reruns is not a root-cause finding.

The separate real-consumer output-contract bug, `tockteam-8my`, is fixed: `vault_search` no longer exposes runtime-only match `id`/`revision`, and `vault_read` no longer exposes runtime-only `revision`. Public strict schemas remain unchanged.

## Changes

- `5d325145`: await successful native opens, capture callback-less SQL failures, drain native work before closing, retire failed indexes, mark incomplete batches, and await prior owner cleanup before reopening an index path.
- `0a19b9ab`: reviewed generated outputs and added bounded Windows diagnostics.
- `c0663262`: hold the fixture's actual exclusive SQLite lock until the operation settles. Only the fixture's connection-local vendor busy-timeout reset is shortened; production timing is unchanged.
- `b567cf61`: project search/read results onto their existing public tool schemas, without mutating runtime results.
- `3bc0fe6c`: earlier diagnostic target. Tracing was subsequently removed, then test-only diagnostics were reintroduced after the post-cleanup failures below. Temporary instrumentation and `search-recovery-diagnostic.yml` currently remain; they are not production repairs.

## Test Evidence

| Check | Result |
| --- | --- |
| Final native regressions against original `7bb5a1b0` source in a disposable copy | 4/4 failed: remount ownership, open, lock, insertion. Actual `SQLITE_CANTOPEN`, `SQLITE_BUSY`, and `SQLITE_CONSTRAINT` errors; owner PID stopped. |
| `pnpm -C plugins/tocktutor/packages/tockbot-note-runtime test` | 87/87 passed. |
| `pnpm -C plugins/tocktutor/packages/tockteam-note-vault-tools test` | 14/14 passed, including unchanged standalone schema parity. |
| Both affected packages' `run typecheck` and `run build` | Passed. |
| `pnpm typecheck` | Passed. |
| `pnpm test` | 1,274 passed, 14 skipped, no failures or cancellations. |
| Local native stress, pools 1 and 4 | 20 fresh owner processes, 160 tests passed; all owner PIDs stopped. |
| Windows diagnostic `34860974758`, commit `3bc0fe6c` | Pools 1 and 4: 10 fresh runs each, all 160 tests passed. |
| Full CI `34860973302`, commit `3bc0fe6c` | All six jobs successful, including Windows, both macOS architectures, Linux, runtime smoke, and Nix. |

Windows diagnostic pool 1 initially failed **before tests**, when the SQLite prebuilt installation fell back to node-gyp and could not find a supported Visual Studio installation. Nix initially exhausted downloads with HTTP 504 errors. Only failed infrastructure jobs were retried at the unchanged commit; original failures remain in the run history. These retries are not evidence about the historical search stall.

The prior historical-source diagnostic replayed 100 fresh cold-start checks across the two Windows worker pools without reproducing the historical failure. No exact historical causal attribution is claimed.

## Post-Cleanup Failure

Full CI `34863380830` at cleanup commit `6b88be79` failed the Windows native insertion-recovery test: `native failure did not settle` after a five-second test deadline. The other seven native tests completed, and the native-owning process exited; this was not a dependency-download failure. The earlier green checks above remain historical evidence, **not final acceptance**. No timeout was increased. The test now captures timeout errors at the operation's call site so the next failure identifies the stalled recovery phase. Investigation remains open.

## Subsequent Readiness Investigation

Production recovery code remains unchanged; these experiments change tests and diagnostics only. Five-second deadlines and exact indexed-candidate assertions remain intact.

| Windows Run | Observation |
| --- | --- |
| `34865200902` | Native open recovery failed on the first-reopen `verify()` call, not initial failure handling or disposal. |
| `34893638357` | Iteration 23 failed after saving Alpha: expected one indexed candidate, observed three scanned files. Native recovery cases passed. |
| `34894488757` | Iteration 7 captured native lock recovery's first-reopen timeout: index/database null, readiness false, reconciliation pending, no pending paths, and repeated null candidates followed by completed three-file scans. No reconciliation/native error was recorded. |
| `34895140471` | Thirty runs passed with retained lifecycle phases and post-mount SQL callback timing; no failure snapshot. |
| `34896043106` | With four concurrent read-only searches enabled, iteration 30 failed before fault injection was observed, with zero verification polls. The preceding open case recorded a 1,038 ms SQL operation versus roughly 25 ms normally. This does not establish the cause of either failure. |
| `34897088010` | Thirty runs passed after moving callback timing to construction, including pre-mount operations. No failure snapshot. |

The captured pending-reconciliation window rules out downstream candidate rejection for that window. A nonempty epoch suggested final metadata publication, but it does **not** conclusively identify the outstanding operation: an epoch can survive an earlier unpublished reconciliation. The original snapshot's poll traffic had displaced lifecycle events. Separate bounded phase history and pending-operation tracking now address that gap.

The pre-injection failure means verification-query traffic was not necessary for that occurrence. It does not establish slow storage, a native deadlock, a lost invalidation, or a shared cause with the historical cancellation. No speculative production repair or timeout increase has been applied. The fresh read-only review identified missing `get` schema probes and an unobserved locker-open/BEGIN interval; those callback observations have now been added. Initial filesystem phases before activation remain a coverage limitation.

Latest local verification at `75f00838`: runtime 87/87 and package typecheck passed. Diagnostic callbacks preserve the original receiver, arguments, return values, and promises; no C++ SQL trace or additional native error handlers are installed. The manual workflow has returned to one verification query per poll.

### Captured Schema-Setup Delay

Windows run `34903097899` failed at iteration 25. The lock and insertion cases missed the five-second **pre-injection** gate with zero verification polls; neither reached its intended native fault. Before CDB started, successful schema callbacks in the lock case took 829, 1,598, 633, and 286 ms. Its next schema operation was pending at the deadline.

CDB capture occupied 322 ms. Later stacks showed waiting workers, not an identifiable SQLite I/O operation. Mount subsequently completed at 9,615 ms, followed by successful drain and close. The insertion case, without another debugger capture, completed mount at 5,780 ms; twelve successful schema-write callback latencies totaled 5,750 ms. Both ended with empty pending SQL. These are submission-to-callback timings, not measured disk execution times; disposal had already aborted reconciliation, so mount completion does not prove full readiness.

The persistent-index test failed on its **third verification, after deliberate schema-version corruption**, not its ordinary valid-schema reopen. Its outstanding operation was not captured. The native owner exited with three failed tests, zero cancellations, and verified process-tree cleanup. Raw evidence: `/tmp/tockteam-bon-native-stack-windows.log`.

A paired real-SQLite control now delays only successful schema callbacks using the insertion trace's twelve timings. It separately records native callback arrival and artificial delivery. Undelayed setup passes the original five-second observation; replay explicitly misses it, still returns the correct match through the three-file scanner, and subsequently reaches two-entry indexed search without invalidation or reload. The separate post-failure observation does not convert the original missed deadline into a pass. Cleanup keeps its own five-second bound.

Negative calibration with delays disabled correctly failed the expected deadline-miss assertion. Enabling the recorded delays passed the paired control, all 91 runtime tests (including its nested cases), and typecheck. This establishes that cumulative successful callback latency is sufficient for the setup symptom, **not** what caused that latency on Windows or the historical cancellation. No transaction change, timeout increase, or production repair is justified by this control alone.

Commands and calibration logs:

- `pnpm -C plugins/tocktutor/packages/tockbot-note-runtime exec node --test --test-isolation=none --test-name-pattern='schema callback latency' tests/loader-composition.test.ts`
- `pnpm -C plugins/tocktutor/packages/tockbot-note-runtime test`
- `pnpm -C plugins/tocktutor/packages/tockbot-note-runtime typecheck`
- `/tmp/tockteam-bon-schema-replay-red.log`
- `/tmp/tockteam-bon-schema-replay-green.log`
- `/tmp/tockteam-bon-schema-replay-runtime.log`

Fresh read-only causal review agreed with this limited interpretation and rejected a speculative transactional-schema repair. Review artifact: `/Users/taowang/.pi/agent/sessions/--Users-taowang-projects-tockteam--/subagent-artifacts/outputs/e90c43fb-114c-4c15-b5d8-747c1fdb9b41/causal-review.md`.

### Native Stack Capture Preflight

Debugger discovery `34900302460` found an existing Microsoft-signed CDB; no debugger installation was required. The first preflight correctly rejected an exit-zero/no-stack result caused by an incompatible detach option. Corrected preflight `34901443107` captured real thread stacks using non-suspending, noninvasive `-pvr`; the owned Node parent and blocked worker then continued, and process-tree cleanup passed.

Capture is enabled only in the manual diagnostic, after a failure has already been determined. It is limited to one capture per native owner, with a five-second debugger bound and margin inside the existing 60-second owner deadline. The gate now uses the existing process-tree cleanup helper so debugger descendants are included. No heap dump, shell command, or network symbol retrieval is requested.

**Limit:** starting CDB and synchronously collecting output delays JavaScript callback delivery after the failure. Later SQL callback durations are therefore contaminated by capture time; native stacks are later samples, not simultaneous snapshots of the original timeout. A separate one-second post-failure observation can report eventual readiness before disposal, but cannot turn the failed test into a pass.

### Deterministic Retained-Epoch Control

A fault-free local control held delivery of the successful schema-publication callback, requested full invalidation, and held the automatic retry at its next list operation. It reproduced the observed combination of a retained nonempty epoch, null published handles, false readiness, a pending task, and cleared pending flags. Search returned the correct match via a three-file scan. Releasing the list barrier, without another invalidation, restored two-entry indexed search within the unchanged five-second deadline.

This demonstrates that the snapshot does not uniquely identify a final metadata write. It is **not** a Windows reproduction or production repair. The focused control passed, followed by all 88 runtime tests and typecheck. Native probes now include connection/attempt identifiers; durations remain submission-to-callback latency, not measured SQLite execution time.

Commands:

- `pnpm -C plugins/tocktutor/packages/tockbot-note-runtime exec node --test --test-name-pattern='retained epoch' tests/loader-composition.test.ts`
- `pnpm -C plugins/tocktutor/packages/tockbot-note-runtime test`
- `pnpm -C plugins/tocktutor/packages/tockbot-note-runtime typecheck`

Additional raw evidence:

- `/tmp/tockteam-bon-preserved-windows.log`
- `/tmp/tockteam-bon-keyword-windows.log`
- `/tmp/tockteam-bon-metadata-windows.log`
- `/tmp/tockteam-bon-query-load-windows.log`
- `/tmp/tockteam-bon-full-sql-windows.log`

## Actual Consumer Proof

A disposable pinned DSH `0.1.2-rc.1` headless profile installed fresh local tarballs through the real CLI. The preexisting conflicting vault plugin was disabled only in that temporary profile. A model used the real `vault_search` and `vault_read` tools against three fixture files. A read-only `tools/result` observer captured the final tool outcomes after DSH's strict output validation:

- `vault_search`: `isError: false`, one matching note, `scan.entries: 2`, not the three-file fallback scan.
- `vault_read`: `isError: false`, returned the fixture's random receipt, matching the model's final answer.
- Neither result leaked the undeclared runtime identity fields.

An earlier attempt returned the receipt via a search fallback while `vault_read` failed; that was **rejected** as read proof. The accepted run requires both observed successful tool outcomes.

Accepted consumer directory: `/tmp/tockteam-bon-consumer-gNn96t`. Durable allowlisted results: `2026-09-14-search-native-tool-results.jsonl` beside this report. The receipt is generated test data, not a credential.

Fresh installed tarball SHA-256 values:

| Package | SHA-256 |
| --- | --- |
| `tockbot-note-runtime-0.1.2.tgz` | `b22d456a607a1b9aeeb6d5c0437c4e9de8192628a8d778e73f525d0c47abda69` |
| `tockbot-note-vault-0.6.0.tgz` | `9d71a3c6fa544cba871aa41a71276992e6d47e22466485ffdc156776c71b748c` |
| `tockteam-note-vault-tools-0.1.2.tgz` | `3241fd803bd45c9cca43bd40b352d31c477cecffa723071c5564cb2d880fa883` |

The consumed runtime/tools `package/lib/index.js` bytes were compared directly with the tracked compiled outputs and matched. All launched consumer process groups were stopped and checked; disposable credential/home data was removed in `finally`. No foreground app, user profile, or Keychain was used.

## Reviews and Limits

Independent read-only reviews accepted both the native repair and final fixture/tool-contract follow-up with no findings. The latter review inspected the RED/GREEN logs and actual consumer results but did not independently execute the app or recompute manifest hashes; the parent performed those checks.

Local raw evidence:

- `/tmp/tockteam-bon-final-counterfactual-red.log`
- `/tmp/tockteam-bon-tool-red.log` and `/tmp/tockteam-bon-read-red.log`
- `/tmp/tockteam-bon-runtime-final.log`, `/tmp/tockteam-bon-tools-final.log`, `/tmp/tockteam-bon-root-final.log`
- `/tmp/tockteam-bon-final-stress-zPnekB/proof.json`
- `/tmp/tockteam-bon-windows-attempt2.log`

These checks prove recovery for reproduced open/lock/write failures and owner overlap, not that arbitrary non-returning native calls can never block product disposal. There is no new product timeout or process-isolation guarantee. A fresh failure trace is needed to resolve the still-unexplained historical incident. RC.1 pinned-summary clipboard/browser proof is separate and remains incomplete.
