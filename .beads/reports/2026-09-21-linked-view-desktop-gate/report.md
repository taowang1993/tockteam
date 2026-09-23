# Linked-View Desktop Verification

## Scope

Real Desktop verification now demonstrates the repaired linked-view event path and the behaviors below. **This is not complete note-menu parity or acceptance of all rename behavior.** Issues `tockteam-yoam.13` and `.17` remain open while the newly found rename/wikilink defect (`.21`) is addressed.

## Verified in Desktop

- Real peer Source edits and saves add/remove a Backlink in the independently bound Welcome pane without opening the global Backlinks utility. Undo restores the source before the second save.
- External filesystem creation, rename, and content editing add, rename, and remove the corresponding Backlink automatically. These were actual writes in the guard-owned fixture vault, not fabricated browser events.
- All five linked targets open as real layout leaves: Backlinks, Outgoing Links, and Properties below their source; Outline and Local Graph to its right. Focusing the other editor does not rebind them. Submenus remain inside the 1512 × 949 viewport and below the titlebar.
- A linked Properties edit saves the exact source with CRLF/frontmatter retained while the unrelated Welcome draft remains unsaved and its disk bytes unchanged. Actual Meta+B and Meta+S on the Properties field do not modify/save the unrelated editor. The temporary Properties screenshot caught the visible Saving state and is deliberately not published as settled-save proof; disk assertions and subsequent saved session state provide that evidence.
- Outgoing Links navigates its original source tab to Sibling while the unrelated Welcome/Backlinks binding remains unchanged. Reloading the application entry root restores exact layout, group/tab IDs, paths, modes, pins, and linked ownership. This is not a deep-link HTTP reload claim.
- Bound Pin propagates to the source tab. Source navigation retains a pinned target; detached Pin freezes it; Unpin follows the active editor. Closing the source detaches the linked Outline and follows the remaining editor without losing its dirty draft.
- Rename remaps the visible source tab and linked Properties path while preserving their group/tab IDs. **Inbound wikilink rewriting did not pass; see below.**
- Built-in dark/light and Deep Current, Jade Circuit, Porcelain, and Ember Dusk were selected through Settings and checked in the actual linked Properties surface. Skin identity is applied on `body` by the existing presenter; both root/body skin attributes are absent for Original. Canonical captures use explicit dark and no skin.
- At 800 × 949 CSS pixels, the Properties pane remains within the available 480px content width without pane overflow. This separately labeled narrow capture is 1600 × 1898 pixels, not a canonical parity screenshot.

## Corrections and Fresh Checks

The user approved adding exactly `note-vault/change:emit` to the sole pinned upstream Remote event source during owned packaging. The installed dependency remains unchanged. Version/export/SHA checks, prevalidation, atomic staged-file replacement, and full/quick/Nix hooks are covered.

Newly delivered events exposed foreground/background ownership collisions. Tree refresh now has independent cancellation; active-entry refresh uses the shared document record; pending rename owns its watcher echoes; recent-search publication cannot replace a newer tree; dirty navigation checks retained document state rather than source-byte equality. Independent final review found no remaining issue in the last corrections.

Parent RED/green logs are in `/tmp/tocktutor-linked-parent-races-20260921/`:

```sh
node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/route.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/vault-events-runtime.test.ts
```

**147 passed.** Includes real Runtime/event-source interleavings for delayed selection, active-file mutation, and committed rename with Markdown referrer rewriting. These deterministic response barriers use an in-process client carrier, not delayed Electron/WebSocket responses.

```sh
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/route-linked-panes.test.tsx tests/route-split-panes.test.tsx tests/route-panel-controls.test.tsx tests/editor-adapters.test.tsx tests/route-editor-readiness.test.tsx tests/note-outline.test.tsx --environment jsdom
```

**213 passed.** TockTutor/root typechecks, nested/root builds, manifest check, quick staging, and `git diff --check` passed. Parent also independently reran **15 staging checks** and verified the exported allowlist changed from 18 to 19 entries with only the approved event added.

`pnpm test`: **1363 passed, 5 failed, 18 skipped**. Remaining failures concern sandbox/process `EPERM` checks in marketplace and trusted-Raycast tests. A sixth failure was a stale Tailwind utility inventory: the CSS utility already existed at HEAD. Updating that exact inventory made all four Tailwind tests pass; no UI/style source was changed for this correction. Do not describe the full repository suite as green. Full deployment/Nix/installed smokes were not run.

## Remaining Rename Defect

After real Desktop rename `Notes/中文 Source.md` → `Notes/Renamed 中文 Source.md`, the old path is absent and the linked pane correctly tracks the new path, but `Notes/Sibling.md` still contains `[[中文 Source]]`. The shared planner currently scans Markdown inline/reference destinations, not wikilinks. Tracked as `tockteam-yoam.21`; no claim that all inbound links were preserved.

The renamed source also normalizes `[Sibling](Sibling.md)` to `[Sibling](./Sibling.md)` through the existing relative-link rewrite helper. CRLF/frontmatter remain unchanged. Rename therefore is not a byte-identical operation. The initial exact-rename disk assertion failed and is not counted as a pass.

## Capture and Cleanup

- Run `6c01027e-f21d-4969-89fc-22c8c376c4cc`, root PID94115: primary relationship/placement/save/pin/restore checks. All18 tracked processes stopped; `remaining:[]`.
- Run `f3cb6d01-6e89-4172-9faf-c6ad61537cd0`, root PID96330: rename/theme/narrow checks. All9 tracked processes stopped; `remaining:[]`.
- Extended display11, unfocused window `(1512,30,1366,994)`. Canonical CSS1512 × 949, DPR2, PNG3024 × 1898. No user app/profile/clipboard was modified; the native clipboard sink was intercepted and external app effects remained denied.
- No runtime console errors. Electron's development insecure-CSP warning appears once per renderer load; the first run reloaded once. This warning was not suppressed.
- Two harness errors were corrected: unavailable `URL` global in Playwright run-code and the Rename menu's accessible name (`Rename Note`, without the visible ellipsis). Theme verification was corrected to inspect the presenter's actual `body` skin attribute as well as the canonical root check. Failed attempts are not counted as acceptance.
- `proof.json` retains actual result objects, placement, cleanup records, image dimensions/hashes, and explicit limitations. Only the inspected allowlisted screenshots were copied into the published directory, transactionally.

## Next Work

Repair and verify `.21`, finish linked-view acceptance, then carefully integrate launcher commits `427317e6`, `006f2ccd`, and `0b6fdd66` without dropping Tutor search/selection/Properties/Outline/shared-document callbacks. Default-app dispatch, recoverable merge, and final full-menu verification remain outstanding. No Git staging, commit, push, or worktree creation was performed here.
