# TockTutor Migration Implementation Review

## Scope and Method

Reviewed the image viewer/resizer, Mermaid Reading/Live Preview pipeline, and imported-property transport and controls, including their callers, lifecycle, persisted source, tests, build payloads, and prior Desktop evidence. Applied all three review references: code simplification, security/hardening, and performance. Fixes are committed in `23e2cbcb`; documentation/gallery changes follow separately.

Threat boundaries: vault Markdown/configuration and generated Mermaid output are untrusted; assets include note integrity, Obsidian settings, Desktop authority, and network privacy. Abuse cases included pasted fence delimiters escaping their code block, hostile diagrams attempting outbound resources/active SVG, image URLs bypassing Host validation, and incompatible imported YAML being coerced. Existing opaque-frame/CSP/passive-image, fixed-path/no-follow/exact-revision property reads, and resolved-byte image boundaries remain intact. No new dependency or authority was added.

## Confirmed Findings — 5, All Fixed

1. **[P1] A Mermaid edit could be saved into the wrong duplicate fence.** `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/live-preview-editor-runtime.tsx`, `preserveMermaidFenceEdit`: the editor counted uppercase `Mermaid` fences, but the source scanner counted only exact lowercase three-character openings. Editing the first of two identical diagrams could therefore change the second. **Fixed:** recognize case/length/spacing variants and reparse the proposed splice to verify every resulting code block against the intended editor document. **Verified:** failing-before/passing-after uppercase-duplicate regression; existing duplicate, CRLF, and nested-example regressions; real Desktop uppercase-fence edit with exact saved bytes and reopen.

2. **[P1] Pasted closing delimiters could escape a Mermaid code block.** Same path/function: inserting a standalone closing fence into the code editor was spliced verbatim between unchanged delimiters; reopening converted part of the code to ordinary note content and consumed following text as another code block. **Fixed:** lengthen both delimiters when necessary and reject a splice whose reparsed code blocks differ. **Verified:** failing-before/passing-after save/reopen component regression containing a literal closing delimiter.

3. **[P2] Quick image resizes merged into one Undo action.** Same path, image-resize commit callback: successive commits used ordinary adjacent history transactions, so one Undo reverted both widths. **Fixed:** close the native history group before and after each explicit resize. **Verified:** failing-before/passing-after rapid-resize regression; guarded Desktop 200 → 240 → 280 → Undo restored 240, saved/reopened, with exact note bytes and unchanged neighboring image/caption.

4. **[P2] Imported null values lost their declared property controls.** `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/properties.ts`, `parseFrontmatterProperties`: `null`/`~` inferred as mixed and returned before imported type compatibility could admit empty values. **Fixed:** retain the declared type for null values without admitting structured/incompatible values. **Verified:** failing-before/passing-after parser check; linked-pane/header tests for both empty and null dates; guarded Desktop null date/checkbox edited, saved, and reopened with an unchanged `.obsidian/types.json`.

5. **[P2] Finite exponent-form numbers stopped being numeric properties after save.** Same path, `scalar`: the writer and number input accepted finite values that JavaScript emits as exponent notation, but the reader admitted only decimal notation. **Fixed:** parse finite exponent-form numeric scalars, preserving quoted text and nonfinite rejection. **Verified:** regression checks include `1e21`, `-1e-7`, `Number.MAX_VALUE`, and `Number.MIN_VALUE`; real Desktop opened `1e-7`, saved `1e+21`, and reopened its Number control.

## Fresh Verification

- `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/image-resize.test.tsx tests/image-viewer.test.tsx tests/mermaid-browser.test.tsx tests/mermaid-renderer.test.tsx tests/editor-adapters.test.tsx tests/route-linked-panes.test.tsx --environment jsdom` — 154 tests passed.
- `node --test --test-name-pattern='null values' plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/properties.test.ts` — passed.
- `pnpm run typecheck:tocktutor`, `pnpm run test:tocktutor` (740 Workbench component tests, plus other nested suites), `pnpm run build:tocktutor`, and `node scripts/tocktutor-build-manifest.mjs --check` — passed.
- `pnpm run typecheck`, `pnpm test` (1,575 passed, 18 skipped, zero failures at the implementation gate), `pnpm run build`, and `node scripts/stage-dsh.mjs --quick` — passed. Concurrent Raycast work explains the increase from the earlier root count; its files were not changed by this review.
- Guarded Desktop, isolated copied fixture vault, owned Playwright/CDP: viewer fit/zoom/pan/Escape/focus return; two resizes and one Undo; seven Mermaid diagrams in Reading and Live Preview; source activation and uppercase-fence save/reopen; imported empty/number controls and Source Mode fallback. Exact saved `Images.md`, `Properties.md`, and `Diagrams.md` bytes were asserted against fixture plus intended changes; `.obsidian/types.json` remained identical.
- Six allowlisted gallery screenshots: 1512 × 949 CSS pixels, DPR 2, 3024 × 1898 PNGs, built-in dark, no skin on root/body. Capture-time console/pageerror monitors and final session console check reported zero errors; Mermaid checks observed no external requests. Captures were validated before publication. `content-alignment.json` binds hashes, routes, modes, note-content hashes, and capture states.
- `node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts` — 11 passed, including capture hashes, geometry, fixture-to-saved-note hashes, new surface navigation, and honest reference labels.
- Final `pnpm test` after gallery reconciliation — 1,577 passed, 18 skipped, zero failures.
- Guarded generic Electron rendered the local gallery: all five new surfaces and six images loaded, screenshot links had keyboard focus, two columns fit at 1512 pixels, and the layout became one column without horizontal overflow at 800 pixels. Zero console/page errors. Gallery screenshot: `2026-09-29-tocktutor-migration-gallery.png` (3024 × 1898).
- Playwright sessions detached; guarded Desktop root PID 15846 and generic gallery root PID 22296 each had their full recorded process tree stopped, `remaining: []`.

## Gallery and Documentation

Updated `.agents/references/tocktutor.md` with feature ownership, supported controls, security limits, persistence behavior, and deliberate limitations. Added Surfaces 25–29 and six screenshots to `.agents/uiux/tocktutor/tocktutor.html`, preserving existing Obsidian image bytes and identifying the new images as TockTutor-only feature evidence. Reproducible fixture inputs live under `migration-fixtures/`; gallery counts and allowlists are updated together.

## Limitations and Non-Findings

- General Live Preview serialization is not lossless; unsupported fence mappings and edits outside the supported single-fence path still use Milkdown formatting. The reference and gallery explicitly state this boundary. Static export remains narrower than browser Mermaid rendering.
- This pass did not repeat the prior all-skin appearance matrix: fixes change source/history/type behavior, not theme styling. New canonical captures verify dark/no-skin. Existing appearance evidence remains in `2026-09-29-tocktutor-mermaid-appearance-proof.md`.
- React Doctor's initial diff scan timed out. A bounded retry against HEAD scanned nine files with no lint findings, but maintainability analysis failed nonfatally and no score was available. This is incomplete tool evidence, not a confirmed product bug. Manual simplification/security/performance review and the runnable gates above were completed. No fresh external dependency-vulnerability audit was run; this patch changes no dependency.
- No installed-package/native launcher smoke was repeated: these changes do not alter Electron/IPC/packaging. The real source-built Desktop was verified; this is not a claim of a fresh installed-release gate.
