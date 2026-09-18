# Isolated search-index contract

## Implementation clarification: logical-step stall clocks

**Accept the proposal as an explicit refinement of the earlier clock wording.** Five seconds means **no qualifying progress within a logical native operation**, not five seconds from issuance of every queued SQL statement.

Verified installed `flexsearch/dist/db/sqlite/index.cjs:598–778`: transaction work enqueues callback-less batches before the COMMIT callback. This version uses `db.parallelize(...)` inside `transaction`; the queue-time objection still applies.

Smallest correct implementation:

- Assign a unique ID to each logical operation: open, schema query, mount, commit/drain, search or close.
- Capture that ID **when wrapping/enqueuing each native callback**, not by consulting a mutable “current operation” when it completes. Preserve callback `this`, arguments and existing error handling.
- Start its stall clock on operation entry. Successful callback completions attributable to that operation renew only its clock. SQL submission, other operations, Host I/O and heartbeats do not.
- Treat **commit plus subsequent drain as one operation**. FlexSearch queues `PRAGMA shrink_memory` after resolving COMMIT; do not lose ownership/progress attribution for that tail.
- End the clock only when the logical operation actually settles. A callback failure follows the existing native-failure path, not indefinite deadline renewal.
- Keep operations finite: no retry loop or admission of unrelated new work into an existing step. Search retains its independent five-second absolute deadline.

**Known ceiling:** a stuck SQL statement can remain concealed while other callbacks in the same finite operation complete. It must time out five seconds after that operation’s last qualifying completion. This is a progress-stall guarantee, not a per-statement execution deadline.

Required discriminators:

1. Commit lasts over five seconds while its callbacks keep completing: succeeds.
2. Same commit stops progressing: terminates after five seconds.
3. Other-operation callbacks and Host traffic continue: cannot rescue it.
4. Commit resolves but its drain/tail hangs: still terminates.
5. Late callbacks retain their original operation identity.

No finer native execution tracker is necessary.

Parent reports a successful macOS lease contention/death/reacquisition probe with all three owners stopped. This is reported local evidence, not independently reviewed here and **not Windows lease acceptance**.

## Review

- **Correct:** Isolating `PersistentSearchIndex` preserves Host vault authority and indexed-search semantics.
- **Resolved through supervisor dialogue:** deadlines, invalidation fencing, cleanup quarantine, Node selection, and restart exclusion.
- **Merge verdict: OK with notes — design direction only.** Native transport and cross-platform lease behavior still require verification. No commands or source changes performed.

## Minimal seam

Move native dependency loading and `PersistentSearchIndex` from `plugins/tocktutor/packages/tockbot-note-runtime/src/index.ts:94–537` into a child-only module. Host imports only the facade/protocol.

Preserve encoding, full/incremental reconciliation, revision comparison, commit/drain ordering, conservative candidate selection and exact Host verification. Scanner fallback remains available, but is not a substitute for delivering indexed readiness.

Host retains:

- `readVaultDocument`, including safe-file and alias checks (`src/index.ts:1675–1757`).
- `scanVaultTree`, including ordering, exclusions and truncation (`2811–2937`).
- Captured vault/generation validation (`4781–4819`).

Child receives inventory/content through bounded requests; no arbitrary filesystem or SQL RPC. This is **trusted-account process isolation, not filesystem sandboxing**.

Keep existing full inventory arrays initially. Paging bounds transport, not total index memory.

## Ownership and cache migration

### Persistent namespace

Adopt one new internal schema/cache namespace, e.g. **`tocktutor-search-v3`**, for isolated indexing.

This fits existing architecture: `searchIndexDirectorySync` already derives the cache directory from `SEARCH_INDEX_SCHEMA` (`src/index.ts:3301–3320`).

- Preserve user state roots, vault roots and identity-derived filenames.
- Leave the entire v2 cache untouched.
- Rebuild once into v3; reopen that same v3 cache across subsequent generations and launches.
- No per-generation directories or automatic old-cache deletion.

Historical in-process v2 runtimes therefore cannot share the new main database or lease. No user-quiescence assumption is needed for this transition.

### SQLite sidecar lease

For each v3 main database, use one fixed sibling SQLite lease file:

1. Child opens the lease, establishes/verifies rollback-journal `DELETE` mode and sets `busy_timeout=0`.
2. Child acquires `BEGIN EXCLUSIVE` **before any main-database open or unlink**.
3. Hold that dedicated connection/transaction throughout the child lifetime, including main-index rebuilds.
4. Never automatically unlink, replace or rebuild the lease.
5. Lease failure, corruption or unexpected journal mode causes no main-database mutation and no acquisition retry loop.

Keep the lease alive until process termination, or release only after positively successful main-database closure—not through swallowed-error cleanup.

SQLite’s OS locks provide crash recovery: a child surviving Host death retains exclusion; actual process death releases it. Socket EOF should trigger exit, but is not proof of death.

This is an approved design, **not cross-platform native acceptance**. Verify simultaneous first creation, contention, owner death/reacquisition and persistent reopen.

## Transport contract

### Connection

- One owned child and authenticated loopback connection per index generation.
- Bind an ephemeral `127.0.0.1` port before spawn.
- Fresh 256-bit capability per generation; deliver through a deliberately constructed child environment, never browser state or logs.
- First frame authenticates protocol version and generation/capability. No configuration, inventory or filesystem work before authentication.
- Bound unauthenticated connections/attempts and close the listener after authentication.
- Use `process.execPath`, reject Electron, resolve the fixed child entry relative to the module, and allowlist environment variables. Do not inherit arbitrary `NODE_OPTIONS`/preloads.

Root `src/runtime.ts:42–51` confirms DSH launches through `nodeBinary`; no Desktop-only resolver belongs in this reusable plugin.

### Framing and actions

Four-byte unsigned length prefix; UTF-8 JSON payload capped at **65,536 bytes including envelope**.

Reject oversized lengths before allocation, invalid UTF-8/JSON, unknown actions, mismatched IDs and invalid state transitions. Bound parser buffering and honor socket backpressure.

Finite action vocabulary:

- Initialize/authenticate.
- Invalidate.
- Search/cancel-search.
- Inventory/document demand.
- Page/chunk response and acknowledgement.
- Readiness/failure/native-step.
- Candidate pages and terminal result.

Bind operations to generation, request ID and invalidation revision. Transfers additionally require exact sequence numbers. Never reuse request IDs within a generation.

### Bounds and demand

Recommended minimum:

- One reconciliation and one Host inventory/read demand at a time.
- One active native search and three queued searches; excess requests return candidate-unavailable to the exact scanner.
- One unacknowledged data frame per direction; independently bounded control queue.
- Inventory/candidate pages: at most 256 entries **and** the encoded frame limit.
- Document chunks: at most 32 KiB decoded bytes, base64 encoded.
- Candidate total ≤ request limit; current inspection configuration caps that at 100,000.
- Preserve the current 2,000,000 scanned-entry ceiling; truncated inventory cannot publish readiness.
- Bound pending changed paths by count and bytes; overflow collapses to one full invalidation rather than dropping changes.

Serve pages from one captured inventory, not repeated rescans. Acknowledgement releases transfer state.

Preserve the exact decoded document string. `readVaultDocument` uses UTF-8 replacement decoding (`src/index.ts:1741–1747`); re-encoding can expand to three times the raw-byte limit. Account for that rather than rejecting previously indexable content.

Paginate candidate **responses** too. Publish only after complete assembly and terminal validation.

Cancellation settles the caller promptly, but abandoned native work occupies its slot until completion or termination. Otherwise cancellation can bypass queue limits.

## Readiness and stale-result fencing

Host synchronously clears readiness and increments a monotonic invalidation revision for every invalidation.

Accept a result only when:

- Child/generation is current.
- Its captured invalidation revision still matches.
- Explicit readiness covers that revision.
- Request remains uncancelled.
- Complete response passes validation.

Epoch alone is insufficient: current code assigns it before publication (`src/index.ts:406–423`), covered by the retained-epoch test (`tests/loader-composition.test.ts:5588–5687`).

Generation alone is also insufficient. Current search checks readiness and index object identity (`src/index.ts:269–271`); incremental reconciliation can reuse that object while an older async search completes.

Coalesce readiness/invalidation notifications rather than accumulating them.

## Agreed deadlines

Use Host monotonic time:

| Obligation | Bound |
|---|---:|
| Spawn/authentication | 15 seconds |
| Logical native operation without its own qualifying callback progress | 5 seconds |
| Host list/read without qualifying I/O progress | 15 seconds |
| Search, including queue/transfer | 5 seconds absolute |
| Verified owned-process termination | Existing 5 seconds |

The opening implementation clarification defines native progress precisely and supersedes any earlier per-queued-SQL interpretation.

No whole-reconciliation deadline: large vaults may legitimately continue making progress. The schema-delay replay exceeds five seconds in aggregate while individual callbacks succeed (`tests/loader-composition.test.ts:5158–5260`).

Heartbeats, arbitrary frames, Host reads and acknowledgements never renew native deadlines. Host progress likewise means completed scanner/read work, not timer activity.

On timeout/protocol failure: clear readiness, abort transfers, settle requests, terminate immediately and await verified settlement. Report failure explicitly; no automatic restart loop.

A later legitimate invalidation/reopen may recover after verified cleanup. Unverified cleanup instead causes sticky runtime-wide quarantine.

## Caller and disposal changes

Current integration requires deliberate changes:

- `replaceSearchIndex()` uses `Promise.allSettled` before reuse (`src/index.ts:4751–4786`); rejected cleanup cannot authorize reuse.
- Its ignored cleanup `.finally()` can introduce an unhandled rejection once close rejects (`4755–4757`).
- Disposal currently awaits index close before unrelated cleanup (`3712–3722`). Finish Desktop/draft cleanup even when index cleanup fails, then report failure.
- Replacement runs on startup, identity loss, activation, relocation and removal (`3684`, `3921`, `4418`, `4578`, `4637`). Abort retired generations immediately and await ownership settlement **before spawn**, not merely before inventory.
- Rapid switching retains only the latest desired generation, not intermediate children or an unbounded pending-generation queue.

After unverified settlement: no new child, database unlink or reuse anywhere in that runtime. Preserve the exact scanner with an explicit index-failure diagnostic.

Integration clarification: “runtime-wide” means the entire Host process, including Cordis service disposal/recreation and module reload. The sticky quarantine and outstanding settlement barrier must survive those transitions (a narrow process-persistent ownership state is acceptable; an ordinary module-local variable alone is not). Set quarantine from rejected index ownership settlement itself. Cordis catches/logs disposer errors, so a fulfilled `fiber.dispose()` is not ownership proof. A retained internal failure plus one fixed Host warning is sufficient; do not add browser-visible capabilities, paths or tokens to that diagnostic.

Use the accepted `spawnOwnedProcess` settlement contract unchanged. Socket closure, child-reported success and root exit are not full ownership proof.

## File impact

Minimum production changes:

- `src/index.ts`: facade integration, Host progress callbacks, invalidation fencing, failure-aware replacement/disposal and v3 schema constant.
- New child-only index module.
- New Host facade module.
- New shared bounded protocol module.
- New child entrypoint.

`tsconfig.build.json` already includes `src/**/*.ts`; published package files already include `lib`. Verify emitted/staged child resolution rather than adding public exports or another Cordis plugin.

Move native injection/checkpoints into child-side test harnesses. Existing Host-local SQLite/FlexSearch monkeypatches will not affect the child. Do not expose production fault-injection environment switches.

## Smallest vertical TDD slice

One real indexed query through the authenticated owned child, plus one child-native held operation.

Write failing assertions first:

1. Native execution occurs in a separate PID; Host remains responsive.
2. Unready search scans three fixture documents; ready search examines two candidates and returns only `Alpha.md`.
3. Held native work cannot indefinitely block disposal.
4. Retired generations cannot publish candidates.
5. Main database is never reused before verified owner settlement.

Implement the minimum facade/child/protocol path while retaining the complete existing index algorithm.

Then require:

- Fragmented/coalesced frames, bad authentication, oversize payloads, invalid actions, queue overflow and Unicode chunking.
- Large inventory/document/candidate transfers with bounded outstanding bytes.
- All five logical-step clock discriminators in the opening clarification.
- Heartbeat/Host traffic cannot rescue stuck native work; recorded successful callback delays still achieve indexed readiness.
- Invalidate-during-search, A→B→A, cancellation and disposal during mount/commit/search.
- Real open/lock/insert failures, revision mismatch, retained epoch, aliases, mutations and persistence.
- v2 remains untouched; v3 rebuilds once and reopens persistently.
- Two-child lease contention, first-create races and owner death followed by a new explicit successful acquisition.
- Host death with surviving child still excludes a contender.
- Cleanup rejection stays quarantined without skipping unrelated disposal.

### Runnable gates

For the implementing supervisor; the first command names the proposed test:

```sh
node --test --test-timeout=30000 \
  plugins/tocktutor/packages/tockbot-note-runtime/tests/search-index-process.test.ts

pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime test:search-index
pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime typecheck
pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime build

node --test --test-timeout=30000 \
  plugins/tocktutor/packages/tockbot-note-runtime/tests/owned-process.test.ts \
  plugins/tocktutor/packages/tockbot-note-runtime/tests/owned-process-windows.test.ts
```

Update the external native test gate: its current “this PID owns SQLite” assumption no longer holds, and its cleanup must account for the detached index child.

Run native integration on accepted POSIX and Windows x64, then verify packaged child artifacts. These gates neither prove historical cancellation attribution nor close `bon`/`fsq`.