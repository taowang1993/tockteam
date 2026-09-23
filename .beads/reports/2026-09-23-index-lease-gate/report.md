# Index Lease Startup Gate

## Diagnosis

The final menu verification found an intermittent concurrent-first-lease failure. Both child processes could reject with `Index peer disconnected`, while an immediate isolated retry could pass. Diagnostic child fixtures recorded **both `BEGIN EXCLUSIVE` operations returning `SQLITE_BUSY`**; this is a demonstrated startup-contention failure, not an assumed environment failure.

Moving journal-mode inspection after locking did not fix it and was reverted. The final production change preserves the original statement ordering and journal-mode validation. SQLite now gets a bounded **250 ms busy wait**, rather than zero wait, for transient startup readers. There is no JavaScript retry, lease replacement, unlink, or admission without an exclusive lease. Persistent contention still fails closed. The five-second native-progress watchdog and owned-child termination requirements are unchanged. The SQLite timeout applies to each lock wait, not the entire initialization.

## Red and Green

A real-SQLite child fixture establishes a read transaction, then releases it 50 ms after the exclusive-lock attempt starts. Before the change, `node --test --test-name-pattern='first lease survives' plugins/tocktutor/packages/tockbot-note-runtime/tests/search-index-process.test.ts` fails with `Index peer disconnected`. Afterward it reaches searchable readiness and verifies the child is gone after cleanup.

The existing concurrent-owner test retains its exact-one-ready assertion; failure messages now expose both outcomes. The existing live-owner exclusion and verified-death reopen test also passes. No acceptance assertion was weakened to permit zero or multiple ready owners.

Forty instrumented two-contender rounds each admitted exactly one ready child. The final diagnostic transcript records both child PIDs and `remaining: []` after successful `ESRCH` assertions. This is bounded contention evidence, not a guarantee of startup success under arbitrary scheduling or persistent locks.

## Authentication Test Observation

The aggregate also exposed a test-only `ECONNRESET` race while intentionally closing unauthenticated sockets. Node's `events.once(socket, 'close')` rejects on that normal TCP reset. The test helper now tolerates **only** `ECONNRESET`, still waits for `close`, and rejects other errors. Production authentication, generation/token checks, peer limits, and shutdown behavior are untouched.

## Verification

- Focused authentication/process tests: **23/23** passed.
- Runtime aggregate: **207/208** passed; the existing stopped-index/Host-death test remains blocked by `spawn EPERM`.
- Root aggregate after the final fix: **1,368 passed, 5 environment-blocked failures, 18 skipped**. Not a green full-suite gate.
- TockTutor build and nested/root typechecks: passed.
- Root build, manifest validation, and `git diff --check`: passed.
- Independent fresh-context review: **OK with notes**, no findings. Read-only review, not independent execution. The review predates the added per-round cleanup log lines; final `stress-final.txt` and the retained harness provide that cleanup evidence.

No GUI launch was needed for this isolated backend/test follow-up. Every diagnostic index child was terminated through its owned-process API and verified gone before its isolated fixture directory was removed.

## Remaining Release Gates

This resolves `tockteam-yoam.25`, not the six sandbox/process-inventory environment failures, unavailable Nix, or uncertified installed/native effects. No PR or push is authorized by this evidence.

## Evidence

The folder retains the deterministic red/green logs, root-cause trace, final 40-round trace and diagnostic scripts, final focused/runtime/root verification logs, and the independent review. Diagnostic scripts use isolated temporary files and real owned Node children; they do not modify installed dependencies or production data.
