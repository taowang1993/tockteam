# Clearer quote inset

Beads: tockteam-4rf. Captured 2026-09-19T06:13:58.054Z.

Design read: daily note reading benefits from clear quotation boundaries and consistent modes. The supplied Obsidian screenshot gives quotes a visibly larger inset. Preserve TockTutor's accent bar and paragraph spacing; adjust the existing Markdown presentation utilities only.

Changed blockquote padding from 12px to 24px in editor-surface.tsx and live-preview-editor-runtime.tsx. Updated two existing style expectations. No new cosmetic tests, components, dependencies, Host or storage behavior.

Verification:
- RED: BEFORE=1 node /tmp/tutor-inset-verify.mjs failed before edits with actual 12px versus expected 24px; captured both original modes.
- GREEN: node /tmp/tutor-inset-verify.mjs checks both modes at 1512px and 820px, two-paragraph/wrapping quotations and nested Live Preview quotations, 2px borders, 26px text inset including border, and no overflow. Keyboard navigation from quoted text works. Shared Markdown bytes and task states are unchanged.
- Exact component command: pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx --environment jsdom (37 passed).
- Workbench typecheck/build, root build, manifest/stage refresh and four gallery/content checks passed. React Doctor 69 before/after with the same four existing complexity warnings.
- Four fresh screenshots visually inspected; geometry 1512 × 949 CSS @2x = 3024 × 1898. Explicit dark/no skin, correct route/content/mode and hashes recorded. No TockTutor page/console errors. CLI saw the previously observed unrelated TockCoder startup error and development CSP warning; runtime log warnings are recorded in proof.
- All launched app/runtime process trees and tracked descendants verified stopped before allowlisted transactional publication. CLI detached.

Limitation found during edge verification: Reading View renders nested quote markers as literal text inside one quote, while Live Preview produces two nested blockquote elements. Reproduced twice and recorded in proof; tracked as tockteam-385 for the next pass. This CSS change does not alter the parser. Two initial verification runs stopped on this existing mismatch, before the final run recorded it explicitly.

Earlier uncommitted work preserved; no commit or push. H4–H6 presentation remains a possible later improvement.
