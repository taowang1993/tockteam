# External link cues

Beads: tockteam-g08w. Captured 2026-09-19T08:59:16.666Z.

Design read: a daily note editor needs recognizable destinations while preserving readable text and established navigation. The Obsidian reference marks outbound links with a small arrow; TockTutor lacked the distinction.

Added one shared tocktutor-note-links Tailwind utility in plugins/skins/src/client/tailwind.css and enabled it on the existing Reading and Live Preview roots. A decorative empty pseudo-element masks a small outbound icon in the existing muted color. HTTP(S) selectors are case insensitive. Internal, fragment, email, and footnote links are unchanged. No editable nodes, parser, navigation, package, or dependency changes. Prior uncommitted work preserved; no commit/push.

Verification:
- RED: node /tmp/tutor-outbound-before.mjs failed because external link ::after mask was none in both modes.
- GREEN: node /tmp/tutor-outbound-verify.mjs checked both modes at 1512 and 820 CSS widths, HTTPS/HTTP/uppercase schemes, internal/email/fragment links, quote/list links, wrapped long labels, underlines, overflow, and unchanged Markdown bytes.
- External click in Live Preview and keyboard Enter in Reading opened the existing isolated viewer with the note route preserved. Reading internal-link Enter navigated to Notes/Welcome.md. The initial source-level concern about activation was resolved by the real app: shell navigation handles the links.
- pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx --environment jsdom — 39 passed. No cosmetic unit tests added; real browser computed styles directly verify the change.
- Workbench typecheck/build, pnpm build, node scripts/tocktutor-build-manifest.mjs --write, node scripts/stage-dsh.mjs --quick, and manifest validation passed.
- node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts — 4 passed. git diff --check passed.
- React Doctor 69, four unchanged complexity warnings.
- All five fresh screenshots visually inspected. Exact geometry, content/mode/route, explicit dark/no skin, hashes and runtime observations are recorded in proof.json. Obsidian uses the identical link fixture.
- No TockTutor runtime errors. Known unrelated TockCoder startup error and development CSP warning recorded separately.
- All three launched app process trees and tracked descendants verified stopped before allowlisted transactional publication.

Limit: the cue covers HTTP(S), while Obsidian also marks mailto links. The older before image is clearly labeled and hashed. Canonical gallery screenshots remain the established baseline; its latest-improvement link opens this comparison. The separate malformed Canvas loop tockteam-v2r remains open.
