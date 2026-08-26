# AGENTS.md

## Product Contract

TockTeam is an installable distribution over one pinned DSH runtime. The unified `tockteam` launcher selects Desktop, Web, or TUI; it does not create a second agent loop or plugin system.

Preserve these boundaries:

- **Desktop** owns Electron windows, menus, preload/IPC, the Desktop bridge, and the full Web-based UI.
- **Web** owns the browser-facing surface and its web-compatible Host/client plugins. It must not emulate Electron authority.
- **TUI** keeps the pinned `dsh-TUI` renderer; TockTeam owns its profile, identity, themes, adapter, launcher, and packaging.
- DSH Profile + Loader remains the only composition mechanism. Add behavior as Cordis plugins and bundle patches, not by patching the agent loop.
- Existing package IDs, profile names, and data roots are compatibility contracts. Visible renames must not discard sessions, settings, plugins, or credentials.

## Tech Stack

| Layer      | Technology                                          |
| ---------- | --------------------------------------------------- |
| Runtime    | DSH `0.1.1-rc.2` + Cordis                           |
| Language   | TypeScript NodeNext / ES2024 on Node >=24           |
| Desktop    | Electron 42 + the DSH Web UI                        |
| Web        | DSH Web App over HTTP, bound to loopback by default |
| TUI        | Pinned `dsh-TUI` renderer                           |
| Browser UI | React + Tailwind CSS v4 + shadcn/ui + Lucide        |
| Build      | pnpm + esbuild                                      |
| Packaging  | electron-builder + Nix                              |
| Tests      | `node:test` + `node:assert/strict`                  |

## Project Structure

```text
tockteam/
├── .agents/references/              # Architecture and operating references
├── assets/                          # Product icons and artwork
├── bin/                             # Unix and Windows launchers
├── nix/                             # Nix packaging
├── plugins/
│   ├── */src/                       # First-party Host and browser-client plugins
│   ├── plugin-marketplace/          # Marketplace transaction and recovery flow
│   ├── shared/                      # Cross-surface contracts
│   ├── tocktutor/packages/          # In-repo TockTutor packages and tests
│   └── tui/
│       └── cordis.patch.yml         # TUI bundle layer
├── scripts/
│   ├── build.mjs                    # Source build
│   └── stage-dsh.mjs                # Self-contained DSH runtime staging
├── src/
│   ├── cli.ts                       # Desktop, Web, and TUI dispatch
│   ├── main.ts                      # Electron Host
│   ├── preload.ts                   # Restricted Desktop bridge
│   ├── client.ts                    # Desktop client
│   ├── web.ts                       # Web launcher
│   ├── tui.ts                       # TUI launcher
│   ├── profile.ts                   # Surface profiles and bundle order
│   └── runtime*.ts                  # DSH supervision and packaged paths
├── tests/                           # Root node:test suite
├── upstream/                        # Better Sidebar and dsh-TUI submodules
├── web/
│   └── cordis.patch.yml             # Web bundle layer
├── cordis.patch.yml                 # Desktop bundle layer
└── dsh-source.json                  # Exact DSH revision and version pin
```

## References

Folder: `.agents/references/`

| Document           | Purpose                                       |
| ------------------ | --------------------------------------------- |
| `architecture.md`  | The Software Architecture of Tockteam         |
| `self-evolving.md` | Reversible Cordis composition philosophy      |
| `tocktutor.md`     | TockTutor plugin and package contracts        |
| `usage.md`         | Installation, operations, and troubleshooting |

## Development Guidelines

- Must reuse `plugins/shared/surface.ts`. Never provide a TockTeam surface as `ctx.web`; DSH owns that service name.
- Must treat user profile patches and third-party bundles as user-owned. `ensureProfile()` may add required owned bundles but must not overwrite existing files or remove extra bundles.
- Must keep Host and browser-client halves separate when adding a bundled plugin. Update every owning layer: package exports and metadata, `scripts/build.mjs`, the relevant patch file, `src/profile.ts`, browser-client injections, and focused composition tests. Do not mount it on a surface that cannot provide its dependencies.
- Must use the TDD skill for non-trivial implementation or bug fixes: run the failing check first, then report the exact verification command.
- Must use the design skill for UI/UX work and the playwright-cli skill to verify browser-visible UI or user-flow changes.
- Must stop any Electron app, web server, and child process started for verification unless the user asks to keep it running.
- Never push without explicit authority from the user, orchestrator, or active repository profile. Never squash-merge pull requests; use merge commits.
- Never modify `AGENTS.md` or add Markdown files at the repository root without explicit user permission.
- Never create scratch or context files in the repository root; use `/tmp` for disposable notes and `.beads/plans` or `.beads/report` only for requested durable work.

## Security Boundaries

Do not simplify away these controls:

- Web binds to loopback by default. A non-loopback bind requires trusted authorities; deployments still need a trusted authentication/TLS boundary.
- Keep Electron `contextIsolation`, renderer sandboxing, disabled Node integration, navigation/origin checks, restricted IPC, webview hardening, and deny-by-default permissions.
- Keep Files, PTY, Git, and workspace operations bound to the active Session and Workspace, with existing path, origin, body-size, and input validation.
- Plugins, presets, MCP commands, and Cordis configuration execute as trusted Host code. Agent permission presets do not sandbox arbitrary plugins.
- Marketplace mutations must follow prepare -> pinned candidate -> isolated preview -> explicit approval/apply. Installed and enabled are separate states; candidate, current, and previous state must remain recoverable. Never mutate the live Profile as a shortcut.

## Environment Variables

`.envrc` loads the repository's Nix flake. It does not contain application secrets.

| Variable                           | Purpose                                                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| `TOCKTEAM_SURFACES`                | Comma-separated surfaces included in a layered distribution         |
| `TOCKTEAM_SOURCE_ROOT`             | Source checkout used by development launchers                       |
| `TOCKTEAM_DESKTOP_APP`             | Explicit installed Desktop app or executable path                   |
| `TOCKTEAM_RESOURCES_ROOT`          | Packaged or staged runtime resources override                       |
| `TOCKTEAM_WEB_ROOT`                | Web distribution root override                                      |
| `TOCKTEAM_WEB_HOST`                | Web bind host; defaults to loopback                                 |
| `TOCKTEAM_WEB_PORT`                | Web listen port                                                     |
| `TOCKTEAM_WEB_HOME`                | Writable Web data root                                              |
| `TOCKTEAM_WEB_OPEN`                | Whether Web opens a browser (`1`/`0` or `true`/`false`)             |
| `TOCKTEAM_TUI_ROOT`                | TUI distribution root override                                      |
| `TOCKTEAM_TUI_HOME`                | TUI data and session root                                           |
| `TOCKTEAM_TUI_CWD`                 | Initial TUI workspace directory                                     |
| `TOCKTEAM_TUI_FULLSCREEN`          | Alternate-screen mode (`1`/`0` or `true`/`false`)                   |
| `TOCKTEAM_TUI_LANG`                | Initial TUI language (`en` or `zh`)                                 |
| `TOCKTEAM_TUI_PRESET`              | Initial TUI agent preset                                            |
| `TOCKTEAM_TUI_SESSION_ID`          | Existing session to resume                                          |
| `DSH_SOURCE`                       | Development DSH checkout override; it must match the pinned version |
| `DSH_DESKTOP_NODE_VERSION`         | Node version staged into distributions                              |
| `DSH_DESKTOP_NODE_PLATFORM`        | Node distribution platform override (`darwin`, `linux`, or `win`)   |
| `DSH_DESKTOP_NODE_ARCH`            | Node distribution architecture override (`arm64` or `x64`)          |
| `DSH_DESKTOP_SIGN_IDENTITY`        | macOS package signing identity; defaults to ad-hoc signing          |
| `DSH_DESKTOP_GH_PATH`              | Explicit GitHub CLI path for the marketplace Host                   |
| `TOCKTEAM_MARKETPLACE_CATALOG`     | Marketplace catalog locator in `owner/repository/path` form         |
| `TOCKTEAM_MARKETPLACE_AGENT_URL`   | Private marketplace Agent gateway URL                               |
| `TOCKTEAM_MARKETPLACE_AGENT_TOKEN` | Secret for the private marketplace Agent gateway                    |

Runtime-generated capability endpoints, tokens, profile names, versions, and data paths are internal contracts. Do not set them manually or expose them to browser code.

## CodeGraph

Use CodeGraph when this checkout has a `.codegraph/codegraph.db` semantic index. Run `codegraph init` once in a new checkout. Prefer it for structural exploration, call flows, and impact analysis; use text/file search for literal strings, filenames, documentation, configuration, or when CodeGraph is unavailable.

| Interface                     | Use For                                                                |
| ----------------------------- | ---------------------------------------------------------------------- |
| `codegraph_explore`           | Primary MCP query for architecture, flows, symbols, source, and impact |
| `codegraph explore "<query>"` | Equivalent CLI fallback                                                |
| `codegraph status`            | Index health and synchronization status                                |

The generated `.codegraph/codegraph.db` stays local and ignored. Commit only `.codegraph/.gitignore` from that directory.

- Prefer one `codegraph_explore` query that names the flow, file, or symbols you need. It returns current source, relationships, call paths, and blast radius together.
- Treat returned source blocks as already read. Do not repeat the same discovery with grep or file reads.
- Check any staleness banner after edits. Auto-sync is normally sufficient; use `codegraph status` when the index may be stale.
- Use the CLI fallback when the MCP tool is unavailable.

## Beads Issue Tracker

This project uses **bd (Beads)** for issue tracking. Run `bd prime` for the current workflow and session rules.

| Command                   | Use For                             |
| ------------------------- | ----------------------------------- |
| `bd ready`                | Find unblocked work                 |
| `bd show <id>`            | Read issue context and dependencies |
| `bd update <id> --claim`  | Claim work before implementation    |
| `bd close <id>`           | Complete verified work              |
| `bd remember "<insight>"` | Store persistent project knowledge  |

- Use Beads for task tracking; do not create markdown TODO lists or `MEMORY.md` files.
- Run `bd prime` after compaction or when resuming a session.
- Use the repository-local Beads database resolved by `bd where`.
- Before ending a session, follow the `bd prime` close protocol: close completed issues, run relevant checks, inspect `git status`, then follow the active profile for commit, sync, and push authority.
