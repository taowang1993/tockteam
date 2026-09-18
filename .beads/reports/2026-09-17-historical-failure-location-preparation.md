# Historical Failure Location Preparation

## Scope

Following inconclusive Windows run `35172654646`, the user requested continuation. This preparation is local only: another publication or Windows execution requires fresh explicit approval.

The new discriminator distinguishes a file-level failure, a selected historical test failure, and an unrelated test/hook failure. It does not assert that any of these caused the original historical stall.

## Bounded Evidence

Implementation commit `009c600e`. Only `scripts/historical-runner-reporter.mjs` and `tests/historical-runner.test.ts` change.

- Observe Node's structured `test:fail` events before passing them unchanged to the existing private TAP formatter.
- Retain at most eight failure records, with an explicit `failuresTruncated` completion flag if later failures were omitted.
- Map exact test names to `keyword` / `persistent`, the exact file name to `file`, and everything else to `other`. Known labels require the event's file to match the expected historical test file; a same-named test in another file is not attributed to the historical source.
- Publish line/column only for that same expected file, as positive safe integers no greater than 1,000,000; otherwise publish `null`.
- Publish only a fixed allowlist of Node failure categories, otherwise `other`.
- Validate exact record fields, enum values, coordinates, count, completion order, and truncation consistency before accepting receipt evidence.

Coordinates describe **test declaration locations in the instrumented file**, not throw sites, stack frames, or automatically mapped original-source positions. A file-level result may only point to line 1. A missing or unknown category remains unknown; in local controls, no-file-isolation import/bootstrap errors lacked the wrapper category seen with default isolation. This reporting difference is not a behavioral-cause conclusion.

No raw names, paths, stacks, messages, environment, or credentials are published. Existing 8 KiB evidence, 64 KiB text scan, 1 MiB owned output, lifetime, cleanup, and deadline limits remain. Structured failure capture continues after text scanning truncates, within its separate eight-record limit. The existing SPEC stdout reporter remains untouched. No process wrapper, runtime code, historical source instrumentation, pin, dependency policy, arguments, workflow, or process topology changes.

## RED → GREEN

Official standalone Node 24.20.0, macOS arm64, downloaded with verified archive SHA-256 `40e5607e5ecb3db9192723776da2d75d966260fc74a7a9e731c1bd67dda96bc8`.

1. RED: the actual missing-import arm had no structured `failures` array.
2. GREEN: structured records identify the failing file or selected test, declaration line, and available Node category in both modes.
3. RED: a synthetic event with an exact historical test name but a different file was incorrectly labeled `persistent`.
4. GREEN: require the exact file for identity attribution; the same event now becomes `other` with no published location.

Final verification commands (`$PORTABLE_NODE` was the verified standalone executable):

```sh
"$PORTABLE_NODE" --test tests/historical-runner.test.ts
"$PORTABLE_NODE" node_modules/typescript/bin/tsc --noEmit --pretty false
"$PORTABLE_NODE" --check scripts/historical-runner-reporter.mjs
git diff --check
```

**14/14 checks passed, zero skipped.** Twelve actual owned-process cases cover missing import, generic bootstrap error, failing hook, syntax error, selected-test error, and output overflow in both modes. They retain the existing process topology, output-limit rejection rather than a deadline, independent empty inventories, root/group absence assertions, and fixture removal. Final root PIDs: 34212, 34215, 34217, 34221, 34223, 34226, 34228, 34231, 34233, 34236, 34238, 34241.

Pure boundary controls cover unknown/private names and paths, identical names outside the expected source, invalid coordinates/categories/extra fields, partial streams, excessive records, records after completion, and structured capture after the text scan ceiling. Existing npm/pnpm isolation and stalled-descendant controls passed as well. Type, syntax, and diff checks passed. The temporary official runtime was removed after an empty process inventory was verified.

## Review and Remaining Limits

Parent review applied simplification, security/hardening, and performance references. Independent read-only source review `e880f586` applied the same three references and found no remaining issues, including in the corrected cross-file attribution guard. The reviewer inspected the earlier 14-check log; parent acceptance uses the separate fresh corrected-code run recorded above.

No full historical local replay was attempted for this change. Its prior sqlite3 download/build blocker remains recorded and unverified; these synthetic controls are not a substitute for loaded historical dependency identities. Native Windows behavior of the new fields is also unverified. Even a correctly captured file-level declaration may not identify the specific underlying error.

After preparation and review, the user explicitly selected **Run One Windows Check**, authorizing publication only to the existing verification branch and one bounded Windows execution with the full-local-replay gap retained. No automatic retry, main push, merge, release, or Desktop launch is authorized. `tockteam-bon` remains open.
