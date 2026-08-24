# AGENTS.md

## Product Contract

TockTeam is an installable distribution over one pinned DSH runtime. The unified `tockteam` launcher selects Desktop, Web, or TUI; it does not create a second agent loop or plugin system.

Preserve these boundaries:

- **Desktop** owns Electron windows, menus, preload/IPC, the Desktop bridge, and the full Web-based UI.
- **Web** owns the browser-only surface. It must not emulate Electron authority.
- **TUI** keeps the pinned `dsh-TUI` renderer; TockTeam owns its profile, identity, themes, adapter, launcher, and packaging.
- DSH Profile + Loader remains the only composition mechanism. Add behavior as Cordis plugins and bundle patches, not by patching the agent loop.
- Existing package IDs, profile names, and data roots are compatibility contracts. Visible renames must not discard sessions, settings, plugins, or credentials.

## Repository Map

| Path | Responsibility |
| --- | --- |
| `src/cli.ts` | Unified `desktop` / `web` / `tui` dispatch |
| `src/main.ts`, `src/preload.ts`, `src/client.ts` | Electron Host, restricted bridge, and Desktop client |
| `src/web.ts`, `web/` | Web launcher, Host/client plugin, and Web bundle patch |
| `src/tui.ts`, `plugins/tui/` | TUI launcher and downstream bundle adapter |
| `src/profile.ts` | Surface profile names, owned bundle order, upgrade-safe initialization |
| `src/runtime*.ts` | Staged DSH process supervision and packaged runtime paths |
| `plugins/*/src` | First-party Host and browser-client plugins |
| `plugins/tocktutor/packages/*` | In-repo TockTutor packages, aggregate bundle, tests, and shared plugin-stack workspace |
| `plugins/shared/` | Cross-surface contracts, especially `tockTeamSurface` |
| `plugins/plugin-marketplace/` | Prepare, preview, approval, apply, enable, update, and recovery transaction |
| `cordis.patch.yml` | Desktop bundle layer |
| `web/cordis.patch.yml` | Web bundle layer |
| `plugins/tui/cordis.patch.yml` | TUI bundle layer |
| `scripts/build.mjs` | Builds tracked source into ignored `dist/` outputs |
| `scripts/stage-dsh.mjs` | Produces the self-contained ignored `.stage/` runtime |
| `dsh-source.json` | Exact DSH repository, revision, and version pin |
| `upstream/` | Git submodules for Better Sidebar and `dsh-TUI` |

## Sources of Truth

- Target the DSH revision in `dsh-source.json`, currently `47f943859bef60e4160492346772ded9b24f765a` (`0.1.0-rc.5`). Inspect its source and docs through `scripts/dsh-source.mjs` or the matching `.cache/dsh-source/<revision-prefix>` checkout before using a DSH API.
- `src/profile.ts`, package `dsh` metadata, and the three tracked patch files jointly define surface composition.
- `package.json` scripts and `.github/workflows/ci.yml` define supported checks. Node is `>=24`; CI uses Node 24 and pnpm 11.20.0.
- `README.md` / `README.en.md` are a bilingual pair. Files under `docs/` are English-only.

Do not hand-edit generated or installed paths: `dist/`, `.stage/`, `.cache/`, `.local/`, `release/`, `node_modules/`, `tmp/`, or Nix `result*`. Rebuild them.

Do not edit code inside `upstream/*` for TockTeam behavior. Move a submodule pointer only as an explicit dependency update. Better Sidebar Host code is built from `upstream/DSH-better-sidebar`; TUI branding and data-path changes belong in `scripts/tui-upstream-adapter.mjs`, whose exact-match guards intentionally fail when an upstream seam changes.

## Cordis and DSH Rules

Cordis provides temporal composability through reversible effects and spatial composability through declared, reactive dependencies. Preserve both:

- Prefer a function plugin exporting a stable `name`, required `inject` dependencies, and `apply(ctx)`. Use a service class only when other plugins need an injectable public service.
- Declare hard service requirements instead of polling. This repository also uses `ctx.inject([...], callback)` for contributions scoped to services that may appear or disappear.
- Register listeners, routes, tools, prompt sections, adapters, child plugins, and providers through `ctx` so Fiber disposal removes them.
- Wrap sockets, processes, watchers, timers, temporary resources, and other external acquisitions in one `ctx.effect()` that returns a complete disposer.
- If cleanup order matters, perform the ordered async teardown inside one disposer. Separate async disposers may run concurrently.
- An external emission is not automatically reversible. File writes, network sends, Git operations, and package installation still need explicit transaction, compensation, or withholding semantics.
- Keep Host and browser-client halves separate. Browser plugins expose `./client` and declare `dsh.client` metadata; Host-only packages must not accidentally gain a client block.
- Reuse `plugins/shared/surface.ts`. Never provide a TockTeam surface as `ctx.web`; DSH already owns that service name.
- Cordis patch rows replace the row's entire `config`; they do not deep-merge it. Restate defaults that an override must retain.
- User profile patches and third-party bundles are user-owned. `ensureProfile()` may add required owned bundles but must not overwrite existing user files or remove extra bundles.

When adding a bundled plugin, update every owning layer that applies: its package manifest/exports, `scripts/build.mjs`, the relevant patch file, `src/profile.ts` protected lists or bundle order, browser-client injections, and focused composition tests. Do not mount a plugin on a surface that cannot provide its dependencies.

## Security Boundaries

Do not simplify away these controls:

- Web binds to loopback by default. A non-loopback bind requires trusted authorities; deployments still need a trusted authentication/TLS boundary.
- Keep Electron `contextIsolation`, renderer sandboxing, disabled Node integration, navigation/origin checks, restricted IPC, webview hardening, and deny-by-default permissions.
- Keep Files, PTY, Git, and workspace operations bound to the active Session and Workspace, with existing path, origin, body-size, and input validation.
- Plugins, presets, MCP commands, and Cordis configuration execute as trusted Host code. Agent permission presets do not sandbox arbitrary plugins.
- Marketplace mutations must follow prepare -> pinned candidate -> isolated preview -> explicit approval/apply. Installed and enabled are separate states; candidate, current, and previous state must remain recoverable. Never mutate the live Profile as a shortcut.

## Code and Test Conventions

- TypeScript is strict NodeNext/ES2024 with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Keep explicit `.ts` import extensions in source.
- Follow existing formatting: two spaces, single quotes, no semicolons, trailing commas in multiline constructs.
- Prefer Node/platform APIs and existing helpers over new dependencies. Native dependency build permissions in `pnpm-workspace.yaml` are a security boundary.
- Tests use `node:test` and `node:assert/strict` in top-level `tests/*.test.ts`. Add the smallest focused regression test and import source directly.
- TockTutor packages share `plugins/tocktutor/pnpm-lock.yaml`. Run `install:tocktutor` once after dependency or DSH-pin changes, then `typecheck:tocktutor`, `test:tocktutor`, and `build:tocktutor` before the root gate. Their tracked `lib/` and `dist/` directories are release payloads: rebuild them, never hand-edit them.
- Keep parsers and launch-spec builders pure where practical so tests do not need Electron, a browser, a TTY, or a real DSH process.
- Use temporary directories for filesystem tests and remove them in `finally`/test cleanup.
- User-facing standalone labels use Title Case; descriptions and complete sentences use sentence case. Preserve the exact product names **TockTeam Desktop**, **TockTeam Web**, and **TockTeam TUI**.

## Verification

Run the smallest relevant check first, then the repository gate:

```sh
node --test tests/<focused>.test.ts
pnpm run typecheck
pnpm test
pnpm run build
```

The CI source gate is exactly typecheck, tests, and build on macOS arm64/x64, Linux x64, and Windows x64.

For profile, plugin graph, DSH integration, staging, or runtime changes, also run:

```sh
pnpm run build:dsh
pnpm run stage:dsh
pnpm run smoke:web
pnpm run smoke:runtime
```

`build:dsh` and full staging are expensive; do not run them for an isolated pure helper or CSS change. Use the matching `dist:*`, `smoke:web:package`, `smoke:app`, or `smoke:app:linux` command only when packaging changed. TUI needs a real interactive terminal for a manual launch; its parser, profile, patch order, and upstream adapter remain testable without one.

Before finishing, inspect `git status`, verify that only intended tracked source changed, and make a small commit. Never commit ignored build products.
