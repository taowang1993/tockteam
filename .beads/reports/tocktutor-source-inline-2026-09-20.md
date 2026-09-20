# Source Mode Inline Formatting

Fixed the four reported differences from the Obsidian Source Mode reference:

- Enabled CodeMirror's existing extended Markdown grammar for `~~strikethrough~~`.
- Added small Markdown parser extensions for `==highlights==` and `[[wiki links]]`, including aliases. Code and YAML stay outside these inline rules; escaped and unfinished highlights stay plain.
- Used existing document highlight and purple-link tokens, retaining readable ordinary punctuation. Declared the already-installed `@lezer/highlight` dependency directly.
- Stopped mounting the Source checkbox extension: `[x]` and `[ ]` remain literal, editable text. Reading View and Live Preview task behavior is unchanged.

## Checks

- RED: `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-adapters.test.tsx --environment jsdom` failed because Source Mode rendered a checkbox instead of literal markers.
- RED: `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/source-appearance.test.tsx --environment jsdom` failed on missing strikethrough styling.
- GREEN: `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/source-appearance.test.tsx tests/editor-adapters.test.tsx --environment jsdom` — 46 passed.
- `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench run test:component` — 463 passed across 17 files.
- Workbench `run typecheck`, workbench `run build`, and root `pnpm run build` passed. `node scripts/stage-dsh.mjs --quick` passed after refreshing the successful-build manifest.
- `node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts` — 4 passed after publication.
- `node scripts/tocktutor-build-manifest.mjs` and `git diff --check` passed.
- React Doctor remains 68/100, with the same four existing route/utility complexity warnings; no new findings.

## Visual Proof

[Source Mode Screenshot](../../.agents/uiux/tocktutor/screenshots/tocktutor-editor-source.png) · [Style, Content, and Cleanup Evidence](tocktutor-source-inline-2026-09-20.json)

The real Desktop route was verified through app-scoped Playwright/CDP at 1512 × 949 CSS pixels and 2× scale (3024 × 1898 pixels), built-in dark theme, no skin. Computed styles prove line-through text, yellow highlighting, and purple internal/aliased/external links; the editor contains zero checkbox inputs and visible literal task markers. Source file hashes are unchanged. The image was inspected against the existing Obsidian Source Mode screenshot before transactionally replacing only the allowlisted TockTutor Source image and its capture record.

No uncaught renderer errors. The existing TockCoder startup console error `workspaces.startSession is not a function` remains recorded and is outside this change. The launched app and full tracked descendant tree were stopped and verified. Unrelated changes are preserved; no commit or push under the conservative repository profile.
