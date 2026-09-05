---
audience: agent
canonical: .agents/references/tocklauncher.md
owner: TockTeam
last_reviewed: 2026-09-05
---

# TockLauncher

_Last reviewed: 2026-09-05_

TockLauncher is TockTeam Desktop's native keystroke launcher. It selectively ports the reviewed Ueli `v9.29.0` behavior while keeping the Electron lifecycle, renderer, persistence, security boundary, platform effects, and product routing under TockTeam ownership.

## Product Boundary

- TockLauncher is a reusable Electron overlay inside TockTeam Desktop. It is not another application, DSH runtime, agent loop, plugin loader, or profile mechanism.
- Desktop owns the window, dedicated session, preload, IPC, native dialogs, persistence, provider adapters, action authorization, and all operating-system effects.
- Web and TUI receive no launcher authority. The launcher does not provide a TockTeam surface as `ctx.web` and does not change DSH Profile + Loader composition.
- The renderer receives bounded display data and opaque action IDs. It never receives executable authority, filesystem paths for selected grants, secrets, raw IPC, or generic shell, process, filesystem, or network access.
- Ueli is a design and compatibility source, not an ambient runtime or shipped second application. TockTeam keeps only reviewed dependencies, assets, notices, and behavior.

## Upstream Baseline

| Field | Value |
| --- | --- |
| Upstream | `https://github.com/oliverschwendener/ueli.git` |
| Pinned release | `v9.29.0` |
| Pinned commit | `c9670d61cb2576802adf99d95622c58538d265f3` |
| Runtime composition | 24 finite extension IDs in `src/launcher-contract.ts` |
| DSH runtime | `@deepseek-ai/dsh@0.1.2-rc.1` from `dsh-source.json` |
| License handling | `LICENSE`, `THIRD_PARTY_NOTICES.md`, and the launcher asset ledgers |

The pin in `LAUNCHER_COMPOSITION`, the package lock, `scripts/ueli/desktop-release-contract.json`, the asset ledgers, and package-feasibility tests are the local sources of truth. A research checkout is never a runtime dependency.

## Deliberate TockTeam Scope

The Tockbot source reference names nine product destinations. TockTeam implements only the two real workspaces present in this product:

| Destination | Route |
| --- | --- |
| TockCoder | Existing coding workspace route |
| TockTutor | Existing notes and tutoring workspace route |

`src/launcher-navigation.ts` rejects every other destination. `src/launcher-specialists.ts` publishes only these two results. The launcher does not invent TockDriver, TockDesigner, TockSlider, TockSpeaker, or Contacts surfaces. Settings and side chat remain existing Desktop controls rather than fake top-level workspaces. This is an intentional product-scope difference, not an unfinished route map.

## Architecture

```text
TockTeam Electron Main
  ├─ LauncherLifecycleController
  ├─ LauncherOverlayController + LauncherWindowRegistry
  ├─ LauncherPersistenceRepository
  ├─ Ueli-Compatible Core Search
  ├─ Finite Provider Adapters
  ├─ LauncherActionStore
  ├─ Workbench Route Delivery
  └─ Guarded Launcher IPC
       ▲
       │ launcher-preload.cjs
       │ persist:tockteam-launcher
       │
  launcher.html + launcher.js + launcher.css
       │
       └─ Settings button → canonical workbench settings
```

| Path | Responsibility |
| --- | --- |
| `src/main.ts` | Assembles the Desktop-owned launcher and native effects. |
| `src/launcher-contract.ts` | Pins composition and validates bounded search and surface payloads. |
| `src/launcher-security.ts` | Owns the dedicated session, CSP, web preferences, URL policy, permissions, and IPC sender guard. |
| `src/launcher-actions.ts` | Converts internal actions into owner-bound opaque action IDs. |
| `src/launcher-ipc.ts` | Registers search, rescan, invoke, and cancel handlers. |
| `src/launcher-window-ipc.ts` | Registers overlay controls and settings operations. |
| `src/launcher-window-controller.ts` | Owns shortcut registration, placement, reuse, dismissal, and post-invocation hiding. |
| `src/launcher-lifecycle.ts` | Projects dock, tray, startup, shortcut, relaunch, and quit settings onto Desktop. |
| `src/launcher-core-search.ts` | Combines the cached index, instant providers, favorites, exclusions, and provider status. |
| `src/launcher-provider-lifecycle.ts` | Invalidates providers and drains bounded in-flight work. |
| `src/launcher-persistence.ts` | Owns settings, index, logs, grants, backups, transactions, and encrypted values. |
| `src/launcher-navigation.ts` | Defines the finite TockCoder and TockTutor destination contract. |
| `src/launcher-workbench-navigation.ts` | Focuses/reuses the workbench and queues one latest route until readiness. |
| `src/launcher.ts` | Implements the semantic launcher surface and keyboard behavior. |
| `src/launcher-settings.tsx` | Implements the canonical React settings section with shared `@tockteam/ui` controls. |
| `scripts/build.mjs` | Builds the renderer, preload, Tailwind CSS, and reviewed launcher assets. |

## Runtime Flow

1. Electron opens `<userData>/launcher`, validates or recovers managed artifacts and external-file transactions, and creates the finite providers.
2. The core search starts with the validated inert cached index. Startup performs a fresh provider rescan before the normal workbench startup completes.
3. `LauncherLifecycleController.sync()` applies lifecycle settings. The global shortcut is `Option+Space` on macOS and `Alt+Space` on Windows/Linux.
4. The workbench is created first. The overlay is created lazily from the shortcut or workbench title-bar button and then reused.
5. The renderer obtains only the fixed composition and sanitized settings projection, then sends a bounded search term and search options over typed IPC.
6. Main combines indexed results, instant results, and the two TockTeam destinations. The search and publication layers are latest-request-wins.
7. `LauncherActionStore` publishes a new result-set ID and opaque action IDs for the current launcher `webContents` owner.
8. Invocation validates and consumes one action ID before dispatching the finite provider effect. Electron main alone applies `hideWindowAfterInvocation`.
9. Provider invalidation, window clearing, navigation, settings changes, and teardown revoke stale actions and abort owned work.
10. TockCoder or TockTutor actions focus/reuse the canonical workbench and deliver a validated route after its main-frame readiness handshake.

## Window and User Experience

`LauncherOverlayController` owns a fixed preferred `750 × 475` frameless overlay:

- placement uses the display nearest the cursor, a 16 px work-area margin, and a preferred top edge near 12% of the work area;
- macOS uses the transparent panel treatment; other platforms use the bounded frameless shell;
- shortcut registration failure leaves the accessible workbench launcher button available and reports a conflict;
- blur, Escape, and eligible completed actions hide the reusable window according to `window.hideWindowOn`;
- the default hide reasons are `blur`, `afterInvocation`, and `escapePressed`.

The renderer provides:

- one semantic search combobox and grouped `Pinned`, `Recent`, and `Results` options;
- Enter, arrows, Home/End, Ctrl/Cmd+number, Ctrl/Cmd+K, Ctrl/Cmd+F, Ctrl/Cmd+Delete, F5, history, and layered Escape behavior;
- keyboard-navigable additional-action, file-search, and network-tool menus;
- finite Base64, Rowland, UUID, file-search, and network tools;
- visible Rescan, Settings, and Close controls;
- native buttons, listbox/menu/dialog semantics, live status, focus restoration, visible focus, and reduced-motion behavior;
- semantic DSH color tokens, Tailwind v4, shared `@tockteam/ui` React controls, and Lucide icons.

The settings button opens the canonical workbench settings page. There is no second settings application or renderer-owned persistence authority. Active text drafts survive background snapshot refreshes; committed drafts reconcile with the accepted main-owned snapshot. Invalid structured values receive visible and announced field errors.

## Provider Composition

`LAUNCHER_COMPOSITION` contains 24 Ueli-compatible extension IDs implemented as TockTeam adapters:

| Family | Extensions | Behavior |
| --- | --- | --- |
| Local transformations | Base64 Conversion, Calculator, Color Converter, Password Generator, Quick Formatter, Rowland Text Editor, UUID / GUID Generator | Reviewed pure transformations; copy effects remain main-owned; finite renderer tools are used where interaction is needed. |
| Discovery | Application Search, Browser Bookmarks, JetBrains Toolbox, Visual Studio Code | Bounded platform scans, identity capture, SQLite workers, packaged/native icons, and immediate action revalidation. |
| File search | File Search, Simple File Search | macOS `mdfind`, an allowlisted Windows Everything executable, and home-contained bounded directory scans. |
| Network | Currency Conversion, Custom Web Search, DeepL Translator, Web Search | Fixed provider requests, browser search actions, bounded bodies/responses, cancellation, deadlines, and main-owned secrets. |
| Operating system | Appearance Switcher, System Commands, System Settings, Ueli Commands, Windows Control Panel | Finite catalogs and trusted platform adapters; destructive and quit actions require confirmation. |
| Terminal | Terminal Launcher | A finite macOS/Windows terminal catalog with confirmation and trusted executables. |
| Workflow | Workflow | Ordered Open File, Open URL, Open Terminal, and Execute Command actions with bounded validation and audit metadata. |

Unsupported behavior is isolated rather than emulated:

- Browser Bookmarks and File Search are unavailable on Linux; Simple File Search remains available.
- Appearance Switcher and System Settings are macOS/Windows only; Windows Control Panel is Windows-only.
- Terminal Launcher is unavailable on Linux.
- Custom browser grants are supported only on macOS. Windows and Linux always use the system browser because Node does not provide the required Windows no-follow, identity-bound launch primitive. The Windows controls and settings disposition are disabled while compatible stored values are retained.
- Generic command-line, PowerShell, AppleScript, and unrestricted browser handlers are not exposed.

## Discovery and Native-Effect Hardening

Discovery is bounded by item, file-size, directory-visit, output, and time limits:

- regular text reads use no-follow and nonblocking file opens where the platform supports them, then validate the opened handle as a bounded regular file;
- Firefox and VS Code SQLite reads run in killable worker threads, not on Electron's event loop;
- unresolved icon and identity operations are capped across rescans so repeated timeouts cannot accumulate unbounded native work;
- macOS application icons are individually capped at 64 KiB and the cache prunes from 128 entries to 96 entries;
- Simple File Search applies one rescan-wide deadline across all configured roots rather than a full timeout per root;
- configured roots and discovered paths are normalized, bounded, and revalidated within their allowed scope.

Native helpers never rely on a writable current-directory search:

- Windows application scan and elevation use absolute `%SystemRoot%` PowerShell paths;
- Windows Store launch uses the absolute `%SystemRoot%\\explorer.exe` path;
- Linux desktop launch uses `/usr/bin/gio`;
- terminal, workflow, Everything, and operating-system commands resolve through their finite trusted-executable policies.

Windows shortcut elevation is scan-bound and confirmation-gated. Only a bounded regular `.lnk` can receive the administrator action. Main records its SHA-256 during mapping, revalidates identity before and after confirmation, rehashes immediately before launch, and passes the expected digest as data to a fixed PowerShell script. That script opens the shortcut with `FileShare.Read`, verifies SHA-256 while the non-write/non-delete share lock remains held, calls `Start-Process -Verb RunAs`, and releases the handle afterward. Store IDs do not receive elevation or reveal actions.

## Search and Action Authorization

`createLauncherCoreSearch()` supports `fuzzysort` and `Fuse.js`, bounded fuzziness and result counts, alphabetical empty-search behavior, instant providers, favorites, exclusions, history, rescan status, and isolated provider failures. Whitespace-only queries follow empty-search behavior.

`LauncherActionStore` is the execution boundary:

- internal items contain finite handler keys and arguments; public items contain display data and opaque `launcher-action:*` IDs;
- IDs are bound to renderer role, `webContents.id`, result set, source extension, and a short TTL;
- publishing a replacement set evicts the previous owner's actions;
- invocation checks owner, expiry, result-set freshness, exact shape, and confirmation policy, then consumes the ID before any effect;
- expired actions return only the bounded `expired` result so the renderer can refresh;
- window clearing and provider invalidation revoke ownership before asynchronous work can publish or execute;
- only the currently owned Workflow invocation can be cancelled.

## IPC and Electron Security

The launcher uses `persist:tockteam-launcher` with:

- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, and `webSecurity: true`;
- deny-all permission request and permission check handlers;
- CSP `default-src 'none'`, same-origin scripts/styles, local/data images, and `connect-src 'none'`;
- the exact packaged `launcher.html` URL for the launcher role;
- denied unexpected navigation and new windows;
- main-frame, sender URL, registered-window role, dedicated-session, and `webContents` identity checks for every IPC handler.

`launcher-preload.cjs` exposes only typed composition, search, rescan, invocation/cancellation, settings snapshot/update, import/export/reset, overlay controls, and native selection/revocation methods. It does not expose `ipcRenderer`, arbitrary channels, paths from native pickers, secrets, or generic native capabilities.

## Network Boundary

Main-owned JSON requests are limited to the built-in HTTPS provider destinations used by currency data, DeepL, and Google/DuckDuckGo suggestions. Callers pass an exact expected origin and pathname; redirects are rejected; request bodies are capped; response bodies are streamed with a 1 MiB limit and strict UTF-8/JSON parsing; cancellation closes readers.

Host resolution must contain only public addresses and is capped at 32 results. The DNS preflight is not a transport-level address pin, so it is not treated as the sole SSRF defense: fetched origins are immutable built-in HTTPS hosts, TLS validates the requested hostname, and user-defined Custom Web Search engines are opened as browser navigation rather than fetched or read by Electron main. Do not generalize `requestJson()` to accept user-configured origins without adding connection-bound address validation.

DeepL keys stay encrypted and main-owned. They never enter renderer snapshots, logs, exports, result labels, or error payloads.

## Settings and Persistence

The generated catalog contains 100 reviewed settings rows. `launcher-setting-keys.ts` and `launcher-settings-contract.ts` accept only exact runtime keys and typed, bounded values. Platform-inapplicable controls are disabled while stored compatibility values are preserved.

Sensitive values use Electron `safeStorage`. Main-owned browser path/name fields cannot be written by the renderer or imported. Imports omit main-owned and sensitive values while preserving the existing encrypted secret; exports omit both classes.

```text
<userData>/launcher/
  settings.json
  settings.json.bak
  search-index.json
  search-index.json.bak
  logs.json
  logs.json.bak
  external-settings-grant.json
  external-settings-transaction.json
  external-backups/
  custom-browser-grant.json
  application-icons/
```

Persistence rules:

- the managed launcher root must be a real owner-only directory, never a pre-existing symlink;
- settings, index, logs, grants, and transactions are bounded and independently validated;
- managed writes use exclusive no-follow temporary files, file synchronization, atomic rename, directory synchronization, and validated backups;
- mutations are serialized, and in-memory state changes only at defined commit points;
- the inert cached index drops dynamic image data and acquires no authority until current actions are republished;
- external grants bind canonical path, canonical parent, device, and inode;
- startup revalidates path/handle identity and canonical parent metadata;
- same-inode external content drift revokes the stale grant rather than overwriting editor changes;
- export rejects the active external file and hard-link aliases;
- external replacement writes a durable managed transaction before rename, refreshes the external backup and grant after rename, and removes the transaction only after both directories are synchronized;
- startup completes a valid journaled replacement, clears a transaction that remained before rename, and blocks unsafe old-grant recovery when neither identity matches;
- unsupported platforms expose external files as read-only and reject mutation before touching the selected file.

A concurrent uncooperative process can still race a pathname-based external rename because Node has no portable descriptor-relative compare-and-replace primitive. The impact is confined to the user-selected file in its user-writable parent; identity/content checks, no-follow opens, atomic replacement, and transaction recovery minimize the window. Do not widen external settings to privileged or shared directories.

## Lifecycle

`LauncherLifecycleController` maps compatibility settings onto one Desktop owner:

- one optional tray, dock visibility, the launcher shortcut, always-on-top, visible-on-all-workspaces, and startup visibility;
- `show` and `centerWindow` reuse the overlay;
- About, Extensions, and Settings route to the existing workbench;
- rescan invalidates provider/action state before rebuilding the index;
- import and reset synchronize settings and queue a secure relaunch;
- quit uses TockTeam's existing secure shutdown;
- `--toggle` is queued before readiness and drained after the workbench is ready;
- ordinary second instances activate the existing workbench.

Platform-inapplicable lifecycle controls do not write values: Dock visibility is macOS-only and all-workspaces visibility is disabled on Windows.

## Build, Packaging, and Installation

`scripts/build.mjs` emits:

```text
dist/launcher.html
dist/launcher.js
dist/launcher.js.map
dist/launcher.css
dist/launcher-preload.cjs
dist/launcher-preload.cjs.map
dist/launcher-assets/**
```

The Electron package is `@tockteam/desktop@0.1.14`, product name `TockTeam Desktop`, application ID `ai.deepseek.tockteam-desktop`, with ASAR packaging and the launcher files explicitly admitted by `package.json`. The staged DSH and Node runtimes remain extra resources owned by the unified TockTeam distribution.

`scripts/install-mac.mjs` and `scripts/install-windows.mjs` perform validated pending-copy/extraction, atomic promotion, backup, rollback, and cleanup. Their lock directories contain process ownership metadata; a dead installer's lock is recovered, while a live installer remains exclusive.

Installed evidence is described by `scripts/ueli/installed-evidence-catalog.json`. Checked-in reports prove only their recorded platform, commit, identity, lifecycle, and security observations. Workflow configuration is not execution proof; signing, notarization, and public distribution require their own evidence.

## Verification

Use the smallest focused test while iterating, then run the complete gates:

```bash
pnpm typecheck
pnpm test
pnpm run build
pnpm audit:ueli-package-feasibility
pnpm audit:installed-evidence
pnpm test:launcher:electron
pnpm test:launcher:packaged
```

On macOS, run `pnpm test:launcher:electron` during iteration. Run `pnpm test:launcher:installed` only after focused checks pass and once for the final evidence commit, with `TOCKTEAM_INSTALLED_SMOKE_TEMP_ROOT` inside a `.noindex` cache directory. Never run installed smokes concurrently, and stop every Electron app, server, and child process started for verification.

The root `node:test` suite contains focused contracts for IPC, ownership, provider races, native effects, persistence recovery, settings, renderer behavior, packaging, installers, and evidence freshness. Mutation-style package tests reject missing assets, dependency drift, stale evidence, unsafe paths, and widened authority.

## Maintenance Rules

- Preserve the Desktop/Web/TUI ownership boundaries and DSH Profile + Loader as the only composition mechanism.
- Keep provider additions finite: schema, main adapter, renderer projection, assets/notices, tests, build admission, and packaging evidence must change together.
- Never expose a generic command, path, IPC channel, network destination, plugin loader, or executable selector to the launcher renderer.
- Keep React external/singleton and use public `@tockteam/ui/<component>` exports.
- Keep all UI labels in Title Case and body copy in sentence case; preserve semantic tokens, native semantics, visible focus, and reduced motion.
- Update this document when the Ueli pin, composition, workspaces, trust boundary, platform support, persistence protocol, or evidence scope changes.
