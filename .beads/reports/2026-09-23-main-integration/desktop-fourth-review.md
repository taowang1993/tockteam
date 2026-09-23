# Desktop verification — INCOMPLETE (verifier-blocked)

## Verdict
The fresh production Desktop gate reached all core editing/save/history checks and both linked views. **All 85 recorded assertions passed.** The run is not a product-ready acceptance because the verifier then stopped on one remaining ambiguous heading locator before linked-owner switching and split-pane checks. No real product/runtime failure was observed.

Evidence: `/tmp/tutor-main-integration-28-ui/evidence-corrected-linked-mue3h6c2.json`
Driver: `/tmp/tutor-main-integration-28-ui/desktop-verifier.mjs`

## Passed observations

- Geometry: `1512×949` CSS pixels, DPR `2`.
- Appearance: built-in dark color scheme, no active TockTeam skin.
- Route: TockTutor mounted; final route reached `/tocktutor/Notes/Destination.md`.
- Source mode: typing, Find/Replace All, exact authored bytes, grouped Undo/Redo, and final history state passed.
- Live Preview: typing, Find/Replace All, exact authored bytes, grouped Undo/Redo, and final history state passed.
- Mixed Source: exact replacement/Undo/Redo bytes and preservation of the original `CRLF`/`LF`/`CR` sequence passed.
- Task/format path: the fixture had no task checkbox, so the labeled simple-formatting fallback passed without changing existing formatting delimiters.
- Save proof: every reached save had exact expected bytes, one visible global active tab selected by `[role="tab"][aria-selected="true"][title="<relativePath>"]`, and zero scoped `[aria-label="Unsaved"]` markers. The recorded status was informational and commonly showed `<path> opened.…` after the watcher echo, with some `<path> saved.…` observations.
- Source and Live Preview screenshots passed exact `3024×1898` PNG geometry:
  - `/tmp/tutor-main-integration-28-ui/source-find-replace.png`
  - `/tmp/tutor-main-integration-28-ui/live-preview-find-replace.png`
- Runtime evidence: 0 page errors, 0 console errors, 0 unexpected request failures, 0 startup failures. The 22 `net::ERR_ABORTED` `listTree` refreshes were classified expected cancellations.

## Exact verifier failure
The run opened Properties and Backlinks and passed both exact Source-owner assertions:

- `Properties · Notes/Source.md` was bound and marked `Bound`.
- `Backlinks · Notes/Source.md` was bound and marked `Bound`.

After switching the owner to Destination, the corrected exact-name locator still matched two headings in the owner pane and stopped:

```text
locator('[data-pane-id]:not([data-linked-kind])').first().getByRole('heading', { name: 'Destination', exact: true }) resolved to 2 elements:
1) <h2>Destination</h2> (owner title)
2) <h1>Destination</h1> (Live Preview content heading)
```

This is a verifier locator defect, not a product assertion failure. The owner title must be scoped to the pane title `h2` (or its title-specific class), while the Live Preview content heading remains a separate `h1`. Because execution stopped there, the exact Destination active-tab/title/route identity assertion, linked ownership after switching, split-pane synchronization/history/search isolation, and split screenshot remain **unverified**.

## Preserved artifacts

- Current fresh evidence: `/tmp/tutor-main-integration-28-ui/evidence-corrected-linked-mue3h6c2.json`
- Prior corrected-run evidence: `/tmp/tutor-main-integration-28-ui/evidence-corrected-final-mue3g5a1.json`
- Earlier preserved evidence: `/tmp/tutor-main-integration-28-ui/evidence-pre-reset-mue3cizy.json` and `/tmp/tutor-main-integration-28-ui/evidence-fresh-failure-mue3f3g0.json`

No production source, index, or generated artifact was changed. The isolated fixture was intentionally edited through the visible UI. No additional exploratory execution occurred after this bounded run.

## Cleanup

Parent teardown proof:

- guard: `0f992ed7-a6a7-47ca-973e-1e0c99789c80`
- root PID: `58551`
- recorded PIDs: 24
- `stopped: true`, `remaining: []`

## CLI snapshot ownership

I confirmed ownership of these five repository `.playwright-cli` snapshots from earlier exploratory CLI snapshots used to diagnose the linked-menu locator; the parent relocated only these five into `/tmp/tutor-main-integration-28-ui`:

- `page-2026-09-23T12-35-30-413Z.yml`
- `page-2026-09-23T12-39-57-002Z.yml`
- `page-2026-09-23T12-42-00-885Z.yml`
- `page-2026-09-23T12-42-20-402Z.yml`
- `page-2026-09-23T12-42-42-292Z.yml`

The original 43 snapshots were not touched. The final bounded run used only the prepared Node driver and created no repository snapshots.

No credentials, tokens, or full CDP endpoint were published. OS clipboard/default-app effects were not exercised or certified. Do not claim product readiness until the owner-title locator is corrected and the linked/split portion completes.