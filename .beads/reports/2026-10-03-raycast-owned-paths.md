# Owned Extension Files and Save Folders

## Scope and Status

Bead: `tockteam-qwzg.8.2.7`. This is the next narrow `.8.2` leaf after the saved Date checkpoint `9976a5f10815fddda1d1e7b0e695cb7e7bbeefaf`.

Extensions can read their included files from the approved private snapshot and keep their own saved files across closing, reopening, approved updates and rollback. The initial independent source review found one cleanup ownership mistake; its failing-first correction and the retained reviewer's source-only fix gate are complete. Corrected-source worker checks and the parent's independent 20-test pair pass. The full post-peer-build worker recheck also passes with hash-identical artifacts before/after. Final custody and explicit exact-path save approval remain pending. The leaf is not yet closed or saved.

Target: documented macOS Raycast API 2.0.3 behavior, independently implemented against the recorded Tinycast reference. This does not establish full SDK, Store, Desktop, native, provider, installed or release compatibility. All sixteen finite ledger groups and the wider `.8.2`, Forms and `.8.5` scopes remain open.

## Owned Changes

Only these six source/test paths changed before the document update:

```text
/Users/taowang/projects/tockteam/src/user-raycast-install.ts
/Users/taowang/projects/tockteam/src/user-raycast-manager.ts
/Users/taowang/projects/tockteam/src/user-raycast-child.ts
/Users/taowang/projects/tockteam/src/trusted-raycast-compat-api.ts
/Users/taowang/projects/tockteam/tests/user-raycast-install.test.ts
/Users/taowang/projects/tockteam/tests/user-raycast-environment.test.ts
```

- `environment.assetsPath` is an absolute locator inside the copied approved source snapshot. A missing assets directory stays absent; ordinary file reads yield `ENOENT`. The Host does not create assets or edit the snapshot to invent a result.
- `environment.supportPath` is `<installRoot>/state/<validated-extension-ID>.support`, not a command-, version- or digest-named folder. Different extension IDs do not share it. The existing owned-state removal already removes it; removal behavior was not widened.
- Host approval, enabled state, selected ID and the selected snapshot digest are checked before any new support-directory effect. Discovery, approval, snapshot reads and disabled starts do not create it.
- The Host bounds each original/canonical ancestry to 64 components and 4,096 bytes and admits real directories through no-follow directory descriptors. Frozen receipts retain path/device/inode for every original ancestor, accepted macOS `/var` or `/tmp` alias entry and target, and the complete canonical physical chain, including `/private`. Every retained receipt is compared before effects and cleanup; arbitrary ancestor links, final links, dangling links, files and collisions reject.
- A new support directory is created only as the exclusive final component, non-recursively, with mode `0700`. Valid admitted existing directories are user data: reused with their contents, inode and mode unchanged; no marker, chmod, clearing or migration.
- Partial startup cleanup removes only a newly created, receipt-proven, unchanged, still-empty directory. Existing empty directories, newly written files, nonempty directories and replaced ancestor/final/state/root identities remain untouched. If ownership cannot be proven, data is preserved. Normal close preserves even an empty support directory.
- Private startup metadata is copied into the frozen SDK environment before importing the selected command. Later environment-variable changes and ordinary public-property setters do not change it. Missing legacy-provider paths fail explicitly; malformed provider values reject without replacing active compatibility state.
- Raw Cache, typed LocalStorage, their safety snapshot, date values, namespaces and file formats were not changed. Existing legacy bytes remain exact through path use, failed startup, reopen, update and rollback.

These are bounded point-in-time filesystem checks, not atomic `mkdirat`, TOCTOU resistance against trusted same-UID Host code or an OS sandbox. Approved local code still has its existing broad Node authority. Existing-directory permission failures may reject rather than alter user data. No authority was added to the renderer, bridge, account, network or native-effect routes.

## Failing-First Checks

The first synthetic selected-command check reached readiness, then matched the exact extension/session/revision/event outcome. It failed because the SDK paths were absent, with all four production files still byte-identical to the saved baseline:

```sh
node --test --test-name-pattern='selected extension reads approved asset files and writes its own stable save folder' --test-reporter=tap tests/user-raycast-environment.test.ts
```

RED: 1 failed / 0 passed / 0 skipped; outcome `Error: Owned SDK asset and support paths were not supplied`. Captured group 71787 stopped with `ESRCH`. After the minimum implementation the same check passed. Its finished fixture additionally proves real cold reopen, approved version update and rollback: the asset locator changes with each private snapshot, while the support path and saved file remain stable.

The next planned guard check failed before its implementation because the new helper did not yet enforce approval:

```sh
node --test --test-name-pattern='support folders require the approved enabled extension identity' --test-reporter=tap tests/user-raycast-install.test.ts
```

RED: `Missing expected exception.` The guard was added and the same check passed. This intermediate new-feature guard defect is not a released-product finding.

Already implemented filesystem branches were then verified without manufacturing artificial failures: existing data/mode, per-ID isolation, update/rollback/removal, file/link/dangling/ancestor collisions, final/state/root replacement, real partial child startup, missing assets, legacy providers and invalid path values.

## Confirmed Findings

Total confirmed development findings: **2, both fixed before the corrected-source freeze; 0 unresolved current-diff findings**. Neither is a released-product finding. The planned approval-guard RED remains an intermediate test-first defect, not a third finding.

1. **[P2, Fixed] Preserve Empty Folders When an Ancestor Changes.** `src/user-raycast-install.ts` originally retained only the install-root identity, so cleanup deleted a newly created empty support folder after its parent was replaced while root/state/support identities stayed unchanged. This violated the approved conservative preservation rule; it demonstrated neither nonempty-file deletion nor an atomic/TOCTOU or sandbox exploit. The fix retains and compares every bounded original/canonical ancestor receipt, including the accepted system alias and `/private`. Verification: the owned regression failed first with expected `true` / actual `false`, then passed; the parent's exact unchanged probe independently went RED to GREEN. Retained reviewer `98c86340` found the original finding fully fixed and zero new findings, source-only.
2. **[P2, Fixed] Preserve the Protected Bundle's External Imports.** The initial utility import in `src/trusted-raycast-compat-api.ts` added `node:path` to the derived pinned Can I Use bundle's external imports. Five existing checks failed on that same root cause before any probe child started. The fix removes the import and validates the documented macOS absolute-POSIX-path contract locally. The protected import assertion, pinned source, dependency and build allowlists were not weakened. Verification: the existing minimized test failed first and then passed; all five original cases and the complete focused regression set subsequently passed.

```sh
node --test --test-name-pattern='production reconciler \(environment rejection\)' --test-reporter=tap tests/trusted-raycast-can-i-use-source.test.ts
```

Source self-review applied all three mandatory review references: simplification, security/hardening and performance. The directory receipt keeps the ownership rule local to the existing install layer; no speculative service, dependency or agent loop was added. An additional approval digest read and bounded directory checks occur at explicit startup, not renderer/action hot paths. No performance improvement or unchanged-latency claim is made.

## Final Worker Verification

- Owned ancestor-replacement regression: **1 RED, then 1 GREEN; no skips**. Corrected focused install/environment: **20 passed / 0 failed / 0 skipped**.
- Final post-peer-build SDK regressions: **226 passed / 0 failed / 3 optional skips**, 229 total. Gate roots 8974 and 9533 and all 218 final run-specific fixture groups stopped with `ESRCH`; no cleanup signals were needed. Exact gate request/completion timestamps and before/after hashes for the 17 peer artifact-receipt paths are recorded; all artifact bytes and six SDK source/test hashes stayed identical.
- `pnpm run typecheck`: exit 0. `git diff --check`: passed. Six source/test hashes stayed unchanged throughout these gates.
- React Doctor 0.9.14: two complete isolated API/child scans; same five pre-existing semantic candidates (four error-level, one warning-level), exact source match, no score. The ancestry fix does not change either scanned file; the prior Doctor proof is reused only for those identical bytes. The tool was not updated; no supply-chain scan, score API, global disables or package installation.
- Worker fixture groups: **1,252** independently rechecked with `ESRCH` (original 782, corrected focused 34, corrected pre-refresh regression 218, final artifact-stable regression 218). Doctor's two groups (76527 and 76625) remain separate; parent and historical storage/Date groups are not aggregated.
- Initial pre-document custody remained on the Date checkpoint with an empty index, exactly six owned dirty paths and 2,481 other baseline records unchanged. Current custody must separately attribute the concurrent TockTutor peer's explicitly owned source/test/generated/gallery changes, never overwrite them or claim all old baseline records remain unchanged.

### Independent Review and Parent Checks

Initial reviewer `4945ad01` reported one current P2 ancestry finding. The retained same-role fix review `98c86340` read the corrected pair and exact immutable interim diff and found that finding fully addressed, with zero new findings. It executed no tests or modules; source/hash/cleanup execution attribution remains with the owners.

The parent's old-source 19-test pair was green but did not cover the newly found ancestor replacement; it was not substituted for corrected verification. The parent's exact unchanged filesystem probe independently failed on old source and passed on corrected source (**1/1, no skips**). Its corrected-source install/environment pair separately passed **20/20, no skips**, with root group 4244 and 34 fixture groups stopped; all six source/test hashes matched before/after. These are source/data checks, not global build, Desktop, installed or release acceptance.

### Shared Artifact Coordination

The TockTutor peer disclosed that its nested test wrapper implicitly rebuilt root and workbench artifacts before obtaining a writer window. Those artifacts are peer-owned, not changes to undo. The peer's exact receipt records root build output at 00:00:55 UTC and nested completion at 00:03:45. The earlier corrected worker gate completed at 00:05:15 but did not record its exact spawn-request time or pre-artifact hashes; no overlap or stable-artifact acceptance is inferred from that clock. After the authorized writer returned, the entire 229-test command and typecheck were rerun with explicit request/completion timestamps and before/after hashes for all 17 paths in the peer's artifact receipt. They pass with every artifact byte unchanged. The earlier gate remains historical source-quality evidence, not the final artifact-stable proof. Parent focused20 already ran and stopped before the authorized TockTutor build/capture window; it is separately attributed. The peer's UI evidence, generated outputs and process counts are not SDK acceptance.

Exact final regression command:

```sh
node --test --test-concurrency=4 --test-reporter=tap tests/user-raycast-launch.test.ts tests/user-raycast-environment.test.ts tests/user-raycast-install.test.ts tests/user-raycast-local-storage.test.ts tests/user-raycast-storage.test.ts tests/user-raycast-cache.test.ts tests/user-raycast-view-data.test.ts tests/user-raycast-runtime.test.ts tests/user-raycast-reconciliation.test.ts tests/user-raycast-form*.test.ts tests/user-raycast-oauth-runtime.test.ts tests/trusted-raycast-can-i-use-preference-form.test.ts tests/trusted-raycast-kaomoji-runtime.test.ts tests/trusted-raycast-manager.test.ts tests/trusted-raycast-cached-state.test.ts tests/trusted-raycast-effect-callback.test.ts tests/trusted-raycast-can-i-use-source.test.ts tests/trusted-raycast-can-i-use-source-detail.test.ts
pnpm run typecheck
git diff --check
```

The three optional artifact-dependent skips are not accepted proof: reviewed Kaomoji search projection, real Google integration and real isolated preview boot remain unverified by this run. Intermediate results are retained, including the 220-pass / 5-fail / 3-skip dependency-footprint run; only the later final green is the finished worker claim.

No real third-party command, account, credentials, Keychain, OS input, sensitive native effect, active Electron/browser or user profile takeover was used for the new fixtures. Existing approved finite regression fixtures retain their own prior authority. These were Node/source/data checks, not browser-visible UI or installed verification; no screenshot or Desktop claim is supplied.

## Evidence

```text
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/source-frozen.json
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/review-source-diff.patch
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/focused-reviewed-green.log
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/regressions-reviewed-green.log
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/typecheck-reviewed-green.log
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/doctor-comparison.json
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/owned-files-red.log
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/support-approval-red.log
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/bundle-dependency-red.log
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/ancestor-identity-red.log
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/ancestor-identity-green.log
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/ancestor-fix-focused-green.log
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/ancestor-final-gates.json
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/ancestor-final-regressions.log
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/ancestor-final-typecheck.log
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/post-peer-stable-gates.json
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/post-peer-stable-regressions.log
/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/tockteam-owned-paths-dVHwRs/post-peer-stable-typecheck.log
/tmp/tockteam-conductor-paths-review.Vfnqkn/final-focused/proof.json
/Users/taowang/.pi/agent/sessions/--Users-taowang-projects-tockteam--/subagent-artifacts/outputs/851541d7-1f65-4744-912d-b8afcabe0dcf/conductor/owned-paths-ancestor-fix-review.md
/tmp/tocktutor-property-accessories.nO92XG/implicit-build-receipt.json
```

No push. Fresh independent review and an explicitly authorized exact eight-path checkpoint are the next gates; only this leaf may close after post-save confirmation.
