# Desktop verification — INCOMPLETE (harness-blocked)

## Final verdict
The fresh production Desktop run exercised the main Source, Live Preview, mixed-newline, history, formatting, and screenshot flows. It did **not** reach the linked ownership assertions or split-pane assertions: the verifier stopped on a strict locator error after opening the linked views. This is not a product-ready acceptance claim, but no new product/runtime failure was observed.

Evidence: `/tmp/tutor-main-integration-28-ui/evidence-corrected-final-mue3g5a1.json`
Driver: `/tmp/tutor-main-integration-28-ui/desktop-verifier.mjs`

## Fresh-run results

- **Geometry/theme/route — PASS:** CSS viewport `1512×949`, DPR `2`; built-in dark scheme; no active TockTeam skin; TockTutor mounted.
- **Source mode — PASS at byte/history level:** typed markers, Source Find/Replace All, exact replacement bytes, three grouped Undo states, three Redo states, and final exact bytes all passed.
- **Live Preview — PASS at byte/history level:** typed markers, Live Preview Find/Replace All, exact replacement bytes, grouped Undo/Redo, and final exact bytes all passed.
- **Mixed newlines — PASS:** exact replacement/Undo/Redo bytes passed and the original `CRLF`/`LF`/`CR` sequence was preserved.
- **Task/format editability — PASS for the available fixture path:** no task checkbox was present, so the labeled simple-formatting fallback preserved the authored marker and existing formatting delimiters.
- **Screenshots — PASS for reached views:** `/tmp/tutor-main-integration-28-ui/source-find-replace.png` and `live-preview-find-replace.png`, each `3024×1898` pixels. No split screenshot was reached.
- **Runtime errors — PASS:** 0 page errors, 0 console errors, 0 unexpected request failures, 0 startup failures. There were 22 classified expected `net::ERR_ABORTED` `listTree` refresh cancellations.

### Save-contract observation
The stable save proof itself worked on every reached save: all exact-byte assertions passed, and each save observation recorded one visible global active tab selected by `[role="tab"][aria-selected="true"][title="<relativePath>"]`, with its scoped `[aria-label="Unsaved"]` count at `0` (`activeTabVisible: true`, `unsavedCount: 0`). The status text was informational only and commonly read `<path> opened.…` after the watcher echo, with some observations reading `<path> saved.…`; this matches the diagnosed route contract.

The run reports 22 failed `save clears active tab Unsaved marker …` assertions, but these are verifier defects, not observed product failures. `saveAndRead()` returns `{ ready, observation, bytes }`; its final assertion incorrectly reads `inspected.tabCount`, `inspected.tabVisible`, and `inspected.unsavedCount` instead of `inspected.observation.*`. Consequently the JSON failure actuals contain only the status field even though the recorded observations show the marker count was zero. The 44 observations are duplicated (last polling observation plus final readback) for 22 save actions. Exact bytes and marker disappearance remain recorded; do not interpret these false-negative assertions as a save regression.

## Blocked linked/split coverage
`Open Linked View` successfully reached the linked-pane stage, then the driver stopped at:

```text
strict mode violation: locator('[data-linked-kind="properties"]').first().getByRole('heading', { level: 2 }) resolved to 2 elements
```

The two headings were the linked pane owner title (`Properties · Notes/Source.md`) and its inner `Properties` heading. The locator needs to target the owner title or inner heading explicitly. Because the run stopped there, Properties/Backlinks ownership after owner switching and all split-pane synchronization/history/search isolation remain **unverified**, not failed.

## Preserved artifacts and prior attempts

- Fresh evidence: `/tmp/tutor-main-integration-28-ui/evidence-corrected-final-mue3g5a1.json`
- Fresh source/live screenshots: `/tmp/tutor-main-integration-28-ui/source-find-replace.png`, `/tmp/tutor-main-integration-28-ui/live-preview-find-replace.png`
- Earlier preserved evidence remains at `/tmp/tutor-main-integration-28-ui/evidence-pre-reset-mue3cizy.json` and `/tmp/tutor-main-integration-28-ui/evidence-fresh-failure-mue3f3g0.json`.

No production source, index, generated artifact, or fixture setup was changed by the verifier. The isolated fixture was intentionally edited through the UI and the parent-owned Desktop was stopped afterward.

## Cleanup
Parent teardown proof:

- guard: `cab097b6-9a05-4cf7-8c51-b6c1465183cc`
- root PID: `53218`
- recorded PIDs: 17
- `stopped: true`, `remaining: []`

## CLI snapshot ownership
I confirm ownership of the five new repository `.playwright-cli` snapshots created by my earlier exploratory `playwright-cli snapshot` commands while diagnosing the linked-menu locator:

- `page-2026-09-23T12-35-30.413Z.yml`
- `page-2026-09-23T12-39-57.002Z.yml`
- `page-2026-09-23T12-42-00.885Z.yml`
- `page-2026-09-23T12-42-20.402Z.yml`
- `page-2026-09-23T12-42-42.292Z.yml`

The parent may relocate **only those five** to `/tmp/tutor-main-integration-28-ui`; the original 43 snapshots must remain untouched. The final bounded run used only the prepared Node driver and created no new repository snapshots.

No credentials, tokens, or full CDP endpoint were published. OS clipboard/default-app effects were not exercised or certified. Final product acceptance remains open pending a corrected linked-heading locator and a rerun of the linked/split portion.