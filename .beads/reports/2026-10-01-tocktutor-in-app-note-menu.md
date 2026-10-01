# TockTutor In-App Note Menu

Issue: `tockteam-yoam`, especially `.12` and `.14`. Code commit: `910a3bee`.

## Result

The user explicitly selected **Remove the Outside-App Option Too**: saved notes should open in TockTutor. Removed **Open in Default App** from both **More Note Actions** and the Files note context menu, and removed its sidebar-action type. Normal note opening and saving remain in TockTutor. **Open in New Window**, **Copy Path**, **Export PDF…**, **Reveal in Finder**, and other existing actions remain.

The former outside-app certification requirement is **cancelled, not verified**. Existing trusted Desktop API, authorization, path validation, cancellation, and native-operation contracts were deliberately left unchanged.

**Total new confirmed product findings: 0.** This is a user-directed scope change, not a claim that an outside app was opened.

## Verification

- Test-first: the header-menu absence assertion and Files-menu absence assertion each failed before its corresponding removal.
- `node plugins/tocktutor/packages/tockteam-tocktutor-workbench/node_modules/vitest/vitest.mjs run --config /tmp/tocktutor-in-app.F16u46/vitest.config.mjs --configLoader native` — **123/123 passed**.
- `node --test tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts tests/desktop-open-path.test.ts tests/desktop-open-path-channel.test.ts` — **12/12 passed**. Native boundary callbacks are fake operations, not OS-effect proof.
- `pnpm run typecheck:tocktutor`, `pnpm run typecheck`, `pnpm run build:tocktutor`, `pnpm run build`, `node scripts/tocktutor-build-manifest.mjs --check`, and `node scripts/stage-dsh.mjs --quick` pass.
- `pnpm test` — **1,613 passed, 18 skipped, zero failed**.
- React Doctor, using the same workbench command before and after: **53 → 53**.
- Owned-path diff check passes. No Electron launcher/installed smoke was run for this isolated menu change.

The guarded real Desktop, using pinned DSH `0.1.2-rc.1`, opened the owned saved note in TockTutor. App-scoped Playwright edited its Source view, used **Meta+S**, observed removal of its `aria-label="Unsaved"` marker, switched to another note, and reopened the saved note in Live Preview. Exact intended disk bytes were verified. The menu has 32 root entries; the Files context menu has 12. Neither includes **Open in Default App**. Keyboard Home/End, Escape, outside dismissal, and trigger/row focus restoration pass. All eight Default/Navy/Jade/Ember × light/dark combinations omit the option and remain independent of opposite simulated system appearance.

Only two new proof PNGs were published: `tocktutor-in-app-note-menu.png` and `tocktutor-in-app-files-note-menu.png` under this report directory. Both are unaltered **3024 × 1898** captures from **1512 × 949 CSS pixels at DPR 2**, explicit built-in dark/no root or body skin, `/tocktutor/Saved%20Note.md`, and Live Preview. Capture/session errors are zero; two existing startup warnings remain. Machine proof and hashes are in `2026-10-01-tocktutor-in-app-note-menu.json`.

## Existing Check Limitations

The full nested suite is **not green**: the protected, user-owned `route-linked-panes.test.tsx` still expects the removed **Show Assistant** Switch. This same failure was documented before this work. It was not changed or bypassed. The full serial component rerun passes **744** checks and retains this one known failure. An initial unrelated editor test exceeded its 5-second deadline; its focused retry and full serial rerun pass without changing the test or timeout. No new editor defect is claimed.

Early private harness attempts incorrectly looked for Unsaved as tab text, assumed Source mode persisted across reopening, or read focus before the asynchronous restoration settled. Corrected checks use the actual ARIA marker, Live Preview reopening, and awaited focus. No rejected screenshot was published.

## Ownership and Cleanup

The peer explicitly held route/source/generated/build/display/index resources for this change. All three protected paths and all 73 existing gallery screenshots remain byte-identical. No user vault/profile, outside app, account sign-in, credential, or unrelated gallery edit was used.

Guarded launch `725ec974-9ffe-4bce-89ea-b1d7c4930419`, root PID **53024**, stopped with all **19** recorded app/runtime descendants absent. Playwright detached and reports no sessions. The owned note fixture was removed. Private raw logs and harnesses remain in `/tmp/tocktutor-in-app.F16u46`.

Restart Electron to load the simplified note menus.
