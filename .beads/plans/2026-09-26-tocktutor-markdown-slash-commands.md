# Plan: Markdown-Native Slash Commands

**Status:** Proposed; planning only. Implementation requires approval. This plan supersedes the broader feature discussion, not the completed slash-menu implementation.

**Tracking:** Epic `tockteam-e5sd`; four deferred implementation slices listed below. Beads owns execution status.

## Problem and Direction

The slash menu makes existing Markdown commands discoverable but lacks convenient ways to insert links, create linked notes, and attach files. The user explicitly requires that new entries use features supported by Markdown files, rather than reproduce Notion blocks through custom syntax.

**Design Read:** A keyboard-first Markdown writing tool with Obsidian-style file ownership. Reuse the current compact slash menu and TockTeam controls; improve discoverability without changing the note format or copying Notion's document model.

Every new inserted object must serialize to an ordinary Markdown link. Notes remain independent `.md` files; attachment bytes remain separate files. No new Milkdown document node types, HTML wrappers, metadata sidecars, custom fenced blocks, or document migrations are needed.

## Scope and Saved Representation

| Menu Entry | User Experience | Saved Result |
| --- | --- | --- |
| Link | Enter a website URL and optional display text; insert at the invocation. | `[Example](https://example.com)` |
| Link to Note | Search existing Markdown notes in the current vault; choose an exact path. | `[My Note](../Notes/My%20Note.md)` |
| New Note | Confirm a name and existing destination folder; create a normal Markdown file and insert its link. | A separate `.md` file plus `[New Note](New%20Note.md)` in the source. |
| File Attachment | Select an existing supported vault attachment or upload a supported file; insert a link, not an embed. | `[Document](../Attachments/document.pdf)` |
| Media (Group) | Group existing Image and Code Block with File Attachment. | Organization only; no document syntax. |

The relative-path examples assume an appropriate source folder. Generate actual destinations relative to the originating note, not the vault root, browser route, or process directory. Ordinary Markdown links—not `[[wikilinks]]`—are the output of these new commands.

### Explicit Exclusions

- No Toggle List or Toggle Heading entries, editable toggle containers, `<details>` blocks, or folding work in this plan.
- No Callout entry: callout markers are an Obsidian extension, not ordinary Markdown.
- No dedicated Audio or Video player entries. Supported audio/video files may be linked through File Attachment without embedding a player.
- No rich Web Bookmark entry or metadata fetching. A website uses Link.
- No Notion Page block, parent–child page relationship, sidebar nesting, or sidebar plus button. New Note is file creation followed by link insertion.
- No arbitrary file-type support, attachment streaming project, new filesystem/IPC authority, or automatic external-app launch.
- No editor replacement, Source-mode slash UI, new extension framework, third-party UI port, or dependency upgrade.
- Existing callouts, media embeds, wikilinks, Math, GFM tables/task lists, and other shipped capabilities remain intact. This is a rule for the new additions, not a removal or migration of existing content/features.

## Existing Owners and Constraints

Paths below are relative to `plugins/tocktutor/packages/tockteam-tocktutor-workbench/` unless stated otherwise.

| Owner | Reuse / Required Change |
| --- | --- |
| `src/live-preview-slash-menu.tsx` | Existing 16-entry catalog, eligibility, atomic transactions, keyboard selection and shell-chrome popup. Add four commands and form dispatch; no second registry. |
| `src/live-preview-editor-runtime.tsx`, `src/live-preview-editor.tsx` | Per-editor lifecycle, native selection/history, serialization and narrow callbacks to the route. |
| `src/editor-commands.ts` | Existing link editing behavior. Reuse link semantics without its placeholder `Target.md` or a whole-note replacement shortcut. |
| `src/route.tsx` | Vault/note identity, document creation, attachment storage, navigation, dirty/save state. `extractActiveSelection()` already demonstrates retaining a created file when its source becomes stale. |
| `src/attachments.ts` | Validated destinations, supported suffixes and collision naming. `appendAttachmentMarkdown()` is not the insertion path: these commands insert at the saved editor range. |
| `src/host-read.ts`, `src/types.ts` | Existing `createDocument` / `storeAttachment` contracts. Preserve active-vault validation and current bounds. |
| `src/markdown.ts`, `src/rich-markdown.ts` and existing route link handling | Relative links and safe rendering/navigation in Reading and Live Preview. Confirm end-to-end resolution rather than assuming a valid serialized string proves navigation. |
| `@tockteam/ui/command`, `/dialog`, `/button`, `/input`, `/field` | Reuse shared controls for menu and secondary input; no custom form library. |
| `tests/live-preview-slash-menu.test.tsx`, `tests/editor-adapters.test.tsx` | Real editor transactions, focus, history, source replacement and serialization tests. |
| `tests/route.test.ts`, `tests/attachments.test.ts`, `tests/host-read-transport.test.ts` | Creation/storage orchestration and Host-boundary checks. |
| Root `scripts/tocktutor-slash-menu-checks.js` | Extend existing checks attached to an owned guarded Desktop; do not add a raw Electron launcher. |

The current `entries()` probes commands by constructing a transaction. Form-opening commands must use a pure eligibility check; probing must never open a form or perform an I/O operation. Keep this a small explicit distinction between direct editor actions and the four form actions.

Current `uploadImage()` accepts only images. File Attachment must reuse bounded storage below that method, not weaken image validation or pretend all files are images. The current storage path supports media/PDF suffixes and a 25 MiB payload ceiling; this plan retains both.

## Common Interaction and Safety Contract

### Invocation and Forms

1. Keep the existing slash trigger, filtering, listbox semantics and keyboard-scrolling behavior. Add deterministic aliases (`url`, `link`, `note`, `page`, `new note`, `file`, `attachment`) without misleading visible entries such as Web Bookmark or Toggle List.
2. Selecting a form command closes the suggestion list and opens a shared, labeled dialog. Focus may then enter its real fields; no hidden focus proxy. Preserve `/query` until successful final insertion.
3. Capture the originating editor instance, document identity, vault generation, slash range and document revision. A selection-only blur to the dialog must not invalidate the pending action. Do not keep a second full-note document snapshot.
4. Conservatively cancel pending insertion on any document-content edit, source replacement, note/pane navigation, vault switch, read-only transition or editor destruction. Do not try to relocate an old range into changed content.
5. Successful confirmation constructs one native transaction that removes only `/query` and inserts the link. Preserve the prefix, suffix, neighboring blocks and compatible marks. Apply the existing document-size guard before dispatch.
6. One undo restores the prior editor content including `/query`; redo reinserts the link. Editing history must not undo filesystem writes.
7. Escape, Cancel and outside dismissal do not edit the note. Restore focus to the originating editor only if it is still the current valid owner. Do not steal focus from another tab/pane.
8. Invalid input and recoverable failures keep form drafts, explain the problem, and allow retry. Disable duplicate submission while a write is pending. Cancel aborts pending work where supported and always invalidates later insertion.

### Links and Paths

- Use the existing Markdown serializer/link mark rather than hand-concatenating unescaped user input. If a small shared relative-destination helper is missing, add it only when Link to Note first needs it; File Attachment reuses it.
- Web Link accepts explicit HTTP(S) URLs, with existing safe-navigation validation. Reject dangerous schemes, embedded credentials, control characters and malformed/oversized input. No DNS lookup, preview download or network fetch on insertion. Opening links retains the existing navigation policy.
- Encode path segments correctly, including spaces, Unicode, parentheses, brackets, percent signs, `#` and `?`. A literal filename character must not become a URL fragment/query or be decoded twice.
- A serialized relative link may legitimately contain `../`; resolve it against the source note and then enforce vault containment. Never pass a source-relative link directly as an authoritative Host filesystem path.
- Duplicate note names show their folder paths. The picker returns an exact vault-relative target, not a basename guess. Revalidate the chosen target before insertion; deleted targets produce a recoverable error.
- New link rendering/opening must not introduce untrusted HTML, native paths, automatic downloads or external execution.

### Filesystem Side Effects

- **New Note:** default to the source note's folder, allow an existing destination folder, and show the final `.md` path before Create. Create an empty Markdown file using existing no-overwrite behavior. Stay in the source note after inserting the link; the user may follow it to open the new note.
- **File Attachment:** offer existing attachments or a file input for upload. Reuse the configured attachment folder and collision-safe naming. Initial accepted suffixes remain `avif`, `bmp`, `gif`, `ico`, `jpg`, `jpeg`, `png`, `webp`, `mp3`, `m4a`, `ogg`, `wav`, `weba`, `webm`, `mp4`, `mov`, `pdf`, subject to existing Host content/type checks. Show supported types and the 25 MiB limit; do not advertise all file types. DOCX, ZIP, arbitrary binaries and larger uploads require a separately reviewed expansion.
- Never overwrite an existing note/attachment. Existing Host validation remains authoritative even if the browser filters the input.
- Confirm identity immediately before sending a mutation and again after completion. If creation/storage succeeds but insertion is cancelled or refused, retain the created file and report its path; never delete it as an automatic rollback or mutate a different note.
- Retain a successful result while the owning form remains valid so retry only retries insertion, not the write. On an ambiguous transport outcome, report uncertainty and refresh/reconcile the expected destination before offering another write; do not silently create a second suffixed file.
- Undo removes the source link only. Include helper text explaining that newly created notes/attachments remain in the vault. Their removal uses existing deliberate file actions, outside editor undo.

## Menu and Appearance

- **Basic Blocks:** retain existing text/headings/quote/divider; append Link, Link to Note and New Note.
- **Lists:** unchanged.
- **Media:** Image, Code Block, File Attachment. Preserve existing command IDs and aliases for Image and Code Block.
- **Advanced:** retain Table and Math.
- Retain the exact shell-chrome popup fill and transparent inner Command surface. Preserve selected-row and reverse-group-heading scrolling.
- Use Title Case labels, sentence-case hints, Lucide icons and DSH semantic colors. No new skin values or global styling changes are expected.
- Dialogs must remain legible and bounded in all six appearances and narrow panes. Verify labels, focus restoration, Escape/outside behavior, disabled/loading/error states and reduced motion.

## Delivery Slices

### 1. Insert a Web Link — `tockteam-e5sd.1`

**Depends on:** implementation approval only.

Deliver Link end to end, introducing the small pending-form lifecycle only as needed by this feature. Likely owners: slash menu, editor runtime/props and shared form composition; focused tests live with the existing editor tests.

**Acceptance:**
- A confirmed safe URL and label insert an ordinary Markdown link at the captured invocation, including mid-paragraph and heading cases; surrounding content survives and one-step undo/redo works.
- Invalid URLs, cancel, stale edits, read-only/source replacement and size refusal preserve the note; insertion performs no fetch and focus returns correctly.
- Source/Live Preview/Reading and save/reopen preserve the intended link target/text. Existing slash commands and block handles remain functional.

**Verification:** V1 and V2 below, plus guarded Desktop typing → form → insertion → undo/redo → save/reopen. Test unsafe schemes, punctuation and split-pane invalidation before implementing.

### 2. Link to an Existing Note — `tockteam-e5sd.2`

**Depends on:** slice 1.

Add the current-vault Markdown-note picker and source-relative link generation through slice 1's pending action. Consume existing listing/navigation APIs rather than building another search index. The shared insertion result is a validated target plus display text, not a whole document string.

**Acceptance:**
- Same-folder, cross-folder, Unicode and duplicate-basename selections produce links to the exact chosen note, with no internal route URLs or absolute paths in saved Markdown.
- The link opens the expected note in Live Preview and Reading after reload; labels and escaped paths survive mode switching and undo/redo.
- Missing targets and changed source/vault/pane refuse insertion; long lists use the existing bounded list strategy and keyboard selection remains visible.

**Verification:** V1, V2 and V3; guarded cross-folder save/reopen/navigation proof, including filenames containing spaces, `#` and `%` and a target deleted while the picker is open.

### 3. Create a Linked Note — `tockteam-e5sd.3`

**Depends on:** slice 2.

Add New Note via existing `createDocument`, consuming slice 2's relative-link output and slice 1's guarded insertion. Do not reuse a create-and-immediately-select flow that would destroy the source invocation.

**Acceptance:**
- Explicit Create produces exactly one empty `.md` file at the confirmed destination, inserts its link, refreshes the tree and leaves the source note active. No hierarchy metadata or sidebar control is added.
- Name collision, invalid path, permission failure and cancellation before submission do not change source or overwrite files. Disable duplicate submission.
- If a file was created before source invalidation/cancellation, retain/report it without inserting elsewhere. Known successful creation is not repeated on retry; undo removes the link but leaves the file.

**Verification:** V1 and V3; deterministic delayed Host responses for stale completion and double-submit tests. Guarded Desktop proof verifies both files' actual bytes and source Unsaved-marker clearance after save.

### 4. Attach a File and Organize Media — `tockteam-e5sd.4`

**Depends on:** slice 3. Reuse slices 1–2 for pending actions and relative links, and slice 3's successful-write/stale-insertion handling. Keep shared route/editor changes sequential.

Add the attachment chooser/uploader with the current accepted types and bounds. Insert at the saved range rather than appending to the note. Regroup Image and Code Block with File Attachment only when this path is functional.

**Acceptance:**
- Existing/uploaded supported attachments insert ordinary relative links. Upload collision handling is safe; paths remain within the selected vault and saved references survive reopen. Audio/video selections remain links, not player blocks.
- Unsupported/oversized files, failure, cancel and stale completion have explicit safe outcomes. A stored attachment is not silently removed or uploaded again after insertion failure; editor undo removes only its link.
- All original 16 commands remain available in valid contexts; new commands total four. Media grouping, aliases, Image/Code behavior, shell fill and keyboard scrolling pass regressions across six appearances.

**Verification:** V1, V2 and V3, then final gates. Use Playwright `setInputFiles` against an owned app to test uploads without opening an OS picker. Verify stored bytes, a rejected file, duplicate filename, stale completion and link navigation without launching the user's external apps.

## Verification Commands and Evidence

Use Node 24 and the repository-pinned pnpm. In this checkout the explicit launcher is `node node_modules/.pnpm/pnpm@11.21.0/node_modules/pnpm/bin/pnpm.mjs`; `pnpm` below denotes that pinned launcher, not a different global version. Check lockfile status before and after package commands: prior invocations auto-installed and normalized the root lock. Do not mix unintended install drift into this work or revert another session's edits.

```sh
# V1: Editor transaction and component checks
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/live-preview-slash-menu.test.tsx tests/editor-adapters.test.tsx --environment jsdom

# V2: Serialization and relative-path checks
node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/editor-commands.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/markdown.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/rich-markdown.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/session.test.ts

# V3: Route orchestration and existing attachment boundary checks
node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/route.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/attachments.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/host-read-transport.test.ts

# Integration and generated-output gates
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench test
node --test tests/icons.test.ts tests/skins.test.ts tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts
pnpm run typecheck:tocktutor
pnpm run test:tocktutor
pnpm run build:tocktutor
node scripts/tocktutor-build-manifest.mjs --check
pnpm run typecheck
pnpm test
pnpm run build
node scripts/stage-dsh.mjs --quick
```

Run each new regression failing first, implement the narrow behavior, then rerun it. Where tests import built output, build the affected owner first so red/green tests exercise current source. Follow the TDD, design, shadcn, React Doctor and playwright-cli skills during implementation. Do not claim the broad suite is green if an environment guard blocks it; record exact failures without weakening assertions.

Each slice includes a focused real-Desktop proof; the final combined flow covers all four commands with real save/reopen and actual vault bytes. Reuse `scripts/tocktutor-slash-menu-checks.js` on a guarded owned endpoint. The final proof additionally covers built-in light/dark and all four skins, opposite app/system appearance, reduced motion, long labels, narrow panes, errors, focus and scrolling. No screenshot is a substitute for checking the saved Markdown and attachment bytes.

Launch only through `extended_display` on a non-main display, attach app-scoped Playwright/CDP, preserve HOME and isolated profile/mock keychain, and stop the full owned tree in `finally`. Verify no descendants remain. Use 1512 × 949 CSS pixels at DPR 2 and verify 3024 × 1898 PNG dimensions. Canonical dark uses `activeId: null`, explicit dark color scheme and no skin on HTML/body. Record route/mode/content/runtime errors and publish only allowlisted evidence under `.beads/reports/`. Do not run raw Electron launchers or unrelated installed-app smokes for these editor-only changes.

## Risks and Boundaries

| Risk | Mitigation |
| --- | --- |
| The existing blur handler clears slash state when a dialog opens. | Give the actual form a bounded editor-local pending action, separate from the visible suggestion list; selection-only blur is permitted but content changes invalidate it. |
| A correct-looking Markdown link resolves from the wrong folder. | Test actual route navigation from nested source folders, canonical target identity and round-trip escaping. |
| File creation succeeds after the source changes or the user cancels. | Revalidate before/after I/O, preserve/report successful writes, reject stale insertion, reconcile uncertain outcomes before retry. |
| File Attachment suggests broader support than the existing safe storage path. | Explicit supported-type/size hints; no broadened Host allowlist or image-only callback reuse. |
| Adding form commands breaks eligibility probing, focus, history or menu scrolling. | Pure eligibility predicates; real-editor regression checks plus guarded interactions. |
| Concurrent sidebar work owns route/build outputs. | Re-list sessions and coordinate ownership before editing; serialize shared-file implementation and generated builds. |

No WebObsidian or Pennivo code is needed for this reduced scope. Their MIT licensing allows reviewed reuse with notices, but existing TockTutor owners cover the required operations. Avoid copying their editor/global state or application authority.

## Beads and Completion

- Epic: `tockteam-e5sd` — Markdown-native TockTutor slash commands.
- `tockteam-e5sd.1` — Link and pending-form insertion.
- `tockteam-e5sd.2` — Link to Note; depends on `.1`.
- `tockteam-e5sd.3` — New Note; depends on `.2`.
- `tockteam-e5sd.4` — File Attachment and Media; depends on `.3`, preserving sequential ownership of the shared files.

All implementation issues are deferred pending approval. Do not reopen the completed original slash-menu epic. Completion requires the four behaviors, unchanged existing content support, focused and integration evidence, rebuilt tracked outputs/manifest, committed small slices and full verification-process cleanup. This plan does not authorize pushing or updating the installed application.
