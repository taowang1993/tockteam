# Native Date Fields — Verified Desktop Subset

The scoped native Date/DateTime task `tockteam-qwzg.8.3.6.2` is verified. The Date parent `.8.3.6`, remaining Forms, and overall Tinycast compatibility are **not complete**.

## Verified Behavior

Independently written, offline first-party `offline-date-fields` / `dates` fixture in a real generic Electron 42 Desktop, using the existing approved-child/install pipeline. This is not a real Store extension or an installed release.

- Declared day `2026-10-02`, controlled meeting `2026-10-03 14:30:15.250`, and explicit null reminder; correct native `date` / `datetime-local` types and October inclusive bounds.
- Empty required day rejects submission, shows `Choose a day before saving.` with `aria-invalid`, and stays in the Form. Out-of-range November2 is retained as a visible invalid draft without changing the accepted SDK date or saving.
- `Reset and Focus` clears the rejected draft back to October2 even when the child value already equals its default. It also restores the controlled meeting's exact250ms default. This proves the reset edge fixed in `a88ab875` through the real app, not only JSDOM.
- Pending Control+Enter submits real SDK Dates, not strings: local day `[2026,10,12,0,0,0,0]`, meeting `[2026,10,13,16,45,30,125]`, and null reminder. The accepted callback visibly unmounts the Form.
- Only opted-in day/null reminder restore in a fresh child. Unmarked controlled meeting retains its declared default. Before and after accepted save, editing and then cancelling does not replace remembered values.
- A second, fresh guarded Desktop host received only the approved install and exact accepted cache. It restored day October12 / empty reminder and the unchanged default meeting. Stored records are canonical ISO/null in the existing command/Form cache, not a separate Date store:

```json
[["day","date","2026-10-11T16:00:00.000Z"],["optional","date",null]]
```

- Actual zone was `Asia/Shanghai`: local October12 midnight is October11 16:00Z. Native unchanged meeting `.25` display equals exact250ms via `valueAsNumber`; no text-normalization workaround alters its instant.
- Keyboard focus had a solid2px outline. Native date segmented Tab behavior was observed; no claim that one Tab necessarily advances to Meeting. At640 CSS pixels, all three fields and the Form measured606px with no overflow.

## Screenshots and Runtime Evidence

Only the four explicitly allowlisted original PNGs are published; no temporary previews, logs, profiles or unrelated gallery assets are copied. Each capture independently verified1512×949 CSS pixels, device scale2, actual3024×1898 PNG bytes, launcher file route, built-in dark `style.colorScheme`, absent skin attribute and renderer `require`/`process` isolation. The owned profile was seeded `{"activeId":null,"fallbackTheme":"dark"}`; HOME was preserved and `--use-mock-keychain` was present. Both app windows stayed on extended display17 and were not focused. Global shortcuts were intercepted; all effects were denied in the fixture.

1. `date-fields-default-dark.png` — Declared defaults, exact milliseconds and null reminder.
2. `date-fields-required-dark.png` — Rejected required day and accessible error/focus.
3. `date-fields-saved-dark.png` — Accepted true Date/null submission, visible Form unmount.
4. `date-fields-restored-dark.png` — Opted-in restoration and unmarked meeting default.

`proof.json` records actual outcomes, geometry, SHA-256s, cold new-host results and cleanup. Both watched Launcher flows had zero page errors, console errors or nonlocal requests. These watchers do not certify every startup request in the separate TockCoder workbench. The first Host log contained **two expected close-time IPC rejections** (`Extension closed before the field callback completed`) during cancellation with a queued field event; they are not suppressed or falsely called zero Host-log errors. No renderer error followed, and close/reopen/cancellation expectations passed.

Tool inline image previews were unavailable even for temporary reduced JPEGs. PNG geometry/content-state and DOM/flow were verified; no human/agent visual-image-review claim is made. Opposite system appearance, natural-language dates, native OS calendar-popup selection and installed-release behavior were not certified.

## Confirmed Findings

**3 confirmed Date development findings, all fixed and regression-tested; no additional confirmed Date product finding in this Desktop flow.** These are the same findings in `../2026-10-02-raycast-native-date-source.md`, not three new issues.

1. **Medium — Nonexistent local time could normalize to another hour.** Impact: DST-gap selection changed the requested wall-clock time. Path: `src/user-raycast-renderer.ts`. Fixed by exact wall-clock reconstruction validation with accessible error/draft retention and blocked submission; focused timezone/gap regressions pass. Real Desktop zone was Asia/Shanghai, so DST proof is the explicit focused multi-zone fixture, not this app capture.
2. **Medium — Invalid pending draft during mode change could throw.** Impact: controlled DateTime→Date rendering could escape its update and substitute a value. Path: `src/user-raycast-renderer.ts`. Fixed by retained calendar draft, re-entry marker and submit blocking; focused exception/no-substitute/recovery check passes.
3. **Medium — Explicit SDK reset could leave an invalid native draft displayed.** Impact: November2 remained although the SDK default/current value was October2. Paths: `src/trusted-raycast-compat-api.ts`, `src/user-raycast-manager.ts`, `src/user-raycast-renderer.ts`. Fixed with date-only bounded owned reset intent; public API/Manager/DOM RED→GREEN and real Desktop reset pass. Valid pending input and ordinary focus/unrelated patches are preserved.

Separate verification correction: persistence multi-Form tests now wait for the exact visible callback JSON before the next owned request, just as the earlier unmount test waits for the visible Form removal. Assertions, child revision guards and production action timing were not relaxed. The initial new Infinity-counter test incorrectly expected an error; isolated evidence showed the existing finite-primitive serializer safely omits it. Tests now assert omission/null/no reset/error, retaining negative/fraction/string rejection. Neither concern is counted as a new Date runtime finding.

## Exact Verification

```sh
# Original public RED: exact Nov2 draft != Oct2 reset default, then GREEN.
node --test --test-reporter=tap tests/user-raycast-form-date-reset.test.ts
# Post-Desktop81/81, zero skipped/failed:
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast-form*.test.ts
# Scoped466 passed,6 optional skipped,0 failed:
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast*.test.ts tests/trusted-raycast*.test.ts tests/launcher-ipc.test.ts tests/launcher-preload-bridge.test.ts tests/launcher-window*.test.ts
# Root1,701 passed,18 optional skipped,0 failed:
pnpm test
pnpm run typecheck
pnpm build
node scripts/stage-dsh.mjs --quick
```

Native source checkpoint `a88ab875` followed API `e48033dd` / initial renderer `2fa90c6f`. The peer's gap2 handback at `942ee0b8` rebuilt the same frozen Native source and passed root/TSC/build/manifest/quickstage checks. Actual captured `dist/main.js` SHA-256 was `779c8529d9f3376c671a4446939d3122cab44e760b210b6242f455ac55559a65`. Post-Desktop focused81/81 and typecheck passed again. Temporary Playwright attach/checks ran only from `/tmp/tockteam-form-date.wxuzpM/desktop`; no old repository Playwright artifacts were touched. The temporary scripts and fixture remain there for diagnosis, not as installed user data.

## Cleanup and Scope Limits

Guard inspection plus both full app trees: **54 recorded PIDs stopped/ESRCH, remaining[]**. CDP63595/63812 and workbench63611/63829 ports are closed; Playwright reports no browsers. Both owned app profiles used mock Keychain; the real Keychain, accounts, credentials, active cursor/keyboard and foreground app were not changed. All2,117 baseline protected/owned tracked and unowned files (including latest peer UI/gallery and the three user changes) were unchanged before deliberate owned documentation/report/publication updates. Source code was not changed during Desktop proof; post-proof fake process groups were also audited stopped.

`isFullDay` remains explicitly unsupported because its public Date encoding is unknown; there is no guessed midnight sentinel. Friendly expressions, native popup keyboard selection, non-calendar year extremes, dynamic Form identity/navigation, a full appearance matrix and the rest of the Tinycast behavior ledger remain unsupported/unverified. This feature uses the existing restricted renderer and approved local child; the child is **not an OS sandbox**. No third-party command execution, account operation, native effect, Raycast URL-handler takeover, new dependency/plugin/agent loop, worktree, user profile overwrite or push was performed. Restart Electron to use the updated controls.
