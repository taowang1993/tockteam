# Base View Review Follow-up

## Scope and Verdict

Snapshot review of Base parsing, authoring, row hydration, formulas/query execution, table edits, layouts, search, clipboard/export, and the mounted route callbacks, after reading `.agents/references/tocktutor.md`. Applied the review skill's simplification, security/hardening, and performance references, including a second pass over the fixes.

**Confirmed findings: 3. All fixed and verified.** No new dependencies, authorities, or UI styling were introduced.

## Findings

1. **[P2] Comments silently removed filter restrictions.** In `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/base-parser.ts`, collecting a global filter block stopped at an unindented comment. Later nested conditions were ignored, allowing excluded notes into results and exports. View filters also became unsupported at the same comment boundary. Both block collectors now admit full-line comments without ending the block. Regression tests cover comments before and between global conditions and inside view conditions. Real Desktop verification confirms both global and view exclusions.
2. **[P2] Unsupported section content was silently discarded.** The same parser accepted inline formula/property/view sections without consuming their values, and ignored nested restrictions beneath a scalar global filter. The UI could therefore show incomplete configuration or a broader result set rather than explain the unsupported source. These shapes now fail closed. Regression tests cover all three section types and scalar-filter children; real Desktop verification checks the latter's explicit unavailable message.
3. **[P2] Hidden rows could prevent valid search summaries.** In `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/base-query.ts`, summaries ran before text search, and a summary failure prevented search itself. Two individually finite note scores whose combined sum overflowed hid even a valid one-note search result. Search now precedes the single summary evaluation, deleting the duplicate calculation. Regression and Desktop checks cover unfiltered overflow, a valid one-note result, an empty result, and clearing search.

## Verification

Each new regression failed before its corresponding implementation change, then passed. Exact focused command:

```sh
node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/base-executable-port.test.ts
```

Result: 22 passed, zero failed.

Fresh workspace/repository checks:

- `pnpm run install:tocktutor` — passed.
- `pnpm run build:tocktutor` — passed; generated release payloads and manifest rebuilt, not hand-edited.
- `pnpm run typecheck:tocktutor` — passed.
- `pnpm run test:tocktutor` — completed with passing package and component suites; includes parity validation and packed Loader checks. The shell call hit its 120-second foreground timeout, but the tracked process continued and was awaited through completion before root checks were rerun.
- `pnpm run typecheck` — passed.
- `pnpm test` — final serial-after-workspace run: 1,514 passed, 17 skipped, zero failed (1,531 total). The initial overlapping run observed one temporary unbundled generated client during a nested rebuild; the rerun after all nested builds finished passed. This was a verification scheduling race, not counted as a product finding.
- `pnpm run build` — passed.
- `node scripts/stage-dsh.mjs --quick` — passed.
- `node scripts/tocktutor-build-manifest.mjs --check` — passed.

## Real Desktop Evidence

`main.cjs` boots the real built Desktop with a disposable vault, isolated application data, built-in dark theme, no active skin, and no model calls. `verify.js` attaches through Playwright to the endpoint owned by `extended_display`; no raw Electron launch or user-app attachment is used.

`desktop-proof.json` records the checks, route, theme, geometry, and zero captured runtime errors. `verified-dark.png` shows the Summary table searched to Alpha, with one row and its finite `1e+308` summary. The extreme numeric fixture deliberately exercises overflow, not typical note content.

- Viewport: 1512 × 949 CSS pixels, device scale 2.
- PNG: 3024 × 1898 pixels, independently inspected.
- Route: `/tocktutor/Review.base`; Base table in Reading mode.
- `document.documentElement.style.colorScheme === 'dark'`.
- No skin dataset on document or body.
- Guarded non-main Sidecar display ID 17; owned root PID 34052.
- Playwright detached; `extended_display.stop` confirmed every recorded PID stopped, `remaining: []`.
- Only the named proof, fixture, harness, and screenshot files were published; no bulk screenshot refresh.

The first browser assertion used an incorrect hard-coded spelling for the rounded large number; it was corrected to the actual JavaScript numeric conversion already asserted by the unit test. The complete browser script then passed afresh.

## Limits

This is not a new exhaustive Obsidian parity audit or a performance benchmark. Native picker, microphone, print/export, installed-distribution smoke, and all-theme visual regression gates were not rerun: the changes affect only Base parser/query behavior, not native authority, packaging, CSS, or theme tokens. The normal root suite's 17 skips remain skips. Repository-wide `git diff --check` reports pre-existing trailing whitespace in user-owned `AGENTS.md`; the scoped change check is clean. A bounded YAML subset remains intentional. Existing unrelated dirty files and other sessions' work were left untouched.
