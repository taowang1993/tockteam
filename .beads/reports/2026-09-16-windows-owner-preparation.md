# Windows Owned-Process Preparation

## Status

Code checkpoint `baf225be` prepares creation-time Windows Job ownership but **does not enable it**. The public `spawnOwnedProcess()` still rejects Windows. Workflow execution and `PersistentSearchIndex` have not been migrated. Neither `tockteam-fsq` nor `tockteam-bon` is closed; historical Windows cancellation remains unattributed.

## Prepared Code

- `scripts/owned-process-windows-sdk.cpp` checks the exact 64-bit Windows SDK layouts, accessed offsets, and constants before emitting JSON. It performs no process/Job API calls. **It has not been compiled or executed on Windows.**
- The private `owned-process-windows.ts` leaf resolves the public pinned DSH Win32 package entry and obtains Koffi from that entry's dependency context. It extends only missing public APIs, rather than importing private bindings or creating a second base binding table.
- The prospective child receives a kill-on-close Job at creation, plus an explicit three-handle stdio inheritance list. The Job handle is not inherited. Exact application selection, mutable UTF-16 argv, explicit double-NUL environment, and attribute-buffer lifetime are preserved. Execution remains trusted-account code, not filesystem/network confinement.
- Polling reads at most 16 KiB from each available pipe per tick and uses nonblocking process waits. Success requires root exit, pipe EOF, zero active Job members, and successful owned-handle release. Unverified forced cleanup rejects after its five-second verification interval; uncertain handles are never blindly retried.
- Independent review found that an early thread-handle release failure could disappear from cleanup accounting. The selective regression failed before `baf225be`; sticky release uncertainty now prevents success even if every later check passes. The corrected model retains failed handles instead of pretending they were released. Final review accepted dormant preparation only.

## Local Evidence

| Check | Result |
| --- | --- |
| Windows lifecycle-model controls | 11 passed; injected bindings, **not native Windows evidence** |
| Combined POSIX owner and Windows-model suite | 20 passed |
| Runtime suite after final fix | 111 passed |
| Root serial suite after final fix | 1,296 passed, 14 conditional skips |
| Runtime/root typecheck and TockTutor workspace build | Passed |
| Actual staged public-entry-relative Koffi Buffer address/decode on macOS | Passed; no DLL binding or Windows API invocation |

Commands:

```sh
./node_modules/.bin/pnpm -C plugins/tocktutor/packages/tockbot-note-runtime exec node --test tests/owned-process-windows.test.ts tests/owned-process.test.ts
./node_modules/.bin/pnpm -C plugins/tocktutor/packages/tockbot-note-runtime run test
./node_modules/.bin/pnpm -C plugins/tocktutor/packages/tockbot-note-runtime run typecheck
./node_modules/.bin/pnpm run typecheck
./node_modules/.bin/pnpm run build:tocktutor
node --test --test-concurrency=1 tests/*.test.ts
```

The optional Win32 dependency is absent on this macOS install; the leaf's structural public-API subset permits cross-platform builds without treating that absence as native acceptance. The exact optional dependency and both lockfiles are updated. Generated output was rebuilt; no generated JavaScript was hand-edited.

Private local logs are under `/tmp/tockteam-eight/windows-owner-*`. SDK review and final owner recheck are in the `e294aa61-35c9-42cf-8ee1-7bea4f80c4ae` subagent output directory. No Windows run or publication occurred.

## Remaining Gate

Before enabling Windows ownership or migrating consumers, obtain authorized SDK compilation and real Windows lifecycle evidence: actual package/FFI resolution, creation-time membership, root exit with surviving descendants, cancellation, output pressure, bounded failure cleanup, and complete outer-process cleanup. Then verify the packaged native closure from each owning entry point. Model tests, SDK source assertions, macOS pointer tests, or `taskkill` are not substitutes.

Search-index isolation still requires the approved authenticated loopback transport, bounded inventory/document transfers, separate progress deadlines, generation guards, exact scanner fallback, and failed-owner cache-path quarantine. No further random historical-stall reruns are scheduled.
