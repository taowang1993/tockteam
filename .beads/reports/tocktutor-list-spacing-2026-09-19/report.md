# Clearer Markdown list groups

Beads: tockteam-1v1. Captured 2026-09-19T05:41:26.665Z.

Design read: a daily note editor needs clear visual separation between independent blocks, with close spacing inside each group. Obsidian's supplied screenshot shows this strength. TockTutor's independent ordered and task lists had only 8px between them, weakening the grouping. Preserve nested indentation/guides, Markdown semantics, task states, keyboard folding and the existing dark appearance.

Change: four scoped Tailwind utilities across editor-surface.tsx and live-preview-editor-runtime.tsx give direct document-level ordered and unordered lists 24px block margins. This includes task lists. Child lists retain zero margins. The selectors target the rendered Markdown wrapper and ProseMirror document respectively, avoiding lists inside quotes, callouts and footnotes. No behavior, persistence, Host or dependency changes.

Verification:
- RED: node /tmp/tutor-blocks-before.mjs failed before implementation. Both modes measured 8px ordered-list margins and zero task-list margins, with 8px between groups. Initial harness missed Reading's inner HTML wrapper; corrected selector and reran before editing.
- GREEN: node /tmp/tutor-blocks-verify.mjs passed. Both modes measured 24px margins and gaps at 1512px and 820px viewport widths; nested margins stayed zero and indentation stayed 32px. No horizontal overflow. Checked/unchecked task states preserved.
- Additional disposable fixture verified top-level ordered, bullet and task lists; three nesting levels; nested tasks; long wrapping task descriptions at 820px. Enter/Space folding passed on the shared note. Canonical screenshots preceded this fixture. Shared Markdown bytes stayed identical.
- Exact component command: pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx --environment jsdom. All 37 passed. No additional cosmetic unit tests; actual rendered measurements directly verify this small CSS change.
- Workbench typecheck/build, root build, manifest and stage refresh passed.
- React Doctor 69/100 before and after, same four existing route/utility complexity warnings. No new diagnostics.
- Both screenshots visually inspected, 1512 × 949 CSS @2x =3024 × 1898, explicit dark/no skin, correct route/content/mode. Image, source and note hashes recorded in proof.json. No TockTutor page or console errors. Known unrelated initial TockCoder workspaces.startSession error and development CSP warning remain; runtime warnings recorded separately.
- All three launched app/runtime process trees and every tracked descendant verified stopped before allowlisted transactional publication. CLI attachment closed with the app.

Limits: list-group spacing only. Heading/paragraph vertical rhythm and quote inset still differ from Obsidian. No claim of pixel parity. Earlier uncommitted changes preserved; no commit or push.

Final checks: node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts (4 passed); node scripts/tocktutor-build-manifest.mjs; git diff --check. Final git status inspected; changes from earlier runs retained.
