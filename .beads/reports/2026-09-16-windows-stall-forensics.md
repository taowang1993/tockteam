# Historical Windows Stall Forensics

## Result

Read-only investigation recovered the original failed job and identified a concrete limitation in the earlier replay: **it disabled Node's file-level test isolation, while the original invocation did not**. This is a reproduction-fidelity gap, not evidence that isolation caused the hang. No production change or additional Windows execution is justified as a repair.

## Original Evidence

[Run 34684879638, attempt 1](https://github.com/taowang1993/tockteam/actions/runs/34684879638/attempts/1), Windows job `103530029108`, used Node **24.20.0**.

| Observation | Recorded Value |
| --- | --- |
| Native test command | `node --test --test-name-pattern="Keyword search reconciles\|persistent FlexSearch SQLite" tests/loader-composition.test.ts` |
| First named failure | `09:07:03.3410300Z`, after **16994.4646 ms** |
| Failure location | First `indexedSearch(2)`, original test line 5007; scanner returned three entries |
| Next recorded interruption | `09:34:26.2500949Z`, approximately **27m23s** later |
| Cancellation location | Test-file boundary, line 1; no precise pending test phase or native operation |

These are two observations, not proof of one continuous native wait. The original five-second readiness check runs only after an awaited search returns. It is not an outer deadline for loading, an individual search/native call, disposal, or the whole test. The cancellation-time pending-promise message does not establish which operation was stuck during the silent interval.

The named test failed after its JavaScript `finally` path; the log does not establish complete native-resource settlement or identify what followed. The persistent-index test also contains separate load, search, disposal, reopen, schema-corruption, and final cleanup stages. Assigning the silent interval to any one of them would be speculation.

## Revision Check

Independent evidence audit caught a provenance distinction: the run metadata's PR head is `9a709fc995343debed13740065039302a86c21e1`, but checkout actually used merge commit `b2872cbcde7efcfd2f291f0ed871d820370f6461`.

The parent then checked the GitHub commit API and local Git objects. **Both revisions have exactly the same tracked tree**, `8cad8eca84d72d5110807c04a65b302b212ae53e`; the comparison reports no changed files. Thus this distinction does not explain the failure, and the inspected historical source files match that checkout's tracked source. It does not prove equality of generated files, installed dependency bytes, or runner state across later runs.

## Replay Limitation

The historical workflow at `0a19b9ab` restored the old runtime source and test file, then invoked both original test names with **`--test-isolation=none`**. The original failing command used the default file-worker model. The replay also ran in the later checkout/dependency context and explicitly selected worker-pool sizes one and four.

Therefore the recorded 100 successful historical checks remain useful limited evidence; they are not 100 unchanged reproductions of the original process topology and environment. The archived workflow below makes that distinction inspectable.

Today's `scripts/test-search-index.mjs` deliberately uses the same no-file-isolation model so its supervised PID owns SQLite, and selects `^in-process search index`. That is appropriate for its legacy-engine diagnostic scope, but it is neither the original invocation nor a capture of the current public isolated startup path. The current child-based Windows acceptance remains separately established in [run 35127983115](2026-09-16-windows-index-recovery-result.md).

## Smallest Useful Next Experiment

Before adding an OS profiler or repeating the existing batch, prepare **one paired historical replay** differing only in Node's file-worker isolation mode. Use the same pinned historical source/dependencies and Node version for both arms, the original two test names and unchanged five-second assertions, identical bounded phase markers, and verified descendant ownership/cleanup. Record loading, each readiness check, retirement, reopen, schema mutation, and final cleanup independently of buffered test-result output.

An independent outer deadline must bound the whole process tree; no 30-minute hang, automatic retry, timeout increase, live user data, main-branch publication, or Desktop launch. A deterministic stalled descendant control must demonstrate that the diagnostic itself terminates and reports failure safely before any Windows publication.

If both arms pass, that is **inconclusive**, not closure or justification for another batch. If one fails, require the actual last pending phase and process evidence before choosing any deeper native/OS probe. If both fail, retain both failures rather than attributing the result to runner isolation.

This is a proposed experiment, **not implemented or executed**, and requires new explicit Windows publication/run authority. The original failure is not currently reproducible locally. `tockteam-bon` remains open.

## Durable Evidence and Verification

- [Original Job Excerpt](windows-stall-forensics-2026-09-16/original-job-excerpt.txt), with original line numbers and normalized line endings.
- [Run, Merge, Tree, and Source Provenance](windows-stall-forensics-2026-09-16/provenance.json), including the downloaded full job-log SHA-256 and historical source blob IDs.
- [Earlier Historical Replay Workflow](windows-stall-forensics-2026-09-16/historical-replay-workflow.yml.txt).

Parent checks: fetched the original attempt/job without running a workflow; verified exact head/attempt, calculated the **1,642,909 ms** reporting gap, compared merge/head trees, checked both original source blob IDs, and asserted the invocation mismatch against historical Git objects. No test suite was rerun because no executable code changed.

Fresh read-only evidence auditor `e10ed8ac-aab7-42b3-bf37-edadc9776c48` accepted the chronology/non-attribution limits and identified the PR-head/merge distinction. The subsequent equal-tree check was performed by the parent, not the auditor. The auditor did not independently reverify the later native acceptance artifacts. No additional Windows run, publication, app, server, or verification child process was launched.
