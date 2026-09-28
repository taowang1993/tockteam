# TockLauncher Review

Reviewed the launcher implementation and trusted compatibility code against `.agents/references/tocklauncher.md`, starting at `384faf0b`. Parent review plus three independent read-only reviews covered providers/native actions, persistence/settings, and trusted runtime boundaries. **12 confirmed findings; all fixed and regression-checked.** Unverified platform concerns and skipped checks are separate below.

## Findings and Fixes

1. **P1 — Reset could recover cleared settings and secrets.** `src/launcher-persistence.ts`: the ordinary backup writer retained the pre-reset settings. A later missing/corrupt primary could restore them. Fixed reset recovery semantics; missing-primary and corrupt-primary tests pass. Commit `12f6be74`.
2. **P1 — Busy mutation queues could discard mandatory trusted-session teardown.** `src/main.ts`, `src/trusted-raycast-mutex.ts`: owner closure, activation revocation and shutdown competed for bounded queue admission. These lifecycle calls now bypass admission and use the manager's synchronous revocation/coalesced cleanup. Saturated-queue and owned-process cleanup regressions pass. Commit `3be2fcb4`.
3. **P1 — Paste verification could overwrite a newer clipboard copy.** `src/trusted-raycast-native.ts`: initial readback mismatch restored an old snapshot without proving ownership. It now fails without restoring. Mocked refusal/concurrent-copy regressions pass; no user clipboard was accessed. Commit `a0211d83`.
4. **P2 — Workflow selection discarded unsaved or rejected edits.** `src/launcher-workflow-settings.tsx`: current selection is now a no-op; switching/adding requires explicit discard. The existing Settings Escape guard handles the new nested confirmation without closing Settings. Mounted tests cover rejected saves; guarded Electron verifies preservation, confirmation, Escape and focus restoration. Fixed.
5. **P2 — Normalized successful saves stayed marked unsaved.** `src/launcher-network-settings.tsx`, `src/launcher-settings-drafts.tsx`, `src/launcher-settings-draft-value.ts`: currency and JSON editors now reconcile semantic values against the accepted snapshot, including UUID JSON. Mounted tests verify accepted normalization, rejection, malformed JSON and newer edits during a pending save; real isolated IPC proof verifies currency/JSON saves. Fixed.
6. **P2 — Completed workflows retained consumed action IDs.** `src/launcher.ts`: success, failure and cancellation now clear busy state and refresh results. Focused regression and built-renderer Electron proof pass for all three outcomes. Commit `b20014b0`.
7. **P2 — Terminal toggles erased other-platform selections.** `src/launcher-terminal-settings.tsx`: toggles now add/remove only the selected identity. Mounted macOS/Windows cases and isolated macOS IPC proof preserve foreign entries. Fixed.
8. **P2 — UUID switches disagreed with effective saved preferences.** `src/launcher-local-settings.tsx`: switches now inherit nested `generatorFormat` fields unless scalar overrides exist. Mounted precedence tests and rendered nested-format checks pass. Fixed.
9. **P2 — Inline translation preferences bypassed the pinned language catalog.** `src/trusted-raycast-settings.ts`: both writers now enforce catalog membership in shared write preparation, leaving legacy reads separate. Invalid-language tests reject writes; supported-language tests pass. Commit `0527bb94`.
10. **P2 — Maximum-length project names broke result publication.** `src/launcher-discovery-extensions.ts`: JetBrains action descriptions no longer repeat the project name and exceed the action bound. A 512-character name publishes alongside other results. Commit `cea7d078`.
11. **P2 — Linux discovery included deleted desktop entries.** `src/launcher-discovery-scanners.ts`: `Hidden=true` is rejected alongside `NoDisplay=true`. Parser and scanner-fixture regressions pass. Commit `cea7d078`.
12. **P2 — Body-portaled confirmations painted beneath Desktop Settings.** `plugins/skins/src/client/tailwind.css`: the Settings shell owns layer 1000, but shared alerts defaulted to 50. Scoped portal layers now place the overlay/content immediately above the shell. Browser hit-testing verifies the dialog is on top in both built-in themes and all four skins; the new confirmation description uses foreground contrast. Fixed; unrelated picker styling preserved.

## Verification

Failing checks were run before each implementation fix. Final commands:

- `pnpm typecheck` — passed.
- `pnpm test` — **1,533 passed, 17 skipped, 0 failed**.
- `pnpm run build` — passed.
- `pnpm --filter @tockteam/ui run typecheck` — passed.
- `node --test tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts` — passed as part of focused and full suites.
- `npx -y react-doctor@latest . --verbose --diff` — unchanged 69/100; one existing complexity warning at the reported `src/client/plugin.tsx:1012`, no new launcher finding.
- `git diff --check -- . ':!AGENTS.md'` — passed. Existing `AGENTS.md:108` whitespace was not changed.

Key focused checks:

```sh
node --test tests/launcher-renderer-invocation.test.ts tests/launcher-persistence.test.ts
node --test tests/trusted-raycast-native-effects.test.ts tests/trusted-raycast-lifecycle-faults.test.ts tests/trusted-raycast-mutex.test.ts tests/trusted-raycast-settings.test.ts
node --test tests/launcher-discovery-scanners.test.ts tests/launcher-discovery-extensions.test.ts
node --test tests/launcher-settings-interactions.test.ts tests/launcher-workflow-settings.test.ts
```

## Rendered Evidence

- [Settings Confirmation](tocklauncher-review-2026-09-28/settings-confirmation.png)
- [Workflow Recovery](tocklauncher-review-2026-09-28/workflow-recovery.png)
- [Settings Geometry, Themes and Cleanup](tocklauncher-review-2026-09-28/settings-proof.json)

Screenshots are **1512 × 949 CSS pixels at 2×**, producing **3024 × 1898 PNGs**. Canonical captures use built-in dark appearance and no skin. Settings proof uses the actual pinned DSH Settings shell, real preload/guarded IPC, isolated preference files, and a generic guarded Electron window on the extended display. It is not a full Desktop runtime proof. Workflow recovery uses the built renderer with an inert bridge; it proves renderer settlement, not native effects.

Final Settings proof verified normalized saves, terminal preservation, UUID state, workflow draft protection, nested Escape/focus restoration and confirmed discard. All six theme states had bounded dialogs, correct foreground layering and description contrast ≥4.5:1. A 420px-wide check also passed without dialog overflow under reduced motion and dark-app/light-system appearance. No page errors were recorded. An earlier capture exposed the portal layering issue and was not published.

All temporary guarded Electron trees were explicitly stopped. Final root PID **19178**, recorded descendants **19180, 19181, 19182, 19320, 19321**, remaining **[]**. Earlier roots 7546, 12481, 15501 and 15749 also reported no remaining descendants. Owned Playwright sessions were closed. Only the two allowlisted, dimension-checked screenshots were published with temporary-file/rename publication.

## Limits and Unverified Concerns

- Linux `XDG_CURRENT_DESKTOP` versus Electron's `ORIGINAL_XDG_CURRENT_DESKTOP` behavior remains unverified; it is **not counted as a confirmed bug**. Native Linux/Windows execution was not performed.
- Native clipboard, Accessibility, external-app paste and live network effects were not exercised against user applications. Mocked boundaries and existing process integration tests were used.
- The installed/Electron smoke commands that directly spawn GUI apps were not run under the extended-display guard. The bounded guarded component/renderer proofs above do not establish packaged installation behavior.
- React 18 component tests emit an existing shared AlertDialog ref warning. This was not suppressed or worked around with React aliases. Browser proof uses the existing external peer-runtime fixture mechanism.
- Pre-existing `AGENTS.md`, `tests/right-panel-layout.test.ts` and `.playwright-cli/` changes were left untouched. Another session's committed TockCoder picker changes were preserved.

The canonical reference was updated for normalized drafts, workflow selection, terminal/UUID preference semantics, language parity, non-droppable teardown and reset recovery. Bundled trusted Raycast artifacts remain **three**: Google Translate, Kaomoji Search and Can I Use. No extension authority or runtime scope was expanded.
