# Remaining Native Index Gates

## Scoped Local Acceptance

On macOS arm64, the three native-clock checks and surviving-child Host-death lease check pass. No production code, timeout, dependency, or public API changed. The full runtime suite passes **184/184**.

- One real FlexSearch commit plus drain remained active for **7227 ms**, sustained by distinct successful SQLite callbacks. The fixture delays **callback delivery**, not native SQL execution. Indexed readiness and exact candidate search succeeded.
- A held commit failed **5016 ms** after its last own progress observed by the Host, despite seven unrelated real native completions and 27 child-observed invalidations.
- A successful commit followed by a held real drain callback failed **5008 ms** after its last own progress. Commit and drain retained the same operation ID.
- Callbacks invoked under another operation restored their original identity. A successful callback delivered after its operation ended, including its follow-on native query, renewed neither operation.
- A separately launched Host was killed while its index child was observably stopped. The stopped orphan survived; a contender received real `SQLITE_BUSY`, and the main database bytes/inode remained unchanged. Only after verified child PID/group disappearance could another generation reopen, with **zero document rereads**, the same inode, and correct indexed results.
- Owned processes/groups were verified stopped before fixture removal. No browser, Electron app, Windows run, publication or release was involved.

## Discrimination and Harness Corrections

Test-only negative controls failed for their intended reasons:

1. Ignoring progress caused the long commit to fail at five seconds.
2. Renewing every active operation from another operation's progress prevented the required stall and hit the independent 12-second fixture deadline.
3. Replacing the lease's `BEGIN EXCLUSIVE` with `SELECT 1` admitted the contender and failed the required rejection.
4. Omitting only the late-completion marker failed naturally after the three-second polling budget (10.4 seconds total), without an external kill.

The first callback fixture incorrectly assumed eight callbacks in FlexSearch's initial transaction. That transaction actually performs six removal callbacks before the insertion transaction. The corrected fixture distributes those six distinct completions over eight finite delivery ticks; no callback is replayed or fabricated.

Review found and the parent corrected three verification defects: a losing infinite poll behind `Promise.race`, unbounded contender/reopen waits, and cleanup discovery errors bypassing known-owner termination. Polling now stops at its own deadline, readiness waits are bounded, and cleanup attempts all known owners before aggregating failures. Unresolved roots are retained.

## Verification

```sh
node --test plugins/tocktutor/packages/tockbot-note-runtime/tests/search-index-native-clocks.test.ts
node --test plugins/tocktutor/packages/tockbot-note-runtime/tests/search-index-host-death.test.ts
pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime typecheck
pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime test
git diff --check
```

Final local log: `/tmp/tockteam-final-native-runtime-v2.log`. Negative logs: `/tmp/tockteam-native-clock-negative-ignore.log`, `/tmp/tockteam-native-clock-negative-cross.log`, `/tmp/tockteam-index-host-death-negative.log`, `/tmp/tockteam-native-clock-missing-marker.log`. Negative mutations were removed before the final passing suite.

Read-only reviewer `5a29cf59-3911-4309-8069-e1b0b9154b49` inspected source, positive and negative evidence, and the corrected cleanup paths: **no issues found**. Commands and typecheck were performed by the parent. All three review references applied.

## Remaining Scope

The stopped-orphan proof is explicitly macOS-only; it does not claim Linux orphan reaping or a surviving Windows Job member. Existing native Windows Job/lease/index evidence remains separately documented. The new clock suite and Windows-specific blocked-child Host-death recovery subsequently passed in [authorized Windows run 35127983115](2026-09-16-windows-index-recovery-result.md); this does not convert the stopped-orphan scenario into Windows evidence. Subsequent [installed Desktop verification](2026-09-16-installed-index-desktop-result.md) accepted ready-state indexed UI search/opening and real native command effect/cleanup; the original workflow harness failure and unverified renderer completion state are explicitly retained. Historical Windows stall causation remains unproven; these tests establish isolation and recovery guarantees, not retrospective attribution.
