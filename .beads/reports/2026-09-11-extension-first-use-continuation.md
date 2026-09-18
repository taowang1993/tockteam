# Extension first-use continuation

## Result

Verified application/source-proof HEAD: `108b7fb5` (baseline `5e0c08ed`, plan/diff base `4d5190e9`). Local commits only:

- `79dd441f` — fence revoked startup readiness and retain cancellation focus (the eight edits preserved across the pause).
- `108b7fb5` — isolate source Electron proofs from macOS Keychain.

The original readiness/disposal findings were valid and fixed. Captured ownership is checked before child and preference-setup ready publication; all three main command starts supply the guard. Existing post-start cleanup, internal theme restart semantics, pinned installer/artifacts, consent, disabled decisions, data roots, and Windows exclusion remain. Regression tests include a delayed real child, synchronous revocation with queued stop, suppressed readiness, cancellation rejection, and complete child-group termination. The headless proof previously exposed and verified the related disabled-approval focus fix; renderer code has not changed since that green proof.

## Test-only Keychain isolation

All five actual source Electron argv sites now include macOS-only native `--use-mock-keychain`, before the application path:

- `scripts/trusted-raycast-can-i-use-electron-proof.mts:110`
- `scripts/trusted-raycast-kaomoji-electron-proof.mts:175`
- `scripts/launcher-electron-smoke.mjs:310,2355,2403` — initial launch, second-instance toggle, restart. This is the launcher harness used by Translate.

`tests/trusted-raycast-focus-proof-client.test.ts:41` enumerates those sites, checks the native platform guard in every argv, and rejects HOME/USERPROFILE overrides. No new harness, production secure-storage changes, Keychain commands, credential access, HOME replacement, or global Keychain changes. The parent confirmed the earlier OS prompt originated in the other tutor session's temporary HOME/USERPROFILE override; the earlier uncertainty is superseded by that investigation.

The static regression failed before implementation, then passed 12/12 with its containing test file. The supervisor independently checked the five sites and explicitly authorized only the bounded inactive Can I Use proof after full tests/typecheck/build passed.

## Verification

Exact commands (longer commands were invoked via the existing `/tmp/launcher-review-run.mjs` bounded process-group wrapper):

| Command | Result |
| --- | --- |
| `node --test --test-name-pattern='every source extension proof launch' tests/trusted-raycast-focus-proof-client.test.ts` | RED: failed because actual argv lacked mock Keychain |
| `node --test tests/trusted-raycast-focus-proof-client.test.ts` | GREEN: 12 passed |
| `pnpm test` | Fresh on committed code HEAD: 1,151 tests, 1,137 passed, 14 skipped, zero failures |
| `./node_modules/.bin/tsc --noEmit` | Fresh on committed code HEAD: passed |
| `node scripts/build.mjs` | Fresh on committed code HEAD: passed |
| `node --test --test-concurrency=4 tests/trusted-raycast-*.test.ts tests/trusted-raycast-*.test.mjs tests/launcher-preload-bridge.test.ts tests/launcher-installed.test.ts tests/launcher-packaged.test.ts tests/launcher-cdp-keyboard.test.mjs tests/launcher-renderer-contract.test.ts tests/launcher-focus-proof.test.ts tests/right-panel-layout.test.ts` | Fresh on committed code HEAD: 420 tests, 413 passed, 7 skipped, zero failures |
| `node scripts/trusted-raycast-can-i-use-electron-proof.mts` | Fresh after permission: passed on the identical source bytes subsequently committed above; built/staged source, cold setup/preferences/query/details/theme/warm and legacy checks |
| `git diff --check` | Passed |

Evidence logs: [extension-first-use-continuation](extension-first-use-continuation/). The files named launcher-installed/packaged in the focused command are Node contract tests, not installed/packaged application smokes.

No headless rerun: explicitly unnecessary for unchanged renderer per the resumed direction. Prior successful renderer proof remains `/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/extension-first-use-browser-6OlDb5` (cold/warm, Escape, stale readiness, visible startup cancellation, keyboard focus, IPC retry, shared extensions, disabled consent, keyboard management). That is prior evidence, not claimed as fresh.

## Process/authority evidence

Only the approved inactive Can I Use app proof was launched in this continuation. No ordinary launcher, Translate, Kaomoji, installed, foreground or user-profile app launches.

- Proof runner root/group: `2898`; Electron root/group: `3062`.
- Actual Electron argv persisted in [root-pid.json](extension-first-use-continuation/root-pid.json): executable, `--use-mock-keychain`, `.`, `--remote-debugging-port=49549`, disposable `--user-data-dir=.../can-i-use-electron-profile-CF0SMP`.
- [proof.json](extension-first-use-continuation/proof.json): `passed: true`, zero focus events, zero focused windows at all checkpoints, `allOwnedProcessesGone: true`, empty cleanup errors, checked live/legacy profiles unchanged, no external browser opening.
- Existing authenticated IPC shutdown and finally cleanup ran; independent post-proof `ps` comparison found none of the recorded runner/Electron/descendant PIDs remaining. No OS prompt was observed or interacted with.
- Fresh committed-head root suite/typecheck/build/focused runner groups: `4348`, `5373`, `5392`, `5438`; each wrapper recorded `processGroupStopped: true`. Earlier precommit prerequisite groups also stopped: `1378`, `2518`, `2535`, `2613`.

## Review and remaining gates

Applied all three review references: simplification, security/hardening, performance. No additional blockers found in the scoped edits. The readiness guard stays at the publication boundary without a new coordinator; test-only native Keychain switches do not alter production authority. No dependencies or unbounded work introduced.

Installed proof remains explicitly pending in follow-up `tockteam-dnw`: its foreground-capable harness is outside this pass and was not expanded or run. Cross-platform argv isolation is statically checked; only macOS inactive source proof was executed. Configured optional integration tests account for the reported skips. No push.

## Final Source Acceptance

Fresh-context reviewer `c0cf353f-ae3a-46de-9278-1e0d4e4d29d2` reviewed cumulative changes through `a8234dbd` and returned `ok`, with no findings. It applied all three review references and inspected readiness ownership, cancellation/focus, preference/theme restarts, all five mock-Keychain launch sites, and verification/process evidence. Its verdict is scoped source acceptance, not installed release readiness.

The parent independently reran `pnpm run typecheck && pnpm test` at `a8234dbd`: typecheck passed; 1,151 tests, 1,137 passed, 14 skipped, zero failures. Log: `/tmp/launcher-first-use-parent-final-tests.log`. The parent also inspected the actual isolation diff, recorded Electron argv, cleanup manifest, and cancellation-focus screenshot. No source changes followed those checks; this final addition records acceptance only.

Cumulative code diff saved for attribution: `/tmp/launcher-first-use-4d5190e9-to-108b7fb5.patch`. The final handoff additionally names a cumulative patch including this documentation/evidence commit.
