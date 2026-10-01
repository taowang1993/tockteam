# Imported Property Controls Reference

Bead: `tockteam-0plb`. Scope: gallery Surface 29 and its evidence; no TockTutor runtime changes.

## Confirmed Findings

Total confirmed findings: **1**, fixed. **0 unresolved confirmed findings.**

1. **Low — Imported Property Controls Lacked Its Obsidian Screenshot.** `.agents/uiux/tocktutor/tocktutor.html`: Surface 29 had Reference Not Captured and a placeholder instead of the requested comparison. Added a genuine installed Obsidian 1.13.7 reference with the identical saved note and the same declared property types. The unchanged TockTutor capture remains historical source `23e2cbcb`; the native controls are real, not a TockTutor rendering or synthetic screenshot. Gallery links, PNG hashes, content/type proof and a regression bind it to this exact state.

## Reference Proof

- Guarded generic Electron 42.3.0 loaded `/Applications/Obsidian.app/Contents/Resources/app.asar` with a fresh copied vault; never launched the native executable or opened a user vault/profile.
- Saved note: **447 bytes**, SHA `d0809aa41552429f25d34684faf6cbdefe748468514c204b01b7d1df9c13b478`, identical to `tocktutor-imported-properties.png`. Due **2026-10-01**, finished checked, rating **1e+21**, meeting **2026-09-29T14:45**; lists, tags, alias and structured object retain the authored values.
- The fixture registry was seeded only in the guarded vault's `.obsidian/types.json`: **162 bytes**, SHA `5672e9e6ab76279528ce46c6239771225aed672d969af4688305761e6f4e6798`. All eight native type widgets match it. Note and registry remain byte-identical after shutdown; original Obsidian user registry hash/mtime are unchanged.
- Real app commands Show file properties and Toggle fold properties opened the native sidebar and folded the duplicate in-note properties. The app-scoped resize handle widened the sidebar to **470 CSS pixels**, making the entire date-time, lists, alias and object legible. All eight rows are visible. No custom DOM/CSS, note editing or property editing.
- **1512 × 949 CSS pixels, DPR 2, 3024 × 1898 PNG pixels**, Live Preview, built-in dark/no skin. Native `theme: obsidian`, body `color-scheme: dark`; empty document inline color-scheme is recorded, not fabricated.
- Capture-time console/page errors and external requests: **0**. Final console reports **0 errors**, with one earlier startup warning not counted as a product bug. The initial probe timed out because it expected a `type` field; the installed app uses `widget`. Reading the actual native manager corrected the probe; no app code changed.
- Full owned trees stopped: final native **73618** (73622, 73623, 73624, 74001, 74002), diagnostic **72222** (72224, 72225, 72226, 73293, 73294), and inspection **72043** (72071, 72072). All returned `remaining: []`.

Obsidian displays the structured object with its native **Type mismatch, expected Text** warning; TockTutor displays **Use Source Mode**. Do not interpret the screenshot as identical controls, panel geometry, structured-value editing or a new TockTutor save test.

## Verification

- RED: `node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts` failed **3 checks** before the new reference; the new Imported Property Controls regression detects the missing native figure, provenance and exact values/types.
- Native rendered check: `playwright-cli -s=OWNED_NATIVE run-code --filename=/tmp/tocktutor-missing-reference-20260930/native-capture.js`, after attaching to the returned guarded endpoint and running `native-open.js` with the copied fixture/registry. Exact eight controls, values, warning, visible row bounds, geometry/theme and errors passed.
- GREEN: `node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts`: **15 passed, 0 failed** after publication.
- A fresh guarded Electron gallery check over a bounded loopback-only static server decoded both Surface 29 images at 3024 × 1898 pixels, with no missing placeholder, runtime errors or failed requests, at 1512 × 949 CSS pixels/DPR 2. Gallery root **74517** and its complete tree stopped; server **74490** stopped and absence was verified.
- Scoped whitespace and final capture-hash checks passed. No root build, installed smoke, account/candidate execution, sign-in, or source behavior changed.

Publication allows only `obsidian-imported-properties.png`; **all 72 existing screenshot files remain unchanged**. Evidence is in `.agents/uiux/tocktutor/content-alignment.json`; bounded scripts/logs/decoded geometry/OCR are in `/tmp/tocktutor-missing-reference-20260930`. Native PNG is 171,089 bytes, SHA `3a0070ce4cc21eb102b9f3fc7511c356ecd650b73a068bd572088ab0dc683d32`.

## Limitations

Original and reduced images could not be displayed inline. Local Vision OCR identifies Surface 29 and confirms legible native values; app-scoped rendered control/geometry checks verify the capture. No pixel-identical layout claim. Existing TockTutor save proof is retained, not rerun. Protected `AGENTS.md`, `tests/right-panel-layout.test.ts`, existing Playwright artifacts, and peer-owned OAuth/child/manager paths remain untouched. No push.
