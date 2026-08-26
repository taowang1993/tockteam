# TockTutor Plugin Reference

## Purpose

TockTutor is the Desktop-only note workspace distributed with TockTeam. It is not a second agent runtime. The packages under `plugins/tocktutor/` compose through the pinned DSH Loader and Cordis services, while TockTeam Desktop retains all Electron and native authority.

The target runtime is DSH `0.1.1-rc.2` at revision `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`. Package names, versions, Remote names, Cordis service names, slot names, profile names, and existing data roots are compatibility contracts.

## Composition

The Desktop profile applies these bundles in order:

```text
@deepseek-ai/dsh-base
  -> @tockteam/tocktutor
  -> @deepseek-ai/dsh-web-app
  -> @tockteam/desktop
```

`@tockteam/tocktutor` is the aggregate bundle. Its `cordis.patch.yml` inserts:

```text
tockbot-note-runtime
  -> @tockteam/note-vault-tools
  -> @tockteam/tocktutor-workbench
  -> tockbot-note-desktop
  -> @tockteam/tocktutor-assistant
  -> @tockteam/tocktutor-import-export
  -> tockbot-web-clip
```

`tockbot-note-vault` remains an aggregate dependency because the runtime imports its inspection library, but its standalone tool row is intentionally not inserted. `@tockteam/note-vault-tools` exposes the same eight tool contracts against the active runtime without registering duplicate tools.

The Web and TUI profiles do not mount TockTutor or Desktop authority.

## Package Catalog

| Package                             | Version | Runtime Role                                                   |
| ----------------------------------- | ------: | -------------------------------------------------------------- |
| `tockbot-note-vault`                | `0.6.0` | Standalone read-only tool bundle and shared inspection library |
| `tockbot-note-runtime`              | `0.1.2` | Active-vault filesystem and recovery authority                 |
| `@tockteam/note-vault-tools`        | `0.1.2` | DSH tool adapter over the active runtime                       |
| `@tockteam/tocktutor-workbench`     | `0.1.7` | Host Remote plus the main browser route and editor             |
| `tockbot-note-desktop`              | `0.1.2` | Desktop-native Host/client adapter                             |
| `@tockteam/tocktutor-assistant`     | `0.1.5` | Bound assistant, read tools, and reviewed write proposals      |
| `@tockteam/tocktutor-import-export` | `0.1.1` | Reviewed import, backup, restore, and conversion workflows     |
| `tockbot-web-clip`                  | `0.1.2` | Hardened public fetch, Reader View, and reviewed clipping      |
| `@tockteam/tocktutor`               | `0.1.1` | Aggregate bundle only                                          |

## Package Responsibilities

### `tockbot-note-vault`

`index.js` is a standalone read-only plugin that injects `tools`. `inspection.js` is also the parser and bounded inspection library consumed by `tockbot-note-runtime`.

The public tools are:

- `vault_search`
- `vault_read`
- `vault_list`
- `vault_links`
- `vault_outline`
- `vault_graph`
- `vault_canvas`
- `vault_facets`

The package accepts a root plus read, search-byte, search-entry, per-file, and result limits. It rejects traversal, hidden paths, symbolic-link paths, type changes, and unsafe direct reads. Canvas URLs, Base expressions, external links, attachments, and Markdown syntax are inspected as inert data; the plugin performs no network fetches and exposes only attachment metadata.

The aggregate bundle does not activate this package's tool row. It retains the package for `tockbot-note-vault/inspection` and contract parity tests.

### `tockbot-note-runtime`

`src/index.ts` provides the `noteVault` Cordis service. It is the sole active-vault filesystem writer and owns:

- active and recent vault state;
- bounded tree, document, attachment, and inspection access;
- exclusive create and revision-bound save operations;
- draft, snapshot, trash, restore, move, duplicate, and link-rewrite recovery;
- filesystem watching and the `note-vault/change` event;
- Desktop reveal and caller-bound vault-selection seams.

It also defines the abstract `tockTeamDesktopReveal` and `tockTeamDesktopVaultSelection` services. TockTeam Desktop supplies their native implementations. The aggregate row sets `vaultRoot: null`; Desktop selection activates a vault instead of accepting browser-provided absolute paths. Before a native action, the Runtime synchronizes an already authorized managed, sandbox, or recent vault through the authenticated Desktop owner; canonical paths never cross the browser or preload boundary. The Desktop bundle evaluates `stateRoot` under `DSH_DESKTOP_APP_DATA/tocktutor`, so recent-vault bindings, drafts, snapshots, trash metadata, and managed-vault state survive Desktop restarts without writing into the workspace.

The runtime can activate opaque recent selections, create a collision-safe sandbox, and create named managed vaults under the state root. Attachment storage creates missing relative parent folders one segment at a time, revalidates each as a real in-vault directory, and binds the final parent identity before the exclusive write. Its passive-backup seam exposes only generation-bound, no-follow reads and exclusive restores for an inert allowlist under exact `.obsidian` and `.obsidian-*` roots. Hidden nested paths, aliases, links, executable/native/script payloads, and platforms without no-follow support fail closed.

Important configuration includes read, attachment, draft, folder, tree, recent-vault, snapshot, state-root, vault-root, and restore limits. Keep their maximums intact.

### `@tockteam/note-vault-tools`

`src/index.ts` injects `tools` and `noteVault`. It registers the same eight public tool contracts as the standalone vault package, but every call is bound to the current `{ id, generation }` vault reference and forwards the tool `AbortSignal`.

This package is an adapter, not another filesystem implementation. Do not duplicate inspection or mutation logic here.

### `@tockteam/tocktutor-workbench`

The Host entry injects `noteVault` and mounts the `tocktutorWorkbench` Typert Remote. `src/host-read.ts` validates browser input before delegating bounded tree, document, snapshot, trash, create, and save operations to the runtime.

The browser client mounts that Remote and contributes the single `tockteam.tocktutor.route` slot. The route owns:

- the `/tocktutor` browser route, bounded tabs, recently closed tabs, pinning, reordering, pane groups, focus mode, workspaces, and command palette;
- Markdown Source, Live Preview, Reading, Slides, owner-compatible inert HTML/PDF projection, formatting/slash/table commands, Page Preview, and exact-source task toggles;
- tree, keyword/Related search, Quick Switcher, Outline, Footnotes, Backlinks, Outgoing Links, unlinked mentions, Properties, Tags, Smart Views, bookmarks, capture, templates, journals, Note Composer, and reviewed organization;
- deterministic finite Global and Local Graphs with persisted depth, semantic filters, query groups, viewport controls, and bounded node actions;
- conflict-safe JSON Canvas and executable Base views, including card/group/edge edits and revision-preserving rollback;
- bounded note, media, Canvas, and Base embed hydration while keeping authored embed source editable, with exact paths preferred over an unambiguous basename fallback;
- attachment ingestion, previews, location settings, and recorded-audio handoff through the Desktop microphone owner;
- draft recovery, timed/manual snapshots, external-change preservation, trash, restore-as-new, and retention;
- native dispatch handling and the nested assistant, native-action, review-panel, and Web Viewer slots.

The route accepts only Markdown, Canvas, and Base documents. Authored raw HTML is escaped; the renderer inserts only its sanitized Markdown projection. Local, credential-bearing, resource, and executable links remain inert.

Nested slots:

- `tockteam.tocktutor.workbench.assistant`
- `tockteam.tocktutor.workbench.native-actions`
- `tockteam.tocktutor.workbench.review`

Native dispatches are invalidated by newer navigation. Protocol requests that name a vault are rejected because the browser route cannot verify a human vault name against the active opaque vault identity; cross-vault protocol routing must be implemented by a trusted Host owner before it can be enabled.

### `tockbot-note-desktop`

The Host entry refuses non-Desktop surfaces and mounts the `tocktutorDesktop` Remote. It injects the TockTeam Desktop caller, picker, pop-out, microphone, print/export, reveal, vault-selection, and note-runtime services.

The client contributes the **Native Actions** controls for:

- **Choose Vault**
- **Reveal Entry**
- **Open Pop-Out** and **Close Pop-Out**
- **Close All Pop-Outs**
- **Request Microphone**
- **Print Note**
- **Export HTML** and **Export PDF**

Every native operation starts with an opaque authorization minted by the isolated preload for the trusted main frame. For vault-bound operations, the authorization records the browser-observed opaque `{ id, generation }`; the trusted Host independently proves the same live Runtime vault, synchronizes the Desktop owner, and only then claims the authorization to obtain the main-owned session, window, and operation identity. A browser assertion cannot mint vault authority by itself. Browser payloads never supply absolute paths, Electron objects, native handles, or unrestricted IPC names.

Unload aborts pending work and closes pop-outs opened by the adapter. Dirty editors save before choose-vault, pop-out, print, HTML, or PDF authorization is claimed. Print and export content is bounded, sanitized, stripped of network-bearing resource attributes, and rendered through the shared Markdown exporter before the Desktop owner revalidates it. The Host resolves first-level embeds through generation-bound runtime reads: note projections render safely, Canvas and Base sources stay escaped, bounded supported images become data URLs, and audio/video/PDF embeds remain metadata-only. Recorded audio returns only bounded bytes to the active Workbench owner, which rechecks the note and vault after byte conversion before the runtime stores it.

### `@tockteam/tocktutor-assistant`

`NoteAssistant` is a Cordis service injecting `agents`, `noteVault`, `settings`, `storageDomain`, `subprocess`, and `tools`. It owns:

- assistant provider/model/write-permission settings;
- production agent-turn binding;
- a restricted Pennivo MCP child process;
- active-turn read tools;
- proposal-only `create_file` and `write_file` tools;
- persisted proposals and bounded audit records;
- explicit approval/rejection and continuation routing;
- the browser-safe `tocktutorAssistant` Remote and assistant panel.

The child process receives a scrubbed environment, an empty temporary workspace, bounded JSON-RPC lines and requests, timeouts, restart limits, and lifecycle cleanup. It never receives direct vault filesystem authority.

`writePermission` is `read-only` or `propose`. Proposed writes are bound to the exact vault generation, child instance, agent turn, request, provider, model, permission epoch, source revision, target revision, digest, expiry, and user approval. Only `tockbot-note-runtime` performs the accepted mutation and snapshot-backed save. A decision keeps a transient reference to the exact live originating Agent so approval or rejection can submit one bounded follow-up; a stale Agent cannot revive the write or alter the durable audit result.

### `@tockteam/tocktutor-import-export`

The Host gateway injects `noteVault`, `tockTeamDesktopCaller`, and `tockTeamDesktopPicker`. It owns reviewed import, restore, and backup engines plus the review-panel client contribution.

Supported inputs include Markdown folders and ZIPs, HTML with bounded media/PDF resources, CSV, Apple Journal, Bear, Evernote, Google Keep, Roam Research, Textbundle/Textpack, and TockTutor backup archives. Craft, Notion, Apple Notes, and compatible exports delegate to the reviewed Markdown or HTML paths instead of adding parser stacks.

The transaction is:

```text
trusted caller authorization
  -> opaque Desktop source/destination grant
  -> bounded inspection and conversion
  -> immutable preview and digest
  -> explicit approval
  -> source/vault revalidation
  -> exclusive runtime writes or destination publication
  -> bounded result and recovery evidence
```

ZIP parsing rejects traversal, aliases, symbolic links, executable entries, unsupported flags/methods, malformed headers, CRC mismatches, excessive depth, entry count, member size, aggregate size, parser time, and compression ratio. Backup archives use deterministic manifest version 3. Passive configuration is hashed and stored under opaque archive member names, follows the same inspect-preview-approve-apply transaction, and restores only through the runtime seam. Version-2 archives without passive members remain restorable.

Existing vault files are never overwritten. Multi-file imports report committed, skipped, failed, and recovery-required entries rather than claiming rollback after partial success.

### `tockbot-web-clip`

`WebClipHost` provides the `webClip` service. It injects `noteVault` when available and conditionally injects `webServer` plus `tockTeamSurface` to register Desktop-only routes:

- `POST /web-clip/api/viewer`
- `POST /web-clip/api/reader`
- `POST /web-clip/api/clip/review`
- `POST /web-clip/api/clip/apply`
- `POST /web-clip/api/clip/cancel`

The Host accepts only credential-free HTTP(S), rejects local/private/reserved addresses and mixed DNS results, pins each request to a validated address, revalidates redirects, bypasses ambient proxies, disables compression, and bounds URLs, addresses, redirects, headers, bytes, decoded text, connection time, total time, and concurrency.

Fetched HTML is reduced to bounded inert Reader text. Viewer HTML escapes the projection before TockTeam Desktop authorizes it for one isolated, script-disabled webview frame. The lifecycle-owned Workbench panel supports persistent tabs, keyboard/drag reordering, Reader text size/width/spacing/appearance, shared bookmarks, and settings-backed clipping. API requests require same-origin POST JSON with bounded bodies.

Clipping creates a one-use, expiring, digest-bound, destination-bound, vault-generation-bound preview. The browser must approve the exact preview before the runtime performs an exclusive Markdown create.

### `@tockteam/tocktutor`

This package contains no agent loop or feature implementation. It is the installable aggregate bundle and pins all component versions. Keep its dependency list and `cordis.patch.yml` order synchronized with profile, staging, package, and composition tests.

## TockTeam Integration Seams

Outside the plugin workspace:

- `src/profile.ts` owns the Desktop aggregate bundle and retires old standalone bundle rows without removing unrelated user bundles.
- `plugins/sidebar/src/client/tocktutor-route.ts` defines the bounded same-origin route contract.
- `plugins/sidebar/src/client/plugin.tsx` mounts the Desktop-only route and app-rail entry.
- `src/main.ts` owns native menus, protocol admission, dispatch delivery, pop-outs, theme lifecycle, and restricted IPC. Pop-outs load the same-origin SPA root before a fixed main-authored History navigation, avoiding direct-route HTTP fallthrough without admitting arbitrary renderer code or routes.
- `src/preload.ts` exposes only the bounded TockTutor bridge.
- `src/desktop-*-owner.ts` modules own native identity, capability, and transaction checks.
- `scripts/stage-dsh.mjs` copies tracked package payloads into the staged runtime.
- `scripts/tocktutor-build-manifest.mjs` rejects source/output drift before staging.

Do not move Electron authority, native path handling, or unrestricted filesystem operations into a browser client or DSH Remote.

## Lifecycle Rules

- Declare required services through `inject`; use `ctx.inject()` only for optional services that may appear or disappear.
- Register tools, events, slots, routes, Remotes, and child plugins through the active Cordis context.
- Own subprocesses, timers, requests, temporary directories, picker grants, and other external resources in one complete `ctx.effect()` disposer.
- Abort and await in-flight work before releasing the underlying authority.
- Revalidate the active vault generation after every authority-bearing await.
- Treat every browser payload, persisted value, fetched document, archive, model result, and child-process message as untrusted.
- Keep install state, review state, approval state, and applied state distinct.

## Parity and Cutover Ledger

`plugins/tocktutor/parity/ledger.json` is the machine-checked capability contract. It preserves all 122 observed rows from the pinned Obsidian checklist, the source's declared-123/observed-122 discrepancy, six additional Tockbot compatibility capabilities, exact owners, repository-relative evidence, and hostile fixtures. After the parity epic, all 88 included checklist rows and all six additional capabilities must be `proven`; the 34 unchecked rows stay `excluded` or `not-needed` rather than being invented as supported behavior.

The in-scope cutover includes Desktop install/upgrade, disable/uninstall/rollback transaction safety, copied-vault compatibility, legacy recent-vault reads, passive configuration backup, accessibility gates, destructive recovery, generated-payload drift checks, packaged Loader composition, and real Electron flows. Retiring the old Tockbot browser route is a separate reviewable change. It removes route and navigation admission only; it does not delete vaults, local settings, backup compatibility, or rollback code.

## Known Operational Limits

The standalone `tockbot-note-vault` filesystem adapter sorts the native directory inventory before producing deterministic cursor pages. Search bytes, inspected entries, files, results, and output remain bounded, but native directory enumeration itself scales with the vault. Split unusually wide vaults or use the active runtime; replace this adapter with a cursorable index only if measured vault size makes enumeration a real bottleneck.

The assistant panel intentionally uses a render-time route epoch to prevent an aborted decision from reviving across an A → B → A navigation. Its component regression test protects that behavior; do not replace it with a route-key-only comparison.

Static export resolves only the first embed level, matching the interactive projection. It does not recursively expand nested embeds or fetch network resources. Audio, video, PDF, BMP, and other non-allowlisted data-image payloads remain labeled metadata because the Desktop print/export owner accepts only bounded AVIF, GIF, JPEG, PNG, and WebP data URLs.

## Generated and Release Payloads

Tracked `lib/` and `dist/` directories are release payloads. Never hand-edit them. Rebuild changed sources through the package scripts, then regenerate `plugins/tocktutor/build-manifest.json`.

The root workspace intentionally excludes `plugins/tocktutor`; that workspace has its own `pnpm-lock.yaml` and pins DSH packages to `.cache/dsh-source/b150a551b8d4`.

## Verification

Run the parity validator and focused package test first, then the TockTutor workspace gates:

```sh
pnpm -C plugins/tocktutor run validate:parity
pnpm run install:tocktutor
pnpm run typecheck:tocktutor
pnpm run test:tocktutor
pnpm run build:tocktutor
```

Then run the root gate:

```sh
pnpm run typecheck
pnpm test
pnpm run build
```

For profile, composition, staging, runtime, or packaged-client changes, also run:

```sh
pnpm run build:dsh
pnpm run stage:dsh
pnpm run smoke:web
pnpm run smoke:runtime
pnpm run dist:mac:quick
pnpm run smoke:app
```

TockTutor Desktop behavior that depends on a real Electron window still needs the applicable packed Loader and Desktop smoke path; unit tests and `--dump-config` do not prove native authorization, isolated Web Viewer frames, picker, microphone, attachment ingestion, pop-out, print, export, managed-vault creation, or restart recovery. Packaged Desktop preserves Electron's standard `--user-data-dir` switch for copied-profile acceptance; without that explicit switch it retains the compatibility data root. Use copied disposable user data for destructive cutover proof and stop every Electron/runtime process afterward.

## Change Checklist

When adding or removing a TockTutor component, update every applicable layer:

1. package manifest, exports, client metadata, and `cordis.patch.yml`;
2. aggregate dependencies and aggregate patch order;
3. `plugins/tocktutor/pnpm-lock.yaml`;
4. root package file allowlist and staging copy list;
5. `src/profile.ts` protected or retired bundle lists;
6. Host/client injections and slot declarations;
7. composition, packed-client, lifecycle, and focused behavior tests;
8. tracked build outputs and `build-manifest.json`;
9. this reference.
