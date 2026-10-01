# Linear HTTP-401 Offline Investigation

Date: 2026-10-01 (UTC). Task: `tockteam-qwzg.6.6.4`.

## Result and Authority

The owner said **Continue** after the newly measured read-only attempt retained `cleanupError: true` and `cleanupReasons: ["http-401"]`. This investigation used public documentation, inert source inspection, fake tokens, and synthetic provider responses only. No real Linear account call, candidate execution, sign-in, token request, revocation retry, CLI/Keychain operation, new key/secret, Conductor or app-registration change, user-registry mutation, GUI, root build/stage, installed-app operation, or push occurred.

**Total confirmed product findings: 0.** There are no fixed product findings in this phase. The measured HTTP 401 is genuine, but its cause and provider-side revocation remain unproven. No authentication, hint, request-order, timeout, or warning change is justified by these checks. `tockteam-qwzg.6.6` remains blocked and the OAuth pilot remains incomplete.

Only two existing test files changed. They now explicitly preserve the warning and safe `http-401` cause for a single unauthorized request, mixed HTTP 200/401, all HTTP 401, and the managed child's owned shutdown. These tests passed against the existing implementation before any product change. This is additional protection for correct failure behavior, not a manufactured RED/GREEN repair or proof that the live issue is fixed.

## Reproduction and Call Flow

The first-party API reproduction ran twice: **17 checks passed each time**. A final combined focused run passed **18 checks**, including all **11 synthetic shutdown scenarios**.

The directly reproduced signature is the generic revocation warning plus `['http-401']`, with local token state cleared. Both a mixed 200/401 response and two 401 responses produce this signature. Consequently, the retained live reason cannot distinguish partial confirmation from no confirmed requests, identify the token involved, or establish whether a grant is active.

Exact source/caller inspection covered:

- `src/trusted-raycast-compat-api.ts`: `LinearPkceClient.setTokens()` maps SDK response fields; `removeTokens()` aborts pending authorization, clears local state, deduplicates retained refresh/access values, and reuses the cleanup promise. It sends concurrent URL-encoded `token` requests to the fixed HTTPS revocation endpoint, with a 1.5-second deadline per request. Only HTTP 200 confirms a request. Failure bodies are not read. `revokeUserRaycastOAuthTokens()` visits all clients and retains sanitized failure reasons.
- The unchanged candidate's pinned `@raycast/utils` OAuth service: authorization/token exchange calls `setTokens()`; a failed refresh calls `removeTokens()` before reauthorization. Successful refresh responses map their refresh field or reuse the prior refresh value. Inspection was static; neither this SDK nor the reviewed Linear command was executed.
- `src/user-raycast-child.ts`: owned Linear SIGTERM invokes shared cleanup; failure flushes an allowlisted private diagnostic and exits with status 1. Success exits with status 0.
- `src/user-raycast-manager.ts`: close is coalesced, detaches the active session, drains output, invokes full owned-group teardown with the existing two-second grace, validates current-session shutdown diagnostics, reports nonzero/interrupted cleanup, and removes its private workspace.
- `src/main.ts`: launcher-owner clearing, explicit close, disable/remove/recovery, and launcher-core flush route to the manager. The Desktop observer still logs the generic message, not a new renderer diagnostic. The measured harness used the manager directly; this phase did not execute Electron or verify every application-exit path.
- `scripts/trusted-raycast-process.mjs`, `scripts/user-raycast-build.mjs`, and `src/user-raycast-oauth.ts`: existing process-group cleanup, temp-only first-party builds, and abort/finally callback teardown were inspected. No callback was opened in this phase's final checks.

## Ranked Hypotheses and Prediction Probes

The ranking was recorded before the probes. All provider models below are explicitly artificial; their behavior is **not evidence of Linear's actual policy**.

1. **Related-token invalidation or a token-family race.** Prediction: if the first accepted revocation invalidates both related tokens, changing which request finishes first changes the affected request but can leave the same generic warning. Fake coupled models in both completion orders produced 200/401 and `http-401`; an independent-token control produced 200/200 and no warning. This demonstrates ambiguity, not that the live grant was revoked. Simply serializing two requests would not establish success under a coupled policy either.
2. **Provider lookup depends on `token_type_hint`.** Prediction: a deliberately hint-sensitive fake provider rejects the current request but accepts the same value with the correct hint injected at the fake-provider boundary. The probe produced 401/401 without hints and 200/200 with them. This is a counterfactual model: public documentation does not establish a mandatory hint or prove that adding it fixes the real 401. Product requests and the reviewed candidate were unchanged.
3. **Wrong value, form encoding, or duplicate cleanup.** Prediction: the fake endpoint receives a different token, missing form metadata, or repeated credentials. Exact round-trip probes covered `+`, `/`, `=`, `&`, `%`, and space; mutation of the caller's original response object; and repeated direct/shared cleanup. The first-party request preserved both fake values, used POST with URL-encoded content type and only the `token` field, and sent each value once. This hypothesis was not reproduced for those cases. The deleted live credentials cannot be compared, so it is not universally ruled out.

All **six fake-provider probes passed**. Every probe asserted zero provider-body reads and cleared local state. They distinguish predictions and protect honest warning behavior; they do not discriminate the actual live cause.

## Public Contracts and Limits

Public sources inspected:

- [Linear OAuth 2.0 authentication](https://linear.app/developers/oauth-2-0-authentication), **Revoke an access token**: new integrations use the `token` form field; it must not be combined with legacy fields. The documentation recommends including `token_type_hint` if available. It defines **200 = token revoked**, **400 = unable to revoke**, and **401 = unable to authenticate with the token**.
- [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009), Sections 2.1–2.2 and 5: form encoding and the optional hint; possible related-token invalidation; HTTP 200 for invalid tokens; and client identification/authentication requirements, including a valid public `client_id`.

The current token-only form matches Linear's documented required revocation shape. It does not supply the recommended hint. Generic RFC requirements are not proof of this provider's exact public-PKCE authentication policy: Linear documents different invalid-token response behavior and does not specify a new client secret/API key requirement for this revocation request. Missing client identification or hint-dependent lookup remains a provider-contract question, not a confirmed cause or authority to change authentication.

Do not reinterpret 401 as “already revoked,” suppress it because another request might have succeeded, omit a related token on an assumed cascade, add a secret, or retry automatically. The prior historical warning retained only a boolean, so this phase cannot retrospectively attribute it either.

## Fresh Verification and Local Cleanup

Commands executed from the repository, under bounded owned process groups:

```bash
node --experimental-strip-types /tmp/tockteam-linear-401-offline.p78WAS/probes.mjs
node --test --test-concurrency=1 --test-name-pattern='cleanup details|first-party OAuth cleanup|mocked shutdown' tests/user-raycast-oauth-cleanup.test.ts tests/user-raycast-oauth-runtime.test.ts
node node_modules/typescript/bin/tsc --noEmit
git diff --check -- tests/user-raycast-oauth-cleanup.test.ts tests/user-raycast-oauth-runtime.test.ts
```

Results: six probes passed; **18 passed, 0 failed, 0 cancelled**; typecheck and scoped whitespace checks passed. The name filter deliberately excludes callback/sign-in fixtures; no real or synthetic sign-in URL was issued. The checks exercised freshly temp-built first-party API/child bundles. The probe explicitly stopped esbuild; the bounded verification wrapper terminated and checked complete owned process groups, including test/build descendants.

Final roots: **8302** (probes), **8306** (focused tests), **8339** (typecheck). Managed shutdown fixture roots: **8315, 8317, 8319, 8321, 8323, 8328, 8330, 8332, 8334, 8336, 8338**. Every recorded leader and complete group returned **ESRCH**; disposable fixture/install/runtime directories were removed. No shared callback, GUI, build/stage, or account resource remains held.

An earlier wrapper attempt was stopped before verification because `/bin/ps` was denied with `EPERM`. Root/group **8262** was checked absent in `finally`; its empty log is not a passing probe. The retry omitted process-list inspection and used existing owned-group teardown plus all fixture roots recorded by the tests; no guard was bypassed. CodeGraph lacked the targeted new symbols, so exact source reads/searches were used without a global reindex. Exa was unavailable and Brave search had no configured key; neither was installed/configured and no new credential was requested. These are environment limits, not product findings.

Sanitized evidence:

```text
/tmp/tockteam-linear-401-offline.p78WAS
```

`probes.json` records fake-only predictions; `focused-verified.log` records the fresh checks and fixture roots; `typecheck-verified.log` and `final-verification.json` record exit codes and owned-group cleanup. The directory also contains inert source excerpts and public documentation. No real credential, owner-provided public Client ID, private sign-in URL, provider body/raw error, or account content was retained.

## Review and Remaining Gate

Self-review applied all three references: simplification, security/hardening, and performance. **Additional confirmed diff-review findings: 0.** The tests reuse existing public APIs and synthetic Host/child fixtures without a new helper, dependency, or runtime abstraction. Provider/body secrecy, Host-only diagnostics, session ownership, no automatic retries, truthful failure, and full owned-group cleanup remain intact. Abuse checks cover sensitive fake bodies/errors, mixed success/failure, malformed or stale diagnostics, and renderer non-disclosure. No UI changed; browser screenshots, React Doctor, Electron/installed smokes, and a root build/stage were not applicable or authorized. This is focused first-party Node/runtime evidence, not installed-Desktop or live-provider proof. Intercom coordinated shared ownership/index access, not an independent review.

The next useful evidence is Linear's provider-specific public-PKCE revocation policy, particularly whether revoking one token invalidates its related token and which response follows. No support message was sent. Alternatively, a separately approved offline diagnostic extension could retain only bounded attempted/confirmed/failed request counts to distinguish mixed responses from all failures in a future freshly approved measurement—never credentials, token identifiers, or bodies. Neither option has been implemented or treated as new live authority here. Until such evidence is available, keep the genuine warning and the provider-revocation gate open; do not repeat sign-in merely to obtain the same undifferentiated 401.
