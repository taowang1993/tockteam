# Kaomoji Search Candidate Audit

**Audit date:** 2026-09-08  
**Beads:** `tockteam-3l3.3`  
**Scope status:** Raycast **Featured** interpreted provisionally as the user's “recommended” scope; never relabeled Recommended  
**Execution status:** Static inspection and deterministic archive assembly only; no extension module, lifecycle script, install script, child, preview, or live profile was loaded or executed

## Admission Decision

**Exact source-controlled bytes approved; runtime admission blocked.** The independent static reviewer approved the identity and the overnight conductor explicitly approved copying only this exact candidate into source control. Do not build a child from it, preview it, load it, execute it, or mutate any profile until the finite descriptor/state/session/List/Grid/image/preference/action controls and fail-closed tests are green and independently reviewed.

## Exact Candidate Identity

| Field | Exact Value |
| --- | --- |
| Extension ID | `kaomoji-search` |
| Manifest command | `index` only (`Search Kaomoji`, `mode: view`) |
| Raycast Store record | <https://www.raycast.com/yalishanda/kaomoji-search> |
| Upstream repository | `raycast/extensions` |
| Verified upstream commit | `b7845053e3f39dadcf984217be5249fb51ab2ce8` |
| GitHub commit verification | Verified signature; GitHub API reason `valid`; committed `2026-05-10T00:29:38Z` |
| Exact extension subtree | Git tree `377d7eb3cd9f3463c14eacb8f290c7558a4571ed` |
| Manifest SHA-256 | `db2f6ad5e5739a651c448cc0ca08a61d9b446f8d0bb4ffee019d277de9838c80` |
| Byte-preserving source-only Git archive SHA-256 | `49069d971c372c89a0250488bd992a4cdfed0c205297d86f56be2a24a0769e82` |
| Candidate artifact path | `/tmp/kaomoji-candidate-build-1/kaomoji-search.tar` |
| **Candidate artifact SHA-256** | **`9b611940dc90e7ece19c370068d2eb087ea8d125613a034a70fbbb35390bc31f`** |
| Artifact size | `5,118,976` bytes |
| Artifact entries | `116` entries; `97` regular files; no symlinks, absolute paths, or `..` traversal components |
| Determinism | Two independent assemblies were byte-identical (`cmp` passed) and produced the same SHA-256 |

The artifact contains a byte-preserving copy of all 25 files in the exact upstream subtree, including the manifest, lockfile, source, assets, official metadata screenshots, changelog, README, and MIT license. It also contains declarative identity/provenance/checksum/license records and the reviewed runtime closure described below.

## Source Behavior

The unchanged source defines one command and two optional dropdown preferences:

| Preference | Allowed Values | Default |
| --- | --- | --- |
| Display Mode | `list`, `grid` | `list` |
| Primary Action | `copy-to-clipboard`, `paste-to-active-app` | `paste-to-active-app` |

Static source inspection found:

- local substring search over `asciilib.lib` by human name, keyword, or category;
- empty-query grouping into `Pinned Favorites`, `Frequently Used`, and seven alphabetized categories, with `UNASSIGNED` last;
- typed-query `Results` section;
- List rows with kaomoji title and human-name accessory;
- Grid items with dark/light 100×100 Base64 SVG text content;
- favorites under cached-state key `favoriteKaomoji`;
- recents under `recentKaomoji`, deduplicated by kaomoji text and capped at 16;
- `Action.Paste` and `Action.CopyToClipboard`, whose success callbacks update recents;
- Pin/Unpin with a success toast;
- `Open Extension Preferences`;
- no fetch/HTTP client, browser opening, OAuth/account flow, selected-text API, shell, child process, filesystem API, elevation, updater, or arbitrary command path in the extension source.

The reviewed `asciilib` dataset has 1,822 entries across `animal`, `behavior`, `emotion`, `food`, `holiday`, `people`, and `UNASSIGNED`. Maximum observed lengths are 61 UTF-16 code units for kaomoji text, 55 for a human name, 10 for category, 16 for a keyword, and 8 keywords per entry.

## Dependency and Runtime Audit

### Manifest-Locked Direct Dependencies

| Dependency | Resolved Version | Lock Integrity | Candidate Treatment |
| --- | --- | --- | --- |
| `@raycast/api` | `1.103.3` | `sha512-+lS8yOrqSP7++ZyomZnMkN0pzEZto/XOqag8MXt9SmTuJBZvfMV74f9wzXmJkRmynYxQHnpLqvs9otWrDd3Bvw==` | Not shipped; replaced by the finite TockTeam compatibility alias. |
| `@raycast/utils` | `2.2.1` | `sha512-MBOD3eccHTu1HVQstoqoJJsA5PubWv18EUq8Dxwg1PEJE+xVjEuslXpsNgR/2RtpTGeKgGiXePxUiVp5mILN5w==` | Not shipped; only reviewed `useCachedState` and `usePromise` aliases are exposed. |
| `asciilib` | `1.0.1` | `sha512-V2pHdzOvSwQWXeCgE1uNCVcoHm2aKIrY58luL4sEmnSkXtQFVnsZgR0aEkvUEDzDrY6eFOaMCTd02F8iez0Xpg==` | Exact registry bytes for `package.json`, `index.js`, `lib.json`, and `ordered.json` only. |

The exact `asciilib@1.0.1` registry tar SHA-256 is `2d8eba41261e43da056a9c1f233ea5dd37210ddbe1da250a409d7d971e1faf35`; its SHA-512 matched the upstream lock integrity.

### Reviewed Runtime Closure

| Package | Version | Integrity | License |
| --- | --- | --- | --- |
| `asciilib` | `1.0.1` | See above | MIT |
| `react` | `19.0.0` | `sha512-V8AVnmPIICiWpGfm6GLzCR/W5FXLchHop40W4nXBmdlEceh16rCN8O8LNWm5bh5XUX91fh7KpA+W0TgMKmgTpQ==` | MIT |
| `react-reconciler` | `0.31.0` | `sha512-7Ob7Z+URmesIsIVRjnLoDGwBEG/tVitidU0nMsqX/eeJaLY89RISO/10ERe0MqmzuKUUB1rmY+h1itMbUHg9BQ==` | MIT |
| `scheduler` | `0.25.0` | `sha512-xFVuu11jh+xcO7JOAGJNOXld8/TcEHK/4CituBUeUb5hqxJLj9YuemAEuvm9gQ/+pgXYfbQuqAkiYu+u7YEsNA==` | MIT |

React, React Reconciler, and Scheduler are copied byte-for-byte from the already reviewed Translate runtime. The candidate includes no `@raycast/api`, `@raycast/utils`, package manager, compiler, installer, executable binary, or native add-on.

### Deliberate Closure Reduction

`asciilib/index.js` synchronously exports only local `lib.json` and `ordered.json`. The unchanged Kaomoji command imports only `asciilib.lib`. The candidate therefore excludes unreachable `asciilib` CLI, build, find, and test modules plus their declared `common-tags`, `ramda`, `rxjs`, and `yargs` dependency closure.

A separate `npm install --ignore-scripts --omit=dev` audit of the full declared closure produced 84 packages and reported three known transitive findings:

- high: `cross-spawn` ReDoS, `GHSA-3xgq-45jj-v275`;
- moderate: `mem` denial of service, `GHSA-4xcv-9jjx-gfj3`;
- moderate: `yargs-parser` prototype pollution, `GHSA-p9pc-299p-vxgp`.

None of those packages, vulnerable paths, CLI/build/find/test modules, or their imports is present in the candidate artifact. The reduction is explicit in `CLOSURE-COMPARISON.txt`, `runtime/NPM-SOURCE.json`, and the non-installable `runtime/RUNTIME-SUBSET.json` attestation. This is deliberately not an npm lock or installable package tree: package-manager installation and `asciilib` CLI use are forbidden and must fail closed.

## License and Provenance Audit

| Component | License Evidence |
| --- | --- |
| Kaomoji Search | Upstream `source/LICENSE`, MIT, Copyright © 2022 Alexander Ignatov |
| `asciilib@1.0.1` | Package metadata declares MIT and author Ian Sinnott; the registry tar and matching `v1.0.1` source tag contain no standalone license or copyright notice. `licenses/asciilib-MIT.txt` is prominently labeled as a **supplemental reconstructed notice**, not byte-preserved upstream text, and supplies standard MIT terms with package-author attribution and no invented year. |
| React, React Reconciler, Scheduler | Included upstream MIT license files |

The candidate records all five components in `LICENSE-INVENTORY.json` and lists notice paths in `LICENSE-FILES`. No dependency has an undeclared license, and no source or runtime file was generated by executing third-party code.

## Effect and Security Audit

The child remains trusted local code and is not a filesystem/network/process sandbox. Safety comes from exact reviewed bytes, immutable descriptors, finite compatibility aliases, bounded protocol projection, authenticated session/action identity, and main-owned effects.

### Proposed Bounded Capabilities

- exact command `index` only;
- List and Grid roots, finite Section nodes, and bounded items/accessories;
- search text and validated loading/empty projection;
- theme-selected `data:image/svg+xml;base64` content only, with strict decoded/type/size limits and no remote URLs;
- main-owned Clipboard Copy;
- main-owned Paste to the active app with the existing permission/restoration safety contract;
- post-effect `onCopy`/`onPaste` callback only after successful acknowledgement, once;
- candidate-owned preferences with exactly the two enums above;
- candidate-owned cached state with only `favoriteKaomoji` and `recentKaomoji`;
- favorites validated against the fixed dataset and bounded to at most 1,822 distinct records; recents bounded to 16; serialized state bounded to 512 KiB and written atomically without symlink following;
- Pin/Unpin success toast;
- a fixed managed Kaomoji preference destination;
- finite decorative icon mapping for Clipboard, Star, StarDisabled, and Gear.

### Explicitly Denied

- network and arbitrary URL access;
- browser opening;
- selected-text access;
- arbitrary Clipboard reads;
- filesystem paths outside the candidate-owned state file;
- shell, process, executable, native module, updater, or elevation authority;
- OAuth, credentials, account APIs, or secret storage;
- arbitrary manifests, commands, extension IDs, preference keys, state keys, native request kinds, icons, images, RPC methods, React props, HTML, or DOM execution;
- Web/TUI composition;
- live user-profile mutation during admission/preview.

## Required Architecture Before Runtime Admission

The existing Google Translate trust store is single-extension. Kaomoji must not share its `current`, `previous`, stage, journal, state, or digest fallback. The implementation must first:

1. add a source-controlled descriptor registry containing only Google Translate and approved Kaomoji identities;
2. compare every persisted/staged identity against descriptor-owned digests rather than a digest selected from persisted state;
3. namespace install, recovery, enablement, preferences, and state by extension ID;
4. include extension ID in build identity, session, generation/revision, event, native request, and action validation;
5. keep one active trusted child session to avoid concurrency expansion;
6. add only the finite views/effects above;
7. preserve Translate bytes, behavior, state, and recovery independently;
8. expose Kaomoji in the Desktop catalog only when its exact descriptor is installed, approved, enabled, and digest-valid.

No generic Store, manifest loader, plugin discovery, JSON-RPC, renderer, preference store, state store, image loader, URL opener, process API, or Cordis composition mechanism is authorized.

## Official UI Evidence

Official Raycast-owned metadata at the pinned commit:

- [`kaomoji-search-1.png`](https://raw.githubusercontent.com/raycast/extensions/b7845053e3f39dadcf984217be5249fb51ab2ce8/extensions/kaomoji-search/metadata/kaomoji-search-1.png), SHA-256 `837d549e5aa962a8dd9978f9c7240b8ce41a98a98a71793c2fc025021ed79b1b`;
- [`kaomoji-search-2.png`](https://raw.githubusercontent.com/raycast/extensions/b7845053e3f39dadcf984217be5249fb51ab2ce8/extensions/kaomoji-search/metadata/kaomoji-search-2.png), SHA-256 `006120acb4a075cf873e9a387e2173959d7dca26820a4bdc58953e3260958279`.

Both are 2000×1250 dark desktop composites. They show the List search/results/selection/footer states and a two-action panel. They do not prove Grid, light theme, loading, empty, error, preferences, Pin/Unpin, focus-visible, keyboard, or reduced-motion states. TockLauncher must render equivalent supported states at real 750×475 in both themes and record these missing-reference limitations rather than inventing Raycast behavior.

## Static Verification Performed

- GitHub API verified commit identity/signature and exact subtree SHA.
- Git tree inventory was complete and non-truncated: 32 entries, 25 regular files.
- Every source and runtime file passed its recorded SHA-256 check.
- Whole-artifact `SHA256SUMS` passed.
- Two independent candidate assemblies were byte-identical.
- Archive scan found no symlink, absolute path, or parent traversal entry.
- Candidate and dependency source were searched for network, filesystem, shell/process, Clipboard/Paste, persistence, and account effects.
- Official screenshot dimensions and hashes were measured without launching or focusing Raycast.

## Exact-Byte Approval

Independent static re-review approved the exact candidate with no remaining findings. The overnight conductor then explicitly approved source control for:

- artifact SHA-256 `9b611940dc90e7ece19c370068d2eb087ea8d125613a034a70fbbb35390bc31f`;
- upstream commit `b7845053e3f39dadcf984217be5249fb51ab2ce8`;
- subtree `377d7eb3cd9f3463c14eacb8f290c7558a4571ed`;
- command `index` only;
- the documented finite capability set only.

Approval permits copying those exact bytes into `plugins/trusted-raycast/vendor/kaomoji-search.tar` and implementing the finite controls in focused/disposable paths. It does **not** permit loading, previewing, executing, or mutating a live profile until the runtime gate passes. Any byte, identity, command, dependency, license, or capability change requires a new exact-byte gate.
