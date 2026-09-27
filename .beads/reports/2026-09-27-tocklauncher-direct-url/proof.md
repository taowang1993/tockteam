# TockLauncher Direct Address Proof — 2026-09-27

## Result

A complete typed HTTP(S) address offers **Open in Browser** and uses the existing Desktop-owned default/custom-browser policy even when Web Search is disabled. The owned browser fixture recorded one default-browser open in each state, with no real browser launched and no forbidden effects:

- **Web Search Off (fresh isolated profile):** `https://example.org/guide?a=b#off` → fixture `default.urls: ["https://example.org/guide?a=b#off"]`, `default.count: 1`, `custom.count: 0`, `forbiddenEffects: 0`.
- **Web Search On:** The settings UI showed **Enable Web Search** unchecked, was switched on and confirmed checked with **Saved.** status; `http://example.org/page#on2` → fixture `default.urls: ["http://example.org/page#on2"]`, `default.count: 1`, `custom.count: 0`, `forbiddenEffects: 0`.
- Browser-visible negative inputs `example.org`, `ftp://example.org/`, `https://user:pass@example.org/`, and `https://example.org/path with spaces` each produced **zero** Open in Browser results. Unit checks additionally cover input bounds, stale/tampered actions, no Host fetch or DNS for direct navigation, localization, no pin/hide/history, and custom-browser policy.

## Capture

- [Open in Browser with Web Search Off](open-in-browser-web-search-off.png): actual Launcher route `file:///Users/taowang/projects/tockteam/dist/launcher.html`, typed `https://example.org/guide?a=b`, single contextual result showing `example.org`. Captured through owned app-scoped Playwright/CDP at a **1512 × 949 CSS-pixel** emulated renderer viewport, device scale **2**; verified PNG **3024 × 1898** pixels, SHA-256 `d469f2e5ae7ee56a2f01ab789ad7ad8f9ffe24de373f68fbf5023a8d06b98e63`.
- The emulation was cleared afterward; actual native popup stayed `{x:1820,y:149,width:750,height:475}` at device scale 2 within the Sidecar display work area `{x:1512,y:30,width:1366,height:994}`. Appearance at capture: `document.documentElement.style.colorScheme === 'dark'`, no `data-tockteam-skin` on the document. This is a **renderer-only** screenshot, not a physical-display capture.
- The Web Search On screenshot attempt timed out while waiting for CDP capture; the subsequent fresh typed query and browser-fixture invocation **passed**. Only the fully verified Off screenshot was allowlisted and published.

## Runtime and Cleanup

Two bounded generic Electron instances were launched exclusively through `extended_display` on display 17 with `--use-mock-keychain`, isolated profile data, browser/network fixtures, and the 750 × 475 Launcher smoke entry. Roots `18278` and `20940` were explicitly stopped; the guard reported `remaining: []` for each complete recorded process tree. Playwright detached, and CDP/Web ports `61256`, `61272`, `61568`, and `61584` had no listeners afterward. The Models peer acknowledged the `.stage`/Sidecar proof-lane handoff.

Startup in the second run logged two `ApplicationSearch failed: Error` and eight generic `launcher:search` IPC errors; the first run also logged one ApplicationSearch error and eight search IPC errors before the working interactions. The Launcher renderer emitted pre-attachment CSP/font console messages. No `launcher:invoke-action` IPC errors were logged during the successful opens. The startup cause remains unverified and is tracked separately as `tockteam-rclf`; this proof does **not** claim a clean startup.

## Checks

- `node --test tests/launcher-network-extensions.test.ts tests/launcher-core-search.test.ts tests/launcher-custom-browser.test.ts` — 59 passed, 1 platform-only skip, 0 failed (post-proof rerun).
- `pnpm run typecheck` — passed (post-proof rerun).
- `pnpm test` and `pnpm run build` — passed before guarded proof for committed `7d319ed0`; no source changes followed.
