# Merge Review Component Gate

## Scope

Intermediate slice for `tockteam-yoam.9`, not a shipped merge workflow.

- `src/merge-review.tsx`: searchable exact-path Markdown picker; Shift+Enter prepend; explicit property choices and source disposition; rebased destination, leftovers, inbound updates, and warnings; cancellable/invalidatable read-only preview.
- `src/merge-preview.ts`: adds the prepared-review interface and decision type; previously reviewed orchestration logic is unchanged.
- `src/route.tsx`: `prepareNoteMerge` saves only represented source/destination drafts first, binds reads and previews to pane/vault/document lifetime, rejects save conflicts and stale replies, and refuses affected referrers with unsaved or mismatched revisions.
- Four component regressions and two route regressions cover these changes. Existing route, split, linked-view, Composer, and preview checks remain green.

The component is deliberately **not mounted in the production note menu**. It has no apply callback, approval token, journal, or Merge button. Production menu integration and recoverable apply remain open. The prepared controller method is tested separately; this browser fixture does not prove the production controller/Host transport end to end.

## Design and Browser Evidence

Reuses shared Dialog, Command, Field, NativeSelect, and Button primitives and DSH semantic tokens. The dialog uses the existing TockTutor overlay levels and its feature-owned review geometry. A real browser check caught shared grid defaults overriding the intended scroll layout; the final dialog uses the supported `unstyled` geometry recipe. All lower controls are now reachable without forced clicks.

Bounded Electron component harness launched only through `extended_display`, on display 11 without focus. Browser interaction used `playwright-cli` attached only to the returned owned CDP endpoint. Main-process fixture service only reads four allowlisted temporary files and runs the real vault inspection planner; it has no mutation endpoint. Fixture revisions are content-derived, not a reproduction of Runtime file-identity authorization.

- `choices.png`: Source.md into Archive/Dest.md, Prepend to Destination, Move to Trash After Confirmation, explicit Keep Source Value for `status`.
- `preview.png`: scrolled review showing the rebased diagram URL, explicit trash intent, unsafe-retirement warning, destination content, and expanded Ref.md update. This is a component screenshot, **not** the canonical TockTutor-versus-Obsidian full-app comparison.
- Both screenshots verified at **1512 × 949 CSS pixels, 2× scale, 3024 × 1898 PNG pixels**, built-in dark appearance, `document.documentElement.style.colorScheme === 'dark'`, and absent `data-tockteam-skin`. Pinned installed DSH base/token CSS and the project Tailwind compiler supply the harness styles; no active skin is inherited.
- Gate checks property-choice gating, exact duplicate-basename disambiguation, Shift+Enter, relative-link rebasing, inbound updates, keep-source warnings, link leftovers, stale decision clearing, Cancel and focus restoration, Escape, outside dismissal after a rendered frame, 390-pixel narrow layout, built-in light appearance, and reduced-motion mode. No page or console errors were recorded.
- Exact fixture SHA-256 sets match before/after preview and cancellation. No source retirement occurred.
- Three owned launches were explicitly stopped; the guard reported all recorded process descendants stopped and `remaining: []`. The first attachment expired/disconnected before the gate; the second exposed the layout defect; final proof used the third launch. Independent shell `ps` is denied by this environment, not silently treated as passing.

Screenshots were visually inspected, allowlisted, dimension/hash-validated, and published with the proof in one directory rename. See `proof.json` and `gate.js`.

## Checks

From repository root (the local pnpm runner was `node node_modules/pnpm/bin/pnpm.mjs`):

```sh
pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/merge-review.test.tsx tests/route-panel-controls.test.tsx tests/route-linked-panes.test.tsx tests/route-split-panes.test.tsx --environment jsdom
node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/route.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/merge-preview.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/composer.test.ts tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts
pnpm run build:tocktutor
pnpm run typecheck:tocktutor
node scripts/tocktutor-build-manifest.mjs --check
pnpm run typecheck
pnpm run build
git diff --check
```

All pass: **138 component tests** and **176 focused Node tests**. RED evidence includes missing component/module and missing controller method. Generated outputs were rebuilt, never hand-edited.

`pnpm test`: **1,367 passed, 5 failed, 18 skipped**, matching the prior environment blockers: approved build-hook sandbox, preview sandbox, strict process snapshot, and two trusted-RayCast process-cleanup checks. No new root failure was observed. Root checks are not described as wholly green.

React Doctor package diff scan: **67/100**, 38 warnings; this narrower scan is not directly comparable with the prior 47/100 report. No broad cleanup was attempted.

## Corrective Review

Independent review reproduced two issues: unopened-file changes did not invalidate reviews, and cmdk trimming could confuse leading-space filenames. Both are fixed and cleared by the revived reviewer (scoped **OK with notes**). The original review timed out before its final verdict; the same review session was resumed through the same protocol. See `corrections/report.md`, `corrections/review.md`, RED/GREEN logs, and the fresh exact-path browser proof. Final corrective totals are **184 Node tests and 140 component tests**, with nested build/typechecks passing. The fresh React Doctor diff scan remains 67/100, 38 warnings.

## Remaining

Real production menu/controller/Host flow; all named-skin captures; durable apply/recovery and idempotency; final full-menu/installed/Desktop acceptance. No issue completion, staging, commit, push, or real OS-app launch is claimed.
