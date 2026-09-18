# Search Lifecycle Fixes

## Scope and Disposition

- `84b9f178`: fixed cold editor focus. A root-scoped pending request waits for the real editor DOM and cancels on user input, route changes, inactivity, or unmount. Both pointer-selected Live Preview and keyboard-selected Source results were verified with their lazy editor chunks deliberately held until after Search closed.
- `9aa9cbff`: fixed unpublished native search-database ownership. Mounting/reconciliation connections now close on failure or cancellation even before becoming searchable. Native operations must settle before cleanup; cancellation must not race them and close SQLite while FlexSearch is still issuing SQL.
- `85ae9066`: refreshed tracked Workbench build artifacts.
- Added a 60-second external native-test deadline, using `--test-isolation=none` so timeout kills the actual SQLite-owning process rather than abandoning a test worker. Exact indexed candidate assertions were not relaxed.

**The original Windows stall is not proven fixed.** A truly stuck native operation can still block product disposal. The confirmed connection leak and bounded CI diagnostics are improvements, not evidence of the historical Windows root cause. `tockteam-bon` stays open pending native investigation. No push, Windows run, provider run, installed-app run, or main-checkout synchronization occurred.

## Verification

All commands ran in `/Users/taowang/projects/worktrees/tutor` or the indicated package, using Node 24.

| Check | Command / Evidence | Result |
| --- | --- | --- |
| Original cold-focus RED | Workbench: `mise exec node@24 -- node node_modules/vitest/vitest.mjs run tests/route-panel-controls.test.tsx --environment jsdom -t 'preserves search focus lifecycle'` | 2 failed, 5 passed before fix; 7 passed after fix |
| UI regressions | Workbench: `mise exec node@24 -- node node_modules/vitest/vitest.mjs run tests/route-editor-readiness.test.tsx tests/route-panel-controls.test.tsx --environment jsdom` | 56 passed; `/tmp/tockteam-fix-focus-final.log` |
| Ownership RED | Revised disposal tests against original `43e4ce4a` source in an isolated `/tmp` snapshot; `node --test --test-name-pattern='search index disposal' tests/loader-composition.test.ts` | Both failed: native SELECT still succeeded after disposal, proving leaked connections; `/tmp/tockteam-fix-index-ownership-red.log` |
| Full runtime | Runtime: `mise exec node@24 -- node --test tests/loader-composition.test.ts` | 81 passed; `/tmp/tockteam-fix-runtime-full2.log` |
| Native indexed gate | Runtime: `mise exec node@24 -- pnpm run test:search-index` | 4 passed, including drain/close, exact scanner fallback, indexed mutation, and persistent reopen |
| Types and builds | Both packages: `mise exec node@24 -- pnpm run typecheck` and `mise exec node@24 -- pnpm run build` | Passed; tracked generated files committed |
| React Doctor | `react-doctor plugins/tocktutor/packages/tockteam-tocktutor-workbench --scope changed --base HEAD --include-untracked --verbose` before source commit | No new issues; whole-package scan retains existing warnings |
| Real browser | `playwright-cli -s=tockteam-search-fix run-code --filename=check.js` from `/tmp/tockteam-focus-browser.m6ixYD` | Both held-cold editor flows focused the new Result document; no uncaught page errors; `proof3.log` |

Browser verification used the actual route and both real editor engines with a synthetic Remote fixture, not a full installed Desktop/Host proof. Existing shared-UI React ref warnings and unstyled-fixture CodeMirror measurement warnings were observed; this is not a zero-console-warning or visual-layout claim. The headless Chromium browser used a disposable profile and `--use-mock-keychain`, preserved HOME, and required no foreground input. Browser/daemon 59603, server 59595 and shell 59594 were stopped; port 51428 had no listener afterward.

An initial attempted abort race passed injected post-operation stalls but failed the broader runtime suite. It was removed, not shipped. The corrected drain-then-close source and full 81-test pass supersede those intermediate results.

## Independent Review

Fresh reviewer re-checked the corrected source, generated runtime, tests, and full logs: no remaining issues; accept the focus and connection-ownership repairs with explicit Windows limitations. Review output:

`/Users/taowang/.pi/agent/sessions/--Users-taowang-projects-tockteam--/subagent-artifacts/outputs/e00cfacf-d2bf-4f3d-a38b-638a018564ef/search-fixes-review.md`

The parent additionally completed the revised baseline RED, final typecheck, and browser checks after that review. The earlier seven issue closures remain unchanged; this work does not upgrade historical qualified provider evidence into a new packaged-provider receipt.
