# Native Date Controls — Source Checkpoint Only

`tockteam-qwzg.8.3.6.2` remains **in progress**. Native source and fake checks are checkpointed; real Desktop/screenshots, broader root/build/stage, appearances, protection finalization and full-tree cleanup proof are still pending. Do not treat this report as a completed UI or compatibility proof.

## Scope

Reuse the existing Launcher native field controls and finite DatePicker pipeline from `e48033dd`. Native Date / DateTime modes use labeled `date` / `datetime-local` inputs, exact primitive ISO/null transport, inclusive mode-aware limits, accessible local/SDK errors, stable identity/focus/drafts/ref focus and pending-edit keyboard submission. SDK SubmitForm projects a primitive boolean marker; the renderer validates only date controls belonging to that submitted Form, leaving ordinary reset actions and a separate healthy Form usable. It does not authorize another effect.

Local input conversion uses native `valueAsNumber` and UTC component reads followed by local `setFullYear` / `setHours`, avoiding the JavaScript numeric-constructor year0–99 trap. An unchanged calendar view preserves its **original exact instant**, including subsecond precision and the later duplicated hour at DST fall-back; local wall-clock numbers handle browser/JSDOM fraction normalization. Nonexistent local times reject visibly. Year1/10000 are exact in fake DOM checks; unrepresentable native year0/negative/default extremes fail visibly rather than silently becoming null. On a mode switch with an invalid pending draft, the calendar portion is retained and an explicit re-entry error blocks submission until the user edits; no substituted value is sent. Explicit clearing sends null. Existing dirty/version/field queue/backpressure and restricted Host isolation are reused; no dependency, native popup opening, Node/file/process/browser authority, profile/storage root or plugin system was added.

## Confirmed Findings

**3 confirmed development findings, all fixed across the source checkpoints.** Neither existed as a shipped Date feature in the prior no-Date renderer.

1. **Medium — Nonexistent local time normalized into a different selected hour.** Impact: an entered `02:30` in a spring DST gap became `03:30` during Date construction. Affected path: `src/user-raycast-renderer.ts` Date field conversion/validation. RED observed one `fieldChanged` when zero was required. Fixed by comparing the reconstructed instant's local wall-clock number against the entered native number, showing an accessible error and retaining the invalid draft while blocking changed events and SubmitForm. Date focus/blur can still report the last accepted typed projection. GREEN fake gap, bounds and submission checks.

2. **Medium — Switching date modes could throw on an invalid pending draft.** Impact: a controlled DateTime→Date patch called the gap parser outside event validation and could escape the renderer update. Affected path: `src/user-raycast-renderer.ts` mode transition. RED captured the unwanted nonexistent-time exception. Fixed by retaining the calendar portion under the requested native mode, marking the draft as needing re-entry and blocking submission without sending a replacement. Explicit editing clears the marker. GREEN exception/draft/no-submit/re-entry check.

3. **Medium — An explicit SDK reset could leave a rejected native draft displayed.** Impact: a November2 draft remained after reset even though the owned SDK default/current value was October2; a locally rejected change has no child ACK to clear its dirty version. Affected paths: `src/trusted-raycast-compat-api.ts`, `src/user-raycast-manager.ts`, `src/user-raycast-renderer.ts`. Real first-party API + Manager + JSDOM integration RED showed exact `2026-11-02 !== 2026-10-02`. Fixed with a date-only owned integer reset-intent counter and clearing only the invalid local draft/mode marker on an explicit reset. Ordinary focus/unrelated patches and valid unacknowledged input remain intact. Manager rejects negative/fraction/string counters; existing primitive serialization omits nonfinite values rather than transporting a reset. GREEN public integration and pending/focus/reset checks; no new IPC method or effect authority.

The prior persistence test's second observed race (`mounted forms with the same field ID`) was also corrected: wait for the exact visible JSON callback result before the next owned field/action request, preserving both forms' typed value assertions. Child stale-revision guards were not relaxed and no production action flush/retry was added. This is the same verification-timing concern documented in the API report, not a new runtime finding.

Separate environment behavior: JSDOM interprets a manually shortened `.25` fraction as25ms, unlike Chromium's standard250ms. The formatter writes all three millisecond digits and tests compare native wall-clock numbers instead of brittle serialized strings. This is not counted as a confirmed product bug or a Chromium proof. Native OS popup keyboard selection, friendly date-expression input, full-day helper encoding and non-calendar Date extremes remain unverified/unsupported, not counted findings.

## Exact Source Verification

```sh
# RED text !== date, then first typed/clear GREEN.
node --test --test-reporter=tap tests/user-raycast-form-date-renderer.test.ts
# RED one gap change instead of zero, then GREEN.
node --test --test-reporter=tap tests/user-raycast-form-date-renderer.test.ts
# RED controlled invalid mode patch throws, then GREEN.
node --test --test-reporter=tap --test-name-pattern='switching modes' tests/user-raycast-form-date-renderer.test.ts
# 79/79 pass: all owned Form suites, including 8 Date API and 7 Date renderer scenarios.
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast-form*.test.ts
pnpm run typecheck
```

Fresh reset-stage source gates before the peer's additional composer gap adjustment: 466 passed/6 optional skipped/0 failed in the scoped Raycast/launcher suites; root `pnpm test` 1,701 passed/18 optional skipped/0 failed; typecheck, `pnpm build`, `node scripts/stage-dsh.mjs --quick` green. The first new reset-metadata abuse test mistakenly expected raw Infinity to produce an error; isolated evidence showed the existing child finite-primitive filter correctly omitted it. Corrected to assert exact omission, retained null state/no reset/no error, and kept negative/fraction/string counter rejection checks. No guard or expected user behavior was weakened. Real Desktop/geometry/appearance/protected final proof remains pending.

Root typecheck passed; its config explicitly excludes `plugins/tocktutor/**/*`, allowing this source-only check during the coordinated TT five-path writer window. All fake first-party child runtimes build in `/tmp`, with network prohibited and process groups stopped. No real app/browser/server was started during this checkpoint. Source evidence is `/tmp/tockteam-form-date.wxuzpM`.

The three review references (simplification, security/hardening, performance) were applied. Standard Date/native inputs and existing field maps are used; no natural-language parser or speculative full-day midnight rule was invented. Protected files, TT/gallery/generated outputs, unowned Playwright artifacts, user data and credentials are untouched. Frozen TT before the new five-path footer writer was `09c3c06a` / `7abdc4a9`; peer-owned footer/composer source/test changes are explicitly excluded from the next ownership comparison and must be frozen before the later real UI proof. No push or worktree.

## Pending Proof

After the peer's bounded footer/composer root-build/GUI/publication handback: fresh broader root and focused gates, build/quickstage, guarded isolated real Desktop date fixture at default dark/no-skin and exact1512×949CSS@2→3024×1898 screenshots; edit/clear/limit/ref/Control+Enter/accepted-save/cancel/reopen, narrow layout/appearance/focus/error/nonlocal-request evidence, transactional allowlisted publication, owned process-tree/group cleanup and frozen-path checks. The parent `.8.3.6` remains open beyond that proof for friendly expressions, full-day semantics and any other unsupported DatePicker behavior.
