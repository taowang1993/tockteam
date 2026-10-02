# Owned Picker Search Callback Checkpoint

This is the API/transport part of `tockteam-qwzg.8.3.5.1`, not completion of `.8.3.5`, Forms or the full compatibility target.

The independently written first-party check failed before implementation with `Extension event is stale or busy`. The existing private field request/acknowledgement path now supports Dropdown search callbacks without changing selected/submitted values or advancing the unrelated List search epoch. Search requests require exact session/revision/field/request ownership and bounded string values; only declared Dropdown callbacks are eligible. TagPicker's SDK2.0.3 declaration has no remote search callback/filtering interface; its name filtering stays renderer-local. Dropdown filtering defaults off with a callback and on without one; explicit filtering and section-order flags are projected. Keyword arrays are validated and serialized as bounded inert JSON strings, not a broader array/function/HTML capability.

## Verification

```sh
node --test --test-name-pattern='dropdown search requests' --test-reporter=tap tests/user-raycast-form-editing.test.ts
node --test --test-concurrency=1 --test-reporter=tap tests/user-raycast-form-editing.test.ts tests/user-raycast-form-ipc.test.ts
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast*.test.ts tests/trusted-raycast*.test.ts tests/launcher-ipc.test.ts tests/launcher-preload-bridge.test.ts tests/launcher-window*.test.ts
pnpm run typecheck
```

The first check changed RED to GREEN; API/IPC checks passed **23/23**, including non-dropdown/no-handler denial, owner/session/revision/type/size failures, awaited custom callback, exact submitted values, Clipboard denial without action authority, pending-close rejection and process-group teardown. Existing combined Raycast/launcher checks passed **434 with 6 optional skips**, including the separately pending renderer changes. Every fixture runtime was built under `/tmp`; the tests stop and ESRCH-check their own child groups. No third-party command, account, native effect, root build/stage/display or protected/gallery mutation was authorized or performed by this checkpoint.

The SDK source of truth is the existing pinned `@raycast/api` 2.0.3 declaration: DropdownProps/SearchBarInterface/DropdownItemProps and TagPickerProps/TagPickerItemProps. No Tinycast implementation or new dependency was imported. Native search controls/filtering, throttling/loading, selection/draft/focus/IME/keyboard proof and allowlisted screenshots remain part of the following renderer checkpoint. Persistence, item icons, ranked section parity, late-loaded/custom-wrapped automatic defaults and OS-native popup keyboard parity are still open. Shared TockTutor source work remains owned by the peer.
