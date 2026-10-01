# Plan: User-Installable Raycast Compatibility in TockLauncher

## Decision and Problem

The owner wants people to choose and install Raycast extensions according to their own needs, with the broadest practical Raycast API coverage. The owner chose **an independently written implementation** (study Tinycast but do not copy its AGPL-3.0 code) and **trusted-local-app execution** for user-selected extensions after an explicit warning/approval. Planning authorization alone did not permit third-party execution. Later, the owner separately approved a disposable build/run proof for `uuid-generator/generate` at exactly `fcdf2a980e3cecb07787cc44c4d5d1118e384311`; no broader approval follows from it.

At the planning baseline, TockLauncher shipped three exact, reviewed archives (Google Translate, Kaomoji Search, Can I Use). `src/trusted-raycast-descriptors.ts`, `src/trusted-raycast-child.ts`, and `src/trusted-raycast-contract.ts` reject other identities, commands, manifests and effects. `src/trusted-raycast-manager.ts` runs an owned Node child, but that process is **not** an OS sandbox. `src/launcher.ts` and `src/trusted-raycast-renderer.ts` accept inert projections, not arbitrary React or Node in the sandboxed renderer. Existing DSH marketplace transactions concern DSH bundles, not a second general Raycast/DSH plugin system.

Tinycast's local checkout at `6fc6aa1` is a behavior reference, not code to port: its JavaScriptCore/SwiftUI host differs from Electron/Node and still rejects `AI`, `BrowserExtension`, `WindowManagement`, some Node functions and other APIs. SuperCmd offers a broader but unsafe privileged-renderer reference. Neither proves universal Store compatibility.

## User-Visible Outcome

A macOS Desktop user can select a real extension, inspect its source/version and requested capabilities, explicitly accept that it runs as a local program with account-level file/network/process access, install/enable only that extension, run supported commands, and disable/remove/roll back it without losing the three existing features. The UI reports **tested**, **untested**, or **unsupported with reason** for each command; installation never implies guaranteed compatibility. Add API families in measured order as real extensions expose gaps.

## Boundaries and Decisions

1. **Ownership:** Extend Desktop's existing trusted child/admission/IPC/persistence seams. Never evaluate extension source in a launcher or workbench renderer, pass raw IPC, provide `ctx.web`, grant DSH session/workspace/agent authority, or mount user-selected Raycast code as Cordis plugins. Keep Web/TUI unsupported for this feature. macOS first; Windows/Linux remain unavailable until separately evidenced.
2. **Trust:** Explicit approval **before any untrusted build script, preview execution or command execution**. Show that a separate child does not confine filesystem, process or network access. No automatic install, execution, enablement or background refresh on discovery. Do not claim feature-level permission toggles sandbox extension code. Limit child messages, process lifetime and renderer projections to protect TockTeam itself; these limits are not account-level confinement.
3. **Installer:** Prepare one bounded immutable candidate from a user-chosen local built bundle first. Inspect manifest/source, archive paths and symlinks as inert data in a candidate directory; pin digest and provenance. Preview metadata without executing the candidate, then ask approval and apply with journaled current/previous rollback. Code execution during a dynamic compatibility probe, if added, is a separate post-consent action. For online candidates, investigate legitimate upstream download/build terms and the unofficial Store endpoint before choosing a source; do not use the Raycast web Install button as a TockLauncher installer. If a source build needs Node/package tools, their execution needs the same approval; never silently run lifecycle scripts.
4. **Compatibility source of truth:** A versioned, pinned matrix of real extension commands and recorded boot/render/action/native-effect results. Mark unsupported API calls explicitly; never silently stub success. Prioritize by demand across the matrix, not by number of API exports. A compatibility badge means only the tested command/version/platform/effect path.
5. **Data:** Existing three extension IDs, install roots, trust records, preferences, deep links and user disablement remain unchanged. User-selected code gets extension/command-scoped metadata, storage and credentials, independent from DSH Profiles. Installed, approved and enabled are distinct states. Updates require new source/digest review and keep the previous version recoverable.
6. **Licensing:** No Tinycast source, generated JavaScript, artwork or AGPL-derived patch in a proprietary build without separate license clearance. Preserve license notices for individually selected extensions and audit redistribution rights if TockTeam ever redistributes binaries. Reading behavior and writing an original implementation is the chosen route; get legal review for uncertain distribution terms.

## Testing and Stop Gates

- **Highest practical seam:** Disposable macOS profile + owned guarded Electron instance running one pinned real extension through launcher search → action → child → inert UI/native effect, checked against controlled fixtures. Static import counts, unit tests or a booting view alone are not behavioral parity.
- **Small tests first:** `node --test tests/trusted-raycast-*.test.ts` and focused launcher IPC/renderer tests; run `pnpm typecheck`, `pnpm test`, `pnpm run build` after code changes. Add one regression per API behavior/ownership edge before the fix (TDD).
- **Installed evidence:** Only after focused gates, run one bounded disposable installed macOS smoke if its GUI launch path can use the guarded extended display. Record 1512 × 949 CSS / 2× geometry for screenshots, exact mode/route/errors, owned root PID and descendant cleanup. Existing shell scripts that spawn Electron directly are not permitted under the guard. Do not touch the user's Keychain, clipboard, Raycast installation or active app in tests.
- **Release stops:** Any pre-approval code execution, traversal/unbounded download, silent API no-op, installer update deleting prior user state, renderer Node/IPC authority, DSH agent/session bridge, or uncleaned owned child blocks release. A Store/API/terms change blocks the online adapter until re-reviewed. Publish a measured coverage report, not an all-extensions promise.

## Vertical Slices

### 1. Pin a Real-Extension Compatibility Matrix — `tockteam-qwzg.1`

Use the existing three bundles plus varied pinned public commands (at least ten total; include view, no-view, menu, OAuth, native-dependency cases). Identify manifest/API usage and safe test fixtures. Record which command **boots**, **renders**, **actions work** and **effects work**, separately; report missing APIs and provenance. No third-party execution in the user's profile. Acceptance: reproducible matrix and a short ranked next-capability list. Verification: read-only source/digest checks and an offline deterministic matrix check; use an isolated disposable profile for any dynamic run.

### 2. Approve and Open One Local Built View Command — `tockteam-qwzg.2` (after 1)

Let the user choose one already-built extension folder and see an inert metadata/rights preview. Stage exact bounded bytes with safe paths; after explicit account-level warning/approval, run one pinned List/Action view command in an owned child. Reuse the existing lifecycle where it fits; evolve fixed descriptors only after preserving their compatibility identities. Disable/remove/rollback and owner teardown must work. Acceptance: a real selected command opens; invalid candidate, denied approval and cancelled install execute nothing; existing three still work. Verification: candidate/rotation tests, guarded IPC/UI flow and full child-tree cleanup.

### 3. Run One No-View Command and Its Measured APIs — `tockteam-qwzg.3` (after 2)

Add only the APIs exercised by a pinned no-view sample (e.g. preference read, namespaced storage, feedback and one reviewed native effect). Generalize the child protocol and bounded projection as needed rather than adding one-off checks in each caller. Acceptance: cross-extension data separation, visible unsupported errors, ownership/cancellation and no-view completion under guarded execution. Verification: offline sample fixture plus real disposable child and focused lifecycle tests.

### 4. Install One Chosen Registry Extension and Update It — `tockteam-qwzg.4` (after 3)

Research the actual distribution channel and rights first; fetch **only a selected extension**, pin immutable source bytes/commit and exact output manifest, then use the same metadata-preview/approval/current-previous path. If source compilation is necessary, warn before any executable toolchain step. Acceptance: chosen extension installs without Raycast; source drift, offline failure, denied build and interrupted update preserve the current version and user data. Verification: local server fixture for network failures, digest/path tests, and a guarded end-to-end install/rollback.

### 5. Add One Measured Menu/Refresh Command — `tockteam-qwzg.5` (after 4)

If the matrix ranks another API family above menu commands, re-scope this issue before code. Otherwise support one real menu command with explicit activation, bounded refresh and full disable/update/quit teardown. Acceptance: installation alone never starts it; no stale menu rows, timers or children survive disable. Verification: menu lifecycle tests and guarded app-state proof; native-menu interaction is unverified unless an allowed app-scoped driver can exercise it without OS-level cursor/input automation.

### 6. Add One Feasible PKCE Command — `tockteam-qwzg.6` (after 4)

Use one pinned OAuth sample whose provider permits a TockTeam-owned redirect. Store per-extension secrets outside renderer; cancellation and uninstall remove owned tokens. **Do not take over `raycast:` or `com.raycast:` URL schemes** or promise compatibility with provider registrations that accept only Raycast callbacks. Acceptance: one working approved login with safe cleanup, or an explicit documented incompatibility for the chosen provider and a replacement sample. Verification: fake provider/redirect and mock credential-store tests first; any real OAuth/Keychain proof requires separate immediate user permission and must never reset the user's Keychain.

### 7. Publish Coverage and Installed-Release Evidence — `tockteam-qwzg.7` (after 5 and 6, unless deliberately descoped)

Retest the pinned matrix on the final build/disposable install; update `.agents/references/tocklauncher.md` only after behavior changes, reconcile notices/licensing and provide exact unsupported reasons. Acceptance: existing three remain supported with settings preserved; per-command measured status, safe process cleanup, and no unsupported-platform claims. Verification: full source gates and one permitted guarded installed Desktop proof; environment-blocked checks stay explicitly unverified.

**Original proof dependency shape:** `1 → 2 → 3 → 4 → {5, 6} → 7`. The expanded owner-approved target below supersedes the original demand-based stopping rule; historical slice completion is not proof of that broader scope. No website is required for the first usable self-install path.

## Measured Progress — 2026-09-29

Slices 1–3 are complete with separate pinned view and no-view proofs; see `.beads/reports/2026-09-29-raycast-compatibility-baseline.md`, `.beads/reports/2026-09-29-raycast-local-view-proof.md`, and `.beads/reports/2026-09-29-raycast-no-view-proof.md`. Slice 4's public-source GitHub admission, rate-limit fallback, isolated build, separate approvals, Desktop-only UI/IPC, reversible update and fixture-only approved command proof are implemented; see `.beads/reports/2026-09-29-raycast-public-source-proof.md`. Its 14 focused tests, root typecheck, build and quick stage passed; before the unrelated Mermaid edits, the full root suite passed with 1,571 tests passing and 18 skipped. After the owner explicitly allowed a one-time test window to take focus, the guarded Desktop review/build/install/enable/command/rollback pass succeeded in a disposable profile, including one fixture-only UUIDv4 copy and one history entry. The owned Electron process tree fully stopped. Native approval dialogs were exact-digest fixture interceptions, and the earlier live source fetch did not occur inside this rendered pass; installed-release behavior remains unverified. See the proof report and screenshot. Slice 5's pinned Color Picker saved-colors menu, private refresh, fixture-only copy and Desktop activation/disable passed focused and guarded app-state checks; see `.beads/reports/2026-09-29-raycast-color-picker-menu.md` and its screenshot. The final shared root suite passed with 1,577 tests and 18 skips. The native macOS menu was not clicked or photographed, and the system picker remains unsupported. Slices 6–7 are not claimed or verified. The current sample Notion login uses a Raycast-only OAuth gateway, and the sample Spotify client ID uses Raycast's registered web redirect; neither demonstrates a TockTeam-owned callback.

## Risks and Honest Limits

- **Broad API coverage vs. safety:** User accepted local-app authority. Source/package dependencies can still do anything the account can do after approval; a child process is crash/lifecycle isolation, not a sandbox.
- **Store source and rights:** Raycast's site installs into Raycast; the unofficial download endpoint and prebuilt availability can change. Verify terms and metadata before building an adapter; fallback to user-selected local bundles when uncertain.
- **Nonportable services:** Raycast-only AI proxy, browser integration, window APIs, OAuth redirects and native helper binaries may remain incompatible even if imports resolve. Report them rather than faking success.
- **Project coexistence:** The DSH marketplace retains its Loader/Profile ownership. The launcher extension installer is a Desktop-owned compatibility path, not a generic second application/plugin system. Keep external changes to the user-specified extension roots; do not change existing TockTeam data roots or Raycast's files.

## Beads

- Epic: `tockteam-qwzg` (open; resumed and claimed for the owner-approved expansion).
- Historical proof slices: `tockteam-qwzg.1` through `tockteam-qwzg.7`.
- Expanded Tinycast target: `tockteam-qwzg.8`; first claimed source slice: `tockteam-qwzg.8.1` (view data and declared preferences). Beads remains the task/status source of truth.

## Expanded Owner-Approved Target — 2026-10-01

The owner selected **Tinycast's documented macOS compatibility scope**, not universal Raycast Store compatibility. The behavior reference is `/Users/taowang/research/launcher/tinycast` at `6fc6aa1b909ca24e3cd25e35c078a7c808ca34a9`; `docs/features/extensions.md` takes precedence over its older website compatibility page. Its public API pin is `@raycast/api` **2.0.3**. Tinycast's historical 32/37-extension and 114/147-view-command boot/render counts are not TockLauncher evidence and do not prove actions or effects.

After a separate plain-language callback-ownership explanation, the owner selected **Leave Raycast Alone (Recommended)**. Do not register/take over `raycast://` or `com.raycast://` sign-in links. Independent provider-approved callbacks remain in scope; sign-ins that require those handler claims are an explicitly approved compatibility exception. This decision does not authorize a real sign-in, provider cleanup, account access, credentials, Keychain use, or changing this Mac's settings. The existing Linear cleanup gate (`tockteam-qwzg.6.6`) stays blocked and unverified.

### Supported Behavior and Exclusions

Extend the existing approved Desktop child, installer, bounded inert renderer and finite main-owned adapters. Do not add JavaScriptCore, a second launcher/plugin/agent system, a UI/theme layer or a dependency just to mirror Tinycast's implementation. Preserve the three pinned bundled identities and all existing user data/disablement. Reading Tinycast behavior is permitted; no AGPL implementation, generated runtime or artwork is imported. Source/build/runtime approval stays distinct and exact-digest-bound.

The target includes List/Grid sections, empty states, details, dropdowns, filtering and selection; Detail markdown/metadata; every documented Form field and controlled/default/ref/validation/submission behavior; ActionPanel sections/submenus/shortcuts and convenience/legacy Action variants; preserved navigation state; storage, Cache, preferences, feedback and environment; app/file/clipboard/selection effects; command arguments/context/metadata; chosen installs/assets/native helpers; explicit menu activation/background refresh; and provider-approved PKCE with per-extension credential ownership.

Tinycast-excluded Raycast AI/browser/window services, its non-PKCE sign-in proxy and tool/AI entry points remain explicitly unsupported. TockLauncher already uses real Node: do not regress working streams, sockets, WebAssembly or cancellation merely to reproduce JavaScriptCore limits. Wider Node support still needs measured lifecycle/command evidence, not an import-count claim.

### Implementation Order and Acceptance

**View Data and Declared Preferences (`tockteam-qwzg.8.1`).** Configure the existing private storage/HUD for view commands and return only selected-extension manifest defaults, including names also used by bundled extensions. Prove save/reopen, extension separation, command-default precedence, false-valued defaults and HUD feedback through approved fake-only child fixtures. Preserve bundled behavior, storage custody and cleanup. Two new private behavior probes already fail both defects; the existing focused baseline passes 28/28.

**Remaining SDK Behavior.** Complete typed LocalStorage/all-items, Cache subscriptions/namespaces, declared preference editing, environment paths/appearance/context and feedback contracts without changing existing data interpretation silently. Any persistence migration or sensitive preference/native effect needs its own reviewed slice and test-first check.

**Forms, Then Collections and Detail.** Carry bounded revision-owned field/blur/selection events through the existing contract/child/manager/renderer. Prove text/password/textarea/checkbox first, then dropdown/tag/date/file fields and refs, including controlled updates, draft/focus preservation, validation and typed submission. Follow with default/custom filtering, selection, sections, metadata, markdown and validated images/assets. Functions never reach the renderer; no arbitrary HTML/file URL/script/network authority is added. Verify visible bounded paging, keyboard and empty/loading/error states.

**Navigation and Actions.** Preserve mounted React view state across push/pop; implement root/clear/close, global/item actions, shortcuts, submenus and documented legacy variants. Async actions remain owned by their source session/revision. Stale/repeated handles cannot affect another command, and native success callbacks await real outcomes.

**Native Effects.** Extend finite main-owned clipboard/app/file/selection adapters, never renderer-selected generic paths/process/IPC. Separate read and mutation admission/cancellation/lifecycle tests. Use controlled fixtures; unavoidable OS input, account/clipboard/Keychain changes require fresh immediate authority and an allowed verification path. Confirm destructive actions or retain recovery. Environment-blocked effects remain unverified, not passed.

**Installed Commands, Preferences and Assets.** Reuse prepare/review/approved build/built approval/apply/enable/previous recovery for multiple extensions/commands, arguments/preferences/context and safe asset/helper resolution. Preserve selected-install data, bounded no-follow file/archive admission, helper identity and explicit build consent. Source/build/helper failures retain the current version; no arbitrary lifecycle script executes silently.

**Generic Menus and Refresh.** Generalize the existing Color-Picker-only projection through the Desktop menu owner. Prove sections/submenus, async actions, metadata/context and explicitly activated bounded/coalesced refresh. Installation alone runs nothing; disable/update/quit drains menus, timers and groups. Late callbacks never cross extension ownership.

**PKCE and Final Evidence.** Generalize only provider-approved independent callbacks, owned secrets and cancel/uninstall behavior, without hijacking Raycast links or concealing the Linear warning. Retest the complete versioned behavior ledger and pinned real-command matrix on the final owned Desktop build/disposable install. Keep boot/render/action/effect results separate. `tockteam-qwzg.7` waits for `tockteam-qwzg.8` and the original OAuth gate; no full-scope claim until supported paths are verified or an exception is explicitly accepted.

Each implementation slice receives a Beads child and a failing public behavior check before code. Split further whenever native effects, migration or unrelated UI ownership would otherwise share a large change. Closed historical slices remain limited proofs, not completion of this expansion.

### Verification and Shared-Checkout Barriers

Use independently written fake-only fixtures, temp-only first-party runtime builds and focused `node --test` checks first; no selected third-party command/account/native effect follows from this expansion alone. Run exact focused/bundled/lifecycle regressions and `pnpm run typecheck` for each source slice. Actual visible UI changes need guarded extended-display Electron/CDP proof, semantic DSH tokens, exact geometry/theme/mode/content/error evidence, allowlisted screenshot publication and full owned-tree cleanup. Never run legacy direct-GUI-launch harnesses.

Reserve shared root tests/build/staging/generated output, index/commit and display separately. Run `pnpm test`, `pnpm run build`, staging and one final permitted installed smoke only at coordinated final barriers. Preserve the Properties session's source/tests/generated outputs and protected-test ownership, keep one source writer per shared checkout, make scoped commits, and never create a worktree or push. A writer lease, unavailable driver, missing consent or provider prerequisite blocks that operation; it never authorizes bypassing a boundary or claiming compatibility.

### Form Value Collection Checkpoint

`tockteam-qwzg.8.3.1` completes only the shared API foundation: basic first defaults and controlled string/boolean values, per-form ownership, basic-field unmount, prototype-safe submission and false/rejected-submit outcomes. The durable public child check failed 5/6 before code; final focused checks passed 74/74, fake-only OAuth cleanup passed 20/20 and typecheck passed. See `.beads/reports/2026-10-01-raycast-form-values.md` for exact commands, hashes, process cleanup and the recovered read-only verifier timeout.

This API-only checkpoint does not complete `tockteam-qwzg.8.3`. Its transport/render requirements were subsequently addressed for basic fields by the checkpoint below; picker and richer value/persistence slices still remain. No installed or full-scope claim follows from the API-only checkpoint.

### Basic Form Editing and Native Rendering Checkpoint

`tockteam-qwzg.8.3.2` completes only text/password/textarea/checkbox editing: owned session/revision/request-bounded callbacks, typed focus/blur, asynchronous controlled updates, reset/focus refs, main IPC acknowledgement, native drafts/caret/focus preservation, accessible error and rejected-submit recovery, and keyboard submission after pending edits. Native backpressure bounds the backlog to 32 callbacks without dropping accepted edits. No field event acquires action or native-effect authority.

Fresh focused checks passed 35/35, Raycast/launcher regressions passed 408 with 6 optional skips, and the root suite passed 1,638 with 18 optional skips; typecheck, root build and quick stage passed. A guarded real Desktop first-party offline fixture proved defaults, rejected submit, reset/focus, exact typed pending-edit keyboard submission and bounded input. Eight product palettes passed text/checked-mark contrast, inherited-font/focus and narrow-field checks; four allowlisted 1512 × 949 CSS / 3024 × 1898 device-pixel, unskinned dark screenshots were published under `.beads/reports/2026-10-01-raycast-basic-form-editing`. All owned app/runtime trees and browser sessions stopped, the recorded fixture-group audit passed, and 1,142 protected-path hashes stayed unchanged.

This still does not complete `.8.3` or `.8`: dropdown/tag/date/file values, persistence and richer field behavior, broader collection/detail/navigation/actions, remaining SDK/native behavior, and the final installed compatibility proof remain open. No real account, provider sign-in, Raycast URL takeover, installed smoke, push or full-compatibility claim occurred.
