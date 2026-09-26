# TockLauncher Audit — September 26, 2026

## Scope

Reviewed `.agents/references/tocklauncher.md` against launcher composition, main/preload/IPC ownership, action publication, search/providers, settings/persistence, lifecycle/navigation, trusted-RayCast admission/manager/child/native effects, Can I Use, and verification/build integration. A second reviewer inspected the trusted compatibility path and its proof scripts. No TockCoder, TockTutor or skin changes were included.

## Fixed Findings

**Nine confirmed bugs were fixed: five runtime bugs and four verification-tool bugs.** The previous seven-row table combined separate verification findings. Ranked by severity (P1: potential data loss; P2: functional failure or unreliable verification):

1. **[P1 — High] Multi-format clipboard restoration destroyed formats.** Each Electron `writeBuffer` call replaces the pasteboard, so sequential writes lost earlier formats. External Paste now refuses multi-format clipboards before mutation; direct in-app insertion remains available. Commit: `25eac89d`.
2. **[P1 — High] Paste could overwrite newer clipboard data.** Ownership compared only plain text, missing newer rich content with identical text. Restoration now checks the format set and every buffer as well as text, leaving unreadable or changed contents untouched. Commit: `5c9dee63`.
3. **[P2 — Medium] Valid trusted-extension input could terminate the child.** NDJSON bounds applied to pipe chunks rather than individual frames and did not accommodate JSON escaping. Complete frames and unfinished remainders are now bounded independently, with 128 KiB input and 1 MiB output limits. Commit: `a5730654`.
4. **[P2 — Medium] Invalid Can I Use queries closed the command.** Search validation occurred after handles were consumed. Validation now precedes revocation, allowing the user to correct input without reopening the command. Commit: `51aa84da`.
5. **[P2 — Medium] Maximum-length web queries prevented result publication.** Generated display labels exceeded their limit. Labels are now capped at 512 characters without truncating the query used in the browser URL. Commit: `120a5500`.
6. **[P2 — Medium] Historical TTS evidence could hide a current playback failure.** Old proof could satisfy the gate despite missing live playback. A responding upstream without observed playback now fails; upstream unavailability is reported as inconclusive. Commit: `9de9c230`.
7. **[P2 — Medium] The translation tracer failed before exercising translation.** It omitted extension identity and used defaults inconsistent with its Chinese-output assertion; its negative test falsely accepted the early failure. The tracer now supplies identity/targets, and tests require readiness plus an offline admitted-source success path. Commit: `ef283cf3`.
8. **[P2 — Medium] Fresh-profile visual proofs followed obsolete UI flows.** Scripts waited for approval screens no longer shown for bundled commands and used an outdated preference control. They now target direct command IDs and current controls; fresh visual execution remains outstanding. Commit: `9de9c230`.
9. **[P2 — Medium] Installed compatibility proofs ran on unsupported Linux systems.** Two helpers excluded only Windows despite macOS-only invocation. They now skip all non-macOS platforms before accessing a renderer. Commit: `ef283cf3`.

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
