# Plan: Close the Remaining TockTutor Parity Gaps

## Decision

Create a remaining-gaps-only plan. Keep `.beads/plans/tocktutor-migration-plan.md` as the architectural and historical migration plan. Extend the existing TockTutor plugins rather than creating feature-specific plugins.

## Problem

TockTeam already has the secure TockTutor substrate:

- `tockbot-note-runtime` as the active-vault and filesystem authority;
- `@tockteam/note-vault-tools` for the eight existing read-tool contracts;
- `@tockteam/tocktutor-workbench` for the Host Remote and `/tocktutor` browser route;
- `tockbot-note-desktop` plus TockTeam Desktop owners for native authority;
- `@tockteam/tocktutor-assistant` for Pennivo-backed turns and reviewed writes;
- `@tockteam/tocktutor-import-export` for reviewed bulk mutations;
- `tockbot-web-clip` for public-network fetch, Reader View, and reviewed clipping;
- `@tockteam/tocktutor` for aggregate composition.

The current workbench is materially smaller than the bounded shipped Tockbot product. Composition tests and package gates prove that the plugin seams exist; they do not prove parity for the rich editor, discovery views, Canvas/Base editing, capture workflows, local state compatibility, or real Desktop behavior.

## Solution

Freeze a capability ledger from `/Users/max/projects/tockbot/.agents/reference/tocktutor.md`, mark already-proven TockTeam rows complete, and implement only unproven rows as vertical slices through the existing owners. Each slice must be usable through the real `/tocktutor` Desktop route and must leave focused regression evidence.

The final gate is not “all packages build.” It is: every bounded shipped capability has reproducible evidence in a fresh staged TockTeam Desktop using copied disposable user data, and the old Tockbot route can be removed separately without reducing behavior or recoverability.

## Design Read

TockTutor is a repeated-use Desktop writing and knowledge-navigation workspace. Preserve TockTeam’s existing visual system and native Desktop authority while prioritizing information density, keyboard flow, visible save/recovery state, exact-source editing, and predictable pane ownership. Reuse TockTeam UI primitives; do not recreate Tockbot application chrome or introduce a new visual system.

## Scope

### Included

- Every currently shipped, bounded local-first Desktop workflow documented by the Tockbot TockTutor reference.
- Compatibility for existing Markdown, Canvas, Base, attachments, drafts, snapshots, trash, backups, workspaces, settings, and reviewed-write state where valid.
- Focused tests, real route checks, staged/package checks, and real Desktop evidence.
- Updates to existing package source, generated payloads, manifests, composition, and the TockTeam TockTutor reference when a slice changes the current contract.

### Excluded

- Mobile, hosted sync, cross-device sync, shared-vault collaboration, Publish, accounts, MFA, billing, and team administration.
- Community plugins, a public plugin API, executable user plugins/themes, browser extensions, and an Obsidian-compatible CLI.
- OneNote-native Graph/OAuth import.
- Broad Obsidian or Pennivo parity beyond the bounded shipped Tockbot contract.
- A second metadata database, agent loop, plugin system, vault authority, or import transaction engine.
- Removing the Tockbot route in the same change that establishes parity; removal remains a separate reviewable change.

## Implementation Decisions

1. **No new plugins by default.** Add a plugin only if the capability ledger proves an independent trust boundary, lifecycle, service contract, or separately installable capability that none of the existing owners can coherently hold.
2. **One vault authority.** `tockbot-note-runtime` remains the only active-vault filesystem writer and the source of vault identity, generation, recovery, and mutation events.
3. **One browser owner.** `@tockteam/tocktutor-workbench` owns browser-facing editor, navigation, discovery, Canvas/Base UI, capture UI, settings, and local presentation state.
4. **Native authority remains outside browser code.** Extend or consume `tockbot-note-desktop` and the existing TockTeam Desktop owners; never expose absolute paths, Electron objects, native handles, generic IPC, or unrestricted route names.
5. **Existing specialist packages stay specialist.** Assistant, import/export, and web clip behavior stays in their current packages. The aggregate package remains composition-only.
6. **Pure logic stays ordinary code.** Port Tockbot-owned Markdown, Canvas, Base, search, link, serializer, and formatter helpers as ordinary modules with provenance and focused tests. Do not turn parsers or UI domains into Cordis services.
7. **Reuse before rewriting.** Inspect the Tockbot implementation and tests for each ledger row, then extract the smallest behavior-complete module graph. Do not copy the Tockbot shell or duplicate an implementation already present in TockTeam.
8. **Preserve compatibility names.** Existing package names, profile names, Remote names, slot names, service names, data roots, and package versions remain compatibility contracts until an explicit release decision changes them.
9. **Generated payload discipline.** Change `src/`, rebuild tracked `lib/`/`dist/`, and regenerate `plugins/tocktutor/build-manifest.json`; never hand-edit generated payloads.
10. **Finish in vertical slices.** A slice includes UI, Remote/runtime calls, persistence, cleanup, tests, generated output, and real-consumer evidence needed for one user workflow.

## Source of Truth and Lifecycle

| Concern | Source of Truth | Owner |
| --- | --- | --- |
| Vault identity and generation | Runtime state | `tockbot-note-runtime` |
| Vault files and mutations | Local filesystem through runtime | `tockbot-note-runtime` |
| Read-tool contracts | Runtime-backed adapter | `@tockteam/note-vault-tools` |
| Browser route and editor state | Workbench controller plus bounded per-vault UI state | `@tockteam/tocktutor-workbench` |
| Electron/native operations | Caller-bound Desktop owners | TockTeam Desktop + `tockbot-note-desktop` |
| Agent proposals and audit | Assistant proposal/audit state | `@tockteam/tocktutor-assistant` |
| Bulk review plans | Import/export transaction state | `@tockteam/tocktutor-import-export` |
| Public-network fetch and clip review | Web Clip Host state | `tockbot-web-clip` |
| Composition order | Desktop profile and aggregate patch | `src/profile.ts` + `@tockteam/tocktutor` |

Every asynchronous result that can outlive navigation captures the originating vault generation, note/document identity, editor or route revision, and owning external resource where applicable. Durable Host work may finish for its original identity, but stale results must not mutate current browser state. Cordis registrations and external resources use the active context and one complete disposer.

## Testing Decisions

### Test-First Rule

For every non-trivial issue:

1. Add the smallest public-behavior test that fails before the change.
2. Run that focused test and record the RED result.
3. Implement the minimum behavior.
4. Re-run the focused test, the touched package typecheck/build, and the applicable workspace gate.
5. Verify browser-visible changes with `playwright-cli` against the real route.
6. Verify Electron/native behavior through the real disposable Desktop harness or packed Desktop smoke.
7. Stop every app, server, browser session, and child process started for verification.

### Package Commands

```sh
pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-workbench test
pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-workbench typecheck
pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-workbench build

pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-import-export test
pnpm -C plugins/tocktutor --filter tockbot-web-clip test
pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-assistant test
```

Use the narrowest matching command first; run only the packages touched by the slice before the workspace gate.

### Workspace and Root Gates

```sh
pnpm run install:tocktutor
pnpm run typecheck:tocktutor
pnpm run test:tocktutor
pnpm run build:tocktutor

pnpm run typecheck
pnpm test
pnpm run build
```

For profile, composition, runtime, staging, or packaged-client changes:

```sh
pnpm run build:dsh
pnpm run stage:dsh
pnpm run smoke:web
pnpm run smoke:runtime
```

A configuration dump, unit test, or package build is not real-consumer proof. Native picker, menu, protocol, pop-out, microphone, print/export, webview, and unload behavior require the applicable real Desktop path.

## Delivery Plan

### Phase 0 — Freeze What Is Actually Missing

#### `tockteam-3t5.1` — Freeze the Remaining TockTutor Capability Ledger

Create the executable acceptance ledger, fixture vault, persisted-state inventory, source revision record, current TockTeam evidence map, and owner map. Documentation claims alone do not count as proof.

**Acceptance:** Every bounded shipped row has one owner and one status; exclusions remain exclusions; fixtures cover normal, recovery, compatibility, and hostile-input cases.

**Verification:** Ledger validation, fixture self-check, `git diff --check`.

**Dependencies:** None.

### Phase 1 — Daily Writing and Local State

#### `tockteam-3t5.2` — Complete the Daily Workbench Shell

Extend the current route/session implementation with the missing file-explorer, command-palette, tab, pane, focus, status, navigation-history, and dirty-transition behavior.

**Acceptance:** The real Desktop route supports the bounded daily shell without losing dirty work; keyboard/focus/narrow-layout states are verified.

**Verification:** Focused workbench route/component tests, workbench package gates, `playwright-cli` route flow.

**Dependencies:** `tockteam-3t5.1`.

#### `tockteam-3t5.3` — Add Source-Preserving Live Preview Editing

Add per-tab Live Preview using ordinary workbench modules for tasks, comments, callouts, folds, properties, and source recovery.

**Acceptance:** Three modes persist per tab; edits preserve exact Markdown outside the intended range; conflicts and stale results remain recoverable.

**Verification:** Focused editor component tests, workbench package gates, browser route flow.

**Dependencies:** `tockteam-3t5.2`.

#### `tockteam-3t5.4` — Restore Bounded Rich Markdown Rendering

Port the bounded Reading/Slides/export behavior for footnotes, math, Mermaid, highlights, safe raw HTML, line-break modes, and initial embed projections.

**Acceptance:** Valid fixtures render consistently; malformed or excessive content stays inert/readable; export cannot fetch unreviewed resources.

**Verification:** Pure renderer tests, workbench package gates, HTML/PDF Desktop evidence.

**Dependencies:** `tockteam-3t5.3`.

#### `tockteam-3t5.5` — Restore Editor Commands and Table Interactions

Add shipped formatting, slash, line, fold, table, hotkey, selection, drag/drop, and preview interactions through existing editor and command owners.

**Acceptance:** Supported Source/Live Preview commands match the ledger; table edits preserve structure/history; keyboard and pointer behavior remain accessible.

**Verification:** Focused pure/component tests plus `playwright-cli` keyboard/pointer flows.

**Dependencies:** `tockteam-3t5.3`.

#### `tockteam-3t5.6` — Restore Local Vault Management Workflows

Expose runtime-owned recent/create/open/remove/sandbox behavior through the workbench and caller-bound picker.

**Acceptance:** No browser-provided absolute paths; dirty failures stop switching; canonical recent-vault and legacy state compatibility are proven.

**Verification:** Runtime/Remote/component tests and real Desktop picker/switch flow.

**Dependencies:** `tockteam-3t5.2`.

#### `tockteam-3t5.7` — Complete Recovery and External-Change Workflows

Build the recovery UI over existing draft, snapshot, trash, restore, watcher, conflict, and retention capabilities.

**Acceptance:** Crash/restart, external edits, conflicts, trash, and restores preserve recovery; stale recovery requests cannot affect a new note/vault.

**Verification:** Temporary-directory runtime tests, component tests, destructive real Desktop recovery flow.

**Dependencies:** `tockteam-3t5.6`.

#### `tockteam-3t5.8` — Restore Workbench Settings and Workspace State

Add only settings required by shipped workflows, named workspaces, recently closed tabs, hotkeys, graph settings, and safe scoped CSS snippets.

**Acceptance:** State is bounded/versioned/per-vault; malformed state falls back safely; CSS cannot import or fetch resources.

**Verification:** Persistence/parser tests, component tests, restart/workspace browser flow.

**Dependencies:** `tockteam-3t5.2`, `tockteam-3t5.6`.

### Phase 2 — Discovery and Knowledge Navigation

#### `tockteam-3t5.9` — Restore Quick Switcher and Vault Search

Use runtime-backed reads and Tockbot-owned pure helpers for bounded keyword/Related search, aliases, jumps, operators, history, explain/copy, and stale-vault cancellation.

**Acceptance:** Fixture queries match the bounded Tockbot contract; large/changing files yield explicit bounded results; Quick Switcher uses the canonical save gate.

**Verification:** Search fixtures, Remote/component tests, real route search/switcher flow.

**Dependencies:** `tockteam-3t5.1`, `tockteam-3t5.2`.

#### `tockteam-3t5.10` — Restore Outline and Relationship Navigation

Port the shared non-parsing boundary and expose Outline, Footnotes, Backlinks, Outgoing Links, mentions, link creation, jumps, and Page Preview.

**Acceptance:** Link/heading/reference/code/HTML fixtures agree with Tockbot; rewrites preserve concurrent edits; navigation is generation-bound and accessible.

**Verification:** Pure scanner/rewriter tests, workbench package gates, browser navigation flow.

**Dependencies:** `tockteam-3t5.4`, `tockteam-3t5.9`.

#### `tockteam-3t5.11` — Restore Smart Views and Tags

Add Recent, Tasks, Journals, Favorites, Collections, and Tags over one bounded cancellable Markdown hydration path.

**Acceptance:** Fixture view membership and tag projections match; partial unreadable results remain useful; stale scans stop scheduling.

**Verification:** Pure model tests, component tests, large-fixture browser flow.

**Dependencies:** `tockteam-3t5.9`.

#### `tockteam-3t5.12` — Restore Property Workflows

Add File/All Properties, safe value/type editing, daily links, keyboard selection, and recoverable vault-wide rename.

**Acceptance:** Supported types round-trip without YAML corruption; failed bulk rename rolls back or reports partial recovery; focus behavior is tested.

**Verification:** Frontmatter/property tests, runtime conflict tests, component keyboard flow.

**Dependencies:** `tockteam-3t5.3`, `tockteam-3t5.11`.

#### `tockteam-3t5.13` — Restore Bookmark Workflows

Add one bounded per-vault store for note, folder, search, graph, heading, block, and credential-free link bookmarks.

**Acceptance:** Bookmark navigation reuses canonical owners; moves/renames follow supported targets; malformed/excessive/cross-vault data fails safely.

**Verification:** Bookmark model/component tests and browser drag/navigation flow.

**Dependencies:** `tockteam-3t5.8`, `tockteam-3t5.10`.

#### `tockteam-3t5.14` — Restore Global Graph and Local Graph

Add deterministic bounded graphs over shared link/tag/attachment projections with filters, groups, depth, context actions, highlighting, zoom/pan, and finite layout.

**Acceptance:** Fixture topology/actions match; layout is deterministic and reduced-motion safe; excluded/stale/excessive inputs degrade explicitly.

**Verification:** Pure graph/layout tests, component accessibility tests, browser graph flow.

**Dependencies:** `tockteam-3t5.10`, `tockteam-3t5.11`, `tockteam-3t5.13`.

### Phase 3 — Capture, Composition, and Assets

#### `tockteam-3t5.15` — Restore Journals, Templates, and Quick Capture

Add collision-safe journals, template creation/insertion, formatted date/time, Unique Notes, and session-bound Inbox capture.

**Acceptance:** Safe configured paths and exclusive creates; byte-preserving insertion; late capture completion cannot affect a new dialog session.

**Verification:** Formatter/template tests, runtime create tests, browser and menu capture flows.

**Dependencies:** `tockteam-3t5.3`, `tockteam-3t5.6`, `tockteam-3t5.8`.

#### `tockteam-3t5.16` — Restore Highlights and Capture Organization

Add pasted Highlights plus reviewed single/batch Inbox organization without a second records database.

**Acceptance:** Deterministic generation-bound previews; changed/oversized sources and collisions remain non-destructive; metadata stays valid YAML.

**Verification:** Pure planner tests, runtime review/create tests, browser review flow.

**Dependencies:** `tockteam-3t5.9`, `tockteam-3t5.15`.

#### `tockteam-3t5.17` — Restore Note Composer and Format Converter

Add extract, merge, leftovers, template wrapping, active-note conversions, and reviewed vault-wide Zettelkasten conversion.

**Acceptance:** Links, source mtime, recovery, templates, and vault identity remain bound; fenced/non-parsing fixtures agree with Tockbot.

**Verification:** Pure transform tests, temporary-directory conflict/recovery tests, browser review flow.

**Dependencies:** `tockteam-3t5.10`, `tockteam-3t5.15`.

#### `tockteam-3t5.18` — Restore Attachment and Audio Workflows

Add picker/paste/drop/external links, previews, audio handoff, attachment locations, and exact append behavior over the runtime and existing microphone owner.

**Acceptance:** Concurrent names preserve all payloads; late results cannot affect a new identity; types, bytes, no-follow reads, and cleanup are bounded.

**Verification:** Asset/runtime tests, editor component tests, real picker/drop/microphone/preview flow.

**Dependencies:** `tockteam-3t5.3`, `tockteam-3t5.6`, `tockteam-gfj`.

### Phase 4 — Canvas, Bases, and Cross-Mode Embeds

#### `tockteam-3t5.19` — Restore Canvas Card and Group Editing

Extend the existing Canvas parser/projection with conflict-safe cards, groups, selection, geometry, creation, movement, resize, duplication, deletion, and rollback.

**Acceptance:** Unknown fields survive; duplicate IDs/unsafe links/excessive geometry/stale revisions fail closed; failed saves restore the prior board.

**Verification:** Pure Canvas mutation tests, workbench component tests, real route edit flow.

**Dependencies:** `tockteam-3t5.1`, `tockteam-3t5.2`.

#### `tockteam-3t5.20` — Restore Canvas Edge Interactions

Add accessible connection creation, empty-drop cards, edge selection, labels/colors/deletion, reconnection, marquee/mixed movement, and zoom-aware gestures.

**Acceptance:** Identity and extension data survive; failed saves leave no phantom objects; pointer/keyboard/cancel behavior matches fixtures.

**Verification:** Pure edge tests, component gesture tests, browser Canvas flow.

**Dependencies:** `tockteam-3t5.19`.

#### `tockteam-3t5.21` — Port the Bounded Base Evaluator

Port the Tockbot-owned non-`eval` Base grammar as ordinary workbench modules with provenance and the exact supported formula/function/type/summary/icon manifest.

**Acceptance:** Supported vectors pass; hostile, malformed, excessive, filesystem, network, dynamic import, and JavaScript evaluation paths fail closed; no new plugin is added.

**Verification:** Pure evaluator manifest tests and workbench package gates.

**Dependencies:** `tockteam-3t5.1`.

#### `tockteam-3t5.22` — Restore Executable Base Views

Build table/list/cards/map-label views with current-view search, filter/sort/limit, summaries, copy/CSV, cell navigation, and supported conflict-safe frontmatter edits.

**Acceptance:** Fixture views execute without destructive normalization; serializers use visible rows; formulas and unsupported cells remain read-only.

**Verification:** Pure executor/serializer tests, component tests, real Base edit/export flow.

**Dependencies:** `tockteam-3t5.3`, `tockteam-3t5.21`.

#### `tockteam-3t5.23` — Integrate Note, Media, Canvas, and Base Embeds

Use shared target-stable projectors across Reading, Live Preview, Source, Slides, HTML, and PDF rather than duplicating parsers per mode.

**Acceptance:** Supported embeds are consistent and source-preserving; all target/content/nesting/aggregate limits apply; stale/unsafe/cyclic targets remain inert.

**Verification:** Cross-mode fixture tests, component stale-result tests, HTML/PDF evidence.

**Dependencies:** `tockteam-3t5.4`, `tockteam-3t5.18`, `tockteam-3t5.19`, `tockteam-3t5.22`.

### Phase 5 — Existing Specialist and Native Owners

#### `tockteam-3t5.24` — Complete Web Viewer Parity

Extend `tockbot-web-clip` and its existing client contribution with bounded persistent tabs, Reader preferences, bookmark handoff, active-tab navigation, and reviewed Save to Vault.

**Acceptance:** Restored tabs are revalidated and isolated; Reader View is the only text projection path; DNS/redirect/size/cancel failures remain closed and cleaned up.

**Verification:** Web Clip package tests, isolated-frame Desktop smoke, browser viewer/reader/clip flow.

**Dependencies:** `tockteam-3t5.1`, `tockteam-3t5.13`.

#### `tockteam-3t5.25` — Close Remaining Import and Compatibility Gaps

Extend the existing import/export engine only for ledger-proven gaps such as Apple Notes/Notion delegation, Craft source selection, passive backup compatibility, and one-time state readers.

**Acceptance:** Every shipped entry point reaches the existing review transaction; changed sources and partial commits preserve evidence; copied Tockbot data opens without bulk conversion.

**Verification:** Import/export package tests, disposable reviewed-operation harness, copied-profile restore flow.

**Dependencies:** `tockteam-3t5.1`, `tockteam-3t5.6`.

#### `tockteam-3t5.28` — Prove Assistant and Reviewed-Write Parity

Run the ledger against `@tockteam/tocktutor-assistant` and implement only unproven shipped gaps in settings, selected-text prefill, production turns, bounded read tools, exact-child/vault binding, proposal review, continuation, audit compatibility, and cleanup. Preserve the current Pennivo child and proposal engine.

**Acceptance:** A real configured turn proves bounded reads and accurate tool status; no write occurs before approval; approved writes retain identity, recovery, digest, expiry, and audit bindings; stale child/vault/route work is invalidated.

**Verification:** Assistant package tests and a real disposable Desktop read/propose/approve/reject flow.

**Dependencies:** `tockteam-3t5.1`, `tockteam-3t5.3`.

#### `tockteam-3t5.26` — Finish Native Desktop Integration Tails

Integrate the existing reveal, dispatch/protocol, pop-out, microphone, print/export, route-token, and release owners into the final workbench. Do not recreate their channels or services.

**Acceptance:** Trusted-window loading races, stale vault work, unload cleanup, and Desktop-only composition are proven through the real app.

**Verification:** Existing owner tests plus real menu/protocol/pop-out/reveal/microphone/print/export Desktop smoke.

**Dependencies:**

- Plan issues: `tockteam-3t5.2`, `tockteam-3t5.15`, `tockteam-3t5.18`, `tockteam-3t5.24`.
- Existing owner issues: `tockteam-wwe`, `tockteam-6fi`, `tockteam-00u`, `tockteam-zl0`, `tockteam-gfj`, `tockteam-h16`.

### Phase 6 — Convergence and Cutover Proof

#### `tockteam-3t5.27` — Prove Parity and Prepare Tockbot Cutover

Run every capability row against a freshly built/staged Desktop using copied disposable data. Verify install, upgrade, disable, uninstall, rollback, accessibility, destructive recovery, packaging, and cleanup. Prepare—do not combine—the separate Tockbot removal change.

**Acceptance:** Every included ledger row has reproducible focused and real-Desktop evidence; upgrade/rollback preserves data; Tockbot removal no longer reduces behavior.

**Verification:** All package/workspace/root/staging gates plus the complete real Desktop capability matrix.

**Dependencies:** `tockteam-3t5.5`, `tockteam-3t5.7`, `tockteam-3t5.8`, `tockteam-3t5.12`, `tockteam-3t5.14`, `tockteam-3t5.16`, `tockteam-3t5.17`, `tockteam-3t5.20`, `tockteam-3t5.23`, `tockteam-3t5.25`, `tockteam-3t5.26`, `tockteam-3t5.28`.

## Dependency Shape

```text
Capability Ledger
  ├─ Workbench Shell
  │   ├─ Live Preview ─┬─ Rich Markdown ─┬─ Relationship Navigation ─┬─ Graph
  │   │                ├─ Editor Commands │                           └─ Bookmarks
  │   │                ├─ Properties      └─ Cross-Mode Embeds
  │   │                └─ Capture / Assets / Composer
  │   ├─ Vault Management ─┬─ Recovery
  │   │                    ├─ Settings / Workspaces
  │   │                    └─ Import Compatibility
  │   ├─ Search ─┬─ Smart Views / Tags
  │   │          └─ Relationship Navigation
  │   ├─ Canvas Cards / Groups ── Canvas Edges
  │   └─ Base Evaluator ── Base Views
  ├─ Web Viewer
  ├─ Existing Assistant ── Assistant Parity Proof
  └─ Existing Native Owners ── Native Integration

All required slices ── Parity and Cutover Proof
```

## Parallelization

After `tockteam-3t5.1` freezes the ledger and `tockteam-3t5.2` stabilizes the shell contract:

- Canvas and Base work can proceed independently.
- Vault recovery, search, and editor rendering can proceed in separate worktrees if they do not share the route controller in the same change.
- Import/export and Web Viewer work can proceed independently in their existing packages.
- Only one writer should modify the workbench route/controller at a time; other work should land as pure modules and focused components behind agreed props/contracts.
- Native integration waits for the existing owner issues rather than duplicating them.

## Checkpoints

### Checkpoint A — Contract Frozen

- `tockteam-3t5.1` complete.
- Existing implementation evidence is distinguished from documentation claims.
- No excluded capability has entered scope.

### Checkpoint B — Daily Writing Safe

- Workbench shell, three editor modes, vault management, recovery, and settings/workspaces pass through the real route.
- Dirty work and stale results cannot cross note or vault identities.

### Checkpoint C — Knowledge Navigation Complete

- Search, links, views, properties, bookmarks, and graph agree with fixtures.
- Large-vault and partial-result behavior remains bounded.

### Checkpoint D — Structured and Capture Workflows Complete

- Capture, assets, Canvas, Bases, and embeds pass focused and real route checks.
- No new filesystem, model, or browser-native authority exists.

### Checkpoint E — Packaged Desktop Proven

- Specialist packages and existing native owners are integrated.
- Full gates and copied-profile workflows pass.
- Tockbot removal is ready as a separate change.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| The Tockbot reference is broad and historically layered | Duplicate or obsolete work | Capability ledger records exact current behavior, source revision, existing proof, and one owner before implementation. |
| Workbench route becomes a monolith | Slow changes and stale-state bugs | Keep route orchestration thin; port pure helpers and focused components as ordinary modules, not new services. |
| Multiple sessions edit the same controller | Merge conflicts and inconsistent state | One writer owns route/controller changes; parallel work lands behind stable contracts or isolated worktrees. |
| Browser UI gains native or filesystem authority | Security regression | Runtime/Desktop owners perform authority-bearing work; browser sends bounded relative identities only. |
| Rich Markdown/Base parsing becomes unbounded | Memory/CPU or execution risk | Preserve Tockbot limits and non-`eval` grammars; malformed/excessive input remains visible and unsupported. |
| Generated payloads drift from source | Packaged behavior differs from tests | Build from source, regenerate the manifest, and run the build-manifest/staged-client gates for every package slice. |
| Unit tests overstate parity | Cutover ships missing workflows | Every UI/native slice includes real route or Desktop evidence; final acceptance runs the capability matrix. |
| User state migration damages data | Data loss | Read compatible old formats or perform one-time bounded imports on copied profiles; never bulk rewrite vault content. |
| Existing native work is duplicated | Conflicting channels and ownership | `tockteam-3t5.26` depends on and integrates `tockteam-wwe`, `tockteam-6fi`, `tockteam-00u`, `tockteam-zl0`, `tockteam-gfj`, and `tockteam-h16`. |

## Beads

- Epic: `tockteam-3t5`
- Children: `tockteam-3t5.1` through `tockteam-3t5.28`
- Plan path: `.beads/plans/2026-08-26-tocktutor-parity-gaps.md`

Use `bd show tockteam-3t5 --long` for the epic and `bd show <child-id> --long` for each behavior-first issue body and full acceptance criteria.
