# Surface 05 Note Actions Screenshot

Issue: `tockteam-weg4`. Updated only `tocktutor-note-actions-menu.png` and its scoped gallery/provenance text after reading the complete `tocktutor.html` capture runbook and Surface 05. All 72 other pictures, including every Obsidian reference, are preserved.

Reused the existing Desktop build from `910a3bee`, checkout `543d6395`: no app source edits, build, staging, or outside-app action. The peer owns unbuilt source changes; proof fingerprints the frozen built artifacts rather than those current sources. Exact shared `comparison.md` bytes (1,324; SHA `3a55316a7e1628a2a4e7c7167662556322c10ae1691a7cfe519856cbade091e5`) remain unchanged in the isolated Comparison Vault.

App-scoped Playwright over guarded Electron/CDP verifies `/tocktutor/comparison.md`, selected note, Live Preview, the exact corrected paragraph, 32 real menu entries without **Open in Default App** or a **Live Preview** item, other retained actions, enabled Rename, and zero unsaved marker. No note action was invoked beyond selecting the note and opening the menu. Outside-app certification remains cancelled, not verified.

The unaltered PNG is **3024 × 1898** from **1512 × 949 CSS pixels at DPR 2**, explicit built-in dark, no root/body skin, despite simulated light system appearance. Hash: `e968b94a3232162f910c06f5485ada47a8afe0b7799f46f609efce01faa1f6d3`. Capture/runtime console errors: **0**; existing startup warnings: **2**. Fresh link/ordered/task colors and glyph/favorite dimensions match the recorded style evidence.

Private harness checks were corrected for hidden inline-source text and Rename's accessible name. The exact paragraph excludes only source nodes verified `display:none`; no actual page/visible text/style was altered. No rejected image was published and no app fix was attempted.

Owned Desktop launch `9bd36f9c-1253-4143-af85-35be508692ab`, root **57588**, stopped with all **16** app/runtime PIDs absent. Playwright detached. Only the explicitly allowlisted PNG and three metadata files are published through checked same-filesystem replacements with rollback; original metadata is preserved except this surface/current proof. All three protected paths and frozen build artifacts remain unchanged.

Verification command: `node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts` — **16/16 passed**; scoped `git diff --check` passed. Gallery inventory remains **29 surfaces / 66 unique displayed images / 73 PNG files**. A separate guarded gallery browser at the same exact geometry decoded both Surface 05 pictures at native size, verified the current caption/proof, and recorded zero errors/failed requests. Gallery root/server **60427** and all four PIDs stopped; port **49419** closed; no Playwright sessions remain. Final gate and guarded gallery decode/cleanup receipt is in `2026-10-01-tocktutor-note-menu-gallery.json`.
