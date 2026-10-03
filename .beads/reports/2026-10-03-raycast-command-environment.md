# Raycast Selected Command Environment Checkpoint

## Result and Scope

Selected private commands now receive `environment.extensionName`, `entryPointName`, `entryPointType: 'command'`, and `entryPointMode`, plus deprecated `commandName`/`commandMode` aliases. These identify the approved manifest selection before its command module imports; the existing frozen `isDevelopment: false` remains unchanged. `Cache({ namespace: environment.entryPointName })` now separates command data instead of receiving an absent name.

The private child supplies its existing manager-captured extension/command/mode to `configureCompatibility`. The API copies and freezes that small snapshot. Later mutation of the supplied record or process environment cannot change it. Missing providers throw the existing explicit unsupported-capability error for these fields. Empty, incorrectly typed, over-128-character names and unknown modes are rejected before replacing the previous compatibility or identity. The existing child mode guard runs before configuration/import rather than afterward. No installer, manager, storage schema/path, native effect, renderer projection or IPC rule changes.

Reference: inert official `@raycast/api` **2.0.3** declarations at lines 2626–2732 and the owner-approved Tinycast documented macOS scope at `6fc6aa1b909ca24e3cd25e35c078a7c808ca34a9`. Implementation is independently written; no Tinycast code/artwork/runtime copied. DSH remains `0.1.2-rc.1`. Starting checkout: `b32137721d33aa5b7289cfa59e2c97e1fa9b24aa`.

Owned paths only: `src/trusted-raycast-compat-api.ts`, `src/user-raycast-child.ts`, `tests/user-raycast-environment.test.ts`, and this report. No new dependency, worktree, UI, credentials, Keychain, real account, selected third-party command, migration, trust/install admission or shared generated artifact is introduced.

## Confirmed Findings

Total confirmed existing-product findings: **0**. Missing identity members are a documented compatibility addition, not a newly proven shipped-command bug. The first public fixture failed with `Incorrect command environment: {"isDevelopment":false}` before implementation. A development check subsequently caught accepted malformed provider metadata (`null`); validation was added before publication. That was an intermediate development gap, not an additional existing-product finding. No independent review or complete compatibility claim follows from this self-check.

## Verification

```sh
node --test --test-reporter=tap tests/user-raycast-environment.test.ts
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast-environment.test.ts tests/user-raycast-local-storage.test.ts tests/user-raycast-storage.test.ts tests/user-raycast-cache.test.ts tests/user-raycast-view-data.test.ts tests/user-raycast-runtime.test.ts tests/user-raycast-reconciliation.test.ts tests/user-raycast-form*.test.ts tests/user-raycast-oauth-runtime.test.ts tests/trusted-raycast-can-i-use-preference-form.test.ts tests/trusted-raycast-kaomoji-runtime.test.ts tests/trusted-raycast-manager.test.ts tests/trusted-raycast-cached-state.test.ts tests/trusted-raycast-effect-callback.test.ts tests/trusted-raycast-can-i-use-source.test.ts tests/trusted-raycast-can-i-use-source-detail.test.ts
pnpm run typecheck
git diff --check
```

Focused environment result: **4/4 passed**. Regression result: **162 passed / 3 pre-existing optional skips / 0 failed**. The skips are the optional Kaomoji projection run and two optional Google Translate/isolated-preview integration runs requiring the explicitly configured artifact environment. They are not proof of those unexecuted paths. Typecheck exits **0**; owned whitespace is clean.

New fixtures rebuild current first-party API/child into temporary paths and use the real private installer/manager. Every source is an independently written offline fixture, explicitly prepared, approved and enabled; network/native effects are prohibited. Each of `view`, `no-view`, and `menu-bar` runs two extension identities, two command names, and repeated cold sessions. Exact output checks prove six identity fields/aliases, import-time availability, frozen assignment rejection, unchanged snapshot after process-variable edits, and command/extension-specific persistent counters. View/menu evidence is the real inert private-child projection; no native menu or Desktop UI was driven. No-view feedback and successful completion are checked through the existing bounded messages.

A separate real private command checks all six missing-provider reads, provider-object mutation, invalid shapes/names/modes, and preservation of both the previous identity and Cache capability after rejected replacement. Existing Form/default/date/persistence/callback, LocalStorage/Cache, native authority, selected preferences, owned-manager cleanup and bundled preference/source checks remain green.

React Doctor 0.9.14: complete isolated before/current scans of exactly the two product files yield the same four pre-existing lowercase-component-alias hook candidates and one factory-constant dependency candidate. Rule, severity, message, column and exact affected source line match; API candidate lines shift by +10 with the new declarations/configuration. No new candidate, numerical score, global rule disable, supply-chain/telemetry scan or tool update is claimed.

## Limits and Custody

This completes only selected-command identity. Bundled-command identity injection, paths/support directory, author/version, appearance/theme/text size, launch type/arguments/context, API availability, richer feedback, typed LocalStorage, Cache capacity/LRU/directory, remaining Forms/collections/navigation/actions/native effects and full Desktop/installed compatibility remain unfinished or unverified. Do not pretend that SDK 2.0.3 is the Raycast application's version or that a child is an OS sandbox. Reconfiguring the internal first-party capability is not a security boundary against already approved local code.

```text
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-environment-identity.FsZjRqjDGA
```

The baseline has 2,471 repository records. Custody records exact tested bytes, unchanged unrelated records, approved gallery-only peer changes, and stopped owned groups; save proof is separate. Peer `01a10187` owns the six-path gallery save `a0f2605d28868882908b8eb6694632b4a4799c74`, including its new gallery preview PNG. Its later user-requested expanded-Properties upper/lower capture window is also peer-owned and preserved; it is not part of this checkpoint. Its reserved source/index/display windows were coordinated and its work was preserved, not edited, staged, reviewed or accepted here. No shared root build/test/stage or installed smoke ran in this slice; the no-output typecheck and focused temporary runtime checks were separately permitted. Owned fixture cleanup uses full detached process-group `ESRCH` checks, not only wrapper exits. Global process enumeration was denied by the environment; no bypass or claim from that blocked inspection is made. No owned GUI/browser/server or native input was started. A fresh product build and Electron restart are required before an already running app uses this source checkpoint; no screenshot is required for this API-only change.
