# Historical Runner Comparison Preparation

## Scope and Authority

Beads `tockteam-bon` remains open. The user authorized preparation/review, publication only to `verify/windows-owned-process-20260916`, and exactly one manual Windows comparison. No retry, main push, merge, release, or Desktop launch is authorized. Implementation commit: `559d2886`.

The experiment compares the original two tests under default Node file-worker isolation and `--test-isolation=none`. Historical head `9a709fc995343debed13740065039302a86c21e1` has the same tracked tree as the originally executed merge: `8cad8eca84d72d5110807c04a65b302b212ae53e`. Seven immutable archive pins cover the root and recursive submodule occurrences. Both arms share the same frozen historical dependencies; original assertions and five-second readiness deadlines remain unchanged.

Synchronous bounded test-phase journals perturb I/O/scheduling. A difference is only a lead; two passing arms remain **INCONCLUSIVE**. Post-stop inventories cannot identify which process/native call remained alive at a historical deadline.

## Review Correction

Independent reviewer `2ff850a5` found a P1: pnpm 11 ignores `npm_config_store_dir`, and missing private pnpm configuration/data settings allowed user-level configuration/auth and external store use. Earlier local paired receipts therefore **do not establish isolated installation**. They remain limited behavioral calibration; no absence of external reads/writes is inferred, and no user configuration was inspected or reverted.

The correction uses supported `PNPM_CONFIG_STORE_DIR`, owned XDG config/data/cache/state destinations and `PNPM_HOME`, plus explicit supported cache/state settings. HOME/USERPROFILE remain unchanged. Before installation, bounded owned pnpm 11.21.0 CLI probes validate exact effective destinations. Only allowlisted fixture-relative paths enter the receipt. These are configured destinations, **not filesystem confinement or proof of every dependency-script read/write**.

The regression failed before any CLI invocation on the missing supported store setting. Its passing version verifies public CLI settings, sensitivity to synthetic configuration/auth sentinels, exclusion under the corrected environment, pre-spawn rejection, and rejection of an escaping effective global directory. Reviewer follow-up `edecf808` found no remaining source issues, applying all three review references; execution acceptance remained with the parent.

## Parent Verification

The parent independently downloaded official Node 24.20.0 for macOS arm64 and verified its distribution checksum:

- Archive SHA-256: `40e5607e5ecb3db9192723776da2d75d966260fc74a7a9e731c1bd67dda96bc8`
- Executable SHA-256: `9d050fd455b56426e25d4d603c7c501cbb2630348e836cf221dcce748e90588a`

Fresh commands:

```sh
"$PORTABLE_NODE" --test tests/historical-runner.test.ts
node_modules/.bin/tsc --noEmit --pretty false
node --check scripts/historical-runner.mjs
node --check scripts/historical-runner-fixture.mjs
git diff --check
"$PORTABLE_NODE" scripts/historical-runner.mjs --run --local --pnpm "$PNPM_ENTRY" --output "$RECEIPT"
```

All **10 focused checks passed, zero skipped**, including the real default-worker/stalled-descendant control. Typecheck, syntax and whitespace checks passed. YAML structural comparison verified that the existing diagnostic job is unchanged except its opt-in exclusion; the new job is verification-branch-only, Windows 2025, Node 24.20.0, read-only repository permissions, and capped at 15 minutes.

The corrected full local fixture completed both frozen installs and both historical arms:

| Evidence | Observed Result |
| --- | --- |
| Supervisor | PID 19385 |
| Negative control | Root 19396 → file worker 19399 → descendant 19400; deadline reached; pending phases retained; whole tree stopped |
| Frozen root/nested installs | PIDs 19725 / 20714; exit 0 |
| Default arm | Root 20834, worker 20835; both original tests passed; 40 journal transitions |
| No-isolation arm | Root/worker 20837; both original tests passed; 40 journal transitions |
| Loaded identities | sqlite3 5.1.7, FlexSearch 0.8.212, runtime 0.1.2; identical package/native hashes across arms |
| Native addon SHA-256 | `e476b3077cee91f9e8a679e7d8303fb6e5e0c5815c25aa06033159ae533857c6` |
| Effective pnpm destinations | `store/v11`, `config/pnpm/config.yaml`, `data/pnpm/global/v11`, `cache/pnpm`, `state/pnpm` |
| Cleanup | All 11 owned roots/groups and supervisor absent; inventories empty; fixture removed; no emergency cleanup |
| Classification | **INCONCLUSIVE — local POSIX calibration, not Windows acceptance** |

The parent independently recomputed all recorded original source/lock/policy hashes against Git, checked dependency identity equality, and inspected cleanup/phase records. No full root suite or installed/Desktop smoke was run for this test-only change.

Allowlisted receipt: [historical-runner-2026-09-17/local-corrected.json](historical-runner-2026-09-17/local-corrected.json), 25,642 bytes, SHA-256 `2b5088353ae08de99b1588831ab3cf0c521311e54b41275e90db2f46873c7756`. Raw logs, environment, credentials and absolute fixture paths are not published.

## Remaining Gate

Publish the reviewed commits only to the existing verification branch and dispatch `search-recovery-diagnostic.yml` exactly once with `historical_runner=true`. Inspect the bounded Windows receipt and complete cleanup before reporting its scope. The original Windows stall/cancellation cause remains unconfirmed; no complete Desktop acceptance is implied.
