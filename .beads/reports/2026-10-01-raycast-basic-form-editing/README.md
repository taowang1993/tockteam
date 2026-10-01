# Basic Raycast Form Editing Checkpoint

**Scope:** `tockteam-qwzg.8.3.2` only. Text, password, textarea, and checkbox editing now crosses the existing private child, main-owned manager, and restricted Desktop IPC into inert native controls. This is not full Tinycast-scope or Raycast compatibility, and it does not close `tockteam-qwzg.8.3` or `.8`.

## Result

- Defaults and controlled values, asynchronous change callbacks, typed focus/blur events, and focus/reset references work in public first-party child tests.
- Mounted native controls survive patches with pending drafts, caret, and focus preserved. Typed edits complete before button or Control/Command+Enter submission; plain Enter in a textarea remains a newline.
- Inline errors associate with controls. Rejected submissions remain editable. Checkbox titles and labels both survive projection; password fields remain masked.
- Field requests require their current owner, session, revision, handle, bounded request ID, and exact string/boolean type. They cannot obtain clipboard/action authority. Pending requests reject on close; owner replacement closes the old session. Main IPC actually awaits completion.
- Input backpressure pauses native controls at 32 queued callbacks and resumes them as the queue drains. All accepted edits are delivered, including the last draft. Main permits one outstanding field request, at most 64 projected field handles, 16,384-character string values, and a 10-second callback deadline.

## Confirmed Findings

**Total: 4 confirmed findings; all fixed and verified. No confirmed finding remains unresolved in this checkpoint.** The simplicity, security/hardening, and performance review references were all applied.

1. **Medium — Close an owner-replaced field session.** An awaited callback could finish after launcher ownership changed. Merely rejecting the IPC response left the old child session running. Affected: `src/user-raycast-ipc.ts`, with the required returned promise in `src/main.ts`. **Fixed:** revalidate after completion and close the old owner on failure. **Verified:** the replaced-owner public IPC regression failed first, then passed alongside current-owner acknowledgement checks.
2. **Medium — Bound slow-callback input backlog.** Native edits could accumulate an unlimited chain while a callback was slow. Affected: `src/user-raycast-renderer.ts`. **Fixed:** apply 32-request native backpressure without dropping accepted edits. **Verified:** the regression accepted all 100 edits before the fix; now it pauses at 32, resumes, and retains `Draft 31`. The real Desktop first-party fixture independently verified this behavior.
3. **Medium — Preserve both checkbox title and label.** Rendering only the checkbox label discarded the SDK title and its context. Affected: `src/user-raycast-renderer.ts`. **Fixed:** retain the title above a native checkbox/label line. **Verified:** the title regression failed before the fix; the final native capture shows both `Summary` and `Include a Summary`.
4. **Low — Inherit ordinary control typography.** Text/password controls used Arial, and textarea used a browser-default monospace font instead of surrounding TockLauncher typography. Affected: `src/user-raycast-renderer.ts`. **Fixed:** use the inherited font-family utility on text controls. **Verified:** the pre-fix app-scoped probe recorded the mismatch; the final eight-palette check verifies every text control's computed family equals its parent.

## Fresh Verification

Executed from `/Users/taowang/projects/tockteam`:

```sh
node --test --test-concurrency=1 --test-reporter=tap tests/user-raycast-form*.test.ts tests/user-raycast-ipc.test.ts tests/user-raycast-renderer.test.ts
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast*.test.ts tests/trusted-raycast*.test.ts tests/launcher-ipc.test.ts tests/launcher-preload-bridge.test.ts tests/launcher-window*.test.ts
pnpm run typecheck
pnpm test
pnpm run build
node scripts/stage-dsh.mjs --quick
```

Results: focused **35/35**; Raycast/launcher **408 passed, 6 skipped, 0 failed**; root **1,638 passed, 18 skipped, 0 failed**; typecheck, build, and quick stage exited 0. Skipped optional artifact/live-effect checks are not claimed as verified or counted as bugs. The staged runtime matched the `dsh-source.json` pin, `0.1.2-rc.1`.

The initial public field test failed because projected controls had no field-event handle. Additional owner-close, checkbox-title, and queue-backpressure regressions failed before their fixes. A delegated test-only helper initially had a partial refactor and malformed generated JavaScript; the same governed lane was resumed, and the parent corrected and reran the test rather than accepting its report as proof. No production change was justified by those fixture mistakes.

The installed React Doctor `0.9.14` was also tried on the private React compatibility API. It returned no diagnostics but discovered no React project and produced no score. This is **not** a React health-score or score-regression proof; public child behavior tests, typecheck, and actual rendering provide the relevant evidence. No dependency was added or global package updated for this checkpoint.

## Guarded Desktop Proof

`proof.json` records the actual `dist/main.js` product, not a substitute UI; source/build hashes, exact route, state, CSS/device geometry, isolation, screenshot hashes, protected-path hashes, placement, and cleanup are included. A separately approved, first-party offline command exercised the real user-extension manager and main/preload IPC. Its password strings and submitted data are fake; no account, sign-in, external native effect, or Raycast URL-handler claim occurred. The owned wrapper blocked global shortcut registration and used the guarded isolated profile with mock Keychain and preserved HOME.

Every published screenshot is **1512 × 949 CSS pixels at 2×**, yielding **3024 × 1898 PNG pixels**, built-in dark appearance, no skin, with a light system preference and reduced motion:

- `basic-form-dark.png`: native defaults after the backpressure/reset check.
- `basic-form-error-dark.png`: `Enter a name.` associated with the rejected empty field.
- `basic-form-edited-dark.png`: preserved focused `Name`, masked fake password, multiline `Notes`, and checked `Include a Summary`.
- `basic-form-saved-dark.png`: `Saved Fake Entry` after pending-edit keyboard submission. Exact typed values were verified through the existing public projection subscription; the current List renderer does not display its subtitle payload.

`palettes.json` records all eight built-in/Navy/Jade/Ember light/dark product palettes applied to the real form renderer, including opposing system appearance, computed ordinary-text contrast ≥4.5:1, native checked-mark pixel contrast ≥3:1, inherited fonts, visible keyboard focus, and non-overflowing controls at 640 CSS pixels. This is palette rendering proof, **not** persisted skin-settings proof. No theme screenshots replaced the canonical dark captures.

Workflow and palette checks recorded **0 page errors, 0 new workflow console errors, and 0 nonlocal workflow requests**. The existing Chromium boot diagnostic about ignored `frame-ancestors` in an HTML meta tag is preserved separately in `boot-console.txt`; it was not hidden or counted as a new runtime bug. The CSP and navigation/permission boundaries were unchanged.

Only the four allowlisted screenshots and their scoped report metadata were published transactionally. All three owned Electron/runtime process trees stopped, their recorded PIDs were rechecked, and all browser sessions detached. The current-and-earlier form-log audit confirmed **290 recorded fixture process groups absent**. **1,142 protected paths** retained their baseline hashes, including user/peer `AGENTS.md`, TockTutor files, protected tests, gallery images, and unowned Playwright artifacts.

## Still Open

Dropdown/tag/date/file fields, their richer value/persistence contracts, broader collection/detail/navigation/actions, remaining SDK behavior and native effects, and the final installable compatibility gate remain separate open work. No legacy direct-Electron-spawn smoke or installed smoke was run for this intermediate checkpoint; the approved guarded real Desktop proof was used instead. No full-compatibility, package-release, real-account, or Linear cleanup claim follows. `tockteam-qwzg.6.6` remains unverified. No push occurred.

Restart Electron to use the rebuilt Desktop changes.
