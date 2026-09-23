# Note property readability

Beads: tockteam-19p. Captured 2026-09-19T04:30:02.862Z.

## Design read

Frequent note reading and editing needs a clear distinction between title, metadata, and content. The supplied Obsidian screenshots give properties readable text, open row spacing, a clear heading, and type-specific icons. TockTutor's shared header used 12px labels, 24px rows, and text icons for every non-tag value.

## Change

Updated MarkdownDocumentHeader in workbench src/live-preview-editor.tsx. Both Reading and Live Preview now use 14px property text, 32px rows, a 16px heading, wider label column, 16px icons, larger tag chips and tag removal targets, and a normal-size Add Property button. Icons reflect the existing inferred property type. Long values and tags wrap; truncated names expose full names and types on hover. Preserved existing semantic definition list, checkboxes, validation and mutation callbacks. Updated two existing tag-style assertions for the wrapping span. No new test suite for this presentation-only change.

## Verification

- RED: node /tmp/tutor-rhythm-before.mjs — failed on rendered font 12px versus required 14px; measured 24px rows. /tmp/tutor-rhythm-red.txt retains failure.
- GREEN: pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx --environment jsdom — 35 passed, including add-property, tag removal, boolean and empty-property states.
- pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench typecheck and build passed.
- node scripts/tocktutor-build-manifest.mjs --write; pnpm run build; node scripts/stage-dsh.mjs --quick; node scripts/tocktutor-build-manifest.mjs passed.
- node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts — 4 passed. git diff --check passed.
- React Doctor package changed-file scope: 72/100 before and after, same four existing route/utility complexity warnings; no new header findings.
- node /tmp/tutor-rhythm-verify.mjs — real isolated Desktop through Playwright/CDP. Asserted both modes' actual fonts, row dimensions, boolean icon, keyboard focus and Enter for Add Property, duplicate validation and Escape cancel, and tag removal focus. At 820px viewport the 444px note header wraps very long text/tags without overflow. No TockTutor page or console errors during the checks. Known unrelated TockCoder startup error and development CSP warning remain.
- Canonical screenshots are both 1512×949 CSS at 2× = 3024×1898; dark/no skin, route, mode, content hash and screenshot hashes recorded in proof.json. Both visually inspected. Existing Obsidian images unchanged. A temporary wrapping fixture appears in the new file tree but the comparison note is byte-identical.
- Verification script retries corrected an obsolete global module path after tool updates, Reading View's menu name, Lucide's alias class name, and an ambiguous heading selector. Five app/runtime trees were stopped with descendants verified absent before allowlisted transactional publication. Playwright CLI detached.

## Limits

This improves the property block, not all Markdown rhythm differences. Reading and Live Preview keep their existing different body widths and heading spacing. Boolean properties remain display-only as before. No commit or push; earlier uncommitted changes preserved.

[Comparison](comparison.html) · [Reading screenshot](reading.png) · [Live Preview screenshot](live-preview.png).
