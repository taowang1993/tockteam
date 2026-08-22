<p align="center">
  <a href="./README.md">简体中文</a> ·
  <strong>English</strong>
</p>

<div align="center">
  <img src="./assets/tockteam-logo.svg" width="136" alt="TockTeam logo">
  <h1>TockTeam</h1>
  <p><strong>One DSH runtime, independently installable interaction surfaces.</strong></p>
</div>

<p align="center">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-12%2B-111111?logo=apple&logoColor=white">
  <img alt="Linux" src="https://img.shields.io/badge/Linux-x64-FCC624?logo=linux&logoColor=black">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-x64-0078D6?logo=windows&logoColor=white">
  <img alt="MIT" src="https://img.shields.io/badge/license-MIT-34a853">
</p>

<p align="center">
  <img src="./assets/tockteam-desktop-overview.png" alt="TockTeam Desktop" width="100%">
</p>

TockTeam packages DeepSeek Harness, Node.js, and local capabilities as
installable Desktop, Web, and TUI distributions. Models still run in the
cloud; TockTeam owns workspaces, terminals, Git review, browser and window
integration, and the plugin lifecycle.

## Download and install

Choose a distribution from the
[latest GitHub Release](https://github.com/taowang1993/tockteam/releases/latest):

| Distribution | Includes | Best for |
| --- | --- | --- |
| Full | **TockTeam Desktop**, Web, TUI, Node runtime, and bundled plugins | Local development workbench |
| Web-only | **TockTeam Web**, Node runtime, and bundled Web plugins; no Electron | Small installs, browser, or remote access |
| TUI-only | **TockTeam TUI**, Node runtime, and terminal plugins; no Electron | Terminal-only environments |

The full distribution is currently published as DMG/ZIP for macOS and
AppImage/deb for Linux. Windows artifacts are not currently published. On
macOS, open the DMG and drag **TockTeam Desktop** into Applications. On Linux,
run the AppImage or install the deb with `apt`.

Extract and start the Web-only package directly:

```sh
tar -xzf tockteam-web-*.tar.gz
cd tockteam-web-*/
./bin/tockteam web
```

The default URL is <http://127.0.0.1:3080>.

The TUI-only package is also ready after extraction:

```sh
tar -xzf tockteam-tui-*.tar.gz
cd tockteam-tui-*/
./bin/tockteam tui
```

### Install the unified command

The macOS full distribution contains a CLI that can be added to `PATH`:

```sh
sudo ln -sf \
  "/Applications/TockTeam Desktop.app/Contents/Resources/bin/tockteam" \
  /usr/local/bin/tockteam
```

Use `./bin/tockteam` from a Web-only or TUI-only package, or add it to `PATH`.

## Start a surface

```sh
tockteam desktop   # Start TockTeam Desktop
tockteam web       # Start TockTeam Web
tockteam tui       # Start TockTeam TUI
```

Run `tockteam web --help` or `tockteam tui --help` for surface-specific options.

## Run from source

Node.js, pnpm, and the platform build tools are required:

```sh
git submodule update --init --recursive
pnpm install
pnpm run build:dsh
pnpm run build
pnpm run stage:dsh
export PATH="$PWD/bin:$PATH"

tockteam desktop
tockteam web
tockteam tui
```

Build the full distribution with the platform-specific `dist:mac`,
`dist:linux`, or `dist:win` script. Build only Web with `pnpm run dist:web`,
or only TUI with `pnpm run dist:tui`.

<details>
<summary><strong>More interfaces</strong></summary>

### Plugin marketplace

![TockTeam plugin marketplace](./assets/tockteam-plugin-marketplace.png)

### TockTeam skins

![TockTeam cross-surface skins](./assets/tockteam-desktop-skins.png)

</details>

## Documentation

- [Design and plugin boundaries](./docs/design.en.md)
- [Installation, operations, and troubleshooting](./docs/usage.en.md)

## Upstream dependencies

| Upstream repository | Role in TockTeam |
| --- | --- |
| [DeepSeek Harness](https://github.com/deepseek-harness/deepseek-harness) | DSH runtime, sessions, and plugin loader |
| [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) | **Direct upstream plugin for TockTeam TUI**, providing terminal rendering, interaction, and commands |
| [DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) | Git review, files, and PTY host capabilities |

`dsh-TUI` is pinned as a Git submodule at `upstream/dsh-TUI`. TockTeam keeps
the upstream implementation and attribution, while owning the `tockteam tui`
launcher, isolated `~/.tockteam` data, unified title, cross-surface skins, and
distribution packaging. See the design guide for the exact boundary.

## License

[MIT](./LICENSE)
