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

**Dependency shape:** `1 → 2 → 3 → 4 → {5, 6} → 7`. Stop at any checkpoint if demand/compatibility gain does not justify the next API family. No website is required for the first usable self-install path.

## Measured Progress — 2026-09-29

Slices 1–3 are complete with separate pinned view and no-view proofs; see `.beads/reports/2026-09-29-raycast-compatibility-baseline.md`, `.beads/reports/2026-09-29-raycast-local-view-proof.md`, and `.beads/reports/2026-09-29-raycast-no-view-proof.md`. Slice 4's public-source GitHub admission, rate-limit fallback, isolated build, separate approvals, Desktop-only UI/IPC, reversible update and fixture-only approved command proof are implemented; see `.beads/reports/2026-09-29-raycast-public-source-proof.md`. Its 14 focused tests, root typecheck, build and quick stage passed; before the unrelated Mermaid edits, the full root suite passed with 1,571 tests passing and 18 skipped. After the owner explicitly allowed a one-time test window to take focus, the guarded Desktop review/build/install/enable/command/rollback pass succeeded in a disposable profile, including one fixture-only UUIDv4 copy and one history entry. The owned Electron process tree fully stopped. Native approval dialogs were exact-digest fixture interceptions, and the earlier live source fetch did not occur inside this rendered pass; installed-release behavior remains unverified. See the proof report and screenshot. Slices 5–7 are not claimed or verified. The current sample Notion login uses a Raycast-only OAuth gateway, and the sample Spotify client ID uses Raycast's registered web redirect; neither demonstrates a TockTeam-owned callback.

## Risks and Honest Limits

- **Broad API coverage vs. safety:** User accepted local-app authority. Source/package dependencies can still do anything the account can do after approval; a child process is crash/lifecycle isolation, not a sandbox.
- **Store source and rights:** Raycast's site installs into Raycast; the unofficial download endpoint and prebuilt availability can change. Verify terms and metadata before building an adapter; fallback to user-selected local bundles when uncertain.
- **Nonportable services:** Raycast-only AI proxy, browser integration, window APIs, OAuth redirects and native helper binaries may remain incompatible even if imports resolve. Report them rather than faking success.
- **Project coexistence:** The DSH marketplace retains its Loader/Profile ownership. The launcher extension installer is a Desktop-owned compatibility path, not a generic second application/plugin system. Keep external changes to the user-specified extension roots; do not change existing TockTeam data roots or Raycast's files.

## Beads

- Epic: `tockteam-qwzg` (open; implementation is not yet claimed).
- Child issues: `tockteam-qwzg.1` through `tockteam-qwzg.7`, matching the slices above. Review this plan before implementation, and claim only the first ready slice after authorization.
