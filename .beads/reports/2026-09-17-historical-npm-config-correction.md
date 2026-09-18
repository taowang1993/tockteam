# Historical npm Configuration Correction

## Implemented and Reviewed

Commit `ad27156b` fixes the diagnostic setup failure from Windows run `35165918090`: npm user/global configuration now uses distinct empty owned files, created before subprocess work. Historical source, dependency pins, assertions, deadlines, runner modes, and ownership implementation remain unchanged.

The real npm regression first reproduced the old `npm-prefix.js` duplicate-configuration error, then passed with separate files and a nested `prepare → npm run compile` lifecycle. No install/network is needed for that regression. Parent review corrected npm discovery for Windows and POSIX layouts.

Independent review found that the test's uppercase/lowercase aliases violated Windows case-insensitive environment admission. The parent reproduced `Invalid Windows process environment` using the existing `encodeWindowsInvocation` on POSIX before correcting the test. Lifecycle aliases now replace uppercase spellings; production, legacy-control, and corrected test environments all pass the real encoder. The ownership validator was not changed.

Reviewer follow-up `0d7cf84f` found no remaining issues, applying all three review references. The existing Windows historical job now includes the focused npm regression with a one-minute limit, before the historical comparison; all other job/input/authority controls are unchanged.

Parent checks:

```sh
"$PORTABLE_NODE" --test tests/historical-runner.test.ts
node_modules/.bin/tsc --noEmit --pretty false
node --check scripts/historical-runner.mjs
node --check scripts/historical-runner-fixture.mjs
git diff --check
```

**11 passed, zero skipped**, including the actual default-worker/descendant cleanup control, npm negative/positive controls, and pnpm configured-path/sentinel tests. Workflow YAML parsed with the existing installed YAML package; removing the new preflight step yields exact structural equality with the prior workflow.

Node 24.20.0 macOS arm64 was downloaded as the official `.tar.gz`, whose checksum and extracted executable match the prior verified calibration. An initial `.tar.xz` filename was rejected against the known `.tar.gz` checksum before archive download/execution; the archive format was corrected, not the checksum guard.

## Full Local Fixture Blocker

Two unchanged local attempts at `ad27156b` stopped during the first historical frozen install, before either arm. sqlite3 fell back to node-gyp 8.4.1, which failed with `ModuleNotFoundError: No module named 'distutils'`. The retained bounded private log tail does not expose the preceding prebuilt-download failure.

Separate bounded HEAD probes for both sqlite3 5.1.7 macOS arm64 prebuilt variants (`napi-v3` and `napi-v6`) at GitHub also failed with `UND_ERR_CONNECT_TIMEOUT`. This is consistent with unavailable prebuilt downloads; it is not proof of the original installer download's precise failure. Python packages, historical dependencies, machine configuration, and install policy were not modified to bypass this.

Both attempts passed the ownership negative control and six pnpm configured-path probes. The parent checked original source hashes against the previous successful calibration, every attempted owner/root group and supervisor was absent, final inventories were empty, fixture removal succeeded, and no emergency cleanup occurred.

| Attempt | Supervisor / Install PID | Receipt SHA-256 |
| --- | --- | --- |
| First | 25937 / 26312 | `41ae54900179db234a751be4d6088bc689415a796f80a6772171ef9408aade1b` |
| Second, Unchanged | 26599 / 26937 | `95401147439544959d37f5afb08167092546a13c5ad7269de9931df9d26e7f4e` |

Allowlisted receipts: `historical-runner-2026-09-17/npm-config-local-attempt-1.json` and `npm-config-local-attempt-2.json`. Raw logs and absolute fixture paths are not published. Both are **INCONCLUSIVE setup failures**, not historical-test results.

## Authorized Windows Check

The user's “Continue” authorized the narrow correction and one further Windows comparison. After the full local fixture blocker was reported, the user explicitly selected **Run the Windows Check**, approving publication only to the existing verification branch and one run while carrying the unverified full-local-replay gate. Source review and 11 focused checks passed; the blocked full fixture is not represented as passing. No automatic retry, main push, release, merge, or Desktop launch is authorized. `tockteam-bon` remains open and the historical cause remains unknown.
