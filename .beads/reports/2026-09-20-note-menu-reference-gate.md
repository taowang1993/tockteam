# Note-Menu Reference Gate

## Authority and Environment

The user requested end-to-end implementation, then approved fixing the guarded launcher and specifically selected **Fill the Extended Display**, not macOS full-screen Spaces. All product feature groups remain required.

Reference: installed Obsidian **1.13.7**, archive SHA-256 `a52a7daf1e2460bae03de80f2816604bd16a56cd374fbe5ce8d1a9ef5604059d`. A fresh extraction and disposable fixture live under `/tmp/tocktutor-menu-e2e-20260920`; no existing user vault/profile was attached. Only core plugins were seeded; no third-party plugins or CSS skin.

The first guarded startup failed before window visibility with `Invalid url pattern app://*/*: Wrong scheme type`. The approved fix permits a bounded JSON sidecar declaring custom schemes before Electron readiness; target code still loads only after display validation and window-guard installation. A short isolated HOME avoids Obsidian's CLI socket colliding with the user's socket. HOME changed only after verifying the launch's `--use-mock-keychain` flag. Protocol registration and updater behavior were intercepted; native dialogs/external opens stayed blocked.

## Placement and Cleanup

- Extended display: Sidecar ID **10**, work area **x1512/y30/1366×994**.
- Latest run: `d7e712a1-e355-40b9-a36e-34ccfa162f59`, root PID **90949**.
- Window visible at exactly that work area, **focused:false**, before screenshot capture.
- Owned CDP emulation verified **1512×949 CSS**, **devicePixelRatio 2**, built-in dark; PNGs verified **3024×1898**.
- Explicit stop returned `remaining:[]` for PIDs `90949,90951,90952,90953,91542,91543`.
- Earlier reference run `36685d6e-91cf-4b5b-bcff-56739deab971` also explicitly stopped with `remaining:[]`. Its screenshots used the correct CSS/PNG geometry but a smaller physical window; they are interaction research only, not the new display-filling capture baseline.
- Runtime console: **0 errors**, one Electron development CSP warning from unmodified Obsidian. This does not authorize weaker TockTutor renderer security.

## Reference Matrix

| Group | Observed Interaction | TockTutor Contract / Adaptation |
| --- | --- | --- |
| Reveal File in Navigation | With Notes collapsed, Reveal expanded it and made the exact Source row visible with `is-active has-focus is-flashing`; the active document stayed Notes/Source.md. | Expand exact ancestors, restore Files from Search, preserve drafts/selection, scroll/focus exact row. Reference reveal flow exercised through the actual menu. |
| Edit Bookmark | `Bookmark...` opens `Add bookmark`; fields Path (disabled), Title, Bookmark group, Cancel/Save. After saving, menu says `Edit bookmark` (no ellipsis); edit dialog adds Remove. | Use Title Case and the plan's ellipsis convention. Stable IDs, persisted title/group, cancellation and storage failure safety. Do not rename the note. |
| Copy Path | Three reference targets: `as Obsidian URL`, `from vault folder`, `from system root`. | Scoped adaptation is Copy Relative Path and Copy Absolute Path only; no new Obsidian URI protocol. Absolute copy remains Host/main owned. No real clipboard effect was triggered. |
| Find / Replace | Inline Find field, current/total (`1 / 2` for alpha), Previous/Next/Find all and Exit search. Replace expands same strip with Replace/Replace all. No case/whole-word/regex option buttons appeared in this note-local strip. Formatted `alpha **alpha**` became `omega **omega**`; a single editor undo restored the exact source. | Reuse installed editor facilities and one inline strip. Do not add speculative matching controls from vault search. Source and Reading both returned `1 / 2` for alpha in a follow-up run. Reading→Replace did not yield a stable visible replace strip in this probe; implement the plan's explicit return-to-editing behavior as an intentional adaptation rather than claim exact reference parity. |
| Split Right / Down | Three real Source panes were rendered: left top and left bottom 584×434.5, right 584×909. Each has independent header/editor. New leaf became active. | Real bounded recursive layout; independent view state, coherent shared drafts, persisted ratios and collapse-on-close. Initial immediate measurements raced new-leaf rendering; use the later stabilized measurements in `reference-linked-proof.txt`. |
| Open Linked View | Five targets: Open local graph, Open backlinks, Open outgoing links, **Open file properties**, Open outline. Outline opened a real adjacent leaf sharing an explicit group with its source. Following source to Sibling updated its outline; focusing an unrelated Source pane left the linked outline on Sibling. Tabs expose Unlink tab. | Include Properties in the verified target set. Reuse existing properties presentation in the same note-bound layout, not a global utility toggle. Estimate: one small additional vertical slice after source binding, with follow/focus/close/rename tests; no new service or dependencies. Follow-up opened all five targets through the menu and verified each bound file/group. Local Graph/Outline appear to the right; Backlinks/Outgoing Links/Properties appear below. |
| Open in Default App | Entry confirmed; actual associated-app launching intentionally not attempted under the guard. | Save/revalidate then narrowly authorized OS dispatch. Intercepted tests do not prove actual external-app opening. Keep this native evidence gap explicit. |
| Merge Entire File With | Searchable destination picker: arrows navigate, Enter merges, Shift+Enter prepends, Cmd+Enter creates new. Confirmation names source/destination and says source will be deleted; Merge/Cancel and Don't ask again. Preview/cancel preserved exact file contents. Fixture apply appended source body, combined frontmatter with **source winning the conflicting shared property**, and moved Source to isolated local `.trash/Source.md`. Relative link text stayed unchanged. Immediate inbound-note snapshot still contained `[[Source]]`; eventual rewrite behavior was not established. | Intentional safety improvements: revision-bound review, explicit property resolution, relative-link rebasing/conflict checks, recoverable phase journal, and idempotent apply. Do not silently copy the reference's property overwrite or claim verified inbound rewrites. New-note creation is observed but outside the plan's existing-destination merge scope. |

## Menu Geometry

Measured before splitting: width **195.84 CSS px**, row height **24.90 px**, row padding **4px 8px**, outer inset **7px**, radius **8px**, separator/inter-group gap **13px**. Menu box started at x1304/y72.67. Title Case labels may require more width. Reuse existing semantic typography and menu primitives, not a global scale override.

## Evidence

Temporary interaction logs in `/tmp/tocktutor-menu-e2e-20260920/`:

- `reference-filled-submenu-proof.txt`: both fully visible submenu target sets, waited for the actual submenu row rather than a guessed delay.
- `reference-more-proof.txt`: exact-row reveal, all five source-bound linked targets and their placement, Source/Reading search counts. Run `e6cb66a2-5baf-41de-a0b3-6ac46f6b2419`, root PID91915, stopped with all six owned PIDs gone.
- `reference-edit-split-proof.txt`: exact replace/undo source evidence; initial layout measurements are explicitly superseded by stabilized evidence.
- `reference-linked-proof.txt`: stabilized pane geometry, source group identity, and linked navigation.
- `reference-merge-preview-proof.txt`: confirmation copy and exact unchanged contents after cancellation.
- `reference-merge-apply-proof.txt`: fixture merge result and recoverable local trash.
- `reference-filled-display-menu.png`, `reference-filled-copy-submenu.png`, `reference-filled-linked-submenu.png`: new display-filling geometry captures; not yet published over canonical repository screenshots.

Older `reference-copy-submenu.png` and `reference-linked-submenu.png` were captured too early and must not be published as submenu evidence. Use only the later `reference-filled-*` captures after image inspection.

## Remaining Gate Work

This report is concrete reference research, **not full parity completion**. The observed reference matrix now permits menu alignment and implementation with the documented safety adaptations; it does not establish untested OS effects, eventual inbound rewrites, or an exact Reading→Replace transition. Align the actual TockTutor menu and run its keyboard/collision/theme/runtime proofs before closing `tockteam-yoam.2` or proceeding to dependent feature slices. Guard startup/display fix is tracked separately in `.16`. No product feature is declared shipped by this report.
