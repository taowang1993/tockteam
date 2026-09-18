# Historical SQLite Path Probe Preparation

## Authority and Scope

The user selected **Prepare and Run Once**: prepare and independently review the check, publish only to `verify/windows-owned-process-20260916`, then run one bounded Windows check. No automatic retry, main push, merge, release, Desktop launch, production changes, or new dependency is authorized.

Run `35179238712` captured `SQLITE_CANTOPEN` in both tests and both modes, without a valid phase journal. Path length is a hypothesis, not established historical causation. This separate path-only mode does **not execute either historical test** and must not be represented as historical acceptance.

## Controlled Check

- Reuse the existing owner, stalled-descendant calibration, exact historical archive/pins, frozen installs, isolated npm/pnpm configuration, receipt checkpoint, and independent process inventory.
- Load SQLite from the installed historical fixture in a separate owned process. Record the actual SQLite version and loaded JavaScript/native entry hashes; recheck hashes and containment in the parent.
- Keep the same 136-character database basename in short and deep directories inside the existing owned root. No external short root or volume change. Check canonical parents and device identity.
- Short path has at most 240 UTF-16 code units. Deep path matches the source-derived historical keyword/default path length, or 280 if that length is smaller. Record all four source-derived historical lengths, not absolute fixture paths. These modeled paths are not measurements from the failed historical tests.
- A missing-parent negative control must give Node `ENOENT` and SQLite `SQLITE_CANTOPEN`. Then run short → deep → deep → short. Node must first create/read/delete the exact filename in every real comparison case. SQLite opens the nonexistent file, executes a table creation/insertion, and closes before cleanup and the next case.
- Explicit open/exec/close callbacks exist only in this separate probe. No global exception handlers, changes to historical constructors/tests, or runtime wrappers.
- Retain only strict bounded evidence: fixed categories, booleans, nullable existing allowlisted codes, lengths, relative dependency identities and hashes. An 8 KiB evidence ceiling, 20-second acquisition/execution deadline, 1 MiB owned output ceiling, and unchanged 128 KiB receipt ceiling apply.
- Reject an existing probe folder; do not overwrite it or accept its stale evidence after failed execution. Include the probe in cleanup admission. Keep classification INCONCLUSIVE for original historical attribution regardless of a successful probe.

Implementation commit: `83625e79`.

## Local Verification

Official Node 24.20.0 darwin-arm64 was downloaded from nodejs.org and checked against its published SHA-256: `40e5607e5ecb3db9192723776da2d75d966260fc74a7a9e731c1bd67dda96bc8`.

RED checks ran before implementation: the missing probe operation failed; after initial implementation, the absent native missing-parent control failed its behavioral assertion. GREEN completed afterward.

Using `NODE` for that verified portable executable:

```sh
"$NODE" --test tests/historical-runner.test.ts
"$NODE" node_modules/typescript/bin/tsc --noEmit
"$NODE" --check scripts/historical-sqlite-path-probe.mjs
"$NODE" --check scripts/historical-runner.mjs
"$NODE" --check scripts/historical-runner-reporter.mjs
git diff --check
```

Final local result: **17 tests passed, zero skipped**. Real installed local sqlite3 5.1.7 / SQLite 3.44.2 passed the short/deep operations, produced the expected native missing-parent error, and rejected existing-root reuse without overwriting evidence. Ownership termination, independent inventories, POSIX PID/group absence, and fixture removal were checked. Privacy tests reject extra fields, raw messages/stacks, invalid codes/types/identities/lengths, and incomplete cases. Typecheck and syntax checks passed after correcting one test-only nullability assignment.

Workflow YAML and mode wiring were parsed/checked with the already-installed yaml 2.9.0 package; it is a transitive dependency, so the initial direct `require('yaml')` lookup failed before the explicit installed path was used. No dependency was installed or changed.

This is real local SQLite verification, **not a successful frozen historical install/replay**. That earlier local sqlite3 download/build gap remains. Windows behavior of this new check and its PowerShell dispatch are still unverified. Independent source review `ce7eff0d` (workflow `abec92cb`) applied all three mandatory references and found no issues. It read the final source and 17/17 test log, with a source-only verdict. Publication to the existing verification branch and the single explicitly authorized Windows path-only dispatch may now proceed; no automatic retry is authorized.
