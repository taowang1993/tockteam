# Source Mode Frontmatter and Contrast

## Cause and Fix

Source Mode used the Markdown parser without YAML frontmatter support. The opening `---` became a horizontal rule, and the metadata plus closing `---` became a Setext heading. Default CodeMirror syntax colors made the opening delimiter, punctuation, and URLs too dark for the dark theme; heading underlining created the apparent second bottom divider.

`source-editor-runtime.tsx` now wraps Markdown with CodeMirror's existing `yamlFrontmatter` support, excludes metadata from custom heading/comment decorations, and retains syntax emphasis while inheriting the note's text color. The already-installed `@codemirror/lang-yaml@6.1.3` is declared directly in the workbench package. No authored note bytes changed.

## Verification

- RED: `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/source-appearance.test.tsx --environment jsdom` reproduced both the incorrect parse and dark delimiter color. An additional RED assertion reproduced YAML comments receiving Markdown heading decorations.
- GREEN: `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/source-appearance.test.tsx tests/editor-adapters.test.tsx tests/route-source-navigation.test.tsx --environment jsdom` — 47 passed.
- `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench run test:component` — 461 tests passed across 17 files.
- Workbench `run typecheck` and `run build`, root `pnpm run build`, and `node scripts/stage-dsh.mjs --quick` passed.
- `node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts` — 4 passed after screenshot/proof publication.
- `node scripts/tocktutor-build-manifest.mjs` and `git diff --check` passed.
- React Doctor: 68/100; four complexity warnings in existing route/utility code, none in the changed source editor. This is not a claim that the whole dirty checkout is warning-free.

## Rendered Proof

Bounded, app-scoped Playwright/CDP verification of the real Desktop Source Mode used the unchanged shared `UIUX Comparison.md`, built-in dark theme, no active skin, 1512 × 949 CSS pixels, and 2× scale. Screenshot pixels were verified as 3024 × 1898. Computed colors confirmed delimiters, emphasis markers, list/quote markers, and URLs match the note text; metadata has no underline. The refreshed image was visually inspected before publication.

- [Refreshed Source Mode Image](../../.agents/uiux/tocktutor/screenshots/tocktutor-editor-source.png)
- [Capture, Style, Hash, and Cleanup Evidence](tocktutor-source-mode-2026-09-20.json)
- The gallery's existing content-alignment proof was updated only for this capture. No other screenshot or note was replaced.

All seven temporary app trees, including harness retries for startup readiness, SPA navigation, and asynchronous note opening, were stopped and verified. The successful capture reported no uncaught renderer errors. The existing TockCoder startup console error `workspaces.startSession is not a function` was recorded separately, as in the previous content-alignment report; it was not fixed or hidden.

Existing unrelated changes are preserved. No commit or push was made under the repository's conservative session profile.
