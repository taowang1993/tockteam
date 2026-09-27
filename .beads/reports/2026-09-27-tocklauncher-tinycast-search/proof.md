# TockLauncher Tinycast-Inspired Search Proof — 2026-09-27

## Scope and Result

Guarded Desktop proof of typed-query File Search handoff, English/Chinese macOS application aliases, typed-search usage tie-breaking, and bounded popup geometry. All four behaviors passed after startup in an isolated profile; no production UI or security boundary was changed for the visual proof.

- Guarded Electron root PID `91451`, display `17` (Sidecar Display), CDP endpoint `127.0.0.1:57823`; launched through `extended_display` with the corrected smoke entry before importing Electron's ESM named exports.
- Display work area `{x:1512,y:30,width:1366,height:994}`. Native Launcher bounds `{x:1820,y:149,width:750,height:475}`: 308 CSS px on each horizontal side. The guard expands its **top-level workbench** to the display; the owned Launcher remains a popup. Clicking outside in the workbench changed launcher visibility from `true` to `false`.
- Launcher route `file:///Users/taowang/projects/tockteam/dist/launcher.html`; proof viewport `1512 × 949` CSS px at device scale `2`, screenshots `3024 × 1898` pixels. Isolated appearance: `document.documentElement.style.colorScheme === 'dark'`, no `data-tockteam-skin` on document or body; seeded `skins.json` with `{ "activeId": null, "fallbackTheme": "dark" }`. No theme emulation.
- Query `fixture` displayed exactly one **Search Files for “fixture”** action. Invoking it focused File Search with `fixture` prefilled and found the synthetic `fixture-search-note.txt`; Escape returned focus to the launcher search field with `fixture` intact.
- Query `日历` matched `applications:/System/Applications/Calendar.app` while the row remained visibly named **Calendar**. The isolated persisted Host index contained 244 items, 127 with aliases; Calendar retained `searchAliases: ["日历"]` under its same path-based ID. For `Siri`, seeded local usage put `applications:/System/Library/CoreServices/Siri.app` ahead of the equally relevant `/System/Applications/Siri.app`.
- No page or console errors occurred **after Playwright attached** during these interactions. The startup logs did contain one `ApplicationSearch failed: Error` and nine generic `launcher:search` IPC errors before attachment. Search recovered without intervention; this proof does not claim a clean startup or establish the cause of those transient logs.
- Detached Playwright, stopped guarded root `91451`, and verified all 30 recorded processes stopped (`remaining: []`). Forced-stop GPU/network termination messages are cleanup artifacts, not search errors.

## Screenshots

These are **renderer-only CDP captures** at the required viewport/device scale, not OS screenshots of the physical popup. Native placement is evidenced separately by guarded window bounds above. The four files were allowlisted by name, dimension-checked and copied to a pending directory before atomic publication.

- [Typed Query Handoff](handoff.png) — `fixture`, File Search action selected.
- [Prefilled File Search](file-search.png) — focused input and synthetic result.
- [Chinese Alias](calendar.png) — `日历` finds the same English-named Calendar app.
- [Usage Tie-Break](ranking.png) — two Siri apps in seeded usage order.

## Checks and Limitations

- `node --test tests/launcher-guarded-smoke-entry.test.ts`: 5 passed, including fail-closed rejection of an unparented Launcher created through an early Electron import.
- `pnpm run typecheck`: passed.
- `pnpm run build`: passed.
- The complete root test suite had passed in the concurrent Base session (1,475 passed); this proof did not rerun that suite after the smoke-only fail-closed test.
- The File Search document and usage score were synthetic fixtures in the isolated profile. The Calendar/Siri matches came from native macOS application scanning. The startup IPC log observation remains unresolved; it was not counted as a confirmed production defect.
