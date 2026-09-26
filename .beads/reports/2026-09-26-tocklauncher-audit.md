# TockLauncher Audit — September 26, 2026

## Scope

Reviewed `.agents/references/tocklauncher.md` against launcher composition, main/preload/IPC ownership, action publication, search/providers, settings/persistence, lifecycle/navigation, trusted-RayCast admission/manager/child/native effects, Can I Use, and verification/build integration. A second reviewer inspected the trusted compatibility path and its proof scripts. No TockCoder, TockTutor or skin changes were included.

## Fixed Findings

| Finding | Resolution | Commit |
| --- | --- | --- |
| A maximum-length web query produced an invalid display label and prevented result publication. | Bound the label to 512 characters without truncating the query in the URL. | `120a5500` |
| NDJSON limits were applied to accumulated pipe chunks; valid coalesced messages and escaped 16 KiB input could kill the child. | Bound complete frames and unfinished remainders independently; allow 128 KiB serialized input and retain the 1 MiB output limit. | `a5730654` |
| Clipboard ownership compared only plain text, allowing restoration over newer rich data with identical text. | Compare the owned format set and every buffer as well as text; preserve unreadable/changed clipboard contents. | `5c9dee63` |
| Can I Use closed the entire command when input exceeded its search limits. | Validate before consuming handles or revoking the session; the user can correct the query. | `51aa84da` |
| The tracer omitted extension identity and relied on English defaults despite requiring Chinese output; its negative test passed on this early failure. Installed proof guards incorrectly allowed Linux. | Supply identity/explicit targets; require readiness before the expected timeout; add offline admitted-source success coverage; skip unsupported platforms before renderer access. | `ef283cf3` |
| Sequential Electron `writeBuffer` calls cannot losslessly restore multiple clipboard formats. | Refuse external Paste before mutation for multi-format clipboards; retain direct in-app insertion and single-format restoration. | `25eac89d` |
| Standalone proofs expected obsolete approval screens/controls, and historical TTS evidence could mask missing current playback. | Use direct bundled command IDs/current controls and remove historical evidence as a pass condition. | `9de9c230` |

The clipboard replacement finding was confirmed from the installed Electron version's upstream source, not by touching the user's clipboard:

- Electron `v42.3.0`, `shell/common/api/electron_api_clipboard.cc`: `WriteBuffer` creates a new `ScopedClipboardWriter` for each call.
- Electron `v42.3.0`, `DEPS`: Chromium `148.0.7778.180`.
- That Chromium version's `ui/base/clipboard/scoped_clipboard_writer.cc`: destruction publishes that writer's representations.
- `ui/base/clipboard/clipboard_mac.mm`: publication calls `prepareForNewContentsWithOptions` before writing the new representations.

Regression fixtures now model replacement rather than additive writes. A native atomic multi-format adapter was deliberately not introduced. The Electron format API does not provide a native change counter or arbitrary multi-item preservation; these limitations are documented rather than presented as guarantees.

## Verification

Failing regressions were run before fixes: maximum escaped input closed the real admitted child; identical-text clipboard changes triggered restoration; the replacement-model clipboard lost formats; invalid Can I Use input closed the session; obsolete proof contracts failed; the tracer failed before readiness and Linux proof attempted renderer access.

Final commands:

```bash
pnpm typecheck
pnpm run build
node --test tests/launcher*.test.ts tests/trusted-raycast*.test.ts tests/trusted-raycast*.test.mjs
node --test tests/trusted-raycast-manager.test.ts tests/trusted-raycast-native-effects.test.ts tests/trusted-raycast-can-i-use-manager.test.ts tests/trusted-raycast-tracer-failure.test.ts tests/trusted-raycast-tracer-contract.test.ts tests/trusted-raycast-installed-readiness.test.ts
node --test --test-name-pattern='fresh-profile proofs|TTS regression' tests/trusted-raycast-focus-proof-client.test.ts
node --check scripts/trusted-raycast-can-i-use-electron-proof.mts
node --check scripts/trusted-raycast-kaomoji-electron-proof.mts
node --check scripts/trusted-raycast-electron-proof.mjs
git diff --check
```

- Typecheck and production build passed.
- Focused runtime/native/tracer/installed-readiness checks: **30 passed, 3 skipped, 0 failed**. The skipped tests require opt-in live Google/TTS configuration; the new escaped-input and tracer-success tests run offline against admitted source.
- New proof-source checks: **2 passed**. Script syntax checks passed. These are not fresh visual proof.
- Broad launcher/compatibility suite: **943 passed, 13 skipped, 3 failed** (959 total). All three failures reproduce the baseline environment denial (`spawn EPERM`) for process inspection, not assertion regressions:
  - `strict read-only process snapshots include the current test owner`
  - `an injected mid-gate failure removes only a verified post-baseline workspace`
  - `refuses symlink entries and open files before removing a workspace`
- Earlier focused network verification: **39 passed** using `node --test tests/launcher-network-extensions.test.ts tests/launcher-network-transport.test.ts tests/launcher-network-policy.test.ts`.

Test-owned compatibility managers close in `finally`; the new child regression and Can I Use integration verify both root PID and process-group disappearance. The tracer uses owned process-group cleanup. A guarded extended-display inspection found the Sidecar display and reported its probe fully stopped (root PID 35025, no remaining processes). No Desktop/browser verification app was subsequently launched, no external app was controlled, and no real clipboard was changed. Global process inspection remains denied; it was not bypassed.

## Remaining Verification Work

`tockteam-469u` tracks migration of legacy standalone launcher captures to guarded launch/owned CDP and the project-wide 1512 × 949 CSS / 3024 × 1898 screenshot contract. Existing overlay-size proof scripts are not new visual evidence and were not run through an alternate launch path. No fresh Desktop, packaged, installed, external Paste, or live TTS pass is claimed by this audit.

The reference was updated with framing/search limits, safe Paste limitations, corrected proof expectations, and the distinction between source checks and runtime evidence. No push was performed.
