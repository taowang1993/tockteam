# TockLauncher `tockteam-tl.1` Implementation Evidence

Status: implemented in `/Users/max/projects/worktrees/tocklauncher-full-parity` on `feature/tocklauncher-full-parity`. The issue remains in progress for parent review and has not been closed.

## Commits

- `3ca4efa88d8be316d16156b035b7f868fd2a06da` — squashed Ueli subtree merge.
- `58c9eac2` — freeze Ueli v9.29.0 provenance, raw release objects, offline baseline guard, baseline tests, and six package scripts.
- `7ba80e6b` — source-derived 11-family parity extractor, generated manifest, and mutation/discovery tests.
- `fa3e6c94` — TypeScript declarations and strict-test fixes for the parity seam.
- `107d539e` — TockTeam package-feasibility contract, notice ledger, checker, and tests.
- `2b5b305b` — harden offline provenance, canonical objects, subtree metadata, and vendor integrity checks.
- `397d130f` — tighten platform/extension parity, ownership, default capture, manifest keys, and duplicate detection.
- `a8b0d000` — derive package dependency admission and validate attribution/identity boundaries.
- `8f923ff3` — preserve raw symlink blob bytes in the vendor integrity seam.
- `c3a35371` — stabilize parity discovery ordering with a locale-independent comparator.
- `392b4c6f` — retain the reviewed exact notice attribution values.
- `17ee50a7` — narrow application identity scanning to actual identity/data/session values.

No push was performed.

## Provenance

The parent-scoped read-only remote check ran before the subtree import:

```sh
git ls-remote --tags https://github.com/oliverschwendener/ueli.git \
  refs/tags/v9.29.0 'refs/tags/v9.29.0^{}'
```

It returned annotated tag object `065cd29600a6c2834e75f67f4962e1e975ceeace` and peeled commit `c9670d61cb2576802adf99d95622c58538d265f3`. This is the point-in-time evidence relating the upstream remote tag to the imported snapshot. The normal baseline audit is deliberately offline: it does not contact the network and instead reconstructs the committed raw tag/commit objects in a temporary bare repository using the worktree Git object database as an alternate. Every checker Git subprocess disables replacement refs and lazy object fetching, and archive output pins `tar.umask=0002`.

The imported subtree is ordinary tracked Git content at tree `10af7c99825bc4a16804660e162a891e3515fe93`, with 1,165 tracked files and subtree metadata recording `git-subtree-split: c9670d61cb2576802adf99d95622c58538d265f3`. The offline guard verifies object hashes/types, tag peel/name/type, exact subtree metadata lines, clean vendor status including ignored/untracked paths and index flags, every physical tracked regular-file/symlink blob against the committed tree, file count, package-lock/license hashes, `ueli@9.29.0` MIT identity, and the plain-tar archive SHA-256 `e5efc669abee255f07244bc17eab3f38bfeca12610ca6d7640154feee300bc0d`. The final path-resolution fix resolves a relative `git rev-parse --git-path objects` result against the audited `repoRoot` before writing the temporary alternates file while preserving already-absolute linked-worktree paths; a disposable ordinary Git repository regression covers both cases.

`baseline.json` also records the read-only Tockbot implementation oracle `https://github.com/taowang1993/tockbot.git` at `7655149224cb989b66dc382c4e0f157ae4c4b312`.

## Parity contract

The source-derived manifest preserves the exact Ueli v9.29.0 rows and counts:

```text
bootstrap=67
extensions=24
actionHandlers=31
bridgeMethods=39
ipcChannels=128
rendererSurfaces=34
registries=17
settings=100
assets=108
dependencies=699
platforms=13
```

Every row has nonempty applicability, capabilities, security disposition, divergence, owner, issue, and evidence; settings preserve upstream default expressions, including UUID-absent defaults and the VSCode macOS conditional `/usr/local/bin/code %s` alongside the general `code %s` default in the single command row. Platform target applicability is explicit: AppImage/deb/rpm are Linux, appx/msi/nsis are Windows, dmg is macOS, zip is macOS/Windows/Linux, and architecture rows cover all three platforms. Extension support is inherited by action handlers, renderer/settings surfaces, and assets, then intersected with source platform clues; Terminal and WebBrowser assets have finite supported-platform sets.

TockTeam issue ownership maps to `.2` through `.15`, and no `tockbot-*` ownership or wording remains in the generated catalog. Provider-owned settings, renderer surfaces, and extension assets include their provider issue in addition to `.5`, `.13`, or `.14` where applicable. Privileged Ueli bridge/IPC/action-handler rows are marked for typed TockTeam replacement; all 699 dependency rows are inventory-only and not installed.

The exported `compareCatalog` seam and tests cover four in-memory mutations for each of the 11 families: addition, removal, row swap/order, and classification (`44` deterministic mutation tests). Source-discovery probes cover each family, and a source-backed duplicate registration at a different offset is rejected while same-offset detector overlap is collapsed. The manifest requires exactly the 11 known catalog keys and uses a locale-independent code-point order. AST discovery remains comment-safe for IPC and renderer routes. Tests use source overrides and do not mutate the pristine vendor tree or manifest.

## TockTeam package and notice contract

`desktop-release-contract.json` is rooted in the current TockTeam package and build configuration:

- `@tockteam/desktop`, `TockTeam Desktop`, `ai.deepseek.tockteam-desktop`;
- `tockteam-desktop`, `tockteam-desktop.desktop`, `tocktutor`, and `TockTeam-Desktop` data root;
- ASAR and exact current npm/Builder file/resource allowlists;
- macOS DMG/ZIP, Linux AppImage/deb, and Windows unpacked `dir` targets;
- configured host targets and workflow artifacts distinguished from launcher artifacts;
- no installed, signed, notarized, or public launcher claim;
- foundation launcher flags and dependency/assets/notices arrays remain empty;
- no `vendor/ueli` path in npm, Builder, or resource inputs; no TockLauncher Ueli/Tockbot application identity leakage was added; pre-existing TockTutor compatibility package IDs remain intentionally present; no Ueli-derived dependency admission.

`notice-ledger.json` validates exact attribution fields: Ueli `https://github.com/oliverschwendener/ueli`, GNOME `https://www.gnome.org`, and OpenMoji `https://openmoji.org/`. Ueli MIT and GNOME CC BY-SA 3.0 source notices remain provenance-only; OpenMoji CC BY-SA 4.0 remains deferred until its asset is shipped; the complete Ueli dependency graph remains not admitted. Root `THIRD_PARTY_NOTICES.md` was not changed, so Web and TUI package notice surfaces were not widened.

## Verification

All commands were run from the implementation worktree with Node 24.16.0 through the required `mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL` wrapper where applicable.

- `pnpm test:ueli-baseline` — 7 passed, including relative/absolute Git path resolution, canonical base64, and isolated vendor-integrity fixture checks.
- `pnpm audit:ueli-baseline` — passed; exact release/tree/count/archive reported.
- `pnpm test:ueli-launcher-parity` — 62 passed, including 44 mutation tests, golden rows, duplicate-registration, manifest-key, and source/AST probes.
- `pnpm audit:ueli-launcher-parity` — passed; all 11 counts above.
- `pnpm test:ueli-package-feasibility` — 9 passed, including derived dependency, attribution mutation, and identity-boundary checks.
- `pnpm audit:ueli-package-feasibility` — passed; launcher remains unimplemented/unpackaged.
- `pnpm run typecheck` — passed.
- `pnpm test` — 398 passed, 0 failed.
- `pnpm run build` — passed.
- `pnpm pack --dry-run --json` — 529 package files; `vendor/ueli` entries: `0`.
- `bd lint` — passed; no template warnings.
- `git diff --check 088c4a079fe47210097be94af7ce232e7582d62f HEAD` — passed.
- `git show --check` for each implementation commit — passed.

Final Git evidence:

```text
## feature/tocklauncher-full-parity
(no staged files)
```

The only changed paths relative to the selected base are the ordinary `vendor/ueli` provenance subtree, `scripts/ueli/*`, `tests/ueli-*.test.ts`, the six root Ueli contract scripts, and this report. No `src/`, `web/`, `plugins/`, `nix/`, `.gitmodules`, `pnpm-workspace.yaml`, root notice file, DSH profile, or Electron build entry changed. The seven delegated `/private/tmp/tockteam-*` worktrees were not touched.

## Review-fix TDD evidence

The review-fix tests were written before their corresponding implementation changes:

- Baseline RED: the final reviewer regression `pnpm test:ueli-baseline` exited `1` because `resolveGitPath` was not yet exported; earlier provenance RED also covered the vendor-integrity seams.
- Catalog RED: `pnpm test:ueli-launcher-parity` exited `1` with the expected platform-target mismatch and missing duplicate-registration rejection.
- Package/legal RED: `pnpm test:ueli-package-feasibility` exited `1` because the old identity scan rejected legitimate provenance text and the hand-listed dependency set did not reject `@fluentui/react-components`.

After the minimal fixes and parity regeneration through `node scripts/ueli/parity-catalogs.mjs --write`, GREEN results were baseline `7` passed, parity `62` passed, and package/legal `9` passed.

## Residual and future issue notes

- Adding the six dedicated Ueli commands to the tag release workflow is intentionally deferred to `tockteam-tl.14`/`.15`; workflows were not modified in this fix pass.
- Enforcing tag/package version equality is intentionally deferred to `tockteam-tl.14`/`.15` package/release convergence; this contract does not claim that evidence.

## Residual risks

- The remote relation is point-in-time evidence supplied by the pre-import `git ls-remote` check; the offline audit intentionally cannot prove a future remote tag has not moved.
- The raw object reconstruction verifies the committed snapshot and archive digest but does not claim cryptographic signature trust because no signing-key policy was approved.
- The OpenMoji license text remains deferred until a later slice actually ships the Custom Web Search asset.
- The foundation contract intentionally admits no launcher runtime dependencies/assets/notices; later provider/package slices must update their own admission and Desktop-only notice evidence. Ueli runtime dependency names now derive from the pinned vendor package's `dependencies` and `optionalDependencies`, while root dependency values are scanned for vendor paths.
- Windows is configured for a `dir` target but remains build-only in the current workflow; no installed Windows launcher evidence is claimed here.
