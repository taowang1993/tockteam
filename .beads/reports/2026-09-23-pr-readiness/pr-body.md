## Summary

Complete TockTutor's Obsidian-style note menu: exact-path reveal, bookmark editing, Copy Path, note-local Find/Replace, real nested splits, note-bound linked views, authorized default-app dispatch, and recoverable whole-note merges. Preserve drafts, editor history, canonical-path authority, and restart/retry recovery.

Also includes the inherited Launcher/Coder maintenance already merged into local `main`, explicitly approved for inclusion. No agent loop, profile identity, or user-data root is replaced.

## Feature Proof

- Fresh independent verifier: note-local Reading Find across bold formatting; exact typing/replacement Undo ×3 and Redo ×3 in Source and Live Preview.
- Real Desktop: bookmark ID/group persistence and removal, keyboard submenus, 25 px menu rows, nested pane restoration, linked-view follow/pin behavior, recoverable merge, and authenticated reload.
- Canonical proof uses built-in dark, no skin, 1512 × 949 CSS at 2×. All owned process trees stopped.

[Current Evidence](https://github.com/taowang1993/tockteam/blob/tutor/.beads/reports/2026-09-23-pr-readiness/report.md) · [Find Screenshot](https://github.com/taowang1993/tockteam/blob/tutor/.beads/reports/2026-09-23-pr-readiness/ui/reading-find-dark.png) · [Menu Screenshot](https://github.com/taowang1993/tockteam/blob/tutor/.beads/reports/2026-09-23-pr-readiness/ui/menu-dark.png) · [Bookmark Screenshot](https://github.com/taowang1993/tockteam/blob/tutor/.beads/reports/2026-09-23-pr-readiness/ui/bookmark-dark.png)

## Regression Checks

Local Workbench: 359 Node + 578 Vitest passed. Native/authenticated-route checks: 24 passed. Builds, typechecks, manifest validation and diff checks passed. Four implementation rechecks accepted; separate index-lease review found no issues. Deterministic SQLite contention regression and 40 exactly-one-owner rounds pass.

[Branch CI](https://github.com/taowang1993/tockteam/actions/workflows/ci.yml?query=branch%3Atutor) supplies the full platform/Nix/runtime gate. Local aggregate results retain six environment-denied tests; standalone probes reproduce the process/sandbox restrictions without application code. No tests were disabled.

## Boundaries

Clipboard/default-app effects were intercepted; actual OS association and installed-executable behavior are not certified. Workbench React Doctor remains at its 58/100 baseline with documented warnings; the broader workspace scan is not a clean lint gate. These are disclosed verification limits, not claims of unrestricted native or release acceptance.

## Reproduce

```sh
pnpm run typecheck:tocktutor
pnpm run test:tocktutor
pnpm run build:tocktutor
node scripts/tocktutor-build-manifest.mjs --check
pnpm run typecheck
pnpm test
pnpm run build
```

For Desktop proof, use the repository's guarded extended-display fixture and owned CDP instructions in the linked evidence, not a raw app launcher. Open a fixture note, exercise More Note Actions, and verify exact content/history plus cleanup.
