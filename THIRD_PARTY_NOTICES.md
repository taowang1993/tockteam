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

## Fira Code

- Project: <https://github.com/tonsky/FiraCode>
- Declared license: SIL Open Font License 1.1

TockTeam bundles Fira Code for source editors. The license text is distributed
with the font under the TockTutor workbench package.

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
- Upstream package: `@deepseek-harness-tui/dsh-tui@0.10.0-beta.5`
- Pinned revision: `8f1444a2627fab01682e679a0e44de8989b66f77`
- Declared license: MIT
- TockTeam component: `@tockteam/tui`

TockTeam bundles the pinned upstream renderer, session interaction, commands,
and terminal compatibility layer. The small downstream component owns only
the unified launcher, Profile defaults, data boundary, and release packaging.
We thank the upstream maintainer and keep the original license with the
packaged source artifacts.

## Ueli launcher assets

TockTeam packages selected Ueli v9.29.0 launcher assets, including the finite
operating-system extension icons, from the pinned upstream release. Ueli is MIT
licensed; source: <https://github.com/oliverschwendener/ueli>.
Copyright (c) 2023 Oliver Schwendener.

The assets `linux-applications.png` and `linux-generic-app-icon.png` by GNOME Project
(<https://www.gnome.org>) are licensed under CC BY-SA 3.0
(<https://creativecommons.org/licenses/by-sa/3.0/>).

The Custom Web Search icon is designed by OpenMoji (<https://openmoji.org/>) and
is licensed under CC BY-SA 4.0
(<https://creativecommons.org/licenses/by-sa/4.0/>).

## Trusted Raycast Google Translate Desktop pilot

Optional build payload: the unchanged `translate` command from Raycast extensions
revision `1063bfaa34be81528c4e397c91b57c42ec370d79`, Google Translate extension
(MIT). Reviewed source/runtime archive SHA-256:
`7a27b1a75d4ee978fab04281dd93e187a6c32fd1de5de1f01eb66ce7682ea3ac`.

`TRUSTED_RAYCAST_ARTIFACT_TAR` explicitly selects these approved bytes at build time.
The build ships the original archive as `dist/trusted-raycast/artifact.tar`, including
its `LICENSE-FILES`, `LICENSE-INVENTORY.json`, `PROVENANCE.txt`, source checksums,
assets and dependency locks. The derived child bundle contains upstream extension
source **and** TockTeam compatibility code. Its `build.json` records source archive
identity; hashing the archive alone does not attest arbitrary derived application
bundle bytes. No package installation or install scripts run in the application.

The private child uses the archive's exact React 19.0.0 (MIT), react-reconciler
0.31.0 (MIT), scheduler 0.25.0 (MIT), and reviewed upstream dependency closure,
including axios 0.31.1 (MIT). Full applicable MIT/ISC and dependency notices remain
inside the original archive and are extracted before execution. The launcher
loads no extension code and no extension assets into its sandboxed renderer.
Missing approved payload means no Translate catalog command. This is trusted
local execution, not filesystem/network/process confinement or a general Raycast
extension installer. Web and TUI do not activate this capability.

## Trusted Raycast Kaomoji Search Candidate

Source-controlled candidate: the unchanged `index` command from Raycast extensions
revision `b7845053e3f39dadcf984217be5249fb51ab2ce8`, Kaomoji Search extension
(MIT). Exact reviewed archive SHA-256:
`9b611940dc90e7ece19c370068d2eb087ea8d125613a034a70fbbb35390bc31f`.
Raycast currently labels this extension Featured; TockTeam does not relabel it
Recommended.

The candidate contains the exact upstream source subtree, an explicitly
non-installable runtime subset, source/runtime checksums, provenance, official
metadata assets, and license inventory. It includes exact runtime bytes for
asciilib 1.0.1 (MIT), React 19.0.0 (MIT), react-reconciler 0.31.0 (MIT), and
scheduler 0.25.0 (MIT). The asciilib registry package and matching source tag
contain no standalone license text; the archive therefore labels its supplied
MIT terms as a supplemental reconstructed notice based on package metadata.

Source-control approval does not authorize execution. Kaomoji remains disabled
until finite per-extension identity, state, List/Grid/image, preference, and
action controls pass fail-closed tests and independent review. It receives no
network, browser, selected-text, arbitrary filesystem, shell/process, OAuth,
elevation, updater, Web, TUI, generic RPC, or generic extension authority.
