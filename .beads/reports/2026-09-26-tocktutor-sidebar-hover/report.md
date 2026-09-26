# Sidebar Hover Note Actions

A trailing 24px ellipsis overlays the note title on hover or keyboard focus, without changing row/label geometry. It stays visible while the menu is open and exposes the existing clicked-note actions. The trigger is a sibling button, not a nested interactive element. Touch devices retain a visible trigger.

## Verification

- Red→green: `cd plugins/tocktutor/packages/tockteam-tocktutor-workbench && ./node_modules/.bin/vitest run tests/route-note-context-menu.test.tsx --environment jsdom` — failed for the absent trigger, then both tests passed. Covers target-bound rename, unchanged unrelated draft, expansion state, and Escape focus restoration.
- Workbench: `node --test --test-concurrency=1 tests/*.test.ts` — 365 passed; `./node_modules/.bin/vitest run tests/*.test.tsx --environment jsdom` — 656 passed (commands run from the Workbench package).
- Root: `node --test --test-concurrency=4 tests/*.test.ts` — 1,450 passed, 17 environment-guarded skips.
- Pinned local pnpm 11: `pnpm --filter @tockteam/ui run typecheck`, `pnpm run typecheck`, `pnpm run typecheck:tocktutor`, `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench run build`, and `pnpm run build` passed. Generated outputs were rebuilt, not hand-edited. `node scripts/tocktutor-build-manifest.mjs --check` passed.
- Six isolated, guarded Electron runs passed 16 checks each: hover/focus visibility, actual title overlap, unchanged row bounds, exact button/row color match, click targeting, dirty-buffer preservation, 13 menu actions, open-state visibility, Escape/Tab/Enter, outside dismissal, nested notes, selected notes, and no runtime errors.
- Built-in dark/light plus all four skins were verified with the opposite system appearance and reduced motion. Minimum icon contrast: 10.39:1. An additional keyboard resize to a 180px Files sidebar retained the trigger within the row and opened the menu.
- Every capture was verified at 1512 × 949 CSS pixels, 2× scale, and 3024 × 1898 PNG pixels. Only the canonical dark screenshot is published (`dark.png`); its document and body have no skin. Exact routes, content/mode, computed measurements, and cleanup records are in `proof.json`.
- All six owned Electron process trees were explicitly stopped; no descendants remained.

## Verification Limits

- React Doctor reported no new lint issues, but its maintainability analysis did not complete within the bounded scan; no score is claimed.
- Switching appearance through Settings in the first run was blocked by the existing embedded layout intercepting pointer events. Fresh isolated profiles were used for all six appearances instead; Settings navigation is outside this change.
- The root pnpm command automatically normalized the lockfile. That confirmed self-generated delta was restored; no dependencies were intentionally changed.
