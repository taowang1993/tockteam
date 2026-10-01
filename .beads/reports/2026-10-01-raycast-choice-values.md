# Owned Dropdown and Tag Picker Values

Checkpoint `tockteam-qwzg.8.3.3`: private Form values and field transport only. Native selection rendering is tracked separately by `.8.3.4`; this report does not claim complete Dropdown/TagPicker search, persistence, icons, date/file fields, or full Tinycast/Raycast compatibility.

## Result

The user-selected Form Dropdown now uses the same form-owned collection, asynchronous callbacks, stable field handles, focus/blur and reset/focus references as basic fields. A Dropdown submits a string; TagPicker submits an ordered string array. Default values are retained once per component lifetime, controlled values take precedence, sections supply first-item defaults, empty selections remain empty, and unmounted fields remove their values and handles.

Array defaults, callback arguments and submitted values are separate snapshots: modifying one does not alter another or change a later reset. The documented nested and top-level choice aliases route to these same components. The three bundled extensions retain the legacy dropdown branch and projection shape.

Tag values are dense unique string arrays, at most 64 entries and 16,384 serialized UTF-8 bytes. Sparse/extra-property/toJSON/duplicate/non-string/over-bound arrays fail admission. Scalar fields cannot receive arrays. Only a typed TagPicker's value can cross projection admission as an array; other projection objects/arrays remain disallowed. Owner/session/revision/handle/request limits, one pending callback and its deadline, clipboard/action separation and IPC acknowledgement remain unchanged. No renderer functions, arbitrary HTML, dependencies, data migrations, provider credentials or URL-handler changes were added.

## Test-First Evidence

The initial first-party public child check failed before code: `Form.Dropdown.Section` and `Form.TagPicker` were unavailable. The declared-default/edit test now submits exactly `{locale:'fr',colors:['red']}` and then `{locale:'en',colors:['blue','red']}`. A separate legacy-choice-alias check failed before its aliases were added.

Exact commands:

```sh
node --test --test-name-pattern='sectioned dropdown' --test-reporter=tap tests/user-raycast-form-editing.test.ts
node --test --test-name-pattern='legacy choice' --test-reporter=tap tests/user-raycast-form-editing.test.ts
node --test --test-concurrency=1 --test-reporter=tap tests/user-raycast-form-editing.test.ts tests/user-raycast-form-ipc.test.ts tests/user-raycast-form-values.test.ts
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast*.test.ts tests/trusted-raycast*.test.ts tests/launcher-ipc.test.ts tests/launcher-preload-bridge.test.ts tests/launcher-window*.test.ts
pnpm run typecheck
```

The 25-case API gate passed before the extra legacy-alias case; the final 425-case scoped run passed **419**, skipped **6** optional checks and failed **0**, including the alias. Typecheck passed for the API foundation. The final native-renderer test additions initially needed no-unchecked-index typing corrections; these were test-only development errors, not a product defect. After correction, root typecheck and the combined Form/IPC/renderer gate pass **46/46**.

Each real managed-child fixture closes its full owned process group, asserts ESRCH and removes its temporary install/runtime. Tests use only independently written offline commands and previously reviewed runtime dependencies. No Tinycast implementation or executable official SDK archive was imported. The CodeGraph index did not contain the relevant Raycast modules, so current source/caller inspection was used without rebuilding it.

## Findings and Limits

**Confirmed implementation defects from API self-review: 0 remaining.** This is capability expansion, not a repair claim about provider cleanup. Existing bundled regressions and the current malformed-event, clipboard-denial, owner-replacement and close-with-pending-request checks remain green.

Peer `b7868184` owns the completed gallery correction and unchanged protected paths; its fresh Obsidian comparison is not this session's independently rerun proof. Shared build/stage/index/display reservations were explicitly returned after that publication barrier. No shared build or product screenshot was required or claimed for this API-only checkpoint. The current workspace also contains the separately tested native-selector consumer; it will receive its own build and guarded Desktop proof before that consumer is closed.

Search callbacks/filtering, persisted selections, icons, richer keyboard/popup behavior and remaining Form families still require measured follow-up. Linear automatic cleanup remains unconfirmed; no real account operation or push occurred.

Sanitized temporary evidence:

```text
/tmp/tockteam-form-choices.cDDF8N
```
