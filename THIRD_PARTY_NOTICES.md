# Third-Party Notices

TockTeam is distributed under the MIT License. The projects below are either
bundled at a pinned revision or informed independently implemented adapters.

Upstream UI, themes, and component styling are not bundled. TockTeam adapts
compatible features to its own persistence, layout, localization, and theme
contracts. Direct upstream sources are tracked as pinned submodules. Upstream
releases and features are reviewed regularly.

## Lucide

- Project: <https://lucide.dev>
- Version: `0.473.0`
- Declared license: ISC

TockTeam uses Lucide icons throughout its Desktop, Web, TockTutor, and adapted
DSH interfaces. Product marks and non-icon data visualizations remain original.

## Tailwind CSS

- Project: <https://tailwindcss.com>
- Version: `4.3.3`
- Declared license: MIT

TockTeam uses Tailwind CSS at build time to generate a browser-only utility
layer mapped to DSH semantic theme tokens. TockTeam TUI continues to use its
native renderer and the shared TockTeam skin palette.

## dsh-web-panel

- Historical project: dsh-web-panel (its previous public locator is no longer available)
- TockTeam component: `@tockteam/panel-controls`

TockTeam adapts the Terminal dock for its desktop layout, session model, themes,
and localization. The dock uses the shared Better Sidebar PTY Host, so no
separate Web Terminal or shell plugin is required.

## DSH-better-sidebar

- Project: <https://github.com/omdsh-dev/DSH-better-sidebar>
- Pinned release: `v0.18.0`
- Pinned revision: `9e1a03452794532cda1f6ac677b72579dff48dfc`
- Declared license: MIT
- TockTeam components: `@tockteam/better-sidebar-runtime` and
  `@tockteam/sidebar`

TockTeam compiles the pinned upstream Host for PTY, bounded Files, Git status,
branch operations, history, and commit diffs. It does not load the upstream
client UI. The TockTeam sidebar adapts those capabilities into its own tabs,
viewers, Git Review, line comments, themes, and bilingual desktop layout. We
thank the maintainers and review upstream features regularly.

## plugin-registry and dsh-hub

- Projects: <https://github.com/vlln/plugin-registry>,
  <https://github.com/omdsh-dev/dsh-hub>, and
  <https://github.com/whyihaveyou/dsh-suite>
- Declared licenses: MIT
- TockTeam component: `@tockteam/plugin-marketplace`

TockTeam distills source locking, trust review, installed/enabled state,
candidate previews, updates, and recovery into one desktop transaction. Its
navigation, approval flow, and bilingual UI are implemented in this
repository.

## dsh-skins

- Historical project: dsh-skins (its previous public locator is no longer available)
- TockTeam component: `@tockteam/skins`

TockTeam follows the ThemeService extension model while providing original
skins, a desktop Settings interface, and Host-backed persistence.

## dsh-TUI

- Project: <https://github.com/ccch1mneyyy/dsh-TUI>
- Upstream package: `@deepseek-harness-tui/dsh-tui@0.8.8`
- Pinned revision: `bdff0afb028d50c304e4474fd40f83b0721d50fd`
- Declared license: MIT
- TockTeam component: `@tockteam/tui`

TockTeam bundles the pinned upstream renderer, session interaction, commands,
and terminal compatibility layer. The small downstream component owns only
the unified launcher, Profile defaults, data boundary, and release packaging.
We thank the upstream maintainer and keep the original license with the
packaged source artifacts.

## Ueli launcher assets

TockTeam packages selected Ueli v9.29.0 launcher assets, including the finite
operating-system extension icons, from the pinned provenance tree. Ueli is MIT
licensed; source: <https://github.com/oliverschwendener/ueli>.
Copyright (c) 2023 Oliver Schwendener.

The assets `linux-applications.png` and `linux-generic-app-icon.png` by GNOME Project
(<https://www.gnome.org>) are licensed under CC BY-SA 3.0
(<https://creativecommons.org/licenses/by-sa/3.0/>).

The Custom Web Search icon is designed by OpenMoji (<https://openmoji.org/>) and
is licensed under CC BY-SA 4.0
(<https://creativecommons.org/licenses/by-sa/4.0/>).
