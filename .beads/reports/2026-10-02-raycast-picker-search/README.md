# Picker Search Without Lost Selections

Bounded checkpoint `tockteam-qwzg.8.3.5.1`, following API/transport commit `650dfcb4`. This is Dropdown search and local TagPicker title search, not persistence, item icons, rich popup parity, full Forms or full Raycast/Tinycast compatibility.

## Result

Native choice controls now have labeled search inputs. Dropdown supports its owned `onSearchTextChange`, SDK-default/explicit local filtering, fuzzy titles/keywords and default section keywords, 300ms opt-in coalescing, loading and no-result status. TagPicker search stays local and title-only, never gains a remote callback or undocumented filtering authority. Selection order, temporary missing choices, text/caret/focus and pending selection drafts survive filtering and asynchronous patches. A full 32-callback queue retains an accepted delayed query; submit waits for the current queue, including newly queued work. Timers stop on unmount/session replacement/disposal. Search Enter does not submit, Escape clears a nonempty nested search, ArrowDown moves to the select, and Control/Command+Enter flushes pending search before submission. IME preedit does not search or submit; completed text is committed once. Native popup selection remains a separate unverified scope.

Reuse: existing field/manager/IPC callback path, inert native Form controller, semantic Tailwind recipe and already-installed `fuzzysort`. No new dependency, React renderer, plugin/theme layer or native-effect authority was added. Filtering retains declared item/section order; ranked-section parity is not claimed.

## Confirmed Findings

**5 confirmed implementation findings, all fixed; 0 remaining confirmed defects in this bounded checkpoint.** Highest severity first; all affect `src/user-raycast-renderer.ts` and its runnable `tests/user-raycast-form-renderer.test.ts` regressions.

1. **Medium — Search completion acknowledged a failed selection edit.** Impact: a successful unrelated callback could clear the submit gate after a rejected selection. Fixed by per-field/per-event failure ownership and submission checking outstanding failures. The public regression failed before the fix and proves no action follows a failed edit merely because search succeeds.
2. **Medium — Acknowledged controlled choices could disappear after a pending patch removed options.** Impact: final accepted strings/arrays became empty native selections despite the projected values remaining valid. Fixed at shared select-value application by rebuilding/retaining represented choices before applying accepted values. The regression failed with `'' !== 'new-language'`; it now also preserves the accepted tag array.
3. **Low — Input-method composition generated premature search callbacks.** Impact: intermediate composed text could trigger an extension search, and composition-end/final-input could duplicate it. Fixed by ignoring preedit, committing composition-end and deduplicating unchanged text. The standalone component regression also gates composed submit keys; real TockLauncher already has an additional root composition guard.
4. **Low — Empty remote results lacked an absence message.** Impact: preserved selection looked like a search result when a callback returned no options. Fixed by separating query presence from local-filter ownership; absence now announces “No Matching Options” without erasing selection. Temp-only review and the committed behavior test both failed before the fix.
5. **Low — An undocumented TagPicker filtering flag disabled its local title search.** Impact: a stray Dropdown-only prop could suppress the supported tag search. Fixed by limiting that flag to Dropdown; TagPicker always filters titles and never keywords/remote callbacks. The regression failed with both Red/Blue visible for a Blue query and now retains only the title match.

Missing controls/throttling were initial feature RED checks, not extra counted bugs. A proof-helper font assertion initially included the non-text native checkbox's browser font; it was corrected to check text-bearing controls while retaining all width checks. That was a harness error, not a product defect.

## Verification

```sh
node --test --test-name-pattern='local picker search' --test-reporter=tap tests/user-raycast-form-renderer.test.ts
node --test --test-name-pattern='throttled picker|successful search|remote dropdown' --test-reporter=tap tests/user-raycast-form-renderer.test.ts
node --test --test-name-pattern='accepted controlled selections|throttled search survives|queries run once' --test-reporter=tap tests/user-raycast-form-renderer.test.ts
node --test --test-name-pattern='IME composition neither|empty remote search|undocumented filtering' --test-reporter=tap tests/user-raycast-form-renderer.test.ts
node --test --test-concurrency=1 --test-reporter=tap tests/user-raycast-form*.test.ts tests/user-raycast-ipc.test.ts tests/user-raycast-renderer.test.ts
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast*.test.ts tests/trusted-raycast*.test.ts tests/launcher-ipc.test.ts tests/launcher-preload-bridge.test.ts tests/launcher-window*.test.ts
pnpm run typecheck
pnpm run test
pnpm run build
node scripts/stage-dsh.mjs --quick
```

Final focused **64/64** and root **1,669 passed / 18 optional skipped / 0 failed**; typecheck, build and quick stage passed. Final scoped Raycast/launcher checks passed **437 / 6 optional skipped**; API/IPC checks independently passed **23/23**. No real-provider test was enabled. The first root/stage attempt correctly refused the peer's then-unbuilt TockTutor manifest. We returned all shared reservations; the owner rebuilt and refreshed it, then handed back a genuinely green frozen workspace. No check was skipped or weakened to bypass that failure. The pin actually staged is DSH **0.1.2-rc.1**, not a version inferred from older instructions.

All three review references—simplification, security/hardening and performance—were applied to the owned scope. Requests still require exact session/revision/field/request ownership, bounded strings, eligible Dropdown callbacks, and existing isolated renderer/preload origin controls. Abuse checks deny malformed/foreign/TagPicker requests and Clipboard from search; pending close rejects and stops its child group. React Doctor exited 0 with `projects:[]`, so no effective React audit/score is claimed. No performance improvement or ranked-filter equivalence is asserted.

## Real Desktop Proof

Bounded Playwright session `picker-search` attached only to the endpoint returned by `extended_display`. The real `dist/main.js`, launcher and restricted preload opened one independently written approved offline fixture. It proved fuzzy keyword search, local title search preserving ordered Blue/Red tags, no-match/clear/non-submit Enter, extension loading, unchanged language selection while results loaded, visible search focus, inherited text-control fonts, and exact string/array/text/boolean submission after pending throttled search with Control+Enter. Page/runtime errors, console errors and nonlocal requests were **0**. One pre-existing unpackaged Electron CSP warning is separately acknowledged.

Only four allowlisted canonical PNGs plus sanitized evidence were published with a staging-directory rename. Each records **1512 × 949 CSS pixels / 2× / 3024 × 1898 PNG pixels**, exact launcher file route, `style.colorScheme === 'dark'`, no document/body skin, renderer Node isolation and named visible state. System appearance was deliberately light. The native launcher window remained its genuine **750 × 475** bounds on extended display **17**; canonical screenshots use the required CSS/device geometry, not a resized launcher product window. Eight separately labeled palette applications passed text contrast, inherited-font, search-focus, checked-mark and field-width checks; a 640px CSS viewport had no field/form overflow. These do not certify skin-setting persistence, every native popup pixel or a pixel-level visual review: the harness image reader could not render an inline preview.

```text
/Users/taowang/projects/tockteam/.beads/reports/2026-10-02-raycast-picker-search/picker-search-filtered-dark.png
```

The other states are `picker-search-dark.png`, `picker-search-loading-dark.png` and `picker-search-saved-dark.png`; `proof.json`, `palette-proof.json` and `protection.json` contain exact saved values, geometry, source/build hashes, placements, scope and teardown evidence.

## Cleanup and Ownership

Playwright detached and reported no browsers. Explicit guard stop terminated root **35686** and all **19** recorded descendants; remaining **[]**. PID ESRCH checks and closed CDP/DSH ports independently reconfirmed cleanup. The inspection root **35357** also stopped with remaining **[]**. The fixture-group audit and exact count are recorded in `proof.json`. `HOME` stayed unchanged, the mock-Keychain flag was present, no window was focused and all windows stayed on display17. No account/credential/network/native-effect operation or foreground fallback was used.

All **2,098** tracked baseline paths outside the explicit native writer/report scope stayed byte-identical, including frozen peer TockTutor source/generated outputs, gallery and all three protected paths as they stood after the peer's separately user-approved assertions. No protected or gallery path was staged or changed by this writer. Unowned root Playwright artifacts stayed untouched. No worktree, installed-release smoke, push, Linear cleanup or full-compatibility claim occurred. Persistence, item icons, ranked ordering, richer popup/keyboard parity, late/custom-wrapped defaults and other fields/SDK areas remain open under `.8.3.5`/`.8`. Restart Electron to load the new search controls.
