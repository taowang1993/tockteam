# Raycast Cache Presence: Bounded SDK Checkpoint

## Result and Scope

`Cache.has(key)` and the live `Cache.isEmpty` getter now inspect the selected private cache namespace through the existing bounded store. Empty strings count as present; other namespaces and extensions do not influence the result. Reads do not write files, notify subscribers, or alter access ordering. The existing public/default Cache sharing, string schema, limits, namespaced encoding, and atomic/no-follow storage rules are unchanged.

Public reference: `@raycast/api` 2.0.3, declaration lines 1001–1090. Independent code for the approved Tinycast-documented macOS target; no Tinycast implementation copied. Optional provider members preserve older integrations, while a call to a missing member fails explicitly as `Cache.has` or `Cache.isEmpty` unsupported rather than returning a false success.

Owned paths: `src/trusted-raycast-compat-api.ts`, `src/user-raycast-storage.ts`, `tests/user-raycast-cache.test.ts`, and this behavior report. Clean starting checkpoint: `704592edf860dc7c4d20a78a6d16d64f381f505b`. No unrelated TockTutor, trust/install, manager/preload/main, profile, or shared output change.

## Verification

Failing first: the backend returned `undefined` instead of `true` for an empty namespace. After its minimal implementation, an actual first-party view command still failed with `Cache emptiness is incorrect` because the SDK getter was absent. Both pass after the public delegates. The existing real view/no-view fixture now checks presence and emptiness on distinct cold restarts for two extensions and multiple namespaces, including an empty-string entry.

During development, spreading the new backend getter into the storage facade read the file eagerly. Five existing invalid-state checks failed at construction rather than their expected Promise rejection; the facade was changed to explicit method references and a live getter. This fixed the root cause without weakening invalid-state checks or editing those tests. It is a caught development regression, not a new baseline-release finding. The added facade test also verifies emptiness changes after clearing and subsequent writes.

Exact final commands:

```sh
node --test --test-reporter=tap --test-name-pattern='Cache presence' tests/user-raycast-cache.test.ts
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast-local-storage.test.ts tests/user-raycast-storage.test.ts tests/user-raycast-cache.test.ts tests/user-raycast-view-data.test.ts tests/user-raycast-runtime.test.ts tests/user-raycast-reconciliation.test.ts tests/user-raycast-form*.test.ts tests/user-raycast-oauth-runtime.test.ts tests/trusted-raycast-can-i-use-preference-form.test.ts tests/trusted-raycast-kaomoji-runtime.test.ts
pnpm run typecheck
git diff --check
```

Final result: **137 passed / 1 pre-existing optional Kaomoji projection skip / 0 failed**, typecheck exit **0**, whitespace clean. Temporary freshly built API/private child run through the real manager and isolated installer with independently written offline commands. Missing providers reject in that same boundary while their older `get` behavior remains available.

Covered checks: present/absent keys and empty strings; empty/nonempty/default/named namespaces; no write or subscription notification on reads; cold persistence and extension isolation; live facade getter; invalid/overlong keys and replaced symlink rejection; existing malformed/oversized/non-string/over-count state rejection; original namespace notifications, Form storage and callback/freshness/native-authority regressions. No real clipboard, account, credentials, Keychain, or native effect was exercised.

React Doctor 0.9.14: complete isolated scans of exactly the two product files before/current both report the same four pre-existing lowercase-component-alias hook candidates and one factory-constant dependency candidate. Semantic rule/file/severity/message/line/column identities match; character offsets reflect the longer interface declaration. No new diagnostic, rule disable, scoring/telemetry/supply-chain request, or broad independent review is claimed.

## Findings and Remaining Contract

Total newly confirmed shipped-product findings in this incremental target slice: **0**. Missing target members were not independently verified shipped-command bugs. Final exact three-path self-check found **0 remaining material findings** in the touched behavior; no independent reviewer was launched.

- **Cache.has / Cache.isEmpty:** current source and real isolated private view/no-view command proof pass. Full Desktop/installed extension matrix: unverified.
- **Cache.remove Boolean Return, Subscriber Key/Data Arguments, Optional Quiet Clear:** remain incomplete. Existing behavior was deliberately unchanged, not accepted as full SDK parity.
- **Cache Capacity/LRU/Directory and Typed LocalStorage:** remain unfinished or unverified; no persistence migration or invented environment path was added.
- **Broader Compatibility:** remaining Form/date/file/rich picker, collection/detail/action/navigation, environment/native/PKCE and installed gates remain open. No universal Raycast Store or full Tinycast completion claim.

## Custody

```text
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-cache-existence-vIy9Mn
```

Baseline: 2,467 repository records. Final custody records exact owned hashes, unrelated preservation, index state and all owned fixture groups stopped. No GUI/browser/server, root shared build/stage/generated output, installed smoke, third-party command, native effect, worktree, account/Keychain operation or push occurred. This is API behavior proof, not a browser-visible UI change. A future product build is needed before a running app can use the source changes.
