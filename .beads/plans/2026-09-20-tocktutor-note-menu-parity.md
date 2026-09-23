# Plan: Complete TockTutor Note Menu with Obsidian-Style UIUX

## Outcome and Authority

Deliver **all** previously discussed missing core note-menu features, not only the recommended subset. Match Obsidian's information hierarchy, compact controls, interaction sequences, keyboard behavior, and spatial pane behavior while retaining TockTeam's design-system and security contracts.

This revision covers the eight feature groups requested in the latest discussion. It updates the existing plan and issues rather than creating a competing implementation track. Epic: **tockteam-yoam**. Original planning issue: **tockteam-yoam.1**; this planning refresh: **tockteam-yoam.15**. The user now explicitly authorized end-to-end implementation and approved the guarded-startup fix. Verification windows must fill the extended display's work area before visibility, without focus or macOS full-screen Spaces. Live implementation status and dependencies belong in Beads. Current reference observations and intentional adaptations are recorded in `.beads/reports/2026-09-20-note-menu-reference-gate.md`.

## Scope

Users should be able to locate, organize, search, compare, and safely combine notes directly from the active note menu, without losing drafts or switching to unrelated panels. Deliver the following eight groups in this recommended order; none is an optional stretch goal.

| Order | Feature Group | Required Result and Acceptance | Existing Issues / Detailed Slices |
| --- | --- | --- | --- |
| 1 | Reveal File in Navigation | Open Files, expand ancestors, and reveal the exact note without reopening it or losing edits. Handle hidden sidebars, duplicate names, and missing targets. | `tockteam-yoam.3` / slice 2 |
| 2 | Edit Bookmark… | Edit the existing bookmark's title and group while preserving its ID; cancel, remove, and reload work without duplicates or file renames. | `tockteam-yoam.6` / slice 5 |
| 3 | Copy Path › | Preserve Copy Relative Path and add Copy Absolute Path in a keyboard-accessible submenu. Trusted Desktop code copies the canonical path without exposing it to the renderer or saving unnecessarily. | `tockteam-yoam.11` / slice 10 |
| 4 | Find… / Replace… | One note-local search strip with highlights, counts, navigation, replacement, and exact undo across supported editor modes. Find first; Replace builds on it. | `tockteam-yoam.7` → `.8` / slices 6–7 |
| 5 | Split Right / Split Down | Render genuinely simultaneous editors, then mixed-direction layouts and resizing. Views keep separate focus/scroll/mode but share one authoritative draft per file; layout restores safely. | `tockteam-yoam.4` → `.5` / slices 3–4 |
| 6 | Open Linked View › | Open reference-verified note-bound views with correct source-pane follow/pin behavior, independent of global focus. Build on real split panes, not generic panel toggles. | `tockteam-yoam.13` / slice 12 |
| 7 | Open in Default App | Save and revalidate the exact current file before a narrow OS-associated open; conflicts, stale requests, unsafe files, and OS failures must not produce false success. | `tockteam-yoam.12` / slice 11 |
| 8 | Merge Entire File With… | Pick a destination, review content/properties/links/source disposition without mutation, then apply a revision-checked, recoverable merge. Retry and interrupted recovery must not lose originals or duplicate content. | `tockteam-yoam.9` → `.10` / slices 8–9 |

Detailed slice numbers below are retained for stable references; they are not the revised delivery order. Each slice specifies owners, edge cases, and verification. Reference/menu alignment (`tockteam-yoam.2`) precedes all eight groups; full parity verification (`tockteam-yoam.14`) follows them.

Preserve and regression-test existing **Backlinks in Document**, editor modes, rename/move/property actions, **Bookmark Note**, **Open in New Window**, **Export PDF**, **Reveal in Finder**, **Copy Relative Path**, recovery/trash, and current panel entry points. Adding shortcuts does not remove their existing panels.

**Excluded:** Add to Claudian or other third-party Obsidian plugin integrations; a general Obsidian plugin host; Web/TUI enablement; a new theme system; arbitrary external commands; vault-wide replace; unrelated bookmark-type repairs. No scoped feature is deferred out of this plan. Phases are delivery order, not an MVP cut.

## Evidence and Current Gaps

Inspected the current source and `.agents/uiux/tocktutor/screenshots/obsidian-note-actions.png` (3024 × 1898 pixels). The screenshot establishes the top-level menu, but does **not** establish submenu contents, dialogs, search options, merge semantics, or linked-view follow behavior. Those receive a bounded reference-verification gate before implementation; do not invent parity claims.

| Existing Owner | Finding and Planned Reuse |
| --- | --- |
| `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx` | Owns the note menu, navigation, dirty-save gating, active editor, tree, pane groups, and panel callbacks. Use this orchestration boundary. |
| Workbench `src/session.ts`, `src/settings.ts` | Persist bounded groups/tabs and named workspaces. `PaneGroup` has no split orientation/layout, and `addPane()` clears the active document and changes focus. The route renders one editor: **split actions require real rendering/state work, not two labels around `addPane()`**. Preserve limits of eight groups and twenty note tabs per group. |
| Workbench `src/bookmarks.ts` | Existing bounded persistence, stable IDs, groups, and rename remapping. Add editing using the same records/storage key. |
| Workbench `src/composer.ts` | `mergeNotes()` computes strings; route imports extraction/conversion, not a complete merge workflow. Blindly appending the helper's output would not prove frontmatter, links, multi-file durability, or source retirement. |
| Workbench `src/source-editor-runtime.tsx`, `src/live-preview-editor-runtime.tsx`, `src/editor-surface.tsx` | Own CodeMirror, Milkdown, and Reading rendering. Implement editor-local search/transactions here; never treat Live Preview document positions as Markdown offsets. |
| Workbench `src/note-backlinks.tsx`, `src/utility-panel.tsx` | Reuse relationship, outline, and graph presentations; separate note identity from whichever document currently has global focus. |
| Workbench `src/native-actions.ts`; Desktop `src/client-actions.tsx`, `src/host-actions.ts` | Existing lifecycle-bound note callbacks and native authorization. Extend narrow typed operations rather than create a parallel bridge. |
| `plugins/tocktutor/packages/tockbot-note-runtime/src/index.ts` | Owns canonical vault/file validation, revision checks, mutation, snapshots/recovery, and trusted reveal. Native target resolution and merge mutation belong on this side of the boundary. |
| Root `src/desktop-caller-authorization.ts`, `src/desktop-reveal*.ts`, `src/main.ts`, `src/preload.ts` | Existing Desktop authority and OS integration. Reuse applicable validation/lifecycle patterns, not unrelated launcher's broad authority. |

The semantic index reported route drift; current source was read directly. The pre-existing working tree contains uncommitted note-menu/backlink changes and generated outputs. Implementation must preserve these and verify ownership before modifying externally changed paths.

## UIUX Contract

**Design read:** a frequently used desktop note menu for Obsidian users. Prioritize familiar grouping, compact density, predictable focus, inline editing tools, and true spatial splits—not dashboard cards or generic settings panels.

### Menu Organization

Use the captured Obsidian sequence as the reference, adapted to TockTeam Title Case and its existing three-mode control:

```text
Backlinks in Document                 [Checked When Enabled]
Reading View / Live Preview / Source Mode
────────────────────────────────────────────────────────────
Split Right
Split Down
Open in New Window
────────────────────────────────────────────────────────────
Rename Note…
Move Note…
Bookmark Note… / Edit Bookmark…
Merge Entire File With…
Add Property
Export PDF…
────────────────────────────────────────────────────────────
Find…
Replace…
────────────────────────────────────────────────────────────
Copy Path                            ›
    Copy Relative Path
    Copy Absolute Path
────────────────────────────────────────────────────────────
Open Linked View                     ›
────────────────────────────────────────────────────────────
Open in Default App
Reveal in Finder
Reveal File in Navigation
────────────────────────────────────────────────────────────
Existing TockTutor Panel Shortcuts
────────────────────────────────────────────────────────────
Move File to Trash
```

The panel-shortcut row above represents the existing extension group, not a new dummy action. Keep its features reachable, separated from the parity actions; do not use generic panel toggles as substitutes for the new interactions. Retain TockTeam's recoverable trash wording instead of implying permanent deletion. Use platform-appropriate native reveal wording outside macOS. Ellipses indicate additional user input, not every asynchronous operation.

### Geometry, Styling, and Input

- Record reference menu width, row height, icon/text inset, separator spacing, radius, anchor, and shadow in the first slice. Reuse the closest existing menu recipe; target row height within 1 CSS pixel and icon/text/separator spacing within 2 CSS pixels of the measured reference. Permit width expansion for Title Case/localized labels; no clipping or arbitrary font overrides to force a pixel match.
- Use public `@tockteam/ui` DropdownMenu/submenu, Dialog, Command, form, and status primitives, Lucide icons, DSH-derived semantic colors, and Tailwind. Keep feature geometry local. No new palette, component framework, stylesheet, or global typography scale.
- Keep the menu aligned with the active pane's ellipsis. Handle viewport edges, submenu collision, and tall-menu scrolling. Submenus must not be clipped by editor overflow or the menu's scroll owner.
- Preserve arrow/Home/End navigation, typeahead, Enter/Space activation, submenu left/right navigation, Escape/outside dismissal, and trigger-focus restoration. Opening a dialog transfers focus into it; closing returns to the originating pane, not an unrelated editor. Advertise only implemented platform-correct shortcuts.
- Actions operate on the pane that opened the menu. Revalidate vault generation, pane/tab identity, and path after awaits; closing or changing the owner invalidates late results.
- Show pending/disabled/selected/error states honestly. Do not label a command complete until its operation succeeds. Missing native contributions remove unsupported native actions; unsupported document types get consistent eligibility rather than fake success.
- Match Obsidian's compact bookmark dialog, searchable merge destination picker, inline Find/Replace strip, pane gutters, and linked-view placement. Reference behavior takes precedence over speculative UI. Any intentional safety difference is documented next to its proof.
- Verify built-in light/dark plus Deep Current, Jade Circuit, Porcelain, and Ember Dusk. Canonical Obsidian comparison always uses built-in dark and no skin.

## Ownership and Data Decisions

### Pane and Linked-View State

Keep one existing route/controller composition. Extend bounded session data with the minimum recursive split layout required for mixed right/down splits; each leaf references an existing pane group. Store split axis and bounded ratio, validate cycles/depth/orphans, and collapse a parent when its child closes. Restore legacy group-only sessions without deleting tabs, preferences, or named workspaces.

Separate per-view focus/mode/scroll/search state from each document's authoritative source/revision. Two views of one file must not hold competing authoritative drafts. Reuse the current save/recovery owner keyed by vault identity and document path; do not mount independent full route controllers or agent loops per pane. Recheck operation identity across dirty saves and navigation.

Linked views use an explicit source-pane binding. The verified Obsidian 1.13.7 target set is **Backlinks, Outgoing Links, Properties, Outline, and Local Graph**. Properties is the additional small vertical slice `tockteam-yoam.17`, reusing existing presentation and source binding without a new service/dependency. Reference placement is below the source for backlinks/outgoing links/properties and to its right for outline/local graph; each is a real linked pane. Include any additional core target found there in the reference matrix and estimate its own slice before coding rather than ship a misleading inert item. Verify whether linked views follow source-pane navigation, retain a specific file, or expose pinning; implement the observed behavior. Focus moving to a different pane must not silently rebind them. Dispose their listeners/queries on close.

### Note-Local Find and Replace

Reuse installed editor search/transaction facilities where they meet the contract; first inspect actual pinned dependencies. Use one inline search UI and editor-specific adapters, not a new regex engine or browser-global Find overlay.

Find supports the current query, highlights, next/previous, current/total count, Escape, and reference-verified case/whole-word/regex options. Keep search local to one pane and distinct from vault search. Handle empty/invalid patterns and bound work for large notes; user patterns must not freeze the UI.

Replace and Replace All are editor transactions. Replace All is one undo step; preserve undo, selection, scroll, newline style, source bounds, and dirty state. Live Preview requires correct document-position mapping, not guessed source offsets. Reading mode changes explicitly to the last editing mode before replacement; preserve query and explain that transition. Do not silently edit Canvas/Base structured data with Markdown replacement controls.

### Recoverable Merge

Reuse Composer text transforms only where their semantics match the reference. The review specifies source/destination paths, append/prepend, property handling, and source disposition. Both files must be Markdown, distinct, same-vault, safely resolved, and revision-checked. Save dirty source/destination views before creating a review; a later edit invalidates it.

Preserve or explicitly resolve frontmatter conflicts; never concatenate a second YAML header as accidental body text. Rebase relative links/embeds where relocating content changes their meaning. Record the reference's treatment of the old note, inbound links, headings, and block IDs. Do not silently discard conflicting properties or ambiguous links; show conflicts in the review and require a deliberate resolution.

Apply through one bounded Host/runtime operation using existing recovery and mutation primitives. Retain original snapshots and durable phase information before modifying either file. Verify destination publication before retiring the source into recoverable trash or applying the explicitly selected leftover link/embed policy. A crash between files is not filesystem-wide atomicity: on restart detect the partial phase, preserve both originals, and offer safe recovery. Repeated application must not duplicate appended content. Never overwrite a newer user edit during rollback.

Where reference behavior rewrites inbound links, use bounded exact-target rewrites and include their affected paths/revisions in review; an incomplete index is not proof that all links were updated. Unsupported/ambiguous rewrites block silent source retirement and require an explicit keep-source decision. Refresh tabs, bookmarks, tree, search, and relationships only after an authoritative mutation result.

### Native File Actions

Absolute-path copy and default-app opening are new, narrowly authorized Desktop operations. Browser requests contain only opaque authorization, vault identity, and validated relative path. The trusted owner resolves and revalidates the canonical regular document; the main process performs clipboard writing or OS association dispatch. Never return an absolute path to the renderer merely to copy it, and never interpolate a shell command.

Opening externally saves first and stops on conflicts/failure. Path copying should not force an unnecessary content save. Both reject stale vaults, changed owners, traversal/symlink escapes, expired/replayed authority, and late callbacks after unload. Limit default-app opening to supported inert document types; do not turn it into an executable launcher. Show no-association/OS/clipboard failure feedback. Keep external-change conflict detection active after handoff.

TockTutor remains Desktop-only today. No change to Web profile composition, native emulation, bundle IDs, user patches, credentials, or DSH loops is required.

## Delivery Slices and Acceptance

Paths below are relative to `plugins/tocktutor/packages/tockteam-tocktutor-workbench/` unless explicitly qualified. Each slice begins with a failing regression and ends with its own real UI demonstration. Issue descriptions carry acceptance requirements; the following adds concrete code/test seams.

### 1. Reference and Existing Menu Alignment — `tockteam-yoam.2`

**Depends on:** a working extended-display guard (tracked in `tockteam-cbzh`) and its safe-launch preflight below. Guard installation alone does not complete this reference gate. Record the saved reference, Obsidian version/core-plugin state, and missing submenu/dialog/search/linked-view captures using an isolated fixture vault. Align existing entries with the measured groups and shared overlay behavior; do not add disabled placeholders for unfinished features.

**Owners:** `src/route.tsx`, `tests/route-panel-controls.test.tsx`, parity ledger and existing screenshot publication workflow.

**Accept:** a reference matrix maps each feature to its UI, trigger, result, states, and explicit TockTeam adaptation; keyboard/submenu/edge placement works; existing actions remain reachable. If a reference cannot be obtained without taking over the user's app, request permission or record that gate as blocked rather than guess.

**Verify:** focused component command below, then matched menu screenshots and the reference matrix review. Completion unlocks the independent slices.

### 2. Reveal File in Navigation — `tockteam-yoam.3`

**Depends on:** 1. Reuse tree/sidebar ownership to reveal the exact active path; expand ancestors and scroll its row into view without reopening the note. When Search occupies the sidebar, return to Files while retaining the search query.

**Owners:** `src/route.tsx` (`TreeEntries` and sidebar state), `tests/route.test.ts`, `tests/route-panel-controls.test.tsx`.

**Accept:** hidden sidebar and collapsed ancestors work; duplicate basenames and bounded/paginated trees resolve correctly; missing/stale targets show status and never discard editor selection or unsaved content. Do not use an unescaped CSS selector built from a file path.

**Verify:** focused route/component tests, then reveal a nested Unicode-named note opened from search/backlinks.

### 3. Real Split Right — `tockteam-yoam.4`

**Depends on:** 1. Render two simultaneous views using existing groups and a compatible layout extension. Menu target is the active pane; the original remains in place and the new right pane becomes active with the same note.

**Owners:** `src/route.tsx`, `src/session.ts`, `src/editor-surface.tsx`, existing session/editor/route tests. `settings.ts` continues to serialize validated session state.

**Accept:** both panes display real documents and remain interactive; scroll/mode/focus are view-local while same-file source is coherent; dirty saves, close, group limits, legacy sessions, and reload cannot lose drafts.

**Verify:** session/route and editor-adapter commands below; Desktop proof edits one note in two panes and two different notes without stale overwrites.

### 4. Split Down, Nested Layout, and Resizing — `tockteam-yoam.5`

**Depends on:** 3. Add vertical subdivision to the same model, bounded mixed-axis nesting, keyboard/pointer resizing, and named-workspace restoration.

**Owners:** session/layout/route code, `src/settings.ts` if normalization needs extension, `tests/session.test.ts`, `tests/settings.test.ts`, route component coverage.

**Accept:** only the selected pane splits; close collapses the correct branch; ratios/orientation restore and malformed legacy data falls back without erasing tabs; gutters have correct orientation, focus, limits, and keyboard semantics.

**Verify:** session/settings/component checks plus right→down→resize→close→reload Desktop flow at normal and narrow widths.

### 5. Edit Bookmark — `tockteam-yoam.6`

**Depends on:** 1. Make the note action state-sensitive: create when absent, edit when present. Use a small title/group dialog and the existing bounded store.

**Owners:** `src/bookmarks.ts`, route/dialog composition, `tests/bookmarks.test.ts`, route component tests.

**Accept:** preserve ID, path, order, and unrelated bookmarks; edit grouped records without duplicates; allow cancel/removal and reference-supported grouping; reject invalid/oversized names and storage failure without mutating accepted state. Renaming a bookmark must not rename its note. If several bookmarks legitimately target a note, select the intended record instead of rewriting all of them.

**Verify:** bookmark/route tests and create→edit→move group→reload→remove UI sequence, including failed persistence.

### 6. Note-Local Find — `tockteam-yoam.7`

**Depends on:** 1. Add the inline strip with editor-specific search behavior in all three Markdown modes. Scope shortcuts and query state to the active note pane.

**Owners:** editor runtimes/surface, route command entry, existing editor adapter/command and route component tests.

**Accept:** counts/highlights/next/previous agree; empty/no-match/Unicode and verified matching options work; Escape restores editor focus and closing/unloading cancels work. Hidden DSH/terminal handlers must not intercept the command.

**Verify:** editor adapter/command checks and real Source/Live Preview/Reading searches; repeat in split panes once slice 4 is available.

### 7. Note-Local Replace — `tockteam-yoam.8`

**Depends on:** 6. Expand the same strip with replacement, Replace, and Replace All using each editor's actual transaction model.

**Accept:** correct Source and Live Preview matches including formatted text; Replace All undo restores exact prior content; Reading transition is explicit. Exercise zero-length/invalid patterns, multiline/CRLF text, emoji, read-only/unsupported states, bounds, external edits, and failed saves. Do not reinterpret replacement text unexpectedly.

**Owners/verify:** same editor seams as 6, plus regression assertions for undo and save conflicts; UI proof of replace→undo→redo→save in both editing modes.

### 8. Merge Destination and Non-Mutating Review — `tockteam-yoam.9`

**Depends on:** 1. Provide searchable exact-path destination selection and a review showing content/property conflicts and source disposition. Establish the reference-informed merge policy before any destructive apply.

**Owners:** `src/composer.ts`, a feature-owned picker/review component if needed, route integration, `tests/composer.test.ts`, route components.

**Accept:** exclude same-file/unsupported targets; disambiguate duplicate filenames; represent append/prepend, properties, relative links, and source outcome explicitly. Preview/cancel/navigation never mutate files. Dirty saves precede review and changed revisions invalidate it.

**Verify:** composer and route component checks; compare file hashes before/after every preview/cancel path. This is an intermediate slice, not a claim that the merge feature is shipped.

### 9. Recoverable Merge Apply — `tockteam-yoam.10`

**Depends on:** 8. Complete the reviewed flow through a bounded runtime operation. Workbench submits validated relative paths, revisions, and the reviewed decision; Host owns effects, recovery, and retry identity.

**Owners:** Runtime `src/index.ts` and focused mutation/recovery tests; Workbench `src/host-read.ts`, `src/composer.ts`, route integration and runtime-facing tests. Reuse recovery storage rather than add a general transaction framework.

**Accept:** destination verified before source retirement; explicit conflict/property/link decisions preserved; repeat requests do not duplicate content. Fault-inject between every publication/retirement stage, during cancellation and after restart; originals and newer external edits remain recoverable. Refresh all affected open views without erasing dirty drafts.

**Verify:** runtime package tests, composer/route tests, real fixture merge plus recovery/restore and duplicate-apply checks. Keep the feature incomplete until both slices 8 and 9 pass.

### 10. Copy Path Submenu — `tockteam-yoam.11`

**Depends on:** 1. Move the already working relative copy action into the reference-style submenu and add narrowly authorized absolute-path copying.

**Owners:** Workbench menu/native callback types; note-desktop client/Host; root native caller/clipboard owner. Update every owning typed contract and generated binding through its build scripts.

**Accept:** exact relative and platform-native absolute paths, including spaces/Unicode; no renderer absolute-path disclosure or broadened arbitrary clipboard API; permission/unavailable/stale/clipboard-error feedback; proper keyboard submenu focus. Copy leaves note content and dirty state unchanged.

**Verify:** Workbench components and native-note tests, Desktop Host/client tests, caller authorization tests; intercept clipboard only in bounded UI proof and label that boundary honestly.

### 11. Open in Default App — `tockteam-yoam.12`

**Depends on:** 1. Save the owner note, revalidate identity, then request an OS-associated open through the trusted Desktop owner.

**Owners:** same existing native callback/caller chain, Runtime target validation, root OS integration.

**Accept:** the correct supported document opens; failed save/no association/OS error reports failure; navigation/unload/expired authorization/unsafe path cannot open the old or an arbitrary target. Returning external changes still exercise existing recovery/conflict behavior.

**Verify:** note-desktop tests and native authorization/abort tests, including a stubbed OS boundary. A stub proves correct dispatch, not actual OS launching. The current verification guard blocks external application opens: intercept this boundary for automated UI proof and label it honestly. Real OS-association proof remains blocked unless a supported, owned extended-display-safe path exists or the user explicitly performs the handoff and supplies evidence. Do not launch an arbitrary associated app, attach to a user app, or weaken the guard to make this gate pass.

### 12. Open Linked View — `tockteam-yoam.13`

**Depends on:** 4 and the verified reference matrix from 1. Reuse relationship, outline, and local graph renderers inside a genuinely note-bound view. Implement the reference-verified target set and follow/pin behavior.

**Owners:** route/session view binding, `src/note-backlinks.tsx`, `src/utility-panel.tsx` or narrowly extracted existing renderers, their tests.

**Accept:** view targets the owning note, not the globally focused note; reference-observed placement/navigation/follow behavior holds; stale requests, rename/deletion, source pane close, unload, empty results, retry, and truncated data remain safe and explicit. Closing a linked view does not close the source note.

**Verify:** session/relationship/route component tests and two-source-pane UI flow with independently linked views. A generic Backlinks/Graph panel toggle alone does not pass.

### 13. Full Parity and Regression Gate — `tockteam-yoam.14`

**Depends on:** every feature slice above. Run the complete menu in populated, no-note, unavailable-native, loading, error, and unsaved states; include all previously delivered actions.

**Owners:** existing parity fixtures/ledger, UI evidence publishing, `.agents/references/tocktutor.md` when implementation is complete, focused and full test suites.

**Accept:** matched captures and interaction evidence for menu, both submenus, bookmark/merge dialogs, Find/Replace, both split orientations, and linked views; exact content effects and safety paths demonstrated; no menu entries claim unfinished behavior. Classify each native proof as real or intercepted. All launched process descendants must be stopped.

## Dependency and Delivery Order

**Recommended sequence:** reference gate → Reveal File in Navigation → Edit Bookmark → Copy Path → Find then Replace → Split Right then Split Down → Open Linked View → Open in Default App → Merge Review then Recoverable Apply → full parity gate.

**Checkpoints:**

- After groups 1–3: exact-path navigation, bookmark persistence, and both copy actions work end to end; existing menu actions remain reachable.
- After groups 4–6: repeat Find/Replace in real split panes, prove same-file draft coherence and exact undo, and verify independently bound linked views through reload/close.
- After groups 7–8: native dispatch and recoverable merge failure paths pass; distinguish intercepted operations from real OS evidence before final acceptance.

This sequence prioritizes useful lower-risk actions, then editor/layout work, then external effects and multi-file mutation. It does not add artificial blocking edges between technically independent groups. The actual dependency graph remains:

```text
Reference and Menu Alignment (.2)
    ├── Reveal (.3)
    ├── Split Right (.4) → Split Down (.5) → Linked View (.13)
    ├── Bookmark (.6)
    ├── Find (.7) → Replace (.8)
    ├── Merge Review (.9) → Recoverable Merge (.10)
    ├── Copy Path (.11)
    └── Default App (.12)
All Feature Slices → Full Parity Gate (.14)
```

Use one writer for shared route/session/native contracts. Independent branches in this diagram describe dependencies, not permission to create worktrees or launch concurrent writers. No new worktrees are required. Review each slice before accepting it; use the active Git profile and never push without authority.

## Verification Commands and Evidence

### Focused Checks

Run from the repository root. Start with the smallest relevant failing check, then expand.

```sh
# Route/menu and native-menu components
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/route-panel-controls.test.tsx tests/native-note-menu.test.tsx --environment jsdom

# Route/session/bookmark/composer/state logic
node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/route.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/session.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/settings.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/bookmarks.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/composer.test.ts

# Editor behavior
node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/editor-commands.test.ts
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx tests/route-editor-readiness.test.tsx --environment jsdom

# Mutation/native boundaries when affected
pnpm -C plugins/tocktutor/packages/tockbot-note-runtime test
pnpm -C plugins/tocktutor/packages/tockbot-note-desktop test
node --test tests/desktop-caller-authorization.test.ts tests/desktop-caller-bridge.test.ts tests/desktop-native-caller-abort.test.ts tests/desktop-reveal.test.ts

# Shared UI contracts
node --test tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts tests/icons.test.ts tests/skins.test.ts
pnpm --filter @tockteam/ui run typecheck
```

Add focused new cases alongside those tests, not a parallel test framework. Run React Doctor before/after React changes; compare diagnostics rather than assume a perfect baseline.

### Full Gates

```sh
pnpm run typecheck:tocktutor
pnpm run test:tocktutor
pnpm run build:tocktutor
node scripts/tocktutor-build-manifest.mjs --check
pnpm run typecheck
pnpm test
pnpm run build
```

Rebuild tracked outputs and refresh the manifest through repository scripts as required; never hand-edit generated output. For the new native operations, the applicable gate is `pnpm run test:launcher:electron` after focused checks. If packaging requires installed verification, the gate is `pnpm run test:launcher:installed` once for the final commit, after other gates, with `TOCKTEAM_INSTALLED_SMOKE_TEMP_ROOT` under a `.noindex` cache; never concurrently with packaging checks. **Neither command grants an exception to the launch guard:** inspect GUI-starting harnesses first and route supported verification through an owned `extended_display` instance. If a harness requires an unsupported raw app launch, record the gate as blocked rather than run it or claim equivalent intercepted proof. Browser-only styling slices do not need launcher smoke. No Web profile change means no Web launch claim.

### Extended-Display Safe-Launch Gate

All agent-opened verification windows must stay on an extended display, never the main display. Before any reference or product GUI proof:

- Confirm the current parent session has the guard loaded and the `extended_display` tool available. Installation in a previous session is not evidence that this session is protected.
- Use `extended_display` to inspect/select a non-main, non-mirrored display and launch a supported generic Electron runtime with the guard installed before app code. Top-level verification windows must fill that display's work area before visibility and remain unfocused; child dialogs stay bounded. Do not use macOS full-screen Spaces. Record display ID/work area, initial and subsequent window bounds, non-focusing visibility, owned CDP endpoint, root PID, and cleanup evidence.
- Use isolated fixture profiles/vaults and app-scoped CDP only against that returned endpoint. No raw native app/browser launch, user-app attachment, main-screen fallback, or reuse of the incident's `/tmp/obsidian-reference-probe.mjs` launcher.
- If a child lacks the launch tool, the parent owns the guarded launch. Child shell work uses the guarded executor; do not switch runners to bypass a blocked tool.
- Missing display, unsupported reference app, or incompatible smoke harness blocks the affected proof. Preserve the source-level/test evidence, but leave the reference/runtime gate incomplete rather than invent parity.
- Stop the full owned process tree in cleanup and verify no descendants remain; display loss must terminate verification rather than relocate windows to the main display.

### Visual and Interaction Proof

Use the existing bounded Playwright/Desktop-CDP process through the guarded launch, isolated fixture vault/profile, and app-scoped interactions. Seed `skins.json` with `{"activeId":null,"fallbackTheme":"dark"}`. Verify `document.documentElement.style.colorScheme === 'dark'`, absent `data-tockteam-skin`, **1512 × 949 CSS pixels**, **2× device scale**, and **3024 × 1898 PNGs** before canonical comparison. Record route, fixture content, mode, visible state, console/page errors, and proof boundaries. The current Sidecar work area is narrower than the canonical 1512-pixel viewport: keep the physical window entirely inside its work area and verify whether owned CDP viewport/device-scale emulation can produce the exact required CSS and PNG geometry. If it cannot, block canonical capture; do not enlarge the physical window onto the main display, silently shrink the baseline, or substitute a resized screenshot.

Inspect screenshots against the saved Obsidian reference and any newly captured reference details. Match the same note/content/mode and bookmark state; do not compare an unbookmarked TockTutor menu to a bookmarked Obsidian menu and call the label a mismatch. Test submenus at both viewport edges, long Unicode paths, zoom/narrow layouts, keyboard-only controls, reduced motion, and each supported theme/skin. Publish only allowlisted evidence transactionally; never replace canonical dark screenshots with skin captures.

Pass `--use-mock-keychain` for temporary Electron/Chromium verification; preserve the real HOME when possible. Do not control the user's cursor, keyboard, foreground app, vault, clipboard, or Keychain. Record root PID/process group, clean up in `finally`, and verify every descendant stopped. Label intercepted clipboard/OS operations explicitly.

## Risks, Gates, and Existing Failures

| Risk | Required Mitigation |
| --- | --- |
| Calling tab switching a split | Require two simultaneously rendered, independently interactive panes and persisted spatial layout. |
| Same-file drafts in several panes | One authoritative document source/revision; view-local state; concurrency and reload tests. |
| Find/Replace corrupts formatted text | Use editor-native transactions and correct offset mapping, exact undo checks, bounded patterns. |
| Merge loses data or duplicates an append | Revision-bound review, durable recovery phases, original snapshots, idempotency, and fault-injected restart tests. |
| Copy/open leaks Host paths or bypasses authority | Main-owned path resolution/effect, narrow authorization, inert document validation, no arbitrary renderer paths. |
| Menu resembles Obsidian only in a screenshot | Verify full interactions, modal focus, submenu keyboard model, live pane behavior, and all error states. |
| Unverified submenu/merge semantics | Reference slice is a real blocking gate; no speculative parity claim. |
| Verification opens windows on the main display | Guarded launch before visibility, verified placement, no focus, and full process cleanup; fail closed when unsupported. |
| Guard blocks default-app or installed-smoke proof | Keep dispatch/intercepted evidence distinct; real native proof remains incomplete until a compliant route or explicit user-performed check is available. |
| Existing unrelated failures mask regressions | Record/reproduce baseline separately; never weaken assertions or silently call the full suite green. |

Previous work reported one root failure at `tests/tailwind.test.ts:54` (expected utility list omits an existing utility), a startup `workspaces.startSession` console error, and an assistant slot crash tracked in `tockteam-2jkp`. These are historical observations, not verified results of this planning turn. Re-establish the baseline before implementation; do not assume every later failure is the same issue.

## Completion Definition

The epic is complete only when every scope row has a functioning menu-to-result flow, the exact relevant Obsidian reference is recorded, safety and failure paths pass, supported themes/input modes remain usable, old sessions/user data survive, and canonical screenshot plus runtime evidence is reviewed. Planning completion does not close the implementation epic.
