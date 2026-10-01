# TockTutor Properties Functional-Parity Plan

## Decisions and Assumptions

- Tracking: Properties functional parity epic `tockteam-dk4m`; the separate approved removal is underway under `tockteam-l0yc` and is not a replacement-menu task in this plan.
- Match Properties only to the pinned webobsidian revision `c41967a93317b2a0f08511c349ef3dbaf78fc882`; this is not a request to copy its unsafe YAML rewriting.
- The separate approved change removes the extra Unlink/Pin/Close row. Keep the titlebar Toggle Right Sidebar, note save/retry, resizing, and Properties/Assistant drafts. Do not add a replacement menu.
- Other linked panes' behavior is out of scope. TockTutor remains Desktop-only; existing package, profile, and data IDs stay compatible.
- Keep the current safe, range-preserving property writer and note-save path. Preserve comments, nesting, body text, line endings, unknown settings, and existing safeguards.
- Use the shared public `@tockteam/ui` controls and semantic Tailwind styles. Reuse installed `yaml` only if a safe supported parse needs it. Add no editor, index, plugin loop, theme, stylesheet, or dependency.
- Names such as `custom key`, `note.rating`, and `123field` must be supported, while injection, invalid control characters, and collisions remain rejected.
- Tag and `cssclasses` cleanup is special-purpose; do not normalize ordinary lists or aliases. Unsupported structured YAML, zoned/second-resolution date-times, and lossy list/scalar changes must remain safely recoverable, with Source Mode available where needed.
- Implementation was explicitly requested on 2026-10-01. The user then chose **Yes, Remember Type Choices**, approving `.obsidian/types.json` updates for the active vault. Issue `.6` records the scope: preserve unrelated settings, exact revision/no-follow checks, safe creation and explicit conflict/failure recovery. This does not permit arbitrary settings writes.

## Problem and User-Facing Goal

TockTutor already edits common frontmatter values, but it does not yet offer several Properties actions available in the pinned reference: compatible property names, row rename/remove/copy, direct chip edits with reference tag cleanup, suggestions, and the complete type-choice workflow. The in-note Live Preview also needs the same supported editing actions as the sidebar.

A user should be able to manage supported properties in either editing surface, see suggestions drawn from the current vault, save and reopen without losing authored content, and get a clear recovery path for rejected or risky changes. Matching the reference does not justify silently losing YAML structure or writing vault configuration without approval.

## Source and Authorization

This plan follows `.beads/reports/2026-10-01-tocktutor-properties-webobsidian-parity.md`. The reference is `/Users/taowang/research/tutor/webobsidian`; its tracked revision and source fingerprints are recorded in the adjacent parity report JSON. The original audit was source/pure-helper based, not a fresh two-app browser certification. The user has now authorized implementation and separately approved the type-settings write gate. The epic and implementation slices stay open until their behavior and real-app evidence are verified.

The planned `tests/properties-ui.test.tsx` now exists. Source checkpoint `bfc6f757` delivered row actions and editable chips. The follow-up implementation adds bounded name/tag suggestions, the approved fixed-path registry Host/runtime seam, and previewed six-type conversions with the existing recovery snapshots. Current verification: 428/428 workbench Node checks, 778/778 workbench component checks, focused registry/race/failure checks, nested typecheck/build, and build-manifest check pass. The registry preserves unknown settings, including exact numeric literals. User-approved minimal checks in the protected linked-pane test remain unstaged beside user edits. Root gates and fresh two-app Desktop proof remain pending; no complete parity certification is claimed.

## Scope and Ownership

- Compare only Properties behavior in the pinned local reference. Preserve TockTutor's current product identity and document ownership.
- `properties.ts` owns safe property parsing, validation, range-preserving writes, and existing rename support. Extend it rather than introducing a competing serializer.
- `MarkdownDocumentHeader` and `PropertyListEditor` are the shared controls. Reuse them for the sidebar and Live Preview instead of duplicating behavior.
- `WorkbenchRouteController` owns `setProperty`, `bindLinkedProperty`, and `saveLinkedView`; callbacks must keep the exact document, vault, and linked-view lifetime they were created for.
- Suggestions come from existing generation-bound `VaultFacetsResult.properties` and `.tags`, plus imported type data. Do not scan the vault on each keystroke or add another index.
- Existing Host/runtime interfaces expose passive list and exact-revision/no-follow reads, not registry writes. Any future write must be proposed through the owning trusted Host/Remote/Cordis/runtime path and generated contracts.
- Do not edit `AGENTS.md`, `tests/right-panel-layout.test.ts`, or `plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/route-linked-panes.test.tsx` without explicit permission. Coordinate changes to legacy expectations with their owner; do not weaken or copy those tests.

## Vertical Slices

Each slice below delivers one user-visible behavior. Issue IDs and dependencies are the approved plan registry; do not merge the registry decision, basic persistence, and conversions into one task.

### 1. Accept ordinary property names — `tockteam-dk4m.1`

**Dependencies:** none.

**Behavior:** Existing authored keys including `custom key`, `note.rating`, and `123field` appear in Properties and survive supported edits, save, and reopen. Duplicate keys, control characters, injection-shaped input, and unsupported complex structures fail safely. Preserve comments, nested siblings, body, exact line endings, and duplicate/input limits; never replace the range-aware writer with whole-block YAML serialization.

**Owner seam:** Extend `properties.ts` validation and parsing; route every edit through the existing guarded document record and save path.

**Acceptance:** Paired parser/writer tests cover all three names. Exact-byte fixtures prove only the intended property range changes. Unsafe and unsupported cases keep authored bytes intact and provide the existing Source Mode/failure route.

**First checks:** `cd plugins/tocktutor/packages/tockteam-tocktutor-workbench && node --test tests/properties.test.ts`; then `cd plugins/tocktutor/packages/tockteam-tocktutor-workbench && ./node_modules/.bin/vitest run tests/editor-adapters.test.tsx --environment jsdom -t 'propert|frontmatter'`.

### 2. Rename, remove, or copy from a property row — `tockteam-dk4m.2`

**Dependencies:** `tockteam-dk4m.1`.

**Behavior:** A row can rename its key, copy its value, or remove the whole property. These actions affect only the represented note and property. Removal is recoverable; if the owner has no meaningful Undo path, use the shared in-app confirmation. Clipboard refusal and stale/closed note lifetimes are visible and do not report false success.

**Owner seam:** Wire existing `renameFrontmatterProperty` and add minimal range-aware deletion in `properties.ts`; expose actions through public shared controls and the existing browser clipboard seam. Keep callbacks bound through `WorkbenchRouteController`.

**Acceptance:** UI tests cover rename collision, remove confirmation/recovery, copy success/refusal, read-only/unsupported values, stale lifetime, exact bytes, and preservation of unrelated drafts.

**Checks:** Run `node --test tests/properties.test.ts` and `./node_modules/.bin/vitest run tests/properties-ui.test.tsx --environment jsdom` from `plugins/tocktutor/packages/tockteam-tocktutor-workbench`. Add UI coverage using the existing Vitest runner, not a new test system.

### 3. Edit list chips in place — `tockteam-dk4m.3`

**Dependencies:** `tockteam-dk4m.1`.

**Behavior:** A user can edit an existing list item directly, as well as add and remove it. Normalize `#new tag` to `new-tag` only for `tags` and `cssclasses`; preserve ordinary list text and aliases exactly. Rejection, navigation, or mode changes must not silently discard an unfinished chip edit.

**Owner seam:** Extend the existing `PropertyListEditor` and shared property helpers; do not coerce structured or mixed YAML into strings.

**Acceptance:** Tests cover edited/add/remove chips, empty and null values, save/reopen, tag cleanup, unchanged ordinary lists/aliases, and rejected edits retaining recoverable input.

**Checks:** Run `node --test tests/properties.test.ts` and `./node_modules/.bin/vitest run tests/properties-ui.test.tsx --environment jsdom` from the workbench package directory.

### 4. Suggest names and tags from the current vault — `tockteam-dk4m.4`

**Dependencies:** `tockteam-dk4m.1`, `tockteam-dk4m.3`.

**Behavior:** While adding a property or tag, offer unused names or existing tag values from the current vault. Selecting a suggestion works by keyboard or pointer. Dismissing it leaves typed text alone. Empty, incomplete, failed, retry, and stale-vault states are explicit; a late response for an old vault cannot populate the current note.

**Owner seam:** Filter generation-bound `VaultFacetsResult.properties` and `.tags` locally, excluding current-note property names and already-used tags. Reuse shared accessible input/listbox/menu controls; do not add a per-keystroke scan or separate suggestion service.

**Acceptance:** UI tests verify arrow/Enter and pointer choice, dismissal, exclusions, typed input, incomplete/empty/error/retry behavior, and generation changes.

**Checks:** Run `./node_modules/.bin/vitest run tests/properties-ui.test.tsx --environment jsdom` and `./node_modules/.bin/vitest run tests/editor-adapters.test.tsx --environment jsdom -t 'propert|frontmatter'` from the workbench package directory.

### 5. Share supported controls with Live Preview — `tockteam-dk4m.5`

**Dependencies:** `tockteam-dk4m.2`, `tockteam-dk4m.3`, `tockteam-dk4m.4`.

**Behavior:** In Live Preview, the user can use the same supported property actions and keyboard flow as in the sidebar. Keep the Properties/Assistant toggle and existing drafts. Do not grant new editing authority in Reading mode. Clarify Enter, blur, list commit, rename, cancel, and dismiss behavior; show failures rather than hiding them.

**Owner seam:** Reuse `MarkdownDocumentHeader`, `PropertyListEditor`, and document-bound callbacks. Keep exact note/vault/lifetime ownership through `WorkbenchRouteController`; do not copy reference handlers or discard body/history/recovery state.

**Acceptance:** Inline and sidebar behavior matches for supported actions and keyboard/focus behavior. Tests prove save/reopen, switching or closing with drafts, errors, and that stale callbacks cannot mutate another note. Reading-mode restrictions remain unchanged.

**Checks:** Run the workbench `properties-ui.test.tsx` and focused `editor-adapters.test.tsx` commands above, then `pnpm run typecheck:tocktutor` from the repository root. The protected linked-pane test requires owner-coordinated expectation updates; do not treat its legacy Switch assumption as evidence of a product failure or silently change it.

### 6. Decide Whether Registry Writes Are Allowed — `tockteam-dk4m.6`

**Dependencies:** none. This is a human decision gate, not implementation approval.

**Behavior:** Record an explicit user/owner decision on whether TockTutor may write Obsidian property-type settings. Review per-vault/global-key scope, preservation of unrelated settings, exact revision/no-follow constraints, safe creation, stale/refusal/partial-failure behavior, and user-visible recovery. Until approval is recorded, keep the current read-only contract and block `.7` and `.8`.

**Acceptance:** The issue records an explicit decision and precise approved scope, or records that writes are not approved. A request for this plan is not approval. No code, runtime contract, or `.obsidian/types.json` mutation precedes that decision.

**Check:** Review the issue decision and current contract documentation; no test, build, or configuration write is a substitute for approval.

### 7. Persist safe type choices — `tockteam-dk4m.7`

**Dependencies:** `tockteam-dk4m.2`, `tockteam-dk4m.6`.

**Behavior:** Only after explicit approval, offer compatible type choices that need no value conversion and persist them for the current vault. Reopening notes uses that type for the same key. Preserve unknown and unrelated settings, and never silently continue if persistence fails. This first persistence slice handles compatible assignments for all six known types; conversion-required choices remain clearly blocked until Slice 8.

**Owner seam:** Propose writes through the existing trusted Host/Remote/Cordis/runtime ownership, not browser-selected paths. Bind writes to a fixed registry path, expected vault and opaque revision; create missing files safely, preserve unrelated JSON, and reject malformed, unsafe, oversized, stale, or racing files. Update generated contracts through their owning builds, never by hand-editing generated output.

**Acceptance:** Same-key controls refresh consistently and choices persist across notes/reopen. Tests prove stale/refusal/write failure cannot clobber data or yield false success, and the client gains no filesystem authority. No new transaction system is introduced.

**Checks:** Run focused owning Host/runtime tests, `pnpm run typecheck:tocktutor`, `pnpm run test:tocktutor`, and `pnpm run build:tocktutor` from the repository root; finish with `node scripts/tocktutor-build-manifest.mjs --check`.

### 8. Convert all six property types safely — `tockteam-dk4m.8`

**Dependencies:** `tockteam-dk4m.7`, `tockteam-dk4m.5`.

**Behavior:** Support Text, List, Number, Checkbox, Date, and Date & time choices, including safe list/scalar transitions. Before a lossy conversion, show a clear preview and require confirmation; preserve a recoverable old value. Date-times with zones or seconds, structured YAML, and other unsupported values keep an explicit Source Mode fallback rather than losing information.

**Owner seam:** Validate conversion against captured note and registry state. Coordinate the note draft with registry persistence and its failures under the policy reviewed at `.6`; do not invent a new transaction system or continue after a failed registry write.

**Acceptance:** Valid changes save/reopen; empty/null and assignment scope are clear. Cancellation, invalid/lossy input, stale note/vault, and failure of either target preserve data and expose an explicit recovery path. The six types remain distinct; no precision truncation or nested/mixed-value flattening.

**Checks:** Run focused property and UI tests, `pnpm run typecheck:tocktutor`, `pnpm run test:tocktutor`, `pnpm run build:tocktutor`, then `node scripts/tocktutor-build-manifest.mjs --check`.

### 9. Prove parity against the pinned reference — `tockteam-dk4m.9`

**Dependencies:** `tockteam-dk4m.1`, `tockteam-dk4m.2`, `tockteam-dk4m.3`, `tockteam-dk4m.4`, `tockteam-dk4m.5`, and `tockteam-dk4m.8`.

**Behavior:** Drive identical notes and actions in TockTutor and the pinned reference. Record exact note/settings bytes, save/reopen, keyboard/focus behavior, drafts, errors, recovery, and intentional safety differences. Do not claim pixel or keyboard parity without fresh evidence.

**Acceptance:** All five reported gaps and the inline/sidebar workflow are exercised. Focused tests, package type/build checks, and repository gates pass when actually run. The epic stays open if registry approval, implementation, or proof is incomplete. No full-suite success is inferred from narrow checks.

**Checks:** From the workbench package, run `node --test tests/properties.test.ts` and `./node_modules/.bin/vitest run tests/editor-adapters.test.tsx --environment jsdom -t 'propert|frontmatter'`. From the repository root, run `pnpm run typecheck:tocktutor`, `pnpm run test:tocktutor`, `pnpm run build:tocktutor`, `node scripts/tocktutor-build-manifest.mjs --check`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build`.

## Implementation Order and Ownership

Start with `.1`; then `.2` and `.3`; then `.4` and `.5`. Obtain the independent `.6` decision before `.7`; complete `.8` only after both `.7` and `.5`; finish with `.9`. This sequence is preferred because these slices share `properties.ts`, `live-preview-editor.tsx`, and `route.tsx`. Never start concurrent writers on those paths, share builds/display/index reservations, or create worktrees unless the user asks. A bounded read-only verification may be parallelized only after source/fixtures are stable.

Checkpoints: after `.1`, ordinary names round-trip without unrelated changes; after `.5`, every non-registry action works in both editing surfaces; after `.8`, approved type settings and conversions survive restart without data loss; `.9` independently certifies the matching behaviors and records each intentionally safer/accessibility difference. No screenshot update may stand in for a broken acceptance check.

## Risks, Approval Gates, and Evidence

- The registry path and browser filesystem authority remain unchanged until the approved Host/runtime seam exists. No new Cordis bundle/profile is required merely for a method on the existing workbench service; keep package IDs, composition dependencies, exports, generated Remote contracts, and build manifest aligned when the owning implementation is changed.
- Registry writes are blocked until `.6` records an explicit decision. If not approved, document that type assignment remains read-only and leave `.7`/`.8` blocked; do not present partial work as full parity.
- Before `.8`, the owner must review how a saved note draft and failed registry write are coordinated. Stale or partial failure must never be disguised as success.
- Preserve the reference differences that protect data. Exact compatibility is limited to safely supported names and values; lossy conversions need preview, confirmation, and recovery, while unsupported structures retain Source Mode.
- TDD starts with the smallest failing check. Add UI tests with the workbench's existing Vitest runner. A known legacy Switch expectation is not a green-suite claim; protected test updates require their owner.
- Real parity evidence uses an owned `extended_display` Electron launch and app-scoped CDP only. Do not shell-spawn GUI, use a standalone browser, or bypass the extended-display guard. Verify default dark with no skin at 1512×949 CSS pixels, 2× scale (3024×1898 screenshot); label separate theme captures. Record routes, fixture, visible state, and runtime errors.
- Compare exact saved note and settings bytes, reopen both apps, and exercise keyboard, focus, drafts, errors, and recovery. Publish only allowlisted screenshots transactionally. Stop the owned app/runtime process tree and verify it is gone.
- Final review records what was proven, what remains intentionally different, approvals, commands actually run, and residual risks. Do not edit protected user-owned files or claim unavailable browser/full-suite checks as passed.
