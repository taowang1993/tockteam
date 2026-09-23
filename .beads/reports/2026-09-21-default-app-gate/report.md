# Default-App Dispatch and Lifecycle Verification

## Scope and Result

The three reviewed regressions are fixed: note-owner changes no longer remount the root Desktop dispatch consumer; microphone startup remains single-flight across draft changes and cleans up tracks; successful default-app dispatch says “Opened in the default app.” instead of describing a pop-out. Independent source re-review found no remaining issues in those three fixes. All 449 focused checks pass.

The surrounding Open in Default App implementation traverses the actual menu, save/controller, typed remote Host method, vault Runtime, authenticated native channel, and main-process validation. Its final `shell.openPath` effect was replaced by a pure recording sink in the isolated fixture. **No associated OS application was launched or verified.**

Source ownership: existing `tutor` worktree at HEAD `9feb2fbc7a96d64d1d7b05cd1533bd9cfab53008`; broad earlier note-menu work remains uncommitted. No Git staging, commit, push, installed smoke, or Nix execution was performed. Full note-menu parity and merge work remain incomplete.

## Desktop Evidence

Guarded run `efa003ee-4ada-474f-a7e1-50c8a87c6125` used generic Electron 42.3.0 on extended display 11, with `focused: false`, mock Keychain, isolated application data, and a synthetic vault. Only the tool-returned loopback CDP endpoint was attached. Canonical proof: 1512 × 949 CSS pixels, device scale 2, 3024 × 1898 PNGs; built-in dark theme, `colorScheme === 'dark'`, no `data-tockteam-skin` and seeded `skinId: null` equivalent.

Route: `/tocktutor/Notes/%E4%B8%AD%E6%96%87%20%23Open.md`, Source Mode. Screenshot allowlist:

- `menu.png`: dirty Unicode/hash-named note and enabled Open in Default App entry.
- `owner-only-save.png`: successful dispatch from the left source pane; the right note retains its independent dirty draft.
- `os-failure.png`: injected no-association failure is visible rather than reported as success.
- `save-conflict.png`: external disk edit blocks save and dispatch, retaining the local draft.

Assertions and disk checks:

1. The first intercepted call sees exactly the new source, proving save precedes dispatch.
2. The second call opens the same left note after focus changes; the right note's dirty source remains absent from its disk file.
3. An injected OS error reaches the caller as `unavailable` and displays “The native action failed safely.”
4. A newer external edit triggers Save Conflict and “The note could not be saved.” No fourth native request/effect occurs; newer disk content and local unsaved content both survive.
5. All three recorded targets equal the canonical active note path, including spaces, Chinese characters, and `#`.
6. Console: zero errors; one existing Electron insecure-CSP warning. Native cancellation, stale/replay/unsafe paths, late results, pop-out dispatch completion and microphone cleanup are covered by focused tests, not claimed as additional live OS proof.

The first isolated run failed because the fixture compared `/private/var/...` canonical paths with its `/var/...` alias. The fixture's allowlist was corrected with `realpathSync`; product source was unchanged. That run was stopped and excluded from accepted screenshots. Both app trees and the display probe were explicitly stopped with `remaining: []` (recorded PIDs in `proof.json`).

## Verification

The exact focused commands, from repository root:

```sh
node --test tests/desktop-open-path.test.ts tests/desktop-open-path-channel.test.ts tests/desktop-copy-path.test.ts tests/desktop-caller-authorization.test.ts tests/desktop-native-caller-abort.test.ts
pnpm -C plugins/tocktutor/packages/tockbot-note-desktop exec node --test tests/client-actions-view.test.ts tests/client-actions.test.ts tests/client-lifecycle.test.ts tests/host-actions.test.ts tests/surface-gate.test.ts
node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/route.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/vault-events-runtime.test.ts
pnpm -C plugins/tocktutor/packages/tockbot-note-runtime exec node --test tests/loader-composition.test.ts
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/native-note-menu.test.tsx tests/route-linked-panes.test.tsx tests/route-panel-controls.test.tsx --environment jsdom
```

Results respectively: **19, 53, 147, 94, and 136 passed**. Initial red reproduction and 35-test green recheck are included. The independent reviewer inspected these logs but did not execute checks; the parent executed final verification and Desktop proof afterward.

Post-fix `pnpm run typecheck:tocktutor`, `pnpm run typecheck`, `pnpm run build:tocktutor`, `pnpm run build`, `node scripts/tocktutor-build-manifest.mjs --check`, quick staging, and `git diff --check` passed. React Doctor (`react-doctor plugins/tocktutor --verbose --diff`) remained **47 / 100**, unchanged from this slice's baseline; this is not a clean bill of health for the broader worktree.

Final `pnpm test`: **1367 passed, 5 failed, 18 skipped**. The same known environment failures remain: two marketplace sandbox tests (`sandbox_apply: Operation not permitted`), one read-only process snapshot and two proof-cleanup tests (`spawn EPERM`). These are not counted as passes; no guard was weakened to run them.

## Remaining Boundaries

Actual OS association, clipboard effects, user-owned applications, full menu/reference acceptance, direct deep-link HTTP reload, installed packaging, and Nix execution are unverified here. The default-app issue remains in progress behind the shared reference/acceptance gate; this evidence does not close the entire menu epic. Separate launcher commits were not integrated.
