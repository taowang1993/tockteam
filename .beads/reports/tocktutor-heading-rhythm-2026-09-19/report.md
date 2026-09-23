# Consistent Markdown heading rhythm

Beads: tockteam-cjn. Captured 2026-09-19T05:57:19.670Z.

Design read: daily note reading and editing benefit from clear section hierarchy and stable layout across modes. Preserve the established typography, 700px column, links, lists, metadata and dark appearance. Obsidian's supplied screenshot shows stronger separation before major sections. TockTutor Live Preview inherited browser heading margins, producing a 17.414px opening-heading jump versus Reading.

Change: existing Tailwind heading margin utilities in editor-surface.tsx and live-preview-editor-runtime.tsx now agree for H1–H3. H2 and later document-level H1 have 40px top margins, H3 has 24px, all have 16px bottom margins. A first document-level heading has no top margin. No font, paragraph, Host, persistence or dependency changes. H4–H6 remain outside this slice.

Verification:
- RED: node /tmp/tutor-headings-before.mjs failed before edits: Live Preview first H1 top 426.914px vs Reading 409.5px. Major-section top margins were 19.92px and 24px respectively.
- GREEN: node /tmp/tutor-headings-verify.mjs passed. All five headings in the shared note match exact vertical positions across modes at 1512px and 820px, with 40px major-section gaps and 24px subsection gaps.
- Narrow fixture verified long H1/H2/H3 wrapping (six, five and four lines), later H1 separation, and documents beginning with H2. No horizontal overflow. Canonical captures preceded fixture changes in disposable notes.
- Checked/unchecked task states preserved; nested-list folding passed with Enter/Space. Shared note bytes unchanged.
- Exact component command: pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx --environment jsdom (37 passed). No new cosmetic unit tests; rendered measurements verify this CSS change.
- Workbench typecheck/build, root build, manifest and stage refresh passed. React Doctor stayed 69/100 with four existing route/utility complexity warnings.
- Both screenshots visually inspected, 1512 × 949 CSS @2x = 3024 × 1898, explicit dark/no skin, correct route/content/mode, with hashes recorded. No TockTutor page or console errors during verification. Initial unrelated TockCoder startup error and development CSP warning seen in CLI attachment; runtime warnings recorded in proof.
- Both launched app/runtime process trees and all tracked descendants verified stopped before allowlisted transactional publication. CLI attachment closed with app.

Limits: no claim of pixel parity with Obsidian. Quote inset and H4–H6 presentation remain candidates for future inspection. Earlier uncommitted changes preserved; no commit or push.

Final checks: node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts (4 passed); node scripts/tocktutor-build-manifest.mjs; git diff --check. Final Git status inspected, earlier changes retained.
