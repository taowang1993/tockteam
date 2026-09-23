# Launcher range review — 2026-09-19

Run recorded: 2026-09-19T03:28:11Z. Checkout: /Users/taowang/projects/worktrees/launcher. Every command ran here; no checkout changes, commit, or push.

## Confirmed findings and fixes

- P1: Calculator ranges could freeze or exhaust Electron main when floating-point addition could no longer advance. `100000000000000000:100000000000000000` and `range(100000000000000000, 100000000000000016)` both passed the existing guard. Bounded Node reproductions reached memory failure; the parent imposed a 64 MiB heap, output cap, timeout, and SIGKILL. Ordinary `1:3` completed.
- P1: The colon-range regex read exponent suffixes instead of actual endpoints. `1e20:-1:0` was admitted as though it began at 20. RangeNode validation now reads numeric constants and signed literals from the parsed AST, preserving decimal, scientific, and hexadecimal literal semantics while rejecting computed/unbounded endpoints.
- Range checks now count the actual inclusive progression using mathjs's tolerant comparison, without allocating results. They reject non-advancing steps and more than 10,000 items, including the previously admitted 10,001-item `0:10000` and `range(0,10000)` cases.
- Updated the calculator contract in .agents/references/tocklauncher.md. Preserved the previous run's uncommitted fixes and lockfile change.

Both new regressions failed before their corresponding changes and passed afterward. The exact focused command is `node --test tests/launcher-local-extensions.test.ts` (18 passed). A separate five-second child exercised the real provider, rejecting four unsafe queries and retaining ordinary decimal range output; PID 64444 exited successfully and ESRCH confirmed it stopped. Its initial assertion incorrectly expected rounded array formatting; corrected the proof expectation to existing mathjs floating-point output, without changing product formatting.

## Review scope

Continued the prior broad snapshot review with source inspection of core search/ranking, action authorization, IPC/preload, native provider integration, network validation/transport, settings serialization, workbench delivery, and lifecycle. Used the current CodeGraph index and synchronized the two edited source/test files afterward. Prior uncommitted changes were inspected, preserved, and exercised again.

Applied all three review references: simplification, security/hardening, and performance. Re-reviewed the final calculator changes with these perspectives. The concrete threat is a bounded but untrusted renderer query causing unbounded allocations in Electron main. The remedy removes text-based range parsing and shares one bounded progression check; it adds no dependency, runtime authority, or native effects. This is source/test evidence, not exhaustive cross-platform runtime proof.

## Final verification

- `node --test tests/launcher-local-extensions.test.ts` — 18 passed.
- `node --test tests/launcher-*.test.ts tests/trusted-raycast-*.test.ts tests/cli-launcher.test.ts tests/install-mac.test.ts` — 809 passed, 14 conditional skips, 0 failures.
- `node --test tests/launcher-*.test.mjs tests/trusted-raycast-*.test.mjs tests/ueli-package-feasibility.test.ts` — 123 passed, 0 failures.
- `pnpm typecheck` — exit 0 after final source changes.
- `pnpm run build` — exit 0 after final source changes.
- `pnpm audit:ueli-package-feasibility` — passed.
- `git diff --check` — passed.
- Bounded real-provider proof — passed; no remaining matching test/reproduction processes were found after suite completion.

No Electron app, browser, or server was launched. No foreground or installed smoke was run: this pure calculator validation change has source/provider proof, and installed evidence remains the existing tockteam-r4c follow-up after an authorized final commit. Full unrelated repository tests and Windows/Linux native runtime checks were not run. No installed-evidence refresh or new installed claim was made.

Tracking: tockteam-bef. Only src/launcher-local-extensions.ts, tests/launcher-local-extensions.test.ts, the existing launcher reference, and this report were changed in this run; all earlier uncommitted files remain.
