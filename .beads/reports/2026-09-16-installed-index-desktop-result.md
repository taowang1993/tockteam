# Installed Desktop Index and Command Evidence

## Scoped Acceptance

Fresh macOS arm64 packaged Desktop at `62109e41f11bc451bd372c4e071ce3f87ad0fee2` passed **indexed search and document opening** in an isolated installation. A separately authorized foreground check proved **real launcher invocation, native confirmation, command execution, and cleanup**. Its original harness result remains **failed**: a wrong log-label assertion stopped verification before the renderer's post-completion state was checked. Offline evidence correction does not turn that run into a fully passing workflow UI test.

No production source changed in this verification slice. No Windows run, push, merge, release, or modification of the user's installed app/profile was performed.

## Installed Search

- Built a fresh artifact with the existing packaged builder; copied it with verbatim symlinks into an isolated installation under `~/Library/Caches/tockteam-verification.noindex/`. Package inventory/parity, resources and notices passed. All eleven installed index/ownership module hashes matched the current source build.
- Electron **84329**, Host **84333**, index child **84334**. An isolated trusted Cordis observer recorded genuine search/read results and waited for index readiness; it did not replace SQL, search results, or production timeouts. This proves **ready-state behavior**, not startup latency.
- Through the real Playwright/CDP UI, opened **Search Notes**, entered a unique tag query, and observed one exact result. Native indexed candidates narrowed three fixture documents to two; exact filtering excluded the plain-text false positive. Opened `Result.md` and verified its undisclosed random receipt in the rendered document.
- Authenticated inactive-window checkpoints recorded **zero focused windows** before and after. No OS keyboard or mouse control was used for this search check.
- Explicit `skins.json` seed: `{"activeId":null,"fallbackTheme":"dark"}`. Verified inline color scheme `dark`, absent skin dataset, route `/tocktutor/Result.md`, **1512 × 949 CSS pixels / DPR 2**, and **3024 × 1898 screenshot pixels**.
- Runtime page errors and console errors were zero. One **shutdown-only** `net::ERR_INCOMPLETE_CHUNKED_ENCODING` console error is retained; no whole-app-error-free claim.
- Empty independent process inventory, no emergency cleanup, child PID/group absent, credential copy removed.

[Accepted receipt](installed-index-2026-09-16/index.json) · [Screenshot](installed-index-2026-09-16/installed-index.png)

## Real Native Command, With an Explicit Harness Limitation

The user explicitly permitted bringing the isolated app forward and approving its harmless test-command dialog. Workflow configuration used the restricted settings bridge; invocation used the actual launcher UI. App-scoped accessibility approval matched only the owned process and the exact **Installed Ownership Proof** / **Write Temporary Receipt** sheet before pressing **Continue**.

Electron **86225**, Host **86229**, index child **86232**, shell **86248**. The real command wrote one temporary canary receipt, recorded its shell PID, slept 0.3 seconds, and emitted `owned-proof`. It performed no user-data mutation or external effect.

The script passed native approval and exact receipt assertions, then incorrectly waited for a log containing `workflow accepted`. Production correctly logged:

```text
2026-09-16T13:43:11.226Z [desktop] TockLauncher workflow completed: actions=1 commands=1 durationMs=922 stdoutBytes=11 stderrBytes=0
```

No second native approval was attempted. An offline audit compared the retained current workflow command's canary to the receipt, required exactly one matching completion log, and checked `ESRCH` for all four PIDs and negative-PID probes. These absence checks occurred **after app cleanup**, not immediately when invocation returned. The offline proof explicitly leaves renderer post-completion state unasserted.

The [original failed receipt](installed-index-2026-09-16/workflow-original-failure.json) and [offline correction](installed-index-2026-09-16/workflow-offline-proof.json) are both preserved. Read-only reviewer `19a791a6-0cd7-405c-9620-772d33256505` independently inspected scripts, persisted command/receipt, log, screenshot and cleanup evidence: **no issues; scoped acceptance only**. The parent executed all commands.

## Harness Corrections and Final Cleanup

Three earlier harness setup failures are retained separately, each with successful cleanup:

1. [Search selector](installed-index-2026-09-16/index-selector-failure.json): the query is a combobox, not a textbox.
2. [Workflow defaults](installed-index-2026-09-16/workflow-default-failure.json): an unset saved setting was incorrectly assumed iterable.
3. [Workflow schema](installed-index-2026-09-16/workflow-schema-failure.json): `ExecuteCommand` correctly rejected an unsupported `workingDirectory` field. The corrected definition was checked against the production parser. Both workflow setup failures occurred before native confirmation.

Only the allowlisted screenshot, JSON receipts and archived harness text were copied into a private staging directory. Before publication, sixteen recorded PIDs and negative-PID probes were absent; an independent inventory found no process referencing the test root. The entire owned artifact/installation/profile/vault/audit root was removed, removal and empty inventory rechecked, and the evidence directory atomically renamed into place. [Publication manifest and hashes](installed-index-2026-09-16/publication.json).

The `.mjs.txt` files are exact disposable-driver snapshots for auditing, **not supported reusable gates**. Their temporary paths no longer exist. Raw application logs and credentials are not published.

## Verification

Actual bounded Desktop commands, after fresh artifact preparation:

```sh
node /tmp/tockteam-installed-index-check.mjs
node /tmp/tockteam-installed-index-check.mjs --foreground-workflow-approved
node /tmp/tockteam-publish-installed-proof.mjs
```

The foreground command has the failed-harness/offline-correction scope described above; it is not listed as an end-to-end pass.

Final repository checks:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run typecheck
node scripts/tocktutor-build-manifest.mjs
git diff --check
```

Root tests: **1314 passed, 15 skipped, zero failures**; typecheck passed. The initial root run had five module-load failures: an existing hard-linked local `file:` dependency had the updated `index.js` but lacked newly added module directory entries. Source build output and the tested packaged artifact already contained those files. A frozen-lockfile package-manager refresh fixed the local copy without tracked changes or hand-editing dependencies. An initial offline refresh could not obtain required registry policy metadata; the ordinary online frozen refresh passed without relaxing policy. Original/refreshed logs remain under `/tmp/tockteam-remaining-gates-root-tests{,-refreshed}.log`.

The separate [native clock/Host-death proof](2026-09-16-index-remaining-native-gates.md) passed runtime **184/184** and its four negative controls. Previous [Windows native evidence](2026-09-16-windows-index-result.md), [staged Desktop workflow checks](2026-09-16-desktop-staged-workflow-result.md), and [model-driven installed headless consumer](2026-09-16-index-packaged-consumer.md) retain their distinct scopes.

## Remaining Boundaries

This is not Windows Desktop acceptance, a fresh model-driven Desktop conversation, full workflow UI completion-state acceptance, or historical Windows stall attribution. The surviving-child Host-death check remains macOS evidence. The native clocks and a distinct Windows Job-bound Host-death recovery check subsequently passed in [authorized run 35127983115](2026-09-16-windows-index-recovery-result.md); that run is not Windows Desktop UI acceptance. Historical cancellation and original handle-growth identity remain unattributed. No further Windows/publication authority is implied.

`tockteam-fsq` is closed for its original bounded Translate cache and Windows descendant-ownership defects, supported by the earlier fixes/native runner checks plus this installed command-effect evidence. `tockteam-bon` remains open for historical causation and its explicitly unproved platform scope; stronger isolation is not a retrospective explanation.
