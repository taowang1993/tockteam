# Desktop verification — BLOCKED / NOT PRODUCT-READY

## Final verdict
The final independent fresh Desktop gate is **INCOMPLETE**, not a product-ready acceptance pass. The corrected driver reached the real TockTutor route and exact appearance gate, then stopped at its first save gate. The stop is a **harness-contract false negative, not evidence of a product save regression**: the driver required transient `/saved./` text that is not the stable UI contract. No repository, index, generated, or untracked files were modified.

## Fresh final run
Evidence: `/tmp/tutor-main-integration-28-ui/evidence-fresh-failure-mue3f3g0.json`
Driver: `/tmp/tutor-main-integration-28-ui/desktop-verifier.mjs`

| Check | Result | Observation |
|---|---|---|
| Desktop geometry | PASS | `1512×949` CSS, DPR `2` |
| Theme/security appearance | PASS | `style.colorScheme` and computed scheme `dark`; no `data-tockteam-skin` |
| TockTutor route | PASS | `/tocktutor` → `/tocktutor/Editable.md` |
| Editable fixture | PASS | repeated authored target `alpha` found |
| First UI save gate | **HARNESS BLOCK** | Real keyboard `Meta+S` was issued after real Source typing and the exact typed bytes persisted. The driver incorrectly waited for transient `/saved./` text plus bytes and timed out. After teardown, the isolated file was 66 bytes, SHA-256 `b302f228d88259e9c63396520a7e49f5fc4434db64f73ea88e4bdebfaa130e1e`. The route watcher intentionally reloads saved notes and can change the visible message back to `<path> opened.` while `saveStatus` remains saved; the stable proof should be exact bytes plus disappearance of `span[aria-label="Unsaved"]`. |
| Page errors | PASS | 0 |
| Console errors | PASS | 0 |
| Unexpected request failures | PASS | 0; one expected aborted `listTree` refresh was recorded separately |
| Screenshots | NOT REACHED | none from the fresh final run |

The fresh run’s baseline status was `Editable.md opened. … Source … 4 words … 29 characters`; its only authored operation was typing `TUTOR_SOURCE_BEFORE_desktop-mue3mtnx` before the harness-contract timeout. The observed post-stop file bytes were read only from the isolated fixture vault. Do not interpret this timeout as a save failure: the parent diagnosis confirms the exact marker was persisted, and the route watcher may replace the transient saved message with `opened.`.

## Preserved prior bounded run (not final acceptance)
Evidence: `/tmp/tutor-main-integration-28-ui/evidence-pre-reset-mue3cizy.json`
Screenshots: `/tmp/tutor-main-integration-28-ui/pre-reset-source-find-replace.png`, `/tmp/tutor-main-integration-28-ui/pre-reset-live-preview-find-replace.png`

This run was preserved, not hidden. It used the real production Desktop and passed these representative UI/file checks before a harness locator failure:

- Source CodeMirror: typed before/after, Find/Replace All, three grouped Undo and three Redo states; exact saved bytes passed.
- Live Preview CodeMirror: same flow; exact saved bytes passed.
- Mixed Source: Replace All plus Undo/Redo preserved exact bytes and the full mixed `CRLF`/`LF`/`CR` sequence.
- Source note Live Preview editing preserved Markdown formatting delimiters without serialization; task checkbox was absent, so the explicitly labeled simple-formatting fallback was used.
- Geometry and screenshot PNG dimensions passed (`3024×1898` each), dark/no skin passed, and page/console errors were zero.

It does **not** certify split-pane history/search isolation or linked Properties/Backlinks. The run stopped because the earlier driver clicked the visible utility `Properties` item instead of scoping the `Open Linked View` submenu. Its three save-status failures were preserved: that driver returned as soon as disk bytes changed, before waiting for the UI acknowledgment. The corrected driver fixed that timing and the submenu scope but still encoded the wrong stable-save contract by requiring persistent `/saved./` text. The fresh run therefore stopped before reaching those flows; a future verifier should use exact authored bytes plus disappearance of the visible `Unsaved` indicator, not persistent status text.

## Cleanup
Parent-owned teardown was completed immediately after the fresh failure:

- guard: `1bddf1b5-b486-4a8e-993d-da3ec5d6807f`
- root PID: `48201`
- recorded descendants: 10
- `stopped: true`, `remaining: []`

OS clipboard/default-app effects were not exercised/certified. No credentials, tokens, or full CDP endpoint were published. Fresh Desktop acceptance remains open because the final independent run did not reach the requested complete flow.