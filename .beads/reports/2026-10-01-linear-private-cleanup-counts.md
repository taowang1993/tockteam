# Private Linear Cleanup Outcome Counts

Date: 2026-10-01 (UTC). Task: `tockteam-qwzg.6.6.6`. Source checkpoint: `705a14a0a2643f0843d222e27d958c31122da3a5`.

## Scope and Result

The owner selected **Improve Cleanup Details (Recommended)** after the handoff. This approves an offline-only diagnostic enhancement, not a new sign-in or account check. The implementation adds private aggregate request counts without changing authorization, request values/form/order, deadlines, retries, HTTP-200 confirmation, local token clearing, or either existing warning. No real extension/candidate, account, token exchange/revocation call, callback, GUI, root build/stage, installed app, credential/Keychain, Conductor, OAuth registration, user registry, external message, or push was used or changed.

**Confirmed product defects in the original cleanup warning: 0.** Its cause and actual provider-side cleanup remain unproven. This enhancement supplies better evidence for a separately approved future measurement; it does not repair or demonstrate the provider-cleanup gate. `tockteam-qwzg.6.6` remains blocked and the pilot remains incomplete.

## Private Contract

- Direct `removeTokens()` errors retain their existing `cause` reason-code array and add `cleanupCounts` for that operation. Shared cleanup retains cumulative counts of settled first-party revocation requests across the owned child lifetime, including earlier confirmed requests and all clients. Cached/repeated/concurrent callers do not recount or resend credentials.
- `attempted` counts settled requests; `confirmed` counts only HTTP 200; `failed` counts non-200 or transport/timeout outcomes. A failed request is unconfirmed cleanup, **not** proof that the grant is still active. These are request totals, not connection/token identities or per-token outcomes.
- Counts are exact three-field nonnegative integers, each at most **512**, with `attempted === confirmed + failed`. A failure diagnostic must have at least as many failed requests as reason entries. Unsafe/extra fields, inconsistent totals, strings, nonfinite/fractional/negative numbers and overflow are rejected.
- Incomplete SDK outcomes or totals above the private ceiling omit counts, never clamp them or invent zeros. Legacy reason-only frames remain supported with counts unavailable; a later valid reason-only frame clears any previously received counts. Missing, malformed, early, stale-session or interrupted frames preserve the generic warning; they do not establish zero failures.
- The child emits only allowlisted codes and optional counts on bounded private stderr during owned Linear SIGTERM. The manager accepts current-session shutdown details only and passes a copied `cleanupCounts` object to the Host-only `onError` error. Nothing new reaches renderer messages, Desktop logs or persistent account state. The existing 65,536-byte stderr limit and complete process-group teardown remain unchanged.

Synthetic mixed HTTP 200/401 now yields:

```json
{"cause":["http-401"],"cleanupCounts":{"attempted":2,"confirmed":1,"failed":1}}
```

Synthetic all-401 yields the same warning/reason with `{"attempted":2,"confirmed":0,"failed":2}`. Neither example is a real account measurement.

Owned source/test paths are `src/trusted-raycast-compat-api.ts`, `src/user-raycast-contract.ts`, `src/user-raycast-child.ts`, `src/user-raycast-manager.ts`, `tests/user-raycast-oauth-cleanup.test.ts`, and `tests/user-raycast-oauth-runtime.test.ts`. Existing build entry points already include these modules; no package, dependency, composition, renderer or installed artifact change was required.

## Test-First Evidence

1. **API RED:** the existing fake mixed-200/400, mixed-200/401 and all-401 scenarios failed because `cleanupCounts` was absent. `red-api.log` records exit 1; the warning was already correct. The same suite became GREEN, **16/16**, before further cases were added.
2. **Private Wire RED:** the managed fake shutdown failed because the Host received no counts. `red-runtime.log` records exit 1 and a stopped child. The child/manager transport then passed all **15** owned-shutdown scenarios.
3. Extended checks cover single status/transport/timeout outcomes, form-value/body secrecy, deduplicated values, repeated and simultaneous direct/shared cleanup, multiple clients, earlier successful cleanup generations, the 512-request ceiling, unknown SDK errors, private schema abuse, fragmented output, legacy frames, stale/early/missing frames, interruption and renderer non-disclosure.
4. Parent pre-commit focused verification passed **20 tests, 0 failed/cancelled**, including 17 API scenarios and 15 managed-shutdown scenarios. The first typecheck caught an exact-optional-property assignment in the new code; deleting the absent property fixed it, and `checkpoint-typecheck` exited **0**. This was a development-gate failure, not a newly established cause of the live warning.

Exact focused/typecheck commands, executed through a fresh bounded wrapper with isolated disposable temporary roots:

```bash
node --test --test-concurrency=1 --test-name-pattern='cleanup details|first-party OAuth cleanup|mocked shutdown' tests/user-raycast-oauth-cleanup.test.ts tests/user-raycast-oauth-runtime.test.ts
node node_modules/typescript/bin/tsc --noEmit
git diff --check af9ea03a HEAD -- src/trusted-raycast-compat-api.ts src/user-raycast-contract.ts src/user-raycast-child.ts src/user-raycast-manager.ts tests/user-raycast-oauth-cleanup.test.ts tests/user-raycast-oauth-runtime.test.ts
```

The filter excludes callback/sign-in tests. All provider responses and credentials are fake; only previously reviewed React runtime bytes and first-party API/child bundles are used. Temp-only builds are exercised by the focused checks; esbuild belongs to the bounded test group and is stopped by the wrapper.

**Final exact-checkpoint rerun: verified.** Read-only Luna run `1d653aa4-91f2-4a67-b259-504de89dbeeb` ran both commands fresh: **20 passed, 0 failed/cancelled/skipped**, and typecheck **exit 0** with an empty diagnostic log. Scoped whitespace checks also exited 0. The six pinned hashes matched before/after and at the parent's first independent inspection. All production hashes remain unchanged. Final parent review subsequently strengthened one owned runtime-test line: the legacy-frame fixture now sends a counted frame followed by a reason-only frame, requiring old counts to be cleared. This adds coverage, not production logic.

Final focused root/group: **23226**. Managed fixture leaders/groups: **23247, 23254, 23256, 23260, 23262, 23264, 23266, 23278, 23280, 23282, 23284, 23286, 23288, 23290, 23292**. Final typecheck root/group: **23330**. Luna independently checked every positive PID and negative group returned **ESRCH**, and both private fixture roots were absent. The parent read the actual fresh logs/JSON and independently repeated those checks for all nine earlier/final verification runs. After the test strengthening, a fresh parent **reviewed-focused** run again passed **20/20**, and **reviewed-typecheck** again exited **0**. Reviewed focused root/group: **25030**; fixture groups: **25039, 25041, 25043, 25045, 25049, 25051, 25054, 25057, 25059, 25061, 25063, 25065, 25067, 25069, 25071**; reviewed typecheck root/group: **25089**. The final parent inspection rechecked all **11** verification runs: every owned leader/full group returned ESRCH, every private fixture root was absent, all five unchanged hashes matched, and the runtime test differed by exactly the reviewed one-line strengthening. No owned test/build/esbuild group or private runtime fixture remains.

Sanitized evidence and exact source hashes:

```text
/tmp/tockteam-linear-counts-offline.82192b
```

The wrapper and retained logs are historical evidence; do not replay an existing output label. `source-hashes.json` identifies the original six-file checkpoint; `reviewed-source-hashes.json` identifies the final six-file state including the one-line test strengthening. `final-focused.log/.json`, `final-typecheck.log/.json`, `reviewed-focused.log/.json` and `reviewed-typecheck.log/.json` contain fresh results and owned-group teardown. `parent-checkpoint-inspection.json`, `parent-final-inspection.json` and `parent-reviewed-inspection.json` record independent hash, PID/group and fixture checks. Private fixture roots were removed only after stopping owned groups.

## Review and Remaining Gate

Parent self-review applied all three review references: simplification, security/hardening and performance. **Additional confirmed diff findings: 0.** This uses existing error/diagnostic seams, a constant-size three-counter object and existing runtime helpers, without a new dependency, class, getter or token map. Threat boundaries are opaque SDK/provider errors, private child stderr and Host-to-renderer separation. Abuse cases verify malformed totals/extra secret fields cannot enter private diagnostics and private details never appear in collected renderer messages. Original callers, request behavior, warnings and lifecycle bounds remain intact.

The low-cost Luna child completed only prescribed fake-only final checks and independent process/group/hash verification; it did not own security decisions or constitute an independent code review. The parent inspected its fresh logs and repeated cleanup/hash checks before acceptance. CodeGraph lacked the relevant current OAuth files; exact source/caller inspection was used without a global reindex. No UI behavior changed: browser screenshots, React Doctor and Electron/installed/root smokes are not applicable to this offline diagnostic slice and were not authorized or run. No broader crash/EOF/Electron-exit or live-provider proof is claimed.

The blocked parent/pilot stays unresolved. Any real measurement requires a separate fresh consent/readiness gate, fresh bounded harness/link, unchanged reverified candidate and complete owned teardown. Prior approvals and local process cleanup are not provider-revocation evidence. All protected/unrelated working-tree changes are preserved; the six-path checkpoint was committed under a brief peer-coordinated index reservation, then the index was released.
