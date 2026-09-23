# Consistent readable column

Beads: tockteam-6pl. Captured 2026-09-19T05:28:49.361Z.

Design read: a daily note editor should preserve the reader's horizontal position and heading hierarchy when switching between editing and reading. The supplied Obsidian screenshots keep these stable. Preserve TockTutor's dark theme, rendered Markdown semantics, property controls and editor modes.

Change: three existing presentation values corrected. In src/route.tsx the ProseMirror column now has a 700px maximum, matching Reading. In src/live-preview-editor.tsx the Live Preview property header uses the same width. In src/live-preview-editor-runtime.tsx the Markdown H1 uses 26px text and 31px line height, matching Reading. No new component, editor transaction, persistence or Host behavior. Existing H2/H3 sizes already match.

Verification:
- RED: node /tmp/tutor-column-before.mjs failed on the real Desktop: Live Preview left 528px / width 768px; Reading left 562px / width 700px. H1 was 30px/37.5px versus 26px/31px. Full before measurements are in proof.json.
- GREEN: node /tmp/tutor-column-verify.mjs confirmed both modes and property headers at left 562px / width 700px, equal heading sizes, line heights and weights. At 820px viewport both columns were 444px with no overflow. With Files closed both remained 700px. Long headings wrapped identically to three lines at 452px without clipping. Enter/Space list folding still works in the narrow gutter. Shared Markdown bytes stayed identical.
- First green harness attempt measured a sidebar mid-transition; rerun explicitly waited for its final position. A final neutral-focus recapture removes the temporary Reading focus outline from the comparison, without altering application focus behavior.
- Exact component command: pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx --environment jsdom. All 37 passed. No extra cosmetic unit tests added; rendered measurements directly verify this three-value style correction.
- Workbench typecheck/build, root build, manifest write/verification and stage refresh passed.
- React Doctor: 69/100 before and after, same four existing route/utility complexity warnings.
- node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts: 4 passed. git diff --check passed.
- Both screenshots visually inspected. Exact geometry, dark/no skin, content/route/mode and source/image hashes in proof.json. No TockTutor page or console errors. Initial TockCoder route retains its known unrelated workspaces.startSession startup error and development CSP warning; runtime warnings recorded separately.
- All 4 launched app/runtime process trees stopped and every tracked descendant verified absent before allowlisted transactional publication.

Scope limits: this corrects horizontal alignment and H1 scale. It does not claim pixel parity, identical vertical spacing, or changes to Source mode. Original Obsidian screenshots are supplied references, not fresh captures. Existing earlier uncommitted work preserved; no commit or push.
