## Review

No issues found.

Paths below are relative to `plugins/tocktutor/packages/tockbot-note-runtime/`.

- **Correct — minimal production fix:** `src/search-index-native.ts:147–166` configures SQLite’s bounded 250 ms busy wait, preserves the `delete` journal-mode check before `BEGIN EXCLUSIVE`, and adds no JavaScript retry, lease replacement, or unlink path. Existing file/alias validation remains intact.
- **Correct — ownership and failure boundaries:** `src/search-index-child.ts:48–58` acquires the lease before constructing the index. Acquisition rejection closes the protocol and exits the child; it does not continue indexing. `src/search-index-process.ts:206–223` still requires owned-process termination rather than treating socket EOF as ownership proof. The short native wait remains below the five-second native-progress watchdog.
- **Correct — regression coverage:** `tests/search-index-process.test.ts:166–192` uses real SQLite with an established read transaction, schedules its release after the exclusive-lock attempt, verifies searchable readiness, and checks child death during cleanup. Existing live-owner exclusion/reopen and simultaneous-acquisition tests cover complementary safety properties (`:140–163`, `:194–203`).
- **Correct — auth-test adjustment:** `tests/search-index-auth.test.ts:8–14` tolerates only `ECONNRESET`; successful resolution still requires `close`, and other errors reject. This changes test observation, not production authentication or shutdown policy.

### Evidence and claim limits

- `/tmp/tutor-lease-sql-cause.txt` records round 110 with both children failing and identifies `BEGIN EXCLUSIVE` / `SQLITE_BUSY` for both PIDs, supporting the diagnosed failure.
- The reader red/green logs show the targeted regression failing with `Index peer disconnected`, then passing alongside both exclusion tests.
- `/tmp/tutor-lease-bounded-green.txt` records exactly one ready child in each of 40 rounds. It does **not itself record post-cleanup PID checks**, so that portion of the reported stress-run claim was not independently verified.
- The fix supports bounded tolerance of transient contention—not unconditional startup success under arbitrary scheduling or persistent locks. SQLite’s timeout applies to individual lock waits, not an overall initialization deadline.

### Scope and limitations

Read-only review of the named implementation, tests, lifecycle/protocol boundaries, and supplied logs. No tests, Git commands, app launches, or edits performed; exact diff scope relies on the supplied change description. The unrelated Host-death `spawn EPERM` and root sandbox/process failures remain unresolved and are not cleared by this review.

**Merge verdict: OK with notes** for this follow-up; not a full-suite or integration sign-off.