# Searchable and sortable vault properties

Beads: tockteam-bxi. Captured 2026-09-19T03:49:16.644Z.

The supplied Obsidian Properties reference has compact typed rows and search/sort controls. TockTutor previously showed a static three-column table. Added local case-insensitive name filtering, most-used and alphabetical sorting, compact type icons, readable names with full-name/type tooltips, count alignment, accessible type text, clear/focus and Escape behavior, and distinct empty/no-match states. Filter and sort reset when vault identity changes. Property clicks now open the existing Search Notes dialog before running the property query; real-app verification exposed that the old handler ran a search without opening results.

Implementation: new workbench src/vault-properties.tsx, composed by src/utility-panel.tsx; focused route and component tests. Existing uncommitted explorer/search/content-alignment work was preserved and is not attributed to this run. No commit or push.

## Verification

- RED: `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/route-panel-controls.test.tsx --environment jsdom -t 'filters and sorts vault properties'` failed for the missing filter, then separately for the missing search-open action.
- GREEN/final: `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/route-panel-controls.test.tsx tests/vault-properties.test.tsx --environment jsdom`: 61 passed.
- Workbench full component suite: 432 passed before the additional two property-component tests; both added tests are included in the final 61 above.
- Workbench typecheck/build, root `pnpm run build`, stage refresh, build manifest verification, and `git diff --check` passed.
- `node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts`: 4 passed.
- React Doctor changed-file scan expanded to include the pre-existing large utility component (79 → 72). Matched before/after source snapshots with identical package metadata scored 69 → 69, with the same seven existing utility-panel warnings; the new component adds no diagnostic. No rule was suppressed.
- `node /tmp/tutor-properties-verify.mjs`: isolated real Desktop Playwright/CDP verified filtering, sorting, visible keyboard focus, Enter opening the property-search dialog, clear/focus, Escape, and ordinary property names fitting without truncation. Playwright CLI also inspected the isolated app and detached.
- Exact capture geometry and image pixels checked; shared Markdown hashes equal; route and Live Preview mode checked; built-in dark/no skin verified. No TockTutor renderer or console errors during the checked flow. Known TockCoder startup error and development CSP warning are recorded separately.
- All five launched app/runtime process trees stopped, descendants verified absent. Published only the two approved screenshots, comparison page, proof, and report via directory rename after cleanup.

[Side-by-side comparison](comparison.html) · [Full-resolution screenshot](properties.png) · [Filtered state](properties-filtered.png).

The original gallery baseline screenshots and proof hashes remain unchanged. The main gallery links to this new capture. Property filtering/sorting is local UI state, not persisted across app restarts; mixed types retain the complete type list in accessible text and the tooltip.
