# Historical SQLite Path Probe Windows Result

## Blocked Before the Comparison

[Run 35181547745](https://github.com/taowang1993/tockteam/actions/runs/35181547745), attempt 1, at `64b5201ba6b0ad27c078199f9ea5579a7b64a74b`, failed **INCONCLUSIVE**. Job `105074576455` took 7m49s.

The **first frozen historical install** reached its unchanged **240,000 ms absolute deadline**. Its root PID was 6236; cleanup was verified. No completion/exit code or pnpm error code was retained. The reason the install stalled is unestablished.

The second install and historical SQLite path probe were **never reached**. The receipt has no `pathProbe` or instrumented-test hash, and `arms=[]`. No historical test executed. The explicit `WINDOWS_SQLITE_PATH_PROBE_NOT_HISTORICAL_TESTS` scope confirms that the intended path-only mode was selected, not the historical comparison or legacy job.

Consequently, this run supplies **no retained short/deep comparison from the historical SQLite installation**, no proof of a Windows path limit, and no explanation of the original stall. It does not disprove the path-length hypothesis either.

## What Passed

Windows preflight passed **7 tests, zero skipped**:

- npm configuration isolation: roots 8904 / 6032; cleanup verified.
- Real current-checkout SQLite probe: root 740, five cases, cleanup verified. The test assertions establish the missing-parent `ENOENT` / `SQLITE_CANTOPEN` control, successful short-path open/write/close, and Node filesystem round-trips for both comparison locations.
- Reuse rejection: root 6928; stale evidence was not accepted or overwritten; cleanup verified.
- Sixteen startup owned-process cases, privacy validation, and existing topology checks passed.

The current-checkout SQLite preflight logged native SHA-256 `f806f89dc41dde00ca7124dc1e649bdc9b08ff2eff5c891b764f3e5aefa9548c`. **Its deep SQLite outcomes and actual path lengths were not retained.** A passing preflight accepts either a successful deep operation or a validated error, so its success must not be treated as a path-length result. It also does not substitute for a frozen historical installation.

Diagnostic calibration before the blocked install:

- Node 24.20.0 / Windows x64 / Koffi 3.1.6, default threadpool, OS-temp volume C retained.
- Stalled-descendant control: root 5048 → worker 7684 → descendant 1720. The expected five-second deadline occurred and independent inventory was empty afterward.
- All six pnpm version/path probes passed; configured private destinations matched the prior audited run.
- Seven source pins and nine **pre-install** source/lock/policy hashes matched the prior receipt. Ownership-module hashes matched. No successful post-install source check is claimed.

## Cleanup and Evidence

All **eight diagnostic-owned operations**—control, six pnpm probes, and the interrupted installer—report verified cleanup. Final independent inventory is empty, `rootRemoved=true`, and `emergencyCleanup=false`. Artifact upload and fixture/receipt-scratch cleanup passed. The unrelated legacy job was skipped.

The local official Node runtime used for preparation was removed after an empty process inventory across both macOS path aliases; removal was verified. Local tests previously passed 17/17 with no skips, and independent source review `ce7eff0d` found no issues using all three mandatory references. These do not replace the missing Windows historical comparison.

Allowlisted files in `historical-runner-2026-09-17/`:

- `35181547745-receipt.json` — SHA-256 `000c74d789b95f2d91682605d018935d80f69e038ac34ebdc66292375071780c`
- `35181547745-run.json`
- `35181547745-jobs.json`
- `35181547745-audit.json`

No raw logs, messages, stacks, credentials, environments, or absolute fixture paths are published. Cleanup is retained post-stop evidence, not a later live inspection of the retired runner.

## Remaining Work and Authority

The user's **Prepare and Run Once** authority is consumed. No retry, deadline relaxation, install-policy bypass, main push, merge, release, or Desktop launch occurred. Remote main remains `c7e630e1`; verification branch is `64b5201b`.

Before another historical comparison, investigate the bounded installer stall; do not silently increase its deadline or bypass the frozen installation. Further publication or Windows execution requires fresh approval. Both the earlier full local historical replay gap and this Windows install blocker remain explicit. `tockteam-bon` stays open; neither the path-length explanation nor the original stall cause is established.
