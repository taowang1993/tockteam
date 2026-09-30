# Raycast Cache and OAuth Cleanup Offline Repair

Date: 2026-09-30. Primary issue: `tockteam-qwzg.6` (still in progress). Offline repair tasks: `tockteam-qwzg.6.2` and `tockteam-qwzg.6.3`.

## Result and Scope

The owner requested continuation of `/Users/taowang/research/handoff.md`. Resumed the recommended offline repairs only. No real Linear sign-in, account query, CLI credential operation, Keychain access, app-registration change, Conductor disconnection, or selected third-party extension execution occurred.

Managed Cache works in the independently written view/no-view fixture, with default/named namespaces, saved values across child restarts, and separate extension state. Mocked cleanup failures remain visible without retaining tokens for automatic retries. This is not proof of real Linear issue access or provider-side revocation.

Scoped commits:

- `3369fe9f` — Managed Cache namespaces and view-command backend.
- `f2070c05` — Sanitized, shared OAuth cleanup outcomes and failure regressions.

## Confirmed Findings

**Total confirmed findings: 4. All four are fixed and verified offline.** The additional cleanup findings do not establish the cause of the historical live cleanup failure.

1. **High — Cache admission blocked the Linear view.** Impact: the pinned `useCachedPromise` → `useCachedState` path necessarily constructs a function-hash namespace, but view commands lacked Cache and all named namespaces were rejected. Affected paths: `src/user-raycast-manager.ts`, `src/user-raycast-child.ts`, `src/trusted-raycast-compat-api.ts`, and `src/user-raycast-storage.ts`. Fix: supply the existing managed backend in all modes; keep view LocalStorage/HUD admission unchanged; qualify named keys and limit clearing/notifications to their namespace. Verification: RED failed with `Raycast API Cache is not admitted by this capability`; final regression and independent four-case diagnostic pass. Commit: `3369fe9f`.

2. **Medium — A synchronous request failure could escape cleanup sanitization.** Impact: a throwing request implementation could propagate diagnostic text containing a token instead of the generic unsuccessful-cleanup result. Affected path: `src/trusted-raycast-compat-api.ts`, `LinearPkceClient.removeTokens`. Fix: place each request inside an async callback so synchronous and asynchronous failures both reach the settled-result sanitizer. Verification: a network-prohibited throwing stub initially exposed a fake token in the exception; the new test now receives only the generic cleanup error. No real provider diagnostic or credential was used. Commit: `f2070c05`.

3. **Medium — Repeated or concurrent cleanup could falsely succeed after a failed revoke.** Impact: clearing the token reference before the request completed allowed a second call to resolve even when the first request failed. Affected path: `src/trusted-raycast-compat-api.ts`, `LinearPkceClient.removeTokens` and `setTokens`. Fix: retain the shared cleanup promise/outcome, not credentials for retries; unsuccessful cleanup also blocks replacement tokens in that client, while a successfully cleaned client can accept a new token set. Verification: RED showed a missing repeated rejection and concurrent `rejected`/`fulfilled` outcomes; final tests require consistent rejection, null tokens, and no automatic retry. Commit: `f2070c05`.

4. **Medium — One client's cleanup failure skipped later clients.** Impact: serial shutdown cleanup stopped at the first rejected client, leaving other registered clients unattempted. Affected path: `src/trusted-raycast-compat-api.ts`, `revokeUserRaycastOAuthTokens`. Fix: settle every client's cleanup and then report any failure generically. Verification: RED observed only the first fake token's request; GREEN attempts both fake clients and drops both token references while still rejecting the combined cleanup. Commit: `f2070c05`.

## Implementation Boundaries and Limits

- Reused `createUserRaycastStorage` and its atomic private-file writes; no parallel storage system or raw filesystem API was added. Inspected `createCachedStateStore`, but kept the synchronous Cache API on the already existing synchronous managed-storage seam rather than adding an asynchronous persistence layer that swallows write failures.
- Legacy default Cache/LocalStorage keys remain in their existing file and retain their existing shared-default behavior. Named Cache keys occupy a disjoint, qualified key space. Clearing a named Cache cannot clear default or another named scope; default/LocalStorage clearing preserves named caches.
- Namespace/key hashes use JSON string encoding, preserving differences between malformed UTF-16 strings as well as delimiter-containing names. Namespace text never becomes a filesystem path.
- Existing aggregate limits remain: 64 KiB and 256 stored entries per extension, 4 KiB per value, and 128-character public keys/namespaces. Actual Linear response sizes against these limits remain unmeasured; this repair is not a blanket compatibility claim.
- Tests cover scoped notifications/unsubscription, removal/clearing, namespace/key collisions, extension isolation, restart persistence, existing menu behavior, bounds, private file mode, and replaced-file symlink rejection.
- OAuth tests use fake tokens and mocked requests only. They cover form encoding, access/refresh deduplication, fresh token sets after successful cleanup, HTTP rejection, synchronous/asynchronous request failure, the real 1500 ms abort signal, repeated/concurrent cleanup, all-client cleanup, and sanitized Host shutdown warnings.
- The pinned public source and reviewed Linear candidate were not changed. Renderer isolation, restricted IPC, Raycast URL registrations, DSH composition, package IDs, profiles, and data roots are unchanged.

## Fresh Verification

Final focused command, run after both source commits:

```bash
node --test tests/trusted-raycast-cached-state.test.ts tests/trusted-raycast-namespaces.test.ts tests/user-raycast-cache.test.ts tests/user-raycast-runtime.test.ts tests/user-raycast-oauth-cleanup.test.ts tests/user-raycast-oauth.test.ts tests/user-raycast-oauth-runtime.test.ts tests/user-raycast-ipc.test.ts tests/user-raycast-renderer.test.ts
```

Result: **42 passed, 0 failed, 0 skipped**, exit 0.

```bash
pnpm run typecheck
pnpm run build
```

Both passed, exit 0. The build included the first-party API, child, main Host, and existing surface bundles; it printed bundle-size notices, not runtime verification. No stage or installed build was changed.

The original diagnostic was read as inert evidence and left unchanged. A fresh independently written copy uses successful repaired expectations:

```bash
node /tmp/tockteam-offline-cache-recheck-20260930.mjs
```

Result: view/default, view/named, no-view/default, and no-view/named all reported `blocked: false`, `succeeded: true`; `accountUsed: false`, `networkProhibited: true`. Root PID 86361 completed; owned groups 86379, 86389, 86397, and 86405 were verified stopped with ESRCH.

Final Cache regression groups 86392, 86400, 86408, 86412, 86417, 86422, 86425, and 86428, plus mocked cleanup groups 86391, 86399, and 86407, were stopped and verified with ESRCH. The existing callback tests also verify listener release. No browser, Electron app, or web server was launched; no screenshot or installed-Desktop proof is claimed for this Host-only repair.

Inert two-file candidate verification still matches:

```text
Installer digest: c2df04834b38c356524d003b125cfd14ab6ae2487e9863e70d4a946b70615489
Built JavaScript SHA-256: d1ca909e106e277f6d708048fb86ae141f6b252d47d779c2a5135ad260d0552f
```

The candidate was hashed, not imported or executed. Its approval is not permission for another account attempt.

Parent final review applied all three review references: code simplification, security/hardening, and performance. A read-only Luna helper drafted cleanup scenarios; the parent corrected and integrated the draft, ran RED/GREEN checks itself, and performed final review. Scoped staged/committed whitespace checks passed. The unscoped working-tree whitespace check detects pre-existing whitespace in protected `AGENTS.md`; it was not changed. Protected `tests/right-panel-layout.test.ts` and pre-existing Playwright outputs also remain untouched. No push, worktree, or permission change occurred.

## Remaining Unverified Work

- A completed real Linear query/non-loading issue list has not been observed. The fixture models the pinned hook's Cache usage; it does not execute the actual pinned `@raycast/utils`/Linear command.
- Real provider revocation and the cause of the earlier cleanup failure remain unverified. Mocked rejection/timeout coverage is not provider-side cleanup proof.
- The last known CLI result is `No workspaces configured`. No CLI/account command was rerun and no new credentials were requested.
- The installed Desktop build remains historical evidence. The new source build must not be mislabeled as an installed-app test. Legacy GUI smokes were not run because they do not satisfy the enforced launch guard.
- The primary OAuth pilot and dependent release-evidence issue remain open. The next account attempt requires fresh immediate owner consent, the unchanged reviewed read-only candidate, a fresh link, bounded execution, sanitized non-loading-list/row-count evidence, visible cleanup failures, and verified full process/listener shutdown. Leave Conductor and the separate OAuth app registration alone.
