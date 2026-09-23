# Note-Local Search and Undo Gate

## Result

Production Desktop now directly verifies the previously missing note-local Reading Find and typing/replacement Undo/Redo boundaries. This is parent-run evidence, separate from the earlier independent reviewer’s vault-search step.

- Reading: `Source formatted phrase.` matches across plain text → `<strong>` → plain text as **1 / 1**, with three fragments sharing one logical match ID. The `<strong>` element survives highlighting.
- Source: type before replacement, Replace All `alpha` → `omega`, type after replacement; three Undo operations remove only the later typing, then the replacement, then the earlier typing. Three Redo operations restore each exact state.
- Live Preview: the same sequence with `omega` → `sigma`, using real keyboard and visible menu controls. All six exact state comparisons pass.
- All screenshots use 1512 × 949 CSS pixels, DPR 2, 3024 × 1898 PNGs, explicit dark color scheme, and no active skin.
- These typing checks leave an unsaved fixture draft; they prove editor history, not save/reload persistence. The earlier merge/reload gate covers its own persisted operations.

## Small Fix Discovered During Verification

Typing revealed a ProseMirror warning and computed `white-space: normal`. The existing shared Live Preview shell now applies the single Tailwind utility `[&_.ProseMirror]:whitespace-pre-wrap`.

RED: `node --test --test-name-pattern='browser Tailwind utilities' tests/tailwind.test.ts` failed with `Live Preview preserves editable whitespace`.

GREEN: `node --test tests/tailwind.test.ts` passed 4/4. The final production Desktop computes `pre-wrap` and no longer emits the ProseMirror whitespace warning. No new stylesheet or dependency was added.

React Doctor also identified the protected-content regex being evaluated for a discarded `useRef` initializer on every render. React’s lazy state initializer now computes only that initial value; the existing content-change effect and mutable protection ref remain unchanged. Editor protection, history, and content synchronization regressions still pass. No transaction or synchronization ordering was changed.

## Final Checks

- `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench test`: **359 Node + 578 Vitest** passed.
- `node --test tests/tailwind.test.ts tests/desktop-page-routes.integration.ts`: **5/5** passed.
- `pnpm run typecheck:tocktutor` and `pnpm run typecheck`: passed.
- `pnpm run build:tocktutor`, `pnpm run build`, and `node scripts/stage-dsh.mjs --quick`: passed.
- `node scripts/tocktutor-build-manifest.mjs --check` and `git diff --check`: passed.
- React Doctor full scan: **58/100**, restored to the original comparable baseline of 58. There are 80 warning-level findings, including existing findings and documented synchronization/transaction tradeoffs. No rules were disabled. This resolves the numeric regression; it does not claim a clean lint scan.

## Runtime and Cleanup

Final owned extended-display run: `817cabaf-220c-4b93-943f-3a42f5c2f2c0`, PID `56702`, display `11`. Only its returned CDP endpoint was attached. The isolated fixture intercepted clipboard/native opening, neither of which was exercised here. The real production Desktop, Host/runtime and editor packages were used.

Console: **0 errors**, one existing Electron development-CSP warning. All three proof scripts recorded zero page errors. The first final Reading attempt raced asynchronous file navigation and was rejected because the page was still in Live Preview; the driver now waits for the correct note heading and mounted Reading surface. No application assertion was weakened.

The named Playwright session was detached and `extended_display.stop` returned `remaining: []`. Earlier runs `c9f5135e-00a6-49d2-b90b-0a70d40bcd79` and `ac3dc9d2-290e-456c-aefe-89554edd2c2a` were also explicitly stopped with no remaining processes.

## Remaining Release Gates

The final committed-tree root run remains 1,368 passed, 5 environment-blocked failures, and 18 skipped. The nested aggregate passes vault 99/99 but runtime is now 205/207: the known Host-death `spawn EPERM` failure plus a concurrent-first-lease assertion (zero ready children, expected one). That lease test initially passed an immediate isolated rerun, then a bounded diagnostic reproduced both children failing `BEGIN EXCLUSIVE` with `SQLITE_BUSY`. The [subsequent lease gate](../2026-09-23-index-lease-gate/report.md) records the deterministic red/green fix, independent review, 40 successful contention rounds, and final runtime **207/208** result with only the pre-existing Host-death `EPERM` remaining. Remaining nested packages passed 15 + 359 + 578 + 57 + 60 + 167 + 12 + 104 tests. The supplemental recursive run reached its command deadline during the final aggregate package, so that package was rerun independently and passed 8/8.

Nix remains unavailable, and installed/native effects are uncertified. The user explicitly approved including the earlier related note-menu/backlink changes. These are now committed with the implementation: `a884d7be` (pinned vault-event forwarding), `f5ac9244` (shared submenus and semantic primary actions), and `deb5483e` (workbench/Desktop integration and tests). Temporary Playwright snapshots are excluded. This report does not declare full release acceptance, open a PR, or authorize a push.

## Evidence

`proof.json`, `console.txt`, three allowlisted PNGs, the fixture entry, and the three assertion-bearing Playwright scripts are published together after validation. The scripts are used via `playwright-cli -s=<owned-session> run-code --filename=<script>` against a guarded owned Desktop, not to launch or attach to user applications.
