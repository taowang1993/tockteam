# Desktop verification — PASS

## Final result
The fresh isolated production Electron Desktop gate passed: **98 assertions, 98 passed, fatal null**, with no page errors, console errors, unexpected request failures, or startup failures.

Evidence: `/tmp/tutor-main-integration-28-ui/evidence-final-pass-mue4l4s0.json`
Driver: `/tmp/tutor-main-integration-28-ui/desktop-verifier.mjs`

## Environment and appearance

- CSS viewport: `1512×949`; DPR: `2`.
- Built-in dark theme: style and computed color scheme both `dark`.
- TockTeam skin: absent (`null`, no skin attribute).
- TockTutor route mounted; final route reached `/tocktutor/Notes/Destination.md`.
- Request evidence: 0 unexpected/startup failures; 23 classified expected `net::ERR_ABORTED` `listTree` refresh cancellations.

## Verified UI flows

- **Source mode:** typed markers, UI Find/Replace All, exact authored bytes, grouped Undo/Redo, and final history state.
- **Live Preview:** typed markers, UI Find/Replace All, exact authored bytes, grouped Undo/Redo, and final history state.
- **Mixed newline preservation:** exact replacement/Undo/Redo bytes passed; original `CRLF`/`LF`/`CR` sequence remained unchanged.
- **Task/format editability:** fixture had no task checkbox, so the explicitly labeled simple-formatting fallback preserved the authored marker and existing formatting delimiters.
- **Save proof:** 23 save actions (46 retained observations) all had exact expected bytes, exactly one visible global active tab selected by `[role="tab"][aria-selected="true"][title="<relativePath>"]`, and zero scoped `[aria-label="Unsaved"]` markers. Status text was recorded informationally; watcher echoes commonly displayed `<path> opened.…`, with some `<path> saved.…` observations.

## Pinned linked-view ownership

The verifier opened Properties and Backlinks through the visible note menu and first confirmed exact Source headers:

- `Properties · Notes/Source.md`, bound.
- `Backlinks · Notes/Source.md`, bound.

It then clicked the visible Properties `Pin` control and confirmed both linked panes exposed `Unpin` with `aria-pressed="true"`. With that explicit pinned-bound precondition, it opened Destination and verified:

- visible owner title exactly `Destination` using `.tocktutor-editor-header h2`;
- global active tab title exactly `Notes/Destination.md`;
- route exactly `/tocktutor/Notes/Destination.md`;
- both pinned linked panes retained their exact Source headers and bound ownership.

This is specifically proof for **pinned bound views retaining Source while the owner opens Destination**; it makes no claim about unpinned navigation.

## Split-pane verification

- Split Right mounted two owner panes.
- Peer edits synchronized to both panes.
- A peer edit cleared stale Undo history as expected.
- Left and right Find UIs were isolated to their respective panes.
- Exact authored peer bytes were saved and both markers were present.
- Both panes shared final content.
- Split screenshot passed exact geometry.

## Screenshots

All screenshots are PNGs at the required `3024×1898` device-pixel geometry:

- Source mode: `/tmp/tutor-main-integration-28-ui/source-find-replace.png` (`3024×1898`, 123189 bytes).
- Live Preview mode: `/tmp/tutor-main-integration-28-ui/live-preview-find-replace.png` (`3024×1898`, 134518 bytes).
- Source split-pane mode with pane-local Find: `/tmp/tutor-main-integration-28-ui/split-peer-find.png` (`3024×1898`, 120529 bytes).

## Preserved prior failures

Earlier attempts remain preserved and were not overwritten:

- `/tmp/tutor-main-integration-28-ui/evidence-final-linked-switch-mue3h7d8.json` — Source-bound linked heading unavailable after unpinned owner switch.
- `/tmp/tutor-main-integration-28-ui/evidence-corrected-linked-mue3h6c2.json` — ambiguous generic Destination heading.
- `/tmp/tutor-main-integration-28-ui/evidence-corrected-final-mue3g5a1.json` — save assertion field-shape defect and linked locator stop.
- `/tmp/tutor-main-integration-28-ui/evidence-pre-reset-mue3cizy.json` — earlier contaminated-fixture attempt.
- `/tmp/tutor-main-integration-28-ui/evidence-fresh-failure-mue3f3g0.json` — earlier transient save-status contract attempt.

The final pass used the corrected driver and a fresh isolated fixture. No production source, index, generated artifact, or repository source was changed.

## Cleanup

Parent teardown proof:

- guard: `51df988a-5e9c-4726-8c6c-e5bbade062a2`
- root PID: `68522`
- recorded PIDs: 24
- `stopped: true`, `remaining: []`

## Limitations and ownership notes

- Clipboard, default-app, Finder, and other native OS effects were not exercised or certified.
- The five exploratory CLI snapshots previously confirmed as mine were relocated to `/tmp/tutor-main-integration-28-ui`; the original 43 snapshots were untouched. The final bounded run used only the prepared Node driver and created no repository snapshots.
- No credentials, tokens, or full CDP endpoint were published.