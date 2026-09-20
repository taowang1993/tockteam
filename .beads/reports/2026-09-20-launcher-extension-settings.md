# TockLauncher Extension Settings Verification

Epic: `tockteam-u104`. Implementation: `cf38afec`, `00cccce8`, `2db142fe`.

## Delivered

One searchable directory and 27 individual destinations inside canonical Settings. Existing specialized editors, settings keys, stores, import/export scope and native authority remain unchanged. Contextual **Extension Settings** actions carry finite destinations. Mounted editors retain failed/invalid drafts; dismissal requires an explicit discard. Compatibility settings use guarded workbench IPC, private-proxy redaction, shared inline/canonical revision fencing and explicit trust-owned enablement.

The review caught and fixed enablement incorrectly acknowledging newer preferences, localized search receiving an array index as its locale, and incorrect Linux availability for Appearance Switcher/System Settings. Each regression was reproduced before its fix. Simplification, security/hardening and performance review references were applied. No dependencies or runtime manifest loader were added.

## Fresh Checks

- `pnpm test`: **1,382 passed, 18 skipped, 0 failed** (1,400 tests).
- `pnpm typecheck`: passed.
- `pnpm run build`: passed.
- `node scripts/launcher-extension-settings-proof.mts`: passed with real production preload, workbench IPC registration and isolated preference stores.
- `npx -y react-doctor@latest . --verbose --diff`: 76/100, unchanged existing plugin warnings. Explicit root audit, `npx -y react-doctor@latest . --project . --verbose --scope changed --base cf38afec --include-untracked --no-cache`: **80/100, no errors**, five warnings. Accepted warnings concern existing settings/workflow component complexity, the bounded three-extension form, and an at-most-seven-field allowlist lookup; no broad refactor or speculative optimization was applied.
- `git diff --check`: passed.

## Behavioral Evidence

The hidden Electron/Playwright harness exercised all 27 destinations, search by field/name, keyboard entry and Back focus restoration, failed Calculator persistence, invalid UUID/Can I Use drafts, workflow draft navigation, Escape cancellation and explicit discard, reopen persistence, unavailable secret storage, destination events, English/Chinese labels and Chinese search, dark/light appearance, all four named skins and a 480-pixel narrow layout.

Compatibility save/conflict/refresh flows use real preload and IPC. Toggling enablement does not acknowledge a concurrent preference write. Refresh preserves the user's changed field while merging an externally changed field. HTTP proxy override and **Use System Proxy** persist without exposing detected proxy configuration.

Saved files were reopened by real providers/runtimes:

- Calculator precision 6 produces `0.333333` for `1/3`.
- A real Translate command projection offers the saved German/French language defaults.
- A real Kaomoji command renders Grid after saving **Display Mode**.
- A real Can I Use command starts; its pinned-data runtime uses exactly `chrome 100` and `firefox 100`.

No selected-text, clipboard, external-browser or live-profile effects were permitted. Compatibility command runtimes were explicitly staged, previewed, approved and enabled only in disposable test roots after settings verification.

## Screenshot and Cleanup

[Proof metadata](2026-09-20-launcher-extension-settings/proof.json) · [Process cleanup](2026-09-20-launcher-extension-settings/cleanup.json) · [Translate screenshot](2026-09-20-launcher-extension-settings/translate-dark.png)

Capture: Google Translate in the hidden Electron component harness at `/settings/tocklauncher/extensions`; saved German/French defaults and enabled fixture state. Explicit dark appearance, no skin, **1512 × 949 CSS pixels at 2×**, verified **3024 × 1898 PNG pixels**. No captured console/page errors. Only the allowlisted screenshot, proof and cleanup files were published; proof metadata was committed last using exclusive publication.

Every launched Electron/browser/runtime process was stopped; the recorded remaining-process list is empty. HOME and the user's profiles were preserved; Electron used `--use-mock-keychain` and a prohibited activation policy.

## Verification Boundary

This is an inactive Electron component/IPC/runtime proof, not a full installed-application or operating-system focus smoke. The existing route/readiness and IPC tests cover the production navigation wiring; the component proof exercises its finite destination event. The focus-taking `pnpm test:launcher:electron` and installed smoke were deliberately not run. Existing skipped platform/opt-in tests remain skipped. Beads issues were closed locally; `bd dolt pull` could not synchronize because its database has no remote (`Error 1105: no remote`). No changes were pushed.
