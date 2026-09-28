# Base View Review

## Scope and Verdict

Snapshot review of TockTutor Base parsing, authoring, hydration/querying, formula execution, editable cells, export, and mounted route ownership. Read `.agents/references/tocktutor.md` first. Applied all three mandatory review references: simplification, security/hardening, and performance. A separate read-only reviewer examined parser/evaluator paths; the parent reproduced and fixed its findings and reviewed the final changes.

**8 confirmed findings; all 8 fixed and regression-tested.** Relevant builds, typechecks, tests, and a real isolated Desktop flow passed. React Doctor's optional maintainability analysis remains incomplete (see limitations).

Paths in the findings are relative to `plugins/tocktutor/packages/tockteam-tocktutor-workbench/`.

## Confirmed Findings and Fixes

1. **P1 — View configuration could save into the wrong Base.** `src/route.tsx`: a view-name blur after split-pane focus moved could save into an identically sourced sibling Base. Navigating to another Base also retained the old configuration input. Fixed by guarding source callbacks with exact pane/document ownership and remounting Base controls on vault generation/path changes. `tests/route-split-panes.test.tsx` reproduced writes to `Second.base` before the fix; both focus-change and navigation cases now prove no unintended write.

2. **P1 — View edits could overwrite unrelated YAML.** `src/base-authoring.ts`: a global `- name:` scan treated an entry in an unrelated `metadata:` section as a view. Changing sort to the current value could overwrite metadata and still pass the final validation. Fixed by bounding the scan to `views:` and matching the parser's bare-dash view form. `tests/base-authoring.test.ts` verifies exact preserved bytes; the Desktop proof also confirms untouched metadata after sort and rename.

3. **P1 — Regular expressions could freeze the consumer.** `src/NotesBaseFormulaRegex.ts`: adjacent admitted repetitions such as `/^\d+\d+\d+\d+\d+\d+X$/` bypassed the pattern-length × input-length budget and caused native backtracking. The isolated reproduction with 100 digits exceeded its two-second process timeout before the fix. Matching, replacement, and splitting now share a conservative repetition-aware work bound before native evaluation. The timeout-isolated regression in `tests/base-formula-port.test.ts` now completes successfully and rejects all three forms.

4. **P1 — Malformed restrictions could silently show all notes.** `src/base-parser.ts`: quoted top-level filter keys and malformed unindented filter content were ignored, leaving an unrestricted query. Duplicate sections/view fields were also accepted ambiguously. The bounded parser now rejects unconsumed top-level/view syntax and duplicate sections/view fields. `tests/base-executable-port.test.ts` verifies seven malformed or ambiguous cases fail closed. Unsupported syntax remains available as source; it is not rewritten.

5. **P1 — Object-to-text formulas could crash a Base.** `src/NotesBaseFormula.ts`: `upper(file.properties)` called `String()` on a null-prototype object and threw; lower/length/concat/contains shared the path. The common conversion now catches invalid conversions and bounds the output, with callers propagating unsupported results. `tests/base-executable-port.test.ts` covers all affected global functions, including a list containing an object. No error-swallowing wrapper was added around the entire evaluator.

6. **P2 — The mounted view omitted its own file context.** `src/route.tsx`: `this.file.folder` and `this.file.name` worked in isolated model calls but not through the route. The route now supplies the current Base path and available tree timestamps/size. `tests/route-panel-controls.test.tsx` and the Desktop proof verify a folder filter excludes an unrelated note and a formula displays `Projects.base`.

7. **P2 — Valid source without a final newline could not be configured.** `src/base-authoring.ts`: all source-authoring controls refused such files; CRLF edits could mix line endings. Authoring now preserves the file's line-ending convention and final-newline presence. `tests/base-authoring.test.ts` covers rename and append for LF/CRLF with and without a final newline. The Desktop flow saved an initially newline-less Base and verified its exact resulting bytes.

8. **P2 — Numeric summaries could publish infinity.** `src/NotesBaseFormula.ts`: averaging two `1e308` values overflowed the intermediate sum even though the answer was representable. Average now scales values before accumulation; sum rejects nonfinite results. `tests/base-formula-port.test.ts` covers positive/negative extremes, cancellation, overflowing sums, and the smallest positive representable value.

## Verification

Failing regressions were run before each corresponding fix. Fresh completion checks, all exit 0 unless explicitly noted:

```sh
pnpm run install:tocktutor
node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/base-formula-port.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/base-executable-port.test.ts
node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/base-authoring.test.ts
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/route-split-panes.test.tsx tests/route-panel-controls.test.tsx --environment jsdom -t 'identically sourced|evaluates this.file'
pnpm run typecheck:tocktutor
pnpm run test:tocktutor
pnpm run build:tocktutor
pnpm -C plugins/tocktutor run validate:parity
node scripts/tocktutor-build-manifest.mjs --check
pnpm run typecheck
pnpm test
pnpm run build
node --test tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts
pnpm --filter @tockteam/ui run typecheck
```

- Full nested suite: **1,838 passed**, including 403 Workbench node tests and 694 Workbench component tests.
- Root suite: **1,514 passed, 17 skipped, 0 failed**.
- Shared UI contract checks: **7 passed**.
- Tracked Workbench release outputs and `plugins/tocktutor/build-manifest.json` were regenerated, not hand-edited.
- Own changed paths pass `git diff --check`. An existing whitespace issue in user-owned `AGENTS.md` was left untouched.

## Desktop Evidence

Used `extended_display.launch` with generic Electron, an isolated profile and disposable vault, then attached Playwright only to the returned owned loopback CDP endpoint. No user profile or main-display fallback was used. The fixture, entry, and interaction script are retained as `fixture/`, `main.cjs`, and `verify.js`; the entry's temporary fixture path is `/tmp/tocktutor-base-review`.

`desktop-proof.json` records the exact route, geometry, appearance, results, saved-byte assertions, and cleanup. `verified-dark.png` is the only published screenshot: **1512 × 949 CSS pixels at 2×**, producing **3024 × 1898 pixels**, built-in dark theme with no active skin. It shows the renamed **Reviewed** view, exactly one filtered note, saved `verified` status, and the owning Base filename. Search empty-state and Escape restoration were exercised. No page/console errors occurred during the checked flow; startup had one warning, not an error.

The owned Electron root PID was **97773**. `extended_display.stop` confirmed every recorded descendant stopped and `remaining: []`. Screenshot publication used an explicit allowlist and atomic rename after geometry and persisted-byte checks.

## Limitations, Not Confirmed Bugs

- React Doctor's default `--diff` run timed out. The bounded local rerun (`react-doctor . --verbose --scope changed --base HEAD --no-supply-chain --no-score --max-duration 60`) reported no new issues in 18 files, but maintainability analysis failed non-fatally. This is incomplete tool evidence, not a clean full score; no score-regression claim is made.
- The Desktop proof covers the affected Base workflow in canonical dark, not every theme/skin or every formula. No styling/token changes were made. Split-pane/navigation races are covered by mounted component/controller regression tests rather than an additional screenshot.
- Full installed-distribution/native release smokes were not run: these fixes do not change Electron authority, packaging, IPC, or native operations. The real Desktop flow supplements, rather than replaces, package/unit tests.
- Map remains a read-only coordinate-label projection. Regex rejection is deliberately conservative. These existing/explicit boundaries are documented, not advertised as broader parity.
