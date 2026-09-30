# Image Alignment and Diagram Editing Reference

Source commit: `83dba93c`. Bead: `tockteam-cwz4`.

## Confirmed Findings

Total confirmed findings: **2**, both fixed. **0 unresolved confirmed findings.**

1. **Medium — The Third Photo Was Centered and Cropped by a Different Editor Layout.** `plugins/skins/src/client/tailwind.css`: wiki embeds aligned left, but regular Markdown images inherited Crepe's `margin: 0 auto`, 100 px minimum wrapper width/image height, centered caption, and cover fit. Reproduction placed the 96 px photo at x=864 versus document/control x=562, with a cropped 100 px height instead of its natural ~64.26 px. Changing only the wrapper defaults restored alignment; removing only the height constraint restored proportions, ruling out stale resize state. Fixed once in the existing scoped Crepe utility, with no runtime, dependency, shared-button, palette, or authored-Markdown change. The caption stays with the left-aligned image/controls. A real rendered regression failed before the fix and now passes at x=562 with a 96 × 64.2578125 photo.

2. **Low — Diagram Editing Had No Obsidian Reference Image.** `.agents/uiux/tocktutor/tocktutor.html`: Surface 28 displayed Reference Not Captured rather than the requested comparison. Replaced it with a genuine installed Obsidian 1.13.7 capture using the exact saved 705-byte note from the existing TockTutor capture. Its first uppercase Mermaid fence is active as source while neighboring diagrams remain rendered. Metadata, links, allowlist, content hashes, and gallery regression checks bind the reference to that state. This is same-content evidence, not identical editor controls or fence presentation.

## Verification

- RED and GREEN: `playwright-cli -s=OWNED_SESSION run-code --filename=/Users/taowang/projects/tockteam/scripts/tocktutor-image-layout-checks.js`, attached only to the returned guarded Desktop endpoint with isolated `migration-fixtures/Images.md` open. The original check fails on Image 3's alignment/cropping; the staged fixed app passes after an exact save/reopen.
- `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/image-resize.test.tsx tests/image-viewer.test.tsx --environment jsdom`: **15 passed**.
- `node --test tests/skins.test.ts tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts tests/icons.test.ts tests/dsh-lucide-icons.test.ts`: **36 passed**.
- Gallery RED: **4 failed** before the new capture/alignment proof and Diagram Editing reference.
- `node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts`: **14 passed** after publication.
- `pnpm run typecheck:tocktutor`, `pnpm run test:tocktutor`, and `pnpm run build:tocktutor`: passed, including **742** workbench component tests, **418** workbench Node tests, and **167** TockTutor tests.
- `pnpm run typecheck`, `pnpm test`, `pnpm run build`, and `node scripts/tocktutor-build-manifest.mjs --check`: passed. Root suite: **1,603 passed, 18 skipped, 0 failed**.
- `node scripts/stage-dsh.mjs --quick` and scoped whitespace checks: passed.

Real app-scoped Playwright verified Default/Navy/Jade/Ember in both light/dark, opposite system appearance, 640/390 px layouts with the Files sidebar collapsed, and the third image viewer in Reading, Source, and Live Preview. All three images align left; the 120 × 120 authored neighbor stays square; the 96 px Markdown photo is uncropped. Viewer zoom, icon-only circular exit, Escape and trigger focus return remain intact. Runtime errors: zero.

The actual Resize field/drag handle again exercised 200 → 240 → 280 → one Undo to 240, save and reopen. Exact saved bytes match the earlier resized note SHA `9445bb6e101789418c09e90340175ea6555c80bce0a37eb5437b540b71924572`; neither neighboring image, alt, caption, nor surrounding note changed. The replacement photo screenshot is the canonical dark/unskinned app at **1512 × 949 CSS pixels, DPR 2, 3024 × 1898 PNG pixels**.

The installed Obsidian archive ran under guarded generic Electron 42.3.0, never the native executable or a user profile. Built-in dark is explicit (`theme: obsidian`, body `color-scheme: dark`, no skin); its document inline scheme is empty and recorded honestly. The built-in Mermaid trust prompt was accepted only for the known copied fixture vault. No external link was activated. Native editor text, copied vault bytes, and the existing TockTutor editing capture share SHA `c407aff19710d3cb8a8dd75f312caba27af7c11ec617e6d49e80db3efe09b007`. Capture-time console/page errors and external requests: **0**. The original user's Obsidian registry hash/mtime are unchanged.

All owned trees stopped, with no remaining descendants: diagnostic Desktop roots **38703**, **40719**, final Desktop **42045**, and Obsidian **43631**. The initial fresh-app check still saw old styling until staged bundles refreshed; a newly launched staged app passed, without adding unnecessary CSS priority overrides. A separate guarded generic Electron gallery check verified that both images decode in each requested comparison, with no missing placeholder, runtime error, or failed request at 1512 × 949 CSS pixels/DPR 2. Gallery root **53697** and its entire tree stopped; the bounded loopback-only static server **50771** stopped. No owned browser/app/server remains.

Only `tocktutor-image-resizing.png` and new `obsidian-mermaid-editing.png` are published transactionally; **70 unrelated existing captures remain byte-identical**. Other missing reference labels stay honest. Detailed state/hashes/cleanup are in `.agents/uiux/tocktutor/content-alignment.json`; runnable temporary probes and logs are in `/tmp/tocktutor-image-placement-20260930`.

## Limitations

The supplied original PNGs and reduced JPEGs could not be displayed inline. Local Vision OCR identified the specific Image Resizing and Diagram Editing gallery surfaces; real app DOM geometry and decoded-image measurements reproduced and verified the placement defect. No pixel-exact screenshot-match claim. No React component code changed; no complete React Doctor score is claimed. Protected `AGENTS.md`, `tests/right-panel-layout.test.ts`, existing Playwright artifacts, and concurrent account/Raycast source/report paths remain untouched. No push or installed-launcher smoke.
