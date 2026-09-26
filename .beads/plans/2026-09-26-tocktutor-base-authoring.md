# TockTutor Base Creation and View Editing

**Decision:** The user chose the full screenshot flow, not only the missing creation button. The reference is an Obsidian Files sidebar **New Base** menu and a newly opened Base table with View, Results, Sort, Filter, Properties, Search, and New controls. This plan covers that journey, not every Obsidian Bases feature or every future layout.

**Design Read:** A dense desktop note workspace for finding and editing notes; match the reference's progressive disclosure and stable table hierarchy while retaining TockTeam's semantic colors, shared controls, keyboard access, and native file safety. Avoid introducing Notion-style Markdown blocks.

## Existing Behavior and Authority

- TockTutor already opens `.base` files in a separate `ExecutableBaseView`; Milkdown edits `.md` files only. The bounded Base parser/query support Table, List, Cards, and Map-label layouts, view filters/sorts/displayed columns, formulas, search, copy/export, and revision-checked row property edits. These controls mostly lack an authoring UI. `src/base-executable-view.tsx` owns Base presentation; `src/route.tsx` owns pane/session/document state and sidebar; Host `src/host-read.ts` validates and forwards to the active `noteVault` writer. Reuse these seams.
- The Files sidebar exposes a New Note button, but no folder-level creation menu and no New Base entry. Native `createDocument` already accepts bounded vault-relative `.base` files, but the native `new` dispatch deliberately accepts only `.md`; do not widen that dispatch as a shortcut.
- Source of truth is the `.base` file and its note files. Do not persist a second shadow query/view model in browser storage. Editing the Base uses revision-bound `saveDocument`, preserves unmodified YAML/source, and rejects unsupported constructs or stale writes instead of lossy serialization. Creating notes uses exclusive `createDocument`, never inferred authority from browser absolute paths.
- Obsidian help [Create a base](https://github.com/obsidianmd/obsidian-help/blob/master/en/Bases/Create%20a%20base.md) documents creation from a folder's File Explorer context menu or the command palette/ribbon in the active file's folder. [Views](https://github.com/obsidianmd/obsidian-help/blob/master/en/Bases/Views.md) documents the screenshot toolbar and **New** as creating a file in the current view. Obsidian's public API describes `createFileForView` as displaying the *new note menu*, not an unconditional write. [Settings](https://github.com/obsidianmd/obsidian-help/blob/master/en/User%20interface/Settings.md) defines default new-note location as vault root, same folder as current file, or a chosen folder. TockTutor does not yet have this preference. Do not assume the Base's folder is always the right destination.

## User-Visible Contract

1. In the Files sidebar, open a discoverable menu by mouse or keyboard with **New Note** and **New Base**; a folder context action creates within that folder. **New Base** creates `Untitled.base` (or the next safe, collision-free numbered name), containing one valid `Table` view, refreshes Files, and opens the Base. Failure or navigation races never overwrite a file or erase a successful write. A menu on the sidebar's plus/add control mirrors the same actions.
2. The new Base immediately lists eligible vault Markdown files as rows, shows a result count and selected view, and has visible **Sort**, **Filter**, **Properties**, **Search**, and **New** actions. A view menu switches or adds supported views. Sort, filter, property, and view changes are saved into the `.base` file; reopen/other panes see the same configuration. Local search remains ephemeral. Existing copy/export and safe cell edits remain available in their owning menus.
3. **New** opens the note-creation menu with an editable name and a visible destination. Resolve the destination from the same three default-location choices as Obsidian; for a folder-scoped sidebar action, use that folder. A new `.md` file is created exclusively through the current vault writer, then the Base results update. Apply a simple supported view constraint (for example, a deterministic folder/tag equality) only when it can be represented safely; otherwise tell the user why the new note is not in the filtered result. Never silently override a user's existing note or invent metadata to satisfy arbitrary formulas.
4. All interactions have useful empty/loading/error/stale/conflict states, visible focus, keyboard operation, bounded menus, and light/dark/four-skin contrast. Preserve unrelated tabs/panes, Markdown slash commands, previews, and the user's actual files.

## Out of Scope

- Adding Board/Kanban, Calendar, Timeline, a geographic map, formulas editor, arbitrary expression builder, drag grouping, or complete Obsidian API/schema parity. Table/List/Cards/Map-label are the only already supported layouts; no fake controls for unsupported kinds.
- **New Folder** and **New Canvas** sidebar actions: the user explicitly chose to focus this project on Bases. Keep the existing New Note entry but do not add those separate vault-writing flows.
- A Milkdown `.base` node or automatic conversion of Markdown tables to Bases; no Web/TUI mount or new Host authority.
- Rewriting unfamiliar `.base` YAML, full arbitrary filter expressions through point-and-click controls, changing third-party/user profile patches, or silently modifying existing notes to populate a new view.

## Vertical Slices and Checks

### 1. Files → New Base → Open (`tockteam-e0tc.1`)

- Add the sidebar add/context action with accessible labels and focus restoration; choose folder destination and collision-safe Base name; create the minimal `views:\n  - type: table\n    name: Table\n` through existing Host Remote; refresh tree and open its own pane.
- Red check first: a route/component test proves keyboard and pointer actions, exact created bytes/path, no overwrite, stale completion retention, and parser acceptance. Then green. Do not implement this through the `.md`-only native dispatch.
- Verify: `node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/route.test.ts`; focused component test; guarded Desktop Files flow.

### 2. Sort and Filter Persist (`tockteam-e0tc.2`, after 1)

- Add discoverable per-view Sort and Filter menus. Offer only properties/operators supported by the bounded parser/query and an advanced Source-mode escape hatch for unsupported valid Base syntax. Allow adding/removing/reordering supported sorts and simple all-view/this-view filters; write changes to the Base with optimistic revision. Preserve unknown sections/comments and show conflict/error without overwriting.
- Red check: a view built from fixture notes changes row order/selection, saved source reopens identically, an unsupported formula fails inertly, and a concurrent external edit blocks mutation. Exercise parser/serializer and the rendered control.
- Verify: `node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/base-executable-port.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/route.test.ts`; focused component test.

### 3. Properties and View Menu (`tockteam-e0tc.3`, after 1)

- Properties menu picks visible columns from bounded discovered fields (keep file name visible). The view menu switches, renames, and adds currently supported Table/List/Cards/Map-label views without claiming other kinds. Retain source identity and other views' definitions; leave unsupported YAML editable only in Base Source.
- Red check: selecting a property and adding a view survives reopen; unrelated source and views remain byte-identical; empty/error/duplicate-name cases are legible and keyboard accessible.
- Verify: same focused Base + route/component commands; screenshot comparison across built-in dark/light.

### 4. New Note and Full Desktop Journey (`tockteam-e0tc.4`, after 1–3)

- Add a Base **New** note menu, backed by a three-choice default-location preference (vault root, active-file folder, chosen folder) with explicit final path before creation. Use the existing `.md` write path; on success refresh Base hydration without losing other panes or a pending edit. Avoid automatic retry after ambiguous write; reconcile safely.
- Red check: location choices, folder-target override, collision, stale pane/vault, write success with lost response, and filtered-out result notice. Run one app-scoped, guarded Electron flow through every screenshot control and reopen persistence; capture canonical dark unskinned `1512×949@2x` plus built-in light and four skins, error evidence, and process-tree cleanup.
- Verify: focused route/Base/Host tests; `pnpm run typecheck:tocktutor`, `pnpm run test:tocktutor`, `pnpm run build:tocktutor`, `node scripts/tocktutor-build-manifest.mjs --check`, then root typecheck/test/build. Report platform `EPERM` separately without weakening assertions; record test commands/results and Desktop proof under `.beads/reports/`.

## Risks and Review Gates

- `.base` is a bounded YAML-like subset: writing generic YAML risks modifying users' comments/unknown fields. A targeted edit must validate round-trip and refuse unsupported structures instead of normalizing them.
- The Base hydration query and `listTree` are bounded. New actions must not bypass limits or trigger unbounded scans.
- Every asynchronous create/save binds the active vault generation, pane/document identity, and expected revision. A successful write with lost response is recoverable and must not be repeated blindly.
- The screenshot is visual evidence, not a complete Obsidian spec. Treat new layout types, grouping, advanced filters, and cross-app parity as separate explicit requests.
- Existing peer edits and generated outputs were released by `01a0dca9`; the unrelated report and four pre-existing Playwright snapshots are externally owned and must remain untouched.

**Tracking:** Epic `tockteam-e0tc`; slices `.1`–`.4` above. Do not close until full flow is verified.
