# TockTutor Gallery Follow-Up

Issues: `tockteam-a17j`, `tockteam-lmy5`, `tockteam-10s9`. The user selected **Update the Picture** for the completed sidebar, requested the Reader View refresh, and permitted closing the flash issue. No real external-app opening or account work was authorized.

**Total new confirmed product findings: 0.** Both allowlisted pictures are published and final checks pass.

## Published Scope

- Surface 29: promote the unaltered, already certified `tocktutor-sidebar-toggle-properties.png` from `tockteam-ph35`/`1e3174b3` into `tocktutor-imported-properties.png`. It shows the compact 86-pixel icon toggle, Properties selected, all eight rows, collapsed in-note properties, and 470-pixel sidebar. The saved note remains 447 bytes and its imported types match the existing Obsidian reference. No new Properties or Obsidian launch was needed.
- Reader View: fresh real Desktop screenshot of `/tocktutor/comparison.md`, with the actual public Example Domain article loaded, enabled Page View, and the exact corrected Live Preview paragraph behind it. The shared 1,324-byte note remains byte-identical, SHA-256 `3a55316a7e1628a2a4e7c7167662556322c10ae1691a7cfe519856cbade091e5`.
- Only those two allowlisted PNGs and their captions/proof are updated. All 71 other screenshots, including every Obsidian reference, remain unchanged. Counts remain 29 surfaces, 66 displayed pictures, 73 PNG files, and seven supplements. Reader View has a direct supplemental link, not a new comparison row.

## Capture Evidence

Both images are real Desktop captures at **1512 × 949 CSS pixels**, **2×**, and **3024 × 1898 PNG pixels**, with explicit built-in dark mode and no root/body skin. No image rescaling, cropping, UI fabrication, or styling overrides were applied. The existing source/build/staging and three protected user-owned paths were left unchanged.

The new Reader run used generic Electron through `extended_display` on display **17**, an isolated profile/vault, preserved `HOME`, and the guard's mock Keychain. Playwright attached only to its returned owned loopback CDP endpoint. Capture-time errors and the final session console errors are zero; two pre-existing startup warnings are retained. The existing Host fetched public `https://example.com/` for Page and Reader views. No model prompt, credentials, sign-in, revocation, clipboard, or native external-app effect was exercised.

Two capture-check issues were caught before publication: hidden Markdown source was mistakenly counted as visible text, and Playwright's screenshot defaults produced a 1× PNG despite the emulated DOM metric. The final check uses rendered `innerText` with layout-whitespace normalization and Playwright-owned CDP `Page.captureScreenshot`, verifying both pre/post CSS/DPR metrics and actual PNG dimensions. The rejected candidates were never published. Reader View itself loaded successfully; no product fix was necessary.

The Reader app/runtime tree stopped explicitly: root PID **40289**, **24 recorded PIDs**, remaining **[]**. Playwright detached and lists no sessions. The source Properties capture has its own complete cleanup certificate in the prior sidebar proof.

## Verification

The existing gallery regression was updated first; RED produced exactly two expected failures for the outdated toggle and Reader evidence. Final gallery/content checks pass **16/16**; root typecheck, tracked build-manifest check, and owned-path diff check pass. A bounded guarded Electron gallery check verifies 29 surfaces/66 displayed pictures, current captions, the Reader link, and both new PNGs decoding at 3024 × 1898. Runtime errors and failed requests are empty. The first gallery check was too early for its lazy-loaded image; the retry waits for image completion and passes. Both gallery roots (42901, 43213), servers (42895, 43206), and their recorded descendants stopped; both ports closed.

```sh
node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts
pnpm run typecheck
node scripts/tocktutor-build-manifest.mjs --check
```

The current existing app build is reused; no source edits, rebuild, broad app smoke, or baseline refresh outside the two named pictures is part of this follow-up.

## Issue Decisions

- `a17j`: completed replacement control remains owned by closed `ph35`; this follow-up updates its original Surface 29 picture request rather than rebuilding the sidebar.
- `10s9`: confirmed by its title/description to be the composer/model-picker flash issue. Closed with the user's explicit updated acceptance, based on the existing fix and passing focused regressions. Fresh delayed-picker Desktop proof is not claimed.
- `lmy5`: its outstanding Reader capture is now published with loaded-article/paragraph proof and passing gallery checks; complete and close.
- `yoam`: unchanged. “Open in Default App” means asking macOS to open the saved Markdown file in its associated app, such as Obsidian or a text editor. Actual external-app launch remains uncertified and was not attempted here.

Per-image state, hashes, cleanup, and final gallery proof are in `2026-10-01-tocktutor-gallery-followup.json`; current gallery metadata is in `content-alignment.json`.
