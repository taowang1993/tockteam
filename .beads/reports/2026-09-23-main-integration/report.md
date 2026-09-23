# TockTutor Main Integration

## Scope and State

Integrate `origin/main` (`eb79ef0f`, PR #2) into `tutor` (`1286d8f3`, PR #3), as explicitly approved by the user. Keep main’s source-preserving CodeMirror Live Preview and tutor’s note actions, Find/Replace, linked panes, transaction ownership, and recovery controls. The merge is resolved locally, independent code review found no remaining issues, and the fresh production Desktop gate passed all 98 assertions. Publication and fresh PR checks follow the local acceptance gates.

## Integration Changes

- Forward search, readiness, selection, and editor-view contracts through the new Live Preview adapter.
- Retain main’s controller-originated undoable formatting/property edits, with `localEditRevision` scoped to the originating pane. A peer update must clear stale history, not become an undoable local command.
- Apply Find/Replace through native CodeMirror transactions while retaining authored separators and exact undo/redo. Check the resulting authored UTF-8 bytes before dispatch, not only normalized editor bytes.
- Avoid scanning the remaining source for every replacement. Separator fallback is only needed for an empty multiline insertion; normal replacements use their own deleted span.
- Adapt active-editor tests to CodeMirror, retaining source preservation, owner/peer history, selection, security, and command coverage. Parent review restored the removed peer-history assertions and reproduced three failures before fixing ownership.
- Regenerate tracked outputs and the build manifest with the build commands. Preserve the CRLF-aware Better Sidebar adapter and update the automatically merged test to require byte-for-byte preservation.

## Verification

Commands below use the repository-pinned pnpm through `node node_modules/pnpm/bin/pnpm.cjs`.

| Check | Result |
| --- | --- |
| `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench test` | 359 Node tests and 601 component tests passed |
| `pnpm run typecheck:tocktutor` and `pnpm run typecheck` | Passed |
| `pnpm run build:tocktutor` and `pnpm run build` | Passed |
| `node scripts/tocktutor-build-manifest.mjs --check` | Passed |
| `node --test tests/*.test.ts` | 1,405 passed; 18 skipped; 5 environment-blocked failures |
| Note Vault / Vault Tools / Web Clip / Desktop suites | 99 / 15 / 65 / 57 tests passed |
| Assistant suite, serialized | 167 Node tests and 12 component tests passed |
| Import/Export suite | 104 tests passed |
| `pnpm run test:tocktutor` | Stops at Runtime host-death process inspection (`spawn EPERM`); follow-on packages checked separately |
| React Doctor, changed files against `origin/main` | 65/100, 57 warnings; includes generated copies and existing sequencing-sensitive warnings; no broad cleanup |
| Independent production Desktop gate | 98/98 assertions passed; zero page/console/unexpected request errors; all 24 processes stopped |
| Original 43 untracked Playwright files | Hashes unchanged; not staged |
| `gitleaks git --pre-commit --staged --redact --no-banner` | No leaks in the staged integration (11.51 MB scanned) |

The five root failures are the two existing macOS sandbox/build-hook checks and three process-snapshot/cleanup checks. No production bypass or test skip was added. A parallel follow-on package invocation exposed an Assistant packed-loader race while another package rebuilt its bundle; the repository’s normal test command already serializes workspaces. The serialized Assistant rerun passed unchanged.

### Regression Evidence

- Restored split-pane history assertions: three failures before per-pane revision ownership; Source and Live Preview pane/history cases now pass.
- Authored-byte boundary: a 2,000,000-byte CRLF note previously admitted a replacement that exceeded the limit after restoring its separator. The new regression rejects it without a change callback or undo entry.
- Bulk replacement: the original implementation scanned approximately 30 billion regex-input characters for 10,000 changes in a bounded note. Both single-line and multiline replacements failed the deterministic workload check before the fix. The final tests count actual regex input through a pass-through spy, restoring it in `finally`; they do not use a load-sensitive wall-clock threshold. Exact resulting content is also asserted.
- Native CodeMirror wrapping is checked in both active editor modes rather than asserting an obsolete ProseMirror stylesheet rule.

## Independent Gates

The first review completed its initial source pass and found the bulk-replacement scanning issue, then hit its 30-minute deadline before recheck. No Desktop verifier launched in that failed workflow. The partial diff was preserved, and the user explicitly chose **Continue the Checks**. Recovery workflow `e4ddcdda-bfb5-4544-9f89-7dd08b144353` resumes that reviewer, then runs a fresh Desktop verifier. The [independent review](independent-review.md) completed both passes with **Merge verdict: OK with notes**, no remaining code findings, and explicit environmental/native-proof limitations. The [independent Desktop verifier](independent-desktop-verification.md) passed all 98 assertions. [Proof](ui/proof.json), [screenshot hashes](ui/sha256.json), [driver](ui/desktop-verifier.mjs), and [full-tree cleanup](ui/cleanup.json) are published with the allowlisted screenshots.

### Desktop Harness Diagnosis

Both initial app trees were stopped completely: [first cleanup](desktop-first-cleanup.json), [second cleanup](desktop-second-cleanup.json). Their failed verification results remain preserved in `desktop-first-attempt.json`, `desktop-second-attempt.json`, and [the incomplete verifier report](desktop-incomplete-review.md); they are not acceptance passes.

The fresh attempt persisted the typed content but failed a harness assumption: a saved note’s watcher echo can reload it and replace the transient `saved.` message with `opened.` while the document remains saved. The stable UI proof is exact intended bytes plus disappearance of the active tab’s `Unsaved` indicator. The final passing verifier uses that contract, without production changes or removal of content/history assertions. Later attempts corrected undefined observation fields, ambiguous heading locators, and a missing pin precondition. Bound views follow their exact source tab; pinning it is required to retain the original note when navigation would otherwise reuse that tab. Attempts three through five and their cleanup remain preserved in the adjacent numbered artifacts. No screenshots from incomplete attempts are published as canonical proof.

The final run proves Source and Live Preview Find/Replace All with typing and grouped undo/redo, exact mixed separators, authored formatting preservation, pinned-bound Properties/Backlinks ownership while the editor opens another note, shared split-pane edits, stale peer-history clearing, and pane-local Find. It records 23 expected canceled `listTree` refreshes separately from zero unexpected/startup request failures. Task-checkbox interaction was not exercised; the explicitly labeled simple-formatting path was used.

### Published Screenshots

All three are 3024 × 1898 PNGs from a 1512 × 949 CSS viewport at DPR 2, built-in dark and no skin. They show the settled state after their flows, with Find closed:

- [Source After Replace and Redo](ui/source-find-replace.png)
- [Live Preview After Replace and Redo](ui/live-preview-find-replace.png)
- [Source Split Panes After Peer Editing and Local Find](ui/split-peer-find.png)

Five additional CLI snapshots created by the verifier during early diagnosis were identified and moved to its temporary evidence directory with its explicit permission. The original 43 files remain unchanged.

## Residual Boundaries

- OS clipboard effects, default-application association, actual native-open effects, and installed-app behavior remain uncertified. Issues `tockteam-yoam.12`, `.14`, and the parent epic remain open.
- The Desktop fixture intercepts clipboard writes and `shell.openPath`; it must not be presented as native-effects proof.
- A trailing blank line in `tests/trusted-raycast-translate-network.test.ts` is inherited unchanged from `origin/main`; the merge-relative cached whitespace check reports it. It is not an integration edit.
- Publication and fresh PR checks remain to be verified; the old PR checks do not validate this integrated head.
