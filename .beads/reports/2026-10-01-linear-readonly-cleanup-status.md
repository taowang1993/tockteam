# Linear Read-Only Cleanup Status

Date: 2026-10-01 (UTC). Task: `tockteam-qwzg.6.6.3`.

## Authority and Scope

The owner said **Continue. I give you permission.**, then explicitly selected **Start One Read-Only Linear Check** in a fresh readiness/scope gate. The existing public Client ID was supplied privately after directions to the existing **TockTeam Linear Test** registration. It is excluded from this report and retained proof files. The owner opened the fresh link personally and answered **Done**.

Exactly one current first-party Node/managed-child execution ran, bounded to 120 seconds plus owned shutdown. The reviewed read-only `search-issues` candidate was unchanged; no old harness/link was executed and no automatic retry occurred. The approved sign-in/token exchange and test-token revocation lifecycle ran. No issue-write action, unrelated account call, CLI/Keychain operation, Conductor change, app-registration modification, new API key/secret, native-app/browser automation, root build/stage, or push ran in this session.

## Observed Result

- **Read-only load succeeded:** loading was observed, then a non-loading List with **4 issue rows**.
- No projected error screen or command error was observed; no timeout or interruption occurred.
- **Cleanup remained unconfirmed:** `cleanupError: true`; the validated Host-only reasons were exactly **`["http-401"]`**.
- This establishes that **at least one** revocation request received HTTP 401 in this new attempt. It does not establish that every request failed, which token was involved, whether another request returned 200, or whether a grant remains active. Only failed reason codes are retained; bodies and token identifiers are not inspected or recorded.
- The provider response, rather than a captured transport failure or owned timeout, explains this attempt's warning category. It does **not** prove the cause of the older real warning, whose detailed evidence was not retained.

Linear's public [OAuth documentation](https://linear.app/developers/oauth-2-0-authentication), **Revoke an access token → Response**, defines 200 as revoked, 400 as unable to revoke, and **401 as unable to authenticate with the token**. The current request uses the documented URL-encoded `token` field. The documentation says `token_type_hint` is optional and does not establish a new app secret/API key requirement for this request. No speculative authentication/deadline repair was made, and the warning was not suppressed.

The owner was immediately told: if **TockTeam Linear Test** is visible in **Authorized applications**, revoke only that entry; leave **Conductor** and the app registration untouched. No manual revocation or provider-side grant removal has been independently verified.

## Provenance and Preparation

The candidate was inspected without execution before preparation:

- Installer digest: `c2df04834b38c356524d003b125cfd14ab6ae2487e9863e70d4a946b70615489`.
- Built JavaScript SHA-256: `d1ca909e106e277f6d708048fb86ae141f6b252d47d779c2a5135ad260d0552f`.
- Current temp-only first-party `api.mjs`: `13e2512bd3ab6871aeb75ee64cf1e12ce415767bca88ffc14d069ece38e0d32b`.
- Current temp-only first-party `child.mjs`: `1dbb05ea45a79c2b62be17ba98fea7702006bba79ecf73ef4da7a7bd81f13eba`.

The new inert harness reused the counts-only reducer and existing validated-reason guard. Its `--check` verified loading versus non-loading states, no account-content retention, sorted/deduplicated valid codes, and `unknown` for missing, invalid, empty, sparse, or HTTP-200 causes. The sign-in URL existed only inside removable private state, never as a retained proof artifact. Host/child stdout, stderr, raw errors, provider bodies, and account projections were not saved.

Preflight commands:

```bash
node /tmp/tockteam-linear-safe-live.NcC1ti/live.mjs --check
node --test tests/user-raycast-oauth-cleanup.test.ts tests/user-raycast-oauth-runtime.test.ts tests/user-raycast-oauth.test.ts tests/user-raycast-runtime.test.ts tests/user-raycast-ipc.test.ts
```

Results: counts/privacy checks passed; **31/31 focused offline tests passed**, zero failures. Temp-only `buildUserRaycast()` passed, with esbuild's service explicitly stopped. These are preflight results, not evidence that live cleanup succeeded. No product source code changed for this measurement.

## Process and Privacy Cleanup

- Root process/group: **95279**. Managed child process/group: **95281**.
- Started: `2026-10-01T01:53:21.595Z`; finished: `2026-10-01T01:54:52.111Z` — approximately **90.5 seconds**, within the bound.
- At `2026-10-01T01:55:56.479Z`, both root/child PIDs and complete groups returned **ESRCH**. The managed child used the existing full-group teardown, including descendants.
- Callback `127.0.0.1:38437` returned **ECONNREFUSED**.
- Private install/cache/runtime state and the expired sign-in URL were removed; no `private-state-*` directory or link-ready marker remained.
- Only then was the callback reservation released to the separate sidebar session. A later listener from that session's tests must not be mistaken for this attempt's callback.

Sanitized proof directory:

```text
/tmp/tockteam-linear-safe-live.NcC1ti
```

`prepared.json` is explicitly the **pre-execution** snapshot, not the final live result. `result.json` records the actual counts, generic outcome, and `http-401`; `cleanup.json` records independent PID/group/listener/private-state checks. `focused.log` contains synthetic test results only. `live.mjs` contains no public Client ID or credential literal. This is source-level Node/runtime proof, not browser visual, Electron, or installed-Desktop evidence.

## Findings and Remaining Gates

**Total confirmed product findings from this measurement: 0.** HTTP 401 and the preserved warning are confirmed observations, but the exact request/token/provider condition remains unmeasured; they are not sufficient to claim an implementation bug or a successful revocation. There are no new fixed findings in this report.

The measurement task is complete; `tockteam-qwzg.6.6` and the primary pilot remain unresolved. Next useful work is a public-contract/source-only investigation of this new HTTP-401 result while preserving the warning. Any additional live sign-in, account probe, or alternative revocation request needs fresh explicit approval. Do not infer “already revoked,” request a new key/secret, touch other connections, or silently rerun the extension.
