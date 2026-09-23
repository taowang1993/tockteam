# TockTutor Note-Menu Review and Verification

## Result

All P1/P2 findings from the full-diff review were corrected. Four retained independent reviewers accepted the fixes: runtime, controller, editors, and native boundaries. A fresh verifier drove the production Desktop through file revealing, split-pane merging, recovery-history inspection, and authenticated reload.

This is **not** a fully green release gate. Six existing environment-blocked tests, Nix, installed/native verification, and warning-level React Doctor findings remain. No PR was opened and nothing was pushed.

## Corrected Behavior

- Reveal File in Navigation leaves Focus Mode, opens Files, reveals the exact path, and preserves drafts.
- Merge retirement coalesces source/destination tabs across current and saved sessions, including linked and pinned pane ownership; already-open destination panes refresh.
- Retained merge journals are paginated at 100 records. The recovery dialog replaces each page rather than accumulating records; malformed cursors are rejected. A real 1,002-journal test verifies complete, duplicate-free enumeration.
- Property parsing and malformed angle destinations avoid repeated suffix scanning.
- Bookmark deletion, stable group selection, and same-group ordering are preserved.
- Copy requests retain the caller operation ID through the Host/runtime/native boundary; `.markdown` receives the same safe native-open handling as `.md`.
- Replacement transactions isolate undo, incoming content precedes search commands, and previous-document history is cleared without clearing local edit echoes.
- Reading search handles inline fragments as one logical match and refreshes after embed HTML changes. Closed Find avoids document projection.
- Package-contract expectations and Node/Vitest test ownership were corrected.
- The final small recovery-dialog cleanup removes an unused AbortController allocation on each render and binds async completion/cleanup to its captured controller. Its eight component tests and the entire workbench suite were rerun afterward.

## Verification

| Check | Result |
| --- | --- |
| `pnpm run build:tocktutor` | Passed |
| `pnpm run typecheck:tocktutor` | Passed |
| `pnpm run typecheck` | Passed |
| `pnpm run build` | Passed |
| `node scripts/tocktutor-build-manifest.mjs --check` | Passed |
| `git diff --check` | Passed |
| `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench test` | 359 Node tests and 578 Vitest tests passed |
| Vault package | 99 passed; inspection alone 61 passed |
| Runtime package | 206 passed, 1 environment-blocked failure |
| Remaining nested packages | 15 + 57 + 60 + 167 + 12 + 104 + 8 passed |
| `pnpm test` | 1,368 passed, 5 failed, 18 skipped; not green |
| `node --test tests/desktop-page-routes.integration.ts` after staging | 1 passed; real pinned authentication/static service integration |
| Four independent review rechecks | Accepted; no outstanding P1/P2 in the reviewed scopes |

The nested aggregate stops at the blocked runtime test. Packages after it were explicitly run with:

```sh
pnpm -C plugins/tocktutor -r --workspace-concurrency=1 \
  --filter='!tockbot-note-runtime' --filter='!tockbot-note-vault' \
  --filter='!@tockteam/tocktutor-workspace' --if-present run test
```

These package runs supplement, rather than hide or replace, the failing aggregate command.

## Fresh Desktop Evidence

- Owned extended-display run: `bd0ec82d-6736-41b9-baa6-04dfc241e3f9`, root PID `24655`, display `11`.
- Exact CSS viewport: 1512 × 949; device scale: 2; PNG: 3024 × 1898.
- Built-in dark theme; `document.documentElement.style.colorScheme === 'dark'`; no `data-tockteam-skin`.
- Final route: `/tocktutor/Notes/Destination.md`. Both panes show Destination, in Reading and Live Preview modes. The Live Preview safety notice remains visible for unsupported authored formatting.
- Source was retired into recoverable trash; Destination contains both notes; Referrer targets Destination; the merge journal is Applied.
- `page.reload()` returned HTTP 200, preserving merged content and both pane modes.
- Zero reported page or console errors; two existing Electron insecure-CSP development warnings. The startup API-key prompt was dismissed through its visible control.
- The supervisor explicitly stopped the full process tree; `remaining: []`.

### Scope Correction

The fresh verifier called its `formatted` query “Reading Find,” but its evidence is **vault search** (`1 note · 1 match`), not the note-local Find strip or a cross-inline phrase query. That claim is not accepted as note-local Find proof. The published machine proof classifies it as vault search. The original verifier report is retained separately for provenance. New note-local edge cases are covered by component regressions and source review, not this fresh GUI capture. Optional typing-versus-replacement Undo isolation was not rerun in this GUI window.

Clipboard and native association were intercepted. This proof does not certify actual clipboard mutation or OS application association. See the earlier merge-apply and note-menu history gates for their separately scoped evidence.

## Remaining Gates

1. Root failures: two `sandbox-exec: sandbox_apply: Operation not permitted` failures in marketplace tests, and three `spawn EPERM` process-inventory/cleanup failures.
2. Runtime failure: the stopped-index/Host-death process-inventory test fails with `spawn EPERM`.
3. Nix is unavailable. Installed executable and real OS association smokes remain incompatible with the permitted launch route; no guard bypass or substitute success claim was used.
4. React Doctor: changed-file score 67; comparable full-package baseline 58 and current 57. Full scan has 81 warning-level findings. They include existing issues, intentional editor/controller synchronization and sequential transactions, feature complexity, and false positives such as JSON serialization round-trip tests. The native `<search>` suggestion was tried but broke the pinned accessibility-query tests; the compatible explicit search role was retained. The score regression is disclosed, not called a passed quality gate or hidden by disabling rules.
5. Pre-existing note-menu/backlink changes remain mixed with workbench integration. The initial ownership snapshot is `/tmp/tocktutor-parity-implementation/before.status` and `before.patch`; those pre-existing paths were not staged. Native/runtime/inspection changes were checkpointed separately. The remaining integration needs ownership-safe commit preparation before a PR.

## Artifacts

- `split-merge-reload-dark.png`: only allowlisted final screenshot.
- `proof.json`: parent-assessed machine proof, disk assertions, and cleanup.
- `recheck-*.md`: all four independent rechecks.
- `fresh-desktop-proof.original.md`: original verifier output, with the scope correction above.
- `entry.cjs`: isolated fixture and explicitly intercepted native effects.
- `console.txt`: scoped renderer warnings.

Publication validates the screenshot geometry, theme evidence, filesystem results, and cleanup before an atomic directory rename. No canonical skin screenshot was overwritten.
