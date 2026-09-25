# TockTutor and Obsidian Content Alignment

## Fenced Language Highlighting and Footnote Alignment — 2026-09-25

Retook only `tocktutor-live-preview-lower.png` from guarded Desktop at `4919d781` after moving the definition label `context` up 4 CSS pixels to align visually with “Footnotes”. The authored note and its `ts` fence retain SHA-256 `3a55316a7e1628a2a4e7c7167662556322c10ae1691a7cfe519856cbade091e5`. A separate isolated Live Preview note verified that authored `python`, `rust`, and `sql` fences display Python, Rust, and SQL with colored tokens, without guessing code content. Both guarded runs used 1512 × 949 CSS pixels at DPR 2, dark/no skin, and stopped with no descendants. The canonical screenshot is 3024 × 1898 pixels at scrollTop 700; TypeScript, Copy, Data, Code and Notes, Small Heading, and the inline `[^context]` reference remain visible; no capture-time console/page errors. All 62 other screenshots, including 29 Obsidian references, retained their hashes. Detailed evidence is in `content-alignment.json`.

## Footnote Label Parity Retake — 2026-09-25

Retook only `tocktutor-live-preview-lower.png` from guarded Desktop at `7a219593`, correcting the previous parity claim: the inline `[^context]` marker was still monospace and bright, while the definition `context` was 16px and white. Both are now 12px and muted in the note font; the definition remains inline beside “Footnotes”. The authored note SHA-256 is unchanged. Capture at 1512 × 949 CSS pixels and DPR 2 (3024 × 1898 device pixels) confirmed dark/no skin, Live Preview route, scrollTop 700, Data/Code and Notes/Small Heading, TypeScript and Copy, and zero capture-time console/page errors. Guarded run stopped with no descendants. All 62 other screenshots, including 29 Obsidian references, retained their hashes. Detailed evidence is in `content-alignment.json`.

## Display-Only Language and Bracketed Footnote Reference — 2026-09-25

Retook only `tocktutor-live-preview-lower.png` from guarded Desktop at `9f89f1e4`. The 1512 × 949 CSS-pixel, 2× dark/no-skin Live Preview retains the authored `ts` fence and syntax colors while displaying “TypeScript” without a dropdown; Copy remains separate. The inline footnote now visibly reads `[^context]` in muted 12px type like the Obsidian reference, while the definition remains intact. The shared comparison note SHA-256 is unchanged. Data, Code and Notes, and Small Heading are visible at scrollTop 700. Capture-time console/page errors were empty; the app tree stopped with no descendants. All 62 other screenshots, including 29 Obsidian references, retained their hashes. Detailed route, geometry, mode, styling, checksums and cleanup are in `content-alignment.json`.

## Full Language, Spacing, and Footnote Retake — 2026-09-25

Retook only `tocktutor-live-preview-lower.png` from the source-built Desktop at `e807b5a8`. The built-in dark/no-skin Live Preview at 1512 × 949 CSS pixels and 2× (3024 × 1898 pixels) shows “TypeScript” without changing the authored `ts` fence, separate visible Copy control, new heading/code spacing, and “context” inline before its footnote definition. Verified the Data, Code and Notes, and Small Heading sections at scrollTop 700; the fixture note and canonical comparison note retain the same SHA-256. The guarded app process tree stopped with no descendants. Capture-time console/page errors were empty; all 62 other images, including 29 Obsidian references, retain their hashes. Detailed geometry, styles, route, mode, hashes, and cleanup are in `content-alignment.json`.

## Live Preview Language and Copy Controls — 2026-09-25

Refreshed only `tocktutor-live-preview-lower.png` from the source-built Desktop. The `ts` language picker and a separate Lucide Copy icon are visible at the top right without hover, and both stay visible while editing. Focusing the code reveals display-only opening and closing fences (the opening fence reads “```ts”); the note source is unchanged. The Copy icon becomes Copy Check after a successful copy and resets; an isolated renderer-local clipboard stub verified this without touching the OS clipboard. The normal-state screenshot is 1512 × 949 CSS pixels at 2× (3024 × 1898), built-in dark with no active skin. Final capture-time console/page errors were empty, the guarded app tree stopped with no descendants, and `content-alignment.json` records the route, computed visibility, modes, hash, and cleanup. All 62 other screenshots, including every Obsidian reference, retained their hashes.

## Compact Live Preview Table and Code Retake — 2026-09-25

Refreshed only `tocktutor-live-preview-lower.png` from the isolated source-built Desktop. Its Data table is left-aligned at 348.5px within the 700px editor, with stronger semantic-token borders; the `ts` code fence renders colored `const` and string tokens; and the authored lines “A soft line ends here.” / “This sentence follows without a blank line.” render on separate lines without rewriting the note. The lower view shows Data, Code and Notes, and Small Heading at scrollTop 700. The capture is 1512 × 949 CSS pixels at 2× (3024 × 1898), built-in dark, no active skin, and had no capture-time console or renderer errors. The guarded Desktop process tree stopped with no descendants. `content-alignment.json` records the new image hash, route, computed colors, geometry, and cleanup; the other 62 screenshots, including all Obsidian references, retained their hashes.

## Focused Heading Scale Retake — 2026-09-25

Retook the two TockTutor Live Preview screenshots visible in the reported gallery comparison: `tocktutor-editor-live-preview.png` and `tocktutor-live-preview-lower.png`. The source-built Desktop at `e1b84268` renders H1 at 26px, H2 at 24px, H3 at 20px, and H4 at 19px; the top view shows Markdown Rendering Lab, Structure, and Lists, while the lower view shows Data, Code and Notes, and Small Heading. Both are genuine 1512 × 949 CSS-pixel, 2× (3024 × 1898) captures of the shared note in Live Preview, with the built-in dark theme and no active skin. The startup TockCoder route again logged `workspaces.startSession is not a function` before switching to TockTutor; the capture-time console, page, and renderer error lists are empty. The guarded Electron process tree stopped with no descendants. Both new hashes and heading/scroll evidence are in `content-alignment.json`; all 61 other screenshots, including every Obsidian reference, retained their prior hashes. Other TockTutor gallery screenshots were not retaken in this focused request.

## Lower Live Preview Pair — 2026-09-25

Added a fresh, scrolled comparison of the identical `UIUX Comparison.md` note in TockTeam Desktop and Obsidian 1.13.7. Both captures show Data, Code and Notes, and Small Heading in Live Preview at 1512 × 949 CSS pixels and 2× scale (3024 × 1898 pixels), using each product’s built-in dark theme and no TockTeam skin. Per-image hashes, visible-section and scroll evidence, theme, route, and error monitoring are in `content-alignment.json`.

The TockCoder startup route logged the previously observed `workspaces.startSession is not a function` error before switching to TockTutor; it is recorded separately from the clean TockTutor capture. The guarded TockTeam and Obsidian process trees were both stopped with no remaining descendants. No existing Obsidian screenshot was changed. A browser smoke of the updated gallery was blocked because `extended_display` found no eligible secondary display; its bounded loopback server was stopped and the port closed, with no alternate launch attempted.

## Focused Bullet and Link Retake — 2026-09-25

At `91fa6ef4`, Crepe’s nested bullet SVG now takes the same text color as the list; links still use the *same* `--dsw-specific-markdown-accent` as checked task boxes. Inspection found no link opacity/filter difference: both computed to `rgb(166, 138, 249)` in built-in dark mode. The thinner link glyphs appeared darker against the solid checkbox fill, so links now use font weight 500 rather than introducing a second purple. The note accent has two theme values: `#705dcf` in light mode and `#a68af9` in dark mode; tags are tinted blends, not another link/checkbox accent.

Only `tocktutor-tag-tab-polish.png` was retaken. Its verified 1512 × 949 CSS-pixel, 2× Desktop capture records the Live Preview route, corrected paragraph, dark/no-skin state, matching link/checkbox color, matching bullet/text color, font weight, and zero runtime/console errors in `content-alignment.json`. The bounded Electron process tree stopped without descendants. Every other screenshot, including all 28 Obsidian images, retained its previous hash; a full retake is deferred until requested.

## Live Preview Styling — 2026-09-24

The gallery exposed three style gaps in TockTutor’s Live Preview: links inherited white, ordered markers inherited Crepe’s 12%-opacity outline color, and task icons inherited that same dim fill. At `02e96f0e`, the shared Crepe utility styles links and checked task icons with the Markdown purple, number labels with the note text, and unchecked outlines at 55% text opacity. Crepe draws a 18-unit checkbox inside a 24-unit SVG, so the SVG is 21⅓px wide to show a 16px glyph matching the frontmatter checkbox.

At 1512 × 949 CSS pixels and 2× scale, Playwright verified computed link, marker, and icon colors; 16px visible task/frontmatter checkbox sizes; dark theme/no skin; and no renderer or console errors. Twenty-one verified Live Preview screenshots were transactionally replaced (3024 × 1898 PNGs), with per-image hashes and computed-style evidence in `content-alignment.json`. All 28 Obsidian images were byte-identical; both owned Electron trees stopped without descendants. Source and Reading View screenshots were excluded because they have no Live Preview controls; the Assistant button was absent in this attempt, and Web Viewer was outside this focused batch, so their earlier images remain. No failed-attempt image was published. The supplemental Reader View limitation below remains unresolved.

## Live Preview Correction — 2026-09-24

The TockTutor vault note and the gallery’s `comparison.md` have the same SHA-256 (`3a55316a7e1628a2a4e7c7167662556322c10ae1691a7cfe519856cbade091e5`), but the earlier Live Preview screenshots visibly inserted `[^context]` footnote text after “highlighting” and inside links. The inline-preview widget had appended *every* definition, including footnotes, to each small fragment it rendered. At `81f533aa`, it now appends link definitions only; the standalone footnote remains in its own definition. A component regression test first reproduced the incorrect rendered paragraph, then passed after the change.

After rebuilding and refreshing the staged runtime, 23 note-facing TockTutor captures were replaced only after Playwright verified the visible first paragraph reads “Use bold, italic, bold italic, strikethrough, highlighting, and inline code in one paragraph.” without a footnote inserted. The images are 3024 × 1898 pixels from 1512 × 949 CSS pixels at 2× with the built-in dark theme and no skin; route, note, mode, console/page errors, and renderer events were checked. All 28 Obsidian images remained byte-identical. Both owned Electron process trees were stopped with no remaining descendants. Per-image hashes and evidence are in `content-alignment.json`.

**Remaining limitation:** The supplemental `tocktutor-web-viewer-reader.png` was not replaced. Reader View remained loading after the final-batch attempt and one focused retry, despite Example Domain loading in the ordinary Web Viewer. The earlier Reader View PNG and its original metadata remain intact; it still shows the old Live Preview text behind the Reader View panel. No failed or loading capture was published. A future corrected Reader View capture must verify the article is visible and the Page View control is enabled before replacing it.

## Screenshot Refresh — 2026-09-24

Retook all 33 TockTutor screenshots against the source-built Desktop at `3c579a86812f22e08a920e15118ea7166db5fa3c`. Every published image is 3024 × 1898 pixels from a 1512 × 949 CSS viewport at 2×, with the built-in dark theme and no skin. The 28 Obsidian reference images were not modified; their before/after SHA-256 hashes match.

Thirty-one images came from the final capture batch. The Web Viewer and Reader View pair came from a successful focused capture earlier in the same refresh against the same build. A later full-batch attempt timed out waiting for the external page and logged an HTTP 400; those failed-attempt images were not published. That focused run verified the rendered Example Domain page, Reader View article, geometry, theme, and injected window error/unhandledrejection listeners. It did not install Playwright console/pageerror listeners, so its console state is not claimed. The final batch had no renderer error/unhandledrejection events; its only console error was the failed Web Viewer request.

No application source was edited or rebuilt for this screenshot-only refresh. Candidates were checked against the exact 33-file TockTutor allowlist, PNG dimensions, hashes, route/content/mode, and theme before transactional publication. Both Electron process trees were stopped through `extended_display`; no descendants remained. Current per-image proof and hashes are in `content-alignment.json`.

> The remaining sections preserve historical baseline and menu-refresh notes; their source commits and capture-specific runtime details predate this screenshot refresh.

## Historical Note Menu Refresh — 2026-09-24

Replaced the temporary component-test image with a real TockTutor Desktop capture of the isolated Comparison Vault. The shared note is now named `comparison.md` (including the gallery’s canonical Markdown file), with the original 1,324 bytes and SHA-256 unchanged. The menu offers Reading View and Source Mode, without a Live Preview item; note actions are connected to the real Host. Capture geometry is 1512 × 949 CSS pixels at 2×, built-in dark/no skin, with no renderer errors during monitored route reload and capture.

The user approved retaining Obsidian’s earlier screenshot with the former `UIUX Comparison.md` filename. Its content hash is identical, but its filename is explicitly not claimed to match. Refreshing Obsidian through the required guarded launcher failed before creating a window (`protocol.registerSchemesAsPrivileged should be called before app is ready`); no alternate launch or user-app attachment was attempted. Its failed-launch PID was verified absent. TockTutor’s complete observed process tree was stopped with no remaining PIDs. The JSON proof’s `menuRefresh` records the capture, approval, and cleanup. All other screenshots and their historical filename evidence remain unchanged.

## Historical Original Capture Result

Retook all 32 existing TockTutor screenshots and all 25 existing Obsidian references. Added four captures: Claudian, expanded Obsidian unlinked mentions, and a dedicated Reading Embed pair. The gallery now contains **55 distinct images**, with **6 supplemental images** retained and refreshed (61 total).

- Gallery: `.agents/uiux/tocktutor/tocktutor.html`
- Machine-readable evidence: `.agents/uiux/tocktutor/content-alignment.json`
- TockTutor source: `ce91d652053a63a7a10e10d00e12e51ef9392c69`
- References: installed Obsidian **1.13.7**, installed **Claudian 2.3.0** (`realclaudian`).
- Every PNG: **1512 × 949 CSS pixels**, **2× device scale**, **3024 × 1898 pixels**. Built-in dark theme; no TockTeam skin.

## Matched Content

| Surfaces | Shared Content and State |
| --- | --- |
| Workspace, Polish, Live Preview, Reading, Source | `UIUX Comparison.md`, copied from the shared Markdown file (now `comparison.md`); matching editor modes and top-of-note state |
| Note Actions, Commands, Note Tools | The same note underneath each real menu/command surface; empty command query, or `Note composer` for Obsidian’s closest Note Tools reference |
| Properties, Backlinks, Tags, Bookmarks, Panes | The same vault and `UIUX Comparison.md`; one linked source (`Study Guide.md`), one unlinked mention (`Mention.md`), and the same bookmarked note |
| Expanded Unlinked Mentions | Both apps expand the mention from `Mention.md`; no longer compared against a collapsed reference |
| Search | Query `Markdown`, same vault, no additional filters |
| Recovery | Snapshot of the same exact Markdown; Obsidian’s snapshot is selected, not an empty recovery dialog |
| New Note | Empty `Untitled.md`, opened after creation; TockTutor’s pre-create dialog is supplemental |
| Graph | Same vault/link data: 8 global nodes; 4 local nodes around `UIUX Comparison.md`, depth 2 and both directions. Obsidian hides unresolved links and excludes the Base file from its graph to match TockTutor’s node set. |
| Attachments and Embeds | Original `Notes/Welcome.md` and `Attachments/pixel.png`; dedicated Reading Embed images avoid reusing the different Markdown Rendering Lab Reading images |
| Assistant | Same Markdown note in Live Preview beside an empty conversation; Obsidian uses the real Claudian plugin, not a placeholder |
| Base and Canvas | Same original fixture data; application serialization differences are explicitly recorded below |
| Web Viewer | Both load `https://example.com/` (Example Domain); TockTutor’s Reader View is supplemental |

The main shared note is **1,324 bytes**, SHA-256 `3a55316a7e1628a2a4e7c7167662556322c10ae1691a7cfe519856cbade091e5`. Every Markdown file and attachment matches byte-for-byte between the isolated vaults. The JSON proof records the complete fixture inventory, per-capture content hashes, paired paths/modes, screenshot hashes, and sizes.

Obsidian automatically rewrites Base YAML and equivalent field identifiers (`note.status`/`note.points` become `status`/`points` in view configuration). It also reformats Canvas JSON. Parsed Base data after that documented identifier normalization, and parsed Canvas data without any semantic normalization, were deep-equal. These are **semantic matches**, not falsely claimed byte-identical files.

## Capture and Publication

Used bounded Playwright browser sessions connected to each Electron application over CDP. TockTutor was built and staged with:

```sh
pnpm run build:tocktutor
pnpm run build
node scripts/stage-dsh.mjs --quick
```

The capture run used temporary profiles and two isolated `Comparison Vault` copies. The existing parity vault was copied into each, then the shared note and identical small linked/unlinked-note fixtures were added. Claudian’s installed code was copied into the temporary Obsidian vault; no user conversations or plugin credentials were copied, and no AI prompt was sent.

TockTutor used its existing authenticated inactive-window proof mode. Obsidian was launched with `open -g -n`; actions were app-scoped Playwright/Obsidian commands, not OS mouse, keyboard, or foreground takeover. Both launches passed `--use-mock-keychain` before `--user-data-dir`; HOME was preserved. Obsidian’s existing `nativeMenus` preference was disabled only in the temporary profile to capture its real in-app menu.

All candidate images were staged outside the repository. Publication checked an exact 61-file allowlist, every PNG dimension and hash, and successful process cleanup before replacing the screenshot directory through a same-filesystem staged-directory transaction with rollback. No unrelated screenshot files were added or removed. The earlier utility proof is explicitly marked historical/superseded rather than rewritten to claim its old checks apply to these new images.

## Runtime Observations and Limits

- No renderer `error` or `unhandledrejection` events were observed during monitored main-window capture batches.
- Appearance, Community Plugins, and Vault Switcher were recaptured with Playwright error listeners installed before window creation or reload. All published captures now have monitored runtime-error evidence; no separate-window zero-error fallback is used.
- The initial TockCoder startup logged `TypeError: workspaces.startSession is not a function` before switching to TockTutor. The development Electron CSP warning was also retained. Neither is hidden by the screenshot refresh or claimed fixed.
- Settings, plugin catalogs, provider/model controls, Note Tools, and workspace controls are product-specific. Their captions identify approximate comparisons; no UI or catalog data was fabricated to make products identical. Reviews remains the only surface without an Obsidian counterpart.
- Rendering differences are intentionally preserved: layout, text wrapping, syntax treatment, panel widths, and how much content fits remain available for visual comparison.

## Cleanup and Verification

The complete observed Electron/Obsidian/runtime process trees were stopped and checked absent before publication. The JSON includes observed PIDs, no remaining processes, and zero TockTutor focus-proof faults. The initial missing-Electron-executable attempt was cleaned up before installing Electron through the repository’s existing helper and retrying. The two named browser sessions were detached.

Regression checks:

```sh
node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts
```

Result: **4/4 tests passed**; `git diff --check` passed. The new alignment check was run first and failed because the gallery had no Claudian reference. Final tests cover the complete gallery/supplemental inventory, links, geometry, hashes, theme, matched note content, graph node settings, semantic-fixture evidence, cleanup, and runtime observations. A bounded headless Playwright gallery check additionally verifies that every linked image loads at the expected native size.
