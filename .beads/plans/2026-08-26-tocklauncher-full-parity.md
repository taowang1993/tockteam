# Plan: Port Full TockLauncher Parity to TockTeam Desktop

## Problem

TockTeam Desktop has no desktop-native keystroke launcher. The desired target is not a minimal command palette: it is full parity with Tockbot's secure TockLauncher implementation, including the complete 24-extension Ueli v9.29.0 composition, search and keyboard behavior, settings and persistence, native lifecycle, operating-system effects, accessibility, and package evidence.

Porting directly from the Ueli research checkout would inherit Ueli's standalone application identity, broad preload, trusted static extension registry, synchronous IPC, generic handlers, and full dependency graph. Building the launcher as a DSH plugin would put Electron windows, global shortcuts, filesystem/process/network authority, and native lifecycle in the wrong runtime boundary.

## Solution

Port Tockbot's TockLauncher implementation into TockTeam's existing Electron Desktop shell. Treat the tagged Ueli v9.29.0 tree as pristine provenance and a source of selected reviewed pure modules/assets, not as a runnable application or plugin system.

TockTeam Desktop remains the owner of:

- the launcher `BrowserWindow`, global shortcut, dedicated Electron session, preload, IPC, native dialogs, persistence, and operating-system effects;
- search provider construction, action authorization, cancellation, lifecycle, and package resources;
- the canonical TockTeam app identity and data root.

The existing `@tockteam/desktop` Cordis Host/client package remains the only DSH-facing integration seam. It contributes finite TockTeam destinations, workbench routing, settings-slot UI, theme/skin projection, and Desktop surface facts. No launcher behavior is added to TockTeam Web or TUI, and no second plugin system or agent loop is created.

## Definition of Full Parity

For this plan, “full parity” means parity with Tockbot's secure implementation, not restoration of unsafe raw Ueli authority.

Required coverage:

- the 24 pinned Ueli runtime extension IDs;
- Ueli-compatible core search, favorites, exclusions, history, indexing, rescan, settings, and keyboard/mouse interaction;
- Tockbot's opaque action, dedicated-session, strict IPC, persistence, lifecycle, and package boundaries;
- the complete supported-platform behavior and unsupported-platform outcomes;
- TockTeam-native product destinations, theme/skin behavior, settings surface, identity, and data paths;
- executable provenance, parity, dependency, asset, platform, and release catalogs.

The starting Tockbot parity inventory contains 67 bootstrap registrations, 24 extensions, 31 action-handler occurrences, 39 bridge methods, 128 IPC/event-channel occurrences, 34 renderer/settings surfaces, 17 browser/terminal registries, 100 setting rows, 108 asset/notice rows, 699 dependency rows, and 13 platform/target rows. TockTeam's catalogs must classify every row and may record a deliberate secure divergence; they must not blindly preserve Tockbot-only product routes or identity values.

The following remain blocked by design:

- Ueli's generic Commandline, PowerShell, AppleScript, and raw action-handler surfaces;
- raw `ipcRenderer`, arbitrary renderer filesystem/process/network/shell access, or generic IPC channels;
- unrestricted custom-browser arguments;
- Ueli's standalone Electron main process, module registry, extension loader, settings window, application identity, and full package graph;
- dynamically installable launcher extensions or a second marketplace;
- renderer-authored executable, path, URL, workflow, or secret authority.

## Planning Baselines

| Source | Revision | Role |
| --- | --- | --- |
| TockTeam | `dc1c8f6c31974ede98816b038b50458ced82d575` | Planning baseline; implementation lands in this repository. |
| Tockbot | `7655149224cb989b66dc382c4e0f157ae4c4b312` | Behavior, security, test, and package implementation source. |
| Ueli release | `v9.29.0`, tag object `065cd29600a6c2834e75f67f4962e1e975ceeace`, peeled commit `c9670d61cb2576802adf99d95622c58538d265f3` | Upstream provenance baseline. |
| Ueli tree | `10af7c99825bc4a16804660e162a891e3515fe93` | Expected pristine vendor tree. |
| Pinned DSH | `0.1.1-rc.2`, revision `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` | Authoritative Cordis, client settings-slot, ThemeService, and Web runtime API. |

Before vendoring, verify the tag object, peeled commit, tree, archive checksum, lockfile checksum, and notices from the upstream Git remote. The resource note's research HEAD `4fb152247e86d28191dfd49057b8a5a6f8aee951` is not the release anchor and must not replace the tagged baseline.

## Source Map and Ownership

| Concern | Implementation Source | TockTeam Owner |
| --- | --- | --- |
| Window/session/security/action boundary | Tockbot `apps/web/electron/launcher-*.ts` | `src/main.ts`, `src/launcher-*.ts`, dedicated launcher preloads |
| Search and provider adapters | Tockbot `apps/web/electron/launcher-*.ts` | Electron main modules under `src/` |
| Semantic launcher renderer and finite tools | Tockbot `apps/web/src/launcher/` | `src/launcher/`, built as dedicated Electron renderer entries |
| Canonical settings UI | Tockbot settings behavior, pinned DSH `settings.section` slot | `@tockteam/desktop` browser client plus typed Desktop bridge |
| Theme and skins | Tockbot theme projection behavior | DSH ThemeService plus `plugins/skins/src/skins.ts`; no second palette |
| TockTeam destinations and workbench readiness | Existing TockTeam Desktop bridge/services | `src/client.ts`, `src/contracts.ts`, `src/preload.ts`, Electron main |
| Ueli pure modules/assets and notices | Tagged Ueli v9.29.0 | Pristine `vendor/ueli`; never shipped as source |
| Provenance/parity/package checks | Tockbot `scripts/ueli/` | TockTeam-owned `scripts/ueli/` and root tests |
| Build/package integration | Tockbot Vite/Electron Builder behavior | Existing `scripts/build.mjs`, package scripts, and Electron Builder config |

## Implementation Decisions

1. **Port from Tockbot, validate against Ueli.** Tockbot is the implementation oracle. Ueli is the provenance and upstream-drift oracle.
2. **Keep native authority in Electron main.** Launcher windows, sessions, shortcuts, persistence, scanners, network calls, process execution, native dialogs, and lifecycle do not become Cordis plugins.
3. **Reuse the existing Desktop plugin.** `@tockteam/desktop` gains only the browser/DSH-facing settings, destination, theme, and routing integrations needed by the Electron owner. No new launcher plugin package or bundle row is created.
4. **Keep Web and TUI unchanged.** Do not modify `web/cordis.patch.yml`, `WEB_BUNDLES`, `TUI_BUNDLES`, or TUI rendering for launcher behavior.
5. **Preserve TockTeam identity.** Replace Tockbot names, partitions, routes, data paths, bundle IDs, executable names, and specialist catalogs with TockTeam equivalents. Preserve existing TockTeam package IDs, app ID, profile name, and user-data root.
6. **Vendor pristine source, ship selected output only.** Add the exact tagged Ueli tree as a clean subtree. Product adapters and divergences live outside it. Packages contain compiled reviewed code/assets and notices, never `vendor/ueli` source.
7. **Admit dependencies explicitly.** Start with the Tockbot-owned set (`fuse.js`, `fuzzysort`, `color`, `mathjs`, and `uuid`) only where imported. Re-audit versions against TockTeam's Electron/Node stack; do not install Ueli's package graph.
8. **Use one action authority.** Main publishes immutable display records with owner-bound opaque IDs and retains all handler keys/arguments. IDs are result-set-bound, expiring, single-use, and consumed before effects.
9. **Use one settings authority.** Main owns schemas and persisted state. The canonical UI is a TockLauncher section registered through the pinned DSH `settings.section` slot. `launcher-settings.html` is only a compatibility handoff, never another state owner.
10. **Use one theme catalog.** The DSH client projects active light/dark mode and the selected ID from `plugins/skins/src/skins.ts` through exact typed IPC. The isolated renderer consumes only finite theme facts; it does not create a theme loader or palette.
11. **Port behavior, not Tockbot's component system.** Use TockTeam Tailwind v4 and Lucide conventions. Do not import Tockbot shadcn recipes, Ueli Fluent UI, a feature stylesheet, or a second component library.
12. **Keep platform effects finite.** Every file, URL, executable, terminal, application, Store ID, settings item, workflow digest, and browser grant is revalidated against current main-owned state at invocation.
13. **Make failure local.** One provider's scan/network/platform failure must not prevent other providers or cached safe results from working. Superseded requests and disposal propagate cancellation.
14. **Use test-first slices.** Each non-trivial issue starts with the smallest Tockbot-derived failing public-behavior check, then the minimal adaptation, then real Electron verification where the boundary is visible.
15. **Do not hand-edit generated output.** Build renderer/preload/package artifacts through repository scripts.

## State, Lifecycle, and Cleanup

- Launcher state lives below the existing TockTeam Desktop `userData` root, for example `<userData>/launcher/`; no Ueli or Tockbot data identity is created.
- The overlay is created lazily, reused, and destroyed during app shutdown. Closing or renderer failure clears owner-bound actions and pending requests.
- Search is latest-request-wins both before publication and in main-owned provider/action state.
- External settings and custom-browser grants are identity-bound and revoked on drift.
- DSH runtime restart must not duplicate Electron handlers, shortcuts, tray items, or windows. The launcher remains an Electron capability and reconnects only through the existing workbench/client readiness contract.
- Every timer, watcher, child process, request, Electron registration, and browser listener has an explicit disposer. Started Electron, server, browser, and child processes are stopped after verification.

## Security Invariants

- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`.
- Dedicated persistent launcher partition renamed for TockTeam and not shared with the DSH workbench.
- Exact packaged/development entry URLs, main-frame/sender/window-role/session checks, denied navigation/new windows, strict CSP, and deny-all permission handlers.
- Exact runtime payload schemas and size/count/depth/time bounds at every IPC/provider boundary.
- Native dialogs choose files/applications; renderer payloads never grant paths or executable identities.
- Fixed executables plus argument arrays and `shell: false` where applicable; command-producing features retain Tockbot's dedicated policies and confirmations.
- Secrets remain encrypted main-owned values and are absent from snapshots, logs, errors, import, and export.
- Workflow and terminal audits retain only bounded metadata/digests, never command text or output.
- Web must not emulate launcher authority, and DSH agent permission presets are not treated as a sandbox for Host or Electron code.

## Testing Decisions

### Highest Useful Seams

- Pure tests for schemas, search ordering, action ownership, URL/path/process policies, persistence recovery, catalogs, and platform adapters.
- Electron-owner tests for session/role/frame checks, preload surface, window placement, lifecycle, navigation, and cleanup.
- Renderer tests for keyboard/mouse behavior, finite tools, settings models, focus, accessibility, cancellation, and stale responses.
- `playwright-cli` against the real Electron overlay for shortcut/button opening, search/invocation, actions menu, history, settings, focus, theme/skin, reduced motion, and failure states.
- Package-shaped execution on the current host for ASAR/resources/notices/security.
- Installed-artifact execution on macOS, Windows, and Linux for platform-specific scanners/effects and release claims.

### Test-First Loop

For every child issue:

1. Port or write one failing public-behavior check and record the exact RED command/result.
2. Implement the minimum TockTeam adaptation behind the chosen owner.
3. Re-run focused tests, typecheck, and the touched build entry.
4. Drive the real Electron path when the slice changes visible UI or native authority.
5. Run parity/catalog audits after any source, setting, asset, dependency, bridge, channel, or platform inventory change.
6. Stop all started processes and inspect `git status` before committing.

### Planned Commands

These script names are introduced by the relevant foundation/package issues and then become required gates:

```sh
pnpm test:ueli-baseline
pnpm audit:ueli-baseline
pnpm test:ueli-launcher-parity
pnpm audit:ueli-launcher-parity
pnpm test:ueli-package-feasibility
pnpm audit:ueli-package-feasibility
pnpm test:launcher:electron
pnpm test:launcher:packaged
```

Existing repository gates remain required:

```sh
node --test tests/launcher-*.test.ts
pnpm run typecheck
pnpm test
pnpm run build
pnpm run build:dsh
pnpm run stage:dsh
pnpm run smoke:runtime
pnpm run smoke:web
```

The final installed-artifact issue adds/uses platform-specific Desktop packaging and smoke commands. Configuration dumps, unit tests, cross-compilation, and startup logs support the evidence but do not substitute for execution on the target platform.

## Out of Scope

- Running or forking Ueli as a second application.
- Adding launcher UI or Electron-like authority to TockTeam Web or TUI.
- Replacing the DSH agent loop, Profile, Loader, session store, ThemeService, or marketplace.
- Creating a generic third-party launcher-provider API before a concrete consumer requires it.
- Pretending Tockbot-only destinations such as TockDriver, TockDesigner, TockSlider, TockSpeaker, or Contacts exist in TockTeam. TockTeam gets a finite catalog of routes/actions it actually owns.
- Ueli functionality absent from v9.29.0, including Workflow variables/templates.
- Weakening confirmations, path/network confinement, safe storage, IPC checks, renderer sandboxing, or package evidence to obtain literal unsafe Ueli behavior.
- Claiming signed/notarized public macOS distribution without credentials and real signing/notarization evidence.

## Delivery Plan

### Phase 0 — Freeze the Contract

#### `tockteam-tl.1` — Pin TockLauncher Provenance and Executable Parity Contract

**Description:** Verify and vendor the tagged Ueli baseline, pin the Tockbot implementation source, and adapt the executable baseline/parity/dependency/platform/release catalogs before product code is copied.

**Acceptance Criteria:**

- Exact tag, commit, tree, file count, hashes, and notices are reproducible and the vendor tree is clean.
- Mutation checks reject unmapped drift in every catalog family.
- Every row has a TockTeam owner, platform, disposition, divergence, issue, and evidence; Ueli's runtime graph is not admitted.

**Verification:** Baseline/parity/package-feasibility test and audit commands, `git diff --check`, and notice/resource existence checks.

**Dependencies:** None.

**Likely Areas:** `vendor/ueli`, `scripts/ueli/`, root tests, `THIRD_PARTY_NOTICES.md`, package scripts.

### Phase 1 — Secure Vertical Tracer

#### `tockteam-tl.2` — Open an Isolated TockLauncher Overlay

**Description:** Land the dedicated launcher session/preload/security boundary and a reusable empty/search-ready overlay reachable by shortcut and accessible workbench fallback.

**Acceptance Criteria:**

- Option+Space on macOS and Alt+Space elsewhere open one correctly placed 750×475 overlay.
- The overlay is sandboxed, role/URL/session-bound, permission-denied, and exposes no raw IPC or Node authority.
- Blur, Escape, conflict fallback, destruction, and app shutdown clean up only launcher-owned resources.

**Verification:** Focused boundary/security/window tests and a real Electron open/reuse/dismiss/conflict flow.

**Dependencies:** `tockteam-tl.1`.

**Likely Areas:** `src/main.ts`, `src/contracts.ts`, new `src/launcher-*.ts`, launcher HTML/preload/renderer entry, focused tests.

#### `tockteam-tl.3` — Search and Invoke Through Opaque Main-Owned Actions

**Description:** Port core search, semantic results, action ownership, and one complete TockTeam destination path through the existing workbench without reloading or creating another agent loop.

**Acceptance Criteria:**

- Both search engines, ordering, limits, indexed/instant groups, favorites, exclusions, history, rescan, errors, and latest-wins match fixtures.
- Opaque action expiry, replay, owner, result-set, and consume-before-effect checks fail closed.
- A TockTeam result focuses/reuses the canonical DSH workbench and preserves session state.

**Verification:** Core-search/action-store/IPC tests plus a real search-and-invoke Electron flow.

**Dependencies:** `tockteam-tl.2`.

**Likely Areas:** search/action/contract/specialist modules, renderer surface, `src/client.ts`, `src/preload.ts`, tests.

#### `tockteam-tl.4` — Project TockLauncher Routing, Theme, and Lifecycle Into One Desktop App

**Description:** Complete TockTeam destinations, readiness/routing, DSH theme and skin projection, and the single-app lifecycle controller.

**Acceptance Criteria:**

- Existing/recreated workbenches receive one validated route and preserve active state.
- Overlay theme follows the DSH mode and shared TockTeam skin ID without a second catalog.
- Dock, tray, shortcut, startup, always-on-top, all-workspaces, second instance, relaunch, updater, and secure quit have one owner.

**Verification:** Routing/readiness/lifecycle/theme tests and real restart, `--toggle`, route, skin, and shortcut-conflict flows.

**Dependencies:** `tockteam-tl.3`.

**Likely Areas:** launcher lifecycle/window/navigation modules, `src/main.ts`, `src/client.ts`, shared skins integration, tests.

#### `tockteam-tl.5` — Persist the Complete TockLauncher Settings Contract

**Description:** Port all setting rows, bounded persistence, backup/index/log recovery, safe secrets, native import/export/reset, external-file/browser grants, and the canonical DSH settings section.

**Acceptance Criteria:**

- All 100 setting rows and exact upstream defaults/absent-default behavior are represented.
- Atomic persistence and recovery work; identity drift revokes grants without overwriting changed files/apps.
- Secrets/main-owned fields never cross snapshots/import/export and the compatibility entry is not a second authority.

**Verification:** Settings-contract/persistence/grant/recovery tests, DSH settings-slot component tests, and real restart/import/export/corruption flows.

**Dependencies:** `tockteam-tl.3`.

**Likely Areas:** launcher settings/persistence modules, dedicated settings compatibility entry, `src/client.ts`, Tailwind sources, tests.

### Phase 2 — Complete Provider Families

Each provider issue includes its settings, assets, main adapter, opaque actions, invocation-time validation, renderer/settings integration, platform fixtures, and failure isolation. Provider issues may proceed in separate worktrees after the shared search/settings contracts are fixed.

#### `tockteam-tl.6` — Port All Local Transformation Extensions

Covers Base64 Conversion, Calculator, Color Converter, Password Generator, Quick Formatter, Rowland Text Editor, and UUID Generator.

**Acceptance:** Seven exact IDs; reviewed pure modules/direct dependencies only; finite Base64/Rowland/UUID tools; opaque copy/tool actions; malformed settings fail safely.

**Verification:** Tockbot-derived local-provider/tool fixtures, typecheck/build, renderer flow, parity/dependency audits.

**Dependencies:** `tockteam-tl.5`.

#### `tockteam-tl.7` — Port Application, Bookmark, and IDE Discovery

Covers Application Search, Browser Bookmarks, JetBrains Toolbox, and Visual Studio Code.

**Acceptance:** Exact platform matrix, bounded/cancelable scanners, independent errors, packaged assets, current-target revalidation, fixed Windows elevation policy.

**Verification:** Deterministic macOS/Windows/Linux fixtures and real current-host discovery/open/reveal behavior.

**Dependencies:** `tockteam-tl.5`.

#### `tockteam-tl.8` — Port Bounded File Search Providers

Covers File Search and Simple File Search.

**Acceptance:** Fixed `mdfind`/Everything invocation; home-contained no-follow Simple File Search; exact result/visit/queue/depth/time/root limits; invocation-time canonical path checks.

**Verification:** Hostile query, timeout, cancellation, symlink, permission, memory, and platform fixtures plus real current-host search/open/reveal.

**Dependencies:** `tockteam-tl.5`.

#### `tockteam-tl.9` — Port Bounded Network Extensions

Covers Currency Conversion, Custom Web Search, DeepL Translator, and Web Search.

**Acceptance:** Fixed/public HTTPS policy, safe template substitution, manual redirect/deadline/body bounds, cancellation, secret redaction, and no renderer network authority.

**Verification:** Mocked request/redirect/stall/oversize/supersession fixtures plus real UI without requiring live third-party availability.

**Dependencies:** `tockteam-tl.5`.

#### `tockteam-tl.10` — Port Finite Operating-System Extensions

Covers Appearance Switcher, System Commands, System Settings, Ueli Commands, and Windows Control Panel.

**Acceptance:** Exact platform catalogs/support, fixed executable/argument mappings, native confirmation, current-operation checks, and delegation to one TockTeam lifecycle controller.

**Verification:** Deterministic macOS/Windows/Linux operation fixtures and safe real-host rendering/lifecycle checks; destructive effects are not executed in ordinary UI smoke.

**Dependencies:** `tockteam-tl.4`, `tockteam-tl.5`.

#### `tockteam-tl.11` — Port Terminal Launcher and Custom Browser Grants

Covers Terminal Launcher and Ueli-compatible custom-browser outcomes.

**Acceptance:** Finite terminal/browser catalogs and native grants, exact command/URL confirmation, fixed working directory/executables/args, redacted audits, replacement/revocation checks, Linux system-browser-only behavior.

**Verification:** macOS/Windows invocation fixtures, unsupported Linux fixtures, action/grant tampering tests, and current-host safe flows.

**Dependencies:** `tockteam-tl.4`, `tockteam-tl.5`.

#### `tockteam-tl.12` — Port Bounded Workflow Execution

Covers the exact four v9.29.0 workflow action types: Open File, Open URL, Open Terminal, and Execute Command.

**Acceptance:** Bounded schema/digest, ordered actions, exact native confirmation, fixed shell/environment, cancellation/deadline/output/process-tree controls, redacted audits, and no invented variable/template system.

**Verification:** Workflow fixtures for valid, changed, tampered, replayed, unsupported, canceled, timed-out, and oversized graphs plus real safe renderer/editor flows.

**Dependencies:** `tockteam-tl.11`.

### Checkpoint — All 24 Runtime Extensions

- Seven local + four discovery + two file + four network + five OS + one terminal + one workflow extension IDs are enabled and classified.
- Every provider has settings, assets, isolated failure, cancellation, invocation revalidation, and focused evidence.
- Generic Ueli handlers and renderer authority remain blocked.

### Phase 3 — Renderer and Package Convergence

#### `tockteam-tl.13` — Converge Full Renderer, Settings, and Accessibility Parity

**Description:** Complete every shared renderer/settings behavior after all provider families exist, using TockTeam UI rules.

**Acceptance Criteria:**

- Grouped Pinned/Recent/Results rows, action menu, confirmations, history, status/error/cancel states, tools, and every settings control are reachable.
- All documented keyboard shortcuts, mouse behavior, focus restoration, listbox/menu/dialog semantics, long labels, zoom, reduced motion, light/dark, and four TockTeam skins pass.
- No shadcn, Fluent UI, feature stylesheet, second theme loader, or second settings authority is introduced.

**Verification:** Renderer/component tests, icon/Tailwind/design gates, and `playwright-cli` against the real Electron overlay/settings surface.

**Dependencies:** `tockteam-tl.6` through `.10`, and `tockteam-tl.12`.

**Likely Areas:** renderer/settings modules, `src/client.ts`, `plugins/skins/src/client/tailwind.css`, launcher e2e fixtures.

#### `tockteam-tl.14` — Build and Smoke a Hardened Package-Shaped Launcher

**Description:** Integrate every launcher entry/resource/notice into TockTeam's esbuild and Electron Builder pipeline and execute the ASAR-backed current-host artifact.

**Acceptance Criteria:**

- Launcher main/preloads/renderers/assets/notices build and package under existing TockTeam identity/data paths.
- The packaged overlay demonstrates sandboxing, permissions, resources, ABI, actions, settings, and workbench coexistence; vendor source is absent.
- Existing Desktop, DSH runtime, marketplace, Web, and TUI build/smoke gates remain green.

**Verification:** All baseline/parity/package audits, root gates, package-shaped launcher smoke, package inventory inspection, and clean shutdown.

**Dependencies:** `tockteam-tl.13`.

**Likely Areas:** `scripts/build.mjs`, package scripts/config, packaging scripts, notices, package smoke fixtures/tests.

#### `tockteam-tl.15` — Prove Installed Cross-Platform TockLauncher Parity

**Description:** Run fresh installed/package artifacts on macOS, Windows, and Linux and close the catalog only from real applicable-platform evidence.

**Acceptance Criteria:**

- Every applicable provider, lifecycle path, unsupported outcome, settings migration/recovery path, security boundary, and workbench route executes from an installed artifact.
- Upgrade/rollback/data compatibility, installer identity, shortcut conflicts, permissions, cleanup, notices, and source absence pass.
- Documentation and release claims distinguish package-shaped, installed, signed, notarized, and publicly distributable evidence.

**Verification:** Platform CI/artifact commands, installed smoke, parity catalog closure, independent review, and final root/package gates.

**Dependencies:** `tockteam-tl.14`.

## Dependency Shape

```text
Provenance and Parity Contract
  └─ Isolated Overlay
      └─ Search and Opaque Actions
          ├─ Routing, Theme, and Lifecycle
          │   ├─ OS Extensions ───────────────────────────┐
          │   └─ Terminal and Browser Grants              │
          │       └─ Workflow ────────────────────────────┤
          └─ Settings and Persistence                     │
              ├─ Local Transformations ───────────────────┤
              ├─ Discovery ───────────────────────────────┤
              ├─ File Search ─────────────────────────────┤
              ├─ Network ─────────────────────────────────┤
              ├─ OS Extensions ───────────────────────────┤
              └─ Terminal and Browser Grants              │
                                                          └─ Renderer Convergence
                                                              └─ Package-Shaped Smoke
                                                                  └─ Installed Platform Proof
```

## Parallelization and Worktree Strategy

Use a dedicated worktree for implementation.

Reasons:

- this is roughly a 13.5k-line, 60-plus-file port before TockTeam adaptation and tests;
- the current checkout contains another session's TockTutor generated-output changes and `.playwright-cli/`, plus an unknown untracked `Bn` that must not be touched;
- one long-running feature branch should not share a Git index with active work on `main`;
- provider families become safe parallel work only after foundation contracts stabilize.

Recommended sequence:

1. Let the current owner finish or commit any work that the launcher branch must include.
2. Ensure the plan commit is present in the selected clean base.
3. Create a durable sibling worktree, not a disposable repository-root scratch directory:

```sh
git worktree add -b feature/tocklauncher-full-parity \
  /Users/max/projects/tockteam-tocklauncher <clean-base-commit>
```

4. Run `bd prime`, claim `tockteam-tl.1`, and keep Beads updates scoped to the TockLauncher epic.
5. Use one writer in the foundation worktree through `tockteam-tl.5`.
6. After the search/settings/action contracts are committed, independent provider families may use separate worktrees. Coordinate shared renderer/settings/catalog files and merge each complete vertical slice before renderer convergence.
7. Run package convergence from one integration worktree only.

Beads coordination remains shared even when Git worktrees are isolated. Never stash, reset, clean, stage, or commit another session's files.

## Checkpoints

### Checkpoint A — Auditable Foundation

- Tagged provenance and parity catalogs pass mutation checks.
- Dedicated overlay opens through a secure boundary.
- Search and one real TockTeam route work end to end through opaque actions.

### Checkpoint B — One Product Authority

- Settings, persistence, theme, routing, and lifecycle use existing TockTeam owners.
- No Web/TUI authority, second settings store, theme catalog, plugin system, or agent loop exists.

### Checkpoint C — 24 Extensions

- Every provider family is implemented with settings, assets, bounded execution, cancellation, and platform fixtures.
- All blocked generic Ueli authority remains blocked.

### Checkpoint D — Renderer Parity

- Keyboard, mouse, tools, settings, accessibility, theme, skin, error, and cancellation flows pass in real Electron.

### Checkpoint E — Release Evidence

- Current-host package-shaped smoke passes with exact resources/notices and no vendor source.
- Installed macOS/Windows/Linux evidence closes every applicable catalog row.
- Documentation claims only what package, signing, notarization, installer, and target-platform evidence proves.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| “Full parity” is interpreted as raw unrestricted Ueli behavior | Critical | Define Tockbot's secure implementation as the target; keep every deliberate block in executable catalogs and tests. |
| Research HEAD replaces the tagged release anchor | High | Verify tag object, peeled commit, tree, and checksums from upstream before vendoring; baseline audit fails on drift. |
| Tockbot identity/data/session strings leak into TockTeam | High | Add identity/resource catalog checks and migration tests; preserve TockTeam `package.json`, profile, app ID, and user-data contracts. |
| Native launcher code becomes a DSH plugin or Web authority | Critical | Keep all native owners in Electron main; use existing Desktop plugin only for finite settings/routing/theme integration. |
| Ueli's dependency vulnerabilities enter the distribution | Critical | Never install Ueli's graph; admit and audit only directly imported TockTeam-owned runtimes. |
| TockTeam's esbuild pipeline cannot reproduce Tockbot's Vite asset assumptions | High | Port behavior/modules, add explicit esbuild loaders/copies/entry points, and prove package resource inventory early. |
| `src/main.ts` becomes an untestable second composition monolith | High | Keep launcher logic in focused ported modules; main assembles owners and lifecycle only. |
| Extension-family branches conflict in shared contracts/settings UI | Medium | Freeze contracts through `.5`, assign one writer per worktree, and keep each family vertically complete before merge. |
| Cross-platform fixtures are mistaken for execution evidence | High | Require installed Windows/Linux/macOS lanes before closing `.15` or claiming full platform parity. |
| Theme projection creates a second palette or stale skin state | Medium | Source IDs/values only from DSH ThemeService and `plugins/skins/src/skins.ts`; test unload/restart/theme changes. |
| Workflow/terminal/browser ports widen command authority | Critical | Retain exact typed policies, native confirmation, current-state revalidation, fixed executables/args, bounds, cancellation, and redacted audits. |
| Parallel work touches another session's generated files or index | High | Use dedicated worktrees, coordinate via Intercom/Beads, and stage explicit paths only. |

## Beads

- Epic: `tockteam-tl`
- Children: `tockteam-tl.1` through `tockteam-tl.15`
- Plan path: `.beads/plans/2026-08-26-tocklauncher-full-parity.md`

Start with:

```sh
bd show tockteam-tl --long
bd show tockteam-tl.1 --long
bd update tockteam-tl.1 --claim
```
