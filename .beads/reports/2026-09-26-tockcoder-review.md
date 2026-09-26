# TockCoder Review — 2026-09-26

## Scope and Outcome

Reviewed the TockCoder sidebar/client service flow, Files/Review and composer integration, Better Sidebar Host adapters and path/Git boundaries, terminal socket/lifecycle, pinned summary, Desktop/Web route and package composition, and persistence compatibility against pinned DSH `0.1.2-rc.1`.

Three confirmed runtime-contract defects were fixed. The older POSIX-backslash issue was already repaired in the committed adapter; regression and real Host checks now confirm it. No upstream submodule edits or new dependencies were needed.

| Finding | Repair and Regression Evidence |
| --- | --- |
| Review references used the old composer edit contract, and delivery inspected obsolete session nodes | `5bc8d3f6`: scoped detect-coordinate edits preserve unrelated references; retirement requires a newer durable user message in the event window. Tests cover replacement/removal, unrelated messages, failed-send restoration and retention. |
| Desktop new-session/open-path and sidebar actions called removed `workspaces.startSession` | `137951fa`: use `uiWorkspace.startSession`, with explicit service/package dependency. Desktop callback test and guarded panel test cover the callers; a real staged Desktop also starts Side Chat from an empty selection. |
| Background-process panel read running calls from the session lifecycle snapshot | `137951fa`: subscribe to `uiConversation.binding(id).target('chat').legacy.runningCalls`. Guarded component test verifies adding and clearing a running process row. |
| Older `tockteam-76y` report: POSIX backslash normalization could redirect repository selection or authorize a sibling | Existing adapter preserves native separators and exact repository identity. All corresponding tests pass; real Host stage affects only the selected trailing-backslash repository and sibling file access returns 403. |

## Documentation Decision

Added `.agents/references/tockcoder.md` with ownership, current service contracts, Host boundaries, lifecycle, persistence and verification instructions. Architecture had no structural drift: `.agents/references/architecture.md` only gained a short description and link, not a new runtime layer.

## Verification

- `node --test tests/review-comments.test.ts tests/review-diff.test.ts`: **14 passed** after the observed failing review-comment regression.
- `node --test tests/tockcoder-navigation.test.ts tests/sidebar*.test.ts tests/workspace*.test.ts tests/review*.test.ts tests/composer*.test.ts tests/input-history.test.ts tests/terminal*.test.ts tests/pinned-summary*.test.ts tests/right-panel-layout.test.ts`: **88 passed**.
- `node --test tests/better-sidebar-git-actions.test.mjs tests/better-sidebar-git-paths.test.mjs tests/better-sidebar-session-scope.test.mjs`: **42 passed**. These `.mjs` checks are not included by the root test glob.
- `TOCKCODER_TEST_CDP_URL=http://127.0.0.1:51377 node --test tests/tockcoder-panel.test.mjs`: **passed** against the owned guarded Electron endpoint. Before the fix it failed with `this.workspaces.startSession is not a function`. The endpoint is stopped and is not reusable.
- `pnpm run typecheck`, `pnpm run build`, `node scripts/stage-dsh.mjs --quick`, and `git diff --check`: **passed**.
- React Doctor: matched the same-file baseline at **77/100**, with the same five existing warnings. The initial diff scan's 100 only covered the smaller previously changed file set; it was not a comparable whole-component baseline. Existing complexity/size, loading cleanup, sequential workspace creation and effect-dependency warnings were not expanded into unrelated refactors.
- `pnpm test`: **1,443 passed, 17 skipped, 5 failed** out of 1,465. Two marketplace sandbox tests cannot apply `sandbox-exec` in this environment. The process-snapshot test and two trusted-Raycast proof-cleanup tests fail on blocked process inspection (`spawn EPERM`). No sandbox, process guard or assertion was weakened to make the gate green.

## Guarded Desktop Evidence

All GUI launches used `extended_display` on external display 17, with isolated application data and mock Keychain; no main-display fallback or user-app attachment was used.

- Real staged Desktop comment flow: created two comments through visible controls, verified one reference and one request payload, removed one comment and checked its text disappeared, then removed the last and checked the draft/reference cleared. No page errors were observed in that successful flow.
- Component flow: `/tockcoder`, 1512 × 949 CSS pixels at 2×, screenshot buffer 3024 × 1898, dark/no skin, no runtime errors. Covered stale workspace/diff/directory responses, staged/unstaged selections, backslashes, long filenames, new-session navigation and running-call updates.
- Final real staged Desktop: service graph contains `uiWorkspace` and `uiConversation`; empty-selection Side Chat starts a session. Real HTTP Git stage returned 200, selected `repo\\` had `A ` for `pending.txt`, sibling `repo` remained `??`, and reading `authorized\\outside/private.txt` from the `authorized` session returned 403. Geometry was 1512 × 949 at 2× on `/tockcoder`, built-in dark with no document/body skin, and zero page exceptions. The intentionally denied read produced one expected HTTP-403 console entry. Electron also emitted its development CSP warning; this is not a packaged-security proof.
- Disposable client-response instrumentation exposed existing services for inspection; production source gained no test globals. A longer exploratory run was interrupted by onboarding/navigation and later a disconnected endpoint; it is not counted as passing. The subsequent bounded runtime/Host proof completed successfully.
- Owned root PIDs 37244, 40054, 49588 and 52504 were explicitly stopped; each guard cleanup reported `remaining: []` for its recorded process tree. Fixture HTTP servers were closed by the test harness.

No screenshots were promoted or baselines refreshed. Native file dialogs, installed-package behavior and successful model-backed submission were not exercised. Delivery/retry behavior is covered by the durable-event regression tests, not represented as a live model response.
