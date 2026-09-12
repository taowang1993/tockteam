# FEATURE WORKS — independent real-Electron recheck

All requested functional checks passed. The earlier expectation that a content match preserve Live Preview was incorrect; observed content navigation correctly uses Source.

## Observations

| Check | Actual result |
|---|---|
| Recent-note pointer selection, Welcome → Result | Clicked exact option `Open Result.md` in Recent Notes. Result opened in **Live Preview**; `document.activeElement.matches('.ProseMirror') === true`. |
| Filename pointer selection, Welcome → Result | Query `Result.md` produced one visible option `Open Result.md`, text `Result / PathResult.md`. Pointer click opened Result in **Live Preview**, focused `.ProseMirror`. |
| Content Enter, Welcome → Result | Random marker query produced one selected visible option `Open Result.md`, text `Result / 3: Bodyfocus-proof-8edb3413-6cb2-4cbf-86d9-bac9f5a91c9a`. Verified query input focus before Enter. Result opened in **Source**, focused `.cm-content`. |
| Same-note content Enter, twice | Reopened search while Result was already active in Source; filled the same marker twice. Each iteration waited for the exact visible result option containing the line-3 marker and query input focus, and recorded `aria-selected=true` before Enter. Both returned focus to `.cm-content` in Source. |
| Escape | Opened via Search Notes button, waited for query focus, pressed Escape. Query disappeared; active element was the **Search Notes opener button**. |
| Tag filter | `tag:project` returned exactly **one visible option**, `Open Result.md`, with `5: Body#project`; status reported `1 note · 1 match`. |

Focus checks polled for the required active element for up to 2 seconds; all passed immediately when inspected after the CLI action completed. This does not establish sub-millisecond end-to-end latency. A captured focusin timeline also shows the recent-note click passing through closing-dialog focus before reaching ProseMirror.

## Evidence

All diagnostic artifacts are under `/tmp/tockteam-pr-proof.dRtsfw/recheck/`:

- `recent-focus.json`, `filename-focus.json`, `content-ready.json`, `content-focus.json`, `same-note-1.json`, `same-note-2.json`, `escape-focus.json`, `tag-query.json`.
- `focus-timeline.json`: accumulated focusin events plus content-Enter action/readiness records.
- `filename-live-preview.png`: Result visible in Live Preview with editor caret.
- `content-source.png`: Result visible in Source after the two same-note activations.
- `runtime-errors.txt`, `console.txt`: both empty; the attached driver reported no captured runtime errors/console messages during this session. This is not a claim about pre-attachment logs.
- `driver-doctor.txt`: named-driver cleanup diagnostics.

Both screenshots were opened and visually inspected. Actual geometry: **1280 × 840 CSS pixels, DPR 2, 2560 × 1680 PNG pixels**. Actual appearance: **light**, no `data-tockteam-skin`. Actual route: `http://127.0.0.1:52649/tocktutor/Result.md`. As explicitly directed mid-run, these are functional diagnostic evidence only, **not canonical parity/gallery publication**. Parent-owned video recording was not controlled by this verifier.

## Method and limitations

Connected only named agent-browser session `pr-search-recheck` to parent-owned CDP port 52639. Selected the actual HTTP renderer and entered TockTutor via its application navigation button. Used exact semantic options and CSS readiness checks, not stale dialog refs or background tab text.

Two verifier selector mistakes caused waits to time out, not product failures: initially guessed an option accessible name containing `at line 3` (actual name is simply `Open Result.md`), and initially expected tag option text to contain `Tag` (actual snippet is `5: Body#project`). Corrected using live snapshots and exact visible option inspection before recording verdicts.

Accepted the visible Internal Testing Notice. An early attempt to click the unrelated onboarding `Configure later` button was refused by the driver because TockTutor covered it; no click landed. No subsequent onboarding/provider interaction, credentials, provider requests, OS input, app launch/stop, or repository edits were performed. Parent supplied source identity `ec404398`; this was not independently rebuilt or audited. Repository source was not browsed.

Temporary renderer focus tracing was removed. Closed only the named externally attached driver, then ran `agent-browser doctor --offline --quick` (no browser launch probe). Verified parent Electron PID **72909 remained alive** afterward. Full app/recorder/process-tree cleanup remains parent-owned.
