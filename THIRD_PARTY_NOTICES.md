# Third-Party Notices

TockTeam is distributed under the MIT License. The projects below are either
bundled at a pinned revision or informed independently implemented adapters.

Upstream UI, themes, and component styling are not bundled. TockTeam adapts
compatible features to its own persistence, layout, localization, and theme
contracts. Direct upstream sources are tracked as pinned submodules. Upstream
releases and features are reviewed regularly.

## dsh-web-panel

- Historical project: dsh-web-panel (its previous public locator is no longer available)
- TockTeam component: `@tockteam/panel-controls`

TockTeam adapts the Terminal dock for its desktop layout, session model, themes,
and localization. The dock uses the shared Better Sidebar PTY Host, so no
separate Web Terminal or shell plugin is required.

## DSH-better-sidebar

- Project: <https://github.com/omdsh-dev/DSH-better-sidebar>
- Pinned release: `v0.9.0`
- Pinned revision: `2e9db44a71bb75c9fa1185330541dce2582deee3`
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
- Upstream package: `dsh-cc-tui@0.4.1`
- Pinned revision: `6a8956678fc3746ed14b62bfee066ee8fc68f3cb`
- Declared license: MIT
- TockTeam component: `@tockteam/tui`

TockTeam bundles the pinned upstream renderer, session interaction, commands,
and terminal compatibility layer. The small downstream component owns only
the unified launcher, Profile defaults, data boundary, and release packaging.
We thank the upstream maintainer and keep the original license with the
packaged source artifacts.
