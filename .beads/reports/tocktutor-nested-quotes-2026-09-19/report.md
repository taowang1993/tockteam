# Nested quotation hierarchy

Beads: tockteam-385. Captured 2026-09-19T06:29:15.015Z.

Design read: daily note reading needs quotation boundaries that retain the author's hierarchy. Preserve the existing column, accent bars, inset and paragraph spacing. Fresh installed Obsidian confirms three nested quote levels for the identical fixture; pre-fix TockTutor Reading displays literal markers inside one quote.

Changed the shared static Markdown renderer in rich-markdown.ts: quote bodies now recognize nested quote paragraphs using the existing safe inline renderer, footnote map and external-embed mode. Recursion is bounded at 32 levels; excess markers remain inert text. Reading, static exports and other consumers share the correction. No dependencies, Host authority or storage changes. This is a scoped nested-quotation fix, not a replacement for the complete Markdown parser; arbitrary block types inside quotes and lazy-continuation parity were not added.

Verification:
- RED: node --test --test-name-pattern='preserves nested quote paragraphs' plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/rich-markdown.test.ts reproduced escaped greater-than markers before implementation.
- Real Desktop RED: BEFORE=1 node /tmp/tutor-nesting-verify.mjs captured the previous staged renderer and failed on one quote versus three.
- GREEN: node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/rich-markdown.test.ts — 20 passed. New regressions cover nested/sibling/outer paragraphs, links, footnotes, inert resource boundaries, line-break options, empty quotes and excessive nesting.
- pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx --environment jsdom — 37 passed.
- Workbench typecheck/build, root build, manifest verification and quick stage refresh passed. React Doctor 69 before/after with the same four existing complexity warnings.
- node /tmp/tutor-nesting-verify.mjs proved three levels in both modes at 1512 and 820 widths, 24px padding, 2px bars, 26px nesting steps, no horizontal overflow, unchanged note bytes and Enter navigation on a nested internal link.
- node /tmp/tutor-nesting-ob-verify.mjs proved three levels in installed Obsidian 1.13.7 with the identical fixture. Both new app sessions recorded no page or console errors during note verification. TockCoder startup error and development CSP warning remain unrelated observations from CLI attachment.
- node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts — 4 passed; git diff --check passed.
- All six published images visually inspected. Exact CSS/device geometry, mode, route/file, explicit dark/no skin and content hashes recorded. All four launched app/process trees and tracked descendants stopped before transactional allowlisted publication. One extra TockTutor launch was stopped without capture because staging had not finished; it is included in cleanup proof.

Earlier uncommitted work preserved. No commit or push. Next visual candidate: TockTutor always shows a large empty Properties block on notes without metadata, while Obsidian leaves that space for the note. H4–H6 presentation is another optional future pass.
