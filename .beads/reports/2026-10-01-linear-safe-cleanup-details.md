# Linear Safe Offline Cleanup Details

Date: 2026-10-01 (UTC). Task: `tockteam-qwzg.6.6.2`.

Code checkpoints: `45d45b6a` (safe reasons/contracts) and `3625701d` (owned shutdown propagation and regression coverage).

## Scope and Result

The owner explicitly selected **Prepare Offline Checks (Recommended)**. This work used synthetic commands, fake credentials, and mocked provider responses only. No real reviewed Linear command, account API, sign-in, token request, Keychain operation, Conductor disconnection, or app-registration change ran. No push occurred.

**Offline preparation is verified. The original real cleanup warning is still unexplained; automatic provider-side revocation is not proven.** The primary pilot and `tockteam-qwzg.6.6` remain open/blocked. A new account-assisted test would require fresh explicit authority.

## Available Details

The first-party Host observer receives only sorted, deduplicated reason codes in `onError`'s `Error.cause`:

- `http-NNN`: a non-200 HTTP response, including successful-range responses that do not confirm revocation. Only integer HTTP statuses 100–599 are admitted, excluding 200.
- `transport`: the request rejected without the owned deadline expiring, including synchronous fetch failures. Provider error names/messages/causes are not used to classify this.
- `timeout`: the owned request deadline expired.
- `unknown`: missing, malformed, unexpected, or interrupted cleanup details. It is not silently converted to success or called a provider timeout.

The existing warning text and renderer messages are unchanged. **These details are Host-only, not a new visible UI or installed-app update.** The current Desktop log callback still uses the generic `error.message`; a future approved bounded proof can explicitly retain the validated `Error.cause` codes.

The child flushes a private diagnostic frame before failure exit. The parent accepts it only during its owned shutdown, with the current runtime session identity, the exact four-field schema, and allowlisted bounded codes. Active command diagnostics are discarded, not collected as shutdown evidence. Arbitrary messages, URLs, token identifiers, response bodies, extra fields, and stale/early frames are not forwarded. The existing 64-KiB diagnostic ceiling and process-group teardown remain intact. No new helper framework, dependency, retry, deadline increase, or credential storage was added.

## Confirmed Findings

Total confirmed findings: **1**, fixed and verified.

1. **[P2] A synchronous SDK cleanup override could bypass shared error sanitization and later clients.**
   - **Impact:** a consumer can replace its public SDK cleanup method. If it throws synchronously, the old array mapping throws before `Promise.allSettled` can collect the result, exposing its raw message to the shared API caller and preventing later clients from being attempted. A fake sensitive message reproduced this; no real credential was used.
   - **Affected path:** `src/trusted-raycast-compat-api.ts`, `revokeUserRaycastOAuthTokens()`.
   - **Fix:** an async mapping wrapper converts that throw into a settled rejection; the shared sanitizer emits the generic error with `unknown` and still visits later clients.
   - **Verification status:** test failed first with the raw fake message, then passed after the one-word wrapper change. Both synchronous and asynchronous malformed SDK errors now sanitize; later fake clients still clear their tokens. This is not evidence of the original live warning's cause.

## Test-First Evidence

Each relevant failure was observed before its remedy:

- Direct/shared cleanup had no safe cause codes: new HTTP/transport assertions failed with `actual: undefined`.
- The initial reason guard admitted a sparse array: an unsafe-array assertion failed, then array normalization fixed it.
- Synthetic child shutdown lost the cause: the parent observer's new assertion failed with `undefined` instead of `http-503`.
- An early same-session frame could be mistaken for shutdown evidence: the new regression failed with `http-401` instead of `unknown`, then shutdown-only admission fixed it.
- Synchronous overridden SDK cleanup escaped the sanitizer: the new test saw a raw fake message instead of a generic error and `unknown`, then the async wrapper fixed it.

## Fresh Verification

Run after the final code/test edits:

```bash
node --test tests/user-raycast-oauth-cleanup.test.ts tests/user-raycast-oauth-runtime.test.ts tests/user-raycast-oauth.test.ts tests/user-raycast-runtime.test.ts tests/user-raycast-ipc.test.ts
pnpm run typecheck
```

Results: **31/31 passed**, zero failures/skips, typecheck passed. A temp-only `buildUserRaycast()` build and scoped whitespace check passed.

Coverage includes 200 success; 202 non-confirmation; unknown status; mixed 200/400; synchronous/asynchronous transport rejection; timeout; repeated/concurrent outcomes; mixed all-client results; malformed SDK causes; PKCE callback/denial/cancellation; unchanged owner/native-effect admission; and non-Linear command lifecycle. HTTP fixtures assert zero provider-body reads. Ten shutdown variants exercise HTTP, 202, transport, timeout, fragmented frames with discarded sensitive noise, extra fields, stale session, absent frames, premature same-session frames, and a force-killed stalled signal handler. Reported errors contain neither fake credentials nor the private diagnostic frame; renderer messages contain no reasons/cause.

The final ten shutdown groups `75744`, `75748`, `75752`, `75756`, `75764`, `75766`, `75769`, `75771`, `75773`, and `75775` were explicitly checked absent. All fixture managers use the same full-process-group cleanup, and the callback checks verify listener closure. Only disposable local callback fixture servers ran; no GUI app, browser, gallery, or non-fixture server was launched.

Sanitized logs and temporary first-party bundle hashes:

```text
/tmp/tockteam-linear-cleanup-details.RzT92R
```

`final-focused.log` records the exact fresh results and stopped groups; `final-types.log` records the passing typecheck; `build.json` records the passing temp build and bundle hashes. Red evidence is retained alongside them. Only fake data appears in these artifacts.

## Review and Remaining Gates

The parent applied all three review references: simplification, security/hardening, and performance. Remaining diff-review findings: **0**. Intercom coordinated file/index ownership, not an independent code review.

The trust boundaries are provider responses → generated codes, private child diagnostics → validated Host causes, and Host → renderer. Protected assets are credential secrecy, truthful cleanup state, session ownership, and existing renderer authority. The tested abuse cases include sensitive body/error content, invalid/sparse codes, extra-field payloads, stale and premature frames, fragmentation, and interrupted teardown. Typed standard `Error.cause`, the existing contract module, and the existing line reader avoid a new diagnostics layer; request/grace budgets and native authority are unchanged.

CodeGraph's stale local index did not cover the new Raycast symbols, so exact-file source/caller inspection was used without a global reindex. Browser screenshots and React Doctor were not applicable: no React rendering or UI text changed. No root build/stage, Electron smoke, installed smoke, or installed Desktop replacement ran; this is focused first-party Node/runtime proof, not an installed-app or live-provider claim. Viewer/gallery and protected user-owned changes were left untouched.

A future approved read-only check should retain only the existing loading/list count evidence plus these coarse validated codes. A `400` code still cannot prove “already revoked”; an absent visible connection and successful local shutdown still cannot prove provider-side revocation. Do not reuse an expired link or automatically retry the real extension.
