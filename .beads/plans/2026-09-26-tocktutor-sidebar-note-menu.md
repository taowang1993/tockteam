# Plan: Obsidian-Style Sidebar Note Menu

## Decision and Scope

The user prefers Obsidian's persistent, editable **Open to the Right** experience. Drop **Open in Side Peek** entirely; do not build a temporary panel or another editor lifecycle. This is planning only, not implementation authorization.

Add a sidebar context menu with 13 top-level actions: the 11 existing equivalents from **More Note Actions**, plus **Open in New Tab** and **Duplicate**. Preserve the existing editor menu and its additional commands.

Proposed order and grouping:

1. **Open in New Tab**
2. **Open to the Right**
3. **Open in New Window**

Separator, then:

4. **Duplicate**
5. **Move Note…**
6. **Bookmark Note…** / **Edit Bookmark…**
7. **Merge Entire File With…**

Separator, then:

8. **Copy Path** → **Copy Relative Path**, **Copy Absolute Path**
9. **File Recovery**

Separator, then:

10. **Open in Default App**
11. **Reveal in Finder** (preserve existing platform behavior)

Separator, then:

12. **Rename Note…**
13. **Move File to Trash**

**File Recovery** reuses local snapshots; it is not a promise of cloud version history. **Copy Path** is explicitly included and is different from the excluded **Copy Link**.

Out of scope: Side Peek, Claudian, Copy Link, Turn into Wiki, Note Stats/footer, offline toggle, a new favorites system, sharing, folder/bulk actions, new Web/TUI support, and rewriting the editor or pane system. Do not remove existing status-bar statistics or unrelated More Note Actions entries.

## Complexity

Moderate integration work, not a new subsystem. The main risk is target identity: existing actions generally operate on the active editor, while the context menu must operate on the clicked note without corrupting another pane's draft. Native callbacks currently publish only an active-note binding. Duplication exists in the runtime but needs a validated Workbench transport and UI path.

## Current Owners and Reuse

Paths below are relative to `plugins/tocktutor/packages/` unless stated otherwise.

- `tockteam-tocktutor-workbench/src/route.tsx`: `TreeEntries` currently has click navigation only; the route owns More Note Actions, document records, dialogs, recovery, dirty saves, and pane navigation.
- `tockteam-tocktutor-workbench/src/session.ts`: bounded tabs and persistent split layout; reuse rather than introduce a second navigation model.
- `tockteam-tocktutor-workbench/src/host-read.ts`: validated Workbench Remote; `renameDocument` already delegates to runtime link-preserving moves. Add only the missing duplication adapter.
- `tockbot-note-runtime/src/index.ts`: `duplicateFile` uses expected vault/revision, exclusive destination writes, rollback and partial-result errors. It remains the filesystem owner.
- `tockteam-tocktutor-workbench/src/native-actions.ts` and `tockbot-note-desktop/src/client-actions.tsx`: lifecycle-owned native callbacks, save gating and authorization. Reuse the existing contribution and Host methods; no second dispatch loop.
- Root `plugins/ui/src/dropdown-menu.tsx` and `plugins/skins/src/client/tailwind.css`: shared menu behavior and presentation. Use the closest suitable shared primitive; do not hand-roll menu keyboard/focus semantics. If pointer anchoring requires a shared addition, keep it narrowly scoped to `@tockteam/ui` and follow the shadcn workflow.

These are source-inspection findings, not fresh runtime verification. Earlier active-editor menu work is tracked by `tockteam-yoam`; do not reopen or replace it merely to add sidebar access.

## Interaction and Safety Contract

- Right-click, macOS Control-click and keyboard context-menu invocation target a note row. Merely opening/dismissing the menu must not open the note, change editor selection, save anything, or replace a tab.
- Capture a menu target consisting of the opaque vault identity/generation and vault-relative path. Revalidate at action invocation and after relevant awaits; acquire current revisions at the existing document/runtime boundary. Closing the popup after choosing an action must not accidentally cancel the chosen operation.
- Keep active-editor and context-menu targeting separate. Refactor only the necessary existing handlers to accept an explicit target, leaving active-note wrappers in place. Do not implement actions by temporarily selecting B, calling an active-note callback, and restoring A.
- Bind dialogs and recovery results to their requested note. Vault changes, deleted/moved targets, disposal, or superseding requests must not retarget an operation silently.
- Reuse the single shared document record for an already-open target, including dirty content in another pane. Save only when the existing operation requires it; a failed save blocks that operation without discarding any draft.
- **Open to the Right** creates a normal editable split immediately right of the focused editor using the existing split tree, then loads the clicked note there. The original pane, its tab and dirty buffer remain intact. Existing split persistence and pane limits apply; roll back only the newly created empty pane on failed loading, without undoing later user navigation.
- **Open in New Tab** keeps the original tab and opens the target in the focused editor group. Proposed bounded default: focus an existing tab for that path in the same group rather than invent duplicate-tab semantics; enforce the existing tab limit.
- **Duplicate** saves the target's open draft first, then uses its resulting revision. Create `Name Copy.ext`, then numbered alternatives in the same folder, with a bounded collision retry limit and exclusive writes. Never overwrite. Refresh the tree and open the copy in a tab; surface partial/recovery outcomes truthfully rather than treating them as safe retries.
- Keep current document-kind restrictions: rename/move/merge are Markdown-only unless already supported at implementation time. Duplication and navigation cover the route's supported Markdown, Canvas and Base documents. Unsupported actions are clearly disabled; no folder menu is implied.
- Native actions accept only a validated relative target and opaque vault identity through the existing owner. Browser code never supplies canonical paths or native capabilities. Preserve save/authorization cancellation, operation identity and teardown. Removing the native contribution removes or disables its menu entries.
- Reuse theme tokens, Lucide, menu grouping and existing spacing. Keep keyboard navigation, nested submenu handling, Escape/outside dismissal, focus restoration and viewport collision handling accessible. A context popup is not an expandable sidebar navigation group.

## Delivery Slices

Task state belongs in Beads, not a duplicate Markdown checklist. Implement sequentially because these slices share the route controller.

### 1. Menu Access and Navigation — `tockteam-9yg5.1`

Deliver the real row context-menu entry point with **Open in New Tab** and **Open to the Right**, including explicit target binding. Primary owners: `route.tsx`, `session.ts` only where existing behavior needs extension, and a small feature menu component if extraction makes the route simpler.

Acceptance: opening/dismissing the menu leaves dirty A unchanged; opening B in a tab or right split preserves A; same-note, already-open, limit, failed-load and vault-switch cases behave deliberately. Shift+F10/context-menu key, arrows, Enter and Escape work.

Verification: focused sidebar menu component regression (new `tests/route-note-context-menu.test.tsx`), existing `tests/route-split-panes.test.tsx`, and `tests/session.test.ts` / `tests/route.test.ts`.

### 2. Existing Local Actions — `tockteam-9yg5.2`

Reuse rename, move, bookmarks, merge review, relative-path copy, File Recovery and trash for the captured target. Likely owners: `route.tsx` and the existing dialog/recovery components only where they currently assume the active note.

Acceptance: each action targets B while dirty A is open; moving/renaming retains link rewriting and open-document state; merge remains preview/approve/apply, trash recoverable, and stale dialogs/snapshot reads cannot affect another note. Relative-path copying and bookmarks need no editor navigation.

Verification: extend `tests/route-note-context-menu.test.tsx`, `tests/route-panel-controls.test.tsx`, `tests/route.test.ts` and `tests/host-recovery-transport.test.ts` as relevant. Test exact filesystem changes for mutations, not only handler calls.

Dependency: slice 1.

### 3. Existing Native Actions — `tockteam-9yg5.3`

Adapt the existing native contribution to service a clicked-note target for new window, default app, Finder reveal and absolute path copying. Keep current active-note callers compatible. Likely owners: `native-actions.ts`, `route.tsx`, `tockbot-note-desktop/src/client-actions.tsx`, and their tests; existing Host methods already take a relative path and expected vault.

Acceptance: B is the authorized target without opening B over A; dirty B saves when required; a changed vault/target/draft during authorization cancels safely. Contribution removal disables callbacks and no extra native dispatch loop mounts.

Verification: focused native client/Host tests and sidebar component tests, followed by guarded Desktop evidence. Separate validated native dispatch from proof of a real OS effect.

Dependency: slice 1.

### 4. Duplicate — `tockteam-9yg5.4`

Expose `duplicateFile` through the existing validated Workbench Remote, then connect the target-bound menu action. Likely owners: `host-read.ts`, its runtime interface/types, `route.tsx`, and focused transport/controller tests. Let Typert generation produce transport outputs; never edit generated files manually.

Acceptance: same-folder copies preserve the target's latest saved bytes and extension; name collisions never overwrite; dirty target save failures block copying; stale revision/vault, cancellation, retained partial destinations and exhausted naming retries produce honest outcomes. The copy appears in the tree and opens without replacing dirty A.

Verification: new transport/controller duplication cases, existing runtime duplication regression tests, and real disposable-vault bytes in the final Desktop flow.

Dependency: slice 1.

### 5. Integrated Proof and Documentation — `tockteam-9yg5.5`

Verify exactly 13 top-level actions and the Copy Path submenu, with unsupported actions appropriately gated. Update `.agents/references/tocktutor.md` to distinguish the sidebar menu from More Note Actions. Build release outputs and regenerate the manifest through package scripts.

Acceptance: every action has positive and wrong-target regression evidence; excluded features are absent; existing editor-menu actions still work. Prove editable right splits and dirty-draft preservation. Check long names, viewport edges, keyboard focus, reduced motion, built-in light/dark and named skins.

Dependency: slices 2–4. No implementation issue is closed based on this plan alone.

## Verification Commands and Desktop Gate

Use TDD for implementation: first add and run the smallest failing regression, then implement and rerun it. From the repository root, focused commands include:

```sh
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/route-note-context-menu.test.tsx tests/route-split-panes.test.tsx tests/route-panel-controls.test.tsx --environment jsdom
node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/session.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/route.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/host-read-transport.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/host-recovery-transport.test.ts
```

The new context-menu test is created in slice 1. Build affected packages first when their tests import generated outputs. Run the existing Desktop adapter package suite for slice 3 and the runtime duplication checks for slice 4. Before accepting React changes, also follow the react-doctor skill.

Final workspace and repository gates:

```sh
pnpm run install:tocktutor
pnpm -C plugins/tocktutor run validate:parity
pnpm run typecheck:tocktutor
pnpm run test:tocktutor
pnpm run build:tocktutor
node scripts/tocktutor-build-manifest.mjs --check
pnpm run typecheck
pnpm test
pnpm run build
```

Coordinate builds with other writers: the nested tests/builds can regenerate tracked outputs. Claim paths before modifying source or generated files; never overwrite unrelated dirty files. Make small verified commits, with no worktrees or push unless explicitly authorized.

For real Desktop verification, use only generic Electron launched by `extended_display` on a non-main display and app-scoped Playwright on its returned owned CDP endpoint. Use an isolated disposable vault/profile and `--use-mock-keychain`, preserve HOME, and never launch raw browser/app processes or the user's default editor/Finder through an unapproved route. Native external-app effects that cannot be safely exercised under the guard must remain explicitly unverified; test their authenticated dispatch with a bounded substitute instead, without claiming that proves OS behavior.

Record 1512 × 949 CSS pixels at 2× (3024 × 1898 PNG), route, visible mode/content and runtime errors. Canonical evidence uses dark/no skin, with seeded `skins.json` and verified document color scheme and absent skin attributes. Publish only allowlisted screenshots under `.beads/reports/`, stop the owned instance explicitly and verify descendants are gone. Existing launcher smokes may run only if compatible with this guard; never execute a raw-spawning harness as a workaround. If an installed final smoke is applicable, run it once after focused gates, with its temporary root in a `.noindex` cache, never concurrently with packaging checks.

## Beads and Authority

Epic: `tockteam-9yg5`; slices: `.1` through `.5` above. All implementation work remains open pending a user request to implement. No application files were changed or GUI processes launched while writing this plan.
