# Can I Use Finite Contract — Revision 2

**Status:** Proposed static design for parent rereview; not implemented or approved for execution.

**Issue:** `tockteam-3l3.4`. **Scope:** Provisional Featured, not verified Recommended.

This revision responds to independent review `a337ec36-283b-4a44-b5a8-e6bab70aaf1a` (BLOCK on `5da5367f`). It supersedes that checkpoint's proposed capability design, not its source identities or runtime prohibition. The unchanged upstream command remains pinned to commit `186d955eda64f9e956b25a3fdf5566b1d38f57f2`, subtree `b5c2b7c999ac0376085487c214820f2938606368`, command `index`. Source-only archive SHA-256 remains `cd79b55c49f36836970b56d9f7ecef39f89a4855bb5d20aca5576299edb2837c`.

## Authority and Threat Model

- Assets: host files, home-directory privacy, active Session/Workspace identity, trusted process authority, existing Translate/Kaomoji state, and authenticated action handles.
- Untrusted inputs: workspace directory entries/config bytes, managed preferences, search input, child messages, and stale/tampered action identities.
- Trusted inputs after separate future approval: exact derived aliases, immutable compatibility data, Host snapshot producer, and finite projection validator. A child process is **not an OS sandbox**; these are reviewed-code/import/protocol restrictions, not a claim that malicious arbitrary Node code is confined.
- Abuse cases: swap an intermediate directory for a symlink after validation; supply `extends browserslist-config-evil`; use an environment override to read home files; force 1,162 root handles before filtering; replay an action after a search/workspace change; disguise an external URL as an admitted feature.
- Main alone resolves Session/Workspace authority and performs permitted reads/effects. No generic path/read/module/evaluation RPC is introduced. Renderer remains sandboxed with context isolation and disabled Node integration.
- There remain exactly two admitted descriptors: Translate and Kaomoji. No Can I Use descriptor, runtime identity, live install, or candidate execution is authorized by this document.

## 1. Workspace Snapshot and Anchored Reads

### Selection and Identity

Keep the six upstream preference fields. `path` is a managed selection, **not** an OS path passed to the child:

- Empty string selects `defaultQuery` mode, with no workspace file probes.
- The exact string `.` selects the active workspace root as a special managed value; it is never passed as a lookup component.
- Otherwise accept 1–31 slash-separated relative components, at most 1,024 UTF-8 bytes total and 255 bytes per component. Each component is ASCII `[A-Za-z0-9_-][A-Za-z0-9._-]*`; reject `.`/`..`, trailing dot, case-insensitive Windows device basenames (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, including extensions), backslash, colon, percent escapes, control bytes, Unicode, empty components, and leading/trailing slash. Never decode or normalize a rejected value into an accepted one.
- Thus `/absolute`, `C:/x`, UNC/device paths, `~`, `~/x`, `a/../b`, `a//b`, `./a`, and percent-encoded traversal all fail before I/O. Restricting spaces/Unicode directory names is an explicit v1 compatibility limitation.
- Main obtains an already-authorized workspace-root directory capability from the active Session/Workspace owner. A root pathname supplied by the extension or renderer is not acceptable. Bind the snapshot to extension ID, command, session, workspace/root capability identity, preference revision, generation, and a fresh nonce.
- Child receives only a fixed non-path token `@workspace-config-v1`, the validated environment, and canonical target/error snapshot. It never receives the workspace-relative selection or host root/home path.
- Session/Workspace change, preference save, root capability revocation, child replacement, or close invalidates the snapshot and all actions. Files are read once per new snapshot, not watched or reread on every query/search. Managed UI must identify snapshot semantics; reopening explicitly refreshes configuration.

### Directory and File Operations

The required primitive is a **descriptor-anchored walk**, not `realpath`/`lstat` followed by `open(path)`:

1. Starting from the authorized root descriptor, open each allowed relative component with `openat(parentFd, component, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)` or an independently proven equivalent. Hold the descriptor stack through discovery. Never reopen a validated absolute/relative pathname.
2. Reject symlink/reparse indirection, non-directories, and device/volume transitions. Probe candidates relative to the already-open descriptor for that level. Search parents only by using the saved stack in reverse; never resolve `..` or follow a parent pathname. At most 32 directories including root, and 96 fixed candidate-name probes.
3. At each level the only names are `browserslist`, `.browserslistrc`, and `package.json`. Inspect entry types without following links. Any link, special file, denied access, inconsistent identity, or other non-absence error fails the whole snapshot. Only `ENOENT` means absent.
4. Open an eligible candidate relative to its directory descriptor with `O_RDONLY | O_NOFOLLOW | O_CLOEXEC | O_NONBLOCK` (or equivalent); `fstat` must prove regular file, same permitted device, link count `1`, and bounded size before reading. Nonblocking open prevents a raced FIFO from hanging before the regular-file check. No symlink fallback when a platform lacks these guarantees.
5. Read through that same descriptor, at most byte limit + 1; reject overflow/invalid UTF-8. Compare identity, size, modification/change times before/after reading, reject detected mutation, close every owned descriptor in `finally`. Parsing remains untrusted even when metadata is stable; stat comparisons do not prove content immutability.
6. Path renames cannot redirect an open directory capability to a replacement directory. The capability identifies the originally authorized directory object, not a promise that its display pathname never changes. If policy requires live pathname containment under concurrent directory moves, a platform must additionally prove that stronger property or keep workspace mode disabled. No blanket containment claim for bind mounts, hostile privileged mount changes, or arbitrary same-account code.

The existing `readBoundedRegularFile(path, ...)` and final-component `O_NOFOLLOW` are **not** equivalent to this primitive. Node's path-based file API is not an `openat` implementation. No qualifying existing Host capability has been proven in this checkpoint. Therefore workspace mode remains blocked on every platform until the capability implementation and race tests are independently approved. Do not add a shell helper or native binary without separate design/byte approval, and never fall back to path-based reads. Default-query mode does not grant workspace authority.

### Bounded Discovery and Inert Configuration

- At each level, inspect all three fixed candidate names. Read/parse `package.json` if present to determine whether its top-level `browserslist` field exists; a package without that field does not stop upward search or conflict with a text config. A misspelled `browserlist` field without `browserslist` fails closed.
- A present but malformed package JSON fails, even beside a text config. More than one present configuration form at a level fails; one valid form stops discovery. Neither form means move to the previous saved descriptor. This may read up to 32 package files, **not** the earlier claim of only one file in total.
- Per-file limits: package JSON 1 MiB; selected text config 64 KiB. Total bytes read <=34 MiB including sentinel reads; one selected configuration payload only. At most one in-flight snapshot per owned child; cancel stale requests, no unbounded queue, no automatic retries. Require bounded cancellable I/O off Electron's UI event loop; unsupported/non-cancellable filesystem behavior fails closed before admission.
- Package JSON is inert strict UTF-8 JSON: no BOM, comments, duplicate keys, prototype-key merging, executable getters, evaluation, imports, or JSON5. Proposed parser bounds: depth <=32, total members/elements <=16,384, individual string <=65,536 bytes. Unknown package fields may be parsed under these bounds but are never returned to the child or interpreted.
- The `browserslist` field accepts only a query string, non-empty array of 1–64 query strings, or an environment object with <=16 unique environment keys and query-string/array values. Reject null, numbers, booleans, nested environment objects, and keys `__proto__`, `prototype`, `constructor`. No inheritance-based lookup.
- Environment names are case-sensitive `[A-Za-z0-9_-]{1,64}`. Empty preference means `production`. Select the exact requested section, otherwise its own `defaults` section; if neither exists, return `CONFIG_ENV_MISSING`. Never read `NODE_ENV`, `BROWSERSLIST_ENV`, or any `BROWSERSLIST_*` variable.
- Text config is ASCII except LF and CRLF line endings; reject BOM, bare CR, NUL, other controls, Unicode, and lines >4,096 bytes. Blank lines and lines whose first non-space/tab character is `#` are ignored. Inline comments are rejected. Before any named section, queries form `defaults`; a section header occupies a complete trimmed line `[environment]`. At most 16 sections; reject duplicate headers and mixed implicit/explicit `defaults`. Each selected section must be non-empty and satisfy the grammar below; validate unselected section shapes/grammar too, but do not evaluate them.
- Selected normalized query across any accepted form <=4,096 bytes, <=64 target clauses. All query strings across a config <=16 KiB; array entries cannot be empty. Validate every environment value against the same query grammar before selection, including unselected package-object sections. No configuration found means fixed `defaults`. Invalid/unsupported configuration means a bounded error, **not** silent fallback to a successful default result.
- Never read JS configs, modules, stats, lockfiles, environment, source files, or an arbitrary filename. Files with unsupported names are not discovered; unsupported forms in an admitted file fail closed.

## 2. Complete Query Grammar v1

Deliberately support **only** the literal `defaults` or an ordered union of exact canonical browser/version pairs. Country, popularity, date, ranges-as-queries, exclusion, aliases, and other advanced selectors are not public grammar in v1. This is a compatibility restriction requiring approval, not full Browserslist parity.

After normalizing CRLF to LF and trimming outer ASCII spaces/tabs/LF, use this grammar (quoted strings are literal and case-sensitive):

```text
Query         = "defaults" | Target (Separator Target)*
Target        = Browser HSpace Version
Browser       = Lower (Lower | Digit | "_")*
Version       = Number ("-" Number)? | "all" | "TP"
Number        = Integer ("." Digit{1,3})?
Integer       = "0" | Nonzero Digit{0,3}
Separator     = HSpace? ("," HSpace? | LF HSpace?)
HSpace        = (Space | Tab)+
Lower         = "a" ... "z"
Digit         = "0" ... "9"
Nonzero       = "1" ... "9"
```

Additional rules are mandatory, not parser discretion:

- Input ASCII only with Space/Tab/LF as above; bare CR, Unicode normalization, nonbreaking space, zero-width characters, controls, semicolon, slash, colon, percent, quotes, parentheses, `#`, backslash, and BOM fail. Comments exist only as whole lines in the text-config layer, never inside a query/default preference.
- Reject blank clauses, repeated/trailing separators, and leading separators. Normalize each accepted target to one ASCII space between browser/version. Preserve version spelling exactly; `120`, `120.0`, and `0120` are not interchangeable.
- Browser name must be an exact canonical key in the pinned caniuse-lite agent table; no `ff`, `fx`, `ios`, `Chrome`, Node, Electron, or user-defined aliases. Version token and **pair** must exactly exist in that browser's pinned table. A hyphenated version is one literal data bucket, not a user range to expand: e.g. `ios_saf 15.2-15.3` only if that exact bucket exists. Whitespace around a hyphen is invalid. `all` and uppercase `TP` are accepted only for exact table pairs. No nearest-version/future-version guessing or fallback.
- Reject `defaults` combined with any other clause. Reject every form not enumerated above, including `extends`, `browserslist config`, `supports`, `my stats`, regional stats, `> 1%`, `last 2 versions`, `not dead`, `and`, `or`, `since`, and module/config directives.
- An array/section is combined as target clauses; the sole non-empty string may be `defaults`. Enforce <=64 clauses before deduplication. Canonical results deduplicate and sort by ASCII byte order of the full `browser version` string, never locale/numeric sort. Target order does not affect the source's all-target support boolean.
- Every returned target <=64 ASCII bytes. Result <=256 targets; overflow is an error, never truncation. The unchanged source removes `op_mini all`; the finite `caniuse-api` receives only the remaining exact canonical snapshot array.

### Defaults Without a Runtime Parser

`defaults` selects a separately reviewed immutable target fixture bound to the exact Browserslist/caniuse-lite dependency digests and a fixed evaluation epoch `1777030995000` (the source commit timestamp). Its intended oracle is pinned Browserslist's built-in default list `['> 0.5%', 'last 2 versions', 'Firefox ESR', 'not dead']`, resolved with the reviewed browser-safe environment and fixed clock in a later explicitly authorized fixture-generation gate. **This checkpoint has not generated or approved that fixture.**

The fixture must contain only admitted table pairs, <=256 entries, canonical order, and an independent digest. Fixture absence/mismatch disables `defaults`; no runtime fallback and no ambient clock-driven updates. The public union grammar never accepts the oracle's internal advanced selectors. New data/defaults require new identities and review. Managed UI must disclose pinned snapshot semantics rather than implying current live compatibility data.

Main parses the finite union itself and resolves by exact membership in inert data. It does not call generic Browserslist with raw, sanitized, or reconstructed untrusted query text. The child `browserslist` alias returns the resulting canonical target snapshot; it never parses workspace config or delegates strings to the real library. No need for a general browser-safe query evaluator in the runtime closure.

## 3. Exact Alias Surface

Alias resolution is extension-specific and fail-closed: resolve only the reviewed source imports. Reject unlisted deep imports and alternate spellings, including `node:os`, `node:path`, and absolute module paths. Build metadata must attest both module resolution and emitted bytes. Do not grant generic Node built-ins through an allowlist miss.

| Module | Allowed Surface | Contract |
| --- | --- | --- |
| `@raycast/api` | APIs listed in the candidate audit | Existing finite UI compatibility, authenticated navigation/actions, six exact managed preferences; no generic Raycast API. |
| `os` | Named `homedir()` only | Always throws fixed `PATH_UNSUPPORTED`, without consulting environment/OS. Normal valid snapshots never call it. No real home or fake home fallback. |
| `path` | Default export containing only `join()` | Always throws fixed `PATH_UNSUPPORTED`; no lexical normalization or filesystem access. This seals the unused `~` branch rather than reimplementing path semantics. |
| `browserslist` | Default callable only | Accept exactly one string equal to current valid `defaultQuery` snapshot, or exactly `(null, {path: '@workspace-config-v1', env: snapshotEnvironment})` with no extra keys. Return a copy of canonical targets or throw fixed snapshot error. Wrong argument count/options/stale snapshot fails. No array-call third shape is needed because the two-function `caniuse-api` alias does not call Browserslist. |
| `caniuse-api` | `isSupported(slug, targets)`, `getSupport(slug)` only | Fixed pinned support-data computation; exact current admitted feature and canonical post-Opera-Mini snapshot array only; no query interpretation, Lodash, dynamic lookup, imports, or other exports. |
| `caniuse-lite` | Named `features`, `feature`, `agents` only | Host-bounded enumerable tables as below, private exact data lookups, no generic package API or directory access. Type-only imports are erased. |

No child may expose `fs`, actual `os`/`path`, `process.env`, dynamic require/import, module resolution, updater, CLI, shell, network client, package manager, Clipboard/Paste/selected-text, OAuth/credentials/keychain, persistence, elevation, generic commands, or Web/TUI authority through these aliases. The trusted runtime bootstrap's own Node authority must remain distinct from candidate-visible APIs; bundle absence alone is not an OS sandbox guarantee.

Permitted diagnostic codes are exactly `PATH_UNSUPPORTED`, `WORKSPACE_UNAVAILABLE`, `CONFIG_INVALID`, `CONFIG_UNSUPPORTED`, `CONFIG_ENV_MISSING`, `QUERY_UNSUPPORTED`, `LIMIT_EXCEEDED`, `DATA_UNAVAILABLE`, `SNAPSHOT_STALE`, `RENDER_INVALID`, and `ACTION_DENIED`. Unknown/internal errors map to the appropriate fixed failure and discard original error arguments; diagnostics contain no user strings or stack. Invalid preferences or missing root capability reject startup; later snapshot-config failure may use the source's empty-browser catch path with a managed failure notice, never successful support status.

Preference validation occurs before module initialization. Valid default mode passes `path: ''`; workspace mode passes only the exact nonempty virtual token, so unchanged `resolvePath()` returns it without invoking built-ins. Tests must also deliberately inject `~` to prove the throwing `os` alias, and `/absolute`/traversal to prove Browserslist rejects unmatched options even if `resolvePath()` returns its argument unchanged. Invalid raw preferences never become a successful sanitized selection. Diagnostic compatibility swallows source `console.error` arguments and emits only a fixed permitted code, never the caught error, stack, path, config/query text, or source item content.

## 4. Bound Before Materialization

Renderer-side truncation is too late. No render may construct 581 feature rows or allocate their 1,162 root actions first.

1. After separate data-byte approval, main owns an immutable inert catalog of all 581 feature slugs, titles, and original source enumeration indexes. Search is performed over that catalog **before** supplying any feature table to the child. No candidate module runs in main to produce it at runtime.
2. Search input: <=256 Unicode scalar values and <=1,024 UTF-8 bytes, no controls or unpaired surrogates; trim/collapse ASCII spaces, ASCII-fold A–Z only, preserve other code points. Split into <=32 space-delimited tokens. Match every token as a literal substring of the folded title or slug, no regex/eval/fuzzy module. Empty query matches all. Preserve original pinned source enumeration order, take first 64; disclose `visibleCount`/`matchCount`/`totalCount`. The finite List adapter uses this selected order without a second child/renderer filter or ranker. This finite search definition and truncation are explicit compatibility differences from Raycast's undisclosed ranking.
3. The package-root `caniuse-lite.features` export used by unchanged `Object.entries(features).map(...)` exposes **only that Host-selected <=64 table**. Any admitted internal `caniuse-lite/data/features` alias must expose the same bounded table, never the full 581-entry module. Do not grant generic subpath imports; the source itself imports the package root. Private support-data lookup stays separate from the enumerable UI table.
4. Before each root render, the first-party alias atomically replaces the bounded table contents for the authenticated revision while no source render is in flight. `feature(packedFeature)` accepts only the current table's exact fixed records. Host validates row count, membership, order, title, and action identities against its own selected slug vector. Candidate output cannot widen the vector.
5. Detail navigation accepts one current root action, selecting one fixed feature and depth `1`. Host likewise selects the finite agent table before `Object.entries(agents).map(...)`, excluding Opera Mini and missing-support entries; max64 rows. Root tables/handles are released, not retained alongside detail handles. Store only bounded navigation state (selected slug and root query) and recompute a new root revision on pop. Do not eagerly execute 64 detail components while collecting root actions.
6. For every search, navigation, pop, theme/preference refresh that emits a projection, error, or close, invalidate **all** current handles before new materialization. One owned in-flight render, one pending latest search; drop superseded results by nonce/generation/revision. Pending/faulted states accept no action. No old/new handle-map overlap; release stale row and callback references.
7. Validate a bounded projection completely before publishing it and binding handles. Root <=64 rows ×2 actions =128 row actions; detail <=64 ×1 =64. All navigation/preferences/other admitted UI handles count toward the existing absolute 256 limit. Reject over-budget allocation *before* registration. Handles bind extension, command, session/workspace snapshot, generation, revision, depth, row/feature, and action kind.
8. Freeze accepted projection data; renderer cannot supply a new URL/slug/callback at invocation. Authentication must match the published revision; search messages alone never create browser effects. Old root/detail handles stay invalid after returning to an identical query.

Preserve the exact source UI semantics within these bounds: root `Show Details` then `Open in Browser`, one-level detail, finite icons/colors/tooltips/status strings, native accessible actions, keyboard/focus layering, both themes, and no arbitrary HTML/Markdown/React props/assets. A broad React-component or generic event/RPC API is not needed.

## 5. External Browser Effect

Main reconstructs `https://caniuse.com/<slug>` from the fixed current handle. Require the exact pinned slug set and one ASCII path segment; HTTPS, exact lowercase host, default port, no userinfo/query/fragment. Authenticate user activation and all snapshot/generation/revision fields, then use the existing main-owned open effect. Never accept a child-selected URL on invocation and never fetch from the child/renderer. Return bounded effect status only; no effect or ranking credit on denial/failure/cancellation.

## 6. License, Evidence, and Admission Gates

The immutable source archive is local non-distributed audit evidence only. No broader repository/package glob may ship it accidentally. Before any distribution, include the pinned Raycast MIT text/source attribution outside the unchanged source archive, full `caniuse-lite` CC-BY-4.0 attribution/license/source/change notices, and notices for every surviving dependency. Package author metadata alone may not identify every data contributor; independently validate original Can I Use data attribution before approval.

Registry tar/license verification in the companion JSON is **external-only evidence** from `/tmp/tockteam-can-i-use-audit`, not reproducible from this commit alone. Package metadata, hashes, integrity strings, and license-file paths do not substitute for committed license/archive bytes. Re-retrieve and match exact bytes in a separately authorized evidence step, or preserve approved detached bytes before claiming clean-checkout reproducibility. No new package retrieval or dependency execution is part of revision 2.

## Rereview and Future Verification Matrix

These are required future red-first checks, **not tests run in this checkpoint**:

| Boundary | Required Proof Before Admission |
| --- | --- |
| Root authority | No caller path can mint a workspace capability; missing capability/platform primitive rejects without fallback. Stale session/workspace/preferences/nonce rejected. |
| Anchored reads | Deterministic intermediate/final symlink-swap barriers; parent rename/replacement; root revocation; mount/device transitions; hard links, FIFOs/devices/sockets; access errors; byte overrun and read mutation; closure of every descriptor. No reopened path or resolved `..`. |
| Config | 32-directory/96-probe/34-MiB ceilings; package without field continues; same-level conflicts; malformed/duplicate-key/deep JSON; valid/missing/duplicate env; no env injection; invalid UTF-8/BOM/Unicode/bare-CR/inline comments; no stats/JS/module discovery. |
| Grammar | Positive exact pairs/union/whitespace/CRLF and literal default; every unlisted selector, aliases/case errors, unknown/future versions, numeric spellings, expanded ranges, duplicate/trailing separator, Unicode, injection, >64 clauses, >4,096 bytes rejected before any general parser. Canonical sort/dedup and Opera Mini behavior. |
| Default fixture | Separate exact dependency and execution approval; fixed-clock oracle and independent fixture digest; <=256 canonical pairs; absent/mismatched fixture blocks. No real Node Browserslist/config path even for the oracle; no untrusted text enters it. |
| Aliases | Exact/default/namespace/deep import resolution; real `os`/`path` absent; `~`, absolute, traversal injected directly and via preferences; wrong options/call count; no third Browserslist shape; fixed diagnostics without leaked arguments. |
| Source parity | Unchanged source bytes; finite support adapter oracle parity for every admitted pair/support state after exact-byte approval. No promise that denied configs/query/search/path behavior matches Raycast. |
| Pre-materialization | Instrument upstream `Object.entries(features)` to observe <=64 on initial/each search; record row construction and handle-registration peaks (not just serialized length). Host finds matches beyond first64 of all581. No eagerly executed hidden details; <=256 live handles; stale action invalidation on every transition, failed render, and delayed response. |
| URLs and lifecycle | Tampered handles, foreign slugs/URLs, cross-session/revision replay denied; effects main-owned; one global active/preview child; unchanged Translate/Kaomoji manifests; authenticated teardown and no process/temp residue. |
| UI and notices | Both themes at fixed geometry, count disclosure, config/search limitations, keyboard/accessibility/focus, licensed-source attribution and every shipped notice. Serialized Electron/packaging only with fresh parent authority. |

**Static self-audit scope:** correctness/boundary reasoning, simplification, security, and performance/operability references applied. The design removes general runtime query parsing, fake home/path semantics, and the unnecessary third Browserslist call shape; it moves filtering before source enumeration and makes file-read totals truthful. No tests, native capability, default fixture, parity, UI, or runtime approval are claimed. Parent rereview and every execution gate remain required.
