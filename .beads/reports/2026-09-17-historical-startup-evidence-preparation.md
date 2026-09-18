# Historical Startup Evidence Preparation

## Scope

Implementation commit `5af871c3`. This diagnostic-only change addresses the evidence gap in Windows run `35169998523`: both historical runner modes exited with errors but provided no usable phase journal, and only output byte counts survived. It does not identify or repair the original historical stall.

The user's “Continue” authorized local preparation and review following a handoff that explicitly required fresh approval for another Windows run. Preparation itself did not publish or dispatch. The separately authorized execution is recorded in [the Windows result](./2026-09-17-historical-startup-evidence-windows-result.md).

## Minimal Instrumentation

`scripts/historical-runner-reporter.mjs` uses Node's existing multiple-reporter mechanism. The existing runner remains the root; no wrapper process, production ownership API, historical assertion, source pin, dependency, or test deadline changes.

- Node 24.20.0's default **SPEC** reporter remains on stdout, preserving the existing 1 MiB owned-output ceiling. The default was verified against the downloaded official runtime.
- A second reporter privately uses Node's built-in TAP formatter and emits only finite allowlisted error-code/name/category signals. No free-form messages, stacks, paths, environment, or credentials are stored in its evidence.
- It scans at most the first 64 KiB of formatted TAP, records truncation, emits each signal once, and drains subsequent events. The resulting evidence is bounded to 8 KiB and validates exact fields and known signals before inclusion in the receipt.
- Initial and incremental signal records survive partial capture when complete lines were written. Missing, malformed, or incomplete capture stays explicitly incomplete and cannot validate a passing arm.
- Original historical arguments remain in `arm.args`; identical additional reporter instrumentation is applied privately to both modes. The copied reporter's SHA-256 is recorded and rechecked. Absolute reporter/destination paths are not published.

The output contains **observed clues**, not verified causes. Signals can occur in ordinary output, unsupported errors may produce no recognized signal, and errors after the scan ceiling may be missed. The completion marker means reporter exhaustion, not successful tests. A failure before reporter initialization still produces incomplete evidence. Additional reporting perturbs scheduling; no performance-equivalence claim is made.

## Verification

Official standalone Node 24.20.0, macOS arm64; archive SHA-256 `40e5607e5ecb3db9192723776da2d75d966260fc74a7a9e731c1bd67dda96bc8`.

```sh
"$PORTABLE_NODE" --test --test-name-pattern='historical startup errors' tests/historical-runner.test.ts
"$PORTABLE_NODE" --test tests/historical-runner.test.ts
"$PORTABLE_NODE" node_modules/typescript/bin/tsc --noEmit --pretty false
"$PORTABLE_NODE" --check scripts/historical-runner.mjs
"$PORTABLE_NODE" --check scripts/historical-runner-reporter.mjs
git diff --check
```

RED: after exporting the existing `runArm()` test seam without adding capture, a real missing static module exited with verified cleanup but failed the new assertion because `startupEvidence` was absent. A second RED showed that `assertPassingArm()` previously accepted an otherwise valid record with `evidenceIncomplete=true`; it now rejects that state.

GREEN: **13/13 checks passed, zero skipped**. The new real-process regression exercises missing static import, invalid TypeScript, an ordinary selected test error, and output overflow in both runner modes. The test-error journals confirm the default worker differs from the root and the no-isolation test runs in the root. Overflow still triggers the existing owned 1 MiB rejection rather than a deadline. All eight root/group absence checks, independent inventories, and fixture removal assertions passed. No real historical dependencies are substituted into these synthetic controls.

Final eight process roots: 30217, 30220, 30222, 30225, 30227, 30230, 30232, 30235. Privacy, unknown/extra fields, duplicate signals, partial rows, completed-stream ordering, size ceilings, and truncation are covered by focused parser checks. Existing npm, pnpm isolation, and default-worker/stalled-descendant controls also passed.

Workflow YAML was parsed using the existing installed YAML package. Only the preflight name, selected checks, and outer cleanup headroom changed. The reviewer identified that its old one-minute limit could preempt an inner 60-second arm's cleanup; the preflight now allows two minutes. The historical arm remains 60 seconds, diagnostic step 11 minutes, and job 15 minutes.

## Review and Remaining Gates

Initial independent review `769a11c0` applied simplification, security/hardening, and performance references. Its preflight-headroom finding was accepted and fixed. Follow-up review `9aa00b03` found no remaining issues and accepted the source-only scope. Parent applied the same three perspectives; no production or dependency change is included.

Native Windows behavior of the new reporter is not yet verified. The prior full local historical fixture attempts failed during sqlite3 download/build setup; this preparation does not claim that gate passed and does not modify the machine's Python, dependencies, or install policy to bypass it. The synthetic controls do not replace a full historical replay.

After reviewing these limits, the user explicitly selected **Run One Windows Check**: publish only to the existing verification branch and execute one bounded comparison, carrying the full local replay gap. No automatic retry, main push, merge, release, or Desktop launch is authorized. `tockteam-bon` remains open.
