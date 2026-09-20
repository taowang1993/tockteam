# Reliable Live Preview list folding

Beads: tockteam-xri. Captured 2026-09-19T05:17:24.702Z.

Design read: a daily note editor benefits from folding nested content to reduce clutter. Preserve the existing dark theme, list hierarchy, file navigation, Markdown content, and editor modes. The prior run identified a folding reset; this run fixes it and separates the gutter control from ordered-list markers.

Root cause: Milkdown serializes authored list spacing into a different representation. The useEditor return object changes identity on parent renders, so the synchronization effect repeatedly compared serialization with the unchanged authored body, dispatched replaceAll, and cleared local folds. The fix remembers the synchronized body and updates that record for local edits and actual external replacements. Metadata-only updates leave the editor document alone. The fold button moved from -20px to -40px to avoid the list number.

Validation:
- RED: the new component test failed after rerendering identical content; transaction instrumentation showed fold metadata followed by a full replace transaction. Instrumentation removed. Real Desktop reproduced the reset in a minimal nested-list note when the Files sidebar toggled; a subsequent shared-note retry was interrupted during shutdown, so it is not counted as pre-fix evidence.
- GREEN: exact focused command: pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx --environment jsdom. 37 passed, including unchanged-body rerenders, metadata-only changes, keyboard collapse/expand, external replacement, local edit echoes and CRLF frontmatter preservation.
- Full component suite: 447 passed before the additional local-edit regression; that additional test passed in the final focused 37-test suite.
- Workbench typecheck/build; node scripts/tocktutor-build-manifest.mjs --write; pnpm run build; node scripts/stage-dsh.mjs --quick; manifest verification passed.
- React Doctor: 69/100 before and after functional change, same four pre-existing route/utility complexity warnings. Final gutter change is one CSS utility value.
- node /tmp/tutor-fold-verify.mjs: real Desktop keyboard Enter/Space and pointer folding, Files-sidebar rerenders, mode remount, shared and minimal notes, unchanged source bytes, narrow 820px view with no editor overflow, and gutter separation verified.
- node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts: 4 passed. git diff --check passed.
- Both screenshots visually inspected. Exact geometry, dark/no skin, content/route/state and source/image hashes recorded in proof.json. No TockTutor page or console errors. Initial TockCoder route has the known unrelated workspaces.startSession startup error and development CSP warning; cleanup warnings recorded separately.
- All 3 launched app/runtime process trees fully stopped and descendants verified absent before allowlisted transactional publication.

Limits: folds remain local to the mounted editor and reset on real document changes or mode/note switches. No persistence or folding plugin changes in this slice. The supplied Obsidian screenshot is an expanded reference, not a new interaction capture. No commit or push; extensive earlier uncommitted changes preserved.
