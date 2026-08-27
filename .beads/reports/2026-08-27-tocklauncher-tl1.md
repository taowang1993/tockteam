# TockLauncher `tockteam-tl.1` Implementation Evidence

Status: implemented in `/Users/max/projects/worktrees/tocklauncher-full-parity` on `feature/tocklauncher-full-parity`. The issue remains in progress for parent review and has not been closed.

## Commits

- `3ca4efa88d8be316d16156b035b7f868fd2a06da` — squashed Ueli subtree merge.
- `58c9eac2` — freeze Ueli v9.29.0 provenance, raw release objects, offline baseline guard, baseline tests, and six package scripts.
- `7ba80e6b` — source-derived 11-family parity extractor, generated manifest, and mutation/discovery tests.
- `fa3e6c94` — TypeScript declarations and strict-test fixes for the parity seam.
- `107d539e` — TockTeam package-feasibility contract, notice ledger, checker, and tests.

No push was performed.

## Provenance

The parent-scoped read-only remote check ran before the subtree import:

```sh
git ls-remote --tags https://github.com/oliverschwendener/ueli.git \
  refs/tags/v9.29.0 'refs/tags/v9.29.0^{}'
```

It returned annotated tag object `065cd29600a6c2834e75f67f4962e1e975ceeace` and peeled commit `c9670d61cb2576802adf99d95622c58538d265f3`. This is the point-in-time evidence relating the upstream remote tag to the imported snapshot. The normal baseline audit is deliberately offline: it does not contact the network and instead reconstructs the committed raw tag/commit objects in a temporary bare repository using the worktree Git object database as an alternate.

The imported subtree is ordinary tracked Git content at tree `10af7c99825bc4a16804660e162a891e3515fe93`, with 1,165 tracked files and subtree metadata recording `git-subtree-split: c9670d61cb2576802adf99d95622c58538d265f3`. The offline guard verifies object hashes/types, tag peel/name/type, commit tree, subtree metadata, clean vendor status, file count, package-lock/license hashes, `ueli@9.29.0` MIT identity, and the plain-tar archive SHA-256 `e5efc669abee255f07244bc17eab3f38bfeca12610ca6d7640154feee300bc0d`.

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

Every row has nonempty applicability, capabilities, security disposition, divergence, owner, issue, and evidence; settings preserve upstream default expressions, including UUID absent-default rows. TockTeam issue ownership maps to `.2` through `.15`, and no `tockbot-*` ownership or wording remains in the generated catalog. Privileged Ueli bridge/IPC/action-handler rows are marked for typed TockTeam replacement; all 699 dependency rows are inventory-only and not installed.

The exported `compareCatalog` seam and tests cover four in-memory mutations for each of the 11 families: addition, removal, row swap/order, and classification (`44` deterministic mutation tests). Source-discovery probes cover each family, and AST discovery remains comment-safe for IPC and renderer routes. Tests use source overrides and do not mutate the pristine vendor tree or manifest.

## TockTeam package and notice contract

`desktop-release-contract.json` is rooted in the current TockTeam package and build configuration:

- `@tockteam/desktop`, `TockTeam Desktop`, `ai.deepseek.tockteam-desktop`;
- `tockteam-desktop`, `tockteam-desktop.desktop`, `tocktutor`, and `TockTeam-Desktop` data root;
- ASAR and exact current npm/Builder file/resource allowlists;
- macOS DMG/ZIP, Linux AppImage/deb, and Windows unpacked `dir` targets;
- configured host targets and workflow artifacts distinguished from launcher artifacts;
- no installed, signed, notarized, or public launcher claim;
- foundation launcher flags and dependency/assets/notices arrays remain empty;
- no `vendor/ueli` path in npm, Builder, or resource inputs; no Ueli/Tockbot identity leakage; no Ueli-derived dependency admission.

`notice-ledger.json` keeps Ueli MIT and GNOME CC BY-SA 3.0 source notices as provenance-only, records the OpenMoji CC BY-SA 4.0 attribution as deferred until its asset is shipped, and records the complete Ueli dependency graph as not admitted. Root `THIRD_PARTY_NOTICES.md` was not changed, so Web and TUI package notice surfaces were not widened.

## Verification

All commands were run from the implementation worktree with Node 24.16.0 through the required `mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL` wrapper where applicable.

- `pnpm test:ueli-baseline` — 4 passed.
- `pnpm audit:ueli-baseline` — passed; exact release/tree/count/archive reported.
- `pnpm test:ueli-launcher-parity` — 59 passed, including 44 mutation tests and source/AST probes.
- `pnpm audit:ueli-launcher-parity` — passed; all 11 counts above.
- `pnpm test:ueli-package-feasibility` — 7 passed.
- `pnpm audit:ueli-package-feasibility` — passed; launcher remains unimplemented/unpackaged.
- `pnpm run typecheck` — passed.
- `pnpm test` — 391 passed, 0 failed.
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

The only changed paths relative to the selected base are the ordinary `vendor/ueli` provenance subtree, `scripts/ueli/*`, `tests/ueli-*.test.ts`, and the six root Ueli contract scripts. No `src/`, `web/`, `plugins/`, `nix/`, `.gitmodules`, `pnpm-workspace.yaml`, root notice file, DSH profile, or Electron build entry changed. The seven delegated `/private/tmp/tockteam-*` worktrees were not touched.

## Residual risks

- The remote relation is point-in-time evidence supplied by the pre-import `git ls-remote` check; the offline audit intentionally cannot prove a future remote tag has not moved.
- The raw object reconstruction verifies the committed snapshot and archive digest but does not claim cryptographic signature trust because no signing-key policy was approved.
- The OpenMoji license text remains deferred until a later slice actually ships the Custom Web Search asset.
- The foundation contract intentionally admits no launcher runtime dependencies/assets/notices; later provider/package slices must update their own admission and Desktop-only notice evidence.
- Windows is configured for a `dir` target but remains build-only in the current workflow; no installed Windows launcher evidence is claimed here.
