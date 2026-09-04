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
    "description: 'Use TockTeam updates for new releases'",
  )
  replaceOnce(
    commands,
    "description: 'Restart dsh-tui and resume this session'",
    "description: 'Restart TockTeam TUI and resume this session'",
  )

  const plugin = join(lib, 'dsh-adapter', 'plugin.js')
  replaceOnce(
    plugin,
    `    void checkForTuiUpdate().then((update) => {
        if (update === undefined || exited || updateRequested)
            return;
        channel.notify(t('update-available', { current: update.current, latest: update.latest }), { color: 'warning', timeoutMs: 12000 });
    });`,
    `    if (process.env.TOCKTEAM_TUI !== '1') {
        void checkForTuiUpdate().then((update) => {
            if (update === undefined || exited || updateRequested)
                return;
            channel.notify(t('update-available', { current: update.current, latest: update.latest }), { color: 'warning', timeoutMs: 12000 });
        });
    }`,
  )
  replaceOnce(
    plugin,
    'onUpdate: profile === undefined ? undefined : () => {',
    "onUpdate: process.env.TOCKTEAM_TUI === '1' ? undefined : profile === undefined ? undefined : () => {",
  )
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
  replaceOnce(
    messages,
    "'update-unavailable': { zh: '当前运行方式不支持自动更新（需经 dsh --profile 启动），请在终端执行 dsh plugin --profile <name> update @deepseek-harness-tui/dsh-tui', en: 'Automatic update is unavailable in this launch mode (needs dsh --profile). Run dsh plugin --profile <name> update @deepseek-harness-tui/dsh-tui in a terminal.' }",
    "'update-unavailable': { zh: '更新由 TockTeam 管理；当前固定版本不能自行更新。', en: 'Updates are managed by TockTeam; this pinned renderer cannot update itself.' }",
  )
  replaceOnce(messages, "'cmd-desc-update': { zh: '更新 dsh-tui 并重启' }", "'cmd-desc-update': { zh: '通过 TockTeam 获取新版本' }")
  replaceOnce(
    messages,
    "'mcp-insert-hint': { zh: '在 profile 补丁层（~/.dsh/profiles/dsh-tui/cordis.patch.yml）insert 一行即可，例：', en: 'Insert one line in the profile patch layer (~/.dsh/profiles/dsh-tui/cordis.patch.yml), e.g.:' }",
    "'mcp-insert-hint': { zh: '在 profile 补丁层（~/.tockteam/profiles/tui/cordis.patch.yml）insert 一行即可，例：', en: 'Insert one line in the profile patch layer (~/.tockteam/profiles/tui/cordis.patch.yml), e.g.:' }",
  )
  replaceOnce(
    messages,
    "'doctor-launch-hint': { zh: '启动方式  dsh-tui.cmd / dsh --profile dsh-tui', en: 'Launch      dsh-tui.cmd / dsh --profile dsh-tui' }",
    "'doctor-launch-hint': { zh: '启动方式  tockteam tui', en: 'Launch      tockteam tui' }",
  )
  replaceOnce(
    messages,
    "'restart-starting': { zh: '正在重启 dsh-tui，完成后自动恢复当前会话……', en: 'Restarting dsh-tui. The session resumes when it comes back…' }",
    "'restart-starting': { zh: '正在重启 TockTeam TUI，完成后自动恢复当前会话……', en: 'Restarting TockTeam TUI. The session resumes when it comes back…' }",
  )
  for (const [before, after] of [
    ["'cmd-desc-quit': { zh: '退出 dsh-tui' }", "'cmd-desc-quit': { zh: '退出 TockTeam TUI' }"],
    ["'cmd-desc-q': { zh: '退出 dsh-tui' }", "'cmd-desc-q': { zh: '退出 TockTeam TUI' }"],
    ["'cmd-desc-config': { zh: '查看 dsh-tui 配置来源' }", "'cmd-desc-config': { zh: '查看 TockTeam TUI 配置来源' }"],
    ["'cmd-desc-practice': { zh: '与 dsh-tui 进行编程练习' }", "'cmd-desc-practice': { zh: '与 TockTeam TUI 进行编程练习' }"],
    ["'cmd-desc-restart': { zh: '重启 dsh-tui 并恢复当前会话' }", "'cmd-desc-restart': { zh: '重启 TockTeam TUI 并恢复当前会话' }"],
    ["'cmd-desc-exit': { zh: '退出 dsh-tui' }", "'cmd-desc-exit': { zh: '退出 TockTeam TUI' }"],
  ]) replaceOnce(messages, before, after)

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

  replaceEvery(join(lib, 'tips.js'), '~/.dsh-tui', '~/.tockteam/tui')

  const customTheme = join(lib, 'customTheme.js')
  replaceEvery(customTheme, '[dsh-tui]', '[TockTeam TUI]')
  replaceEvery(customTheme, '~/.dsh-tui', '~/.tockteam/tui')
  const themeProvider = join(lib, 'components', 'design-system', 'ThemeProvider.js')
  replaceEvery(themeProvider, '[dsh-tui]', '[TockTeam TUI]')
  replaceEvery(themeProvider, '~/.dsh-tui', '~/.tockteam/tui')
}
