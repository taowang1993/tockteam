# Trusted Translate Slice 4 Parent Acceptance

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

## Honest Boundaries

- Google TTS produced no fresh observable `afplay` during this final run. The bounded outside-child probe/fallback recorded this honestly; prior live afplay evidence and current deterministic lifecycle tests remain in Slice 3 evidence.
- The private development browser fixture was used; the default browser and user tabs were not disturbed. Production remains validated `shell.openExternal`.
- Real macOS Accessibility success still depends on user permission; denial/fallback and fixture success are proven.
- Windows/Linux, macOS x64, signing/notarization, and public distribution remain unexecuted.
