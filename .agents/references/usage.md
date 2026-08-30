# Installation, operations, and troubleshooting

## Choose a distribution

- Install **TockTeam Desktop** for the complete local workbench.
- Install **TockTeam Web** for browser-only use without Electron.
- Install **TockTeam TUI** for terminal-only use without Electron or browser UI.

The full distribution includes all three surfaces, so one installation
supports `desktop`, `web`, and `tui`.

## Install the full distribution

### macOS

1. Download the DMG from the latest Release.
2. Drag **TockTeam Desktop** into Applications.
3. For an unnotarized test build, right-click the app in Finder and choose
   **Open** on first launch.

If a verified Release download remains quarantined, apply this to the actual
downloaded file:

```sh
xattr -d com.apple.quarantine ~/Downloads/TockTeam-Desktop-*.dmg
```

Install the unified command:

```sh
sudo ln -sf \
  "/Applications/TockTeam Desktop.app/Contents/Resources/bin/tockteam" \
  /usr/local/bin/tockteam
```

### Linux

AppImage:

```sh
chmod +x TockTeam-Desktop-*.AppImage
./TockTeam-Desktop-*.AppImage
```

deb:

```sh
sudo apt install ./TockTeam-Desktop-*.deb
```

### Windows

Windows artifacts are not currently published in GitHub Releases. The
`pnpm run dist:win` command remains available for source builds and emits a
finite `TockTeam-Desktop-*-x64.tar.gz` portable archive. From the Windows
source checkout, install it with:

```powershell
node scripts/install-windows.mjs <archive> [destination]
```

Omit `destination` to use `%LOCALAPPDATA%\TockTeam\Desktop`. The installer
uses the archive's bounded runtime-link manifest, restores links as Windows
junctions before validation and swap, and keeps a sibling backup. Raw `tar.exe`
extraction followed by launching `win-unpacked/TockTeam Desktop.exe` is not a
supported installation path; a published Windows installer is not claimed.

## Install Web-only

```sh
tar -xzf tockteam-web-*.tar.gz
cd tockteam-web-*/
./bin/tockteam web
```

Common options:

| Option | Default | Description |
| --- | --- | --- |
| `--host` | `127.0.0.1` | Bind address |
| `--port` | `3080` | Listen port; `0` selects a random port |
| `--data` | `~/.tockteam-web` | Writable Web data root |
| `--no-open` | off | Do not open the browser automatically |
| `--trusted-host` | none | Add a trusted authority; repeatable |

Equivalent environment variables include `TOCKTEAM_WEB_HOST`,
`TOCKTEAM_WEB_PORT`, `TOCKTEAM_WEB_HOME`, and `TOCKTEAM_WEB_OPEN`. Press `Ctrl+C`
for a graceful shutdown.

Do not bind to `0.0.0.0` without an access boundary. For LAN exposure, add
`--trusted-host` and put authentication and TLS in a trusted reverse proxy.

## Install TUI-only

```sh
tar -xzf tockteam-tui-*.tar.gz
cd tockteam-tui-*/
./bin/tockteam tui
```

TUI requires a real interactive terminal. It uses the alternate screen by
default; upstream `dsh-TUI` owns fullscreen selection, scrolling, and copy
behavior.

## Unified commands

```sh
tockteam desktop
tockteam web
tockteam tui
```

- `desktop` opens the installed app and falls back to the Electron development
  entry when run from a source checkout.
- `web` starts the HTTP service and prints its URL.
- `tui` initializes its Profile and attaches the upstream renderer to the
  current terminal.

Common TUI options:

| Option | Default | Description |
| --- | --- | --- |
| `--cwd` | Current directory | Workspace |
| `--data` | `~/.tockteam` | TockTeam TUI Profile, session, and configuration root |
| `--resume` | New session | Resume a Session id |
| `--lang` | Upstream preference | `zh` or `en` |
| `--preset` | `standard` | Initial Agent preset |
| `--inline` | Off | Preserve terminal scrollback instead of alternate screen |

## Desktop operations

| Action | macOS shortcut |
| --- | --- |
| Toggle the left sidebar | `⌘B` |
| Toggle the bottom Terminal | `⌘J` |
| Toggle the right sidebar | `⌥⌘B` |
| Open Review | `⌃⇧G` |
| Open Browser | `⌘T` |
| Open Files | `⌘P` |
| Start a Side chat | `⌥⌘S` |
| Leave sidebar focus mode | `Esc` |

Settings covers language, models, permissions, Agent presets, plugin config,
and TockTeam skins. Its modal covers and blurs every workspace and sidebar.

Choose a skin from Settings on Web or Desktop. In TUI, run `/theme` to select
the same Deep Current, Jade Circuit, Porcelain, or Ember Dusk palette. The
choice applies immediately and survives restarts.

## Plugin marketplace

Recommended flow:

1. Choose a plugin from Not installed.
2. Inspect its source, commit, permissions, and risk level.
3. Prepare a candidate and preview it in an isolated Profile.
4. Discard it if the result is unsuitable; the current Desktop is unchanged.
5. Apply it explicitly, then enable it separately when needed.
6. Recover the previous state if an update fails.

An Agent can initiate the same operation through chat, but still passes
through preview, risk approval, and apply. It cannot directly mutate the
current Profile.

## Run and package from source

```sh
git submodule update --init --recursive
pnpm install
pnpm run build:dsh
pnpm run build
pnpm run stage:dsh
export PATH="$PWD/bin:$PATH"

tockteam desktop
tockteam web --port 3080
tockteam tui
```

Packaging commands:

```sh
pnpm run dist:mac       # macOS full distribution
pnpm run dist:linux     # Linux full distribution
pnpm run dist:win       # Windows full distribution
pnpm run dist:web       # Web-only lightweight distribution
pnpm run dist:tui       # TUI-only terminal distribution
```

Installed launcher evidence:

```sh
pnpm test:launcher:installed
```

This command builds a fresh product and exercises the disposable macOS,
Windows portable tar.gz archive, Debian, and AppImage lanes when run on their supported
hosts. The checked-in macOS arm64 report records unsigned/internal ad-hoc proof
for the identity, resources, security, actions, settings/reinstall, rollback,
and cleanup rows. Notices/vendor scanning and provider catalog are only
partially verified, and the shortcut row remains workflow-required because no
actual shortcut path was exercised. Hosted run `33295632276` passed the Windows
portable archive and Linux Debian/AppImage installed smokes at commit
`ed39e301`; run `33301125258` refreshed the checked-in reports at commit
`455db8ca`. The reports promote only the rows they exercised. Windows Control Panel
was unavailable on the hosted image, elevation remained
confirmation-required and uninvoked, and Linux package rollback remains
workflow-required. The reports are not signing, notarization, publication, or
public-distribution evidence. Vendor results are bounded no-follow scans, not
global source-absence proof; upgrade claims require their own reports.

## Data and troubleshooting

Desktop retains the existing internal data directory to preserve state across
the visible-name migration. Web stores data in `~/.tockteam-web` by default.
TUI uses its own `~/.tockteam` root and does not load global plugin configuration
from `~/.dsh`. Configure the DeepSeek API key in Models settings or in `.env`
under the matching DSH data directory.

Troubleshooting order:

1. Run `tockteam --help` to confirm the CLI source.
2. Run `tockteam web --help` to inspect options.
3. Run `tockteam tui --help`, then use `tockteam tui --inline` to isolate
   alternate-screen terminal compatibility.
4. Test a random port with `tockteam web --port 0 --no-open`.
5. Confirm that required plugins are both installed and enabled in the Profile.
6. If Desktop does not start, run its bundled `bin/tockteam desktop` in a terminal
   to capture logs.

See [architecture and plugin boundaries](./architecture.md) for upstream
relationships.
