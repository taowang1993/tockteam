# Note-Menu History and Copy Path Gate

Date: 2026-09-21. This is an incremental Desktop gate, **not full note-menu parity acceptance**.

## Verified

- Real UI performed `alpha → omega → sigma`, two native undos, then two native redos. Every step saved through Desktop/Host; all six actual files matched the exact expected authored string. Frontmatter, its trailing blank line, CRLF, Unicode, bold formatting, Markdown links and `[[Destination]]` were preserved.
- Copy Path submenu and root menu have matching computed background `rgb(21, 21, 23)`, text and border. Actual pointer selection reached the main clipboard sink with the canonical active path. The sink was intercepted: this does **not** prove the OS clipboard.
- Canonical capture: `/tocktutor/Notes/%E4%B8%AD%E6%96%87%20Source.md`, Live Preview, saved `sigma` content, Properties visible and Copy Path submenu open. Built-in dark, no skin; CSS 1512 × 949, DPR 2, PNG 3024 × 1898.
- Guard run `aba9b731-612c-43aa-a2fc-9a7b8c7ede4f`, root PID 44099, extended display 11. Window filled `(1512,30,1366,994)` and remained unfocused. All 17 tracked processes stopped; none remained.
- Console: zero errors; one development Electron CSP warning, retained in `console.txt`.

## Evidence

- `copy-submenu.png`: only allowlisted screenshot published with this report.
- `proof.json`: exact raw saved-file checks and capture/cleanup metadata.
- Source review: `4fb95b69-8388-405b-83e4-728c7df86721/native-dom-history/review.md` in session artifacts; no findings.
- Focused source verification: `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/editor-search.test.ts tests/editor-adapters.test.tsx tests/route-panel-controls.test.tsx --environment jsdom` — 165 tests passed across three files (`/tmp/native-dom-history-focused.log`). Typecheck, generated builds and staging passed in the worker handoff.

## Remaining Boundaries

Ambiguous Live Preview raw/rendered mappings reject with an explicit Source-mode instruction; this is a safe limitation, not full parity. Ordinary rich-text editing remains subject to existing serializer behavior. Multi-pane isolation awaits the split-layout implementation and its own regression gate. Menu width/final groups, linked views, default-app dispatch, recoverable merge and final full-suite/parity acceptance remain pending. No staging, commit or push was performed.
