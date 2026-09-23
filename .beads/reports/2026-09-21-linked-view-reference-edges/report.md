# Linked-View Reference Edges

## Decision

The user explicitly chose **Match Obsidian (Recommended)** after reviewing these findings. The earlier proposal that unlinking always freezes the last file is rejected. These observations govern the next implementation; they are not TockTutor implementation acceptance.

## Observed Behavior

| Action | Settled Reference Behavior | Evidence |
| --- | --- | --- |
| Pin a linked Outline | Both the source Markdown tab and its linked Outline become pinned. Navigating the source to Sibling creates a new Markdown tab; the original tab and Outline remain on Source. | `pin-result.txt` |
| Unpin, then unlink Outline | Binding is removed. The unlinked, unpinned Outline follows the active editor globally, including Sibling then Source. Unlink does not freeze the file. | `unlink-settled.txt` |
| Close an unpinned source tab | Its linked Outline survives, loses its group binding, and targets the remaining Sibling editor. | `source-close-initial.txt` |
| Click Destination in bound Outgoing Links | The original Markdown leaf navigates to Destination; its linked outgoing view also targets Destination. The original source leaf ID and group remain the same. | `outgoing-before.txt`, `outgoing-navigation.txt` |
| Unlink Outgoing Links, then pin it | Only the unlinked outgoing view is pinned. Navigating the editor to Sibling leaves this view on Destination. | `detached-pin.txt` |

The initial unlink snapshot raced asynchronous view updates. Only `unlink-settled.txt` supports the final unlink conclusion. The source-close record shows the previously bound Outline following Sibling; unrelated unlinked sidebar snapshots in that same immediate record had not all settled.

## Approved Implementation Contract

- Bind source group **and source tab** identity. Do not confuse a tab replacement with opening another tab in the same pane.
- While bound, derive pin ownership from the source tab and propagate Pin/Unpin across its linked views.
- Unlinked/unpinned views follow the active editor; unlinked/pinned views retain their represented file. Focusing a linked view must not replace the remembered active editor with itself.
- Label binding/follow/pin state clearly. Bound navigation targets its explicit source tab using existing navigation/pin rules. Detached navigation targets the remembered active editor, or safely opens an editor when none exists.
- Preserve pin state when a source disappears. No active editor means an explicit empty state for following views, not stale data.
- Validate persisted group/tab relationships, paths, kinds and vault identity; reject cycles and linked-to-linked binding. Missing-source restore normalizes defensively to unlinked behavior with preserved pin state.
- Reuse one controller and authoritative document records. Properties changes and Outline jumps operate on the represented document, with existing revision/ownership guards.

Pinned-source-close and malformed/missing-source restoration were not directly exercised in Obsidian. Their handling above is the approved compositional/recovery contract, not claimed reference proof. Edge interactions were tested on Outline and Outgoing Links; do not claim each edge was separately tested for all five view types.

## Isolation and Cleanup

Fresh extraction from installed Obsidian1.13.7, archive SHA256 `a52a7daf1e2460bae03de80f2816604bd16a56cd374fbe5ce8d1a9ef5604059d`, into `/tmp/tocktutor-linked-reference-FVS6lv`. Fresh disposable vault/profile; no user application or vault attached. The guarded adapter verifies `--use-mock-keychain` before isolated HOME and blocks protocol registration/native external effects.

Initial startup missed the extracted renderer module-resolution symlink: `Cannot find module '@electron/remote'`, then `getCurrentWindow` failure. Run `01261264-e7ce-4ac0-9776-de61b67443cf`, root13034, stopped with all four tracked PIDs gone. Adding the extraction-local `node_modules -> launcher/node_modules` symlink fixed that harness-only issue; no product or security changes.

Successful guarded run `52df71a7-d6f2-4053-b861-9ac75a8fbe2b`, root13278, extended display11. Guarded placement x1512/y30,1366×994; research viewport1512×949,DPR2, built-in dark. Final console zero errors, one development CSP warning and one developer-console log. Stopped PIDs13278,13280,13281,13282,14254,14255; `remaining:[]`. No screenshots are published by this report.

Raw result records and console are preserved in the adjacent `proof.json`. Temporary scripts/full logs remain under the extraction directory.
