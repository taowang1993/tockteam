# Plan: Dedicated Settings Pages for Every TockLauncher Extension

Date: 2026-09-20

Status: Implemented and verified. See [verification report](../reports/2026-09-20-launcher-extension-settings.md). The remaining text preserves the original planning record; Beads owns current implementation status.

Beads epic: `tockteam-u104`

## Problem

TockLauncher settings are organized primarily by provider family, with enablement separated from configuration. The three reviewed Raycast compatibility extensions have another command-oriented preferences path. Users cannot consistently select an extension and find all of its settings without running it.

The supplied Raycast Google Translate screenshot illustrates the desired experience: one identifiable extension, its enablement, and its related preferences in one place. Its working HTTP proxy setting also demonstrates why advanced configuration must remain discoverable even when automatic behavior normally works.

## Solution and Scope

Give **every supported TockLauncher extension its own settings destination** within the existing TockTeam workbench settings:

`Settings → TockLauncher → Extensions → <Extension>`

Use one shared directory/detail layout, reusable simple-field rendering and the existing specialized editors. Do not hand-build 27 unrelated pages.

“All plugins” means the 24 built-in launcher providers plus the three reviewed compatibility artifacts: **27 destinations today**, including disabled extensions, extensions with no preferences, and extensions unavailable on the current platform. This does not include unrelated DSH/TockTutor plugins or arbitrary Raycast Store extensions.

The identity catalog and coverage tests must derive their expected membership from existing composition/descriptors, not a permanently hard-coded count. Future admitted extensions get the standard detail layout through registration; ordinary preferences require reviewed field metadata, not a new page component. Runtime installation of unknown plugins remains unsupported.

## Experience

- Keep one TockLauncher entry in canonical Settings. Inside it, distinguish global settings from a searchable Extensions directory; do not add 27 top-level sidebar entries.
- The directory shows name, icon and honest availability/enablement. Search finds extension names and their setting labels. Selecting a matching setting opens its owning page.
- Each page has a compact identity header, description, real enabled state, grouped preferences and a clear Back action. Avoid copying the screenshot's large decorative header at the expense of form space.
- Extensions with no preferences still have a page with supported enablement/status and the sentence “This extension has no additional settings.” Do not invent options to fill the page.
- Platform-unavailable pages explain the limitation. Preserve saved values and the existing policy for compatibility data; do not pretend disabled controls enable unsupported behavior.
- Disabled extensions remain configurable. Opening or editing a page must not start a child, invoke a command, read selected text, install an artifact or enable it implicitly.
- Add **Extension Settings** to extension-owned launcher results and active compatibility-command actions. It opens the corresponding canonical page. Keep Ctrl/Cmd+, as the existing global settings shortcut.
- Preserve keyboard navigation, visible focus, focus restoration, English/Chinese localization and responsive reflow. UI labels use Title Case; explanatory sentences use sentence case.
- Use existing save behavior: immediate validated choices and committed text drafts. Show saving, saved and failure states. Navigation retains dirty/rejected drafts per extension; it cannot apply a late save response to another extension's fields. Leaving Settings with unsaved drafts requires explicit discard or staying to correct them.

### Google Translate

Group its existing preferences into **Languages**, **Behavior** and **Network**. Preserve source/primary/secondary language, selected-text input, default action and result ordering. Label language defaults separately from existing saved language sets; do not reset cached language sets to make preference changes appear effective.

Network settings default to **Use System Proxy**. A manual HTTP/HTTPS proxy override belongs under **Advanced**. Clearing it restores the existing main-resolved behavior. Never copy Astar's current port into a default or persist a detected system proxy. Do not expose discovered proxy rules or credentials in renderer snapshots.

## Existing Seams and Ownership

| Module | Current Responsibility | Planned Reuse |
| --- | --- | --- |
| `src/launcher-settings.tsx` | One `tocklauncher` settings slot, snapshots, write queue and global/provider sections | Keep the same slot and common state owner; replace family navigation with directory/detail selection |
| `src/launcher-contract.ts` | The 24 finite built-in identities | Source of built-in page membership; preserve IDs |
| `src/trusted-raycast-descriptors.ts` | Three admitted artifact identities | Source of compatibility-page membership; not runtime manifest loading |
| `src/launcher-setting-catalog.ts` | Generated reviewed settings provenance, applicability and defaults | Reuse mappings; do not hand-edit generated provenance or mistake it for a complete UI schema |
| `src/launcher-settings-model.ts`, `src/launcher-settings-contract.ts` | Effective/status/internal dispositions and validated settings | Preserve validation and explicit ownership of every setting |
| `src/launcher-setting-field.tsx`, `src/launcher-settings-drafts*`, `src/launcher-settings-write-queue.ts` | Shared controls, draft reconciliation and save ordering | Retain for all simple fields and navigation-safe draft behavior |
| `src/launcher-{local,discovery,file-search,network,terminal,workflow}-settings.tsx` | Existing family editors | Reuse/move the relevant editor fragments; retain structured/native controls |
| `src/trusted-raycast-{contract,preferences,kaomoji-preferences}.ts` and Can I Use preference modules | Validated compatibility preferences and existing stores | One authoritative read/save path per artifact, shared by inline and canonical settings |
| `src/contracts.ts`, `src/preload.ts`, `src/main.ts`, `src/client.ts` | Workbench bridge and validated `show-settings` navigation | Add only bounded settings operations and a finite extension destination |
| `src/trusted-raycast-ipc.ts` | Launcher-role-only command/trust handlers | Keep its guard intact; do not let the workbench masquerade as the launcher |

### Implementation Decisions

1. **A small finite catalog, not a new plugin framework.** Proposed `src/launcher-extension-settings.ts` holds reviewed presentation/field ownership; a companion `.tsx` supplies the common layout. Reuse existing IDs, labels, icons, defaults and validators. Catalog entries contain inert metadata and explicitly registered first-party editors, never downloaded code or arbitrary field callbacks.
2. **Simple fields are reusable; complex editors stay specialized.** Standard text, numbers, booleans and finite selects share rendering. Workflow steps, folder selection, secret entry, UUID formats and custom searches keep their existing bounded editors. Do not introduce a general schema engine or a dependency solely to render forms.
3. **One owner for each setting.** Provider-specific controls move to the corresponding page; old family forms disappear as they are migrated. Global search, appearance, keyboard, lifecycle, browser selection and storage remain global. Cross-cutting settings get links to their canonical owner, not duplicate editors or stores. DeepL's existing write-only API-key control moves with DeepL.
4. **No data migration merely for navigation.** Keep all settings keys, files, trust state and cached data. Translate retains its unsuffixed compatibility filenames; Kaomoji and Can I Use retain theirs. Existing import/export/reset scope remains unchanged and must not be relabeled as covering additional compatibility data.
5. **Separate presentation from persistence authority.** Built-ins continue through existing workbench `launcher.settings` reads/updates. Add narrow workbench-owned operations for the three finite compatibility IDs, validated payloads and bounded sanitized results. Main chooses stores and paths. Reuse trust services for enabled state rather than writing trust files or treating installed and enabled as equivalent.
6. **Opening settings never executes extension source.** Build-time reviewed metadata/catalogs provide controls and language/target choices. A preferences read cannot spawn a child, import artifact code or probe a user workspace. A removed/unavailable compatibility artifact gets honest status and the existing explicit setup/recovery route; page navigation never reinstalls it.
7. **Save and runtime lifecycle agree.** Reuse main serialization and extend it only as needed for per-extension preference conflicts. Workbench saves carry an expected revision; all writers, including inline preferences, participate in the same ownership/conflict policy. Stale edits preserve the user's draft and offer refresh/retry instead of silently overwriting newer values. Compatibility changes apply on the next invocation; show that explicitly and do not restart an active command unexpectedly. Existing built-in invalidation/rescan behavior is retained.
8. **Navigation is data, not authority.** The final contextual-entry slice extends `show-settings` with an optional validated extension destination and carries it through existing workbench readiness/section selection. Unknown destinations fall back safely to the directory. No arbitrary URLs, paths, channels or renderer-selected command-open API are added.
9. **No secrets in form metadata or snapshots.** DeepL remains encrypted and write-only. Existing secret-bearing values must not be echoed into generic fields, errors or logs. Manual proxy input is user-provided configuration, not permission to project detected system configuration or credential-bearing URLs. Reuse existing sensitive-write patterns where necessary; do not add proxy authentication support as incidental scope.

## Complete Coverage

| Slice | IDs / Extensions |
| --- | --- |
| 1: Directory and First Page | `Calculator` plus catalog/destination coverage for every admitted identity |
| 2: Remaining Local Providers | `Base64Conversion`, `ColorConverter`, `PasswordGenerator`, `QuickFormatter`, `RowlandTextEditor`, `UuidGenerator` |
| 3: Discovery and Files | `ApplicationSearch`, `BrowserBookmarks`, `JetBrainsToolbox`, `VSCode`, `FileSearch`, `SimpleFileSearch` |
| 4: Network | `CurrencyConversion`, `CustomWebSearch`, `DeeplTranslator`, `WebSearch` |
| 5: System, Terminal and Workflow | `AppearanceSwitcher`, `SystemCommands`, `SystemSettings`, `TerminalLauncher`, `UeliCommand`, `WindowsControlPanel`, `Workflow` |
| 6: Translate | `google-translate` |
| 7: Kaomoji | `kaomoji-search` |
| 8: Can I Use | `can-i-use` |
| 9: Entry Points and Completion | All of the above |

Coverage tests must also classify every existing reviewed setting as an extension editor, an explicitly global owner, internal state or a documented status/platform disposition. A catalog entry alone is not proof its preferences are editable.

## Testing Decisions

Use TDD for implementation: run the smallest failing behavioral check before changing each slice. Keep the existing `node:test` runner; do not add a test framework.

- Add `tests/launcher-extension-settings.test.ts` for identity/field-owner coverage and finite selection contracts. Existing model, draft, write-queue and provider tests remain regression seams.
- Add focused workbench compatibility-settings IPC tests alongside existing launcher guard tests. Prove wrong sender, malformed payload, extra keys, unknown IDs, stale revision and sensitive-data rejection. Spy on spawn/native effects to prove settings reads/writes do not invoke them.
- Use bounded Playwright component/browser checks for directory selection, actual controls, draft failures, keyboard/back behavior and all 27 pages. Source-string checks alone do not prove the UI.
- Use a bounded Electron/CDP proof for new Desktop bridge operations and contextual navigation. Demonstrate representative saved settings affecting actual provider/compatibility behavior, not just mocked save responses. Use deterministic fixtures where live network access is unrelated to the setting.
- Seed appearance explicitly for canonical captures: dark theme, no active skin. Verify `1512 × 949` CSS pixels at `2×`, resulting in `3024 × 1898` screenshots; record route, selected extension, visible saved/error state, DOM theme facts and console/page errors. Publish only allowlisted screenshots transactionally. Store new verification reports in `.beads/reports`.
- Record launched root PIDs, clean up every app/browser/server/child in `finally`, and verify the full trees stopped. Preserve user HOME/profile; pass `--use-mock-keychain` for temporary macOS Electron. No foreground control without immediate permission.

Commands below that name `launcher-extension-settings.test.ts` refer to the new test introduced in Slice 1. The new compatibility-settings IPC tests introduced in Slice 6 must also run in Slices 7–9.

## Implementation Slices

Beads owns work status and dependencies; the sections below define deliverables rather than a parallel checkbox tracker. All implementation issues remain open pending approval.

### 1. Browse Extensions and Configure Calculator — `tockteam-u104.1`

Build the directory/common page and complete Calculator's edit/save/reopen path. Keep family forms available until their migration slices, without duplicating Calculator's editor.

Acceptance: catalog membership exactly matches all admitted identities; keyboard list/detail/back works; Calculator edits affect real output and survive reopening, while failed drafts survive navigation.

Verification: `node --test tests/launcher-extension-settings.test.ts tests/launcher-settings-*.test.ts`; Playwright directory → Calculator → save → reopen. Dependencies: none. Interface delivered: stable finite extension selection, shared page/field registration, and parent-owned snapshot/draft/save state.

### 2. Move the Other Six Local Providers — `tockteam-u104.2`

Move existing controls to their owning pages, reusing defaults, validation and the bounded UUID editor. Remove the redundant family-form copies.

Acceptance: complete six-page field coverage with no sibling fields; saved values affect provider output; invalid UUID JSON remains editable with an announced error and does not destroy accepted state.

Verification: `node --test tests/launcher-local-*.test.ts tests/launcher-settings-*.test.ts tests/launcher-extension-settings.test.ts`; Playwright Password Generator and UUID invalid-draft flows. Depends on Slice 1.

### 3. Move Discovery and File Search — `tockteam-u104.3`

Reuse discovery/folder editors on six distinct pages. In particular, separate File Search from Simple File Search without changing their differing runtime behavior.

Acceptance: complete six-page field coverage and persistence; honest platform dispositions with retained compatible values; safe folder drafts, rejected saves and external-source changes across navigation/rescans.

Verification: `node --test tests/launcher-discovery*.test.ts tests/launcher-file-search*.test.ts tests/launcher-settings-*.test.ts tests/launcher-extension-settings.test.ts`; Playwright folder edit/reopen and unavailable-platform fixtures. Depends on Slice 1.

### 4. Move Network Providers — `tockteam-u104.4`

Provide four pages and move DeepL's credential control to DeepL while retaining its special write-only encrypted path.

Acceptance: all existing network fields remain effective; secrets remain absent from snapshots/logs/exports and secure-storage failure disables secret writes; malformed custom-search data is recoverable.

Verification: `node --test tests/launcher-network*.test.ts tests/launcher-settings-*.test.ts tests/launcher-extension-settings.test.ts`; Playwright custom-search persistence and DeepL credential-status fixtures. Depends on Slice 1.

### 5. Complete System, Terminal and Workflow Pages — `tockteam-u104.5`

Reuse existing Terminal/Workflow editors. Deliver actual details/status pages for providers that need no preferences, with links for settings owned globally.

Acceptance: all seven pages are reachable, including unavailable/no-options cases; workflow drafts and native confirmations retain their behavior; merely opening settings never invokes a system action.

Verification: `node --test tests/launcher-terminal*.test.ts tests/launcher-workflow*.test.ts tests/launcher-os*.test.ts tests/launcher-extension-settings.test.ts`; Playwright no-options and Workflow edit/cancel/reopen. Depends on Slice 1.

### 6. Configure Google Translate Without Launching It — `tockteam-u104.6`

Ship Translate's complete canonical form together with the narrow workbench preferences/status/enablement bridge. Reuse main's existing stores and trust operations; retain launcher IPC role restrictions. This is intentionally a cross-boundary vertical slice, not a generic bridge project.

Acceptance: reads/edits start no child and imply no installation/enablement; all seven preferences persist with stale-write protection and take effect under the documented next-invocation behavior; malformed/unauthorized operations and sensitive projections are rejected, while existing language sets and system-proxy defaults are preserved.

Verification: `node --test tests/trusted-raycast-*.test.ts tests/launcher-window-ipc.test.ts tests/launcher-extension-settings.test.ts`, plus the new workbench compatibility-settings IPC tests; bounded Desktop save → launch → result proof. Depends on Slice 1. Interface delivered: finite compatibility settings operations with main-owned validation, revision/conflict semantics and sanitized status.

### 7. Configure Kaomoji Search — `tockteam-u104.7`

Use Slice 6's bridge and shared page for display mode and primary action; reuse Kaomoji's defaults and suffixed store.

Acceptance: settings are editable without a child and persist; List/Grid and primary action change the next invocation without changing enablement/cache; inline and canonical edits cannot overwrite newer values silently.

Verification: `node --test tests/trusted-raycast-kaomoji-*.test.ts tests/trusted-raycast-manager.test.ts tests/launcher-extension-settings.test.ts`, plus workbench compatibility-settings IPC tests; bounded save → invoke → List/Grid proof. Depends on Slice 6.

### 8. Configure Can I Use — `tockteam-u104.8`

Reuse the existing preference preparation/store and pinned target catalog. Expose reviewed display options and exact browser-target configuration; explain unsupported automatic/workspace behavior instead of presenting it as functional.

Acceptance: exact supported target unions save and affect the next command; `defaults`, workspace paths and unsupported selectors cannot be saved as working configurations and produce actionable errors; page opening starts no child or workspace access.

Verification: `node --test tests/trusted-raycast-can-i-use-*.test.ts tests/launcher-extension-settings.test.ts`, plus workbench compatibility-settings IPC tests; bounded valid/rejected target flows. Depends on Slice 6.

### 9. Connect Contextual Entry Points and Finish Coverage — `tockteam-u104.9`

Carry an optional finite extension destination through the existing Desktop settings route. Add **Extension Settings** actions for built-in results and active compatibility commands. Finish removal of duplicate family sections and update `.agents/references/tocklauncher.md` to describe the new navigation, data ownership and verification.

Acceptance: actions open the exact canonical page without invoking commands; disabled/missing/platform-unavailable targets are handled safely and keyboard focus is restored; all 27 pages and every setting owner pass behavioral/coverage checks with no lost configuration, drafts or secrets.

Verification:

```bash
node --test tests/launcher-*.test.ts tests/trusted-raycast-*.test.ts tests/desktop-settings-navigation.test.ts tests/settings-*.test.ts
pnpm typecheck
pnpm run build
```

Also run the new IPC tests, React Doctor per its skill, and the bounded Playwright/Electron proofs described above. Changes here affect launcher/preload/IPC, so an applicable Electron smoke is warranted: use an inactive equivalent with stated coverage or obtain permission before `pnpm test:launcher:electron` (which takes focus). Do not run installed smokes while iterating. If a final installed smoke is required, run it once after focused checks at the final commit, with `TOCKTEAM_INSTALLED_SMOKE_TEMP_ROOT` inside a `.noindex` cache directory, never concurrently.

Depends on Slices 2–8; they transitively include Slice 1.

## Dependency Order and Execution

Slice 1 is the first runnable increment. Slices 2–6 then consume its page contract; Slices 7–8 consume Slice 6's finite compatibility settings path. Slice 9 integrates all pages with launcher entry points and final evidence.

The catalog and page component are shared write targets. Default to sequential implementation rather than concurrent writers. This plan creates no worktrees or delegated runs. If delegation is later authorized, establish ownership explicitly and do not create worktrees without permission.

## Non-Goals

- Arbitrary Raycast Store installation, runtime manifest interpretation or a second plugin loader.
- A separate settings application, separate appearance authority or new Web/TUI launcher privileges.
- New provider features, generic per-command shortcut infrastructure, new proxy authentication or a network diagnostics dashboard.
- Rewriting specialized editors into a universal form engine.
- Changing package identities, settings filenames, import/export/reset scope or compatibility artifact bytes merely to reorganize settings.
- Running or modifying the user's Raycast app, Astar configuration or live TockTeam profile during implementation verification.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| An existing field disappears when family forms are split | Assert ownership coverage against the reviewed setting catalog and exercise every page |
| A metadata entry is mistaken for new runtime authority | Finite identities/fields only; retain main validators, fixed storage paths and separate workbench/launcher guards |
| Inline preferences race with canonical settings | Shared main serialization/revision checks, recoverable conflicts and next-invocation semantics |
| Navigation loses a draft or applies an old response to a new page | Parent-owned per-extension drafts/save state; rejected-save, switch-page and leave-settings tests |
| A trusted artifact's enabled state is confused with installation | Reuse trust service; explicit status/setup/recovery, no automatic install on settings access |
| Cached Translate language sets obscure default preference changes | Label defaults versus saved sets and verify both paths without deleting cache |
| Unsupported Can I Use/platform controls appear usable | Reuse preparation and platform dispositions; test rejection as well as successful saves |
| A shared field exposes a secret or detected proxy | Keep sensitive controls on dedicated paths; test sanitized snapshots/errors/exports |
| Old imports or user-owned external files change semantics | Preserve keys and ownership tokens; rerun source-change, import/reset and draft tests |

## Completion and Planning Validation

Implementation is complete only when every admitted extension has a reachable page, existing effective settings are preserved, simple future fields need no bespoke page, contextual navigation works, and the functional/security/browser checks pass.

Planning validation consists of checking the 24+3 identity inventory, referenced modules and test globs, issue dependencies, and `git diff --check`. No runtime/UI implementation or app launch is part of this planning request. The epic and nine implementation issues remain open.
