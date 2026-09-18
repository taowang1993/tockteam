# Live Owned-Index Integration

## Scope

The live `NoteVaultRuntime` now constructs `SearchIndexProcess`, rather than loading the native SQLite/FlexSearch engine into the Host. The Host still owns safe inventory, document reads, exact verification and scanner fallback. No agent-loop, plugin-composition or renderer authority changes were made.

Storage selects `search-index/tocktutor-search-v3`. Seeded v2 sentinels remain byte-for-byte unchanged through live indexing, mutations, disposal, reopen and v3 schema rebuild. No v2 migration or deletion was added.

## Lifecycle and Ownership

- Replacement detaches the current searchable generation immediately, starts its retirement, and waits for verified settlement before constructing the latest desired generation. Intermediate vault transitions are coalesced.
- One narrow `globalThis`/`Symbol.for` ownership record survives both service recreation and module reload. Unverified cleanup permanently quarantines this Host process, retires sibling actors, prevents new construction/cache preparation, and disables indexed candidates. Successful cleanup after an ordinary native failure does not poison the Host; only a later legitimate invalidation requests replacement.
- Admission executes construction synchronously after its final global pending/failure check. A separately guarded launch callback covers platform preparation: Windows loads its module/bindings before admission invokes creation, without a further await before allocation. Existing process consumers without the optional Host-only callback keep their previous ownership behavior.
- Admission waits are abortable. Retiring a startup generation cannot wait on its own settlement barrier. Only a rejection known to precede launch is treated as having no child; synchronous and asynchronous launch failures retain ownership uncertainty.
- Disposal cancels replacement, drains index settlement and finishes Desktop selection/reveal and draft cleanup before reporting a fixed error. Cordis swallowing/logging a disposer rejection is not treated as proof. Original ownership uncertainty remains internal; no capabilities, paths or tokens are added to diagnostics.
- Host progress comes from completed filesystem operations, including directory open/iteration/EOF, final file checks and bounded reads. Timers and work submission do not renew it. Existing path, identity, symlink, size, cancellation and handle-cleanup checks remain in place.

## Regressions and Review

The live Keyword test first failed because its engine was still `PersistentSearchIndex`; it now requires a separate child PID and verifies root/group disappearance after disposal. Its public searches, save/create/trash operations and exact false-positive filtering remain exercised.

Review found a cross-service race between a fulfilled settlement promise and the caller's later continuation. The RED regression observed two constructions instead of one while another service's retirement was held. Executing admission inside the settlement helper fixed it.

A second source review identified the Windows module/binding await gap. The Windows-binding model RED created a process before admission; the corrected dispatch waits and cancels with zero process/handle creation. This is **model/source evidence, not native Windows acceptance**.

Additional checks cover module reload, sibling shutdown, latest-only replacement, disposal during pending replacement, quarantine across service recreation, unrelated draft cleanup, verified failure recovery, empty-directory progress, withheld reads, startup admission cancellation, and retained failed-launch cleanup proof.

Final read-only reviewer run: `6451a1aa-6c97-4900-b992-69e0e1036be7`. **No issues found; source/live integration only.** All three review references were applied by reviewer and parent. Reviewer read the RED and final suite logs; build and execution claims were verified by the parent.

## Verification

```sh
pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime test
pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime typecheck
pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime build
pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime test:search-index
node scripts/tocktutor-build-manifest.mjs --write
node scripts/tocktutor-build-manifest.mjs
git diff --check
```

- **180 runtime tests passed**, zero failures, cancellations or skips on macOS arm64.
- Typecheck, emitted build, manifest and diff checks passed.
- The dedicated native gate is now explicitly **in-process-only**. Historical SQLite monkeypatch/diagnostic fixtures substitute the legacy algorithm at a private factory seam; they are not claimed as child fault tests. Its ten checks passed with externally verified test-Host cleanup.
- A separate bounded compiled consumer instantiated emitted `lib/index.js` through real Cordis, called the public search API over a randomized fixture, narrowed three documents to two candidates and returned only `Alpha.md`. Host PID **70097**, emitted child PID **70098**. After Cordis disposal, both child PID and POSIX group returned `ESRCH`; the isolated fixture was removed. This is emitted-code/Cordis evidence, not a fresh installed distribution or model-driven consumer run.
- No Electron app, browser or web server was launched for this checkpoint. No remote publication was performed.

Temporary logs: `/tmp/index-live-red.log`, `/tmp/index-global-admission-red.log`, `/tmp/index-windows-admission-red.log`, `/tmp/index-platform-admission-green.log`, `/tmp/tockteam-live-index-platform-final.log`, `/tmp/tockteam-live-index-legacy-gate.log`.

## Remaining Acceptance

Native Windows execution of the new index child/dispatch hook, all real-native progress discriminators, surviving-child/Host-death lease exclusion, fresh installed/package resolution and the final Desktop/model-consumer gates remain unproved. Historical Windows cancellation causation and handle-growth attribution remain unproved. Neither `tockteam-bon` nor `tockteam-fsq` is closed; nothing is merged, pushed or released.
