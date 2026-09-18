# Historical Error Code Preparation

## Scope and Predictions

Run `35177122567` attributed `uncaughtException` to both selected historical tests in both isolation modes, without retaining an underlying exception or valid journal/dependency identity. The user requested continuation of local diagnostic work, not another Windows execution.

The next discriminator tests three possibilities without changing error handling:

1. A SQLite-coded exception: expect a fixed primary SQLite code on Node's error or immediate cause.
2. A Node/filesystem-coded exception: expect a fixed Node/filesystem code instead.
3. Another or uncoded exception: expect `null`; absence does not rule out an error deeper in a cause chain, an extended SQLite code, or an unrecognized code.

These are hypotheses, not attribution of the historical stall.

## Minimal Change

Implementation commit `a4d06e6d`. Only `scripts/historical-runner-reporter.mjs` and `tests/historical-runner.test.ts` change. Each bounded failure record gains `code` and `causeCode`: exact matches against a finite allowlist, otherwise `null`. The list reuses existing Node code signatures and adds selected Node/filesystem codes and the 26 primary error codes exported by sqlite3. No arbitrary `SQLITE_*` prefix acceptance, numeric errno translation, message parsing, recursion, or additional text signatures.

Only the failure error and its immediate cause are inspected. Missing, unknown, private, numeric, object-valued, and deeper codes are not serialized. Strict validation requires both fields and rejects unknown values or extra properties. The existing 8-record/8 KiB/64 KiB/1 MiB bounds, completion/truncation handling, identity/location validation, and cleanup/deadline controls remain unchanged.

No exception handlers, wrappers, historical test instrumentation, runtime code, dependencies, source pins, workflow, or topology changes. The existing Windows preflight selects the new tests. Text-scan exhaustion does not prevent the separately bounded structured code capture.

## Verification

RED: the focused code test failed with `undefined` instead of `ERR_TEST_FAILURE` before implementation.

GREEN: official standalone Node 24.20.0 darwin-arm64; archive SHA-256 `40e5607e5ecb3db9192723776da2d75d966260fc74a7a9e731c1bd67dda96bc8` verified before execution. Final commands (`$PORTABLE_NODE` is that executable):

```sh
"$PORTABLE_NODE" --test tests/historical-runner.test.ts
"$PORTABLE_NODE" node_modules/typescript/bin/tsc --noEmit --pretty false
"$PORTABLE_NODE" --check scripts/historical-runner-reporter.mjs
git diff --check
```

**15/15 passed, zero skipped**, including sixteen actual owned-process startup cases across both modes. The two added cases exercise an uncaught EventEmitter error with a **synthetic SQLite-shaped code**, and an actual asynchronous filesystem `ENOENT`. Both preserve Node's `uncaughtException` category and produce `ERR_TEST_FAILURE` with the expected immediate cause code. This does not execute SQLite or reproduce a historical database error; no native dependency was added to the isolated preflight.

Pure checks cover private/suffixed/absent/malformed codes, messages containing code strings, deeper causes, required fields, record/byte limits, partial captures, and code retention after text-scan truncation. Existing npm/pnpm isolation and stalled-descendant controls passed. Type, syntax, and diff checks passed.

Final startup roots: 36652, 36658, 36660, 36663, 36665, 36668, 36670, 36673, 36675, 36678, 36680, 36683, 36685, 36688, 36690, 36693. Every arm asserted cleanup, an empty independent inventory, POSIX root/group absence, and fixture removal. The temporary official runtime was removed after empty inventories for both macOS path aliases. An initial cleanup guard rejected the canonical `/private/var` prefix before removal; the exact recorded root was then checked and removed, with absence verified.

## Review and Limits

Parent review applies the simplification, security/hardening, and performance references. Independent read-only review `c8872753` applied all three references and found no issues. It inspected the final source and test log, with a source-only verdict; parent verification supplies the executed checks above.

The full local historical replay remains unverified because of the previously recorded sqlite3 installation blocker. No unchanged replay was retried. New Windows code capture remains unverified, and the underlying historical exception remains unidentified. A fixed code, if captured, is still a lead rather than proof of stall causation or isolation parity.

After local verification and review, the user explicitly selected **Run One Windows Check**, authorizing publication only to the existing verification branch and one bounded execution with the full-local-replay gap retained. No automatic retry, main push, merge, release, or Desktop launch is authorized. `tockteam-bon` remains open.
