# Raycast Local Storage Enumeration: Bounded SDK Checkpoint

## Scope and Result

Continuation of the approved Tinycast-documented macOS target, public SDK `@raycast/api` 2.0.3. Independent implementation; no Tinycast implementation code, new dependency, DSH loop/profile change, third-party command, native effect, or user-data migration.

`LocalStorage.allItems()` now returns a detached, prototype-safe snapshot of the private extension's existing string-valued public/default keys. Named Cache and remembered Form namespaces remain excluded, using the existing reserved-key length boundary. The current default Cache/LocalStorage sharing is deliberately preserved, not redesigned or presented as complete SDK namespace parity. Enumeration does not rewrite storage or create a missing file.

The SDK's five legacy names now reuse the corresponding method directly: `allLocalStorageItems`, `getLocalStorageItem`, `setLocalStorageItem`, `removeLocalStorageItem`, and `clearLocalStorage`. Legacy-only or absent providers reject enumeration explicitly instead of reporting silent success.

Owned paths: `src/trusted-raycast-compat-api.ts`, `src/user-raycast-storage.ts`, new `tests/user-raycast-local-storage.test.ts`, and this requested behavior report. Start checkpoint was clean `e84b237158c61f54d9fc84ff4d7ca6413a0f9db4`; the earlier 63 TockTutor/gallery changes were saved by their cleanup session before this work began. This checkpoint does not review or adopt that work.

## Verification

Failing-first evidence:

1. Backend regression failed with `storage.allItems is not a function`; the minimal backend addition made it pass.
2. Independently written view and no-view commands failed with `LocalStorage.allItems is not a function`; the API delegate made both pass.
3. Legacy command failed with `allLocalStorageItems is not a function`; direct aliases made its complete set/get/enumerate/remove/clear round trip pass.

Exact final commands:

```sh
node --test --test-reporter=tap tests/user-raycast-local-storage.test.ts tests/user-raycast-storage.test.ts tests/user-raycast-cache.test.ts tests/user-raycast-view-data.test.ts
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast-local-storage.test.ts tests/user-raycast-storage.test.ts tests/user-raycast-cache.test.ts tests/user-raycast-view-data.test.ts tests/user-raycast-runtime.test.ts tests/user-raycast-reconciliation.test.ts tests/user-raycast-form*.test.ts tests/user-raycast-oauth-runtime.test.ts tests/trusted-raycast-can-i-use-preference-form.test.ts tests/trusted-raycast-kaomoji-runtime.test.ts
pnpm run typecheck
git diff --check
```

Results: **17/17 focused checks**, **135 regression passes / 1 pre-existing optional Kaomoji projection skip / 0 failures**, typecheck exit **0**, whitespace checks clean. Fresh temporary API/child builds are used by the actual `UserRaycastManager` and isolated installer, with the already approved runtime-dependency artifact and independently written offline commands—not mocks of the manager, store, or child.

Covered behavior: legacy and empty strings; 128-character and prefix-looking public keys; `__proto__`/`constructor` as ordinary data; detached snapshots; unchanged bytes during reads; cold opens and extension isolation in both command modes; named Cache/Form exclusion and retention across removal/clear; aliases; absent/partial providers; symlink, oversized, malformed, non-string, and over-count state rejection. Existing no-follow/race bounds, Form persistence, lifecycle, native-effect ownership, and bundled preference checks pass. No storage operation acquired native-copy authority.

One added test initially imported the adapter directly from the checkout, which lacks its private React runtime dependency. That failed at test bootstrap (`ERR_MODULE_NOT_FOUND: react`), not in product behavior. It was corrected to use the existing isolated runtime/first-party command fixture; no dependency was installed. All subsequently completed tests pass.

React Doctor 0.9.14 scanned isolated before/current copies of exactly the two product files with telemetry, scoring, cache, and supply-chain requests disabled. Both complete scans report the same four pre-existing lowercase-component-alias hook candidates and one factory-constant dependency warning; no new diagnostics, no rule disable, no numeric-score or broad-review claim. React rendering code is unchanged.

## Findings and Behavior Ledger

Total newly confirmed shipped-product findings in this incremental target slice: **0**. The previously absent API members were unfinished target capabilities, not independently established shipped-command bugs. Final two-file self-check found **0 remaining material findings** in the changed behavior; no independent reviewer was launched.

- **Enumeration and Legacy Names:** current source and real isolated first-party view/no-view command proof pass. Full Desktop/installed command matrix: unverified.
- **Managed String Storage:** original atomic schema, limits, no-follow reads, and current data interpretation preserved. No automatic migration or type coercion.
- **Number/Boolean LocalStorage Values:** still unsupported; they remain a separate data-contract slice. This checkpoint does not claim the complete SDK storage family.
- **Remaining Forms and Broader Target:** full-day date encoding, file selection, rich picker behavior, collections/detail/actions/navigation, remaining SDK/environment/native families, provider-approved PKCE cleanup, and final installed coverage remain unfinished or unverified. Existing Raycast URL-handler exclusions and account/Keychain/native-effect boundaries remain unchanged.

## Custody and Limits

```text
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-local-storage-eEHuDg
```

The baseline manifest covers 2,465 repository records; final custody verifies unrelated bytes, exact owned source hashes, index state, and all recorded fixture process groups. The source/check slot used only bounded temporary Node checks and no-output typecheck. No GUI, browser, web server, shared `dist`/root build/staging, installed smoke, protected TockTutor/trust/install path, account, credential, Keychain, clipboard, worktree, or push operation was performed. This is data-API behavior proof, not a browser-visible UI change or full compatibility acceptance. Source changes require the next build before a running application can use them.
