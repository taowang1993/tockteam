# Raycast View Data and Declared Preferences

Date: 2026-10-01. Task: `tockteam-qwzg.8.1`. Source baseline: `bfc6f757`.

## Scope and Result

The owner selected Tinycast's documented macOS compatibility at revision `6fc6aa1b909ca24e3cd25e35c078a7c808ca34a9`, excluding its unsupported Raycast-only services. After a separate explanation, the owner selected **Leave Raycast Alone (Recommended)**: no `raycast://` or `com.raycast://` handler takeover. The expanded plan records that explicit sign-in exception. Full Tinycast-equivalent support is **not complete**; forms, collections/details, navigation/actions, native effects, additional SDK/data behavior, installation/assets, generic menus and independent PKCE still need their measured implementation slices. The unresolved Linear cleanup warning remains unverified and unchanged.

This source-only slice fixes two shared SDK behaviors without adding dependencies, renderer/IPC authority, data migration or another composition mechanism. **Confirmed compatibility findings: 2; both fixed and verified in approved first-party child fixtures.**

1. **Medium — View Commands Could Not Save Private Data or Report HUD Feedback.** `src/user-raycast-child.ts` configured `LocalStorage` and HUD only for no-view/menu commands. A normal view effect using the exported storage API terminated the child. The fix supplies the already extension-scoped storage/feedback adapters for every admitted mode. The fixture saves `Saved View 1`, closes/reopens to `Saved View 2`, then verifies a second extension starts independently at `Saved View 1`; each shows matching HUD feedback. Status: fixed; focused runtime test passes.
2. **Medium — Selected Extensions Inherited Bundled Preference Defaults.** `src/trusted-raycast-compat-api.ts` injected Translate defaults into all non-Kaomoji identities, including unrelated selected extensions. The fix returns only the selected-command manifest preferences when running in the existing user-child context, preserving the bundled path. Fixtures prove exact `{"flag":false,"prefix":"command"}` defaults, command-over-extension precedence and both bundled-name collisions. Status: fixed; focused runtime test passes.

## Test-First Evidence

The private initial probes failed **0/2**. The durable `tests/user-raycast-view-data.test.ts` then failed **0/2** before production edits, reproducing both findings. After the two small shared changes, the focused gate passed **32/32**, including private data isolation/reopen, Cache namespaces, existing view/no-view/menu behavior, installer approvals/recovery, source-build admission, owner IPC, renderer projections and bundled Translate preference custody. Fake-only OAuth cleanup regressions passed **20/20**, including the existing HTTP-401 diagnostic and bounded shutdown cases. Root typecheck exited **0**.

Exact commands:

```sh
node --test --test-reporter=tap tests/user-raycast-view-data.test.ts
node --test --test-concurrency=1 --test-reporter=tap tests/user-raycast-view-data.test.ts tests/user-raycast-runtime.test.ts tests/user-raycast-cache.test.ts tests/user-raycast-install.test.ts tests/user-raycast-ipc.test.ts tests/user-raycast-renderer.test.ts tests/user-raycast-source-build.test.ts tests/trusted-raycast-preferences.test.ts
node --test --test-concurrency=1 --test-name-pattern='cleanup details|first-party OAuth cleanup|mocked shutdown' tests/user-raycast-oauth-cleanup.test.ts tests/user-raycast-oauth-runtime.test.ts
pnpm run typecheck
git diff --check -- src/trusted-raycast-compat-api.ts src/user-raycast-child.ts tests/user-raycast-view-data.test.ts .beads/plans/2026-09-29-user-installable-raycast-compatibility.md .beads/reports/2026-10-01-raycast-view-data.md
```

React Doctor before/after commands exited 0 but skipped the detected browser workspaces: no applicable changed browser source was scanned. This is **not a React score or rendered proof**. No React component/layout/style was changed in this backend slice. An unscoped whitespace check found pre-existing trailing whitespace in protected `AGENTS.md`; the owned-path check passes and that user-owned file was not touched.

The final view-data test reports stopped groups `81431, 81433, 81435, 81437, 81439, 81441`. The Cache regression reports eight additional stopped groups; the OAuth regression reports all fifteen owned groups stopped. Parent independent checks cover every group recorded in the RED/focused/OAuth logs. Fixture roots are removed only after manager/group teardown succeeds. No third-party extension, real provider request/account/sign-in, clipboard/Keychain mutation or URL-handler change was executed. Existing reviewed runtime dependencies were used only by independently written private fixtures.

Sanitized logs, source protection snapshot and inert SDK reference:

```text
/tmp/tockteam-raycast-scope.5lIcfC
```

The pinned public MIT `@raycast/api@2.0.3` archive matches Tinycast's exact npm lock SHA-512; only its inert declarations were extracted for behavior reference. It was never installed or executed and no SDK/Tinycast implementation was imported. An initial 32-MiB fetch ceiling rejected the 37,927,616-byte archive before any file write; the successful digest-verified fetch used an explicit 96-MiB ceiling.

## Ownership and Remaining Gates

The Properties peer granted a bounded sole-source/index window after `bfc6f757`. Only the two API/child source files, new focused test, Raycast plan and this report belong to the slice. All **2,331 unrelated tracked files** match the before-write hashes, including all TockTutor source/generated outputs and protected `AGENTS.md`, layout and linked-pane tests. Pre-existing untracked Playwright artifacts are left unstaged. No root build/stage/generated-output write, product GUI, installed smoke, index takeover or push occurred.

A guarded availability **inspection**, before this source slot, briefly ran a generic Electron placement probe on non-main Sidecar display 17. The tool stopped root `80269` and descendants `80452, 80453`, with `remaining: []`; it was not TockTeam, no product interaction/screenshot was captured, and it proves no product behavior. A product display slot is still a separate coordination gate.

The shared frozen/installed Desktop remains unchanged. There is no new product screenshot and no end-to-end/installed/full-compatibility claim. Final UI/real-command evidence, root test/build/stage and installed gates remain open on `tockteam-qwzg.8`/`.7`; account-sensitive work additionally requires fresh immediate consent. Restart Electron only after the later coordinated build/stage updates its runtime.
