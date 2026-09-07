# Trusted Translate Slice 4 Parent Acceptance

## Ready-Immediately and Host-Parity Checkpoint

Final code commits: `042bf92`, `8896021`, `02acf44`, `c8d57f9`, `e2fc685`, and `650395f`.

- The exact reviewed Google Translate archive is repository-owned, installs/enables on first run, and preserves later user disablement.
- First use collects validated manifest preferences through the sandboxed host UI; persistence reuses the canonical private-directory, exclusive-temp, fsync, rename, and directory-fsync writer.
- The fixed 750×475 host renders one command row, compact selectable results, bounded accessories, centered explicit/implicit empty states, footer primary/Actions controls, and keyboard/pointer action-panel behavior.
- EmptyView projects the explicit `Icon.Hourglass`; implicit No Results uses a neutral SearchX icon. The final Electron run captured no uncaught launcher-page errors.
- Automatic command focus and global focus restoration target the visible Translate input rather than the hidden catalog search.
- Local smoke tests require a connected non-primary display by default; CI alone may fall back. Final placement evidence records launcher `(1820,149)`, private browser `(1745,202)`, and reshown launcher `(1820,149)` on the Sidecar display beginning at x=1512.

Final verification:

```sh
node --test tests/trusted-raycast-build.test.ts tests/trusted-raycast-install-recovery.test.ts tests/trusted-raycast-preferences.test.ts tests/trusted-raycast-renderer.test.ts tests/trusted-raycast-language-sets.test.ts tests/trusted-raycast-native-effects.test.ts tests/trusted-raycast-lifecycle-faults.test.ts tests/launcher-persistence.test.ts tests/launcher-window-controller.test.ts tests/launcher-installed.test.ts
pnpm typecheck
env -u TRUSTED_RAYCAST_ARTIFACT_TAR pnpm build
node scripts/launcher-electron-smoke.mjs --trusted-raycast
pnpm test
TOCKTEAM_INSTALLED_SMOKE_TEMP_ROOT=/tmp/tockteam-e3k-keychain-final.noindex pnpm test:launcher:installed
```

Results: focused suite 119 passed/one intentional live-TTS skip; full suite passed; typecheck and environment-free build passed; real Electron/Playwright proof passed with `useCount=5`, clean process/workspace teardown, automatic focus, pointer/Cmd+K/arrow/Escape interactions, native Copy/Paste restoration, private-browser isolation, and auditable extended-display placement. The final installed macOS arm64 smoke passed from source commit `b9f648c1e55e3ff08db1f31f71b1c09098fbfb53` with bundled Node `v24.20.0`, complete package/security/reinstall/rollback/single-instance checks, and cleanup. The exact packaged/installed smoke handshake now enables Chromium's macOS mock keychain before readiness; no SecurityAgent process, keychain dialog, owned app process, or private install tree remained after the final run.

## Accepted Scope

- The reviewed artifact is installed only through `stage -> isolated preview -> explicit approve/apply`.
- Installed and enabled remain separate states. Translate is catalog-visible and launchable only while the Cordis activation is live and the exact installed identity is both approved and enabled.
- Every load revalidates the pinned archive plus the executed `child.mjs` and `resolution.mjs` derived bundles. Symlinks and same-size/same-mtime tampering fail closed.
- Rotation is journaled. Current and previous identities support cross-digest recovery without admitting unapproved bytes. Healthy recovery is non-destructive; removal clears the journal.
- Disable, remove, recovery, apply, owner close, and Translate start share one bounded main-owned mutex, preventing a child from starting across a trust mutation.
- Atomic trust records use unique exclusive no-follow `0600` temporary files, file fsync, rename, cleanup, and best-effort directory fsync.
- Remove preserves Translate preferences and cached language sets. No runtime installer, install script, generic extension store, or automatic upgrade exists.
- Successful trust changes await a launcher catalog rescan; failed changes do not mutate catalog visibility.

## Independent Review

- Luna review `6db35733-c12e-425a-9645-5d6e266101fe` recovered the first review's structured-output protocol failure and blocked on four material findings: exact approval/crash ordering, derived-bundle integrity, cross-digest recovery, and stale catalog refresh.
- Fix writer `6f5b6f36-8ee1-4322-8a7c-038cbf400707` addressed those findings. Reviewer `a14db753-f158-4173-bbd8-55116d08511c` found five follow-up race/recovery issues.
- Fix writer `65fe3a8b-df31-4261-9c31-833dc50e39a1` addressed all follow-ups. Independent Luna reviewer `328e648a-d07d-4bed-ba5c-af0b18688f66` returned **OK**, with no issues.

## Real Desktop Proof

Command:

```sh
TRUSTED_RAYCAST_ARTIFACT_TAR=/tmp/tockteam-trusted-raycast-translate-artifact.tar \
TOCKTEAM_TRUSTED_RAYCAST_CLIPBOARD_FIXTURE=1 \
DSH_DESKTOP_NODE_VERSION=24.20.0 \
pnpm test:launcher:electron --trusted-raycast
```

Result: passed against the real composed Electron Desktop with fresh private `userData`.

The Playwright flow proved:

1. Trusted Extensions was visible while Translate was absent.
2. Install staged and previewed the candidate; Approve & Install appeared only after preview.
3. Apply produced Installed · Disabled; Translate remained absent.
4. Enable immediately exposed Translate after the awaited catalog rescan.
5. Unchanged Translate launched and retained the Slice 3 translation, native actions, language manager, selected-text fixture, Paste fixture, isolation, and cleanup checks.
6. Disable stopped the child and removed Translate; re-enable restored it.
7. Confirm Remove removed runtime state while preserving user preferences/state.
8. Reinstall/re-enable succeeded.
9. A private stopped-runtime derived-file tamper produced Recovery Required, blocked the child and catalog, and recovered/reinstalled to the exact reviewed identity.

`trust-flow.json` records the pinned artifact digest `7a27b1a75d4ee978fab04281dd93e187a6c32fd1de5de1f01eb66ce7682ea3ac`, exact artifact/derived matches, no runtime after removal, and no child during recovery. Screenshots capture not-installed, previewed, confirmation, recovery-required, and recovered-installed states.

## Verification

- Focused trust tests: 19 passed.
- `pnpm typecheck`: passed.
- Configured trusted suite: 83 passed, one intentional long-idle skip.
- Full suite: 951 passed, 18 platform/configuration skips, zero failures.
- Configured build: passed.
- `git diff --check`: passed.
- Real Electron trust-flow smoke: passed.
- Cleanup: no owned Electron, CDP, Translate child, `afplay`, or private Translate workspace remained.

## Installed Smoke Configuration

The first installed-smoke attempt at `894cc71` omitted `TRUSTED_RAYCAST_ARTIFACT_TAR`. The build correctly omitted the unconfigured candidate, then package inventory failed with `ASAR is missing dist/trusted-raycast/**`. No installed artifact launched. The smoke now admits the absolute configured artifact and verifies its pinned digest before the expensive build.

The configured attempt at `164772d` packaged and launched the app but exposed two stale package-contract assumptions: the smoke/checker still expected the pre-Translate finite preload key set, and its hermetic environment selected the default Node 26 runtime despite the proven Translate TTS requirement for Node 24.20.0. The app and its children were cleaned up. The finite expected bridge keys are now updated in both live inspection and report validation, and the packaged Node default is pinned to 24.20.0 with a source-level regression test.

### Final Installed Result

The latest installed smoke for final code commit `b9f648c1e55e3ff08db1f31f71b1c09098fbfb53` passed on macOS arm64 from a private `.noindex` root. It verified the ASAR/resource/notices inventory (including the configured trusted candidate), the exact finite preload bridge, renderer sandbox/CSP/permission denial, bundled Node `v24.20.0`, ad-hoc local identity, workbench and launcher action, settings preservation across reinstall, rollback recovery, single-instance behavior, and complete process/install-root cleanup. `installed-smoke.json` passes `scripts/check-installed-report.mjs`; the installed-evidence catalog now references its SHA-256 and `scripts/ueli/installed-evidence.mjs` passes all 27 rows.

## Honest Boundaries

- Google TTS produced no fresh observable `afplay` during this final run. The bounded outside-child probe/fallback recorded this honestly; prior live afplay evidence and current deterministic lifecycle tests remain in Slice 3 evidence.
- The private development browser fixture was used; the default browser and user tabs were not disturbed. Production remains validated `shell.openExternal`.
- Real macOS Accessibility success still depends on user permission; denial/fallback and fixture success are proven.
- Windows/Linux, macOS x64, signing/notarization, and public distribution remain unexecuted.
