# TockLauncher Startup Search Diagnosis and Fix — 2026-09-27

## Result

A fresh Launcher now makes **one** passive search request at startup instead of nine. Its first result is ready with 209 indexed destinations; typing **Calendar** shows Calendar and CalendarFileHandler, and Application Search remains **Ready**. The guarded Host recorded **zero** generic search IPC errors and **zero** ApplicationSearch failure logs after the fix.

## Confirmed Findings: 2

1. **Low — Startup search churn.** `src/launcher.ts`, `src/launcher-core-search.ts`. Repeated theme/focus refreshes while the first index was loading caused overlapping searches to cancel one another. In an isolated guarded baseline, nine passive IPC requests produced eight generic handler failures; only request nine succeeded after 1,449 ms. A separate Node reproduction with nine concurrent first requests likewise produced eight generic failures and started nine scans. **Fixed and verified:** theme tokens no longer re-query the Host, focus does not duplicate the unfinished first search, and concurrent first searches share one index load while stale results remain rejected. The new guarded startup made one request, succeeded with 209 indexed destinations and no generic errors; a subsequent typed search also succeeded. Explicit stale IPC/action-ID rejection remains unchanged.
2. **Low — Optional icon fallbacks mislabeled as provider failure.** `src/launcher-discovery-extensions.ts`. Native macOS icon conversion can fail for individual apps while the app results remain searchable with generic icons. A normal local scan found 200 apps; five of the first eight icon lookups succeeded and three exited with code 1. The guarded baseline logged `TockLauncher provider ApplicationSearch failed: Error` even though `mdfind` succeeded, Calendar appeared, and the provider reported **Ready**. **Fixed and verified:** optional icon failures no longer call the provider-failure logger; a real discovery failure still uses the existing provider error path. The guarded post-fix run logged no ApplicationSearch failure and kept the provider **Ready**.

These were real startup work/logging defects, not a permanent search outage or a guard-only failure. No new IPC, permissions, browser authority, or plugin behavior was added. Independent workbench navigation can still supersede an internal rescan; the proof does not claim that every native scan always completes.

## Browser Proof

[Verified Launcher Screenshot](launcher-search-ready.png) shows the fixed `file:///Users/taowang/projects/tockteam/dist/launcher.html` route with Calendar results. Owned generic Electron ran on display 17; the real Launcher popup stayed `{x:1820,y:149,width:750,height:475}` at device scale 2 inside the Sidecar work area `{x:1512,y:30,width:1366,height:994}`. The screenshot was captured through owned Playwright/CDP at **1512 × 949 CSS pixels**, device scale **2**, and verified as **3024 × 1898 pixels**, SHA-256 `030a52e615aa791afb5694486e1b7de6e3b3c8f7e4e55fc63cb3ebd6e5111be0`. Appearance at capture: `document.documentElement.style.colorScheme === 'dark'`, no `data-tockteam-skin`; focus was on the Launcher search field before typing. This is a renderer-only screenshot, not a physical-display capture.

The baseline renderer was ready with `209 indexed destinations`, revision 9, and ApplicationSearch state **Ready** despite its startup logs. After the fix it was ready at revision 1 with the same 209 destinations; typing Calendar produced revision 2 and two app results. The workbench DevTools attach reported zero console errors and one warning; Electron baseline recorded eight `launcher:search` handler errors and one ApplicationSearch failure, while the fixed run recorded zero of either. Diagnostic hooks logged only command names, error categories, request timings, and counts; no user paths or tokens were published.

## Checks and Cleanup

- RED: `node --test --test-name-pattern='startup theme and focus updates do not duplicate the first search' tests/launcher-renderer-contract.test.ts` — failed before the renderer fix.
- RED: `node --test --test-name-pattern='concurrent first searches share one scan' tests/launcher-core-search.test.ts` — failed before the shared-initial-scan fix (`2 !== 1`).
- RED: `node --test --test-name-pattern='application icon fallback does not report' tests/launcher-discovery-extensions.test.ts` — failed before the logging fix.
- GREEN: `node --test tests/launcher-discovery-extensions.test.ts tests/launcher-core-search.test.ts tests/launcher-renderer-contract.test.ts tests/launcher-ipc.test.ts` — **64 passed, 0 failed**.
- `pnpm run typecheck` and `pnpm run build` — passed after commit `545afca6`.
- The broad `pnpm test` gate was not run concurrently with another owner's TockTutor rebuild/packaging lane; this is an unverified broad check, not a confirmed failure. The focused Launcher checks and real guarded app proof passed.

The failed setup attempt (top-level await in the temporary guard entry, root PID 44167), baseline (44331), and fixed proof (47133) were explicitly stopped through `extended_display`; each reported `remaining: []` for its full recorded process tree. Both Playwright sessions detached; `playwright-cli list` showed no owned browsers and CDP/Web ports `64476`, `64493`, `64513`, `64862`, and `64878` had no listeners. The shared `.stage`/Sidecar/build lane was explicitly handed to the Base peer after cleanup. Temporary diagnostic code remained under `/tmp`, never in the repository.
