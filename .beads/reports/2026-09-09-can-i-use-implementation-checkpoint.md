# Can I Use First Implementation Checkpoint

**Issue:** `tockteam-3l3.4` (open/in progress). **Scope:** Provisional Featured, not verified Recommended.

**Design baseline:** `247daca1`, independently approved for documentation/contract remediation by parent-owned rereview `ef2a646d-9bf0-4a41-b19f-5ac5a3d8780b`. Source/unit implementation was then separately authorized. Neither approval permits candidate execution or runtime admission.

## Commits and Ownership

| Commit | Work |
| --- | --- |
| `039244a0` | Luna Stage 1: finite query grammar/canonicalization, throwing builtin aliases, and Host snapshot callable. |
| `c51b3377` | Luna Stage 2: catalog selection, revision/handle registry, and unavailable workspace seam. |
| `528da900` | Stronger-model parent self-audit: exact identity, failed-transition retirement, agent-keyed details, consolidated errors, and reserved workspace-call denial. |

One serialized native workflow, `114b3ebe-57aa-4383-9e4c-1127315036c7`, ran the two Luna writers. No overlapping writers or extra independent reviewers. Parent took over only after both children completed, inspected all new source/tests, and reran validation. All implementation files are new `src/trusted-raycast-can-i-use-*.ts` modules with five matching root test files. No existing runtime/build/descriptor/profile/Translate/Kaomoji code changed.

## Implemented First-Party Logic

- Exact-target union grammar, CRLF/ASCII whitespace normalization, exact Host-table membership, canonical deduplication/order, finite query/clause/target limits, fixed errors. No generic Browserslist parser.
- `defaults` returns `DATA_UNAVAILABLE`; no fixture was generated or admitted.
- Frozen Host query snapshots, currentness guard, and defensive returned arrays. The exact one-string call can return its snapshot; the reserved `(null, {path: '@workspace-config-v1', env})` shape now always throws `WORKSPACE_UNAVAILABLE`. It cannot reinterpret a query snapshot as workspace configuration.
- `os.homedir()` and default `path.join()` only throw `PATH_UNSUPPORTED`. No real builtin import or lexical/home fallback.
- Host-side synthetic catalog search across all 581 entries, fixed source order, <=64 selected entries before enumerable-table materialization, count disclosure, and rejection of forged selections.
- Detail metadata is keyed by unique browser **agents**, not browser/version targets. Opera Mini and missing-support agents are excluded before bounded selection.
- Current-revision root/detail action storage with <=256 live handles checked before allocation, exact `can-i-use`/`index` identity, one current render ticket, stale-result rejection, and retirement on search/root/detail/error/replacement/close. Invalid transitions/publications also retire the old authority. Repeating a query does not revive old handles.
- Managed workspace selection validation accepts empty default mode, exact `.` root selection, or the approved relative spelling. Every valid nonempty selection stops at `WORKSPACE_UNAVAILABLE`; no reader can be supplied and no filesystem operation is performed.

## Self-Audit Findings and Fixes

Applied all three review references: code simplification, security/hardening, and performance/operability.

1. **Wrong identity accepted:** the initial registry accepted arbitrary extension/command strings, with fixtures incorrectly using command `can-i-use`. Red regression demonstrated a missing rejection. Registry now requires extension `can-i-use`, command `index`.
2. **Failed transition retained authority:** starting an invalid 65-row search left two old root handles usable. Red regression observed live count `2`, expected `0`. Retirement now precedes transition validation. Publication failures also invalidate their ticket; retry requires a fresh revision, while stale completions cannot clear a newer valid projection.
3. **Wrong detail model:** initial code represented browser versions as independent detail rows. A red agent-row regression failed with `DATA_UNAVAILABLE`. Selection/registry now use unique agent keys consistent with upstream `Object.entries(agents)` semantics. Synthetic fixtures do not assert actual pinned support-data parity.
4. **Reserved workspace shape returned query data:** red regression found no exception. Parent explicitly confirmed the correction: syntactically recognize the reserved shape, then fail with `WORKSPACE_UNAVAILABLE` and zero I/O until an anchored workspace capability is separately admitted.
5. **Unnecessary type workaround:** removed the Stage 2 error wrapper that cast new codes into the narrower Stage 1 type; all fixed codes now share one type/module. Removed redundant parsing of already-owned frozen tickets and the production helper that reconstructed authentication from an incoming handle. Authentication context must come independently from the Host session boundary; a unit-test fixture convenience is not a security primitive.

## Fresh Verification

### Red Checks

Both Luna stages first ran a focused test before the module existed and received `ERR_MODULE_NOT_FOUND`, exit 1. Those are scaffold-red evidence, not proof of a security regression.

The parent's substantive red checks were:

```sh
./node_modules/.bin/tsx --test tests/trusted-raycast-can-i-use-actions.test.ts tests/trusted-raycast-can-i-use-catalog.test.ts
```

Result before self-audit fixes: 10 passed / 3 failed, exit 1, covering wrong identity, retained old handles, and detail-agent shape. Strengthened failed-publication checks then failed separately before the retirement fix.

```sh
./node_modules/.bin/tsx --test tests/trusted-raycast-can-i-use-aliases.test.ts
```

Result before workspace-call correction: 5 passed / 1 failed, exit 1 (`Missing expected exception`).

### Green Checks at `528da900`

```sh
./node_modules/.bin/tsx --test tests/trusted-raycast-can-i-use-*.test.ts
./node_modules/.bin/tsx --test --experimental-test-coverage --test-coverage-include='src/trusted-raycast-can-i-use-*.ts' tests/trusted-raycast-can-i-use-*.test.ts
./node_modules/.bin/tsc --noEmit
git show --check --oneline HEAD
```

Results: **29/29 tests passed, none skipped; direct typecheck and diff hygiene passed.** Instrumented coverage reported 97.58% lines, 83.17% branches, 100% functions in the six new source modules. This is not a claim of complete branch coverage: malformed descriptor/snapshot cases and defensive saturation/exception branches remain incompletely covered. No runtime or actual-source parity test ran.

The combined Host-catalog/registry test enumerates at most 64 selected metadata rows before registration, finds an entry beyond the initial first64, records a 128 row-handle peak, and rejects handles from identical-query prior revisions. Separate auxiliary-handle tests reach the 256 ceiling and reject 257 before registration. These test first-party metadata logic, **not execution of the unchanged third-party render function**.

## Still Blocked or Deferred

- No actual `caniuse-lite` data/default fixture, support adapter computation, or dependency module was executed/generated/admitted.
- No actual `caniuse-lite.features` module alias or packed-feature adapter has been wired to the candidate source. The current bounded table contains inert metadata; its support payload and unchanged-source parity remain future gates.
- No native descriptor-anchored walk, configuration-file reader/parser, or production workspace snapshot exists. Workspace mode remains unavailable on every platform.
- No live child-manager integration, runtime module resolver, descriptor, build/profile wiring, renderer/UI, browser effect, or admission change exists.
- The registry rejects stale completions but does not launch/cancel render jobs or implement the live single-in-flight scheduling integration. Host currentness and authenticated IPC still require their separate integration gates; field matching alone is not transport authentication.
- No candidate tar/source load, generic Browserslist evaluation, registry install/fetch, default fixture generation, build, stage, package, Electron/browser launch, native/live effect, or push occurred.
- Translate/Kaomoji source, vendor identities, evidence, and live state were not modified. Kaomoji remains closed; Can I Use remains open.
- Full MIT/CC-BY-4.0 attribution and every shipped notice remain distribution gates. Prior registry/license byte checks remain explicitly external-only.

**Handoff:** coherent source-and-unit checkpoint submitted for parent-owned independent review. No runtime approval or issue completion is claimed. Remain available for reviewer findings and separately authorized gates.
