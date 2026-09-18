# Owned Search-Index Child: Vertical Verification

## Scope

This checkpoint implements an internal child-backed query path. The live `src/index.ts` remains on its existing in-process v2 engine. It does **not** establish full product isolation, Windows acceptance, packaged distribution acceptance, or historical cancellation causation.

The new `SearchIndexProcess` owns one authenticated generation, uses the existing `spawnOwnedProcess` termination proof, and resolves the fixed emitted/source child entry relative to its module. The child holds a rollback-journal SQLite sidecar lease before opening the main database, uses v3 metadata, and receives inventory/documents only through bounded demands. No arbitrary filesystem or SQL RPC was added. This is trusted-account process isolation, not a filesystem sandbox.

The transport limits requests to four, serializes one acknowledged data page per direction, caps pages at 256 entries and the 64-KiB encoded envelope, and chunks documents at 32 KiB decoded bytes. Control/data writes have a bounded ten-frame queue. Native clocks track each logical operation, including commit plus drain. Search cancellation settles its caller promptly but retains admission until native/transport completion. Invalidation revisions fence stale results.

## RED and Review Corrections

The initial query test failed with the missing process facade. Independent read-only review then identified three concrete defects, all reproduced before correction:

- Four searches plus invalidation exhausted the channel queue. Fixed with bounded, snapshotted protocol admission that retains control capacity.
- Closing after authentication but before spawn returned could install a polling timer after cleanup. Fixed with a post-authentication abort check; a deterministic barrier test verifies no timer remains.
- A spawn rejection containing cleanup uncertainty could become a fulfilled facade close when no owner was returned. Spawn failure is now conservatively retained; repeated closes reject while listener cleanup still runs.

Cancellation control was separately test-first: the missing identity-bound cancel frame failed before implementation. Terminal-response/cancel crossings are harmless; cancellation never releases a request slot early.

RED logs: `/tmp/tockteam-index-process-red.log`, `/tmp/tockteam-index-process-review-red.log`, `/tmp/tockteam-index-process-spawn-red.log`, `/tmp/tockteam-index-cancel-red.log`.

Final read-only challenge `9b740eb0-f3e5-4091-97d0-2f220b2f97bb` found no remaining issues in this limited slice. The reviewer applied simplification, security and performance references; execution evidence below was verified by the parent, not independently rerun by the reviewer.

## Verification

```sh
node --test --test-timeout=30000 \
  plugins/tocktutor/packages/tockbot-note-runtime/tests/search-index-process.test.ts \
  plugins/tocktutor/packages/tockbot-note-runtime/tests/search-index-protocol.test.ts
pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime test
pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime test:search-index
pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime typecheck
pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime build
node scripts/tocktutor-build-manifest.mjs --write
node scripts/tocktutor-build-manifest.mjs
git diff --check
```

Results on macOS arm64:

- **21 focused checks:** 9 process and 12 protocol checks passed.
- **166 runtime tests:** all passed, no skips/cancellations.
- **8 existing native-engine checks:** passed; native gate owner PID 65443 and its process tree stopped. This gate still exercises the existing in-process integration, not the new production path.
- Typecheck, build, manifest verification and diff check passed.
- Actual separate-PID query indexed 300 records, transferred multi-page candidate results and chunked Unicode content; a Unicode-specific query returned only `0.md`.
- Four-search/invalidation and cancellation bursts preserved admission bounds, rejected stale results, and recovered without killing the healthy generation.
- Actual SQLite lease contention, simultaneous first creation, verified owner death/reacquisition and persistent reopen passed. Reopen retained the main file inode and required zero document rereads.
- A fixture withheld a **successful real SQLite callback** in the child. Host remained responsive; the native stall clock terminated the generation at approximately 5.08 seconds. This tests withheld callback completion, not a reproduction of the historical native hang.
- Disposal returned after verified child termination despite a held Host inventory callback.
- The emitted `lib/search-index-process.js` launched the emitted `.js` child and returned the exact `Alpha.md` candidate. Final compiled probe: Host PID **66247**, child PID **66248**. Both child PID and POSIX group returned `ESRCH` after close; the isolated cache was removed. No browser, Electron app or web server was launched.

## Remaining Boundaries

At the initial `da35c047` checkpoint, the facade coalesced changes into full invalidations. The following incremental checkpoint restores per-path reconciliation: one changed document updates without another inventory. A Host batch is capped at 256 paths / 32 KiB encoded path bytes; overflow becomes one full invalidation. The child additionally caps pending changes across batches at 4,096 paths / 1 MiB, also collapsing overflow to a full reconciliation. Three added checks cover incremental reuse and both count/byte limits. RED reproduced an unnecessary second inventory and the unbounded child pending-path set; GREEN is now **169 runtime tests**, including **12 process tests**. Typecheck, build, manifest and diff checks pass. These small follow-on changes received parent review, not an additional independent source review.

Real Host filesystem progress callbacks, process-wide sticky quarantine and serialized replacement/disposal still require integration into `src/index.ts`. The old Host-local native fault fixtures must be adapted before replacing that live path.

All real-native progress-clock discriminators, Host-death/surviving-child exclusion, native Windows lease/lifecycle behavior, fresh-package child resolution, and full Desktop distribution gates remain unproved. No issues are closed, no remote publication was performed, and no historical Windows failure is attributed by these results.
