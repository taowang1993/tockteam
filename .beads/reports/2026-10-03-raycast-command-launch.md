# Raycast Command Launch Information

## Scope and Result

SDK 2.0.3 `LaunchType.UserInitiated` and `LaunchType.Background` expose their documented string values. The current selected-command manager starts commands only through explicit user actions. Its existing private child now supplies that truthful `UserInitiated` value to the immutable startup environment and the root command's top-level props in all three modes: view, no-view and menu-bar. Root commands receive an empty arguments record when no argument input is supplied. No launch context, fallback text or draft is invented.

This uses the existing environment snapshot and command mount/call; it does not add background scheduling, command inputs/context, installer/manager/IPC messages, storage, native effects, DSH or trust authority. The enum's Background member and valid provider metadata are not evidence that background execution exists. Other environment APIs and the broader Tinycast target remain open. An older provider may continue to supply the existing identity fields without launch metadata; reading its missing `environment.launchType` explicitly fails. Invalid launch values fail before replacing the prior identity or active capability.

Reference: Tinycast's documented macOS behavior at `6fc6aa1b909ca24e3cd25e35c078a7c808ca34a9` (command-mode and background-refresh sections), and official public SDK 2.0.3 declarations at lines 6506–6565. Independently written implementation; no Tinycast implementation, generated runtime or artwork copied. DSH stays at `0.1.2-rc.1`.

## Findings and Verification

Total confirmed review findings: **0**. The conductor's fresh read-only source reviewer reported zero confirmed findings, not a test, commit or release approval. Missing launch information is a compatibility addition; no newly established shipped-command defect is claimed.

```sh
node --test --test-name-pattern='selected view manual' --test-reporter=tap tests/user-raycast-launch.test.ts
node --test --test-reporter=tap tests/user-raycast-launch.test.ts tests/user-raycast-environment.test.ts
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast-launch.test.ts tests/user-raycast-environment.test.ts tests/user-raycast-local-storage.test.ts tests/user-raycast-storage.test.ts tests/user-raycast-cache.test.ts tests/user-raycast-view-data.test.ts tests/user-raycast-runtime.test.ts tests/user-raycast-reconciliation.test.ts tests/user-raycast-form*.test.ts tests/user-raycast-oauth-runtime.test.ts tests/trusted-raycast-can-i-use-preference-form.test.ts tests/trusted-raycast-kaomoji-runtime.test.ts tests/trusted-raycast-manager.test.ts tests/trusted-raycast-cached-state.test.ts tests/trusted-raycast-effect-callback.test.ts tests/trusted-raycast-can-i-use-source.test.ts tests/trusted-raycast-can-i-use-source-detail.test.ts
pnpm run typecheck
git diff --check
```

Before implementation the public view check failed with `Error: Missing truthful SDK launch type`. An initial module-scope assertion produced only the manager's generic `Extension exited`; moving the assertion into the mounted fixture made the same missing-member failure observable without changing production error handling. Final focused result: **8/8 passed**, including the earlier environment checks. Typecheck exits **0**. Wider regressions: **166 passed / 3 pre-existing optional skips / 0 failed** (169 tests). The optional skips remain the Kaomoji projection and two explicit-artifact Google Translate/preview integration runs; those unexecuted paths are not accepted. API and private-child/lifecycle, Form/value/date/persistence, LocalStorage/Cache, bundled preference/source and fake-only OAuth checks remain green.

React Doctor 0.9.14 complete isolated before/current scans of exactly the two product files report the same five pre-existing semantic candidates (four lowercase-hook aliases, one factory-constant dependency); rule, severity, message, column and actual source text match, with API lines moving by +2. No new candidate, numerical score, global rule disable, telemetry/supply-chain scan, update or install is claimed. Direct mutation of LaunchType/arguments is source-inspected only; the new public checks prove boot metadata, matching props and provider mutation, not every possible caller mutation. Final custody/save are recorded separately against exact tested bytes.

The new offline first-party commands rebuild the current API/child into temporary directories and use real prepare/approve/enable/start/close paths. Two cold sessions for each of view, no-view and menu-bar check the exact import-time SDK value, top-level launch type, arguments and absent optional launch values. Editing process variables after import cannot change the boot snapshot. A separate fixture checks missing providers, both valid enum values, mutation of the supplied object, seven invalid values and preservation of the previous identity and Cache provider after rejection. No network, privileged native effect or selected third-party command executes. Cleanup asserts complete managed process-group `ESRCH`, not just a wrapper exit.

```text
/tmp/tockteam-command-launch.8qDzXxsm
```

Frozen owned source/test bytes are recorded in `source-frozen.json`. The conductor's independent source-review artifact is:

```text
/Users/taowang/.pi/agent/sessions/--Users-taowang-projects-tockteam--/subagent-artifacts/outputs/4678dd6c-01a6-43bf-b33c-147672788d68/conductor/launch-type-review.md
```

## Custody and Remaining Work

Owned paths: `src/trusted-raycast-compat-api.ts`, `src/user-raycast-child.ts`, `tests/user-raycast-launch.test.ts`, and this report. The source/test checkpoint is frozen while peer `01a10187` owns TockTutor inline-Properties source/tests, generated output and separately reserved root checks/build/staging/display. Their evidence is not SDK acceptance. No protected TockTutor/gallery bytes are edited or staged here, and no worktree, dependency install, account/Keychain operation, OS input, direct GUI launch, installed smoke or push occurs.

Beads child `tockteam-qwzg.8.2.5` closes only after the exact tested four-path save and byte/cleanup checks. Parent `.8.2`, Forms `.8.3`, expanded Tinycast `.8`, historical provider cleanup and final release `.7` remain open. Full compatibility requires the remaining measured behavior ledger and owned Desktop/installed proofs, not API exports or this subset. Rebuild and restart Electron before using new source in an already running application.
