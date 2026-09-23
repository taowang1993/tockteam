# Desktop verification — INCOMPLETE (linked-switch gate stopped)

## Verdict
The fresh production Desktop run reached all core editing, save, history, formatting, screenshot, and initial linked-owner checks. **All 85 recorded assertions passed** and no runtime errors occurred. The run is not a product-ready acceptance because it stopped while reading the Source-bound linked heading after switching the owner to Destination; split-pane coverage was therefore not reached.

Evidence: `/tmp/tutor-main-integration-28-ui/evidence-final-linked-switch-mue3h7d8.json`
Driver: `/tmp/tutor-main-integration-28-ui/desktop-verifier.mjs`

## Passed observations

- Geometry: `1512×949` CSS pixels, DPR `2`.
- Appearance: built-in dark color scheme, no active TockTeam skin.
- Route: TockTutor mounted; final route reached `/tocktutor/Notes/Destination.md`.
- Source mode: typing, Find/Replace All, exact authored bytes, grouped Undo/Redo, and final history state passed.
- Live Preview: typing, Find/Replace All, exact authored bytes, grouped Undo/Redo, and final history state passed.
- Mixed Source: exact replacement/Undo/Redo bytes and preservation of the original `CRLF`/`LF`/`CR` sequence passed.
- Task/format path: the fixture had no task checkbox, so the labeled simple-formatting fallback passed without changing existing formatting delimiters.
- Save proof: every reached save had exact expected bytes, one visible global active tab selected by `[role="tab"][aria-selected="true"][title="<relativePath>"]`, and zero scoped `[aria-label="Unsaved"]` markers. Status text was informational and commonly showed `<path> opened.…` after the watcher echo, with some `<path> saved.…` observations.
- Initial linked ownership: exact headings `Properties · Notes/Source.md` and `Backlinks · Notes/Source.md` were found, marked `Bound`, and their assertions passed.
- Screenshots: source and Live Preview PNGs passed exact `3024×1898` geometry:
  - `/tmp/tutor-main-integration-28-ui/source-find-replace.png`
  - `/tmp/tutor-main-integration-28-ui/live-preview-find-replace.png`
- Runtime evidence: 0 page errors, 0 console errors, 0 unexpected request failures, 0 startup failures. The 22 `net::ERR_ABORTED` `listTree` refreshes were classified expected cancellations.

## Exact stopped observation

After switching the owner to Destination, the verifier attempted to read the still-expected Source-bound title using the exact locator:

```text
locator('[data-linked-kind="properties"]').first().getByRole('heading', { name: 'Properties · Notes/Source.md', exact: true })
```

It timed out after 8 seconds at driver line 510:

```text
locator.textContent: Timeout 8000ms exceeded
```

This proves only that the exact Source-bound heading was not available to that locator at read time. It does **not** by itself distinguish a linked-view rebind/product behavior from a DOM timing or locator-contract issue; no post-switch heading text was captured, so no product failure is claimed. The exact Destination owner title, global active-tab title `Notes/Destination.md`, route assertion, post-switch linked ownership assertions, and all split-pane synchronization/history/search assertions remain **unverified**. No split screenshot was reached.

## Preserved artifacts

- Current fresh evidence: `/tmp/tutor-main-integration-28-ui/evidence-final-linked-switch-mue3h7d8.json`
- Current source/live screenshots: `/tmp/tutor-main-integration-28-ui/source-find-replace.png`, `/tmp/tutor-main-integration-28-ui/live-preview-find-replace.png`
- Prior evidence remains preserved at `/tmp/tutor-main-integration-28-ui/evidence-corrected-linked-mue3h6c2.json`, `/tmp/tutor-main-integration-28-ui/evidence-corrected-final-mue3g5a1.json`, `/tmp/tutor-main-integration-28-ui/evidence-pre-reset-mue3cizy.json`, and `/tmp/tutor-main-integration-28-ui/evidence-fresh-failure-mue3f3g0.json`.

No production source, index, or generated artifact was changed. The isolated fixture was intentionally edited through the visible UI. No additional exploratory execution occurred after this bounded run.

## Cleanup

Parent teardown proof:

- guard: `f8ba65a8-13c1-4ce1-8efb-ea523d095ed6`
- root PID: `63579`
- recorded PIDs: 24
- `stopped: true`, `remaining: []`

## CLI snapshot ownership

The parent relocated only the five CLI snapshots I previously confirmed owning into `/tmp/tutor-main-integration-28-ui`; the original 43 snapshots were untouched. The final bounded run used only the prepared Node driver and created no repository snapshots.

No credentials, tokens, or full CDP endpoint were published. OS clipboard/default-app effects were not exercised or certified. Do not claim product readiness until the linked switch is independently resolved and the split-pane portion completes.