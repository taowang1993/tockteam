# Can I Use Detail and Browser-Action Checkpoint

The candidate now renders the unchanged upstream FeatureDetail component from one Host-selected, bounded support table. The private child can only invoke a captured root Push after receiving a context/revision-checked detail packet; ordinary child actions and native requests remain denied. Main binds published actions to the held registry and reconstructs `https://caniuse.com/<slug>` from its selected feature, never from renderer/source URL text.

Root and detail actions, authenticated Back, old/foreign/forged handles, concurrent browser invocations, browser failure recovery, and child/group cleanup are exercised by the real manager test. The source adapter retains existing date-free detail projections and separately exposes only the selected feature's exact support-threshold date keys to the unchanged component. Closed detail decoding rejects extra fields, unselected features, foreign contexts, replay, oversized input, duplicates, and malformed flags/dates.

The finite renderer now shows accessible support icons, the feature title, browser counts, authenticated Back, and correct keyboard focus. New Can I Use snapshots clear superseded action busy state; browser outcomes retain count disclosure. Existing Translate and Kaomoji behavior remains covered.

## Verification

Using Node 24.20.0 with `/opt/homebrew/opt/node@24/bin` prepended to `PATH`:

```sh
node --test tests/trusted-raycast-can-i-use-data.test.mjs
node --test --test-concurrency=4 tests/trusted-raycast-*.test.ts
./node_modules/.bin/tsc --noEmit
git diff --check
```

Data checks: 108 passed. Trusted TypeScript checks: 220 tests, 213 passed, 7 skipped, zero failures. Typecheck and diff checks passed. Red logs preceded implementation: `/tmp/can-i-use-detail-data-red.txt`, `/tmp/can-i-use-source-detail-red.txt`, `/tmp/can-i-use-manager-detail-red.txt`, `/tmp/can-i-use-browser-action-red.txt`, and `/tmp/can-i-use-detail-ui-red.txt`. Final regression log: `/tmp/can-i-use-detail-final-tests.txt`.

## Browser Proof

Disposable harness and evidence: `/tmp/can-i-use-detail-browser.Bn5vi7/`.

Playwright CLI 0.1.19, headless Chromium session `can-i-use-detail-proof`, verified real renderer -> test bridge -> actual manager -> pinned child:

- Search finds source index 500, `Node.textContent`.
- Enter opens its 14 browser-support rows with source release dates and accessible status icons.
- Enter on a detail row and Meta+Enter on the root invoke the Host browser callback with exactly `https://caniuse.com/textcontent`.
- Escape returns to the prior search; empty results remain accurate.
- Light/dark screenshots, no horizontal overflow, no visible application error. Both detail screenshots were visually inspected.

Native opening used a recording sink: no external browser application was opened. This is not Electron or production IPC verification. `proof.js` and `browser-results.txt` retain the exact interactions and results; screenshots include `root-dark.png`, `detail-dark.png`, `detail-light.png`, `returned-light.png`, and `empty-light.png`.

Server 52055, child/group 52071, browser daemon 52698 and all ten recorded owned processes were stopped and checked absent. See `cleanup.json` and `verified-cleanup.json`.

## Host Replacement Follow-Up

`restartCanIUse()` now validates and detaches new preferences, retires the old child/group, and imports the unchanged source in a new session/generation. The real manager check observes uppercase status accessories after enabling brief mode, rejects old action handles, and proves a close racing with restart cancels replacement instead of reopening a closed view. The same Host seam can restart unchanged preferences for a theme change; application theme wiring is still pending. Red: `/tmp/can-i-use-restart-red.txt`; green: `/tmp/can-i-use-restart-green.txt`; manager/lifecycle checks: `/tmp/can-i-use-restart-checked.txt` (6 passed, 2 live-service checks skipped). Typecheck passed.

## Still Open

`tockteam-3l3.4.3` remains in progress: managed preference setup/restart and theme-triggered invalidation are not yet fully wired. Detail browser search is intentionally hidden rather than exposing a nonfunctional input. These limitations must be resolved or explicitly recorded at final admission. Public trust, native IPC, install/package activation, and Electron proof remain disabled/pending under `.4.4`. No push or changes to Mole.
