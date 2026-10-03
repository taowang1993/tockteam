# Raycast Form Defaults: Bounded Behavior Proof

## Scope

Continuation of the approved Tinycast-documented macOS compatibility target, using `@raycast/api` 2.0.3 as the public reference. Tinycast revision `6fc6aa1b909ca24e3cd25e35c078a7c808ca34a9` remains a behavior reference, not copied implementation. This is an incremental Form ledger, not acceptance of all 16 capability groups or universal Raycast Store compatibility. DSH pins and composition are unchanged.

Owned implementation paths: `src/trusted-raycast-compat-api.ts`, `src/user-raycast-child.ts`, and `tests/user-raycast-form-editing.test.ts`. No trust/install policy, protected TockTutor/workbench/gallery bytes, mixed guide, shared `dist` output, or user profile was changed. The earlier per-Form field-ID guard is separately saved in `60b09512`.

## Confirmed Finding

Total confirmed baseline findings in this slice: **1, fixed**. Total remaining confirmed material findings from the final three-path self-check: **0**. This is parent self-check evidence, not an independent review or acceptance of unrelated work.

1. **P2 — Wrapped Dropdown Defaults Select the Wrong Value.** `src/trusted-raycast-compat-api.ts` inspected caller React elements before their components rendered. A first wrapped section containing French fell through to a later direct Spanish item; the public regression failed with `es !== fr`. An implicit dropdown whose choices arrived through child-only rendering could stay blank. Impact: initial and submitted choices could disagree with the first rendered option. **Fixed and verified:** scoped option mount notifications initialize the default once; explicit, controlled, genuinely empty, and restored selections remain authoritative. Reset uses the resolved initial snapshot; initialization does not invoke `onChange`. Focused Node and isolated Electron component checks pass. Installed-extension behavior remains unverified.

During implementation, a separate transient-ready regression was caught before saving: mutation-phase publication exposed `value: ''` before layout-driven French initialization. An immediate action could fail with `Stale user extension event`. The deterministic first-ready assertion failed before the related child fix. Publication is now coalesced after layout, and successful field/action acknowledgements follow the settled projection. Existing freshness, ownership, input bounds, and native-action restrictions remain in place; malformed dropdown metadata still fails visibly. This development regression is not counted as an additional confirmed baseline release finding.

## Per-Behavior Ledger

- **Per-Form ID Ownership:** source guard saved in `60b09512`; current focused checks cover collisions, separate Forms, ordinary edits, replacement, renaming, retirement, and rejected submission after an invalid duplicate. Invalid-ID GUI and installed proof: unverified.
- **Description and Separator Rows:** source saved earlier in `c6d2569a`; current presentation checks pass. Earlier guarded full-Desktop proof exists for the older frozen baseline; this component proof also exercises inert `Form.Description`. No new installed proof.
- **Wrapped First-Option Defaults:** current source and first-ready/typed-submit/reset checks pass; Electron component shows French while controlled and explicit English remain unchanged. Full current Desktop build and installed proof: unverified.
- **Child-Only Late Options:** current source and load/reorder/edit/reset checks pass; Electron component selects the first arriving French option without automatic change callbacks and preserves an edited English selection when options reorder. Full current Desktop build and installed proof: unverified.
- **Controlled, Explicit, and Empty Values:** focused checks cover retained controlled values, removal of control, explicit defaults, a valid first empty-string option, and no-options emptiness. Component proof shows the authoritative choices and reset behavior. Installed proof: unverified.
- **Accepted Stored Values:** focused and component checks verify edited and empty-string selections across distinct cold child restarts; reset returns to the rendered initial option, not the stored selection. No real profile or account was used. Installed proof: unverified.
- **Ready Frames and Metadata Errors:** first-ready regression and immediate typed submits pass; malformed keywords report `Invalid dropdown keywords` rather than exposing a usable malformed ready frame. Existing owner/session/revision/handle/effect checks pass. Broader asynchronous-extension compatibility remains unverified.
- **Date and Date-Time Values:** existing focused date/edit/reset/persistence checks pass in the current suite. `Form.DatePicker.isFullDay` and full-day encoding are still unsupported/unestablished; declarations and official Form documentation did not establish an exact encoding rule. No guessed implementation was added.
- **File Selection and Further Rich Picker Behavior:** unfinished or unverified. This slice does not establish native file chooser, richer item-image/tooltip behavior, full installed compatibility, or Raycast URL-scheme takeover (excluded).

## Runnable Verification

```sh
node --test --test-reporter=tap --test-name-pattern='implicit dropdown defaults come' tests/user-raycast-form-editing.test.ts
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast-form*.test.ts tests/user-raycast-runtime.test.ts tests/user-raycast-reconciliation.test.ts tests/user-raycast-storage.test.ts tests/user-raycast-oauth-runtime.test.ts tests/trusted-raycast-can-i-use-preference-form.test.ts tests/trusted-raycast-kaomoji-runtime.test.ts
pnpm run typecheck
git diff --check -- src/trusted-raycast-compat-api.ts src/user-raycast-child.ts tests/user-raycast-form-editing.test.ts
```

- Failing-first logs preserve the wrong Spanish default and the deterministic transient blank ready frame; subsequent checks pass.
- Final focused/bundled run: **120 passed, 1 pre-existing optional Kaomoji projection skip, 0 failed**. The Form/private-child subset separately passed **118/118**. Typecheck and whitespace checks exit 0.
- React Doctor 0.9.14: isolated copies of only the frozen/current API and user child were scanned. Both complete two-file scans exited 1 on the same five pre-existing naming/constant-factory candidates (four hook-name errors and one constant `fieldKind` dependency warning); no new diagnostic. These are not newly confirmed bugs. Lowercase exported function aliases are rendered as components, and `fieldKind` is fixed by the factory. No broad rule disable or unrelated cleanup was applied. Numeric score was not requested or claimed; telemetry and supply-chain requests were disabled. The earlier root one-file scan found no projects and is not coverage.

## Electron Component Evidence

The guarded generic Electron test window uses the actual current `UserRaycastManager`, native Form renderer, freshly built API/private child, isolated installer/storage, restricted owner/origin IPC, renderer sandboxing/context isolation, deny-by-default permissions, and a first-party offline command. It is **not** the full DSH/Desktop application or installed distribution. Full Desktop bootstrap was deliberately avoided because it resolves a workspace under the real home directory.

Both allowlisted scratch screenshots were decoded at **3024 × 1898** pixels. Captures verify **1512 × 949 CSS pixels, 2×**, explicit dark appearance, no active skin, and no renderer Node access. The page is the owned `.../ui/index.html` component route; scrolling to the action area makes all five native choices and exact saved values visible. Initial saved values contain exactly the five string fields and zero change callbacks. Browser errors, console errors, nonlocal browser requests, Host errors, and native copy calls: **0**. Contrast is not claimed.

```text
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-dropdown-defaults-wIZFUK/ui/dropdown-initial-dark.png
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-dropdown-defaults-wIZFUK/ui/dropdown-restored-dark.png
```

The screenshots remain scratch-only; no gallery or repository PNG was published. Source-map bindings verify the current manager and renderer, and the build proof records current API/child/source/artifact hashes. `HOME` is preserved, `--use-mock-keychain` is verified, and no real account, profile, workspace, Keychain, or native effect was used.

The first ESM entry was rejected by the guard's synchronous loader before its body or any window ran; root PID 42246 is confirmed exited. A CJS entry dynamically imports the same module through the same guard, not a raw launch. A first fixture adapter mistakenly called `state()` instead of the existing `status()`; that run was stopped before rebuilding. These harness corrections are not product findings. Successful app stop receipts report roots 42571 and 43812 and all recorded descendants stopped with `remaining: []`; the latter includes all three cold SDK children. Both named Playwright sessions were detached, and `playwright-cli list` reports no browsers. No web server was started.

## Custody and Limits

```text
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-dropdown-defaults-wIZFUK/source-preservation.json
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-dropdown-defaults-wIZFUK/app-custody.json
```

The source-window checkpoint confirmed all **2,472 unrelated baseline records** identical, no unexpected additions, and **146 owned test groups** stopped; final custody is updated after the last checks. This is preservation evidence, not acceptance of pending TockTutor or other owner bytes. No independent reviewer was launched. No shared build, installed smoke, stage, push, or extra native effects are implied by these results. Rebuild and restart Electron before expecting the source changes in the running app.
