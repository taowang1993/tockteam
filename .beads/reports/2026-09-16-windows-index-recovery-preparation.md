# Windows Index Recovery Preparation

## Scope

Subsequent explicit approval led to one successful [Windows run, 35127983115](2026-09-16-windows-index-recovery-result.md). The preparation-time scope and limitations below are retained as the pre-publication record.

Prepared a separate `index-recovery` arm in the existing Windows verification workflow. **No new Windows execution or publication has occurred.** Historical startup-stall causation remains unknown; `tockteam-bon` stays open.

No production code, dependency, timeout, ownership limit, user profile, or Desktop behavior changed. The existing six native index cases and owner/launcher checks remain separate and unchanged. The new arm keeps the copied-executable supervisor, independent inventory, retained process handles, 90-second worker deadline, three-minute step, 64 KiB receipt cap, failure-only emergency cleanup, and allowlisted evidence upload (`recovery.json`). The overall workflow remains capped at 15 minutes and restricted to the existing verification branch.

## Prepared Checks

- Source and installed JavaScript share the three native-clock assertion bodies. The callback fixture resolves native/progress siblings and dependencies from the actual child entry. It delays genuine successful SQLite callback delivery, never fabricates results or changes production timeouts.
- The nested Host initializes a real index. Its child then synchronously publishes an atomic blocked marker and blocks its own JavaScript event loop, preventing cooperative socket-close exit from being confused with kernel Job cleanup.
- A contender must receive genuine `SQLITE_BUSY` from either lease-acquisition statement, with its actual PID checked. Its process must already be signaled when `close()` returns. The main database bytes and bigint device/inode identity must remain unchanged.
- Both retained Host and child handles must be live immediately before synchronous **Host-only** `TerminateProcess`. Both must subsequently signal before replacement construction. A finite-block expiry marker or elapsed interval near expiry rejects acceptance.
- The replacement must perform zero document rereads, preserve file identity, return `Alpha.md` through indexed search, and be verified stopped. Observer handles are released once per acquisition, not deduplicated by numeric values Windows may reuse.

These are prepared assertions, **not Windows results**.

## Local Evidence and Corrections

The first implementation child timed out after 30 minutes. Its partial diff was captured and the same worker resumed with a narrow correction scope. No verification processes remained at that checkpoint. Parent inspection corrected premature clearing of the block timer, out-of-scope fixture variables, scratch-directory ownership, and sticky cleanup accounting before review.

Fresh review then identified three defects, all fixed:

1. Real contention can occur at `PRAGMA journal_mode`, before `BEGIN EXCLUSIVE`. The parent reproduced this failure using the generated fixtures, then accepted either actual lease statement and checked the reporting PID.
2. Ready/blocked JSON could be read during direct file writes. Both now publish with temporary-file writes and atomic rename.
3. Earlier liveness did not prove liveness immediately before termination. The synchronous termination helper now samples both handles and rejects already-stopped or invalid waits before invoking the native action.

Parent also removed cross-generation handle-value deduplication and fixed pending-spawn cleanup: tracking is read **after** `close()` settles acquisition. The delayed-acquisition regression failed before the fix (no stop observation/release), then passed.

The local generated-fixture smoke calls the real recovery implementation against this checkout's compiled JavaScript dependencies, with explicitly synthetic Windows observers. It verified all three compiled-JS clock cases, real generated Host readiness, child blocking, `SQLITE_BUSY` at `PRAGMA journal_mode`, unchanged main bytes, and stopped contender. It deliberately rejects the first native-termination request. During failure cleanup the blocked POSIX child survived Host-only death; independent cleanup then killed that owned child, verified empty inventory, and removed the root.

**This smoke is neither fresh isolated installation nor Windows acceptance. It does not execute the subsequent Windows replacement/reopen path.** Its `passed:false` and `emergencyCleanup:true` fields are intentional and preserved, not reclassified as an accepted native run.

Local records: [successful scoped fixture exercise](windows-recovery-preparation-2026-09-16/local-fixture.json), [original failed assertion](windows-recovery-preparation-2026-09-16/local-fixture-red.json), and [archived disposable driver](windows-recovery-preparation-2026-09-16/local-fixture.mjs.txt). The fixture roots recorded here were removed.

## Verification

Parent-executed commands:

```sh
node --test tests/owned-process-windows-proof.test.ts
node --test plugins/tocktutor/packages/tockbot-note-runtime/tests/search-index-native-clocks.test.ts
node /tmp/tockteam-recovery-fixture-smoke.mjs
pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime test
pnpm run typecheck
pnpm test
node scripts/tocktutor-build-manifest.mjs
node --check scripts/search-index-native-proof.mjs
node --check scripts/owned-process-windows-proof.mjs
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/owned-process-windows-proof.yml")'
git diff --check
```

Results: proof controls **18/18**, runtime **184/184**, root **1,318 passed / 15 skipped**, typecheck/manifest/syntax/YAML/diff checks passed. Source clock measurements included a 7,223 ms logical commit, 5,000 ms held-commit stall, and 5,049 ms held-drain stall. Final suite logs are `/tmp/tockteam-windows-recovery-{runtime,root}-final.log`; delayed-acquisition RED log is `/tmp/tockteam-recovery-close-race-red.log`.

Read-only reviewer `d625dc84-352f-4201-b465-29743a71fc6f`, rechecked as `f878cbc6-6a18-420e-b973-a08c7cf068f1`: **no remaining issues; scoped preparation approval with notes**. All three review references were applied. The parent executed checks; the reviewer inspected source and evidence.

## Next Authority Boundary

Request explicit approval to publish the reviewed commit only to `verify/windows-owned-process-20260916`, triggering **one** bounded Windows workflow. No main push, automatic retry, merge, or release is authorized. Inspect the exact-head receipts and cleanup before accepting native Windows recovery. Even a pass will not retrospectively explain the original stall.
