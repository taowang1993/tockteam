# Can I Use Host Asset Reader

Scope: `tockteam-3l3.4.2`; still no production descriptor, manager session or package admission.

`loadTrustedRaycastCanIUseData()` now loads the one fixed asset filename from a Host-selected runtime directory. It reuses the shared held-file size/no-follow reader and existing exact gzip/capsule digest checks and immutable decoder. It has no repository fallback, caller-supplied digest, stale-success cache, package evaluation, workspace discovery or renderer-facing path operation. The source/reconciler proof now consumes this loader rather than manually assembling the read/decode calls.

While connecting that reader, a real FIFO regression demonstrated that `O_RDONLY` could block before `fstat` rejected a non-regular object. Adding `O_NONBLOCK` to the shared reader fixes the root cause for all its artifact/metadata/derived-file callers. Regular-file and digest behavior is unchanged. This is a POSIX read safeguard, not an OS sandbox.

## Evidence

Directory: `/private/tmp/tockteam-can-i-use-reconciler-r1.yVXLIW/`.

- `host-loader-red.txt`: loader stub rejects valid admitted data before implementation.
- `fifo-red.txt`: reader waits for a FIFO writer; bounded test times out after 1.5 seconds and removes PID/group 7696.
- `host-loader-green.txt`: FIFO and source/reconciler checks pass; one new test supplied a three-field catalog row to the adapter's exact two-field identity API and failed. The test was corrected, not the adapter contract.
- `host-loader-green-r2.txt`: 12 checks pass: real FIFO rejection, archive identities, build attestation, Host asset load/failure cases and six source/reconciler scenarios.
- `host-coverage.txt`: Host loader has 100% line/branch/function coverage.
- `host-admission-regressions.txt`: build, install recovery and package-contract checks pass.
- `host-typecheck.txt`: direct typecheck passes. `git diff --check` passes.

Failure cases include missing and modified bytes, oversize, directory, symlink, and replacement after a successful load. No fallback resurrects the prior snapshot. Process cleanup is verified in the real FIFO and source-child checks. No app or native effect was started.

```sh
PATH=/opt/homebrew/opt/node@24/bin:$PATH ./node_modules/.bin/tsx --test tests/trusted-raycast-can-i-use-runtime.test.ts tests/trusted-raycast-artifact-admission.test.ts tests/trusted-raycast-can-i-use-source.test.ts
/opt/homebrew/opt/node@24/bin/node --experimental-test-coverage --test-coverage-include='src/trusted-raycast-can-i-use-runtime.ts' --test tests/trusted-raycast-can-i-use-runtime.test.ts
PATH=/opt/homebrew/opt/node@24/bin:$PATH ./node_modules/.bin/tsx --test tests/trusted-raycast-build.test.ts tests/trusted-raycast-install-recovery.test.ts tests/trusted-raycast-package-contract.test.ts
PATH=/opt/homebrew/opt/node@24/bin:$PATH ./node_modules/.bin/tsc --noEmit
```
