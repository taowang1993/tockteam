# Ready-State Packaged Index Consumer

## Accepted Scope

Verified the isolated search implementation from `bcfabd2b` through fresh runtime/vault/tools tarballs installed by the actual DSH CLI into a disposable headless profile on macOS arm64. The staged CLI matches the repository's pinned version, `0.1.2-rc.1`. All eleven installed runtime JavaScript modules match the current emitted bytes, including the child entry and ownership modules. No production code changed in this checkpoint.

The real model used `vault_search` and `vault_read` against three generated notes. The receipt value was random and absent from the task. Both fresh Hosts narrowed three documents to two indexed candidates, excluded the plain-text false positive, read the matching note, and returned the exact receipt. The second Host used the same profile, vault and cache. This proves working reopen, not that SQLite performed no internal reconciliation.

| Run | Host PID | Index PID | Indexed Search and Read | Child/Group Stopped |
| --- | ---: | ---: | --- | --- |
| First Host | 74344 | 74345 | Passed | `ESRCH` |
| Reopen | 74347 | 74350 | Passed | `ESRCH` |

[Allowlisted receipt](2026-09-16-index-consumer-proof.json) includes archive/module hashes, all launched root PIDs and both tool sequences. Uninstall completed; independent process inventory was empty; no emergency cleanup was needed. Disposable profile, credential copy, packages and fixtures were removed. The original credential file was not modified. No app, browser, foreground automation, Keychain interaction or remote publication was involved.

## Readiness Boundary

A diagnostic run observed correct scanner fallback (`scan.entries: 3`) when the model searched before initial indexing finished. Search/read results were correct, but that run was rejected as indexed evidence. No production deadline was raised and no product fix or startup-latency claim follows from this observation.

The final verification overlay supplies a test-only `indexConsumerReady` service after the existing generation's readiness promise resolves, with a 15-second fixture bound. The headless row retains `headlessStartup` and additionally requires this service. Thus acceptance explicitly covers **indexed behavior after readiness**, not default first-query timing. There is no new production service, fault switch or browser API.

## Harness Corrections

- An initial fixture check confused macOS `/var` with its canonical `/private/var` path. Canonicalizing the fresh root fixed the check; this was not a package-resolution defect.
- Review caught default SIGINT/SIGTERM termination bypassing detached-child and credential cleanup. The regression first observed raw SIGTERM exit instead of controlled exit 1. Signals now reject the active command, block subsequent launches and retain cleanup. Routine regressions use a harmless child and dummy credentials, without package builds or network work.
- A real SIGTERM was delivered after a successful model-driven indexed search while Host **72772** and index **72773** were still live. The harness exited 1; both PIDs and groups disappeared; credential and fixture were removed without emergency cleanup. [Interruption receipt](2026-09-16-index-consumer-interruption.json).
- Follow-up review caught acceptance being set before asynchronous final cleanup. A real two-task RED published `accepted: true` despite interrupted exit 1. Acceptance now commits only after process and filesystem cleanup; exclusive synchronous receipt publication prevents a signal from interleaving the final check and write. An opt-in regression holds final cleanup and sends SIGTERM after both model tasks pass, requiring `accepted: false` on disk and stdout.

The source limits each command's captured output to 4 MiB, each model task to 120 seconds, and total command execution to five minutes, followed by bounded cleanup. Failure receipts are not acceptance. Raw model output and credentials are never copied into these reports. Diagnostic fixtures from rejected runs were also removed after investigation.

## Verification

```sh
# Ordinary signal controls; finalization/model check is intentionally opt-in.
node --test tests/search-index-consumer.test.ts

# Both ordinary controls plus real-model finalization interruption: 3 passed.
TOCKTEAM_INDEX_CONSUMER_MODEL=1 node --test tests/search-index-consumer.test.ts

# Fresh package install, ready-state model tasks, reopen, uninstall and cleanup.
node scripts/test-search-index-consumer.mjs /tmp/tockteam-index-consumer-proof-20260916-verified.json

pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime test
pnpm --dir plugins/tocktutor/packages/tockbot-note-runtime typecheck
pnpm run typecheck
node --test tests/search-index-consumer.test.ts tests/tocktutor-build-manifest.test.ts
node scripts/tocktutor-build-manifest.mjs
git diff --check
```

Runtime tests: **180 passed**. Opt-in consumer controls: **3 passed** ([log](2026-09-16-index-consumer-controls.txt)). Root/runtime typechecks and manifest checks passed. Packaging rebuilt all three consumed packages. The final normal consumer command passed; use a new output filename when repeating it because publication deliberately refuses overwrite.

Independent final reviewer `943c7940-847d-48f1-8ae3-2d65468e0968`: **No issues found; ready-state packaged headless consumer only.** Parent and reviewer applied all three review references. The reviewer inspected source and receipts; the parent executed the checks. A final one-line diagnostic adjustment preserves the first failure when a subsequent signal arrives; parent re-ran all three controls and normal consumer afterward.

## Remaining Gates

Native Windows index/dispatch-hook acceptance, installed Desktop acceptance, remaining real-native clock discriminators, and surviving-child/Host-death lease exclusion remain unproved. Historical Windows stall and handle-growth attribution remain unproved. `tockteam-bon` and `tockteam-fsq` stay open. No merge, push or release authority is implied.
