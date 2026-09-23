# Clearer nested list hierarchy

Beads: tockteam-oog. Captured 2026-09-19T05:00:20.493Z.

Design read: a daily note editor needs readable hierarchy while preserving its established navigation and content layout. The supplied Obsidian screenshots give nested children more breathing room and a vertical guide. TockTutor used 16px indentation; Reading had a guide crowded against the bullets, while Live Preview had no guide.

Updated nested ordered and unordered list indentation to 32px in editor-surface.tsx and live-preview-editor-runtime.tsx, and added the existing theme-border guide treatment to Live Preview. Retained compact nested margins, task formatting, Markdown semantics, editor controls and storage. One existing style expectation was updated. No new cosmetic unit tests were added; computed browser geometry checks validate the change.

Verification:
- RED: node /tmp/tutor-lists-before.mjs failed with 16px indentation in both modes and 0px Live Preview guide width.
- GREEN: node /tmp/tutor-lists-verify.mjs verified 32px indentation, 1px guides, zero nested margins, unchanged task state and no nested overflow at 1512px and 820px widths.
- The real Desktop app also verified mixed ordered/bullet lists to three levels and nested tasks with long wrapping text at 820px. Keyboard list folding briefly toggles then resets to expanded; reproduced twice and tracked separately as tockteam-xri. No folding code was modified. Additional fixture content was placed in the disposable Untitled note only after canonical screenshots. Shared Markdown bytes remain unchanged.
- pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx --environment jsdom: 35 passed.
- Workbench typecheck/build, node scripts/tocktutor-build-manifest.mjs --write, pnpm run build, node scripts/stage-dsh.mjs --quick, manifest verification passed.
- node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts: 4 passed. git diff --check passed.
- React Doctor: 69/100 before and after, same four pre-existing route/utility complexity warnings.
- Both canonical screenshots visually inspected. Exact geometry, dark/no skin, content, route and source/image hashes recorded in proof.json. No TockTutor errors during verification. Runtime log warnings are recorded separately (GPU/network termination messages during cleanup); Playwright CLI also observed the known TockCoder workspaces.startSession startup error and development CSP warning on the initial TockCoder route.
- All 4 launched app/runtime process trees fully stopped and descendants verified absent before allowlisted transactional publication.

This is a focused hierarchy improvement. Body widths, heading scales, top-level spacing and quote inset still differ from Obsidian. No commit or push; earlier uncommitted work preserved.
