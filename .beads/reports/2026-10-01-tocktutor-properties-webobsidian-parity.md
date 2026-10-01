# TockTutor Properties Versus webobsidian

## Scope and Verdict

Read-only **Properties Only** comparison requested by the user; tracked by `tockteam-owhh`. This is a current-source feature snapshot, not a review of only the latest toggle commit and not an implementation request.

Reference: `/Users/taowang/research/tutor/webobsidian`, tracked revision `c41967a93317b2a0f08511c349ef3dbaf78fc882`. TockTeam source at `59d2d248` includes the segmented-control implementation in `1e3174b3`; the later gallery commit does not change product code. Exact source fingerprints and executable comparison results are in the adjacent `2026-10-01-tocktutor-properties-webobsidian-parity.json`.

**The basic feature is shared, but the Properties port is not feature-complete. Five confirmed parity gaps were identified.** These are existing compatibility gaps, not five regressions introduced by the new toggle.

Full functional parity with this pinned reference is feasible. It requires finishing missing operations and matching their user-facing behavior, not copying its unsafe whole-block YAML rewriting or rebuilding the app. Exact pixel/keyboard parity has not been certified by a fresh side-by-side browser run.

## Existing Overlap

Both implementations present text, list, number, checkbox, date, and date-time property types and use note frontmatter as the underlying data. TockTutor's bound Properties view already edits supported values through its existing document/save pipeline; imported empty/null values preserve the expected control type. Six fresh pure-helper comparisons confirmed the common inferred types; existing focused checks confirmed native date/number controls, checkboxes, list additions/removals, failure handling, and body preservation.

The in-note presentation is not identical: webobsidian makes its Live Preview Properties widget editable; TockTutor's in-note header primarily displays properties, with Add Property/tag removal, and uses the linked sidebar for full supported-value editing. This is a workflow/layout difference, not evidence that the basic controls are absent everywhere.

## Confirmed Parity Gaps — 5

1. **[P2] Property names accepted by webobsidian can disappear from TockTutor's controls.**
   - **Impact:** Existing keys such as `custom key`, `note.rating`, and `123field` are parsed by webobsidian but omitted from TockTutor's property list; trying to add them through TockTutor's writer is rejected. The authored text remains in Source Mode, so this check did not demonstrate data deletion.
   - **Affected path:** `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/properties.ts:34,138,202`; reference `web/src/lib/livePreview.ts:1299` (`parseFrontmatter`).
   - **Fix/verification status:** Not fixed. Three fresh paired parser/writer probes reproduced the difference. Safely broaden the supported name grammar and preserve validation/duplicate handling rather than dropping validation.

2. **[P2] Per-property rename, removal, and Copy value actions are missing from the TockTutor widget.**
   - **Impact:** webobsidian lets users edit the name directly, delete the complete property, and use its `Copy value`/`Remove` context menu. TockTutor renders a static name and value controls but no equivalent row menu or direct key editing; removing a list item is not removing its property. A backend rename helper exists, but it is not wired to this UI.
   - **Affected path:** `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/live-preview-editor.tsx:107,157`; `src/properties.ts:220`; reference `web/src/lib/livePreview.ts:1493-1513,1701-1713,1768-1776`.
   - **Fix/verification status:** Not fixed; source-confirmed by inspection of the complete owning widgets and the rename call graph. Add the missing user actions through the current owned-note editing/save path, keeping recoverable removal and draft preservation.

3. **[P2] Changing and saving a property's type is not implemented in TockTutor.**
   - **Impact:** webobsidian's `Property type` menu offers Text, List, Number, Checkbox, Date, and `Date & time`; it saves the assignment in `.obsidian/types.json` and changes list/scalar representation where required. TockTutor only reads imported assignments and infers remaining types, so users cannot perform the same type-change workflow.
   - **Affected path:** `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/live-preview-editor.tsx:157`; `src/route.tsx:243,872,2604`; `.agents/references/tocktutor.md:146`; reference `web/src/lib/livePreview.ts:1392,1459` and `server/src/services/propertytypes.ts:26`.
   - **Fix/verification status:** Not fixed; source-confirmed and explicitly documented as unimplemented. This is an intentional current read-only contract, not a failed mutation. Full parity here requires explicit approval to change that contract, with vault/generation/revision-bound, recoverable writes—not merely adding a menu or silently modifying user configuration.

4. **[P2] Existing property-name and tag-value suggestions are missing.**
   - **Impact:** webobsidian offers unused vault property names when adding a property and existing vault tags when adding a tag. TockTutor offers plain inputs, requiring users to remember and retype those values.
   - **Affected path:** `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/live-preview-editor.tsx:84-98,183-215`; reference `web/src/lib/livePreview.ts:1618,1806` and `web/src/components/Editor.tsx:73-74`.
   - **Fix/verification status:** Not fixed; source-confirmed. Reuse the existing vault property/tag data and shared input/menu controls; no second index or suggestion service is needed.

5. **[P2] List/tag item editing and tag cleanup do not match.**
   - **Impact:** webobsidian lets users edit an existing chip directly and normalizes tags/cssclasses by removing leading `#` and changing whitespace to hyphens. TockTutor's chips are display/remove controls, so changing an item requires removing and adding it; its add path trims only. Entering `#new tag` therefore produces `new-tag` in webobsidian but retains `#new tag` in TockTutor.
   - **Affected path:** `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/live-preview-editor.tsx:84-98`; reference `web/src/lib/livePreview.ts:1292,1717-1752`.
   - **Fix/verification status:** Not fixed. Chip editability is source-confirmed; a fresh paired normalization/save probe reproduced the tag difference. Match the intended tag rules and allow direct chip edits without flattening structured values or applying tag normalization to ordinary text lists.

## Extra UI and Intentional Safety Differences

- The **Unlink / Pin / Close** row comes from TockTutor's `LinkedNotePane`, not webobsidian's Properties widget. It manages the view's note relationship; it is an extra capability, not a requirement for property editing or feature parity. Its actions can be placed in a compact menu without losing them. No layout change was made in this audit.
- TockTutor's conservative writer preserves unrelated authored text and rejects structured/incompatible edits. In a fresh example containing a comment and nested child, TockTutor changed only `status`; webobsidian's pure whole-block serializer dropped the comment and moved the nested child to the top level. We should not reproduce that behavior to claim parity.
- Zoned/second-resolution date-times, nested YAML, and non-string lists remain explicit Source Mode cases in TockTutor. The reference may present/coerce more of those values. Any expansion must retain exact data or clearly expose the unsupported case, rather than silently throwing information away.
- Scalar keyboard commitment differs in source: webobsidian's editable text commits on Enter/blur; TockTutor's scalar input commits on blur. This was not separately driven in a fresh browser, so exact keyboard equivalence remains unverified rather than certified.

## Minimal Route to Parity

Keep the current data-preserving property writer, shared UI components, and existing save/undo/recovery ownership. Finish property-row actions, safe key support, suggestions, and direct chip editing; separately approve and implement type-assignment writes if full type-change parity is desired. Verify the same notes and user actions in both apps, including errors, empty values, save/reopen, keyboard behavior, and metadata effects. The Properties feature does not require another agent loop, plugin system, stylesheet, or a copy of webobsidian's whole editor.

## Fresh Verification and Limits

- `cd plugins/tocktutor/packages/tockteam-tocktutor-workbench && node --test tests/properties.test.ts` — **13 passed**.
- `cd plugins/tocktutor/packages/tockteam-tocktutor-workbench && ./node_modules/.bin/vitest run tests/editor-adapters.test.tsx --environment jsdom -t 'propert|frontmatter'` — **11 passed, 79 intentionally filtered out**.
- `cd plugins/tocktutor/packages/tockteam-tocktutor-workbench && ./node_modules/.bin/vitest run tests/route-linked-panes.test.tsx --environment jsdom -t 'validates typed property input|imported empty|untouched empty numbers|imported numbers|incompatible imported YAML'` — **7 passed, 28 intentionally filtered out**. This does not claim the protected file's full suite is green.
- `node /tmp/tocktutor-properties-parity-20261001-01a0f5ff/compare-properties.mjs` — **11 comparison probes passed**: six type overlaps, three name gaps, tag normalization, and safer YAML preservation. It transforms only the reference's unchanged pure property helpers in memory; it does not start either app or write to either vault.
- `node scripts/tocktutor-build-manifest.mjs --check` passed.
- Simplification, security/hardening, and performance review references were all applied proportionally. No new performance or security bug is claimed from this bounded comparison.
- No GUI, server, shared build, user vault/configuration mutation, or product source modification was performed. No fresh side-by-side screenshot/keyboard run was performed; browser-level parity and exhaustive YAML compatibility are not claimed. Full root gates were not rerun for a read-only report.
