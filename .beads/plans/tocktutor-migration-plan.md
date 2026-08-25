# TockTutor Migration Master Plan

## Purpose

Port the complete **current TockTutor product boundary** from `/Users/max/projects/tockbot` into **TockTeam Desktop** as DeepSeek Harness (DSH) Cordis capabilities without creating a second agent loop, plugin system, filesystem authority, or hosted vault backend.

This document is the overall migration plan. It is intentionally independent of any issue tracker.

## Definition of “Entire TockTutor”

“Entire TockTutor” means the shipped and bounded local-first Desktop behavior documented in:

- `/Users/max/projects/tockbot/.agents/reference/tocktutor.md`
- `/Users/max/projects/resources/.tutor/obsidian.md`

It does **not** mean implementing every unchecked Obsidian parity row. Mobile, hosted sync, Publish, accounts, team collaboration, payments, arbitrary community plugins, a public plugin API, OneNote-native import, an Obsidian-compatible CLI, and broad headless vault access remain excluded unless a later scope decision explicitly adds them.

## Outcomes

The migration is complete when:

1. TockTeam Desktop can open the native `/tocktutor` workbench and perform every currently shipped TockTutor workflow inside the documented boundary.
2. One Host service owns active-vault identity and all local vault reads and mutations.
3. Browser code never receives unrestricted filesystem or Electron authority.
4. Agent writes remain staged, reviewable, generation-bound, and audited.
5. TockTeam’s pinned DSH Profile + Loader remains the only composition system.
6. The old Tockbot TockTutor route can be retired without data conversion or loss.
7. Existing Markdown, Canvas, Base, attachment, draft, snapshot, trash, backup, workspace, and settings data remain compatible or have a tested migration.

## Target Runtime

| Field | Target |
| --- | --- |
| Distribution | `/Users/max/projects/tockteam` |
| DSH revision | `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` |
| DSH version | `0.1.1-rc.2` |
| Primary surface | TockTeam Desktop |
| Composition | DSH profiles, Cordis plugins, and bundle patches |
| Vault storage | Ordinary local files |
| Product route | `/tocktutor` |
| Source behavior oracle | `/Users/max/projects/tockbot` |

Revalidate DSH service, browser-client, remote transport, and cleanup APIs against the pinned checkout before implementing each plugin seam.

## Architectural Decisions

### One Vault Authority

`tockbot-note-runtime` is the authoritative Host-side vault capability. It owns:

- active and recent vault identity;
- canonical containment and path validation;
- safe reads, writes, creation, moves, renames, and link rewrites;
- tree enumeration and filesystem watching;
- conflict detection, atomic replacement, and exclusive destination claims;
- drafts, snapshots, trash, and recovery;
- bounded search, backlinks, and metadata hydration;
- accepted attachment storage and preview reads;
- mutation events and vault-generation changes.

No client or sibling plugin may perform direct vault filesystem operations.

### Host and Client Stay Separate

The TockTutor browser client contributes the workbench UI through `dsh.client`. It calls typed Host capabilities through the transport supported by the pinned DSH/TockTeam runtime. It must not recreate Tockbot’s broad `window.electronAPI.notes.*` bridge or expose arbitrary path-string IPC.

### Desktop Authority Stays in TockTeam

Folder/file dialogs, OS reveal, menus, protocol registration, pop-out windows, microphone permission, and PDF printing remain Desktop-only capabilities. Web and TUI must not emulate them.

### Existing Read Tools Are Preserved

`tockbot-note-vault` remains the standalone read-only plugin and contract reference. TockTeam should load a thin runtime-backed tool adapter rather than a second filesystem scanner. Preserve these tool names and response contracts unless an explicit compatibility change is approved:

- `vault_search`
- `vault_read`
- `vault_list`
- `vault_links`
- `vault_outline`
- `vault_graph`
- `vault_canvas`
- `vault_facets`

### Pure Logic Is Not a Plugin

Markdown parsing/rendering helpers, Base evaluation, Canvas transformations, query parsing, link rewriting, and serializer logic should be ordinary modules or shared libraries. Create a Cordis plugin only for an independent service, trust boundary, lifecycle, or installable capability.

## Plugin Map

| Package | Shape | Ownership |
| --- | --- | --- |
| `tockbot-note-runtime` | Host Cordis service | Active vault, filesystem safety, mutations, recovery, indexing, events |
| `@tockteam/note-vault-tools` | Host consumer | Existing read-only model tools over `tockbot-note-runtime` |
| `@tockteam/tocktutor-workbench` | Host + browser client | Route, editor, readers, panes, session state, Canvas/Base UI |
| `@tockteam/tocktutor-desktop` | Desktop-only Host/client adapter | Native dialogs, protocol, menus, pop-outs, audio permission, print/export |
| `@tockteam/tocktutor-assistant` | Host + browser client | Inline assistant, Pennivo MCP, staged writes, review queue, audit UI |
| `@tockteam/tocktutor-import-export` | Host + browser client | Reviewed imports, backup, restore, conversion, export workflows |
| `@tockteam/tocktutor-web-clip` | Host + browser client | Hardened public-network fetch, Reader View, Web Viewer, clip preview |
| `@tockteam/tocktutor` | Patch-only bundle | Dependency order and Desktop profile composition |

Do not mount Desktop-only TockTutor behavior in the TockTeam Web or TUI profiles. A later read-only tool-only composition may be enabled separately where its Host dependencies exist.

## Service Contract Direction

The initial `tockbot-note-runtime` public service should stay small and capability-oriented. Final method names and wire schemas must be verified against the pinned DSH checkout, but the service needs these cohesive faces:

| Face | Required Behavior |
| --- | --- |
| Vault identity | State, activation, recent vaults, generation token, stable vault ID |
| Documents | Tree, bounded open, create, conflict-aware save, rename, move, duplicate |
| Discovery | Search, links, backlinks, outline, graph records, metadata/statistics |
| Attachments | Accepted media metadata, bounded preview, exclusive asset save |
| Recovery | Drafts, snapshots, trash, restore, retention |
| Transactions | Expected-vault checks, expected-modified checks, exclusive create, rollback evidence |
| Events | Vault changed, tree changed, entry changed, recovery changed |

Every asynchronous operation that can outlive navigation must carry or capture the active-vault generation. Stale results may finish their original durable Host operation but must not mutate the newly active client state.

## Security and Data-Loss Boundaries

These requirements are migration blockers, not cleanup work:

1. Canonicalize one explicit vault root and reject traversal, absolute note paths, NULs, drive-qualified relative settings, directory symlink ancestors, and vault escapes.
2. Use descriptor-backed no-follow reads where replacement races matter; compare opened and final identities before accepting bytes.
3. Keep byte, entry, depth, result, metadata, and parser-complexity bounds.
4. Preserve safe in-vault file-alias behavior only where the current TockTutor contract explicitly permits it. Never traverse directory symlinks.
5. Use atomic writes and modification-time conflict checks for updates.
6. Use exclusive final claims for creates, imports, assets, trash destinations, and other collision-sensitive operations.
7. Capture recovery before destructive overwrite and preserve trash/recovery confirmation flows.
8. Bind reviewed plans to exact vault identity, source identity, destinations, skipped entries, and content digests.
9. Keep agent writes behind staged approval and an append-only local audit record. Never expose absolute vault paths or full proposed content in model-visible staging results.
10. Restrict Web Clip requests to normalized credential-free public HTTP(S) destinations and revalidate every redirect and resolved address.
11. Render export content without network, local-file, blob, or unreviewed subresource access.
12. Treat persisted settings, drafts, queues, snapshot metadata, manifests, recent-vault records, and workspace state as untrusted bounded local data.

## Migration Principles

- Port behavior and focused tests, not Tockbot’s application shell.
- Keep Tockbot as the behavior oracle until the matching TockTeam slice passes.
- Preserve source provenance for Pennivo-adapted helpers and third-party notices.
- Prefer deletion from Tockbot only after TockTeam verification, never during initial extraction.
- Keep compatibility adapters temporary and explicit.
- Do not introduce Convex, a vault database, background sync, or a second metadata source of truth.
- Do not claim broader Obsidian or Pennivo parity than the current TockTutor contract.
- Each slice must be usable through the real TockTeam Desktop surface before the next dependent slice begins.

## Delivery Sequence

### Phase 0 — Freeze the Contract and Evidence

**Goal:** establish a reproducible source and acceptance baseline before moving behavior.

Work:

- Record the Tockbot source commit and TockTeam/DSH target revisions.
- Inventory TockTutor Host modules, browser modules, tests, settings keys, local data paths, and notices.
- Convert the current TockTutor reference into a capability-to-owner matrix without copying its historical change log.
- Record representative fixture vaults for Markdown, Canvas, Base, attachments, aliases, symlinks, drafts, snapshots, trash, and imports.
- Capture current Tockbot behavior with focused tests and a small set of real Desktop workflows.

Acceptance:

- Every shipped TockTutor capability has one target plugin owner.
- Every persisted artifact has a compatibility or migration decision.
- Excluded Obsidian rows remain explicitly excluded.
- No implementation starts from an unpinned DSH API assumption.

### Phase 1 — Read-Only Vault Runtime Tracer

**Goal:** prove one real vault can be activated and read through an injectable DSH service.

Work:

- Create `tockbot-note-runtime` as a Host service plugin.
- Implement validated configuration and active-vault state.
- Port canonical containment, verified reads, bounded tree enumeration, and vault-generation identity.
- Expose one thin client-safe state/tree/open path.
- Add the runtime-backed read-tool adapter for the existing tool contracts.
- Compose both into a disposable TockTeam Desktop profile.

Acceptance:

- A real TockTeam Desktop session selects or receives a configured vault, lists it, opens a Markdown note, and survives plugin unload/reload.
- Traversal, outside symlinks, replacement races, unsupported files, and over-limit reads fail closed.
- The eight read-only tools return fixture-derived results through the runtime rather than scanning independently.

### Phase 2 — Conflict-Safe Editing Tracer

**Goal:** edit, save, create, rename, move, and delete one note without data loss.

Work:

- Port expected-vault and expected-modified identities.
- Port atomic update, exclusive create, snapshots, trash, restore, and link-rewrite planning.
- Add runtime change events and watcher cleanup.
- Build a minimal workbench route with file tree, note selection, Source editor, save status, and conflict UI.

Acceptance:

- The real Desktop flow creates, edits, saves, renames, moves, trashes, and restores a note.
- Concurrent modifications produce a recoverable conflict instead of overwrite.
- Vault switching is blocked by failed dirty-note persistence.
- Unload removes watchers and registrations.

### Phase 3 — Native Workbench and Editor Parity

**Goal:** move the normal daily writing surface.

Work:

- Port the `/tocktutor` shell, titlebar, status bar, command palette, Files pane, note tabs, split groups, focus mode, and workspace layout state.
- Port Reading, Live Preview, and Source modes using TockTutor-owned Markdown helpers.
- Port frontmatter properties, tags, tasks, comments, callouts, tables, folding, footnotes, math, Mermaid, media embeds, note embeds, Canvas embeds, and Base embeds.
- Port bounded hotkeys, cursor/selection semantics, drag/drop, page preview, templates, journals, unique notes, and Note Composer actions.
- Reuse TockTeam themes/layout primitives rather than recreating Tockbot chrome.

Acceptance:

- Representative notes render and edit equivalently in all three modes.
- Markdown remains the source of truth and selected widgets reveal exact source.
- Dirty-save and stale-result guards hold across tabs, panes, note changes, and vault changes.
- Keyboard and accessibility checks cover the primary workbench paths.

### Phase 4 — Discovery and Knowledge Navigation

**Goal:** restore TockTutor’s vault navigation and relationship workflows.

Work:

- Port bounded search and Related search.
- Port Quick Switcher, Random Note, Smart Views, Tags, Properties, Bookmarks, Outline, Footnotes, Backlinks, Outgoing Links, and unlinked mentions.
- Port Global Graph and Local Graph with deterministic bounded layout, filters, groups, missing/tag/attachment nodes, and context actions.
- Keep hydration cancellable and partial-result behavior explicit.

Acceptance:

- Search, links, graph, tags, properties, and smart views agree with fixture expectations.
- Large or changing files do not force unbounded allocation or stale client replacement.
- Graph layout is deterministic and does not run a permanent physics loop.

### Phase 5 — Recovery, Lifecycle, and Vault Management

**Goal:** preserve local-first resilience and state compatibility.

Work:

- Port active/recent vault persistence, sandbox vault, vault creation, and switching.
- Port drafts, timed/manual snapshots, File Recovery, trash modes, retention, and recovery settings.
- Port workspace/session mementos, recently closed tabs, per-vault settings, graph settings, and CSS snippet state.
- Add one-time migration readers only where Tockbot and TockTeam data roots differ.

Acceptance:

- Existing vault files require no content migration.
- Persisted local state is bounded, validated, and either compatible or migrated once.
- Crash/restart, clock skew, stale async responses, and vault switching preserve recoverability.

### Phase 6 — Canvas and Bases Editing

**Goal:** restore structured local document workflows without arbitrary execution.

Work:

- Port JSON Canvas validation, duplicate-ID rejection, cards, groups, edges, geometry, connection/reconnection, selection, duplication, and conflict-aware saves.
- Port Base YAML parsing, views, bounded filter trees, sorting, summaries, frontmatter edits, named formulas, composite literals, and inert result export.
- Keep formulas non-`eval`, row-local, deterministic, and resource-bounded.

Acceptance:

- Existing Canvas/Base fixtures open without destructive normalization.
- Mutations preserve unknown document fields.
- Unsupported or excessive Base syntax fails closed with a visible unsupported state.
- No evaluator path reaches filesystem, network, dynamic import, or JavaScript evaluation.

### Phase 7 — Capture, Assets, and Export

**Goal:** restore everyday inbound and outbound note workflows.

Work:

- Port Quick Capture, Highlights, organize-capture, attachments, image paste/drop, external file links, and audio recording.
- Port bounded attachment preview and OS reveal.
- Port static Reading HTML, HTML export, PDF export, Base CSV/TSV, and redacted debug information.
- Keep completion results bound to their originating vault, note, editor revision, and renderer session.

Acceptance:

- Concurrent same-name assets are preserved through exclusive claims.
- Late picker/recorder/export results cannot mutate a new note or vault.
- PDF and HTML export cannot fetch network or local-file subresources.

### Phase 8 — Reviewed Import, Backup, and Restore

**Goal:** move high-risk bulk mutations behind deterministic review plans.

Work:

- Port Markdown folder/ZIP and Craft delegation first.
- Port HTML, CSV, Apple Journal, Bear, Evernote, Google Keep, Roam Research, and Textbundle/Textpack adapters.
- Port versioned backup export, manifest verification, and restore compatibility.
- Centralize preview-token, digest, destination, and exclusive-commit primitives in the import/export plugin while keeping final writes in the vault runtime.

Acceptance:

- Every importer produces a bounded deterministic preview before mutation.
- Changed sources or plans fail before the first vault write.
- Commit-time collisions preserve concurrent vault files and report skipped outputs.
- Backup restore verifies the complete declared set and rejects recursive source/vault relationships.

### Phase 9 — Hardened Web Viewer and Web Clip

**Goal:** restore research and clipping without widening the Host network boundary.

Work:

- Port credential-free URL normalization, public-IP validation, pinned DNS resolution, redirect revalidation, response bounds, Reader View, Web Viewer session tabs, bookmarks, and Save to Vault review.
- Keep sandboxed page frames isolated from application origin and filesystem authority.
- Reuse the vault runtime only after user approval of the generated Markdown preview.

Acceptance:

- Loopback, private, link-local, credential-bearing, malformed, redirected-private, and oversized targets fail closed.
- Reader View does not introduce a second untrusted HTML-rendering path.
- Saved clips retain source attribution and use the configured safe vault-relative folder.

### Phase 10 — Assistant and Staged Agent Writes

**Goal:** restore AI-assisted notes without direct model mutation authority.

Work:

- Package and launch the reviewed Pennivo MCP dependency without runtime downloads.
- Port inline assistant provider/model settings and prompt context bounds.
- Port read tools over the vault runtime.
- Port create/update staging, one-use review queue, approval/rejection, snapshots, audit log, and write-permission transitions.
- Bind every request to vault generation and exact MCP child identity.

Acceptance:

- Read calls cannot escape the active vault.
- Write requests cannot modify a file before explicit approval.
- Create approval is exclusive; update approval checks expected identity and captures recovery.
- Vault switches, permission changes, child replacement, queue tampering, and stale review tokens fail closed.
- No executable is downloaded at runtime.

### Phase 11 — Desktop Integration

**Goal:** complete native TockTeam Desktop behavior.

Work:

- Port application menu actions, trusted main-window dispatch, `tocktutor:` protocol handling, callbacks, pane targets, pop-out lifecycle, OS reveal, file/folder pickers, microphone permission, and print integration.
- Route all behavior through TockTeam Desktop’s restricted Host/preload authority.
- Keep Web/TUI behavior unavailable rather than emulated.

Acceptance:

- Menu and protocol actions survive window creation/loading races.
- Untrusted or auxiliary windows cannot receive privileged actions.
- Newer protocol requests supersede stale vault-switch work.
- Navigation/origin checks, context isolation, sandboxing, and deny-by-default permissions remain intact.

### Phase 12 — Convergence, Cutover, and Removal

**Goal:** make TockTeam the sole supported TockTutor host.

Work:

- Run the full capability matrix against Tockbot and TockTeam fixtures.
- Verify packaging, install, upgrade, disable, uninstall, and rollback.
- Verify existing vaults and persisted local state on a copied real profile.
- Move user-facing docs and support ownership to TockTeam.
- Freeze Tockbot TockTutor changes during final convergence.
- Remove the old route and duplicate Host code only after TockTeam acceptance and backup evidence.

Acceptance:

- No shipped capability lacks an owner or acceptance result.
- No two Host components claim the same vault state or mutation authority.
- TockTeam Desktop passes source gates, package smoke tests, real app workflows, and destructive-flow recovery checks.
- Rollback restores the prior application without touching vault content.
- Tockbot removal is a separate, reviewable change after successful cutover.

## Verification Strategy

### Per-Slice Checks

Each non-trivial slice leaves the smallest focused regression test that proves its behavior. Prefer pure tests for parsers, planners, serializers, and state transitions, plus temporary-directory tests for filesystem boundaries.

Run the target repository’s focused check first, then its gate:

```sh
node --test tests/<focused>.test.ts
pnpm run typecheck
pnpm test
pnpm run build
```

For TockTeam composition, profile, runtime, or packaging changes, also run the applicable target checks:

```sh
pnpm run build:dsh
pnpm run stage:dsh
pnpm run smoke:web
pnpm run smoke:runtime
```

### Real-Consumer Checks

Unit tests, package creation, configuration dumps, and startup logs are insufficient by themselves. Every plugin capability must be exercised through a real disposable TockTeam/DSH consumer with:

- a freshly packed artifact;
- the pinned target runtime;
- non-guessable fixture values;
- successful and fail-closed paths;
- unload/reload cleanup;
- removal of disposable homes, fixtures, and packages afterward.

UI slices require a real TockTeam Desktop run with recorded assertions or screenshots for the relevant workflow. Destructive slices require proof of recovery and preserved concurrent data.

## Compatibility Register

| Artifact | Direction |
| --- | --- |
| Vault Markdown/Canvas/Base files | Remain directly compatible; no bulk conversion |
| Attachments | Remain directly compatible |
| `.trash` content | Preserve and migrate metadata only if storage root changes |
| Drafts and snapshots | Read old bounded format or provide one-time migration |
| Recent vaults and active vault | Import canonical identities into TockTeam data root |
| Workspaces and UI mementos | Version and migrate per vault; reject malformed state |
| Agent staged-write queue | Preserve only pending entries that pass identity and size validation |
| Agent audit log | Preserve append-only history or archive with documented location |
| Pennivo provenance/notices | Preserve reviewed version, source anchor, and license notice |
| Read-only tool contracts | Preserve names and response shapes |

## Release Gates

A release candidate cannot ship until all applicable gates pass:

- Target DSH revision and profile composition verified.
- Typecheck, tests, build, and package smoke checks pass.
- Real TockTeam Desktop workflows pass on a disposable profile.
- Trust-boundary regressions cover traversal, symlinks, replacement races, stale generations, conflicts, oversized inputs, invalid persisted state, and cleanup.
- Accessibility covers keyboard operation, focus ownership, labels, dialogs, and reduced motion for migrated UI.
- Third-party licenses and adapted-source provenance are present.
- Upgrade and rollback are tested against copied user data.
- Documentation states actual supported scope and does not claim unchecked Obsidian parity.

## Deferred Work

Do not add these during the migration unless separately approved:

- mobile TockTutor;
- hosted or cross-device vault sync;
- shared-vault collaboration;
- hosted Publish;
- accounts, MFA, billing, or team administration;
- arbitrary community plugins, themes, or executable CSS/plugin payloads;
- a public TockTutor plugin API;
- OneNote-native Graph/OAuth import;
- Obsidian CLI/headless parity;
- a second metadata database or Convex-backed vault source of truth;
- automatic background backup writes;
- runtime package downloads.

## Final Definition of Done

The migration is done only when the current bounded TockTutor product runs natively in TockTeam Desktop, uses `tockbot-note-runtime` as its sole vault Host authority, retains reviewed agent-write and network boundaries, preserves existing user data, passes real packaged-app verification, and the old Tockbot implementation can be removed without reducing supported behavior or recoverability.
