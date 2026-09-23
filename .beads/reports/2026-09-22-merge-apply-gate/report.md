# Recoverable Note-Merge Gate — 2026-09-22

## Result

The scoped merge implementation and independent corrective review pass. **The full note-menu epic is not ready for final acceptance:** direct note-URL reload returns HTTP 404, environment-restricted checks remain non-green, and native association/installed verification is not certified.

## Verified Behavior

- Production Desktop menu → destination/property review → explicit confirmation → runtime merge → source retirement → destination navigation.
- Merge Recovery creates original source, destination, and referrer copies without overwriting the newer destination edit.
- Runtime journals before publication, verifies publication digests, rejects lossy UTF-8 originals, retains recovery data on interrupted publication, and does not replay completed application.
- Interrupted retirement marks missing source views unavailable while preserving their draft. Complete and truncated trees, lost responses, and owned events have regressions. Missing-file classification is tested through the real runtime and Host transport; dangling aliases remain unsafe.
- Open search results refresh after an authoritative merge result, including retired-source removal and changed destination/referrer snippets.
- A production screenshot exposed white-on-white primary buttons. Shared Tailwind primary mappings now use the pinned DSH button fill/label foreground pair; the correction is independently reviewed.

## Desktop Evidence

The latest production run was launched only through `extended_display`, then driven through its owned CDP endpoint using `playwright-cli`. All captures use **1512 × 949 CSS pixels, DPR 2, 3024 × 1898 PNG pixels**. The built-in dark capture has no skin on either the HTML root or body. Other captures are explicitly labeled theme/skin variants.

| Capture | Scheme | Primary Button Contrast |
| --- | --- | --- |
| Original — Dark | Dark | 18.08:1 |
| Original — Light | Light | 18.90:1 |
| Deep Current | Dark | 9.67:1 |
| Jade Circuit | Dark | 10.33:1 |
| Porcelain | Light | 5.25:1 |
| Ember Dusk | Dark | 8.66:1 |

These are normal-state measured button contrasts, not a comprehensive accessibility certification. The six preview dialogs reported no horizontal overflow and no page errors. Theme changes used the production Settings UI, not injected palettes. Filesystem effects were real within an isolated fixture; OS association and clipboard effects were intercepted, not exercised against user applications.

Latest owned run: `19c7ce63-ee5f-45e4-afc1-a2e897eac4bd`, root PID `83791`, extended display `11`, work area `{x:1512,y:30,width:1366,height:994}`. `extended_display.stop` confirmed every recorded descendant stopped and `remaining: []`. Playwright detached. No user profile, application, Keychain, or foreground input was used.

## Checks

- `node --test --test-name-pattern='merge|document open|alias' plugins/tocktutor/packages/tockbot-note-runtime/tests/loader-composition.test.ts` — **28 passed**.
- `node --test plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/route.test.ts plugins/tocktutor/packages/tockteam-tocktutor-workbench/tests/host-read-transport.test.ts` — **169 passed**.
- `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench run test:component` — **572 passed** across 21 files.
- `node --test tests/tailwind.test.ts tests/shadcn-migration.test.ts tests/ui-ref-contract.test.ts` — **11 passed**.
- Workbench and Desktop `tests/package-boundary.test.ts`, each run from its owning package — **5 + 3 passed**.
- Nested and root typechecks, shared UI typecheck, nested build, root build, quick staging, generated manifest check, and `git diff --check` — passed.
- `pnpm test` — **1,367 passed, 5 failed, 18 skipped**. The existing sandbox/process gates fail with `sandbox_apply: Operation not permitted` / `spawn EPERM`; not green and not weakened.
- `pnpm run test:tocktutor` — stopped in the runtime suite with **204/205** passing and the existing Host-death process-inventory check failing with `spawn EPERM`. Final targeted runtime and complete UI checks above passed after the corrective edits; no claim that the recursive suite completed.

## Independent Review

The read-only reviewer reproduced and challenged runtime and integration boundaries over corrective passes. Final run `9b9b4bed-5cb2-4127-be45-8e79b36441c4` reported **no issues found / scoped OK** for the runtime boundary correction and both integration findings. Its output is copied as `independent-review.md`. Browser theme verification was performed afterward by the parent and is not attributed to that reviewer.

## Remaining Gates

1. Reloading `/tocktutor/Notes/Destination.md` directly returns **HTTP 404**. Pinned DSH `dsh-host-frontend-static` intentionally serves index HTML only at explicit index entry points; fixing this requires a deliberate authenticated shared-shell route adaptation, not weakening its general static fallback.
2. Installed smoke directly launches packaged application executables. The current extended-display-only guard does not authorize that path; no raw launch or equivalent-proof claim was made. Source package-boundary checks are not installed proof.
3. `nix` is unavailable locally; Nix/CI validation remains pending.
4. Real OS default-application association remains unverified; dispatch interception is explicitly limited evidence.
5. Root process/sandbox gates and the nested Host-death process probe need an environment permitting their existing safety checks.
6. Broad pre-existing worktree changes still need ownership-safe staging/commit reconciliation. Nothing was pushed or opened as a PR.
