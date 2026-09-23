# Readable minor headings

Beads: tockteam-kkt0. Captured 2026-09-19T08:41:48.019Z.

Design read: a daily study-note editor needs legible hierarchy at every depth while preserving the established dark theme, content width, and subsection rhythm. Fresh same-fixture Obsidian measurements reveal H4/H5/H6 at 19.008/17.216/16px versus TockTutor browser defaults of 16/13.28/10.72px.

Changed only the existing presentation recipes in editor-surface.tsx and live-preview-editor-runtime.tsx: H4/H5/H6 now use 19/17/16px, 27/26/24px line heights, weights 640/620/600, 24px top and 16px bottom margins. The first-heading zero-margin rule covers all six levels. H1–H3, content semantics and the canonical shared note remain unchanged. No dependency changes; previous uncommitted work preserved. No commit or push.

Verification:
- RED: node /tmp/tutor-subhead-before.mjs failed on H6 10.72px versus expected 16px before implementation, and recorded all heading sizes/margins in both modes. No new cosmetic unit test was needed; computed browser layout is the direct check.
- pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx --environment jsdom — 39 passed.
- Workbench typecheck/build, pnpm build, node scripts/tocktutor-build-manifest.mjs --write, node scripts/stage-dsh.mjs --quick, and manifest validation passed.
- node /tmp/tutor-subhead-verify.mjs — real Desktop Playwright CDP at 1512 and 820 widths, six-level hierarchy, matching positions in both modes, long wrapping opening H4/H5/H6 and no overflow. Both fixture and shared-note hashes unchanged.
- React Doctor 69 before/after with the same four existing complexity warnings.
- Four fresh TockTutor screenshots and fresh installed Obsidian screenshot visually inspected. Exact geometry, route/file, visible content/mode, explicit dark/no skin, hashes and source hashes recorded. Main gallery links the comparison.
- No TockTutor page/console errors. Initial TockCoder route emitted existing workspaces.startSession error and development CSP warning; recorded separately.
- All three launched app trees and tracked descendants verified stopped before allowlisted transactional screenshot publication; CLI detached automatically on app exit.

Limits: this adopts Obsidian's readable size hierarchy, not pixel-identical typography or spacing. Obsidian has 40px heading separation; TockTutor retains the already-established 24px subsection separation. The separate malformed Canvas loop (tockteam-v2r) remains open.
