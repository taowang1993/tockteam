# Typed Date Value Foundation

Bounded `tockteam-qwzg.8.3.6.1` API/transport checkpoint. The parent DatePicker and full compatibility goals remain open; this is not native date rendering or full-day/natural-language parity.

## Scope and Result

Public SDK2.0.3 Form.DatePicker accepts real JavaScript `Date | null`; its Type values are `date` / `date_time` (DateTime by default), and `FormDatePicker` is the documented alias. The implementation keeps primitive canonical ISO strings/null in the existing Form state, private transport and atomic cache. A thin DatePicker boundary validates/encodes Date props and reconstructs fresh Dates for change/focus/blur; per-Form date IDs reconstruct true Dates for SubmitForm. It reuses basicFormField/defaults/controlled/ref/selection/cleanup semantics rather than introducing a parallel Date runtime, plugin or storage system. Parent field maps, restricted IPC and scalar/tag/search/native limits remain intact; null is admitted only for declared date kinds. Mode and bound metadata are validated before renderer projection. Inclusive day limits ignore clock components in the local calendar; DateTime limits compare exact instants. Rejected selections do not mutate the owned draft, while refs still reset to the declared default. Accepted-only stored Dates/nulls restore cold; callback/default/submit mutation does not alias owned values.

The SDK types and official Form page confirm these contracts. The NPM package at 2.0.3 contains CLI/type declarations, not a documented runtime full-day encoding. `Form.DatePicker.isFullDay` rejects explicitly instead of guessing a midnight/hidden-marker rule. Natural-language date expressions and native rendering are separate pending slices. No Tinycast implementation was read/copied or third-party extension executed.

## Confirmed Findings

**1 confirmed verification finding, fixed; 0 confirmed runtime defects in this bounded API checkpoint.**

1. **Low — Persistence unmount check raced React's visible commit.** Impact: a transient root-suite failure despite accepted storage and eventual correct unmount. Affected path: `tests/user-raycast-form-persistence.test.ts:65–70`. The calendar peer recorded `1 !== 0` at line67 with unchanged source, then exact retries passed. Child action outcome acknowledges the callback, not a synchronous React commit; forcing production flush would invent a timing contract. Fixed by bounded waiting for the visible Form unmount before the **same** zero-Form assertion. API/scoped checks pass fresh. The Date fixture also records a monotonically increasing visible result revision so repeated equal submissions still have a real observable commit; no expected values/assertions were weakened.

Missing Date support was feature RED, not another counted bug. Unconfigured Exa/Bx auth prevented additional web search; no auth/config change occurred and neither is a product bug. React Doctor selected no projects, so no effective lint/score audit is claimed.

## Exact Fresh Checks

```sh
# Temp-only during the peer's named-writer freeze: 0/1, Missing field when; group75945 stopped.
node --test --test-reporter=tap /tmp/tockteam-form-date.wxuzpM/date-api.test.ts
# Durable RED: 0/1 Missing field when, then GREEN1/1.
node --test --test-reporter=tap tests/user-raycast-form-date.test.ts
# Bounds RED: missing min projection, then GREEN2/2.
node --test --test-name-pattern='date selection limits' --test-reporter=tap tests/user-raycast-form-date.test.ts
# Final foundation checks: 52/52, including 8 Date scenarios and Date IPC validation.
node --test --test-reporter=tap tests/user-raycast-form-date.test.ts tests/user-raycast-form-ipc.test.ts tests/user-raycast-form-values.test.ts tests/user-raycast-form-editing.test.ts tests/user-raycast-form-persistence.test.ts
# 457 passed / 6 optional skipped / 0 failed.
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast*.test.ts tests/trusted-raycast*.test.ts tests/launcher-ipc.test.ts tests/launcher-preload-bridge.test.ts tests/launcher-window*.test.ts
pnpm run typecheck
react-doctor src/trusted-raycast-compat-api.ts --no-supply-chain --no-score --no-cache --json
```

Typecheck passed. Tests cover real Date/null submission, both modes and alias, inclusive limits, rejected values, controlled async updates, typed focus/blur, ref reset/focus, mutable Date default/callback/submit isolation, accepted-only storage/null restore, wrong owner/session/revision/request/handle/kind, malformed/overflow/noncanonical Date data, denied field clipboard effects, unmounted values/handles, invalid API props and forged date projection metadata. New canonical Date wire validation covers years1/10000 and leap dates without calendar/native scope claims. All fake sources prohibit network and stop their owned process groups; builders write first-party outputs only in `/tmp`.

All three review references—simplification, security/hardening and performance—were applied. This foundation uses standard JavaScript Dates and the existing bounded pipeline; no dependency, renderer/Node/preload authority, credential collection, storage migration, native effect, DSH plugin system, worktree or push was added. At the source checkpoint, 2,008 frozen tracked baseline hashes and 85 final peer gallery hashes remained unchanged. Protected user files and old unowned Playwright artifacts were untouched. TT source/proof handback was `09c3c06a` / `7abdc4a9`; no broader root, build/stage or GUI proof follows from this API-only report. `.8.3.6` remains open for native date controls, geometry/theme/error/cleanup evidence, full-day semantics, date expressions and other unverified behavior.
