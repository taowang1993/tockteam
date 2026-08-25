import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const TUI_PRODUCT_NAME = 'TockTeam TUI'

function replaceOnce(path, before, after) {
  const source = readFileSync(path, 'utf8')
  if (source.includes(after)) return
  const first = source.indexOf(before)
  if (first === -1 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`TUI upstream adapter seam changed: ${path}`)
  }
  writeFileSync(path, source.slice(0, first) + after + source.slice(first + before.length))
}

function replaceEvery(path, before, after) {
  const source = readFileSync(path, 'utf8')
  if (!source.includes(before)) {
    if (source.includes(after)) return
    throw new Error(`TUI upstream adapter seam changed: ${path}`)
  }
  writeFileSync(path, source.split(before).join(after))
}

/**
 * Apply the deliberately small TockTeam adapter to a copied upstream package.
 * The submodule remains pristine; exact-match guards fail the build when an
 * upstream update moves a seam that needs a fresh review.
 */
export function adaptTuiRendererPackage(packageDir) {
  const lib = join(packageDir, 'lib', 'types')
  replaceOnce(
    join(lib, 'components', 'LogoV2.js'),
    "sweep('✦ dsh-TUI', t, wordmarkRGB, wordmarkShimmerRGB, 60)",
    "sweep(process.env.TOCKTEAM_TUI_TITLE ?? 'TockTeam TUI', t, wordmarkRGB, wordmarkShimmerRGB, 60)",
  )
  replaceOnce(
    join(lib, 'components', 'LogoV2.js'),
    "'  v' + VERSION",
    "'  v' + (process.env.TOCKTEAM_TUI_VERSION ?? VERSION)",
  )
  replaceOnce(
    join(lib, 'screens', 'Chat.js'),
    'useTerminalTitle(`${titlePrefix} 🐋 ${channel.sessionTitle}`);',
    "useTerminalTitle(`${titlePrefix} ${process.env.TOCKTEAM_TUI_TITLE ?? 'TockTeam TUI'} · ${channel.sessionTitle}`);",
  )
  const paths = join(lib, 'utils', 'paths.js')
  // TockTeam has always owned ~/.tockteam/tui. Do not import the upstream
  // ~/.dsh-tui or ~/.dsh-cc roots into this distribution during upgrades.
  const dataRoot = "process.env.TOCKTEAM_TUI_CONFIG_HOME ?? join(homeDir(), '.tockteam', 'tui')"
  replaceOnce(paths, "export const DATA_DIR = join(homeDir(), '.dsh-tui');", `export const DATA_DIR = ${dataRoot};`)
  replaceOnce(paths, "export const LEGACY_DATA_DIR = join(homeDir(), '.dsh-cc');", 'export const LEGACY_DATA_DIR = DATA_DIR;')

  const commands = join(lib, 'commands.js')
  replaceOnce(
    commands,
    "description: 'Show the dsh-tui configuration source'",
    "description: 'Show the TockTeam TUI configuration source'",
  )
  replaceOnce(
    commands,
    "description: 'Practice programming with dsh-tui'",
    "description: 'Practice programming with TockTeam TUI'",
  )
  replaceEvery(
    commands,
    "description: 'Exit dsh-tui'",
    "description: 'Exit TockTeam TUI'",
  )
  replaceOnce(
    commands,
    "description: 'Update dsh-tui and restart'",
    "description: 'Update TockTeam TUI and restart'",
  )

  const plugin = join(lib, 'dsh-adapter', 'plugin.js')
  replaceEvery(plugin, 'dsh-tui --resume', 'tockteam tui --resume')
  replaceOnce(plugin, 'Resume with the command below:', 'Resume with:')
  replaceEvery(
    plugin,
    'dsh-tui requires an interactive terminal',
    'TockTeam TUI requires an interactive terminal',
  )
  replaceEvery(
    plugin,
    'dsh-tui: exit after error:',
    'TockTeam TUI: exit after error:',
  )
  replaceEvery(plugin, 'dsh-tui crashed:', 'TockTeam TUI crashed:')

  const messages = join(lib, 'i18n.js')
  replaceEvery(messages, '~/.dsh-tui', '~/.tockteam/tui')
  replaceEvery(messages, '# dsh-tui session export', '# TockTeam TUI session export')
  replaceEvery(messages, '# dsh-tui 会话导出', '# TockTeam TUI 会话导出')

  const channel = join(lib, 'dsh-adapter', 'channel.js')
  replaceOnce(
    channel,
    '`dsh-tui-export-${Date.now()}.md`',
    '`tockteam-tui-export-${Date.now()}.md`',
  )
  replaceOnce(
    channel,
    "join(userHome, '.dsh-tui/cordis.yml')",
    "join(process.env.TOCKTEAM_TUI_CONFIG_HOME ?? join(userHome, '.tockteam', 'tui'), 'cordis.yml')",
  )

  const customTheme = join(lib, 'customTheme.js')
  replaceEvery(customTheme, '[dsh-tui]', '[TockTeam TUI]')
  replaceEvery(customTheme, '~/.dsh-tui', '~/.tockteam/tui')
  const themeProvider = join(lib, 'components', 'design-system', 'ThemeProvider.js')
  replaceEvery(themeProvider, '[dsh-tui]', '[TockTeam TUI]')
  replaceEvery(themeProvider, '~/.dsh-tui', '~/.tockteam/tui')
}
