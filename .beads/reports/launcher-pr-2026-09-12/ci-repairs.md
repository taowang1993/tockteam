# PR 6 CI Repairs

## Failure Diagnosis

The first PR run, `34678576435`, exposed platform and timing failures that the local macOS arm64 run had not reproduced. Its Windows job was stopped with explicit user approval after its normal test step stalled; the previous successful Windows test step took 48 seconds. The cancelled run recorded 41 failed tests, largely sharing the causes below. No Windows coverage lane was removed.

- **Nix:** the build helper's fixed `/usr/bin/tar` did not exist in the sandbox. The Nix derivation now substitutes that literal with its absolute gnutar store executable using `--replace-fail`; ordinary system-helper selection and artifact admission are unchanged.
- **Linux:** the workspace proof assumed macOS's `/usr/sbin/lsof`. It now selects `/usr/bin/lsof` on Linux while retaining all fail-closed cleanup checks.
- **macOS:** language tests observed projections before queued atomic writes completed. They now wait for exact persisted values. Intel Swift compilation exceeded a 20-second test-process limit; the fake-pasteboard self-test has a bounded cold-start allowance without changed security deadlines.
- **Windows:** directory `fchmod` failed before managed persistence could initialize. Directory custody checks remain, but POSIX mode enforcement is not attempted on Windows, which inherits the app-data ACL. This is not a Windows ACL privacy guarantee.
- **Windows:** absent `O_NOFOLLOW` allowed symlink reads. The shared bounded-file reader now verifies regular-file identity before opening, against the held descriptor, and after reading, with bigint device/inode comparisons. Existing native flags, byte caps, and descriptor cleanup remain.
- **Windows:** two POSIX process-group tests left their children alive, holding the suite open. Only integrations that require unsupported POSIX runtime/group/snapshot machinery skip Windows; Linux coverage remains. The pure cached-state compatibility-hook test remains enabled on every platform. Runtime availability is not expanded.
- **Portable fixtures:** file URIs, Node `--import`, private temporary-directory variables, direct-process exit expectations, and archive extraction now use platform-correct inputs. Can I Use source-proof imports use complete quoted-specifier replacement callbacks and JSON encoding, including quote and `$&` paths.
- **Hang bound:** the core CI test step now has a five-minute deadline rather than consuming the entire 30-minute job budget.

## Local Verification Before Publication

Runtime and test source at `d289ae58`:

| Command or Check | Result |
| --- | --- |
| `pnpm run build` | Passed |
| `pnpm test` | 1,187 passed, 14 skipped, zero failures; 1,201 total |
| `pnpm run typecheck` | Passed |
| Core file-custody regression tests before implementation | Five failed, two passed |
| Core file-custody and all affected persistence/preference/runtime tests after implementation | 39 passed |
| Can I Use source proof under a quoted, `$&` temporary path before correction | Five failed, one passed |
| Same source proof after correction | Six passed |
| Cached-state compatibility-hook suite | Seven passed |
| One-off isolated cold Swift module-cache self-test | Passed on macOS arm64; temporary cache removed |
| `git diff --check` | Passed |
| Redacted whole-branch Gitleaks history scan | No findings; 242 commits scanned |

The file-custody tests exercise missing native no-follow protection, static symlinks, regular-file and symlink replacement during open, pathname replacement during read, concurrent growth, exact-limit reads, descriptor closure, retained POSIX permission failures, and Windows directory custody. These simulations are not native Windows execution evidence.

The parent independently reviewed and corrected an overly broad worker skip: the cached-state hook test does not use a POSIX child and must continue to run on Windows. The parent also reproduced and fixed the remaining source-proof import-quoting issue before publication.

## Second Hosted Pass and Follow-Up

Run `34681147258` at `db5763b1` passed Linux, both macOS architectures, the native Nix package smoke, and the runtime smoke. Windows completed in 3 minutes 7 seconds rather than hanging, with three remaining failures:

- A preference test incorrectly expected POSIX `0600` mode bits on Windows; only that inapplicable assertion is now conditional, while persistence and link rejection remain tested.
- The binary artifact reader is separate from the text preference reader. Its missing-no-follow case now has the same bigint pathname/descriptor custody checks, plus consistent final size, without changing binary buffers or digest admission. Five new regression cases failed before the repair and then passed.
- The process test's old `9`/`null` mapping had been mistaken for the native close signal. It now verifies the actual signal: POSIX must escalate to `SIGKILL`, while Windows force-terminates on `SIGTERM` or `SIGKILL`. Readiness follows handler installation and cleanup runs in `finally`.

The exact four-file follow-up received an independent **OK with notes** review before publication. Local gates at `36b1271b` then passed: **22 focused tests**, build, typecheck, and **1,193 passed / 14 skipped / zero failures** in the 1,207-test full suite. The redacted history scan found no leaks across 245 commits. The verification process group and matching child/probe/compiler processes were absent at slot release. Native CI must confirm this subsequent source separately; the preceding run's successes are not substituted for it.

## Evidence and Safety Limits

- No app, browser, provider, live clipboard, or foreground automation was launched for these repairs. Local verification process groups and matching trusted-child/source-proof/Swift processes were checked for residue before releasing the shared execution slot.
- Nix is unavailable locally and Docker is stopped. Local Nix contract/substitution checks do not constitute a native Nix package build; the hosted rerun must establish that result.
- Windows runner execution and Intel cold-start timing must likewise be confirmed by the hosted rerun. Check the PR's current run, not the cancelled run, for those results.
- The previously checked-in installed report remains evidence for source `59ee1338`, not fresh installed approval of these later repairs. Its bytes and source identity are unchanged. No new signing, notarization, Windows/Linux installed-artifact, or native-UI claim is made.
- The bounded-reader repair does not claim ancestor-race protection, an ACL guarantee, or protection from arbitrary same-inode concurrent content mutation. Windows external shared-file writes remain disabled, and trusted runtime availability remains macOS-only.
