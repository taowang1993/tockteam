# Typed LocalStorage and Legacy Preservation

Beads: `tockteam-qwzg.8.2.6`. Approved design was saved before implementation in `cb1e8323`, then corrected for the named-key collision below. This is a documented SDK 2.0.3 source/data subset, not full Desktop, installed or universal Store compatibility.

## Result

LocalStorage now accepts strings, finite numbers and booleans in one separate version-1 primitive-JSON file inside the existing owned extension state folder. False, zero and negative zero survive cold reads; Node 24's native `JSON.rawJSON('-0')` preserves signed zero without a wrapper schema. Generic reads and existing aliases share the same methods. Older string-only providers reject typed writes before calling their writer.

Imports, startup and reads create no state file or sidecar. With a truly absent sidecar, reads expose every previously visible legacy string unchanged, including empty strings, special property names, empty legacy keys and legacy values larger than the incoming 4 KiB string limit. Explicit mutations validate requested inputs/result bounds before publication. LocalStorage mutations atomically publish their own result and never rewrite raw Cache bytes or notify Cache subscribers. Default Cache mutations publish and verify the legacy LocalStorage safety copy first; if that fails, raw Cache and notifications stay untouched. A successful safety copy followed by failed Cache publication retains the recoverable copy and reports the actual failure, not transaction success.

Cache remains strictly string-only. Its keys, subscriber payloads, namespace hashes, Boolean removal and normal notifications retain their contracts. Named operations now own only their generated 135-character keys, with the matching namespace prefix and exactly 64 lowercase hex suffix characters. A public prefix-shaped key is never a named Cache key. Existing malformed, unreadable, oversized, link or dangling-link data fails visibly; an invalid existing sidecar never becomes legacy fallback.

Limits remain 64 KiB/256 entries **per final file**, 128-character incoming keys and 4 KiB incoming strings. This is an extra bounded LocalStorage file, not the old total extension quota. The existing file-fsync/rename writer is reused; no multi-file atomicity, cross-process transaction, OS sandbox or power-loss directory durability is claimed. A real hard kill can leave private unpublished `.tmp` files, which state reads ignore; graceful failures remove their own temporary files. Install removal owns the state folder and removes both namespaces and leftover private files. No eager read/startup cleanup or unrequested persistence framework was added.

## Confirmed Finding

Total confirmed findings from the independent preservation review: **1**, fixed and verified.

1. **P2 — Named Cache membership could delete valid public legacy data.** `src/user-raycast-storage.ts` used `startsWith(prefix)` for `clear` and `isEmpty`, so a valid 76-character LocalStorage key such as `cache:<namespace hash>:short` incorrectly made the named Cache non-empty and was deleted by its clear. The immutable pre-slice conductor probe reproduced both symptoms; the worker's failing-first clear check also reproduced loss. The shared predicate now requires the actual encoded suffix shape. The regression checks both initial emptiness and retained values through named set/clear and a cold open, with no unnecessary safety-file creation. This is one root finding, not two. The fixture-adaptation failures below are not counted as product bugs.

## Verification

Failing-first checks reproduced default Cache-first clear loss, typed input rejection, a legacy provider falsely accepting typed writes, invalid clear inputs, a dangling legacy file interpreted as absence, and the public namespace-prefix collision. Each has a runnable regression through the real helper or private selected-command runtime. The complete checks cover Cache-first overwrite/remove/clear, LocalStorage-first set/remove/clear isolation, strict original formats, zero/false/signed zero, exact legacy strings and bytes, absent versus corrupt/unreadable/link/growing files, input/result quotas, atomic publication failures, validation failure after safety publication, cold reads, independent extensions, disable/update/rollback/removal/reinstall and full managed-group shutdown.

The first broader run found two obsolete reconciliation assertions reading LocalStorage's result from Cache's file, plus a menu fixture dispatching its next action after a patch but before the first action's owned outcome. Reconciliation now verifies through the public storage adapter. The menu fixture deliberately exercises an asynchronous action, waits for its exact successful owned outcome, reads the latest root/revision and also awaits copy completion. No manager/child freshness, pending-action or native-effect guard was changed, and no fixed sleep is used to bypass completion.

```bash
node --test --test-name-pattern='default Cache clear preserves' --test-reporter=tap tests/user-raycast-storage.test.ts
node --test --test-name-pattern='LocalStorage preserves primitive types' --test-reporter=tap tests/user-raycast-storage.test.ts
node --test --test-name-pattern='typed LocalStorage operations explicitly reject' --test-reporter=tap tests/user-raycast-local-storage.test.ts
node --test --test-name-pattern='invalid Cache clear options' --test-reporter=tap tests/user-raycast-storage.test.ts
node --test --test-name-pattern='named Cache clears only its encoded keys' --test-reporter=tap tests/user-raycast-storage.test.ts
node --test --test-name-pattern='approved commands move keyed|approved menu command' --test-reporter=tap tests/user-raycast-reconciliation.test.ts tests/user-raycast-runtime.test.ts
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast-launch.test.ts tests/user-raycast-environment.test.ts tests/user-raycast-local-storage.test.ts tests/user-raycast-storage.test.ts tests/user-raycast-cache.test.ts tests/user-raycast-view-data.test.ts tests/user-raycast-runtime.test.ts tests/user-raycast-reconciliation.test.ts tests/user-raycast-form*.test.ts tests/user-raycast-oauth-runtime.test.ts tests/trusted-raycast-can-i-use-preference-form.test.ts tests/trusted-raycast-kaomoji-runtime.test.ts tests/trusted-raycast-manager.test.ts tests/trusted-raycast-cached-state.test.ts tests/trusted-raycast-effect-callback.test.ts tests/trusted-raycast-can-i-use-source.test.ts tests/trusted-raycast-can-i-use-source-detail.test.ts
pnpm run typecheck
git diff --check
```

Final exact six-source/test freeze: **208 passed / 3 pre-existing optional skips / 0 failed** (211 tests), typecheck exits **0**. The optional Kaomoji projection and two explicit-artifact Google/preview checks remain unexecuted, not accepted. Fake-only OAuth and copy fixtures grant no real account, external-network, clipboard, Keychain or native-input authority.

React Doctor 0.9.14 complete isolated before/current scans of exactly the API and unchanged private child report the same five semantic candidates: four error-level lowercase-hook-alias candidates and one warning-level factory-constant dependency candidate. Rules, severity, message, column and actual source text match; API lines move by +5. The tool's nonzero exits reflect those pre-existing candidates, not a successful zero-warning scan. No numerical score, global disable, update, install or supply-chain check is claimed.

## Custody and Remaining Gates

Final frozen source: `src/user-raycast-storage.ts`, `src/trusted-raycast-compat-api.ts` and four exact test paths (`storage`, `local-storage`, `reconciliation`, `runtime`). The private child, renderer, bridge, install authority and agent loop are unchanged. Current custody verified **2,468 unrelated baseline records unchanged**, only the independently owned exact 15-path TockTutor/gallery checkpoint `19e8bac` advanced HEAD, no unknown changes/additions, empty index, and **807 recorded owned/reconciliation groups ESRCH**. Peer source/artifact/gallery/GUI evidence is provenance only, never SDK acceptance.

```text
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-typed-local-storage-N116PR
/tmp/tockteam-conductor-named-prefix.b59FCl
```

Read `source-frozen.json`, `custody-before-review.json`, `regressions-frozen-green.log`, `typecheck-frozen-green.log`, `doctor-comparison.json` and `signed-zero-proof.json`. Fresh Astra read-only review found **0 new confirmed findings**, source-validated the one prior P2 fix and accepted only this frozen source subset; it did not execute tests or establish Desktop/installed/release behavior. The conductor independently hashed all six source/test files, their committed before snapshots, three documents and the supplied diff, verified the empty index, and reran the same immutable prefix probe: **2/2 passed, no skips**, with the original public raw bytes retained. The conductor separately executed `node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast-storage.test.ts tests/user-raycast-local-storage.test.ts tests/user-raycast-cache.test.ts`: **62/62 passed, no skips**; its **33** groups, including its two real interrupted writers (59913/59914), were checked ESRCH. Those are conductor results, not added to the worker's 807 groups. The conductor also rechecked the worker's 807 groups ESRCH.

```text
/Users/taowang/.pi/agent/sessions/--Users-taowang-projects-tockteam--/subagent-artifacts/outputs/3ff09757-3b7c-4b98-b7c0-bdadca814304/conductor/typed-local-storage-review.md
/tmp/tockteam-conductor-typed-review.TiUWy1/custody.json
/tmp/tockteam-conductor-typed-review.TiUWy1/focused-proof.json
/tmp/tockteam-conductor-typed-review.TiUWy1/worker-cleanup.json
/tmp/tockteam-conductor-typed-review.TiUWy1/prefix-current/green.tap
```

The conductor accepted this source/data subset and authorized the exact nine-owned-path checkpoint at 15:21 UTC. The six implementation/test hashes stay identical; only report/ledger provenance changes after review. `save-proof.json` in the worker evidence directory and Beads `.8.2.6` record the resulting commit, nine-path staged/tree hashes and cleanup after saving. Parent SDK/Form/full-compatibility/installed Beads remain open. Next approved work is owned-picker full-day classification, retaining explicit unknown dates and full-parity limits, then remaining unblocked ledger behavior. No push.
