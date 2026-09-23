# TockLauncher Settings Sidebar

Issue: `tockteam-zz01`. Implementation: `19af0b89`.

## Result

**TockLauncher** is now an expandable Settings-sidebar group containing **General** and **Extensions**. Extensions expands into searchable individual destinations for all 27 admitted providers. A selected extension opens its own right-hand page, without the old content-area tabs, directory buttons, back button or compatibility badge. Compatibility preference groups have quieter spacing and grouped surfaces.

The native Settings shell still owns activation and dismissal. A scoped `settings.action` contribution projects the navigation beside the shell's original button through a React portal; cleanup restores that button. All extension editors retain one mounted `settings.section` and its draft boundary. No upstream or installed DSH files were edited, and no host/IPC authority changed. The root now declares the React DOM types already used elsewhere in the workspace; no runtime dependency was added.

## Verification

- `pnpm test`: 1,382 passed, 18 skipped, zero failures.
- `pnpm typecheck`: passed.
- `pnpm run build`: passed.
- `node scripts/launcher-extension-settings-proof.mts`: passed. Before implementation the same check failed with `TockLauncher must be a sidebar disclosure`.
- The proof also reproduced and fixed a locale-ordering regression: switching back to English left Chinese sidebar labels. Sidebar translation now reads the locale service directly.
- `npx -y react-doctor@latest . --project . --scope changed --base 91941891 --include-untracked --verbose`: 89/100, no errors; three existing settings/editor complexity warnings.
- `git diff --check`: passed.

The hidden Electron proof loads the actual pinned DSH SettingsRoot bundle with a controlled slot registry and inert neighboring pages. It exercises parent/child collapse, keyboard activation, compact rows, all 27 pages, search, selection, activation from another Settings section, retained/rejected drafts, leaving-section confirmation, Escape/discard, close/reopen, destination events, English/Chinese switching, narrow layout, light/dark appearance and the four skins. Real production preload, guarded IPC and isolated preference stores remain in use. Saved values are subsequently consumed by Calculator and the three compatibility runtimes.

This is a pinned-shell/component/IPC proof, not a full installed-application smoke. No foreground input or user profiles were used. Electron ran hidden with a prohibited activation policy and mock Keychain.

## Visual Evidence

[Translate Screenshot](2026-09-20-launcher-settings-sidebar/translate-dark.png) · [Proof](2026-09-20-launcher-settings-sidebar/proof.json) · [Cleanup](2026-09-20-launcher-settings-sidebar/cleanup.json)

Captured at **1512 × 949 CSS pixels, 2×**, verified **3024 × 1898 PNG pixels**. Explicit built-in dark appearance, no skin. TockLauncher and Extensions are expanded; Google Translate is selected with saved German/French defaults and Advanced collapsed. The right-hand page title, grouped preferences and native sidebar were visually inspected. No captured runtime errors or warnings. All owned Electron/browser/runtime processes stopped; cleanup reports an empty remaining-process list.

Only the allowlisted screenshot, proof metadata and cleanup record were published, exclusively and with proof metadata last. Nothing was pushed.
