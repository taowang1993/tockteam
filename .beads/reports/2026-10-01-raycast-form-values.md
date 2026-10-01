# Raycast Form Value Collection

## Scope

Beads `tockteam-qwzg.8.3.1`: shared API defaults and submission only. This checkpoint collects basic TextField, PasswordField, TextArea and Checkbox values; it does not implement user editing, field events, refs, keyboard behavior or native form rendering. Those remain under `tockteam-qwzg.8.3`. The pinned MIT SDK 2.0.3 contract is the behavior reference; no Tinycast implementation was copied.

Properties released source/index at `7456761d` for a narrow slot, then explicitly extended it. No root build, stage, generated artifact, display, installed smoke, real extension, account action or native effect was authorized or performed. Display 17 stayed reserved to the Properties peer.

## Confirmed Findings: 2

1. **Medium — A rejected submission reported success.** A SubmitForm callback returning `false` was ignored, so the outcome said it succeeded. Affected path: `src/trusted-raycast-compat-api.ts`. **Fixed and verified:** awaited submission now rejects a false return; existing promise rejection remains a failure. First-party child checks exercise both without external actions.
2. **Medium — Basic field defaults were absent from submitted values.** TextField was a projection-only component and never contributed its declared default to the Form. Affected path: `src/trusted-raycast-compat-api.ts`. **Fixed and verified for this API checkpoint:** a form-owned map collects first defaults and controlled values, including empty strings and false. The same collection supports the three additional basic field declarations. Unmounted basic fields are removed, separate forms remain isolated, and `Object.fromEntries` preserves special field names without changing the result's prototype.

## Implementation

- Replace the process-global Form registry with a map owned by each mounted Form.
- Retain the first configured basic default across rerenders; a provided controlled value takes precedence.
- Register basic values at layout commit and remove them on unmount.
- Validate basic IDs and value types; render errors remain visible, with no successful action outcome.
- Preserve the reviewed bundled projection shape and existing Dropdown adapter. No child/manager/IPC/native authority was expanded.

The added declarations and value metadata are a foundation, **not a claim that interactive forms are now available in the product**.

## Test-First and Final Verification

Initial durable check:

```sh
node --test --test-concurrency=1 --test-reporter=tap tests/user-raycast-form-values.test.ts
```

Before the fix: **1 passed, 5 failed**. After the fix: **6/6 passed**. Coverage was then strengthened to nine cases: typed defaults, controlled empty/false values and updates, first-default retention, unmount, StrictMode, cross-form/prototype-safe IDs, false/rejected submission and invalid inputs.

Final focused command: **74 passed, 0 failed**.

```sh
node --test --test-concurrency=1 --test-reporter=tap tests/user-raycast-form-values.test.ts tests/user-raycast-view-data.test.ts tests/user-raycast-runtime.test.ts tests/user-raycast-cache.test.ts tests/user-raycast-install.test.ts tests/user-raycast-ipc.test.ts tests/user-raycast-renderer.test.ts tests/user-raycast-source-build.test.ts tests/trusted-raycast-preferences.test.ts tests/trusted-raycast-renderer.test.ts
```

The last file is the actual existing nested AddLanguageForm/navigation suite; the initially prescribed `trusted-raycast-nested.test.ts` filename does not exist.

Fake-only OAuth cleanup regressions: **20 passed, 0 failed**.

```sh
node --test --test-concurrency=1 --test-name-pattern='cleanup details|first-party OAuth cleanup|mocked shutdown' tests/user-raycast-oauth-cleanup.test.ts tests/user-raycast-oauth-runtime.test.ts
pnpm run typecheck
```

Typecheck passed with no diagnostics. Parent reviewed the actual logs, runner metadata, hash records and group audit, not only the helper's summary. Final checks used detached runner groups 4040, 4166 and 4269; all stopped. All 38 recorded fixture groups independently returned ESRCH. The source/test hashes matched before and after verification. All 2,344 unrelated tracked files, including TockTutor source/lib/dist/manifest and the protected three paths, remained byte-identical to the pre-slot snapshot before evidence updates.

Evidence directory: `/tmp/tockteam-raycast-scope.5lIcfC/` (`form-values-red.log`, `form-final-focused.log`, `form-final-oauth.log`, `form-final-typecheck.log`, runner JSON, hash records, `fixture-group-audit.json`, `form-protection-check.json`).

## Infrastructure and Limits

The first read-only Luna verifier `e60a02c4` timed out at 360000 ms. Its focused run had 72 passes and two fixture-expectation failures: React can commit an empty ready frame before delivering a render error, so startup is not guaranteed to reject. The parent refined only those assertions to require the exact error and no success, captured the partial diff, and resumed the exact stored role/model/tool contract as `d9ff2944`. Recovery completed successfully; no runner fallback occurred. The timeout and fixture assumptions are not counted as product findings.

No product GUI, screenshot, build/stage or installed proof was completed here. Broader Tinycast-scope compatibility remains incomplete and unverified; the Raycast URL-handler/sign-in exception and all prior security boundaries remain unchanged.
