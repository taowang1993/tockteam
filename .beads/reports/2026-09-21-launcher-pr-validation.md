# Launcher PR Validation

Base: `origin/main` at `fe080d15e2059d95106b3b5d4a234590914e0ded`. Feature candidate: `09cd548b`. The base is an ancestor; no merge conflict or history rewrite was needed.

## Independent Feature Verification

A fresh read-only verifier drove isolated Electron fixtures through parent-owned extended-display CDP endpoints. Real Workbench editors/controller, Web Clip Host relay, launcher settings components, preload and guarded IPC were exercised; fixtures supplied isolated note/preference data. This was not a full installed-app smoke.

- Image decoded before scrolling, with 1,000 paragraphs preceding it and no image DOM mounted. Scrolling caused no additional download.
- Live Preview typing, undo/redo and mode changes preserved authored content.
- Final controller-backed proof verified local Bold Text and property changes remain undoable in both Source Mode and Live Preview. Two keyboard undos restored original content; two redos restored formatting.
- Inline and reference images inside blockquotes displayed the real 1691 × 1112 Dedao image. A fresh reload captured one Host relay request with the exact `?x=1&y=2` query.
- Settings verified Extensions/Built-In Tools separation, animated disclosure, search focus, independent drafts, failed-save retention, successful save and 18.08:1 Save Preferences contrast.

[Proof JSON](2026-09-21-launcher-pr-proof/proof.json) · [Preloaded Image](2026-09-21-launcher-pr-proof/preloaded-image.png) · [Editor Undo and Images](2026-09-21-launcher-pr-proof/editor-undo-and-images.png)

Published PNGs were inspected and verified at 3024 × 1898 pixels, with 1512 × 949 CSS pixels, 2× scale, dark color scheme and no skin. Zero page errors, console warnings or external renderer requests were recorded for the editor proof. The settings screenshot was captured at CSS scale and is deliberately **not published**; its behavior/geometry assertions remain recorded. The initial editor network counter was faulty; the separate fresh-reload POST-body capture in `networkCorrection` is authoritative.

Parent explicitly stopped owned roots 52368, 57258, 72062 and 80275 and their recorded descendants; every extended-display cleanup returned `remaining: []`. The first settings endpoint expired before attachment; its full tree was stopped, the clean branch checked, and verification retried only through the same guarded tool.

### Scope Limits

Mode changes used the fixture/controller API because the isolated title-bar layer intercepted the menu hit target. Controller commands, not command-palette navigation, were exercised in the final proof. Native external extension execution and the complete installed/platform matrix were not locally exercised. Heavy notes exceeding the bounded prefetch/cache limits, or immediate jumps before a network response, can still require loading.

## Review Fixes

The independent reviewer applied simplification, security/hardening and performance references; the parent applied the same perspectives when fixing/rechecking findings.

- `3f381ba6`: preserve zero-argument Settings IPC. Integrated preload-to-handler regression failed before the fix and passed afterward; explicit undefined and invalid arguments remain rejected.
- `38dbb730`: distinguish local controller edits from authoritative replacements; preserve undo and exact separator metadata. Resolve reference images in block previews, preserve query parameters and refresh widgets when a reference target changes.
- `09cd548b`: preserve parenthesized image destinations using parsed destinations and angle-delimited rendering. Both inline and reference regressions failed before the fix and passed afterward.

The follow-up independent review confirmed both P1 fixes and identified the final parentheses edge, subsequently fixed with two rendered regressions. No review findings were waived or tests weakened.

## Local Checks

Used repository-pinned pnpm **11.21.0**, not ambient pnpm 12.5.1:

```sh
export PATH="$PWD/node_modules/.bin:$PATH"
pnpm run typecheck
pnpm run typecheck:tocktutor
pnpm --dir plugins/tocktutor/packages/tockteam-tocktutor-workbench run test
pnpm run build:tocktutor
pnpm run build
node scripts/tocktutor-build-manifest.mjs --check
git diff --check
```

All pass; final Workbench suite: **231 Node tests + 454 component tests**. Post-initial-push focused launcher/settings/native-effect/diff/manifest tests: **575 passed, 8 platform skips**. React Doctor reports only the pre-existing route-complexity warnings.

Full local gates were run without skipping or weakening failures:

- `pnpm test`: **1,383 passed, 18 skipped, 5 failed**. The same five failures reproduce in a disposable archive of `origin/main`: two denied `sandbox-exec` operations and three process-inventory `spawn EPERM` operations.
- `pnpm run test:tocktutor`, followed by `pnpm -C plugins/tocktutor -r --no-bail --filter='!@tockteam/tocktutor-workspace' --if-present run test`: all package suites except one pass. The sole failing native-runtime Host-death cleanup test reports process-inventory `spawn EPERM`, also reproduced on the archived base. Its safety fixture retains the temporary directory when cleanup verification is denied.
- Missing local SQLite bindings were repaired with `pnpm -C plugins/tocktutor -r rebuild sqlite3`; no tracked dependency changes were needed. Native-runtime tests then passed 184/185, leaving only the above permission restriction.

GitHub CI is the authoritative unrestricted cross-platform gate. Its live status is linked from the PR; this report does not assert those checks passed before their results exist.

## Related Beads

- `tockteam-82z7`: this validation/publication task; remains open until final checks succeed.
- `tockteam-zz01`, `tockteam-4hqn`, `tockteam-x53f`, `tockteam-qq65`, `tockteam-xl2v`: launcher settings/navigation, focus, contrast and disclosure rules.
- `tockteam-f4pf`, `tockteam-84yk`, `tockteam-dno5`: extension grouping/naming and TockTutor paste.
- `tockteam-vqzs`, `tockteam-lwu6`, `tockteam-vybh`, `tockteam-d1hk`: caret, lossless Live Preview, image byte budget and bounded prefetch.
- `tockteam-ibr3`, `tockteam-16p`, `tockteam-u2t.1`, `tockteam-u2t.2`, `tockteam-u2t.3`: earlier Translate, tray and launcher hardening changes carried by this branch.

Implementation issues were already closed; unrelated issues were not changed.
