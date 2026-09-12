# Search Lifecycle PR Verification

## Verdict

Independent real-Electron functional verification passed on `ec404398`, with the actual Desktop preload/IPC, pinned DSH 0.1.2-rc.1 profile, native SQLite, and a disposable two-note vault. No provider calls or synthetic Remote were used. The subsequent `4e58a70d` changes only a source-contract test to recognize the stronger null-container guard; application source and reviewed bundle bytes did not change.

- Recent/filename pointer selections: correct Result document, Live Preview editor focused.
- Content Enter: correct Result document, Source editor focused.
- Same-note content Enter: passed twice with exact result/input readiness.
- Escape: Search Notes opener focused.
- `tag:project`: exactly Result.md, one match.

See [Independent Verification](independent-verification.md), [Live Preview](filename-live-preview.png), [Source](content-source.png), and [Video](verification.webm). JSON files contain the observed readiness, selection, focus, and filtering evidence. The parent independently inspected both screenshots and decoded the video without errors.

The video is a low-rate sequence of actual renderer screenshots captured over CDP and encoded live: 581 frames, nominal 2 fps, 290.5 seconds, 1366-pixel output width. It is not OS screen capture and should not be used to measure interaction latency. Screenshots are 1280 × 840 CSS / DPR 2 / 2560 × 1680 PNG, light appearance, no active skin. These are functional diagnostics, not canonical gallery/parity captures.

## Regression Sweep

Run from `/Users/taowang/projects/worktrees/tutor` using Node 24 and the repository-pinned pnpm 11.21.0 entry point:

| Command | Result |
| --- | --- |
| `node node_modules/pnpm/bin/pnpm.cjs install --frozen-lockfile` | Passed; no lockfile change |
| `node node_modules/pnpm/bin/pnpm.cjs run typecheck` | Passed |
| `node node_modules/pnpm/bin/pnpm.cjs -C plugins/tocktutor run typecheck` | Passed |
| `node node_modules/pnpm/bin/pnpm.cjs -C plugins/tocktutor run test` | 1,143 passed across all 11 test groups |
| `node node_modules/pnpm/bin/pnpm.cjs test` | 1,226 passed, 14 skipped, zero failures |
| `node node_modules/pnpm/bin/pnpm.cjs -C plugins/tocktutor/packages/tockbot-note-runtime run test:search-index` | 4 passed |
| `node node_modules/pnpm/bin/pnpm.cjs run build:tocktutor` | Passed; manifest regenerated |
| `node node_modules/pnpm/bin/pnpm.cjs run build` | Passed |
| `DSH_DESKTOP_NODE_VERSION=24.20.0 node scripts/stage-dsh.mjs` | Passed; final staged Node 24.20.0 |
| `node --test tests/tocktutor-route.test.ts` | 6 passed |
| `git diff --check` | Passed |

Root/native tests were rerun after the final staging correction and test-only fix. The native-frame source-contract test failed first because it matched the old guard verbatim; its replacement asserts the new stricter guard rather than removing the safety assertion. Earlier cold-focus and database-ownership RED/GREEN evidence is in [Search Lifecycle Fixes](../2026-09-12-search-lifecycle-fixes.md).

Nested packaging tests regenerate bundles using a different dependency-link layout. Their generated-only delta was captured in `/tmp/tockteam-pr-test-generated.diff` and discarded to retain the exact committed/independently verified artifacts. Before committing regenerated bundles, source-map content hash sets were compared; build-only changes added or removed no source content.

## Environment Corrections and Scope Limits

- System pnpm 12 auto-install behavior caused local lockfile/build drift during preparation. Only that command's captured changes were undone; repository-pinned pnpm 11.21.0 completed frozen installation. No dependency upgrade is part of this PR.
- Quick staging had preserved a cached Node 26 executable. The successful Electron focus proof therefore used that cached Host executable, not Node 24. The root guard exposed this, and full staging restored the declared Node 24.20.0. Focus source/bundle and native-runtime package bytes are unchanged; the full Node 24 runtime tests and final native gate passed afterward. The Electron UI proof was not rerun after this staging-only correction.
- The first plain-browser attempt correctly failed because Desktop requires the real Electron preload. No bridge was fabricated.
- An earlier verifier misclassified intentional Source navigation as a failure and reported same-note focus using ambiguous readiness checks. The fresh independent verifier used the correct contract and repeated same-note selection successfully without a code change. Recording-tool and workflow-dispatch failures were preserved and retried through the governed workflow after explicit user approval.
- The Windows native stall's root cause is still unconfirmed. Safe database ownership and bounded CI diagnostics are not proof that a genuinely hung native operation cannot block product shutdown. `tockteam-bon` remains open.
- No installed-app or provider verification is claimed. Windows and other CI jobs will run on the PR. No PR merge or local-main synchronization is authorized by this handoff.

## Artifact Identity and Cleanup

Final committed and freshly staged bytes match:

- `tockbot-note-runtime/lib/index.js`: SHA-256 `24abef7e9216e8df2eb5fc6f1ce878d4fcf3d24a05d4e3b11691da416a8d0f57`.
- `@tockteam/tocktutor-workbench/dist/client.js`: SHA-256 `d7af39d5de876bdb649f24c3711a311a9de9e5edbe3e1ca9de69d40acf8f9711`.

Both actual Electron attempts used `--use-mock-keychain`, preserved HOME, isolated application data, non-focusable windows, and the repository's nonce-authenticated focus guard. Initial/final checkpoints reported zero focused windows. Parent runtime/app wrappers and descendants were stopped: first browser-only runtime 67209, first Electron 69181, recheck Electron 72909, recorder 73443, encoder 73453. Verification ports 52141, 52341, 52351, 52639, and 52649 no longer listened. Named drivers were closed. An unrelated `obs-evidence` driver reported by doctor was left untouched. Private temporary authentication and profile files are not included in this evidence directory.
