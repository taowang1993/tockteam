# Navigable note outline

Beads: tockteam-imp. Captured 2026-09-19T04:02:20.536Z.

## Design read and change

A frequent-use note workspace needs fast navigation through long documents. Preserve TockTutor's existing editor, theme tokens, mode selection, file tree, and utility panel. Obsidian's supplied Outline screenshot shows nested, collapsible headings and indentation guides. TockTutor had Host outline data but no visible Outline view.

Added More Note Actions → Outline, using the existing editor source projection so new unsaved headings appear immediately. Includes nested lists, independent branch folding, expand/collapse all, six-level heading support, selected jump target, full-label tooltips, keyboard controls, empty/unavailable states, and guides. Reading and Live Preview scroll to the selected rendered heading; Source Mode uses the existing exact-line selection. Duplicate formatted headings are disambiguated; headings from embedded notes are excluded from jump targets. Frontmatter, fenced code, and comments are excluded by the existing projection. The panel uses the current note source, without a new Host service or agent loop.

Implementation: workbench src/note-outline.tsx; utility-panel.tsx composes it; route.tsx adds one menu item. Tests in tests/note-outline.test.tsx and tests/route-panel-controls.test.tsx. Generated package output and manifest refreshed. Prior uncommitted explorer/search/properties/gallery work preserved. No commit or push.

## Verification

- RED: `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/route-panel-controls.test.tsx --environment jsdom -t 'opens a hierarchical outline'` failed for missing Outline. A second RED check for `outlines unsaved source` failed before switching to current-source projection.
- Final focused: `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/route-panel-controls.test.tsx tests/note-outline.test.tsx --environment jsdom`: 65 passed.
- `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench test:component`: 439 passed before one final parser-exclusion check; that check passes in the final focused run above.
- Workbench `typecheck` and `build`, root `pnpm run build`, `node scripts/tocktutor-build-manifest.mjs --write`, `node scripts/stage-dsh.mjs --quick`, manifest verification, and `git diff --check` passed.
- `node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts`: 4 passed.
- `npx -y react-doctor@latest plugins/tocktutor/packages/tockteam-tocktutor-workbench --verbose --diff`: 72/100, four existing complexity warnings in route source/generated and utility-panel; no new outline diagnostic. Root baseline scanned a different scope (76/100), so those scores are not directly comparable. The package score matches the prior automation's changed-file package result.
- `node /tmp/tutor-outline-verify.mjs`: real isolated Desktop via Playwright/CDP verified branch and bulk folding, keyboard focus/Enter, mode-preserving reading/live jumps, exact Source selection of ## Data, empty-note and note-switch states. Playwright CLI attached and inspected the isolated app. Earlier attempts fixed verification selector names and CodeMirror selection inspection, not app defects.
- Captured exact 1512×949 CSS at 2×; both PNGs 3024×1898. Verified built-in dark/no skin, route, Live Preview state, full 300px utility width, and identical shared Markdown hash. No TockTutor renderer/console errors during checks. Known unrelated TockCoder startup error and development CSP warning remain.
- All three launched app/runtime descendant trees stopped and verified absent before transactional allowlisted publication.

## Limits

The outline inherits the editor projection's ATX (#) heading support; underlined Setext headings are not included. Collapse/selection state is local and resets when the note or its heading structure changes or the panel closes. The highlight marks the last clicked heading, not a live scroll position. If a renderer cannot display a heading, the panel explains how to navigate in Source Mode. No search field is added in this slice.

[Comparison](comparison.html) · [Screenshot](outline.png) · [Collapsed state](outline-collapsed.png).
