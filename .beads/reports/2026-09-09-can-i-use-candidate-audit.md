# Can I Use Candidate Audit

**Audit date:** 2026-09-09

**Beads:** `tockteam-3l3.4`

**Scope status:** Raycast **Featured** only, provisionally used as the operational scope; no Raycast-owned evidence establishes a collection named Recommended or equates Recommended with Featured

**Execution status:** Static inspection and deterministic source-archive assembly only; no candidate source, lifecycle script, install script, build script, package CLI, or runtime dependency module was executed

## Admission Decision

**The exact source is pinned for review, but runtime admission is blocked.** The source-controlled file is a byte-preserving, source-only audit archive. It is not a built child, installable extension, approved runtime artifact, or descriptor. It must not be loaded, previewed, executed, staged into a profile, or treated as enabled.

The blocker is substantive: the unchanged command accepts an arbitrary `path`, expands `~` through `os.homedir()`, and calls `browserslist(null, { path, env })`. Browserslist searches that directory and its parents for configuration, reads files, may read custom statistics, and supports `extends browserslist-config-*`, which loads JavaScript from a resolvable package. Passing a project path to the ordinary Node build therefore grants more than read access; a workspace-controlled Browserslist configuration can cause code to execute in the trusted child.

Admission requires a first-party, Session/Workspace-bound configuration snapshot and a filesystem-free Browserslist adapter. Exact source identity does not authorize those future derived bytes, dependencies, or capabilities.

**Independent review of `5da5367f`: BLOCK** (`a337ec36-283b-4a44-b5a8-e6bab70aaf1a`). The original proposed design did not close intermediate-directory races, enumerate query grammar, seal real `os`/`path`, or bound rows before source materialization. [Finite Contract — Revision 2](./2026-09-09-can-i-use-finite-contract.md) now supersedes that proposal and is submitted for parent rereview; it is not implementation or execution approval.

## Exact Source Identity

| Field | Exact Value |
| --- | --- |
| Extension ID | `can-i-use` |
| Manifest command | `index` only (`Search Can I Use`, `mode: view`) |
| Raycast Store record | <https://www.raycast.com/thomaslombart/can-i-use> |
| Upstream repository | `raycast/extensions` |
| Verified upstream commit | `186d955eda64f9e956b25a3fdf5566b1d38f57f2` |
| Commit tree | `8055861cf03f40c8c3375509d88375ae1d2e3c38` |
| GitHub commit verification | Verified signature; GitHub API reason `valid`; committed `2026-04-24T11:43:15Z` |
| Exact extension subtree | Git tree `b5c2b7c999ac0376085487c214820f2938606368` |
| Manifest SHA-256 | `c4fe44311f346dc6b2d42a069826cbe3e6df5ada3f41782b7d4e4a4431012eb4` |
| Source-only audit artifact | `plugins/trusted-raycast/vendor/can-i-use-source.tar` |
| **Source-only artifact SHA-256** | **`cd79b55c49f36836970b56d9f7ecef39f89a4855bb5d20aca5576299edb2837c`** |
| Artifact size | `3,246,080` bytes |
| Artifact format | Deterministic USTAR; fixed upstream commit time `1777030995`; uid/gid `0`; files `0644`; directories `0755` |
| Artifact entries | `19`: `14` regular files and `5` directories; no links, special files, absolute paths, or `..` traversal components |
| Determinism | Two independent assemblies were byte-identical (`cmp` passed) and had the same SHA-256 |

All 14 local source files matched the upstream Git blob SHA-1 and byte size returned by the non-truncated GitHub tree API. Per-file Git and SHA-256 identities are in [`2026-09-09-can-i-use-static-audit.json`](./2026-09-09-can-i-use-static-audit.json).

The artifact deliberately contains only the exact upstream subtree. It contains no transpiled output, dependency tree, TockTeam compatibility code, provenance overlay, generated manifest, or executable runtime. A later built artifact needs a separate deterministic-build identity and a new exact-byte review.

## Source Behavior

The extension defines one view command and six preferences:

| Preference | Type | Default | Static Behavior |
| --- | --- | --- | --- |
| `showReleaseDate` | Checkbox | `true` | Adds release dates to supported and optionally partial browser versions. |
| `showPartialSupport` | Checkbox | `false` | Shows a partial-support version and optional release date. |
| `briefMode` | Checkbox | `false` | Abbreviates standards status and browser-support descriptions. |
| `defaultQuery` | Text | `defaults` | Passed to Browserslist when no project path is configured. |
| `path` | Text | Empty | Passed through `resolvePath()` and then used as the Browserslist discovery path. |
| `environment` | Text | Empty, interpreted as `production` | Selects a named Browserslist configuration environment. |

Static source inspection found:

- a root List over all `caniuse-lite` feature records, with local Raycast List filtering through titles and feature-slug keywords;
- a standards-status text accessory for each feature;
- a green supported or red unsupported icon when Browserslist resolves at least one browser target;
- `Action.Push` to a one-level browser-detail List;
- `Action.OpenInBrowser` to `https://caniuse.com/<feature-slug>` on root and detail rows;
- detail status values `Not supported`, `Support unknown`, `Partial support`, and `Supported` with red, neutral, orange, and green icons;
- English release-date formatting through `Intl.DateTimeFormat("en-US")`;
- exclusion of `op_mini all` from target evaluation and exclusion of Opera Mini from detail rows because the source records no usable data;
- an error caught around Browserslist resolution, logged with `console.error`, after which the feature List still renders without support icons;
- no cached state, local storage, Clipboard, Paste, selected-text, OAuth, credentials, secrets, network client, fetch, WebSocket, shell, child process, native module, updater invocation, write operation, or arbitrary command invocation in extension source.

The pinned `caniuse-lite` package contains 581 feature files. The root source constructs all entries, so TockTeam must search the complete fixed dataset while retaining its existing bounded projection. The detail source iterates the finite pinned agent table and emits no Opera Mini row.

## API, Effect, and Tool Inventory

### Extension APIs

| Source Surface | Exact Use | Required Treatment |
| --- | --- | --- |
| `getPreferenceValues` | Reads the six manifest preferences at module initialization. | Extension-owned, schema-exact preference snapshot. |
| `List` | Root feature search and nested browser search. | Finite searchable List projection only. |
| `List.Item` | Feature and browser rows. | Bounded titles, keywords, accessories, actions, and count. |
| `ActionPanel` | Two root actions and one detail action. | Finite action kinds and authenticated handles only. |
| `Action.Push` | Opens `FeatureDetail` for the selected fixed feature. | Navigation depth exactly `1`; target must be an admitted detail List. |
| `Action.OpenInBrowser` | Opens one Can I Use feature URL. | Main-owned, exact-origin external-open effect. |
| `Icon` | `Checkmark`, `XMarkCircle`, `QuestionMark`, and `List`. | Four finite icon tokens only. |
| `Color` | `Green`, `Red`, and `Orange`. | Three finite color tokens only. |
| `Image.ImageLike` | Type/value carrier for the finite icons above. | No URL, file path, data URL, SVG, or arbitrary image payload. |

### Node and Package APIs

| API | Exact Use | Risk |
| --- | --- | --- |
| `os.homedir()` | Expands any `path` beginning with `~`. | Grants home-directory path knowledge and makes the manifest preference an arbitrary host path. |
| `path.join()` | Joins the home directory with the suffix after `~`. | Lexical joining does not establish containment. |
| `browserslist(query)` | Resolves `defaultQuery`. | Plain queries can select config/statistics/module-loading forms unless constrained. |
| `browserslist(null, { path, env })` | Discovers project configuration relative to a user string. | Reads files and parent directories; can lead to stats reads and `extends` module execution. |
| `caniuse.isSupported()` | Tests a feature against resolved browser/version targets. | Pure data computation only after Browserslist is removed from the child call path. |
| `caniuse.getSupport()` | Derives per-agent support status/version. | Pure computation over the fixed admitted dataset. |
| `caniuse-lite.features`, `feature`, `agents` | Enumerates and unpacks fixed compatibility data. | Must be exact pinned data with bounded projection and license attribution. |
| `Intl.DateTimeFormat` | Formats pinned epoch values. | Locale fixed to `en-US`; no Host effect. |
| `console.error` | Reports Browserslist failure. | Diagnostics must not include workspace paths, query/config contents, or stack traces in evidence. |

### Declared Scripts and CLIs

The manifest declares `ray build`, `ray develop`, `ray lint`, `ray lint --fix`, an `npx @raycast/api@latest publish` command, and a failing `prepublishOnly` guard. None was run. They are development/publishing tools and must not be shipped or exposed to the admitted child.

The lock also resolves the Browserslist CLI and `update-browserslist-db` CLI. The latter statically contains filesystem reads/writes and `execSync` paths for npm, pnpm, Yarn, and Bun. It can inspect and mutate lockfiles and invoke package managers. It is not imported by Browserslist's library entry; it is reachable from Browserslist's CLI only. The CLI, `update-browserslist-db`, `escalade`, and `picocolors` must not enter the future runtime artifact merely because they appear in the declared install closure.

## Workspace Trust-Boundary Finding

The source's `path` is not a finite read capability:

1. `resolvePath()` maps `~...` into the user's home directory and otherwise returns the string unchanged, including absolute paths and traversal.
2. Browserslist checks `BROWSERSLIST`, `BROWSERSLIST_CONFIG`, and other process environment controls before or alongside path behavior.
3. `findConfigFile()` searches the requested directory and each parent for `browserslist`, `.browserslistrc`, and `package.json`.
4. A query using custom statistics can read `browserslist-stats.json`.
5. A query using `extends browserslist-config-*` resolves and `require()`s JavaScript from the project/module search path.
6. Symlinks and a path outside the active workspace are not rejected by the extension.
7. Errors may disclose full paths or query details through ordinary stack/error rendering.

Consequently, simply exposing read-only `fs` or passing an active-workspace path to the unchanged Node Browserslist package is insufficient. Read-only workspace access can become trusted JavaScript execution through `extends`. Setting `BROWSERSLIST_ROOT_PATH` alone is also insufficient: it does not remove environment overrides, custom statistics, module loading, symlink races, or a generic filesystem object from the child.

## Dependency and License Audit

The lock is version 3 and contains 335 package records including the root: 112 non-root production records, 222 dev-only records, and 26 optional records. The lock-declared license counts are:

| SPDX Expression | Records |
| --- | ---: |
| MIT | 287 |
| Apache-2.0 | 19 |
| ISC | 18 |
| BSD-2-Clause | 6 |
| BSD-3-Clause | 1 |
| CC-BY-4.0 | 1 |
| Python-2.0 | 1 |
| `(MIT OR CC0-1.0)` | 1 |

The complete package-path/version/dev/optional/license/integrity/resolved inventory is recorded in the companion JSON. This count is a lock metadata inventory, not a claim that all 334 dependency archives were independently approved.

### Direct Locked Dependencies

| Dependency | Resolved Version | License | Static Decision |
| --- | --- | --- | --- |
| `@raycast/api` | `1.104.1` | MIT | Its 102-record production closure is excluded. The existing finite compatibility API must expose only the APIs listed above. |
| `browserslist` | `4.28.1` | MIT | Ordinary Node build is denied in the child. Future use is limited to a separately reviewed, filesystem-free query evaluator and finite adapter. |
| `caniuse-api` | `3.0.0` | MIT | Require a finite compatibility adapter for only `isSupported` and `getSupport`; do not carry its generic API or implicit Browserslist call path. |
| `caniuse-lite` | `1.0.30001761` | CC-BY-4.0 | Exact static data may be admitted only with the complete license and attribution notice. |

### Non-Raycast Declared Production Closure

The union reachable from Browserslist, `caniuse-api`, and `caniuse-lite` contains 11 exact packages. Their registry tar SHA-512 values matched the lock. Archives were only listed, checked for unsafe paths/entry types, and extracted as inert files for static review; no module or lifecycle code was run.

| Package | Version | Registry Tar SHA-256 | License | Future Treatment |
| --- | --- | --- | --- | --- |
| `baseline-browser-mapping` | `2.9.11` | `f50e29a47036f22f9895de65f75172010d6b886ba4c10059d118529188a178ca` | Apache-2.0 | Safe-evaluator data/code candidate only. |
| `browserslist` | `4.28.1` | `2e3c9b9e665358cd2e9a8f1fa6a0475645ba63251b93c762d3064323a5451dd5` | MIT | Filesystem-free evaluator/adapter only; ordinary Node entry denied in child. |
| `caniuse-api` | `3.0.0` | `b85f2ba18f0ea60eb433d075ff139674201e428d2658e1eaf2bcc63c817d674d` | MIT | Replace with two-function finite adapter if parity tests approve it. |
| `caniuse-lite` | `1.0.30001761` | `dad057386ae3d0178226ca938355312c16e94b6680627ec297ce1b1dcf55e2d1` | CC-BY-4.0 | Exact static dataset candidate. |
| `electron-to-chromium` | `1.5.267` | `a8e9df057647f51b7a731177921184cee326f95108bf1904f4db6e30d3c9f61a` | ISC | Safe-evaluator data candidate only. |
| `escalade` | `3.2.0` | `ba2755afc0e6c6705326711fd218ebe107a527eccbd6485155fde98ed000bee7` | MIT | Exclude with updater/CLI. |
| `lodash.memoize` | `4.1.2` | `bb02b8b3d4372deaaae17caaa0acc5659cb93449c71a067666bf8c6ffa84b6c1` | MIT | Exclude through finite `caniuse-api` adapter. Its source contains a `Function("return this")` global fallback. |
| `lodash.uniq` | `4.5.0` | `0e6cbc31894f7a826c7a3ccd0d119ce24656a244f7c446104c6fcaaab072bf46` | MIT | Exclude through finite `caniuse-api` adapter. |
| `node-releases` | `2.0.27` | `7ba0a43673e36ffb18211bea5dec9a5ba1356e39417d81fa5d7468f78d1b5a85` | MIT | Safe-evaluator data candidate only. |
| `picocolors` | `1.1.1` | `d3aedb2807967b7eb37fd11b03b7e3701e725af79c650d0812ff7213f8f882d9` | ISC | Exclude with updater/CLI. |
| `update-browserslist-db` | `1.2.3` | `6bafda00d4356a4df5d0463b4e4ad45ebc9f438bfede793e218a9f9f7c6844c3` | MIT | Exclude; contains filesystem mutation, subprocess, network-through-package-manager, and package-update authority. |

Exact registry byte sizes, lock integrities, license-file paths, and direct closure memberships are in the companion JSON. Registry/license verification is **external-only evidence** from `/tmp/tockteam-can-i-use-audit`; registry archives and standalone license bytes are not retained in this commit. A clean checkout can verify the source/lock inventory but cannot reproduce those external-byte claims without separately retrieving the exact archives. Revision 2 adds external license-file byte counts/hashes and archive-match attestations; these still are not committed license bytes or distribution approval.

### License Evidence and Obligations

| Component | Evidence and Required Action |
| --- | --- |
| Can I Use extension | Manifest declares MIT. The exact subtree has no license file. The pinned repository root `LICENSE` is MIT, Git blob `be595ac54db717d018cee4500381d46b0e0d085b`, SHA-256 `7f727f8b20cdd0e65f84e70b9cac2fce337dcecee4dc88955eb012ea27f02755`, Copyright © 2021 Raycast. A future runtime artifact must include it and a clear source attribution. |
| `caniuse-lite` | Registry package declares CC-BY-4.0 and includes the full CC-BY-4.0 text. A future artifact and `THIRD_PARTY_NOTICES.md` must preserve the license, identify `caniuse-lite@1.0.30001761` and its repository/source, credit the package's declared author Ben Briggs, retain notices, link the license, and identify any adaptation. Legal/notice review remains an admission gate. |
| Other 10 reviewed registry archives | Each package metadata license matched a standalone license file: Apache-2.0, MIT, or ISC as tabulated. Include only packages that survive closure reduction and preserve their notices. |

No dependency notice changes were made in this static checkpoint because no runtime dependency bytes were admitted.

## Proposed Finite Capability Design

The normative revised proposal is [Finite Contract — Revision 2](./2026-09-09-can-i-use-finite-contract.md). The rejected revision remains available in commit `5da5367f`; do not implement its path-check-then-open flow, broad query selectors, or third Browserslist call shape.

Revision 2 requires:

- an authorized root capability and anchored descriptor walk (`openat`/`O_DIRECTORY|O_NOFOLLOW` or proven equivalent), never reopening validated paths; unsupported platforms remain blocked;
- bounded declarative config parsing with explicit forms/conflicts/environment/byte limits and no arbitrary file, module, statistics, or process-environment access;
- complete grammar for `defaults` or canonical target unions only, exact table membership, deterministic normalization, and no generic runtime Browserslist parser; the immutable default fixture still requires separate generation/approval;
- explicit throwing `os.homedir` and `path.join` aliases, two Browserslist snapshot-call shapes, and two-function `caniuse-api` support computation;
- Host search across the fixed catalog before supplying the <=64-entry `caniuse-lite.features` table to the unchanged source's `.map`, with <=256 total handles and full stale-revision invalidation before materialization;
- authenticated main-owned canonical browser effects, separate exact-byte identities, truthful trusted-child—not OS-sandbox—semantics, and unchanged Translate/Kaomoji isolation;
- external-only registry/license evidence labels and full MIT/CC-BY-4.0 attribution before distribution.

This is a design correction only. No native capability, adapter, query/default fixture, bounded projection, descriptor, or new runtime dependency has been implemented.

## Required Gates Before Any Runtime Admission

1. Obtain independent approval for this exact source archive and design. Self-review is not exact-byte approval.
2. Build a separate deterministic derived runtime artifact only after approval; attest source, dependency, resolution, metadata, and projection identities independently.
3. Prove by bundle/import inspection that candidate-visible code contains no Node Browserslist environment module, real `fs`/`os`/`path`, module resolver, `update-browserslist-db`, `escalade`, `picocolors`, CLI, install script, compiler, package manager, or dynamic code loader. Only the explicit throwing builtin aliases in Revision 2 are permitted; trusted bootstrap authority is not advertised as an OS sandbox.
4. Add red-first tests for absolute/home/traversal/out-of-root paths; descriptor-anchored intermediate/final symlink races and replacement; unsupported-platform refusal; non-regular/hard-linked and oversized files; parent-scan and aggregate-byte ceilings; multiple configs; malformed/duplicate-key package JSON; unsupported environment; and stale/cross-workspace capability identities.
5. Add red-first tests rejecting `extends`, config-file directives, custom/my stats, country stats, unknown query grammar, overlong/high-clause queries, overlarge target arrays, unknown browser/version pairs, environment overrides, and diagnostic leakage.
6. Add parity tests for every admitted finite Browserslist and `caniuse-api` adapter call shape against the exact pinned packages, using inert fixtures only after exact-byte execution approval.
7. Add projection/navigation/action tests for Host search across 581 features before source enumeration, <=64 materialized rows, <=256 peak registered handles (not just final serialized size), fixed disclosure, one-level detail, fixed icon/color/status tokens, invalidation before every revision, stale/tampered handles, exact action order, search/focus, Escape, and both themes.
8. Add browser-effect tests for exact origin/path reconstruction and rejection of tampered slugs, ports, userinfo, query, fragments, schemes, hosts, revisions, sessions, and generations.
9. Preserve complete live Google Translate and Kaomoji install/state/preference/recovery manifests before and after every disposable gate. Keep one globally owned active/preview child.
10. Run an approved disposable manager/child gate with fixture workspaces, denied native/network/process effects, strict teardown, and no live profile mutation.
11. Run the serialized source-Electron visual/security gate only after focused checks and fresh conductor authorization. No packaging or installed smoke is authorized by this audit.
12. Update third-party notices and include every shipped license, especially the Can I Use MIT evidence and `caniuse-lite` CC-BY-4.0 attribution, before packaging review.

## Official UI Evidence

The pinned subtree contains two Raycast-owned 2000×1250 PNGs:

| File | Bytes | SHA-256 | Shown State |
| --- | ---: | --- | --- |
| `metadata/can-i-use-1.png` | 1,333,699 | `c05932633a49816e6359e5bd78eeb514f29c0f3015da9c8c0dcacfcffe4967c0` | Dark feature search for `css grid`, support icons, standards-status accessories, selected row, and the two-action panel. |
| `metadata/can-i-use-2.png` | 1,429,908 | `d59950fca1f3ad50e0086ffd7a8b3ca6377447b163ff5ac57cc67fef9f70dbe2` | Dark browser-detail List for `CSS if() function`, release-date/status text, support icons, and the browser action. |

These official images do not prove light theme, initial unfiltered List, unsupported/invalid Browserslist configuration, empty search, brief mode, partial-support details, preference UI, workspace-path restrictions, loading/error states, focus-visible behavior, reduced motion, or TockTeam's 750×475 geometry. Future evidence must compare only equivalent supported states and record these limitations.

## Static Verification Performed

- Queried GitHub's commit and tree APIs; verified commit signature status, exact root/subtree identity, non-truncated inventory, file modes, byte sizes, and Git blob identities.
- Retrieved each of the 14 exact blobs without cloning, installing, or executing the candidate.
- Assembled two deterministic source-only USTAR archives and proved byte identity.
- Scanned the source archive and all 11 reviewed registry archives for absolute paths, `..` traversal, links, and special entries before inert extraction.
- Matched all 11 registry tar SHA-512 values to the upstream lock and recorded SHA-256 values and license files.
- Inventoried all 335 lock records and their lock-declared licenses; computed direct dependency closures without loading package modules.
- Searched source and inert package text for network, URL, filesystem, environment, module loading, shell/process, update, Clipboard, persistence, and credential effects.
- Verified both official screenshot dimensions, byte sizes, and hashes without launching Raycast or TockTeam.
- Did not build, transpile, install, stage, package, preview, load, or execute the candidate or any dependency module.

## Initial Self-Review at `5da5367f`

The following is historical self-review, subsequently superseded by independent BLOCK findings. It is not an approval of the original design.

Self-review re-opened the artifact, source, lock, Browserslist Node environment, Browserslist browser environment, `caniuse-api` entry, updater entry, license files, official screenshots, and generated JSON. It found and resolved these audit risks before commit:

- separated the pinned source-only audit archive from any future runtime artifact or admission claim;
- elevated `extends browserslist-config-*` from a read concern to trusted code-execution risk;
- rejected relying on `BROWSERSLIST_ROOT_PATH` or read-only `fs` as containment;
- excluded the updater/CLI closure and Lodash global-discovery path from the proposed child rather than treating the full install closure as harmless;
- made the workspace-relative behavior change explicit instead of claiming exact path compatibility;
- bound configuration snapshots and browser actions to Session/Workspace and authenticated generation/revision identities;
- separated lock metadata inventory from independent registry-byte/license verification;
- preserved Featured terminology and did not relabel it Recommended;
- left Kaomoji closed and unchanged.

**Initial self-review verdict:** static checkpoint submitted for independent review, with no runtime approval. That review returned BLOCK as recorded above.

## Revision 2 Self-Audit

Applied the review skill's simplification, security/hardening, and performance/operability references. Re-read the unchanged source imports and enumeration flow, then traced each independent finding into the revised contract. Corrected the race-prone reader proposal, made config-read totals explicit (up to 32 package JSON reads, not one file total), rejected unsupported platforms rather than assuming Node has `openat`, reduced public queries to a fully enumerated grammar, eliminated fake home/path behavior and the unnecessary third Browserslist shape, and specified Host selection before source enumeration/handle allocation.

A Luna scout performed only mechanical external license-byte/hash comparison; it was not a substitute independent reviewer. The parent independently rehashed all 11 tarballs, compared each archived/extracted license byte-for-byte, and rechecked root MIT before recording evidence. Fresh static validation also parsed the source-only USTAR without loading its modules: 14 source-file sizes/Git blobs/SHA-256 values, 19 safe entries, 335 lock records, local report links, JSON fields, and absence of a Can I Use descriptor matched. `git diff --check` and `shasum -a 256 plugins/trusted-raycast/vendor/{google-translate,kaomoji-search,can-i-use-source}.tar` passed with the previously pinned digests. These are static design/evidence corrections, not runtime tests or implemented fixes. Required runtime, parity, platform, UI, license/distribution, and parent rereview gates remain unmet. `tockteam-3l3.4` stays open; Kaomoji remains closed and untouched. No candidate execution, build, stage, Electron, package, live effect, Mole work, or push occurred.
