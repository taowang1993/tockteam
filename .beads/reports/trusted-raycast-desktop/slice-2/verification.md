# Trusted Translate Slice 2 — Translation Actions

Baseline: `4df9953`. No staging, commits, pushes, research/source snapshot edits, AGENTS edits, or installed smokes performed.

## Implemented

- Reconcile unchanged `translate.tsx` element-valued `List.Item.actions` and `detail` through the compatibility SDK. Source Copy/OpenInBrowser components and the actual Toggle Full Text callback execute in React19; no replacement renderer-native callbacks.
- Native DOM projection shows source primary/secondary ordering, pronunciation, a keyboard-accessible Actions disclosure, selected-item full text, and explicit unavailable later-slice actions. Enter invokes primary; Command+Enter invokes secondary (currently unavailable Paste); Command+K opens Actions; source shortcuts dispatch admitted callbacks. Escape dismisses Actions/restores focus, then exits Detail, then closes the view. Full text uses textContent, not HTML or remote-resource interpretation.
- Main wraps child action handles, owns clipboard writes/readback and exact Google Translate URL admission, and correlates native requests/results with admitted session/generation/action identity. Renderer event acknowledgements are admission only; callback/native outcomes separately report success or failure.
- Query sequence fencing revokes actions immediately on input, including already-in-flight old projections. The source-usePromise adapter rejects old results/errors before debounce, handles return-to-same-query races, and surfaces recoverable service toasts without terminating the runtime. Outcome feedback survives a later React commit.
- Activation long-idle handling, retained cleanup ownership after stop failure, input coalescing, and initial-ready-only ranking remain intact.

## Verification

Initial RED: `node --test tests/trusted-raycast-translation-actions.test.ts` failed because the required native-request validator did not exist (`undefined` versus `function`). The same boundary check is GREEN in the final suite.

Final commands:

- `pnpm typecheck`: passed (`typecheck.txt`).
- `pnpm test`: 917 tests; 904 passed, 13 explicit skips, zero failures (`full-tests.txt`).
- `TRUSTED_RAYCAST_ARTIFACT_TAR=/tmp/tockteam-trusted-raycast-translate-artifact.tar node --test tests/trusted-raycast-*.test.ts`: 32 tests; 31 passed, only explicitly configured long-idle test skipped (`configured-tests.txt`). Includes exact approved archive/source/dependency checks, actual unchanged React19 command, source Detail callback, native-unavailability failures without teardown, protocol rejection, query/error interleavings, and outcome-before-commit regression.
- `TRUSTED_RAYCAST_ARTIFACT_TAR=/tmp/tockteam-trusted-raycast-translate-artifact.tar pnpm test:launcher:electron --trusted-raycast`: passed; includes TockTutor build, `pnpm run build`, runtime staging, actual Cordis-composed Desktop and Playwright CLI (`electron-proof.txt`).
- `git diff --check`: passed; `git diff --cached --name-only`: empty.

Real Desktop evidence: two Google translations including rapid typing; actual source default Copy matched the native clipboard; source pronunciation; unavailable secondary Paste did not execute Copy; source Actions menu/Escape/focus; Toggle Full Text and Escape back; validated browser URL and typed successful outcome; reduced-motion narrow-layout checks across built-in light/dark and all four skin modes; no renderer Node/bridge leak; close and `useCount=1` despite actions and queries. Screenshots: `translation-actions.png`, `source-actions-menu.png`, `full-text.png`, `light-narrow.png`, `closed.png`.

Final Electron root/group PID `72099`, clipboard helper PID `72169`, CDP `60308`. Both process trees stopped; independent `ps` inspection found neither root/group/helper nor a trusted Translate child. Fetching final CDP failed with connection refusal. Clipboard helper acknowledged `READY, ARMED, COPY_VERIFIED, RESTORED`; every original item/type was retained only in bounded memory, then restored. No original clipboard bytes were logged or persisted. An earlier iteration detected a later external clipboard change and correctly preserved it rather than overwriting it; final proof restores immediately after Copy.

## Explicit Evidence Boundaries

Supervisor approved avoiding the user's default browser. The real Desktop source browser action passes through the same main-owned admission and outcome path, but a development-only `!app.isPackaged` fixture opens a private, sandboxed Electron browser partition with denied permissions, no preload/Node, and bounded closure. The proof checks the exact Google query, then closes that private browser. Production delegates to `shell.openExternal(url)`; **actual OS-default-browser launching was not exercised**. Injected browser rejection and exact argument forwarding are deterministic manager tests. No default browser settings or user tabs were touched.

The isolated usePromise test substitutes only a deterministic hook scheduler; it does not claim React reconciliation or change runtime singleton resolution. Configured unchanged-source tests and Desktop use the actual private pinned React19/reconciler closure.

Native Copy's production success additionally requires immediate main-owned readback equality. The test-only Swift helper fails before mutation when capture cannot preserve every format or exceeds 16 MiB, and does not overwrite newer external clipboard changes during restoration.

Later slices still own full language controls/storage, selected-text acquisition, native Paste/prior-app restoration, TTS, and installed/enabled/current/previous recovery. Windows/Linux, installed distributions, and OS-default-browser integration are not newly claimed. The >300-second idle proof was not rerun in this slice; its accepted implementation and original evidence were preserved.
