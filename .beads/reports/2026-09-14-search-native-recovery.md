# Native Search Recovery Verification

## Outcome

**Subsequent status:** the implementation and acceptance limits below describe this historical investigation. The current isolated runtime has separate [native Windows clock/recovery acceptance](2026-09-16-windows-index-recovery-result.md). A [later forensic audit](2026-09-16-windows-stall-forensics.md) confirms the original source tree and records that the historical replay changed Node's file-level test isolation; historical causation remains unresolved.

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

The prior historical-source diagnostic replayed 100 fresh cold-start checks across the two Windows worker pools without reproducing the historical failure. It restored two historical files into a later checkout and used `--test-isolation=none`, unlike the original default file-worker invocation; these were not unchanged process-topology/environment reproductions. No exact historical causal attribution is claimed.

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

### Windows Temporary-Storage Comparison

Approved bounded probe `34905513383` compared 128 alternating pairs of identical 4 KiB write/sync/close/remove operations in the default temporary folder and `RUNNER_TEMP`. These were different devices. No SQLite code or production settings were changed.

| Location | Sync Median | Sync P95 | Sync Maximum |
| --- | --- | --- | --- |
| Default temporary folder on `C:` | 3.763 ms | 18.702 ms | 28.210 ms |
| Runner temporary folder, `D:\\a\\_temp` | 0.134 ms | 0.189 ms | 1.173 ms |

The paired workload completed in 916 ms; event-loop utilization was 5.6%. Owner PID 4488 exited and process-tree cleanup passed. The preceding debugger preflight also passed. Raw evidence: `/tmp/tockteam-bon-storage-windows.log`.

This establishes a substantial sync-latency difference between these locations **on this runner**, not the cause of the earlier 1.6-second callback or the historical cancellation. It is a short filesystem probe on a fresh runner, not the complete SQLite workload on the failing runner.

With explicit user approval, `3e2b888b` changes Windows CI test placement to the runner-owned temporary folder and asserts the actual Node temporary path. Production data locations and all five-second gates remain unchanged. The manual diagnostic still defaults to the original OS temporary folder; an explicit input selects the runner folder and either one or thirty bounded native-gate runs.

Approved single-run verification `34907590285` confirmed `D:\\a\\_temp`, passed all eight native tests with zero failures/cancellations, and verified owner process-tree cleanup. Full CI `34907592374` also passed all six jobs: Windows, both macOS architectures, Linux, runtime smoke, and Nix package smoke. Workflow syntax and the unchanged TockTutor build manifest were checked locally; configuration-only changes needed no additional unit test.

This is a verified **CI test-placement mitigation**, not proof that the intermittent symptom is eliminated or the historical cancellation is explained. `tockteam-bon` remains open, and the default-location diagnostics are retained. Any future causal investigation should correlate filesystem/native timing on the actual failing runner rather than infer a production repair from green reruns.

### Native Worker Timing Discriminator

The next discriminator uses Node's existing `node.threadpoolwork` events rather than a new OS profiler. Installed sqlite3 creates N-API work; Node `v24.21.0` brackets the worker's execution separately from event-loop completion dispatch (`src/threadpoolwork-inl.h` and `src/node_api.cc`, official Node source). These boundaries do not distinguish SQLite mutex/lock waits, storage waits, computation, and OS descheduling inside native execution.

Worker events have PID/TID but **no request ID**. Asynchronous request events have reusable pointer IDs. The diagnostic therefore attributes a worker only when an entire request window is exclusive and contains exactly one complete worker span. Overlap, cancellation/no unique span, missing boundaries, and invalid owner/clock evidence are not guessed away. A request can also wait inside the addon before N-API submission, and synchronous addon `wait()` has no worker span.

SQL IDs, observed lifecycle phases, verification phases, and a 20 ms heartbeat are encoded as AsyncResource-init markers on the trace's own clock. No callback context is replaced. Initial calibration caught that unescaped quotes in resource names produce invalid Node trace JSON; URI encoding corrected this. The actual local SQLite control then measured 47 microseconds of worker execution and 200,933 microseconds until completion dispatch during its deliberately blocked main thread. This validates measurement separation, not the Windows cause.

Local checks: seven parser/evidence checks, eight native-gate cases with tracing, all 91 runtime tests without tracing, and typecheck passed. The real local gate produced 1,047 uniquely associated requests and retained 313 as unresolved. Logs: `/tmp/tockteam-native-trace-unit.log`, `/tmp/tockteam-threadpool-control.log`, `/tmp/tockteam-threadpool-gate.log`, `/tmp/tockteam-native-trace-runtime.log`.

The opt-in workflow is limited to **one** native-gate iteration after a successful timing control on the actual runner. It retains the five-second assertions and 60-second owner bound, monitors a 32 MiB raw-trace limit, skips synchronous CDB during the measured interval, verifies process-tree cleanup before analysis, and uploads only filtered `evidence.json` files. Trace markers and worker events are retained even when parsed evidence cannot be classified. Invalid/truncated JSON or oversized captures remain inconclusive rather than fabricated results.

Independent read-only review `9922ac50` accepted that implementation with those limits. The user approved publication and exactly one Windows capture. Run `34917395397` validated the timing control on Node `v24.20.0`: 164 microseconds of native execution and 205,169 microseconds until dispatch. The default-`C:` native gate then passed five cases before its trace exceeded 32 MiB. The guard stopped the owner process tree; the main trace was not analyzed or published. Only the valid control artifact survived. This is a **diagnostic volume failure**, not a reproduced startup failure; the remaining native cases were not verified by this run. No automatic rerun followed.

The local correction replaces broad async-hook tracing with private `Console.time`/`timeEnd` markers (`node.console`) whose text output is discarded. Official Node `v24.20.0` console/debuglog source confirms these emit trace-clock events. The classifier still uses the same native worker/request events; only unrelated promise/resource logging is removed. Local raw native-gate output fell from 23,478,389 to 1,730,078 bytes. The corrected control, all eight native cases, seven classifier checks, and typecheck passed locally. Tests now use the root suite's `.test.ts` filename convention so normal CI discovers them. Corrected capture logs: `/tmp/tockteam-console-trace-control.log`, `/tmp/tockteam-console-trace-gate.log`; Windows log: `/tmp/tockteam-threadpool-windows.log`.

Read-only follow-up review `497d8c83` accepted the lower-volume correction without findings. The user then explicitly approved one corrected capture. Run `34918881128` completed on default `C:` temporary storage: control PID 8064 measured 180 microseconds of native work and 203,697 microseconds until dispatch; gate PID 6104 passed all eight tests with zero failures/cancellations. Both process trees were verified stopped. The gate retained 1,020 uniquely associated request intervals and 316 unresolved intervals; no deadline marker occurred.

The captured slow writes were dominated by **native execution**, not completion dispatch. For example, insertion-recovery SQL ID 192 on connection 6 (`INSERT OR REPLACE INTO metadata`, key `epoch`) took 264,674 microseconds from observed submission to callback. Its two uniquely contained N-API spans accounted for 264,557 microseconds of native execution and 43 microseconds of dispatch delay. The longer worker span alone lasted 264,541 microseconds, while its recorded thread-CPU counter advanced 1,169 microseconds; ten heartbeat markers occurred during that worker interval. The corresponding completion dispatch followed in 29 microseconds. This supports native waiting/descheduling, rather than main-thread delivery or CPU execution dominating **that observed interval**. It does not distinguish filesystem I/O, SQLite locks/mutexes, or OS scheduling.

This run did not reproduce the five-second readiness failure. The insertion case's 5.36-second total covered multiple existing phases; no individual five-second assertion failed. It cannot retroactively establish the original cancellation's cause. No production change follows, and no further capture is scheduled.

Evidence: `/tmp/tockteam-console-trace-windows.log`; downloaded artifact `/tmp/tockteam-console-trace-windows-evidence/capture-1re4Io/evidence.json`; analysis `/tmp/tockteam-console-trace-windows-analysis.log`. The approved workflow published the filtered evidence as `native-worker-evidence`.

Full CI `34918882353` passed Windows native/root checks and four other jobs, but macOS arm64 failed a separate marketplace test at `tests/plugin-marketplace.test.ts:771`. The test assumed the live preview would still exist when the client consumed an acknowledgement, despite a five-millisecond deferred apply. A test-only 50 ms delay in client response consumption reproduced the exact failure locally. With explicit user approval, the assertion now checks the acknowledgement's captured preview **after** the live preview has cleared and installation completed. No gateway, authentication, approval, or production timing code changed. The delayed-client counterfactual, all 41 marketplace tests, all 1,281 passing root tests (14 skips), and typecheck passed. Follow-up tracking: `tockteam-rcy`; logs `/tmp/tockteam-gateway-race-{red,green}.log`, `/tmp/tockteam-gateway-focused.log`, and `/tmp/tockteam-gateway-root.log`.

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
