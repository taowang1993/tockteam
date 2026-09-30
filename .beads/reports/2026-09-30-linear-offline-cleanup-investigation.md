# Linear Offline Cleanup Investigation

Date: 2026-09-30. Work: `tockteam-qwzg.6.6`. Code/test fix: `cc6168c2`.

## Scope and Result

The owner selected **Continue Offline**: fake credentials, synthetic responses, and public documentation only. No real extension, account API, sign-in, token request, or revocation retry ran. The prior real read-only proof remains four loaded issue rows with a cleanup warning; the owner reported that the test was not listed under Authorized applications.

**One separate false-success defect was reproduced and fixed. The cause of the original live cleanup warning remains unproven.** This change must not be described as fixing that warning or proving provider-side revocation.

## Confirmed Findings

Total confirmed findings: **1**.

1. **[P2] Successful-range responses could falsely confirm token revocation.**
   - **Impact:** `Response.ok` accepted HTTP `202` (request accepted), and other successful-range statuses, as proof of completed revocation even though Linear documents only `200` as that confirmation. A cleanup caller could incorrectly report success.
   - **Affected path:** `src/trusted-raycast-compat-api.ts`, `LinearPkceClient.removeTokens()`.
   - **Fix:** require the documented `status === 200` for every token response, rather than `Response.ok`. The shared cleanup function covers direct, repeated/concurrent, and child-shutdown callers. No new helper, dependency, error payload, retry, or authentication flow was added.
   - **Verification:** a new fake-HTTP-202 test failed first with `Missing expected rejection`. After the change, it passes; a synthetic child-shutdown case also preserves the cleanup error and verifies full process-group shutdown. Genuine transport/timeout/HTTP failures remain failures.

## Original Warning: Unresolved, Not Counted as a New Finding

The prior real proof retained `cleanupError: true`, not the provider's response statuses or failure details. Its private state was removed as agreed. These data cannot now establish why that run warned.

Public Linear documentation confirms:

- The revocation request uses a URL-encoded `token` field. It does not document a required client secret for revocation; no new secret or API key is justified.
- `token_type_hint` can be supplied, but is not documented as required. Its absence is not a proven cause here.
- `200` means revoked; `400` means unable to revoke, including an already-revoked token; `401` means unable to authenticate with the token.

A synthetic two-token case with one `200` and one `400` reproduces the same generic cleanup warning, while both local tokens are cleared. This demonstrates why an absent visible connection can coexist with an unconfirmed cleanup outcome. It does **not** prove those were the real responses, that one request invalidated the other token, or that every `400` is harmless. The code deliberately continues rejecting ambiguous `400` responses.

The timeout hypothesis was also exercised with synthetic stalled requests: the existing 1,500-ms request deadline rejects, the warning stays visible, and the parent stops all owned descendants. No real latency evidence exists, so deadlines were not changed on speculation.

The remaining investigation needs safe coarse outcome evidence to distinguish HTTP status, transport failure, and timeout. A future account-assisted check requires fresh explicit authority; nothing here authorizes one. Do not retry an old proof or weaken error handling just to remove the warning.

## Public Reference

Read-only, unauthenticated documentation retrieval:

```text
https://linear.app/developers/oauth-2-0-authentication
```

The **Revoke an access token → Response** section is the contract for the strict status check. No account page or protected API was queried.

## Fresh Verification

**Red, before the source fix:**

```bash
node --test tests/user-raycast-oauth-cleanup.test.ts
```

Result: the new `unconfirmed-success` subtest failed with `Missing expected rejection` because HTTP 202 was incorrectly accepted.

**Green, after the final source/test edits:**

```bash
node --test tests/user-raycast-oauth-cleanup.test.ts tests/user-raycast-oauth-runtime.test.ts tests/user-raycast-oauth.test.ts
pnpm run typecheck
```

Results: **18/18 passed**, typecheck passed. Coverage includes documented 200 success, 202 non-confirmation, mixed 200/400 responses, HTTP rejection, async/synchronous transport errors, timeout, repeated/concurrent failures, all-client cleanup, PKCE callback/cancellation, secret-free errors, and child lifecycle teardown. Recorded final shutdown-fixture groups `40268`, `40271`, `40273`, and `40276` were verified absent; the other fixture managers also completed their shared group cleanup. All callback fixtures close their owned listeners.

A temp-only `buildUserRaycast()` build passed. Scoped `git diff --check` passed. Built hashes:

```text
api.mjs: 34c0bc07538202324b3c0b607a12d028df98a43344cf4f2f919de586695003d4
child.mjs: 19644a21d405aaba942a9439d33b679731e2c4b698499ef40a62fd47253c5f41
```

Temporary public-document and sanitized verification artifacts reside at:

```text
/tmp/tockteam-linear-offline-cleanup.xrCw1s
```

## Review and Limits

The parent reviewed the small diff using all three review references: simplification, security/hardening, and performance. New diff-review findings: **0**. The boundary is the provider's revocation response; the protected assets are token secrecy and truthful cleanup state. A pending/unconfirmed response must not masquerade as completed revocation. The fix tightens that check without changing scopes, request bodies, error text, token retention, timeout budgets, renderer authority, or dependency composition.

React Doctor and browser screenshots were not run: only non-React OAuth cleanup logic and synthetic fixtures changed, not React rendering or UI copy. No full root build, stage, Electron smoke, installed smoke, or installed-app replacement ran; the other session owned those shared slots, and this work was expressly offline. Temp-only runtime build and first-party lifecycle integration tests verify the touched behavior, not installed Desktop behavior. CodeGraph's local index did not cover the new Raycast symbols, so exact-file source reads and caller searches were used instead; no global reindex or unrelated edits occurred.

The primary pilot remains open. The real cleanup warning and provider-side revocation are still unverified, and the unchanged reviewed extension was not rerun.
