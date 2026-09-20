# Nested Tags parity improvement

Beads: tockteam-7za. Captured 2026-09-19T04:18:33.051Z.

## Design read and change

Frequent-use note navigation should make tag families legible. Obsidian's supplied Tags screenshot groups lesson/intro under lesson with a chevron, indentation guide, and right-aligned count. TockTutor previously rendered flat text rows. Preserve the existing note, utility panel, theme, and file tree.

Added workbench src/vault-tags.tsx, composed by utility-panel.tsx. Supports nested and flat views, individual and bulk folding, Most used and Name A–Z sorting, case-insensitive local filtering (optional leading #), ancestor context for filtered matches, clear/Escape focus restoration, empty/no-match states, and accessible names/full-path tooltips. Filtering temporarily reveals folded descendants and clearing restores folds. Parent counts sum tag uses, explicitly labeled in tooltips; they are not distinct-note totals. No Host or API changes.

Tag clicks open visible results and select Keyword mode. Real Desktop verification also exposed old filename filtering tied to modal searchQuery. Removed that coupling in route.tsx so Files remains populated after tag searches are dismissed. New regression checks cover both changes.

## Verification

- RED: missing nested collapse/search controls, missing filter/sort controls, tag clicks retaining Related mode, and tag queries emptying Files each failed before their fixes. Logs: /tmp/tutor-tags-{red,controls-red,search-red}.txt.
- Focused: pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/route-panel-controls.test.tsx tests/vault-tags.test.tsx --environment jsdom — 68 passed.
- Full components: pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench test:component — 446 passed.
- Workbench typecheck and build; node scripts/tocktutor-build-manifest.mjs --write; pnpm run build; node scripts/stage-dsh.mjs --quick; manifest verification and git diff --check passed.
- React Doctor changed-file package check: 72/100 before and after, same four existing route/utility complexity warnings; no vault-tags findings.
- node /tmp/tutor-tags-verify.mjs used real isolated Desktop with Playwright/CDP. Verified keyboard focus and Enter folding/search, per-branch and bulk folding, flat/nested mode, sorting, filter/no-match/clear/Escape, child and synthetic parent results returning Notes/Welcome.md, and Files remaining populated after dismissing search.
- Exact 1512×949 CSS at 2×; both PNGs 3024×1898. Built-in dark with no skin, current route/content/mode, shared Markdown hash, and full 300px utility width asserted. No TockTutor runtime errors during interaction. Known unrelated TockCoder startup error and development CSP warning remain.
- First verification attempt used an obsolete Playwright package path after the mandated CLI update; resolved the installed path. Next attempt reached results but used textbox instead of the actual combobox role; fixed the verifier. Its evidence also exposed the Files regression fixed above.
- Every launched app/runtime descendant tree stopped and verified absent before transactional, allowlisted screenshot publication. Captures visually inspected.

## Limits

Filter, sorting, view and fold state are local to the mounted utility view and reset with vault identity. Parent counts cannot deduplicate overlapping notes using the existing facets contract; tooltips say tag uses. The supplied Obsidian screenshot remains unchanged. Earlier uncommitted explorer/search/properties/outline/gallery work is preserved. No commit or push.

[Comparison](comparison.html) · [Screenshot](tags.png) · [Filtered screenshot](tags-filtered.png).
