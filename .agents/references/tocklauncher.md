---
audience: agent
canonical: .agents/references/tocklauncher.md
owner: TockTeam
last_reviewed: 2026-09-19
---

# TockLauncher

_Last reviewed: 2026-09-19_

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

### Opening-Screen Ranking Provenance

The bounded opening-screen ranking and section-order behavior were reviewed against SuperCmd at commit `2da7b9e5dec0199a972a59cece402c85f729d5d7` (`/Users/taowang/research/launcher/SuperCmd`). TockTeam reimplements only that small ranking reference locally; it does not ship SuperCmd source or runtime code. Arbitrary Raycast extensions, runtime installation, stores, and manifests remain explicitly unsupported. The only exceptions are the three build-pinned compatibility artifacts described below.

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
  ├─ Per-Artifact TrustedRaycastTrustStore + One TrustedRaycastManager
  │    └─ At Most One Reviewed Compatibility Child
  ├─ Workbench Route Delivery
  └─ Guarded Launcher IPC
       ▲
       │ launcher-preload.cjs
       │ persist:tockteam-launcher
       │
  launcher.html + launcher.js + launcher.css
       │
       └─ Ctrl/Cmd+, → canonical workbench settings
```

| Path | Responsibility |
| --- | --- |
| `src/main.ts` | Assembles the Desktop-owned launcher and native effects. |
| `src/launcher-contract.ts` | Pins composition and validates bounded search and surface payloads. |
| `src/launcher-security.ts` | Owns the dedicated session, CSP, web preferences, URL policy, permissions, and IPC sender guard. |
| `src/launcher-actions.ts` | Converts internal actions into owner-bound opaque action IDs. |
| `src/launcher-ipc.ts` | Registers search, invoke/cancel, surface-settings reads, and history handlers; rescan is a finite lifecycle action. |
| `src/launcher-window-ipc.ts` | Registers overlay controls and settings operations. |
| `src/launcher-window-controller.ts` | Owns shortcut registration, placement, reuse, dismissal, and post-invocation hiding. |
| `src/launcher-lifecycle.ts` | Projects dock, tray, startup, shortcut, relaunch, and quit settings onto Desktop. |
| `src/launcher-core-search.ts` | Combines the cached index, instant providers, favorites, exclusions, opening-screen sections, usage ranking, and provider status. |
| `src/launcher-provider-lifecycle.ts` | Coordinates provider invalidation and action revocation; provider idle methods and main own draining. |
| `src/launcher-persistence.ts` | Owns settings, index, logs, grants, backups, transactions, and encrypted values. |
| `src/launcher-navigation.ts` | Defines the finite TockCoder and TockTutor destination contract. |
| `src/launcher-workbench-navigation.ts` | Focuses/reuses the workbench and queues one latest route until readiness. |
| `src/trusted-raycast-{descriptors,trust,manager,contract,ipc}.ts` | Pins three artifacts, owns per-artifact installation, and authenticates one active command session. |
| `src/trusted-raycast-{child,compat-api,renderer,preferences}.ts` | Runs reviewed source, projects inert views, and persists validated preferences through main. |
| `src/trusted-raycast-{channel,provider,first-use,paths}.ts` | Owns the authenticated Host activation lease, explicit setup fallback, and compatibility-preserving data namespaces. |
| `src/trusted-raycast-can-i-use-*.ts` | Owns pinned browser-data queries, exact target preferences, root/detail projections, and canonical browser actions. |
| `src/launcher-theme.ts`, `src/launcher-i18n.ts` | Projects canonical DSH appearance and English/Chinese launcher copy without creating a separate theme or locale authority. |
| `src/launcher.ts` | Implements the semantic launcher surface and keyboard behavior. |
| `src/launcher-settings.tsx` | Implements the canonical React settings section with shared `@tockteam/ui` controls. |
| `scripts/build.mjs` | Builds the renderer, preload, Tailwind CSS, and reviewed launcher assets. |

## Runtime Flow

1. Electron opens `<userData>/launcher`, validates or recovers managed artifacts and external-file transactions, and creates the finite providers.
2. The core search starts with the validated inert cached index. Startup performs a fresh provider rescan before the normal workbench startup completes.
3. `LauncherLifecycleController.sync()` applies lifecycle settings. The global shortcut is `Option+Space` on macOS and `Alt+Space` on Windows/Linux.
4. The workbench is created first. The overlay is created lazily from the shortcut or workbench title-bar button and then reused.
5. Composition is bundled into the renderer as a constant. The renderer reads sanitized surface settings and sends a bounded query/options payload over typed IPC; main uses its own persisted search settings, not renderer-selected engine authority.
6. Main combines indexed results, instant results, and the two TockTeam destinations. Empty queries publish bounded `Pinned`, `Recent`, `Commands`, and `Applications` sections; typed queries retain the ordinary `Results` ordering. The search and publication layers are latest-request-wins.
7. `LauncherActionStore` publishes a new result-set ID and opaque action IDs for the current launcher `webContents` owner.
8. Invocation validates and consumes one action ID before dispatching the finite provider effect. Only successful default completions update the main-owned usage ranking; Electron main alone applies `hideWindowAfterInvocation`.
9. Provider invalidation, window clearing, navigation, settings changes, and teardown revoke stale actions and abort owned work.
10. On a fresh supported profile, main admits each bundled compatibility archive, runs an isolated preview, and installs/enables Translate, Kaomoji Search, and Can I Use before discovery. Admission/preview failure leaves the feature unavailable. Explicit disablement or removal remains authoritative; a same-archive refresh of host-derived code preserves enablement.
11. The selected compatibility command runs in a private child workspace. Translate uses unchanged `translate`; Kaomoji Search and Can I Use use reviewed `index`. The sandboxed launcher renders only bounded inert projections; main mediates the finite selected-text, Clipboard, Paste, browser, preference, lifecycle, and trust APIs.
12. TockCoder or TockTutor actions focus/reuse the canonical workbench and deliver a validated route after its main-frame readiness handshake.

## Window and User Experience

`LauncherOverlayController` owns a fixed preferred `750 × 475` frameless overlay:

- placement uses the display nearest the cursor, a 16 px work-area margin, and a preferred top edge near 12% of the work area;
- macOS uses the transparent panel treatment; other platforms use the bounded frameless shell;
- shortcut registration failure leaves the accessible workbench launcher button available and reports a conflict;
- blur, Escape, and eligible completed actions hide the reusable window according to `window.hideWindowOn`;
- the default hide reasons are `blur`, `afterInvocation`, and `escapePressed`.

The renderer provides:

- one semantic search combobox and grouped `Pinned`, `Recent`, `Commands`, and `Applications` options for an empty query, with typed `Results`;
- Enter, arrows, Home/End, Ctrl/Cmd+number, Ctrl/Cmd+K, Ctrl/Cmd+F, Ctrl/Cmd+Delete, history, and layered Escape behavior;
- keyboard-navigable additional-action, file-search, and network-tool menus; a root capture guard preserves IME composition defaults before any nested keyboard handler;
- reopening after hiding disposes the revoked trusted-command view and returns to fresh root results rather than resuming a dead child;
- finite Base64, Rowland, UUID, file-search, and network tools;
- a `Rescan extensions` command, Ctrl/Cmd+, settings shortcut, and grouped primary/additional footer actions;
- native buttons, listbox/menu/dialog semantics, live status, focus restoration, visible focus, and reduced-motion behavior;
- semantic DSH color tokens, Tailwind v4, shared `@tockteam/ui` React controls, and Lucide icons.

The settings shortcut opens the canonical workbench settings page. There is no second settings application or renderer-owned persistence authority. Active text drafts survive background snapshot refreshes; committed drafts reconcile with the accepted main-owned snapshot. Rejected drafts stay editable after blur, and invalid structured values receive visible and announced field errors.

## Provider Composition

`LAUNCHER_COMPOSITION` contains 24 Ueli-compatible extension IDs implemented as TockTeam adapters:

| Family | Extensions | Behavior |
| --- | --- | --- |
| Local transformations | Base64 Conversion, Calculator, Color Converter, Password Generator, Quick Formatter, Rowland Text Editor, UUID / GUID Generator | Pure transformations; copy effects remain main-owned. Calculator validates normalized mathjs syntax against finite node/function sets before evaluation, rejecting assignments, indirect/evaluator calls, and collection algebra; bounded collections are display-only, and allocation limits account for outer arrays even when an inner dimension is zero. Ranges validate parsed numeric endpoints and count the inclusive, tolerance-aware progression before evaluation, rejecting non-advancing floating-point steps and more than 10,000 items. Decimal-place precision applies to signed values and full scientific-notation values, including unit magnitudes, before display and copying. |
| Discovery | Application Search, Browser Bookmarks, JetBrains Toolbox, Visual Studio Code | Bounded platform scans, identity capture, SQLite workers, packaged/native icons, and immediate action revalidation. |
| File search | File Search, Simple File Search | macOS `mdfind`, an allowlisted Windows Everything executable, and home-contained bounded directory scans. |
| Network | Currency Conversion, Custom Web Search, DeepL Translator, Web Search | Fixed provider requests, browser search actions, bounded bodies/responses, cancellation, deadlines, and main-owned secrets. |
| Operating system | Appearance Switcher, System Commands, System Settings, Ueli Commands, Windows Control Panel | Finite catalogs and trusted platform adapters; destructive and quit actions require confirmation. |
| Terminal | Terminal Launcher | A finite macOS/Windows terminal catalog with confirmation and trusted executables. |
| Workflow | Workflow | Ordered Open File, Open URL, Open Terminal, and Execute Command actions with bounded validation and audit metadata. |

### Bundled Trusted Compatibility Features

The distribution contains three reviewed Raycast compatibility artifacts. Google Translate is `plugins/trusted-raycast/vendor/google-translate.tar`, SHA-256 `7a27b1a75d4ee978fab04281dd93e187a6c32fd1de5de1f01eb66ce7682ea3ac`; Kaomoji Search and Can I Use have their exact pins in `src/trusted-raycast-descriptors.ts`. Each preserves its reviewed source and dependency closure, and each is admitted before it can run.

These trusted children are not OS sandboxes. They have the launching account's filesystem, network, and process authority. The security boundary is instead finite admission and ownership: exact archive and derived-file hashes, isolated preview, journaled current/previous rotation, recovery, authenticated owner/session/generation/revision IPC, bounded messages, main-owned native effects, private process-group cleanup, and renderers that receive no extension functions, HTML, React, Node, or generic RPC. New bytes require a new reviewed TockTeam build. Bundled features install and enable automatically after that release-time review; user disablement remains persistent, and selected text never falls back to Clipboard.

Translate resolves Google's fixed origin through Electron main's system proxy settings on each command launch. An explicit extension proxy takes precedence; HTTP/HTTPS proxies and direct connections are supported, while unsupported proxy rules fail without silently bypassing them. The first-party network adapter applies the same route to the unchanged source's token lookup and translation requests, with a 10-second deadline covering each request and response body. Proxy configuration stays in the trusted child, not renderer projections or persisted preference defaults.

Compatibility extends only to these exact artifacts and their reviewed API subsets:

| Extension | Command | Finite Feature Scope |
| --- | --- | --- |
| Google Translate | `translate` | Translation, selected-text input, validated language preferences, Clipboard/Paste, browser opening, and reviewed speech behavior. |
| Kaomoji Search | `index` | Fixed 1,822-record dataset, List/Grid preferences, at most 64 projected items and four actions per item. |
| Can I Use | `index` | Pinned 581-feature dataset, at most 64 root rows, one detail level, exact browser-target unions, and canonical feature links. Automatic selectors such as `defaults` and workspace configuration are unsupported. |

Production compatibility invocation is currently macOS-only; the runtime depends on POSIX extraction and reviewed native/process cleanup. The catalog can still project installed/enabled commands on another platform, so a displayed row is not proof of runtime availability. Packaging bytes for Windows/Linux is not proof of runtime support. There is no extension store, runtime package installation, generic manifest loader, per-extension Cordis plugin, or Web/TUI mounting.

One Desktop-only `@tockteam/trusted-raycast` Cordis plugin holds a bearer-authenticated loopback activation stream. Its disconnect removes discovery authority and closes the active child. This is a lifecycle lease, not generic RPC or another composition system; generated endpoint/token values stay Host/main-owned.

Unsupported behavior is isolated rather than emulated:

- Browser Bookmarks and File Search are unavailable on Linux; Simple File Search remains available.
- Appearance Switcher and System Settings are macOS/Windows only; Windows Control Panel is Windows-only.
- Terminal Launcher is unavailable on Linux.
- Custom browser grants are supported only on macOS. Windows and Linux always use the system browser because Node does not provide the required Windows no-follow, identity-bound launch primitive. The Windows controls and settings disposition are disabled while compatible stored values are retained.
- Generic native handler selection is not exposed. However, Terminal Launcher and Workflow explicitly accept bounded user-authored command text after native confirmation. Workflow Execute Command uses fixed `/bin/sh -lc` or Windows `cmd.exe`; command contents are trusted account-level execution, not command-allowlisted or OS-sandboxed. Every Workflow action is approved before any effect begins.
- Linux System Commands currently publishes no native command: Empty Trash is withheld because the production adapter lacks an atomic deletion capability.
- Browser Bookmarks' `favicon` mode currently uses a packaged generic bookmark icon, not a fetched per-site favicon.

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
- Linux desktop launch uses `/usr/bin/gio`, and macOS discovery/file search uses `/usr/bin/mdfind`;
- Windows PowerShell uses `%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, including identity-bound terminal and OS resolution;
- terminal, workflow, Everything, and operating-system commands resolve through their finite trusted-executable policies.

Windows shortcut elevation is scan-bound and confirmation-gated. Only a bounded regular `.lnk` can receive the administrator action. Main records its SHA-256 during mapping, revalidates identity before and after confirmation, rehashes immediately before launch, and passes the expected digest as data to a fixed PowerShell script. That script opens the shortcut with `FileShare.Read`, verifies SHA-256 while the non-write/non-delete share lock remains held, calls `Start-Process -Verb RunAs`, and releases the handle afterward. Store IDs do not receive elevation or reveal actions.

## Search and Action Authorization

`createLauncherCoreSearch()` supports `fuzzysort` and `Fuse.js`, bounded fuzziness and result counts, alphabetical empty-search behavior, instant providers, favorites, exclusions, history, rescan status, and isolated provider failures. Whitespace-only queries follow empty-search behavior. A cancelled or superseded initial scan cannot publish the inert cached index. Excluding an item removes it from both favorite membership and ordering before later favorite writes.

`LauncherActionStore` is the execution boundary:

- internal items contain finite handler keys and arguments; public items contain display data and opaque `launcher-action:*` IDs;
- IDs are bound to renderer role, `webContents.id`, result set, source extension, and a short TTL;
- publishing a replacement set evicts the previous owner's actions;
- invocation checks owner, expiry, result-set freshness, and exact shape, then consumes the ID before dispatch; finite provider/effect adapters enforce native confirmation, not the action store itself;
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

`launcher-preload.cjs` exposes only search/invoke/cancel, surface/local settings reads, theme/locale subscriptions, history recording, dismiss/open-settings, and finite trusted-extension view/event/close/status/trust/first-use operations. Opening a command is action-mediated; there is no renderer-selected generic session-open API. Composition is bundled, and rescan is an action.

Settings snapshot/update/import/export/reset and native selection/revocation live on the canonical workbench's `dshDesktop.launcher.settings` bridge in `src/preload.ts`, guarded by workbench main-frame/origin ownership—not the launcher's file URL and dedicated session. Neither bridge exposes raw `ipcRenderer`, arbitrary channels, secrets, native-picker grant paths, or generic native capabilities.

## Network Boundary

Main-owned JSON requests are limited to the built-in HTTPS provider destinations used by currency data, DeepL, and Google/DuckDuckGo suggestions. Callers pass an exact expected origin and pathname; redirects are rejected; request bodies are capped; response bodies are streamed with a 1 MiB limit and strict UTF-8/JSON parsing; cancellation closes readers.

Host resolution must contain only public addresses and is capped at 32 results. The DNS preflight is not a transport-level address pin, so it is not treated as the sole SSRF defense: fetched origins are immutable built-in HTTPS hosts, TLS validates the requested hostname, and user-defined Custom Web Search engines are opened as browser navigation rather than fetched or read by Electron main. Do not generalize `requestJson()` to accept user-configured origins without adding connection-bound address validation.

DeepL keys stay encrypted and main-owned. They never enter renderer snapshots, logs, exports, result labels, or error payloads.

## Settings and Persistence

### Per-Extension Settings

Open **Settings → TockLauncher → Extensions → <Extension>**. The searchable directory contains every built-in identity in `LAUNCHER_COMPOSITION` and all three reviewed compatibility descriptors (27 destinations at this baseline). Search accepts names and setting labels; the directory and forms are localized in English and Chinese. **General Settings** retains shared search, appearance, lifecycle, browser, storage and update controls; provider editors and DeepL's write-only key belong to their individual extension pages.

**Extension Settings** in a launcher's result action menu or active compatibility-command header opens that exact canonical page. Ctrl/Cmd+, still opens TockLauncher settings. Navigation accepts only finite identities; it grants no command, filesystem or installation authority. Unavailable and no-options extensions keep their destinations and saved compatibility values.

Editors stay mounted while moving between extensions or General Settings. Rejected text/JSON, workflow and folder drafts remain editable; Escape or leaving Settings offers **Keep Editing** or **Discard and Leave** when changes remain unsaved. A pending write is not an accepted snapshot. Existing storage/import/export/reset scope is unchanged and does not include the separate compatibility preference files.

Google Translate exposes **Languages**, **Behavior** and **Network**. **Advanced → Proxy Override** accepts only an explicit HTTP/HTTPS URL without credentials; **Use System Proxy** clears it. Detected system proxies never enter settings snapshots. Legacy private overrides are redacted and retained unless explicitly cleared or replaced. Language defaults do not reset saved language sets. Kaomoji exposes **Display Mode** and **Primary Action**. Can I Use exposes display preferences and pinned exact **Browser Targets**, not automatic/workspace selectors.

Compatibility reads and writes use the workbench-guarded `getExtension`, `updateExtension` and `setExtensionEnabled` methods. Main selects the existing stores. Opening a page neither starts a child nor installs/enables an artifact. Enablement remains an explicit operation over approved installed trust state. Canonical and command-inline writers share serialized, opaque revision-fenced updates; conflicts preserve drafts and **Refresh Settings** merges unchanged fields before another save. Changing enablement never acknowledges a newer preference revision. Preference changes take effect on the next command invocation.

`src/launcher-extension-settings.ts` is an inert finite presentation/ownership catalog, not a plugin loader or form engine. `scripts/trusted-raycast-settings-catalog.mjs --check` verifies language and browser-target choices against admitted pinned data. Run `node scripts/launcher-extension-settings-proof.mts` after the build/runtime staging for hidden Electron component, real preload/IPC, isolated persistence, draft recovery, locale/theme/layout and next-invocation proofs. It never takes foreground control and cleans its full process trees.

### Storage Ownership

The generated catalog contains 100 reviewed settings rows plus two internal keys (`favorites` and `searchEngine.excludedItems`), for 102 runtime keys. `launcher-setting-keys.ts` and `launcher-settings-contract.ts` accept only these keys and typed, bounded values. `launcher-settings-model.ts` distinguishes editable, status-only, and internal values: compatibility hotkey spelling, automatic-rescan/interval, language, and theme rows are not independent runtime controls. Lifecycle/custom-browser controls disable inapplicable platforms; discovery folder fields remain editable compatibility data even for another platform.

DSH ThemeService owns appearance. Main projects `{ mode, skinId, revision }`; the isolated launcher uses reviewed skin tokens or built-in light/dark tokens and ignores older revisions. Canonical locale is projected separately as English or Chinese. Stored Ueli theme/language fields do not override those services.

Sensitive values use Electron `safeStorage`. Main-owned browser path/name fields cannot be written by the renderer or imported. Imports omit main-owned and sensitive values while preserving the existing encrypted secret; exports omit both classes.

```text
<userData>/launcher/
  settings.json
  settings.json.bak
  search-index.json
  search-index.json.bak
  logs.json
  logs.json.bak
  usage-ranking.json
  usage-ranking.json.bak
  external-settings-grant.json
  external-settings-transaction.json
  external-backups/
  custom-browser-grant.json
  application-icons/
  trusted-raycast-trust.json
  trusted-raycast-preferences.json
  trusted-raycast-state.json
  trusted-raycast-install/
    current/
    previous/
    stage/
    kaomoji-search/{current,previous,stage}/
    can-i-use/{current,previous,stage}/
```

Translate retains the unsuffixed compatibility filenames above. Kaomoji Search and Can I Use use `trusted-raycast-{trust,preferences,state}-<extensionId>.json`; paths are main-selected, and not every feature writes every file.

Persistence rules:

- the managed launcher root must be a real directory, never a pre-existing symlink; POSIX establishes `0700` through a checked directory handle, while Windows relies on inherited app-data ACLs rather than claiming to establish an owner-only ACL;
- exports retain existing user-selected directory permissions while creating private files; managed writes still enforce private directory permissions;
- settings, index, logs, usage ranking, grants, and transactions are bounded and independently validated;
- managed writes use exclusive no-follow temporary files, file synchronization, atomic rename, directory synchronization, and validated backups;
- mutations are serialized; usage ranking updates in memory before best-effort persistence so opening-screen search never waits on disk, and reset fencing prevents stale writes from restoring cleared usage;
- the inert cached index drops dynamic image data and acquires no authority until current actions are republished;
- external grants bind canonical path, canonical parent, device, and inode;
- startup revalidates path/handle identity and canonical parent path; grants do not persist a parent-directory inode;
- same-inode external content drift durably retires the stale grant rather than overwriting editor changes or re-adopting the file on restart; reselection is required;
- export rejects the active external file and hard-link aliases;
- external saves stage `next.json` in a private sibling directory and persist a version-2 journal with previous/next grants and the previous-content SHA-256;
- main renames the selected file to sibling `previous.json`, checks the displaced content, then publishes the new inode by hard link; this fails rather than overwriting an intervening editor save, but deliberately creates a brief missing-path interval;
- backup/grant updates, file and directory synchronization precede transaction cleanup; conflicting editor/recovery versions remain beside the selected file;
- startup supports legacy version-1 journals and version-2 missing-path/published recovery only while the persisted grant still authorizes the transaction;
- unsupported platforms expose external files as read-only and reject mutation before touching the selected file.

Node has no portable descriptor-relative compare-and-replace primitive. External publication is therefore not an atomic replacement with uninterrupted destination availability: displacement plus no-overwrite publication preserves conflicting versions rather than claiming a race-free save. Keep this confined to the user-selected file in its user-writable parent; never widen it to privileged/shared-directory mutation.

Preferences for all three compatibility features are validated and saved through main. Translate/Kaomoji cached state is different: the trusted child writes a main-selected state path through `useCachedState`. Both use bounded regular-file reads and validated atomic writes. Translate uses its dedicated compatibility module, a 512 KiB serialized limit, and at most 128 saved language sets validated against the pinned language catalog; invalid cached files are ignored without being rewritten on load.

## Lifecycle

`LauncherLifecycleController` maps compatibility settings onto one Desktop owner:

- one optional tray, dock visibility, the launcher shortcut, always-on-top, visible-on-all-workspaces, and startup visibility;
- `show` and `centerWindow` reuse the overlay;
- About, Extensions, and Settings route to the existing workbench;
- rescan invalidates provider/action state before rebuilding the index;
- main-frame document navigation, including a same-URL reload, revokes actions and provider ownership without discarding the reusable window; same-document and subframe navigations do not count as document replacement;
- Workflow cancellation awaits the command effect's bounded cleanup before returning; POSIX shell exit also drains its process group, preventing ordinary background children from keeping inherited pipes alive. This is not confinement against escaped process groups, nor a Windows Job Object guarantee;
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
dist/trusted-raycast/artifact.tar
dist/trusted-raycast/build.json
dist/trusted-raycast/child.mjs
dist/trusted-raycast/resolution.mjs
dist/trusted-raycast/google-translate.png
```

The same `artifact.tar`, `build.json`, `child.mjs`, and `resolution.mjs` files are emitted under `dist/trusted-raycast-kaomoji/` and `dist/trusted-raycast-can-i-use/`, with `kaomoji-search.png` and `can-i-use.png` respectively.

`scripts/build.mjs` unconditionally uses all three repository-owned reviewed archives. It does not read `TRUSTED_RAYCAST_ARTIFACT_TAR`; that variable belongs to selected verification/tracer workflows, not ordinary build selection. `scripts/trusted-raycast-build.mjs` verifies the archive before extracting or compiling, emits the attested child and resolver, copies the reviewed icon, and preserves the admitted archive bytes.

The Electron package is `@tockteam/desktop@0.1.14`, product name `TockTeam Desktop`, application ID `ai.deepseek.tockteam-desktop`, with ASAR packaging and all three compatibility directories plus launcher files explicitly admitted by `package.json`. Native display surfaces use `TockTeam`; package/bundle identity remains `TockTeam Desktop`. The staged DSH and Node runtimes remain extra resources owned by the unified TockTeam distribution. The proven compatibility-child baseline is Node `24.20.0`; a stale staged Node 26 runtime fails the existing `playTTS` regression gate and must be fully restaged, not treated as passing build evidence. `--quick` currently refreshes Desktop bundles only and does not upgrade an existing Node binary; use `DSH_DESKTOP_NODE_VERSION=24.20.0 node scripts/stage-dsh.mjs` when replacing that runtime.

`scripts/install-mac.mjs` and `scripts/install-windows.mjs` perform validated pending-copy/extraction, atomic promotion, backup, rollback, and cleanup. The Windows installer creates the fresh destination's parent before acquiring its exclusive lock. Their lock directories contain process ownership metadata; stale takeover uses an exclusive recovery claim and revalidates the same owner and inode before replacement, so a dead installer's lock is recoverable while a live installer remains exclusive.

Installed evidence is described by `scripts/ueli/installed-evidence-catalog.json`. Checked-in reports prove only their recorded platform, commit, identity, lifecycle, and security observations. Workflow configuration is not execution proof; signing, notarization, and public distribution require their own evidence.

## Verification

Use the smallest focused tests first. Run typecheck/build for code changes; broader source, package, and installed gates have distinct cost and evidence scopes:

```bash
pnpm typecheck
pnpm test
pnpm run build
pnpm audit:ueli-package-feasibility
pnpm audit:installed-evidence
node --test tests/trusted-raycast-*.test.ts
node scripts/launcher-electron-smoke.mjs --trusted-raycast
pnpm test:launcher:electron
pnpm test:launcher:packaged
```

On macOS, run `pnpm test:launcher:electron` only for changes affecting Electron, launcher behavior, preload/IPC, packaging, or a required final Desktop smoke—not for isolated browser styling. Run `pnpm test:launcher:installed` only after focused checks pass and once for the final evidence commit, with `TOCKTEAM_INSTALLED_SMOKE_TEMP_ROOT` inside a `.noindex` cache directory. Never run installed smokes concurrently, and stop every Electron app, server, and child process started for verification. Standard Electron keyboard smokes bring windows to the foreground: obtain immediate explicit permission first, or use a bounded inactive proof and state its narrower coverage.

The root `node:test` suite contains focused contracts for IPC, ownership, provider races, native effects, persistence recovery, settings, renderer behavior, packaging, installers, and evidence freshness. Mutation-style package tests reject missing assets, dependency drift, stale evidence, unsafe paths, and widened authority.

## Maintenance Rules

- Preserve the Desktop/Web/TUI ownership boundaries and DSH Profile + Loader as the only composition mechanism.
- Keep provider additions finite: schema, main adapter, renderer projection, assets/notices, tests, build admission, and packaging evidence must change together.
- Never expose a generic command, path, IPC channel, network destination, plugin loader, or executable selector to the launcher renderer.
- Keep React external/singleton and use public `@tockteam/ui/<component>` exports.
- Keep all UI labels in Title Case and body copy in sentence case; preserve semantic tokens, native semantics, visible focus, and reduced motion.
- Update this document when the Ueli pin, composition, workspaces, trust boundary, platform support, persistence protocol, or evidence scope changes.
