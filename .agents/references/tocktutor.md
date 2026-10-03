# TockTutor Plugin Reference

## Purpose

TockTutor is the Desktop-only note workspace distributed with TockTeam. It is not a second agent runtime. The packages under `plugins/tocktutor/` compose through the pinned DSH Loader and Cordis services, while TockTeam Desktop retains all Electron and native authority.

The current target runtime is the exact published package `@deepseek-ai/dsh@0.1.2-rc.1`, including the tarball and integrity pinned by `dsh-source.json`. Use that file and the package manifests as the version authorities. Package names, versions, Remote names, Cordis service names, slot names, profile names, and existing data roots are compatibility contracts.

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

`tockbot-note-vault` remains an aggregate dependency because the runtime imports its inspection library, but its standalone tool row is intentionally not inserted. `@tockteam/note-vault-tools` exposes the eight `vault_*` contracts plus `notes_search` and `notes_read` compatibility aliases against the active runtime; do not also mount the standalone scanner.

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

The aggregate requires `@tockteam/desktop >=0.1.11 <0.2.0`. Individual peer ranges differ: the Workbench permits Desktop `>=0.1.6 <0.2.0`, while the native and import/export adapters require `>=0.1.11 <0.2.0`. Do not infer aggregate compatibility from the Workbench alone.

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

The package accepts a root plus read, search-byte, search-entry, per-file, and result limits. Its standalone filesystem adapter rejects traversal, hidden paths, symbolic-link paths, type changes, and unsafe direct reads. The runtime-backed inspection provider additionally supports confined, same-kind direct file aliases; directory aliases and aliases leaving the vault remain rejected. Canvas URLs, Base expressions, external links, attachments, and Markdown syntax are inspected as inert data; the plugin performs no network fetches and exposes only attachment metadata.

The aggregate bundle does not activate this package's tool row. It retains the package for `tockbot-note-vault/inspection` and contract parity tests.

### `tockbot-note-runtime`

`src/index.ts` provides the `noteVault` Cordis service. It is the sole active-vault filesystem writer and owns:

- active and recent vault state;
- bounded tree, document, attachment, and inspection access, with persistent keyword-search acceleration;
- exclusive create and revision-bound save operations;
- draft, snapshot, trash, restore, move, duplicate, and link-rewrite recovery;
- filesystem watching and the `note-vault/change` event;
- Desktop reveal and caller-bound vault-selection seams.

It also defines the abstract `tockTeamDesktopReveal` and `tockTeamDesktopVaultSelection` services. TockTeam Desktop supplies their native implementations. The aggregate row sets `vaultRoot: null`; Desktop selection activates a vault instead of accepting browser-provided absolute paths. Before a native action, the Runtime synchronizes an already authorized managed, sandbox, or recent vault through the authenticated Desktop owner; native authority never comes from a browser-supplied canonical path. The Workbench's `currentVault.displayPath` is a display-only exception: roots under HOME are abbreviated, while roots outside HOME may be shown canonically. That string is not a native-action capability.

The Desktop bundle supplies the complete runtime configuration with `restoreActiveVault: true`, `vaultRoot: null`, and `stateRoot` under `DSH_DESKTOP_APP_DATA/tocktutor`; later Cordis row configurations replace rather than deep-merge earlier ones. Recent-vault bindings, drafts, snapshots, trash metadata, and managed-vault state survive Desktop restarts without writing runtime state into the workspace. Selection is persisted atomically in `vault-state/selection.json`; older `vault-state/active`, `vault-state/recent.json`, `notes-vault-path`, and `notes-recent-vaults.json` remain migration inputs.

The runtime can activate opaque recent selections, create a collision-safe sandbox, and create named managed vaults under the state root. Document creation and attachment storage create missing relative parent folders one segment at a time, revalidate each as a real in-vault directory, and bind the final parent identity before the exclusive write. Cancellation after a physical trash move enters the same recovery path as metadata failure; unsuccessful rollback reports the retained destination rather than losing recovery evidence. Its passive-backup seam exposes only generation-bound, no-follow reads and exclusive restores for an inert allowlist under exact `.obsidian` and `.obsidian-*` roots. Hidden nested paths, aliases, links, executable/native/script payloads, and platforms without no-follow support fail closed.

Important configuration includes read, attachment, draft, folder, tree, recent-vault, snapshot, state-root, vault-root, and restore limits. Keep their maximums intact. Defaults include 256 KiB document reads, 25 MiB attachments, 2 MiB drafts, 64 MiB folder operations, a depth-64/20,000-entry tree with 200-result pages, 20 recent vaults, and 20 snapshots retained for 30 days. `stateRoot: null` disables persistent recovery and search storage; `restoreActiveVault` defaults to false outside the Desktop override.

Snapshot retention reserves one slot for the newly captured recovery copy, even when timestamps tie or the system clock moves backwards. Capture, list, read, and clear operations join one queue per vault and note before resolving storage paths, so a later clear cannot finish ahead of a pending capture and an earlier capture cannot republish cleared history. Different notes remain independent, and queued operations recheck cancellation and vault ownership. Original note bytes remain available through the snapshot returned by a save, subject to later retention or explicit clearing. Real-filesystem coverage is in `tockbot-note-runtime/tests/snapshot-retention.test.ts`.

Snapshot body and metadata publication use exclusive writes. A filename collision rejects the new capture while preserving earlier recovery files; an unsuccessful metadata write removes only the body created by that attempt. A complete recovery copy survives a temporary-file cleanup failure after publication. If recovery capture fails before a note save, the note keeps its original bytes. Collision, cleanup-failure, and retry coverage is in `tockbot-note-runtime/tests/snapshot-collision.test.ts`.

Document moves and attachment trash/restore also recheck cancellation and the captured vault after their final source validation, immediately before removing the original entry. Rejection at that boundary preserves the original bytes and removes the exclusively staged destination when its identity is unchanged; unsafe rollback reports the retained destination as a partial result. `tockbot-note-runtime/tests/move-cancellation.test.ts` covers cancellation and vault replacement at that boundary.

Document creation, saves, attachment storage, and passive-configuration restores recheck cancellation and the captured vault after their final asynchronous filesystem validation, before publishing bytes. Cancelling or switching vaults during that validation preserves existing note bytes and removes staged temporary files. The real-filesystem regressions are in `tockbot-note-runtime/tests/write-cancellation.test.ts`.

Folder moves and copies recheck cancellation and vault ownership after destination verification. A move also checks after its final quarantine verification, before deleting the original folder. An interrupted operation restores any quarantined source and reports the retained destination as `partial`; it does not claim that a completed copy was rolled back. Real-filesystem coverage is in `tockbot-note-runtime/tests/folder-cancellation.test.ts`.

Runtime unload withdraws vault authority before asynchronous cleanup starts. Pending note, attachment, and configuration writes must pass the same lifetime check before publication; retained Runtime references cannot reactivate a vault, create a sandbox or managed vault, or change recent selections after unload. Real-filesystem coverage is in `tockbot-note-runtime/tests/disposal-cancellation.test.ts`.

Draft saves, reads, and clears join one queue per vault and note before resolving recovery-storage directories. This preserves their call order even before the first draft directory exists: a clear cannot finish ahead of an older pending save, and a read observes earlier accepted saves. Different notes remain independent; failed saves release the queue, and waiting operations recheck cancellation and vault ownership. Real-filesystem coverage is in `tockbot-note-runtime/tests/draft-ordering.test.ts`.

#### Persistent Search

Filesystem observation uses `chokidar@5.0.0` so atomic note replacement does not strand Linux watches on retired inodes. Initial reads wait for watcher startup; rapid edits settle for 50 ms, and generation/path/symlink checks still guard every publication. Provider disposal awaits current and retired watcher cleanup. Both workspaces apply `patches/chokidar@5.0.0.patch` under `plugins/tocktutor/`: it forwards nonpersistent native errors and cancels write-finish polling on close. Keep both patch bindings/locks and the staged/Nix dependency closure aligned; `tests/tocktutor-watcher.test.ts` runs the packaged-runtime regressions in the root platform matrix.

The runtime uses `flexsearch@0.8.212` with `sqlite3@5.1.7`. Its rebuildable cache lives under `stateRoot/search-index/tocktutor-search-v2/`, keyed by opaque vault ID and filesystem root identity, not inside the vault. It reconciles document revisions on activation, invalidates affected paths on writes/watch events, and drains index work on replacement/disposal. Index and inspection providers use alias-entry revisions consistently; ordinary document opens retain canonical file revisions for safe saves. Initial inventory has a separate 2,000,000-entry ceiling and still obeys document-size and tree-depth limits.

The index supplies candidate paths, not authoritative content: shared inspection rereads candidates and applies the query and output budgets. Unsupported queries, incomplete/not-ready indexes, candidate overflow, unavailable native dependencies, or unsuitable state storage fall back to the bounded scanner. Do not equate successful fallback searches with a working native index, or claim that every search avoids a vault scan.

### `@tockteam/note-vault-tools`

`src/index.ts` injects `tools` and `noteVault`. It registers the same eight `vault_*` contracts as the standalone vault package, plus `notes_search` and `notes_read`. Every call is bound to the current `{ id, generation }` vault reference and forwards the tool `AbortSignal`; generation remains Host-owned rather than becoming model-supplied authority.

This package is an adapter, not another filesystem implementation. Do not duplicate inspection or mutation logic here. The `notes_*` compatibility aliases validate Markdown-only paths, unlike the broader `vault_*` contracts. `notes_search` trims padded queries before runtime normalization and requests a Host-owned Markdown-only search, so Canvas/Base matches cannot invalidate its citation result. Focused adapter and runtime tests cover both contracts.

### `@tockteam/tocktutor-workbench`

The Host entry injects `noteVault` and mounts the `tocktutorWorkbench` Typert Remote. `src/host-read.ts` validates browser input before delegating bounded tree, document, snapshot, trash, create, and save operations to the runtime.

The browser client mounts that Remote and contributes the single `tockteam.tocktutor.route` slot. The route owns:

- the `/tocktutor` browser route, bounded tabs, recently closed tabs, pinning, reordering, pane groups, focus mode, workspaces, and command palette;
- CodeMirror Source, Milkdown Live Preview, Reading, owner-compatible inert HTML/PDF projection, formatting/table commands, exact-source task toggles, and a mounted 20-command Live Preview slash menu (block conversion, links, note creation, attachments, tables, and math);
- tree, keyword/Related search, Quick Switcher, Outline, Footnotes, Backlinks, Outgoing Links, unlinked mentions, Properties, Tags, Smart Views, bookmarks, capture, templates, journals, Note Composer, and reviewed organization;
- deterministic finite Global and Local Graphs with persisted depth, semantic filters, query groups, viewport controls, and bounded node actions;
- conflict-safe JSON Canvas and executable Base views, including card/group/edge edits and revision-preserving rollback; Files can create a default `.base`, and Base controls can add/rename views, change layouts/filters/sort/visible properties/row height, find within the selected view, and create Markdown notes from a Base;
- one cancellable note, media, Canvas, and Base embed resolver with exact-path preference, unambiguous basename fallback, depth-three recursion, cycle/budget guards, and target-stable Source and Live Preview widgets that reveal exact authored source;
- attachment ingestion, previews, location settings, and recorded-audio handoff through the Desktop microphone owner;
- draft recovery, timed/manual snapshots, external-change preservation, trash, restore-as-new, and retention;
- native dispatch handling and the nested assistant, native-action, review-panel, and Web Viewer slots.

The route accepts only Markdown, Canvas, and Base documents. Reading and inert export render a bounded static raw-HTML subset after stack-based sanitization; scripts, handlers, unsafe URLs, active resources, malformed markup, and exhausted budgets remain inert. Local, credential-bearing, and executable links remain inert. Credential-free external content is admitted only through the isolated Web Viewer boundary.

Nested slots:

- `tockteam.tocktutor.workbench.assistant`
- `tockteam.tocktutor.workbench.native-actions`
- `tockteam.tocktutor.workbench.vault-actions`
- `tockteam.tocktutor.workbench.review`
- `tockteam.tocktutor.workbench.web-viewer`

Assistant and Web Viewer slots are single contributions; native-action, vault-action, and review slots are lists. Vault actions supply the vault menu and no-vault entry controls separately from note-bound native actions. Client teardown disposes the route, awaits pending route flushes, and only then unmounts the Remote (`src/client-api.ts`).

Native dispatches are invalidated by newer navigation. TockTeam Desktop resolves current, named, recent, and absolute-path protocol selectors against main-owned canonical vault records, then sends only an opaque vault ID to the Host/client adapter. The Workbench accepts that request only after the selected runtime publishes the matching opaque identity. Tab, split, and window requests retain dirty-save gating and exact completion callbacks. Protocol note creation accepts a name without requiring a separate file selector. Delayed document loads, renames, and selection extraction preserve later navigation and edits; source-offset formatting, date/time insertion, and extraction require Source mode because Live Preview positions are not Markdown offsets.

#### Images, Mermaid, and Imported Properties

**Image Viewer** uses only validated raster data URLs from existing Host-resolved attachments or the hardened public-image proxy. Click an image in Reading, or use **View Image** in Source and Live Preview. Its shared viewer floats the photo over an almost-hidden app using a 95% semantic-canvas dimming layer, without a dialog card or bottom toolbar. A separate title and circular, icon-only X button stay below the native window controls and outside the clipped zoom/pan viewport; the button retains the accessible name Close. Canvas, dimming, text, and controls use the app's semantic appearance tokens. The Desktop shell moves its custom titlebars below the dimming layer only while this viewer is open; closing restores their ordinary stacking. Close-control colors switch immediately with Appearance so an interpolated theme transition cannot wash out the exit. Plus/minus and the wheel provide bounded zoom, dragging and arrow keys pan, zero fits, and Escape, the close button, or the gutter dismiss and restore focus. Browser zoom modifiers remain untouched. Live Preview uses the authored image alt text rather than Crepe's title-derived preview label. Authored URLs and SVG are never passed to the viewer. Note/pane teardown closes it.

**Image Resizing** in Live Preview exposes **Resize** and **Image Width** for supported Host-resolved images. Dragging previews a width; release or a committed numeric change creates a separate Undo step. Widths are bounded to 80–2,000 pixels and the current pane. Cancellation does not write. Wikilink and Markdown images retain paths, meaningful alt text/captions, and authored `WxH` dimensions until an explicit resize writes width-only syntax. Repeated embeds target their own editor node; proxied external images are viewable but not resized through this control. These edits use the existing document save/recovery path, not a second writer.

**Mermaid** renders flowchart, sequence, class, state, ER, pie, and Gantt examples in Reading and Live Preview. `mermaid@11.13.0` is loaded only for diagrams, inside an opaque-origin, script-only iframe with a restrictive CSP. The browser receives an allowlisted passive SVG image, never active diagram markup. Limits are 12 diagrams per renderer, 4,096 source characters/100 lines per diagram, 64 edges, 200,000 output characters, and a five-second render-response deadline. Unsafe links/directives, malformed input, exceeded budgets, and rendering failures retain source. The offscreen frame stays under `document.body` so hidden note panels cannot collapse layout during Appearance changes, and its owning pane disposes it. Colors follow the current theme/skin.

In Live Preview, activate **Edit Mermaid Diagram** to expose the code; leaving the block restores the preview. Single supported fence edits splice the authored Markdown instead of reformatting unrelated spacing, preserve LF or consistent CRLF, distinguish duplicate fences, and lengthen delimiters when pasted code could close the fence. The proposed splice is reparsed to confirm all code blocks match the intended editor document. Unsupported mappings and other Live Preview edits use Milkdown serialization and can normalize formatting; this is not a general lossless Markdown editor. Source mode and the existing bounded static HTML/PDF renderer remain separate; broad browser Mermaid support does not imply static-export parity.

**Imported Properties** reads only `.obsidian/types.json` through `getObsidianPropertyRegistry(expectedVault)`; the older `getObsidianPropertyTypes` read remains available. The Runtime uses confined, revision-bound/no-follow access and caps the registry at 64 KiB and 1,000 known name/type assignments. Missing or unreadable configuration leaves inferred display types available. The route caches by vault generation, discards late responses, and reloads on vault activation. Explicit type changes use `setObsidianPropertyType` to remember one assignment in this same registry; they require its expected revision and reject malformed or unsafe existing configuration rather than replacing it. Cancellation is checked after the final registry revision read, including an absent registry, before publishing settings.

The note header and Properties sidebar edit values through the bound document record. Supported types are text, finite numbers (including exponent-form values), checkboxes, dates, local minute-resolution date-times, and flat string lists/tags/aliases. Empty and null values retain imported controls. Native inputs and list add/remove controls write only on explicit edits. Property-name and tag suggestions use bounded, generation-checked facets; free-form entry remains available, with explicit incomplete/retry states. The type menu offers all six types, previews conversions, and requires confirmation before losing values. A conversion captures the original note in recovery before remembering the type and editing its shared draft. Nested or incompatible YAML, mixed lists, invalid dates, and zoned/second-resolution date-times require **Source Mode**, rather than being silently coerced. Fresh functional and Desktop evidence is recorded in `.beads/reports/2026-10-01-tocktutor-properties-functional-parity-verification.md`.

The dark/no-skin migration gallery surfaces are in `.agents/uiux/tocktutor/tocktutor.html`; review, regression, screenshot, and runtime evidence is recorded in `.beads/reports/2026-09-29-tocktutor-migration-review.md`.

#### Sidebar Note Actions

Right-click a note in **Files**, or press Shift+F10 / the context-menu key on its row, to open the 13-action note menu. Opening or dismissing it does not navigate or save. **Open in New Tab** retains the current tab; **Open to the Right** creates a permanent editable split using the existing pane layout, not a temporary Side Peek.

The remaining actions are **Open in New Window**, **Duplicate**, **Move Note…**, **Bookmark Note…** / **Edit Bookmark…**, **Merge Entire File With…**, **Copy Path** (relative/absolute), **File Recovery**, **Open in Default App**, **Reveal in Finder**, **Rename Note…**, and **Move File to Trash**. They bind to the clicked vault-relative note rather than the active editor. Existing **More Note Actions** controls remain available independently. Markdown-only operations and unavailable native contributions are disabled.

**Duplicate** saves only the target's open draft, then delegates through the validated `duplicateDocument` Remote to runtime `duplicateFile`. Same-folder `Copy` names use exclusive creation and at most 100 collision retries; partial writes are not retried as collisions. Local dialogs, recovery reads, and native authorization retain their target identity. Unrelated pane drafts are not saved or replaced. The existing native contribution accepts target-bound callbacks; no additional dispatch loop, filesystem writer, browser capability, or Web/TUI mount is introduced.

Desktop verification checks live in `scripts/tocktutor-sidebar-menu-checks.js`; evidence and limitations are recorded in `.beads/reports/2026-09-26-tocktutor-sidebar-note-menu/`.

#### Base Views

Base views hydrate a complete, generation-bound Markdown inventory in batches of eight, with ceilings of 2,000 notes, 1 MB per note, and 16 MB total. Incomplete inventories, failed reads, failed tree refreshes, and wrong-generation tree responses hide stale rows and show an explicit unavailable state rather than partial results. Retry refreshes the tree first when its inventory is untrusted. Filters, sort, and the view limit run before the selected view's text search; search covers visible columns only. Summaries evaluate only after search, so errors or overflow from hidden rows cannot block an otherwise valid displayed summary. Table cells edit supported existing scalar frontmatter properties through revision-checked runtime saves. Lists and cards are read-only projections; Map is a coordinate-label list, not an interactive geographic map.

The mounted route supplies the Base's own path and available tree metadata for `this.file` formulas. Configuration callbacks remain bound to the exact focused pane/document, and navigation remounts Base controls so a pending name or menu cannot edit a different Base. View selection and per-view search reset when the vault identity or generation changes, even if the new vault opens the same Base path. Source changes are confined to the selected entry inside `views:` and preserve unrelated sections and an inline comment on the `views:` header. LF/CRLF files work with or without a final newline. Full-line comments, including unindented comments inside global or view filter blocks, do not truncate restrictions. Unsupported top-level syntax, inline formula/property/view sections, nested content under scalar global filters, duplicate sections/view fields or formula names, empty formulas, and malformed inline view lists fail closed; this is a bounded YAML subset, not a general YAML implementation.

Formulas never execute JavaScript or fetch resources. Native regular-expression matching, replacement, and splitting use a conservative work budget that includes admitted repetitions, so expensive patterns can be reported as unsupported even when JavaScript would accept them. Failed/oversized text conversions and nonfinite sums are unsupported; averages use scaled arithmetic to avoid intermediate overflow. CSV/TSV output remains spreadsheet-safe. The focused review and fresh verification are recorded in `.beads/reports/2026-09-28-base-view-review/`; the subsequent filter-parser and search-summary review is in `.beads/reports/2026-09-28-base-view-followup/`.

#### Search Intelligence

The mounted search palette supports **Keyword** and **Related** modes, title/folder/modified-date filters, keyboard selection, result previews, and **Quick Answer** with source citations. Related retrieval is bounded lexical/metadata ranking, optionally augmented by model-generated alternate queries; it is not a vector database. The route controller in `src/route.tsx` owns query/navigation cancellation and stale-result rejection. The assistant's `aiSearch` policy is `off`, `on-demand` (default), or `automatic`; missing/disabled providers do not remove local search. `src/search-intelligence.ts` validates bounded model output and rechecks vault/settings ownership; Quick Answer rereads candidate evidence and accepts only supported citations.

#### Browser State and Current Integration Limits

**Find** is note-local in Source, Live Preview, and Reading; **Replace** uses an editable mode and isolates replacement Undo from surrounding typing. Reading matches preserve inline markup. **Merge Entire File With** saves unsaved changes before review, obtains a revision-checked Host/runtime preview, and applies only after explicit confirmation. Retained journals and exclusive-copy recovery preserve originals without overwriting current notes. **Merge Recovery** pages through at most 100 records at a time; an attention badge may conservatively reflect an incompletely enumerated history rather than a known failure.

`src/settings.ts` stores per-vault settings and Workbench state in bounded browser storage (`tocktutor.settings.v1.<vaultId>` and `tocktutor.workbench.v1.<vaultId>`). Tabs/pane sessions, validated horizontal/vertical split trees (eight groups, 15–85% ratios), focus mode, and named workspaces persist; recently closed tabs, back/forward history, and current search query/mode/open state are controller-local and reset on reload. Keep-mounted surface switching preserves that controller state, unlike relaunch. Browser preferences are separate from the runtime's recovery data and native search cache. The single route controller owns one source/revision/save/draft record per vault generation and path; simultaneously mounted pane editors retain their own mode, selection, scroll, search, and native history. Peer source replacements reset stale authored history without echo edits, and focusing a pane does not save or discard another pane's draft. Workbench defaults include five-minute recovery snapshots and a stored seven-day retention preference; the latter is not consumed by the route. Actual Host retention has its own 30-day default.

The note menu's **Open Linked View** renders Backlinks, Outgoing Links and Properties below their source, and Outline and Local Graph to its right. Linked leaves persist exact source group/tab IDs in the existing session/layout store. Bound pin state comes from the source tab; unlinked views follow the active editor unless independently pinned. Linked focus does not become editor-navigation authority. Closing a source detaches its linked views with pin state retained; closing a linked leaf leaves its source intact. Properties reuse the shared document record and guarded frontmatter editor; structured or oversized values require Source Mode. Outline navigation scopes its editor DOM target explicitly, and linked graphs have separate abortable requests rather than replacing the global graph. Source/model/component and isolated Desktop checks cover these flows; linked-view evidence is in `.beads/reports/2026-09-21-linked-view-desktop-gate/`, with the subsequent inbound-link repair in `.beads/reports/2026-09-21-wikilink-rename-gate/`. Full release acceptance still has separately recorded environment/native gates.

Feature helpers and isolated component tests are not proof of complete route integration. In the current `src/route.tsx`:

- **Backlinks in Document** renders the shared linked/unlinked mention list below Markdown notes in Source, Live Preview, and Reading modes. The per-vault toggle persists; enabling it and vault-tree refreshes reload bounded, generation/path-checked relationships. Loading, unavailable/retry, empty, and incomplete-result states are explicit. The relationship panel uses the same list; the status bar still uses loaded backlink details and defaults to zero before they arrive, rather than proving an exhaustive count. **Page Preview** is stored, but hover-preview rendering is not wired.
- `resolveSlashCommand()` and `pagePreviewTargetAtOffset()` in `src/editor-commands.ts` remain helper-level APIs. The *separate* Live Preview slash menu is mounted through `src/live-preview-slash-menu.tsx` and `src/live-preview-editor-runtime.tsx`; its file/link forms use `src/slash-link-dialog.tsx` and the generation/path-checked `slashLinkContext()`. Source mode still relies on its own formatting shortcuts and palette, not this menu. Page Preview hover rendering is not mounted.
- `MarkdownSlidesView` in `src/editor-surface.tsx` is a standalone static helper; neither **Slides Preview** nor **Rendered Preview** is mounted in the current Live Preview route.
- `src/base-executable-view.tsx` receives route-owned view selection and per-view search, reset when the document path changes. Its create/edit/copy/CSV export callbacks are connected; authoring writes the revision-checked `.base` source, and a new note uses the existing exclusive runtime creation path. Base formulas use the bounded evaluator and explicit unsupported-expression handling, not arbitrary JavaScript execution; provenance/divergences live in `src/base-evaluator-provenance.ts` and `src/base-view-provenance.ts`.
- `openBookmark()` opens note, heading, block, folder, and search records. The Workbench view dispatches link bookmarks through the isolated Web Viewer with a distinct navigation request per activation, even for the same URL; groups display their children as directly openable rows instead of dead buttons. Bounded bookmark storage rejects duplicate IDs across top-level and grouped entries so one removal cannot silently erase another record. Graph bookmarks remain unavailable. Block bookmarks currently ignore `blockId`; heading/search selections are passed to the mounted Source editor as repeatable, readiness-checked selection requests.
- `src/utility-panel.tsx` exposes **Backlinks in Document** and **Default Editing Mode** in **Settings and Workspaces**. The stored **Page Preview** preference is retained for compatibility but its nonfunctional switch is hidden until hover rendering exists. Attachment/journal/template folder and retention settings exist in the model/controller but should not be described as fully exposed settings controls.

### `tockbot-note-desktop`

The Host entry refuses non-Desktop surfaces and mounts the `tocktutorDesktop` Remote. It injects the TockTeam Desktop caller, picker, pop-out, microphone, print/export, reveal, vault-selection, and note-runtime services.

The client contributes the **Native Actions** controls for:

- **Reveal Entry**
- **Open Pop-Out** and **Close Pop-Out**
- **Close All Pop-Outs**
- **Request Microphone**
- **Start Recording** and **Stop Recording**
- **Print Note**
- **Export HTML** and **Export PDF**

The note dropdown also exposes **Open in New Window**, **Export PDF**, **Open in Default App**, **Reveal in Finder**, and the **Copy Path** submenu. Absolute-path copying and default-app opening resolve the active note through the trusted Runtime and preserve the caller operation identity; browser code cannot supply a canonical filesystem path. The existing native contribution publishes lifecycle-bound UI callbacks through its owner props; the dropdown does not mount another dispatch loop or gain native authority. These shortcuts reuse the panel's save/authorization handlers, reject note/vault changes during awaited saves or authorization, and show native status in the Workbench status bar. Removing the contribution removes its shortcuts. No Claudian action is included.

The separate vault-action contribution supplies **Open Folder as Vault** and the existing **Rename vault...**, **Move vault...**, **Reveal vault in Finder**, and **Remove from list** menu labels. Removing a recent selection does not delete vault contents.

Overlapping **Open in New Window** requests for the same note wait for its current native open and then focus the existing window. Waiting requests recheck cancellation, adapter lifetime, and vault ownership before proceeding. The Host's 32-note pop-out limit includes pending opens; concurrent requests for one note share a slot, and failed requests release their reservations when they settle.

Native note windows receive a Host-set presentation kind through the frozen preload bridge. First-run setup and the native-action/dispatch client contribution mount only in the main workbench, so a note pop-out does not request main-window authority, display a blocking setup dialog, or poll the main window's dispatch queue. The note editor remains available through its ordinary Workbench and Runtime services. This presentation fact grants no authority: privileged IPC keeps its trusted-main-window checks.

Every native operation starts with an opaque authorization minted by the isolated preload for the trusted main frame. For vault-bound operations, the authorization records the browser-observed opaque `{ id, generation }`; the trusted Host independently proves the same live Runtime vault, synchronizes the Desktop owner, and only then claims the authorization to obtain the main-owned session, window, and operation identity. A browser assertion cannot mint vault authority by itself. Browser payloads never supply absolute paths, Electron objects, native handles, or unrestricted IPC names.

Unload aborts pending work and closes pop-outs opened by the adapter. Dirty editors save before choose-vault, pop-out, print, HTML, or PDF authorization is claimed. Print and export content is bounded, sanitized, stripped of network-bearing resource attributes, and rendered through the shared Markdown exporter before the Desktop owner revalidates it. Generation-bound runtime reads supply bounded recursive note, Canvas, Base, and supported data-image projections; audio/video/PDF embeds remain metadata-only in static output. The native adapter passes the source path to the shared resolver for explicitly relative embeds and retains cycle, depth-three, inventory, and combined read/output budgets. Recorded audio returns only bounded bytes to the active Workbench owner, which rechecks the note and vault after byte conversion before the runtime stores it. Unload during microphone authorization or media acquisition rejects the late result and stops acquired tracks; the client also cancels a recording returned after its lifetime ended.

### `@tockteam/tocktutor-assistant`

`NoteAssistant` is a Cordis service injecting `agents`, `noteVault`, `settings`, `storageDomain`, `subprocess`, and `tools`. It owns:

- assistant provider/model/write-permission and `aiSearch` settings;
- provider-backed query expansion and citation-bound Quick Answer through DSH's existing `llm` service;
- production agent-turn binding;
- a restricted Pennivo MCP child process;
- active-turn read tools, including generation-bound `notes_search` and `notes_read` aliases;
- proposal-only `create_file`, `write_file`, `notes_stage_write`, and `notes_organize_capture` tools;
- persisted proposals and bounded audit records;
- explicit approval/rejection and continuation routing;
- the browser-safe `tocktutorAssistant` Remote and assistant panel.

The reviewed dependency is `@pennivo/mcp-server@1.4.0`; `PENNIVO_PROVENANCE.md` and `THIRD_PARTY_NOTICES/Pennivo.txt` record its pinned source and MIT notice. `src/pennivo-child.ts` checks server version `1.4.0` and MCP protocol `2025-11-25`. The child receives a scrubbed environment, an empty temporary workspace, bounded JSON-RPC lines and requests, timeouts, restart limits, and lifecycle cleanup. It is a catalog-verification child: initialization and `tools/list` are supported, but there is no `tools/call` forwarding path and it never receives direct vault filesystem authority. The scrubbed environment and scratch directory are not an OS sandbox for arbitrary MCP servers; Pennivo remains a pinned, trusted dependency.

The seven model-facing Pennivo read adapters are `list_files`, `read_file`, `search`, `find_backlinks`, `get_outline`, `list_snapshots`, and `list_trash`; `list_workspaces` is deliberately unavailable. Reads execute through TockTeam's runtime-backed adapters, not the child. Bound assistant turns also admit the `notes_search`/`notes_read` aliases; proposed writes use the same Host-owned approval boundary, including TockDriver-originated proposals.

`writePermission` is `read-only` or `propose`. Bound-assistant proposals carry the exact vault generation, child instance, agent turn, request, provider, model, permission epoch, source revision, target revision, digest, expiry, and user approval. Ordinary DSH `notes_stage_write`/`notes_organize_capture` proposals use the independent `tockdriver-main` binding instead of a Pennivo child; child replacement must not invalidate them. Their source reads capture the permission epoch so a revoke-and-restore during an await cannot stage under a newer permission grant. Only `tockbot-note-runtime` performs the accepted mutation and snapshot-backed save. A decision keeps a transient reference to the originating Agent for one bounded follow-up; stale Agent identity suppresses that continuation. Stored turn/request identifiers are provenance, not an independently revalidated live-turn requirement at approval: the current approval path supplies those identifiers from the proposal itself. Vault, permission, revision, digest, expiry, and replay checks remain the mutation boundary.

Queue and permission epoch persist in the version-1 DSH storage domain `tocktutor_assistant`, separate from vault files. Defaults are 100 pending proposals, 500 audit records, and five-minute expiry (at most ten minutes); proposal content is capped at 1 MiB and serialized queue state at 8 MiB. Ordinary TockDriver proposals can survive assistant restart after revalidation; child-bound live-turn state is not resumed. The browser reviews a redacted 1,000-character summary, not the full proposed content or a complete diff. Summary previews stay below transport limits, and a stage rejected by aggregate serialization limits leaves the accepted queue and audit intact. The assistant panel reloads proposals/audit as the selected conversation's running/tool state changes, so asynchronously staged writes become reviewable without leaving the note.

The text-only provider runner used by search expansion and Quick Answer requests iterator closure when a turn ends. Cancellation also interrupts a pending cleanup wait, so a provider that ignores `AbortSignal` cannot keep the cancelled turn open. Its eventual output stays suppressed and late cleanup failures remain observed; actual provider resource release still depends on the provider honoring cancellation or settling its pending work.

An accepted assistant approval retains its original proposal deadline through persistence, source/target reads, and the Runtime write. Deadline cancellation uses the queue's clock and reaches the Runtime's precommit check, so waiting for a save cannot extend approval authority. The timer is released when the decision settles. A successful Runtime commit remains `applied` when its response arrives after expiry.

### `@tockteam/tocktutor-import-export`

The Host gateway injects `noteVault`, `tockTeamDesktopCaller`, and `tockTeamDesktopPicker`. It mounts the `tocktutor-import-export` Typert Remote and owns reviewed import, restore, and backup engines plus the review-panel client contribution. `src/engine.ts` handles import/restore; `src/backup-engine.ts` handles backup publication. Each engine permits one active operation, expires plans after at most five minutes (or the underlying grant's earlier expiry), and bounds completed evidence to 64 operations/32 MiB. Approval and commit are distinct calls; cancellation, abandonment, expiry, and disposal must release retained grants and staged resources. Commit rechecks expiry after asynchronous preflight and retains deadline cancellation through unfinished Runtime and destination writes. Imports also check before each file: expiry preserves completed files, records the next file as failed/expired, and cancels the remaining files. Backups check after destination acquisition and each staged chunk, releasing staging before publication if the reviewed deadline passes. Commit deadline timers are released when the operation settles. A successfully committed result remains valid when its response arrives after expiry. Retained completed evidence supports retries of the same operation/token/digest for at most five minutes, subject to count/byte eviction; engine restart does not restore pending approval or replay authority.

The browser client mounts its generated transport before registering the Shared Review Panel in a child that injects `remote.tocktutor-import-export`. The panel receives only that mounted namespace, so its buttons can invoke reviewed operations under Cordis's strict service access. Losing the namespace withdraws the panel; remounting it restores one contribution, and disposal removes the panel before its transport.

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

ZIP parsing rejects traversal, aliases, symbolic links, Unix executable regular-file modes, unsupported flags/methods, invalid signatures/names, payload CRC mismatches, excessive depth, entry count, member size, aggregate size, parser time, and compression ratio. Executable filenames can instead be skipped during conversion. Local-header CRC/size fields, directory headers, and signed or unsigned data descriptors are checked against central metadata; incidental end-record signatures inside archive comments are ignored unless their declared length reaches the archive boundary. Backup archives use deterministic manifest version 3. Passive configuration is hashed and stored under opaque archive member names, follows the same inspect-preview-approve-apply transaction, and restores only through the runtime seam. Version-2 archives without passive members remain restorable. Backups capture supported runtime-visible documents/attachments and accepted passive configuration, not arbitrary files, empty directories, browser Workbench state, or Runtime recovery storage. New archives obey the 5,000-file reviewed-plan ceiling.

Existing vault files are never overwritten. Document creation preserves the reviewed UTF-8 bytes, including a leading BOM. Multi-file imports report committed, skipped, failed, and recovery-required entries rather than claiming rollback after partial success. Import and backup planning drain ordinary `result-limit` pages with valid cursors; depth/entry limits and incomplete inventories still fail closed. New backup creation enforces the restore-side entry/member limits, preventing publication of archives the same version cannot restore.

### `tockbot-web-clip`

`WebClipHost` provides the `webClip` service. It injects `noteVault` when available and conditionally injects `webServer` plus `tockTeamSurface` to register Desktop-only routes:

- `POST /web-clip/api/viewer`
- `POST /web-clip/api/reader`
- `POST /web-clip/api/image` (bounded public raster-image bytes for inline previews and the viewer)
- `POST /web-clip/api/clip/review`
- `POST /web-clip/api/clip/apply`
- `POST /web-clip/api/clip/cancel`

The Host accepts only credential-free HTTP(S), rejects local/private/reserved addresses and mixed DNS results, pins each request to a validated address, revalidates redirects, bypasses ambient proxies, disables compression, and bounds URLs, addresses, redirects, headers, bytes, decoded text, connection time, total time, and concurrency. Malformed native HTTP responses reject through the request error path without terminating the Host; bodyless responses, including HTTP 205, close their unused streams.

Fetched HTML is reduced to bounded inert Reader text. Viewer HTML escapes the projection before TockTeam Desktop authorizes it for one isolated, script-disabled webview frame. The lifecycle-owned Workbench panel supports persistent tabs, keyboard/drag reordering, Reader text size/width/spacing/appearance, shared bookmarks (including repeated navigation to the same saved link), and settings-backed clipping. `src/viewer.ts` caps viewer state at 20 tabs, 20 viewer bookmarks, and 65,536 serialized characters; it persists URLs/titles and preferences, not fetched page bodies. API requests require same-origin POST JSON with bounded bodies.

TockTeam's `src/web-clip-frame.ts` and `src/main.ts` own the isolated guest partition, exact one-document authorization, restrictive CSP, credential-header stripping, and denied network/navigation/download/permission behavior. The viewer displays Host-fetched inert projections, not an unrestricted browser session.

Clipping initializes the configured folder with a timestamped Markdown filename, not a bare directory. It creates a one-use, expiring, digest-bound, destination-bound, vault-generation-bound preview. The browser must approve the exact preview before the runtime performs an exclusive Markdown create. Its reviewed deadline cancels a pending runtime write, including final filesystem validation; consumed approvals remain one-use after expiry. A file committed before the deadline retains its successful result even if the response arrives later. Caller cancellation and Host/runtime disposal still abort pending writes, and each apply clears its deadline timer when it settles.

### `@tockteam/tocktutor`

This package contains no agent loop or feature implementation. It is the installable aggregate bundle and pins all component versions. Keep its dependency list and `cordis.patch.yml` order synchronized with profile, staging, package, and composition tests.

## TockTeam Integration Seams

Outside the plugin workspace:

- `src/profile.ts` owns the Desktop aggregate bundle, browser-client enrollment, and retired standalone bundle migration without removing unrelated user bundles. `plugins/plugin-marketplace/src/protocol.ts` protects bundled TockTutor package/row identities from ordinary marketplace replacement.
- `plugins/shared/surface.ts` owns `tockTeamSurface`; never provide TockTeam identity as DSH's `ctx.web`.
- `plugins/sidebar/src/client/tocktutor-route.ts` defines the bounded same-origin route contract and the shared last-TockTutor-path state used by separately bundled Desktop and Sidebar clients.
- `plugins/sidebar/src/client/plugin.tsx` mounts the Desktop-only route and app-rail entry. Switching to TockCoder hides and makes the existing Workbench inert instead of unmounting it; returning restores the remembered note, query, and hash. While TockTutor is active, the underlying DSH/sidebar roots are inert.
- `src/launcher-navigation.ts`, `src/launcher-specialists.ts`, and `src/client.ts` admit only the finite `tockcoder`/`tocktutor` destinations and navigate the existing Workbench without reloading it. Global settings navigation goes through `src/desktop-settings-navigation.ts`; it must wait for the active TockCoder surface rather than click hidden settings controls.
- `src/main.ts` owns native menus, protocol admission, dispatch delivery, pop-outs, theme lifecycle, and restricted IPC. Pop-outs load the same-origin SPA root before a fixed main-authored History navigation, avoiding direct-route HTTP fallthrough without admitting arbitrary renderer code or routes.
- `src/preload.ts` exposes only the bounded TockTutor bridge. Public browser/Host contracts are exported through `client.d.ts`, `host.d.ts`, and the Desktop package's conditional `./client` and `./host` entries.
- `src/desktop-*-owner.ts` modules own native identity, capability, and transaction checks. `src/plugin.ts` installs the corresponding Host providers and their lifecycle cleanup.
- `plugins/ui/` owns shared React controls; `plugins/skins/src/client/tailwind.css` scans TockTutor sources and owns the shared Tailwind utilities. Keep React/ReactDOM external in browser bundles and resolve the Workbench and shared UI to the same React instance.
- `scripts/stage-dsh.mjs` copies tracked package payloads into the staged runtime; `scripts/stage-package-dependencies.mjs` preserves package-local dependency resolution. `nix/tockteam.nix` and `nix/register-plugins.py` own the equivalent Nix payload/native-dependency wiring.
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

`plugins/tocktutor/parity/ledger.json` is the machine-checked capability contract. It preserves all 122 observed rows from the pinned Obsidian checklist, the source's declared-123/observed-122 discrepancy, six earlier compatibility capabilities, and 14 feature-level residual Tockbot capabilities anchored to commit `af214b2d1a5df8ca23bf99fad9f0408a07c2e4ba`. The ledger records 108 proven rows/capabilities (88 checklist rows, six additional capabilities, and 14 residual capabilities) and zero gaps. There are 34 unchecked checklist rows: 29 `excluded` and five `not-needed`. The validator's total of 36 excluded items includes those 34 rows plus two retained static-output security divergences.

This is scoped compatibility, not exhaustive Tockbot or Obsidian parity. The validator checks ledger structure, evidence-file existence, and fixtures; it does not rerun the recorded focused commands or real-consumer checks. A `proven` ledger entry is historical evidence, not a fresh Desktop acceptance result.

The in-scope cutover includes Desktop install/upgrade, disable/uninstall/rollback transaction safety, copied-vault compatibility, legacy recent-vault reads, passive configuration backup, accessibility gates, destructive recovery, generated-payload drift checks, packaged Loader composition, and real Electron flows. Route retirement and data migration are separate concerns: the current shell admits `/tocktutor` and `/tockcoder` (with `/` canonicalized to TockCoder), not a second Tockbot route. Removing legacy route admission must not delete vaults, local settings, backup compatibility, or rollback code.

## Known Operational Limits

The standalone `tockbot-note-vault` filesystem adapter sorts the native directory inventory before producing deterministic cursor pages. Search bytes, inspected entries, files, results, and output remain bounded, but native directory enumeration itself scales with the vault. The active runtime's persistent index can reduce eligible repeated-search work, but initial reconciliation and fallback still scan; measure before changing indexing or enumeration policy.

Runtime storage, standalone/shared inspection, and backup agree on `.ico` and `.weba` inventory support. Acceptance is still layer-specific: successful attachment storage or inventory does not imply inline preview or static-export support.

The assistant panel intentionally uses a render-time route epoch to prevent an aborted decision from reviving across an A → B → A navigation. Its component regression test protects that behavior; do not replace it with a route-key-only comparison.

The shared static renderer can consume bounded recursive embed projections and never fetches network resources, but the native print/export adapter currently supplies only first-level resolutions. Explicitly relative and nested native-export embeds remain a follow-up, not live/static parity. Audio, video, PDF, BMP, and other non-allowlisted data-image payloads remain labeled metadata because the Desktop print/export owner accepts only bounded AVIF, GIF, JPEG, PNG, and WebP data URLs.

## Generated and Release Payloads

Tracked `lib/` and `dist/` directories are release payloads. Never hand-edit them. Rebuild changed sources through the package scripts, then regenerate `plugins/tocktutor/build-manifest.json`.

The root workspace intentionally excludes `plugins/tocktutor`; that workspace has its own `pnpm-lock.yaml` and resolves exact published DSH packages independently. It also includes `../ui`, links `@tockteam/desktop` to the root, and overrides React to the root's React 18.3.1 instance. `install:tocktutor` uses the root-installed pnpm with `--frozen-lockfile`, not an ambient DSH checkout. Root dependency/CI pnpm and DSH assembly pnpm pins are separate; do not derive installer behavior from an individual component's `packageManager` field.

Package scripts generate Typert transport outputs before compilation where applicable, and browser builds wrap clients for DSH's `window.__ModuleLoader__`. The root `build:tocktutor` script builds the nested workspace and then writes the manifest; root `build` alone does not rebuild TockTutor. The manifest hashes workspace inputs and outputs (excluding Markdown, tests, notices, and local analysis/dependency caches); its check detects drift but is not a substitute for executing the build.

Native SQLite must be packaged with the runtime's exact dependency closure. `.github/workflows/ci.yml` runs the dedicated search-index check across macOS, Linux, and Windows; `nix/smoke-native.cjs` exercises the Nix FlexSearch/SQLite mount, commit, search, and close path.

## Verification

For reference-only updates, verify the documented pins, package/slot names, script names, and source paths; run `pnpm -C plugins/tocktutor run validate:parity`, `node scripts/tocktutor-build-manifest.mjs`, and the relevant root contract tests. Do not rebuild unchanged tracked outputs solely for prose edits.

For implementation changes, install dependencies before running the affected package's focused test, then run the TockTutor workspace gates:

```sh
pnpm run install:tocktutor
pnpm -C plugins/tocktutor run validate:parity
pnpm run typecheck:tocktutor
pnpm run test:tocktutor
pnpm run build:tocktutor
node scripts/tocktutor-build-manifest.mjs
```

`test:tocktutor` runs packages serially; its pretest validates parity and prepares a Desktop tarball under `.cache/tocktutor-tests/`. Several package tests build/generate files, and Workbench/assistant suites include Vitest/jsdom component tests as well as `node:test`. Inspect generated diffs afterward. Do not run package-boundary/full packaging checks concurrently with an installed smoke.

For search-index or native dependency changes, also run:

```sh
pnpm -C plugins/tocktutor/packages/tockbot-note-runtime run test:search-index
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

On macOS, use `pnpm test:launcher:electron` while iterating; it rebuilds TockTutor and the root, quick-stages, and runs the Electron launcher/route checks. Run `pnpm test:launcher:installed` only after focused checks pass, once per final commit, never concurrently, with `TOCKTEAM_INSTALLED_SMOKE_TEMP_ROOT` inside a `.noindex` cache directory. Those launcher checks do not cover every TockTutor native feature.

TockTutor Desktop behavior that depends on a real Electron window still needs the applicable packed Loader and Desktop smoke path; unit tests and `--dump-config` do not prove native authorization, isolated Web Viewer frames, picker, microphone, attachment ingestion, pop-out, print, export, managed-vault creation, or restart recovery. Packaged Desktop preserves Electron's standard `--user-data-dir` switch for copied-profile acceptance; without that explicit switch it retains the compatibility data root. Use copied disposable user data for destructive cutover proof and stop every Electron/runtime process afterward. For temporary macOS Electron/Chromium verification, preserve `HOME` where possible and isolate application data; pass `--use-mock-keychain` before any `HOME` override and never interact with the user's Keychain.

The client-graph smoke uses `scripts/smoke-client-preload.cjs`, whose isolated Desktop bridge includes the first-run `onboarding.status()` and `onboarding.complete()` methods. It reports setup complete so this gate can reach the TockTutor clients; first-run setup behavior has separate `desktop-onboarding-*.test.ts` coverage.

## Change Checklist

When adding or removing a TockTutor component, update every applicable layer:

1. package manifest, exports, client metadata, and `cordis.patch.yml`;
2. aggregate dependencies and aggregate patch order;
3. `plugins/tocktutor/pnpm-lock.yaml`;
4. root package file allowlist, staging copy list, and Nix/native dependency wiring;
5. `src/profile.ts` protected or retired bundle lists;
6. Host/client injections, slot declarations, shared UI singleton resolution, and Tailwind source coverage;
7. composition, packed-client, lifecycle, and focused behavior tests;
8. tracked build outputs and `build-manifest.json`;
9. this reference.
