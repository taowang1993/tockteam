# Historical Runner Windows Result

## Outcome

The single authorized comparison **did not reach either historical test arm**. [Run 35165918090](https://github.com/taowang1993/tockteam/actions/runs/35165918090), attempt 1, failed during the historical root dependency installation. Classification remains **INCONCLUSIVE**; this is a diagnostic setup failure, not reproduction or explanation of the original startup stall.

- Published commit: `404b7033b55bb049c54121e8a4035614401d2a2c`
- Historical job: `105026852501`; duration 5m19s
- Windows x64, Node 24.20.0, supervisor Koffi 3.1.6
- OS-default temporary volume: `C:`; default threadpool size retained
- Invocation: manual `historical_runner=true`, `runner_temp=false`, `native_trace=false`, `iterations=1`
- The old `windows` diagnostic job was skipped. No automatic retry was launched.

Only `verify/windows-owned-process-20260916` was published. Remote `main` remains `c7e630e1ce20143acaa93414c8dfd5b7bb5a8760`. No merge, release or Desktop launch occurred.

## Successful Setup and Cleanup Evidence

The actual Windows default-file-worker negative control observed supervisor 1132 → owned root 5008 → worker 2188 → descendant 7580. Its five-second deadline was reached, pending phases were retained, verified ownership termination completed, and the independent final inventory was empty.

All six pnpm 11.21.0 public CLI probes passed under the owned environment. Recorded effective destinations matched the corrected local calibration: `store/v11`, `config/pnpm/config.yaml`, `data/pnpm/global/v11`, `cache/pnpm`, `state/pnpm`. These establish configured destinations, not filesystem confinement or coverage of every lifecycle-script write.

The parent verified the seven immutable source/submodule commit/tree pins and nine original source/lock/policy hashes against the local calibrated receipt, and independently recomputed both supervisor-owner hashes from the dispatched commit.

All attempted owned operations report verified cleanup. Both final inventories are empty, `rootRemoved=true`, and `emergencyCleanup=false`. Artifact upload and the workflow's fixture-cleanup/receipt-scratch removal step succeeded. These are inspected recorded Windows results, not a later live probe of the retired runner.

## Setup Failure

The first `install --frozen-lockfile` operation, owned root PID 6752, exited 1 without reaching its four-minute deadline. The nested `upstream/dsh-TUI` prepare lifecycle ran:

```text
node scripts/prepare-guard.mjs && npm run compile
```

npm rejected the diagnostic environment because both user and global configuration referenced the same empty file:

```text
double-loading config "<owned>/empty.npmrc" as "global", previously loaded as "user"
```

The failed-step log reports this from npm's configuration loader during `npm-prefix.js`, followed by the lifecycle failure. This identifies the observed installation blocker; it does not establish why the same collision was absent from the local POSIX run. Raw logs and absolute fixture paths are not published.

The nested historical workspace install did not run. `arms` is empty: there are no default-versus-none results, historical readiness phases, or actual loaded historical dependency/native-addon identities from this Windows attempt. Successful sqlite3 installation output alone is not native test acceptance.

## Evidence

Under [historical-runner-2026-09-17](historical-runner-2026-09-17/):

- `35165918090-receipt.json`: original bounded uploaded receipt; SHA-256 `4d3594d518643b9816b21f0700deb01725a70a6cdb7be4635c36761f1c6b1fbb`
- `35165918090-run.json`: allowlisted run identity/status
- `35165918090-jobs.json`: job and step outcomes
- `35165918090-install-failure.json`: sanitized, narrowly extracted installation failure

The parent checked exact head/attempt, failure-before-arms, source pins/hashes, owner hashes, effective paths, cleanup flags, skipped legacy job, and successful upload/cleanup steps. Preparation/source review and 10/10 fresh standalone-Node local checks remain documented in [the preparation report](2026-09-17-historical-runner-preparation.md); they are not Windows comparison acceptance.

## Next Decision

The diagnostic needs distinct owned npm user/global configuration files and a regression covering the nested npm lifecycle before another Windows attempt. No correction or rerun is represented as verified here. The one-run authority is consumed; any further Windows execution/publication requires new approval.

`tockteam-bon` remains open. Historical startup/cancellation causation and complete Desktop workflow UI acceptance remain unproven.
