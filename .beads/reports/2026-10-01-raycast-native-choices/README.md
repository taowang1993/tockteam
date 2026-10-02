# Native Dropdown and Tag Selections

Bounded checkpoint `tockteam-qwzg.8.3.4`, following API commit `9b1fccbf` / `.8.3.3`. This is basic owned selection rendering, not full Form, Raycast or Tinycast compatibility.

## Result

The existing mounted Form controller now renders a labeled native single select for Dropdown and native multiple select for TagPicker. It reuses the existing session/revision/request ownership, callback queue, submit gate, error associations, reset/focus and teardown. Group labels and option titles update without replacing controls; pending selections and focus survive patches; tag arrays preserve selection order rather than DOM option order. Empty fields stay typed and have an honest empty message. Draft values that temporarily lack a declared item remain represented rather than silently disappearing. Labels/helper/error text wrap, fonts remain inherited and disabled/error state is reflected accessibly. No popup framework, React root, plugin/theme layer or dependency was added.

## Confirmed Findings

**2 confirmed implementation findings, both fixed; 0 remaining confirmed defects in the bounded checkpoint.** Ranked highest to lowest:

1. **Medium — Duplicate section titles collapsed groups on patch.** Impact: an earlier native implementation reused groups by displayed title and could lose the first section's options. Affected: `src/user-raycast-renderer.ts` / `tests/user-raycast-form-renderer.test.ts`. Fixed by reusing each section's projection position, not its label. The duplicate-title regression failed before the fix and now verifies both groups, all options, a renamed heading and stable select identity.
2. **Low — Empty tag fields showed selection instructions with no available tags.** Impact: misleading help in an otherwise correctly empty control. Same affected paths. Fixed by the explicit sentence “No tags are available.” The empty-field check failed before this copy change and now also verifies string/array focus values and detached selector rejection.

The original missing native-select check also failed before the feature was implemented. New fixture typing errors were corrected before final typecheck; they were not product findings.

## Verification

Exact commands:

```sh
node --test --test-name-pattern='native sectioned dropdown' --test-reporter=tap tests/user-raycast-form-renderer.test.ts
node --test --test-name-pattern='duplicate section|native tag' --test-reporter=tap tests/user-raycast-form-renderer.test.ts
node --test --test-name-pattern='empty choice' --test-reporter=tap tests/user-raycast-form-renderer.test.ts
node --test --test-concurrency=1 --test-reporter=tap tests/user-raycast-form*.test.ts tests/user-raycast-ipc.test.ts tests/user-raycast-renderer.test.ts
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast*.test.ts tests/trusted-raycast*.test.ts tests/launcher-ipc.test.ts tests/launcher-preload-bridge.test.ts tests/launcher-window*.test.ts
pnpm run typecheck
pnpm run test
pnpm run build
node scripts/stage-dsh.mjs --quick
```

Final results: focused **48/48**, scoped Raycast/launcher **421 passed / 6 optional skipped**, root **1,652 passed / 18 optional skipped**, no failures; typecheck, build and quick stage passed. Shared operations occurred only after the gallery owner's explicit publication handback at `b7868184`. The optional real-provider checks were not enabled. React Doctor exited 0 but returned `projects:[]`; it supplied no effective React lint coverage or score and is not claimed as a successful code-quality audit. Source review, executable public checks and typecheck are the actual gates.

A bounded Playwright CDP session attached only to `extended_display`'s owned Electron endpoint. The real product `dist/main.js` and restricted launcher preload opened an independently written offline fixture from an isolated approved install. It verified sections/defaults, rejected empty-language submission and associated error, reset/focus, real string-array callbacks and their order, and exact typed string/array/empty-string/text/boolean submission after a pending tag edit with Control+Enter. No account, credential, network or native-effect operation was used. Interaction errors, console errors and nonlocal requests were all **0**; one existing unpackaged Electron CSP warning is recorded separately.

All four published captures verify **1512 × 949 CSS pixels, 2× scale, 3024 × 1898 PNG pixels**, the exact launcher file route, `style.colorScheme === 'dark'`, no active skin and no renderer Node authority. The system-media preference was deliberately light. Eight separately labeled product palettes passed inherited-font, text-contrast, focus, checked-mark and field-width checks; a 640-pixel viewport had no field/form overflow. These palette applications do not prove skin-setting persistence or every native popup pixel.

## Screenshot Proof

Only the four canonical images and sanitized evidence were published with a staged-directory rename. No gallery/Properties image or unrelated report was replaced.

```text
/Users/taowang/projects/tockteam/.beads/reports/2026-10-01-raycast-native-choices/choice-form-edited-dark.png
```

Other states are `choice-form-dark.png`, `choice-form-error-dark.png` and `choice-form-saved-dark.png` in the same directory. `proof.json`, `palette-proof.json` and `protection.json` record route, visible controls, exact saved values, geometry, source/build hashes, placement and cleanup. The harness image reader could not provide an inline image preview; image geometry and visible DOM are verified, but no pixel-level visual approval is claimed.

## Cleanup and Ownership

Both owned windows stayed on extended display **17**, unfocused. `HOME` was preserved, `--use-mock-keychain` was present and only the guard's disposable user-data root was used. Playwright `choice-proof` detached and the CLI reported no browsers. Explicit `extended_display.stop` stopped root **11825** and all **30** recorded app/runtime/extension descendants, remaining **[]**; PID ESRCH probes reconfirmed termination. The inspection root **11729** also stopped. The independently recorded fixture audit passed for **124** groups; the final scoped run adds its own fixture stop assertions.

**2,365** baseline tracked paths outside the explicit writer/peer scopes stayed byte-identical, including all three protected user-modified paths. All **8** peer gallery/proof paths were independently compared with `b7868184` and stayed unchanged after publication. Unowned root Playwright artifacts were never used or modified. No worktree, push, installed-release smoke, real-account or Linear-cleanup claim occurred.

## Unverified and Remaining

OS-native popup keyboard selection is **environment-unverified**, not a confirmed bug: app-scoped ArrowDown/Enter left both a plain native select and the product select unchanged while the guarded macOS app remained inactive. No foreground focus, user keyboard or guard bypass was taken. Control+Enter pending-submit behavior *was* verified in the real product.

`tockteam-qwzg.8.3.5` tracks search/filtering callbacks, persisted selections, item icons, richer popup/keyboard behavior and the remaining proof. It also records unverified late-loaded/custom-wrapped first-item defaults: the current fallback examines declared React child elements, not executed child components; no full parity claim is made for those cases. Date/file fields, broader collections/details/navigation/actions, other SDK/native contracts and the final installed compatibility matrix remain open under `.8.3` / `.8`. Linear cleanup remains separately unresolved. Restart Electron to load the new visible controls.
