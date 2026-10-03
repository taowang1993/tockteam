# Raycast Cache Mutation and Notification Checkpoint

## Result and Scope

The existing private string Cache now returns `true`/`false` from `remove`, passes the public key and associated data to subscribers, and supports `clear({ notifySubscribers: false })`. Set notifications contain the key and new string, removal notifications contain the key and `undefined`, and ordinary clear notifications contain `undefined` for both. Notifications occur after the existing atomic save; failed validation or unsafe-state reads emit no notification. Existing zero-argument hook listeners remain valid. Repeating an old unsubscribe cannot erase a newer namespace subscription.

Authority and reference: the owner-approved Tinycast-documented macOS target, independently implemented against inert `@raycast/api` 2.0.3 declarations at lines 1001–1090 and the official [Cache documentation](https://developers.raycast.com/api-reference/cache). No Tinycast implementation copied. DSH remains pinned to `0.1.2-rc.1`. Starting checkpoint: `ccabe400659e7c42a508ea4c67c0099bfcbadf5a`.

Only `src/trusted-raycast-compat-api.ts`, `src/user-raycast-storage.ts`, `tests/user-raycast-cache.test.ts`, and this report are owned. Existing strings/default-key interpretation, default Cache/LocalStorage sharing, hashed named namespaces, Form storage, file paths, 4 KiB value/64 KiB extension/256-entry limits, owner-only atomic writes and no-follow reads are unchanged. No typed-value coercion, migration, trust/install/native/IPC change, TockTutor edit, dependency or shared build is included.

## Confirmed Findings

Total confirmed existing-product findings: **1**, fixed and verified.

1. **P2 — Retired Unsubscribe Silences New Listeners.** After the last listener was removed, a new namespace set could be registered. Calling an older unsubscribe again unconditionally deleted that new set, leaving future saved changes unreported to active consumers. Affected path: `src/user-raycast-storage.ts`, subscription disposer. Independently reproduced against clean `ccabe400`: one notification expected, zero received, and the saved value remained retrievable. **Fixed:** delete the namespace entry only when it still points to the retired set. The public-backend regression failed before this guard and passes after it; the final command fixture also verifies stale cleanup through `@raycast/api`.

Missing target return values, subscriber arguments and quiet-clear support are compatibility additions, not separately counted as independently demonstrated shipped-command findings. No remaining material finding was confirmed in the exact owned self-check; no independent reviewer was launched.

## Verification

Failing-first evidence: backend removal returned `undefined` instead of `true`; subscriber arguments were both `undefined` instead of the public key/empty string; quiet clear notified subscribers. After backend changes, the real private SDK command still failed with `Cache quiet clear notified subscribers` because its public delegate discarded options. The stale-unsubscribe check separately failed with zero new notifications before the identity guard. Each focused check passes after its corresponding minimal fix.

Exact final verification:

```sh
node --test --test-reporter=tap tests/user-raycast-cache.test.ts
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast-local-storage.test.ts tests/user-raycast-storage.test.ts tests/user-raycast-cache.test.ts tests/user-raycast-view-data.test.ts tests/user-raycast-runtime.test.ts tests/user-raycast-reconciliation.test.ts tests/user-raycast-form*.test.ts tests/user-raycast-oauth-runtime.test.ts tests/trusted-raycast-can-i-use-preference-form.test.ts tests/trusted-raycast-kaomoji-runtime.test.ts
pnpm run typecheck
git diff --check
```

Final regression result: **140 passed / 1 pre-existing optional Kaomoji projection skip / 0 failed**. Typecheck exits **0**; owned whitespace is clean. Existing offline view/no-view fixtures use freshly built first-party API/child artifacts, the real isolated installer and manager, two extension identities, multiple namespaces, distinct cold runs, an unbound React external-store subscription, and explicit returned-value/callback/quiet-clear checks. No selected third-party command or native effect runs.

Backend checks verify empty-string and absent removal, prototype-looking public keys, same-namespace listeners, default/other-namespace preservation, post-save visibility, quiet clear/reopen, true/default notification modes, repeated old unsubscribe, failed value validation and replaced-symlink mutation rejection without notification or outside-file changes. Broader Form, LocalStorage, callback/freshness, OAuth and native-authority regressions stay intact.

React Doctor 0.9.14: complete isolated scans of exactly the two product files before/current both have the same four pre-existing lowercase-component-alias hook candidates and one factory-constant dependency candidate. Semantic rule/file/severity/message/line/column identities match; only character offsets change with the longer type declaration. No new candidate, global rule disable, auto-update, numerical score, supply-chain scan or telemetry is claimed.

## Limits and Custody

Cache capacity/LRU/directory semantics, typed LocalStorage, broader picker/collection/detail/action/navigation/environment/native behavior and full Desktop/installed-extension compatibility remain unfinished or unverified. Older custom providers must implement the updated Cache contract; this proof covers the existing first-party private provider, not arbitrary historical integrations. Existing listener exceptions still follow prior synchronous dispatch behavior; no cross-process subscription delivery is claimed. No universal Store, complete Cache, complete Tinycast or installed-release claim follows.

```text
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-cache-mutations-MHoROU
```

Baseline has 2,468 repository records. Final custody separately records exact tested owned hashes, unchanged unrelated records, authorized peer changes and stopped owned process groups. The concurrent session owns `plugins/skins/src/client/tailwind.css`, `tests/tailwind.test.ts`, its proof, and its separate root build/stage/display window; none is reviewed, edited, staged or discarded by this session. Source was frozen before handing back that shared window. No GUI/browser/server, root build/stage/generated output, installed smoke, worktree, real account/credentials/Keychain effect or push was started here. API behavior only: no new browser-visible surface or screenshot is required. A future product build/restart is needed before a running app uses these source changes.
