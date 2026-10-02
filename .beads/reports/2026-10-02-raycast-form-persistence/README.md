# Remember Choices After a Successful Save

Bounded `tockteam-qwzg.8.3.5.2` checkpoint; source/test commit `ec78ac6c`. This completes explicitly opted-in persistence for the currently supported Form field types, not every Form, dynamic navigation or Raycast extension.

## Result and Scope

`storeValue={true}` remembers typed values after accepted `Action.SubmitForm` and restores them in a fresh command child. Edits, focus/blur, cancellation, false returns and rejected promises do not overwrite the last accepted choices. Dropdown strings, ordered TagPicker arrays and existing text/password/textarea/checkbox values share the same implementation. Controlled props win; refs reset to the declared default, not the remembered value. Empty strings/arrays, false values and prototype-named IDs remain exact. Restoring does not invoke change callbacks. The snapshot is taken before the callback, so callback mutation, async work or submit-triggered unmount cannot corrupt the saved values. Another extension, command or stable mounted Form has separate state; default LocalStorage/cache clearing does not erase named Form records. A type change uses its own default and leaves absent remembered fields recoverable.

SDK 2.0.3's **FormItemProps** defines opt-in storage after submission. The matching-item/selection-time text in **DropdownProps_2** belongs to List/Grid Dropdown, not Form Dropdown; no guessed Form option-membership gate or callback was added. The SDK ref contract still resets to `defaultValue`.

The only runtime source change is the existing shared private Form context/field/SubmitForm implementation. It reuses `createUserRaycastStorage().cache`, its hashed command namespaces, validated regular-file access, private mode and atomic writer. There is no new dependency, root/file format migration, Cordis/plugin system, renderer/preload/IPC/manager authority or custom persistence subsystem. Bundled behavior remains on its existing path.

## Confirmed Findings

**1 confirmed implementation finding, fixed; 0 remaining confirmed defects in this bounded checkpoint.**

1. **Medium — Retired fields could produce an unreadable replacement after a submit callback.** Impact: merging a valid 64-record history with a new field could save a 65-record snapshot, then fail validation, making the next restore unusable. Affected path: `src/trusted-raycast-compat-api.ts` submission snapshot. Fixed by complete preflight before callback and write; prior bytes and unsubmitted state remain intact. The public “retired fields” regression failed with submitted `{"new-field":"new"}` instead of “Ready”, then passed after the fix. Fresh API/scoped/root checks verify the fix.

The first no-persistence RED was missing feature behavior, not another counted defect. A corruption test initially assumed exact React error text; React19 can wrap render failures. Its corrected public assertions retain visible failure, no success and exact unchanged bytes. React Doctor's first CLI combination was invalid; the corrected command exits 0 but selects no projects. Neither harness issue is counted as a product bug.

## Exact Verification

```sh
# RED: public first-party fixture before implementation (0/1; en != fr).
node --test --test-reporter=tap /tmp/tockteam-form-persistence.zIQAht/persistence.test.ts
# RED then GREEN: unreadable retired-field replacement.
node --test --test-name-pattern='retired fields' --test-reporter=tap tests/user-raycast-form-persistence.test.ts
# Final public API checks.
node --test --test-reporter=tap tests/user-raycast-form-persistence.test.ts
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast*.test.ts tests/trusted-raycast*.test.ts tests/launcher-ipc.test.ts tests/launcher-preload-bridge.test.ts tests/launcher-window*.test.ts
pnpm run typecheck
pnpm run test
pnpm run build
node scripts/stage-dsh.mjs --quick
react-doctor src/trusted-raycast-compat-api.ts --no-supply-chain --no-score --no-cache --json
```

Fresh results: **11/11 API**, **448 scoped passed / 6 optional skipped / 0 failed**, **1,681 root passed / 18 optional skipped / 0 failed**; typecheck, build and quick stage passed. DSH actually staged is **0.1.2-rc.1**. All three review references—simplification, security/hardening and performance—were applied. No React Doctor score/effective lint audit or performance improvement is claimed.

Abuse/edge checks include invalid/duplicate/wrong-type/oversized stored records, opted-out lazy reads, private file mode, replaced symlink targets, 4KiB overflow rejecting before callback, record-limit overflow, mutable array snapshots, partial forms, kind changes, independent forms/commands/extensions, failed async submissions and cancellation. Storage failures report failure without modifying the previous file/target; no clear/remove/migration shortcut was used.

## Real Owned Desktop Proof

A bounded Playwright session attached only to guard-returned CDP endpoints. The genuine built `dist/main.js`, launcher, restricted preload and private child ran independently written approved offline fixtures—not a renderer replica or third-party extension. Default English/Red changed to French and ordered Blue/Red. Cancel/reopen first restored the declared defaults; pending-edit Control+Enter then submitted exact typed choices/text/boolean and unmounted the Form. A new command child restored only opted-in choices, leaving the unmarked note/checkbox at defaults. Later cancelled Japanese/Green edits did not replace them. Focus stayed visible and a 640px CSS viewport had no field/form overflow. Runtime errors, console errors and nonlocal requests were **0**.

After explicitly stopping the first complete app tree, only the exact **220-byte** owned fake-extension state was copied into the next owned fixture seed. A fresh guarded app launch again restored French and ordered Blue/Red. This is an exact-state-seeded cold app proof, not reuse of a user profile or installed-release certification. Both windows remained unfocused on extended display **17**; the native launcher kept **750 × 475** bounds. Each canonical capture verifies **1512 × 949 CSS / 2× / 3024 × 1898 PNG**, the exact launcher file route, explicit built-in dark appearance, absent skin and renderer Node isolation while emulated system appearance was light. No styles/controls changed; eight-palette results from the preceding search checkpoint are historical evidence, not a new palette run.

Only four allowlisted canonical PNGs and sanitized evidence were published through a staging-directory rename. `proof.json` records exact values, hashes, geometry, placement, seed, scopes and cleanup; `protection.json` records ownership checks. The image reader could not render even a reduced JPEG inline, so no pixel-level visual approval or native-popup keyboard claim follows.

```text
/Users/taowang/projects/tockteam/.beads/reports/2026-10-02-raycast-form-persistence/remembered-choices-restarted-dark.png
```

## Cleanup, Ownership and Honest Limits

Inspection root **66264** stopped. Explicit app stops left **[]**: first root **69507 + 34 recorded descendants**, restart root **70285 + 14 recorded descendants**. Every recorded PID and **454** recorded fake-fixture process groups independently returned ESRCH. Both CDP and DSH ports were closed; both Playwright sessions detached and the browser list was empty. `HOME` stayed unchanged; mock Keychain was present; no cursor/focus/OS automation, credential/account/Keychain operation, real native effect or third-party execution occurred. The existing unpackaged Electron CSP warning is not counted as a runtime error.

All **2,098** frozen tracked baseline paths stayed byte-identical, including peer TockTutor source/generated output/canonical gallery and all three protected user-owned paths. The native API/new test, owned Launcher reference update and this report are the only writer scope. Old unowned Playwright artifacts and protected user hunks remain untouched. Shared slots/index are returned after the final scoped save; no worktree, push or installed smoke occurred.

Known ceilings remain explicit: **4 KiB / 64 records per Form snapshot**, **64 KiB / 256 entries per extension file**, and stable mounted Form order across cold opens. Old absent records are retained, so enough renamed fields can hit the bound and safely refuse a save. Dynamic navigation/reordered Form identity remains unverified and tracked with the parent task. A storage error after an accepted callback cannot roll back effects the extension already performed; this is not a transaction over external services. Files are mode `0600`, **not encrypted or credential storage**; only fake password strings were used. Item icons, richer popup/keyboard/ranked behavior, date/file fields, broader SDK/native behavior and final real-extension installed evidence remain open. Full Tinycast/Raycast compatibility and Linear cleanup remain explicitly unclaimed. Restart Electron to load the checkpoint.
