# Plan: Migrate TockTeam to the Pinned DSH npm Runtime

## Decision

The user chose the faster migration path and explicitly accepts standard upstream DSH icons. TockTeam will remove its temporary DSH source-level Lucide rewrite rather than patch compiled npm output or wait for an upstream icon seam.

## Problem

TockTeam is a distribution over DSH, but its non-Nix release path still acquires a full `deepseek-harness` Git checkout, installs the monorepo, rewrites eight DSH client source files for Lucide icons, and builds DSH locally. The exact same runtime release is now published as a prebuilt npm assembly.

Three source paths have also drifted apart:

1. Desktop/Web/TUI staging pins Git commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` for DSH `0.1.1-rc.2`.
2. TockTutor hard-codes that revision-specific cache path for more than twenty DSH workspace overrides.
3. Nix defaults to the `llm-agents.nix` DSH package, while its repository-pinned variant still describes an unfinished Git source build with fake hashes.

This works today and all locked DSH packages resolve to `0.1.1-rc.2`, so the migration is not a version fix. It is a packaging simplification that makes the official published artifact the canonical release input.

## Solution

Pin the official `@deepseek-ai/dsh@0.1.1-rc.2` npm tarball by exact URL and SHA-512, install its dependency graph from a committed versioned lockfile with lifecycle scripts disabled, and deploy it through the existing TockTeam staging and profile seams.

Keep `pnpm run build:dsh` as a compatibility entry point, but make it validate and accept the prebuilt npm assembly instead of compiling DSH. Preserve `DSH_SOURCE` as a version-checked development checkout override. Move TockTutor to exact published DSH packages, make the same npm pin canonical for Nix, and retire only the temporary DSH icon rewrite.

No user data migration is required. Desktop, Web, and TUI continue to use their existing profile names, bundle order, data roots, sessions, settings, credentials, and plugin composition.

## Design Read

This is a repeated-use agent interface whose identity is primarily owned by TockTeam’s layout, themes, launcher, and bundled plugins. Standard DSH icons are an approved visual simplification. Preserve accessibility, optical alignment, light/dark behavior, and every TockTeam-owned Lucide surface; do not redesign unrelated UI.

## Assumptions

- Planning baseline: TockTeam commit `44ee208f88213847adf5904f016f606131905499`.
- Release package: `@deepseek-ai/dsh@0.1.1-rc.2`.
- DSH tarball: `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.1.1-rc.2.tgz`.
- DSH integrity: `sha512-UP1UIh6q3Gme/yXRn/QL2P8IsVlv8Shpg22TRJIZPsCRWLm4CBiA1MUvXmJAfsOEETBMLAl+xWPtFw6ICsN3wg==`.
- Assembly package manager: `pnpm@11.20.0`.
- pnpm integrity: `sha512-mm8zCpW2ZEbqCI+vFSFAWooB8H/ecSTMmVjf7VLUu0NnN+ZbCPhfN7Rvy6N1CSVYrFEmK4FoRLIvY0Bu0Wa/7g==`.
- The DSH version remains `0.1.1-rc.2`; upgrading DSH is separate work.
- Standard upstream DSH icons are acceptable, but TockTeam-owned Lucide icons remain.
- Existing user profile patches and third-party bundles are user-owned and must not be overwritten or removed.

## Current Ownership Map

| Concern | Current Owner | Migration Seam |
| --- | --- | --- |
| Runtime pin, acquisition, integrity, pinned pnpm | `scripts/dsh-source.mjs`, `dsh-source.json` | Resolve one explicit npm-or-development-source input |
| DSH build compatibility command | `scripts/build-dsh.mjs` | Validate prebuilt npm input or build an explicit source override |
| Portable Desktop/Web/TUI assembly | `scripts/stage-dsh.mjs` | Deploy the exact npm dependency closure into `.stage/dsh-runtime` |
| TockTeam profile composition | `src/profile.ts`, patch layers | Keep bundle order and user-owned files unchanged |
| TockTutor development graph | `plugins/tocktutor/pnpm-workspace.yaml`, nested lock | Resolve exact published packages instead of cache links |
| Nix runtime | `nix/dsh-runtime-pinned.nix`, `nix/tockteam.nix`, `flake.nix` | Build the same verified npm assembly |
| Temporary DSH icon customization | `scripts/dsh-lucide-icons.mjs` | Remove; use standard DSH icons |
| Release proof | CI, runtime/Web smokes, packaged launcher smokes | Verify real consumers on all surfaces |

## Implementation Decisions

1. **Use one canonical release artifact.** `dsh-source.json` becomes an npm release spec containing package, version, tarball, DSH integrity, package manager, and package-manager integrity. It never follows npm `latest`.
2. **Keep the runtime-input module deep.** `scripts/dsh-source.mjs` owns schema validation, download, integrity verification, extraction, source-kind detection, and pinned pnpm resolution. Callers receive an explicit npm-versus-development-source result rather than inferring layout repeatedly.
3. **Preserve the development contract.** `DSH_SOURCE` continues to accept a version-matching DSH checkout even when npm is the default. The source path builds normally but no longer receives the Lucide rewrite.
4. **Start every npm stage clean.** Cache the verified tarball, verify it on every resolution, and re-extract the mutable assembly every time because `pnpm install` changes it. Extract using archive and destination operands local to one directory for Windows portability.
5. **Lock the aggregate package’s caret dependencies.** Generate and commit `scripts/dsh-runtime-0.1.1-rc.2-lock.yaml` with `pnpm@11.20.0`. Use `--frozen-lockfile --ignore-scripts`, copy imports, and the existing Windows hoisted-copy mode. Allow the exact pinned `@deepseek-ai/*` release through pnpm’s release-age policy without weakening policy for unrelated packages.
6. **Retain the public build command.** `build:dsh` remains in package scripts and release workflows. For npm it validates `package.json`, `lib/bin.js`, and `config/` then exits; for an explicit checkout it builds source. This avoids needless workflow churn.
7. **Port behavior, not Oh-DSH wholesale.** Use Oh-DSH’s npm transition (`ae6181b5`) plus its essential follow-up lessons: deployed-store Host dependency resolution (`6fac215`), pristine re-extraction (`baf73e3`), versioned lock naming (`ce075d9`), and Windows-local tar operands (`f9dbfe3`). Do not merge `upstream/main`, import unrelated plugins/settings/TUI features, or copy its complete staging refactor.
8. **Do not patch compiled JavaScript.** Delete the temporary DSH Lucide adapter, declarations, lock handling, and dedicated source tests. Keep TockTeam launcher/plugin Lucide dependencies and `tests/icons.test.ts`.
9. **Let TockTutor consume releases normally.** Remove revision-specific DSH workspace links, retain the root `@tockteam/ui`/React identity handling and native build allowances, regenerate the nested frozen lock, and keep all TockTutor package IDs and exports.
10. **Make Nix use the repository pin.** Fetch the exact npm tarball, install the same versioned closure without scripts, replace fake hashes with real hashes, and point standard Full/Web/TUI outputs at it. Preserve existing `*-pinned` names as aliases while removing the redundant `llm-agents` runtime input after successful builds.
11. **Preserve runtime compatibility.** Do not change profile names, bundle IDs/order, data roots, API contracts, or user-owned patches. The rollback is a source-spec/code revert, not a profile or data rollback.
12. **Use red-green-refactor per issue.** Add or update the smallest public-behavior check first, record the failing command, implement only that slice, then run its focused and owning-package gates.

## Testing Decisions

### Highest Useful Seams

- `tests/dsh-source.test.ts` for source-spec validation, wrong package/version, corrupt archive, pristine re-extraction, and development checkout override.
- The real `build:dsh` and `stage:dsh` commands for npm assembly preparation and deployment; do not mock the package manager or filesystem graph.
- Existing self-containment checks and runtime/Web smokes for deployed dependency resolution, profile composition, and leaked cache/store links.
- TockTutor’s nested frozen install, typecheck, tests, build, loader composition, and build-manifest checks.
- Linux Nix builds for Full/Web/TUI plus compatibility output aliases.
- `playwright-cli` against the real Web surface in light and dark modes to verify standard DSH icons render, align, remain keyboard-accessible, and do not create missing-glyph controls.
- A disposable real DSH consumer run using the configured credential without printing it, followed by packaged Desktop/Web/TUI checks and complete process cleanup.

### Required Failure Coverage

- Malformed source spec, non-registry tarball, wrong package/version, and SHA-512 mismatch.
- Cached archive corruption and stale/mutated extracted assembly.
- Missing prebuilt `lib/bin.js` or `config/`.
- Frozen-lock drift and blocked lifecycle scripts.
- Restricted package exports and bundled Host dependency lookup from the deployed store.
- Windows extraction/deploy paths and remaining links outside the staged runtime.
- TockTutor duplicate-runtime/peer identity regressions.
- Existing profile upgrade with extra user bundles and patches intact.

### Core Verification Sequence

```sh
node --test tests/dsh-source.test.ts
pnpm run build:dsh
pnpm run build:tocktutor
pnpm run typecheck:tocktutor
pnpm run test:tocktutor
pnpm run build
pnpm run stage:dsh
pnpm run smoke:web
pnpm run smoke:runtime
pnpm run typecheck
pnpm test
pnpm run test:launcher:electron
```

Run the applicable `dist:web:quick`, `dist:tui:quick`, and Desktop packaged smoke after the focused gates. Run Nix checks on a Nix-enabled Linux runner. Stop every server, Electron app, browser session, and child process started for verification.

## Out of Scope

- Upgrading beyond DSH `0.1.1-rc.2`.
- Merging all current Oh-DSH changes or importing its plugins, settings changes, release UI, documentation system, or TUI upgrades.
- Adding a second runtime loader, agent loop, plugin system, or configuration mechanism.
- Patching minified/compiled npm JavaScript to retain custom DSH icons.
- Redesigning TockTeam-owned icons, themes, layout, launcher, or bundled plugin UI.
- Changing Better Sidebar, dsh-TUI, Pennivo, TockTutor behavior, marketplace transactions, or security authority.
- Following npm `latest`, allowing unpinned dependency resolution, or enabling install-time scripts.
- Removing or rewriting user-owned profile patches, third-party bundles, sessions, settings, plugins, or credentials.

## Dependency Graph

```text
tockteam-npmrt.1  Pin and prepare the npm assembly
    ├── tockteam-npmrt.2  Use the prebuilt client without source rewriting
    │       └── tockteam-npmrt.3  Stage one self-contained runtime
    ├── tockteam-npmrt.4  Move TockTutor to published packages
    └── tockteam-npmrt.5  Make the npm pin canonical for Nix

npmrt.3 + npmrt.4 + npmrt.5
    └── tockteam-npmrt.6  Release proof and documentation
```

After `tockteam-npmrt.1`, TockTutor and Nix can proceed in parallel. Runtime staging remains sequential behind the prebuilt-client cleanup because both touch runtime input assumptions.

## Delivery Plan

### Phase 1 — Canonical Runtime Input

#### `tockteam-npmrt.1` — Pin and Prepare the Published DSH Assembly

**Description:** Replace the Git-default source spec with the exact npm artifact, deepen source resolution around an explicit kind/path result, verify both DSH and pnpm archives, re-extract a pristine assembly, and commit the versioned frozen runtime lock.

**Acceptance Criteria:**

- Exact npm metadata is validated and corrupt/mismatched artifacts fail before extraction or execution.
- Repeated resolution verifies the cached tarball and recreates the mutable assembly.
- A matching `DSH_SOURCE` checkout remains usable; the runtime lock installs twice without drift or scripts.

**Verification:**

```sh
node --test tests/dsh-source.test.ts
git diff --check
```

**Dependencies:** None.

**Files Likely Touched:**

- `dsh-source.json`
- `scripts/dsh-source.mjs`
- `scripts/dsh-source.d.mts`
- `scripts/dsh-runtime-0.1.1-rc.2-lock.yaml` (new)
- `tests/dsh-source.test.ts`

**Estimated Scope:** Medium.

### Phase 2 — Prebuilt Runtime Cutover

#### `tockteam-npmrt.2` — Use the Prebuilt DSH Client Without Source Rewriting

**Description:** Make `build:dsh` validate/no-op for npm, preserve source-override builds, and remove the temporary DSH Lucide source adapter. Standard DSH icons are the approved result.

**Acceptance Criteria:**

- npm `build:dsh` performs no compilation or source mutation and rejects incomplete assemblies.
- The eight source rewrites and their dedicated tests are gone; TockTeam-owned icon tests remain.
- Explicit development checkouts still build without custom DSH icon rewriting.

**Verification:**

```sh
pnpm run build:dsh
node --test tests/dsh-source.test.ts tests/icons.test.ts
git diff --check
```

**Dependencies:** `tockteam-npmrt.1`.

**Files Likely Touched:**

- `scripts/build-dsh.mjs`
- `scripts/dsh-lucide-icons.mjs` (delete)
- `scripts/dsh-lucide-icons.d.mts` (delete)
- `tests/dsh-lucide-icons.test.ts` (delete)

**Estimated Scope:** Small.

#### `tockteam-npmrt.3` — Stage a Self-Contained npm DSH Runtime

**Description:** Extend the existing staging owner to install/deploy the verified assembly, expose deployed packages for profile resolution, preserve restricted-export manifest fallback and TUI adaptation, and retain cross-platform self-containment.

**Acceptance Criteria:**

- Desktop, Web, and TUI bundles resolve from the deployed exact npm closure.
- No staged path points into the cache, a Git checkout, or pnpm store.
- Repeated and Windows staging retain clean extraction, copy semantics, notices, permissions, and executable helpers.

**Verification:**

```sh
pnpm run build
pnpm run build:dsh
pnpm run stage:dsh
pnpm run smoke:web
pnpm run smoke:runtime
```

Run the relevant Windows portability checks in CI.

**Dependencies:** `tockteam-npmrt.2`.

**Files Likely Touched:**

- `scripts/stage-dsh.mjs`
- focused staging/smoke tests only where existing public checks do not cover a branch
- `THIRD_PARTY_NOTICES.md` only if the packaged-notice source changes

**Estimated Scope:** Medium; avoid copying Oh-DSH’s unrelated staging modules.

### Phase 3 — Dependent Build Graphs

#### `tockteam-npmrt.4` — Install TockTutor Against Published DSH Packages

**Description:** Remove revision-specific source links and the installer’s DSH source build, resolve exact rc.2 packages through the nested frozen lock, and verify every TockTutor package through its existing loader/profile seams.

**Acceptance Criteria:**

- No TockTutor workspace or lock entry references `.cache/dsh-source` or a Git revision.
- Nested installation remains exact and reproducible without building DSH.
- TockTutor typecheck, tests, build, manifest, and profile composition pass unchanged.

**Verification:**

```sh
pnpm -C plugins/tocktutor install --frozen-lockfile
pnpm run typecheck:tocktutor
pnpm run test:tocktutor
pnpm run build:tocktutor
node --test tests/tocktutor-build-manifest.test.ts tests/profile.test.ts
```

**Dependencies:** `tockteam-npmrt.1`.

**Files Likely Touched:**

- `plugins/tocktutor/pnpm-workspace.yaml`
- `plugins/tocktutor/pnpm-lock.yaml`
- `scripts/install-tocktutor.mjs`
- `tests/tocktutor-build-manifest.test.ts`
- `tests/profile.test.ts`
- generated `plugins/tocktutor/build-manifest.json`

**Estimated Scope:** Medium.

#### `tockteam-npmrt.5` — Make the npm Pin Canonical for Nix Packages

**Description:** Replace the unfinished Git source derivation with the verified npm assembly, route standard Full/Web/TUI outputs through it, keep existing pinned output names as aliases, and remove the redundant external runtime input once builds pass.

**Acceptance Criteria:**

- Nix verifies the same tarball and locked dependency closure without scripts or fake hashes.
- Standard and compatibility output names resolve to the repository-pinned npm runtime.
- Full, Web, and TUI packages are self-contained and runnable on supported Linux systems.

**Verification:**

```sh
nix flake check
nix build .#tockteam
nix build .#tockteam-web
nix build .#tockteam-tui
nix build .#tockteam-pinned
```

Run on a Nix-enabled Linux CI runner and smoke the produced surfaces.

**Dependencies:** `tockteam-npmrt.1`.

**Files Likely Touched:**

- `nix/dsh-runtime-pinned.nix`
- `nix/tockteam.nix`
- `flake.nix`
- `flake.lock`

**Estimated Scope:** Medium.

### Phase 4 — Release Proof

#### `tockteam-npmrt.6` — Prove and Document the npm Runtime Cutover

**Description:** Run the complete release matrix, inspect standard DSH icons in the real Web UI, verify a copied existing profile, prove one real DSH consumer turn, add the minimum missing CI gate, and document deterministic updates and rollback.

**Acceptance Criteria:**

- All root, TockTutor, stage, runtime, browser, packaged, and Nix checks pass on applicable platforms.
- Standard icons render and remain usable in light/dark themes; no TockTeam-owned icon regresses.
- Documentation and evidence show exact pinning, update/rollback steps, self-containment, and unchanged user data contracts.

**Verification:** Use the complete sequence in **Testing Decisions**, applicable packaged smokes, `playwright-cli`, Nix Linux builds, and `git diff --check`.

**Dependencies:** `tockteam-npmrt.3`, `tockteam-npmrt.4`, and `tockteam-npmrt.5`.

**Files Likely Touched:**

- `.github/workflows/ci.yml`
- `README.md`
- `.agents/references/usage.md`
- focused release/profile tests or evidence paths only as required

**Estimated Scope:** Medium.

## Checkpoints

### Runtime Input Ready

- `tockteam-npmrt.1` passes.
- Exact DSH and pnpm artifacts plus the runtime lock are reviewable.
- Both npm default and source override resolve without ambiguity.

### Runtime Consumers Ready

- `tockteam-npmrt.2` and `.3` pass.
- Standard icons are accepted and the staged runtime is self-contained.
- Desktop/Web/TUI resolve the same package graph.

### Distribution Ready

- TockTutor and Nix consume the canonical pin.
- Existing profile/data compatibility is proven.
- Cross-platform CI and packaged smokes pass.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Aggregate npm dependencies use caret ranges | High | Commit a versioned lock and require frozen installation |
| npm install mutates the extracted assembly | High | Verify the cached archive every time and always re-extract before staging |
| npm/package lifecycle scripts execute trusted code | High | Use `--ignore-scripts`; keep existing explicit native rebuild ownership |
| Host dependency manifests are hidden by package exports | High | Preserve fallback manifest discovery and resolve from the deployed store |
| Windows cannot reproduce POSIX link deployment | High | Keep hoisted-copy mode and use local tar operands; verify on Windows CI |
| TockTutor loads duplicate Cordis/React instances | High | Retain its root UI/React identity rules and exercise real Loader composition |
| Standard DSH icons regress alignment or accessibility | Medium | Inspect real light/dark Web UI and representative keyboard controls with `playwright-cli` |
| Nix and non-Nix closures drift | High | Read one `dsh-source.json`, use the same runtime lock, and build all Nix surfaces |
| Rollback accidentally touches user state | High | Roll back only source/acquisition code; never rewrite profiles, patches, bundles, or data roots |
| Upstream Oh-DSH changes are imported indiscriminately | Medium | Port only the identified runtime behaviors, not commits or unrelated files wholesale |

## Beads

- Epic: `tockteam-npmrt`
- Runtime input: `tockteam-npmrt.1`
- Prebuilt client: `tockteam-npmrt.2`
- Runtime staging: `tockteam-npmrt.3`
- TockTutor: `tockteam-npmrt.4`
- Nix: `tockteam-npmrt.5`
- Release proof: `tockteam-npmrt.6`
