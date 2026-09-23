## Review

**Scope:** Two read-only passes over the combined staged/unstaged integration of `origin/main eb79ef0f` into tutor `1286d8f3`. Reviewed the editor runtimes, route, editor surface, migrated tests, image/link authority, and shared CSS against both parents. Applied all three mandatory review references: simplification, security/hardening, and performance.

Paths below use `W = plugins/tocktutor/packages/tockteam-tocktutor-workbench`.

### Correct
- Main’s lossless CodeMirror Live Preview remains intact, alongside tutor’s note menu and search. Evidence: `W/src/live-preview-editor-runtime.tsx:5–24`, `W/src/route.tsx:5653–5731`.
- Raw-offset mapping, mixed-newline restoration, local/peer history separation, and authored-byte replacement limits remain intact after the performance fix. Evidence: `W/src/source-editor-runtime.tsx:47–79,283–287,495–607`; `W/src/route.tsx:3443–3461`.
- Migrated coverage retains real editor undo/redo, same-render synchronization, pane isolation, and stale search cancellation—not just replacement selectors. Evidence: `W/tests/editor-adapters.test.tsx:787–849`, `W/tests/route-split-panes.test.tsx:73–80`, `W/tests/route-panel-controls.test.tsx:2041–2077`.
- Legacy task/table callback handling was clarified with the supervisor: source-compatible props remain, while actual task edits use authored transactions through `onMarkdownChange`, matching main.

### Fixed
**P2 — Replace-all repeatedly scanned the remaining document.**

The parent fixed the finding at `W/src/source-editor-runtime.tsx:67–75`. Separator lookup is now lazy; single-line replacements bypass restoration, and multiline replacements reuse the deleted span’s separator basis. Empty newline insertions retain the existing fallback behavior. Generated output contains the same fix.

Regression coverage at `W/tests/merged-editor.test.tsx:8–26` exercises real CodeMirror transactions with 10,000 disjoint replacements. Its pass-through spy records regex input workload and restores itself in `finally`.

Evidence:
- `/tmp/tutor-main-integration-28-bulk-workload-red.txt`: both regressions failed before correction, recording approximately 30 billion input characters.
- `/tmp/tutor-main-integration-28-final-workbench.txt`: **359 Node tests and 601 component tests passed**.

No final latency claim is made.

### Final findings

No issues found.

### Verification and limitations
I performed **no writes, tests, builds, or independent execution**. I inspected source, both-parent diff artifacts, and parent-produced logs:

- `…-final-combined.diff`, `…-final-vs-main.diff`: final integration evidence.
- `…-final-types.txt`, `…-final-build.txt`: root/nested checks completed successfully.
- `…-assistant-serial.txt`: 167 Node + 12 component tests passed.
- `…-import-export.txt`: 104 tests passed.
- `…-final-root.txt`: **1405 passed, 5 sandbox/process permission failures, 18 skipped**. This is not an all-green environmental run.

All abbreviated log names above begin `/tmp/tutor-main-integration-28`.

**Real Desktop proof remains pending.** This review does not certify native effects, visual parity, or unrestricted OS behavior. The verdict applies to the combined working tree; `…-final-status.txt` still shows unstaged portions of the correction and generated artifacts, which must be included when staging the merge.

**Merge verdict: OK with notes.** The sole code finding is resolved; Desktop and environmental verification gaps remain explicitly open.