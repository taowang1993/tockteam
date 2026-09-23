# Quote paragraph rhythm and visible note links

Beads: tockteam-ops. Captured 2026-09-19T04:43:56.780Z.

The supplied Obsidian screenshots distinguish quote paragraphs and underline internal links. TockTutor's renderer already preserved paragraph semantics, but styles set all quote paragraph margins to zero. Internal links relied only on accent color.

Changed editor-surface.tsx and live-preview-editor-runtime.tsx: add 16px margin only between adjacent direct quote paragraphs, preserving zero outer margins. Underline rendered anchors and Live Preview internal-link decorations with 2px offset. Existing semantic rendering, navigation, editing and storage stay intact. Updated three existing link-style expectations; no new cosmetic unit tests, because real browser computed styles verify the visual behavior.

Validation:
- RED: node /tmp/tutor-quote-before.mjs measured two quote paragraphs, 0px gap, and decoration none, then failed the separation assertion.
- GREEN: node /tmp/tutor-quote-verify.mjs proved 16px gap and underlined ordinary/aliased links in both modes, zero outer paragraph margins, keyboard focus and Enter navigation to Welcome, and wrapping without overflow at 820px. Live Preview table paragraph margins remain zero. Shared Markdown bytes unchanged.
- pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx --environment jsdom: 35 passed.
- Workbench typecheck/build, node scripts/tocktutor-build-manifest.mjs --write, pnpm run build, node scripts/stage-dsh.mjs --quick, manifest verification passed.
- node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts: 4 passed. git diff --check passed.
- React Doctor expanded changed-file scan 72 to 69, with identical four pre-existing route/utility complexity warnings and no findings in touched sources. Scope expanded from 12 to 16 files, so these scores are not directly comparable; direct two-file scan found the identical eight existing diagnostics in HEAD and current source (snapshot score 73, current score 80). Existing article click delegation is exercised via native link keyboard activation; unrelated prior static interaction/key/ref warnings were not changed.
- Both screenshots visually inspected. Exact geometry, route, dark/no skin, content and screenshot hashes recorded in proof.json. No TockTutor page or console errors during checks. Existing TockCoder startup error and development CSP warning remain.
- Five isolated app/runtime process trees stopped, descendants verified absent before transactional allowlisted publication. Two baseline retries waited for the editor mount before switching mode; one final verification retry accounted for reopening notes defaulting to Live Preview.

Limits: this is a focused readability correction. Heading scales, body widths, nested list spacing, and quote inset still differ between modes and Obsidian. No commit or push; earlier uncommitted work preserved.
