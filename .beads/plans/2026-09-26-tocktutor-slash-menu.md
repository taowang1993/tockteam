# Plan: Notion-Style Slash Editing With TockTeam Design

**Status:** Approved and implemented. See [verification and limitations](../reports/2026-09-26-tocktutor-slash-menu/report.md). The full repository gate retains separately reported environment restrictions.

**Tracking:** Epic `tockteam-ptmd`; slices `tockteam-ptmd.1` → `tockteam-ptmd.2` → `tockteam-ptmd.3`.

## Recommendation

Keep Milkdown as the editor. Build a focused TockTutor-owned slash-menu integration using Milkdown's public slash/block providers and existing ProseMirror editing primitives. Render it with TockTeam's shared controls and semantic tokens.

This is not an editor rewrite, a new command framework, or a fork of Crepe. It replaces Crepe's coupled **BlockEdit** presentation while preserving the add/drag controls through Milkdown's existing block machinery. We own the interaction and presentation; Milkdown continues to own document editing, schema, selection, history, and block drag behavior.

**Design Read:** A frequently used, keyboard-first writing tool. Borrow Notion's inline command workflow and compact grouped list, not its palette, fonts, proprietary commands, or separate design system.

## Problem and Verified Baseline

Typing `/` after existing heading or paragraph text does not open TockTutor's current menu. The existing menu also uses category tabs rather than the single grouped list in the supplied Notion screenshot.

There are two distinct upstream layers:

- Milkdown's `SlashProvider` already recognizes a slash immediately before the caret in a paragraph and accepts custom `shouldShow` logic.
- Crepe's menu overrides that logic: the inspected text must start with `/`, and the caret must be at the end of the block. Its public `slashMenu` options expose positioning, not trigger/query handling.
- Crepe's default conversion actions clear block content. Its existing `buildMenu` hook can replace those actions, but cannot replace the hardcoded trigger or menu component.
- Crepe exposes `BlockEdit` as one feature containing the menu and block handle. Its handle's plus action calls a private menu context. Merely disabling the feature would remove existing add/drag affordances; merely hiding its menu would leave competing handlers.

Sources inspected in Milkdown 7.22.2: `packages/plugins/plugin-slash/src/slash-provider.ts`, `packages/crepe/src/feature/block-edit/{index.ts,menu/index.ts,menu/config.ts,handle/index.ts}`. Local research checkout: `/Users/taowang/research/tutor/milkdown`; the report `/Users/taowang/research/tutor/milkdown.md` is a general comparison, not an exact interaction specification.

A Crepe upgrade alone does not change this behavior. Guarded Desktop verification on 7.22.2 confirmed that the empty-paragraph menu still opens, Heading 2 conversion works, and undo returns to a paragraph; slash after existing heading/paragraph text remains unsupported.

## Proposed User Experience

### Trigger and Search

- `/` opens immediately at a collapsed caret in an editable paragraph or H1–H6, including after existing text, without requiring a preceding space.
- It works in the middle of a block as well as at its end. Example: typing `/h2` between `Before ` and ` after` changes the block to Heading 2 while retaining both sides.
- Text after the triggering slash filters the list. Support readable names and a small explicit alias set: `h1`, `h2`, `heading 2`, `text`, `quote`, `bullet`, `todo`, `code`, `table`, and the other shipped command names. No remote search or fuzzy-search dependency.
- Keep typing in the editor; do not focus a separate menu search field. Optional “Type to search” is a decoration, never saved document text.
- Do not open on initial document load, restored source, paste, non-collapsed selections, IME composition, code blocks, inline code, links, or read-only content. Restrict initial command eligibility inside table cells/list items to valid schema operations; unsupported actions are unavailable rather than rewriting enclosing structures.
- Ordinary text ending in `/` may intentionally open the menu. Escape keeps the literal text; do not invent a fragile rule that tries to distinguish every filesystem path from a command. Recognizable URL/link contexts remain excluded.

### Choosing and Dismissing

- Up/Down changes the highlighted result; Enter applies it. Pointer selection uses the same action without losing the native selection. Home/End and Left/Right continue normal text navigation and close the menu if the caret leaves its tracked range.
- Escape and outside interaction dismiss without deleting `/query`. Escape suppresses reopening at the same trigger until the user deliberately starts a new invocation. Backspacing away the trigger closes it.
- Tab dismisses and retains the editor's existing Tab behavior; it does not unexpectedly execute a command.
- “No Results” appears when nothing matches. Enter must not consume or delete the query in that state; normal editor handling may proceed after dismissal.
- Applying a command removes only the triggering slash and query. Existing text, marks where compatible, inline nodes, frontmatter, neighboring blocks, and the remainder after the caret survive.
- A command is one undoable transaction, separate from surrounding typing. Undo restores the pre-command block and `/query`; redo reapplies the conversion/insertion. This is a deliberate improvement over relying on Crepe's default typing/history grouping.

### Command Semantics

| Commands | Proposed Behavior |
| --- | --- |
| Text; Heading 1–6; Quote; Bulleted List; Numbered List; Task List | Convert/wrap the current eligible block, preserving its content and compatible marks. |
| Code Block | Convert eligible block text to code, intentionally removing rich-text marks as the code schema requires. |
| Divider; Table; Image; Math | On an otherwise empty invocation block, replace it. On a nonempty block, remove only `/query` and insert the new block immediately after that block; never discard existing content or its suffix. |

Retain the currently enabled Crepe command catalog; do not silently drop image, table, math, or list functionality. Use existing image upload/proxy and validation paths. Upload cancellation/failure must not delete surrounding content or mutate a different note. Async completion must revalidate the owning editor and document revision.

“Title row” here means a Markdown heading inside the document. The page title/filename field is not a Markdown block and remains a rename control.

## TockTeam Presentation Contract

- One compact caret-anchored, scrollable list with quiet section headings: **Basic Blocks**, **Lists**, **Advanced**. No category tabs or modal dialog. No speculative recents, AI suggestions, or Notion-only database actions.
- Reuse public `@tockteam/ui/command` components for the list, groups, items, empty state, and hints where their controlled listbox model supports editor-owned focus. Use a controlled selection and a ProseMirror keyboard bridge—not synthetic keyboard events or a hidden focused search field.
- Reuse `@tockteam/ui/button` for add/drag controls with visible focus and accessible names. Lucide icons use `currentColor` and the existing compact control scale.
- Reuse the shared popover surface recipe: semantic `bg-popover`, `text-popover-foreground`, muted text, borders, radii, shadow, and selected/hover roles. Milkdown's `SlashProvider` owns caret geometry; do not layer a second floating-position engine or a modal `CommandDialog` over it.
- Keep feature composition local. If the shared Command primitive cannot support an accessible externally controlled editor listbox through public APIs, stop at the first slice's proof checkpoint and review the smallest adaptation; do not fake accessibility with hidden controls or duplicate the whole component library.
- Standard Title Case for labels and groups; sentence case for hints. Inherit DSH typography. No Notion fonts, hardcoded dark palette, raw brand colors, or system-only `dark:` rules.
- Static styles remain Tailwind classes or a named inherited-DOM utility in `plugins/skins/src/client/tailwind.css`. Inline styles are limited to provider-computed geometry. Do not create feature CSS files.
- Portal/overlay colors derive directly from body-visible DSH tokens, not editor-local aliases that vanish outside the editor. Reuse the owning overlay layer; avoid arbitrary escalating z-index values.
- Preserve editor focus, expose a named listbox and selected option, and associate suggestions with the active editor using compatible accessibility semantics. Validate screen-reader announcements rather than assuming cmdk's input-centric defaults cover an external contenteditable.
- Constrain width/height to the available pane/viewport, flip above the caret when needed, and avoid clipping under the titlebar or pane boundaries. Keep the selected item visible while navigating.
- Opening/filtering is immediate, without row stagger or layout animation. Honor reduced motion. Verify built-in light/dark, Deep Current, Jade Circuit, Porcelain, and Ember Dusk, including app/system appearance mismatches.

## Implementation Ownership

Likely workbench files are relative to `plugins/tocktutor/packages/tockteam-tocktutor-workbench/`:

| Owner | Responsibility |
| --- | --- |
| `src/live-preview-editor-runtime.tsx` | Enable the local integration, compose it with existing search/content/heading plugins, and own mounting/disposal. |
| Proposed `src/live-preview-slash-menu.tsx` | Editor-local invocation state, query range, command eligibility/actions, and shared-control presentation. Split pure transaction helpers only if tests or size warrant it. |
| Proposed `src/live-preview-block-handle.tsx` | Thin add/drag view using public `BlockProvider`/`block`; the plus action opens the same menu at the newly inserted paragraph. No new drag engine. |
| `tests/editor-adapters.test.tsx` and a focused menu component test if needed | Actual editor transactions, preservation, history, keyboard precedence, and mount/unmount behavior. |
| `scripts/build-client.mjs`, package manifest, generated build manifest | Declare direct Milkdown provider imports at the matching exact version; preserve React/ReactDOM externals and singleton identity. Regenerate outputs; never edit them manually. |
| `plugins/skins/src/client/tailwind.css` | Only the small inherited-DOM/positioned-surface styling seam that cannot live on shared markup. |
| Proposed `scripts/tocktutor-slash-menu-checks.js` | Bounded Playwright checks attached to an already guarded, owned Desktop endpoint. No embedded GUI launcher. |

Use public `@milkdown/plugin-slash` and `@milkdown/plugin-block` exports (declare direct dependencies if imported), rather than importing private Crepe files, rebuilding its private context by name, inspecting generated bundle strings, or editing `node_modules`.

Disable Crepe's BlockEdit only when the replacement slash and handle integration are installed together. Retain all other Crepe features. Reuse native block dragging and its node eligibility checks, including restrictions around tables, blockquotes, and special nodes. The existing plus action still inserts a paragraph after the active block and opens the command list; the drag handle still moves that block. Both require real-app regression proof before accepting the replacement.

Each editor instance owns one active invocation. Track its range through native transaction mappings and invalidate it on selection departure, incompatible edits, source replacement, pane/tab changes, or disposal. React state is only a projection of that invocation, not a second document model. Do not store a whole-note Markdown snapshot for applying commands.

Delete `/query` and execute the transformation through one composed ProseMirror transaction. Reuse schema/transform commands, but do not call `clearTextInCurrentBlockCommand`. Commands that normally dispatch separately must be adapted to the same transaction. If the operation is inapplicable, rejected by the note-size guard, or stale, leave the document unchanged—including the query. Retain existing `onMarkdownChange`, dirty state, conflict protection, and save authority.

The menu key handler must run before the existing heading Enter-to-paragraph shortcut while the menu is open. It must not install a global capture listener that intercepts another pane's keys. Provider timers/listeners, React roots/portals, transient attributes, and DOM nodes must all be released on editor destruction and early unmount.

## Delivery Slices and Acceptance Gates

The user approved implementation. All three slices were delivered with editor tests and guarded Desktop interaction checks; these are not separate horizontal UI/backend projects.

### 1. Convert Existing Text — `tockteam-ptmd.1`

Deliver the full path for Text, Heading 1, and Heading 2, including the supported provider composition and add/drag bridge.

Acceptance:
- `健康/h2` and `Before /h2 after` open/filter/convert without losing content; one undo restores the exact pre-command state and redo reapplies it.
- Keyboard/pointer selection, Escape, outside dismissal, and editor focus work with a TockTeam-styled list and accessible selected result.
- Exactly one menu responds. Plus and drag still work, existing heading shortcuts work when the menu is closed, and editor teardown leaves no menu or handler behind.

Verification: first add failing editor-adapter checks, then run the focused command below and a guarded Desktop proof of all three paths. Stop for review if public shared-control/provider APIs cannot meet the focus or block-handle contract.

### 2. Preserve the Full Command Catalog — `tockteam-ptmd.2`

Depends on slice 1. Extend the same path to the remaining existing commands, not a second registry.

Acceptance:
- H3–H6, Quote, lists, Code Block, Divider, Table, Image, and Math obey the conversion/insertion table and context eligibility.
- Existing text/inline content survives command selection; image cancellation/failure is recoverable; save/reopen preserves expected Markdown bytes.
- Aliases filter deterministically; empty results are explicit; invalid/stale actions and note-size refusal never remove text.

Verification: command-level adapter cases plus the real route's save/reopen flow; run the whole workbench suite. Exact intended vault bytes and disappearance of the active-tab Unsaved marker are required, not just a transient “saved” message.

### 3. Edit Safely Across Panes and Themes — `tockteam-ptmd.3`

Depends on slice 2. Complete and verify difficult interaction paths on the same menu.

Acceptance:
- Chinese IME, marks/inline nodes, middle-of-block suffixes, split-pane selection, peer source replacement, read-only states, and repeated mount/unmount preserve the correct document and focus.
- All six appearances, system/app theme mismatches, narrow panes, long labels, scrolling, viewport edges, keyboard access, and reduced motion meet TockTeam's geometry/contrast/accessibility rules.
- Guarded Desktop evidence shows the real route, source preservation, save/reopen, undo/redo, add/drag, no runtime errors, exact screenshot geometry, and complete process cleanup; required build/test gates pass or disclose external blockers without weakening assertions.

## Verification Commands

Use the repository-pinned pnpm through `node node_modules/pnpm/bin/pnpm.cjs` in this environment; the global pnpm is a different version. The commands below abbreviate that as `pnpm` only for readability.

```sh
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx --environment jsdom
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench test
node --test tests/icons.test.ts tests/skins.test.ts tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts
pnpm run typecheck:tocktutor
pnpm run test:tocktutor
pnpm run build:tocktutor
node scripts/tocktutor-build-manifest.mjs --check
pnpm run typecheck
pnpm test
pnpm run build
```

Rendered proof must use `extended_display.launch` on a non-main display, then app-scoped Playwright/CDP. No raw Electron spawn, user profile, standalone browser, or installed smoke for this editor-only change. Preserve HOME and use the mock keychain. Use 1512 × 949 CSS pixels at DPR 2; validate 3024 × 1898 PNG dimensions. Record route/content/mode, explicit appearance and skin state, keyboard/focus behavior, and runtime errors. Canonical dark captures require no active skin. Publish only allowlisted screenshots after assertions pass. Stop the full owned process tree in `finally` and verify no descendants remain.

## Alternatives and Non-Goals

- An upstream Crepe change exposing trigger/query handling could preserve its existing Vue menu, and `buildMenu` already handles custom actions. It would still require presentation work for the requested TockTeam list. Do not block this local feature on an unaccepted upstream change.
- Do not monkey-patch Crepe, edit installed dependencies, hide a live competing menu with CSS, replace Milkdown, or add another UI/positioning/command library.
- No full Notion clone, new block types, AI suggestions, slash commands in the filename field, Source-mode redesign, or Host/IPC/profile changes.
- No new global typography, color system, theme loader, or shared editor framework. Keep current package IDs, note format, saves, and history boundaries.

## Upgrade Completed Before This Plan

Commit `cfa88423` pins all ten direct Milkdown dependencies to **7.22.2**, updates the nested lock closure, and regenerates the browser bundle/source map and build manifest. The root lockfile did not require a change. No slash-menu implementation was included.

Verification:
- Existing editor-adapter baseline and upgraded run: **81/81 passed**; dependency-only change, so no artificial failing implementation test was added.
- Entire workbench: **359 node tests + 621 component tests passed**.
- Nested and root typechecks, nested/root builds, build-manifest check, and focused manifest tests: passed.
- Root suite from a session with the updated guarded-system integration: **1,450 passed, 17 existing skips, zero failures**. This session's older guard initially blocked five unrelated process/sandbox checks; the independently rerun full suite passed without test exclusions.
- Full nested `test:tocktutor` stopped in `tockbot-note-runtime` at its existing Host-death test's direct `/bin/ps` call (`spawn EPERM`): **209/210 runtime tests passed**. Do not describe the full nested suite as green. The known-owner cleanup ran; a subsequent approved process snapshot verified zero processes referencing its retained fixture root. The fixture directory was left intact, and the test/guard were not weakened.
- Guarded Desktop: 36 heading conversions across first/later/wrapped headings and built-in light/dark passed with zero runtime errors; canonical screenshot geometry/theme validated. Empty-row slash opening, Heading 2 conversion and undo passed; after-text slash remains unsupported, as expected before this plan.
- All three owned Electron runs were explicitly stopped; each reported no remaining descendants.

Detailed transient logs/proofs: `/tmp/tocktutor-milkdown-7222/`. Upgrade/planning task: `tockteam-muuv`.
