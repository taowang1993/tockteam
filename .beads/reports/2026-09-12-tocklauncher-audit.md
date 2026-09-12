# TockLauncher Audit

## Scope

Reviewed `.agents/references/tocklauncher.md` against Desktop assembly, launcher core/providers, renderer/preloads, trusted compatibility, persistence, staging, and installers. Updated the reference to describe current behavior rather than planned or unsupported guarantees.

No changes to user profiles, credentials, installed applications, TockTutor-owned files, or the peer's native dispatch/policy work. No push, installed smoke, or foreground automation.

## Fixed Defects

| Defect | Commit |
| --- | --- |
| Fresh Windows portable installation locked a destination whose parent did not exist. | `2c87bdb4` |
| Windows PowerShell resolution omitted its actual System32 subdirectory layout. | `096d7fad` |
| Instant search results bypassed exclusions. | `0a82988b` |
| Settings export changed permissions on a user-selected parent directory. | `1cf7d43c` |
| macOS File Search inherited `PATH` for `mdfind`. | `b6b632a3` |
| Revoked external-settings grants could become active again after restart. | `b342e922` |
| VS Code recent entries beyond the identity-operation concurrency limit were dropped instead of queued. | `b51e9469` |
| Calculator aliases/assignments bypassed resource checks before synchronous evaluation. Finite normalized grammar now rejects indirect calls and unsafe collection algebra. | `732e413e` |
| Workflow cancellation returned before command cleanup completed. | `6fe08c18` |
| Same-URL main-frame navigation retained document-owned launcher actions/providers. | `6e0c0e98` |
| Desktop `open-paths` rejected ordinary letters/backslashes but admitted actual control characters. | `8d296589` |
| Composing keys reached root and nested tool shortcuts; reopening reused a trusted view after its child was revoked. | `127517fd` |
| Ordinary POSIX shell exit left background descendants alive. Exit now drains the owned group; cancellation/output failures during that drain cannot become success. | `87b7a5c1`, `47b545d7` |

Each implementation change has focused regression coverage. Failing checks were run before the fixes; final parent review also caught and regression-tested the late-error-during-drain case.

## Reference Corrections

- All three exact compatibility artifacts: Google Translate, Kaomoji Search, and Can I Use; one active child and one Host activation lease.
- Current macOS-only runtime availability versus cross-platform packaged/catalog bytes.
- Separate launcher and canonical workbench preload authority; rescan is an action, not a generic preload operation.
- DSH-owned theme/locale projection, 100 catalog rows plus two internal runtime keys, and status-only compatibility settings.
- Trusted account-level Terminal/Workflow command execution, not an OS sandbox or a command allowlist.
- Current external-settings version-2 displacement/no-overwrite publication, missing-path recovery, durable revocation, and POSIX/Windows permission differences.
- Per-extension data namespaces and remaining legacy Translate cached-state limitations.
- All three build outputs, exact runtime/package identities, and the Node 24 compatibility baseline.
- `--quick` staging does not replace an existing Node runtime; the stale local Node 26 installation required full staging.
- IME ownership, trusted-view reopening, main-frame reload invalidation, and process-draining lifecycle.

## Verification

### Source and Build

Commands used the repository-pinned pnpm 11.21.0 via `node node_modules/pnpm/bin/pnpm.cjs`, not ambient pnpm.

```sh
node node_modules/pnpm/bin/pnpm.cjs typecheck
node node_modules/pnpm/bin/pnpm.cjs build
DSH_DESKTOP_NODE_VERSION=24.20.0 node scripts/stage-dsh.mjs
node --test --test-concurrency=4 tests/launcher*.test.ts tests/trusted-raycast*.test.ts tests/desktop-preload-command.test.ts
node --test tests/launcher-workflow-process.test.ts tests/launcher-workflow.test.ts tests/launcher-window-controller.test.ts tests/launcher-renderer-contract.test.ts tests/desktop-preload-command.test.ts tests/trusted-raycast-build.test.ts
```

Typecheck, source build, and full staging passed. The broad launcher run initially had 763 passing checks, 14 conditional skips, and one failure caused by pre-existing staged Node 26. Full restaging installed Node 24.20.0. The final broad rerun passed 766 checks with 14 conditional skips and zero failures (780 total). The final focused gate also passed all 67 checks, including the previously failing staged-runtime check and the additional Workflow regressions. The other repository session owns the final full-root gate; its evidence is separate from these results.

A real POSIX check ran `sleep 30 & echo $! > child.pid` through `runBoundedWorkflowCommand()` with a 1.5-second deadline: command completion succeeded and both the owned group root 97757 and descendant 97760 were stopped. The synthetic regression also checks that shell exit does not settle before close and that cancellation/overflow during draining rejects.

### Browser Renderer Proof

A bounded headless Playwright CLI session loaded the actual esbuild-compiled launcher with a finite fake bridge. It reproduced both IME and stale-view failures using the pre-fix renderer, then verified the fixed root, File Search, Web Search, and trusted-view reopening. Ordinary Enter and Escape still worked.

- Route: `/launcher.html`; root results visible after trusted-view disposal.
- Geometry: 1512 × 949 CSS pixels, device scale 2, verified PNG 3024 × 1898.
- Appearance: explicit `dark`, `skinId: null`.
- No page errors. The three console messages were Chromium's existing warning that `frame-ancestors` is ignored in a meta CSP, one per navigation; the final fixture served all requested assets.
- Final fixture root PID 94143 and Playwright root PID 94183 were stopped; the recorded post-cleanup process match was empty.
- Temporary evidence: `/tmp/tocklauncher-audit-browser-result.log`, `/tmp/tocklauncher-audit-processes-before.log`, `/tmp/tocklauncher-audit-processes-after.log`, and `/tmp/tocklauncher-audit-browser.png`.

This is renderer behavior evidence, not native service, extension network, or installation evidence.

### Inactive Real Desktop Proof

```sh
node /tmp/tocklauncher-inactive-smoke.mjs
```

Launched the built/staged Electron application with isolated `--user-data-dir`, preserved `HOME`, `--use-mock-keychain`, inactive-window proof, and denied trusted effects. Playwright attached over CDP without `Page.bringToFront`, OS input, or app focus calls.

Verified:

- Lazy creation of the real launcher through the canonical workbench bridge.
- A real previously published rescan action is rejected after same-URL launcher reload.
- Both `isComposing` and key-code 229 preserve native key defaults in Electron.
- No renderer `require` or `process` authority.
- `launcher.html`, ready root results, dark/no skin, 1512 × 949 CSS at 2×; PNG dimensions independently verified as 3024 × 1898.
- Authenticated main-process focus checkpoint: zero focused windows and zero inconclusive focus events.
- No page errors. Host logs contain expected superseded-search/stale-action rejections and a Desktop dispatch sender-unavailable message during teardown; no clean-host-log claim is made.

Root PID 1643 and tracked descendants 1644, 1645, 1655, 1659, 1682, 1684, 1685, 1686, 1687, 1688, 1830, and 2111 were all stopped. Earlier harness attempts also cleaned their full recorded trees; those attempts used an incomplete bridge call and then expected the wrong rejection shape, not production fixes.

Temporary evidence: `/tmp/tocklauncher-inactive-audit-result.json`, `/tmp/tocklauncher-inactive-audit-cleanup.json`, `/tmp/tocklauncher-inactive-audit-app.log`, and `/tmp/tocklauncher-inactive-audit.png`. Screenshots remain local temporary evidence, not published canonical product or installed-release screenshots.

## Residual Work and Limits

| Issue | Remaining Scope |
| --- | --- |
| `tockteam-dve` | Catalog can show installed/enabled compatibility commands on unsupported platforms; runtime invocation is macOS-only. |
| `tockteam-fsq` | Bound legacy Translate cached-state loading and separately assess Windows descendant lifetime guarantees after normal parent exit. POSIX process groups do not confine deliberately escaped trusted commands. |
| `tockteam-87d` | Windows verification cleanup helper joins `taskkill.exe`/PowerShell directly to `SystemRoot` instead of `System32`; runtime launcher resolvers were fixed, but this separate verification helper still needs coverage. |

No live Windows/Linux invocation, signed/notarized package, installed-release, real translation-service, Clipboard/Paste, foreground keyboard, or extended-display smoke is claimed. The ordinary full Electron smoke brings windows forward and was deliberately not run without immediate user permission.
