# Collapsible note Properties

Beads: tockteam-e5yd. Captured 2026-09-19T09:15:25.856Z.

Design read: a daily note editor benefits from metadata on demand, keeping reading and writing primary. Obsidian supports collapsing the note Properties heading; TockTutor always displayed all metadata. Retain the existing title, typography, values, wrapping and readable text column.

Added an accessible disclosure to MarkdownDocumentHeader in plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/live-preview-editor.tsx. It reuses the existing Button primitive with aria-expanded, aria-controls, visible keyboard focus and a directional chevron. The hidden content remains mounted so unfinished property names and errors survive folding. Metadata stays expanded by default, and changes to source do not reset a mounted header's folded state. This local UI state is not persisted; changing modes remounts the editor and expands Properties. No new dependencies, Host behavior, storage changes, or Markdown modifications. Earlier uncommitted changes preserved; no commit/push.

Verification:
- RED: node /tmp/tutor-fold-before.mjs failed because neither mode had an interactive Properties heading. Fresh before captures retained.
- RED component checks: three new cases failed on the missing button.
- GREEN: pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx --environment jsdom — 42 passed. Three new cases cover both adapters, hidden controls, unchanged mutation callbacks, source updates while folded, and preserving/submitting an unfinished property name.
- pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench typecheck — passed.
- pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench build; pnpm build; node scripts/tocktutor-build-manifest.mjs --write; node scripts/stage-dsh.mjs --quick; node scripts/tocktutor-build-manifest.mjs — passed.
- node /tmp/tutor-fold-verify.mjs — real isolated Desktop in both modes at 1512 and 820 CSS widths: Enter/Space toggles, 2px visible focus, hidden controls excluded from Tab order, unfinished input retained, correct Tab order through two existing tag controls into the draft, Escape cancellation, plain notes, no overflow, internal-link Enter navigation, unchanged shared-note SHA-256. Both modes reclaim 200px in body position; header box measurements differ by existing margin collapse (Reading 212px, Live Preview 200px).
- node /tmp/tutor-fold-ob-verify.mjs — fresh isolated Obsidian 1.13.7 expanded/collapsed captures with identical shared-note bytes.
- node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts — 4 passed.
- git diff --check — passed. React Doctor 69 before/after, same four existing complexity warnings.
- All seven published screenshots visually inspected; exact geometry, theme, route, content, mode, hashes and runtime observations in proof.json. No TockTutor runtime errors. Known unrelated initial TockCoder error and CSP warning recorded separately.
- All five launched app trees and every tracked descendant verified stopped before allowlisted transactional publication. Two harness retries corrected test assumptions (Tab order and asynchronous note navigation), without additional implementation changes.

Remaining: metadata folding is local to the mounted header; persisted per-note preferences are outside this slice. The separate malformed Canvas loop tockteam-v2r remains open. Document-title/body spacing remains a possible visual refinement.
