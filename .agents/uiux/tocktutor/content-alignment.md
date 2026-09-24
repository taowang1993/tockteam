# TockTutor and Obsidian Content Alignment

## Note Menu Refresh — 2026-09-24

Replaced the temporary component-test image with a real TockTutor Desktop capture of the isolated Comparison Vault. The shared note is now named `comparison.md` (including the gallery’s canonical Markdown file), with the original 1,324 bytes and SHA-256 unchanged. The menu offers Reading View and Source Mode, without a Live Preview item; note actions are connected to the real Host. Capture geometry is 1512 × 949 CSS pixels at 2×, built-in dark/no skin, with no renderer errors during monitored route reload and capture.

The user approved retaining Obsidian’s earlier screenshot with the former `UIUX Comparison.md` filename. Its content hash is identical, but its filename is explicitly not claimed to match. Refreshing Obsidian through the required guarded launcher failed before creating a window (`protocol.registerSchemesAsPrivileged should be called before app is ready`); no alternate launch or user-app attachment was attempted. Its failed-launch PID was verified absent. TockTutor’s complete observed process tree was stopped with no remaining PIDs. The JSON proof’s `menuRefresh` records the capture, approval, and cleanup. All other screenshots and their historical filename evidence remain unchanged.

## Original Capture Result

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
