export type LauncherTerminalPlatform = 'Linux' | 'macOS' | 'Windows'

export type LauncherTerminalId =
  | 'Command Prompt'
  | 'iTerm'
  | 'Powershell'
  | 'Powershell Core'
  | 'Terminal'
  | 'WSL'

export type LauncherTerminalDefinition = Readonly<{
  assetKey: string
  id: LauncherTerminalId
  isEnabledByDefault: boolean
  name: string
}>

export const LAUNCHER_TERMINALS: Readonly<Record<LauncherTerminalPlatform, readonly LauncherTerminalDefinition[]>> = Object.freeze({
  Linux: Object.freeze([]),
  macOS: Object.freeze([
    Object.freeze({ assetKey: 'terminal-macos', id: 'Terminal', isEnabledByDefault: true, name: 'Terminal' }),
    Object.freeze({ assetKey: 'terminal-iterm', id: 'iTerm', isEnabledByDefault: false, name: 'iTerm' }),
  ]),
  Windows: Object.freeze([
    Object.freeze({ assetKey: 'terminal-command-prompt', id: 'Command Prompt', isEnabledByDefault: true, name: 'Command Prompt' }),
    Object.freeze({ assetKey: 'terminal-powershell', id: 'Powershell', isEnabledByDefault: false, name: 'Powershell' }),
    Object.freeze({ assetKey: 'terminal-powershell-core', id: 'Powershell Core', isEnabledByDefault: false, name: 'Powershell Core' }),
    Object.freeze({ assetKey: 'terminal-wsl', id: 'WSL', isEnabledByDefault: false, name: 'WSL' }),
  ]),
})

const TERMINAL_IDS = new Set<LauncherTerminalId>(Object.values(LAUNCHER_TERMINALS).flatMap(items => items.map(item => item.id)))

export function isLauncherTerminalPrefix(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 32
    && value.trim() === value
    && !/[\0\r\n]/u.test(value)
}

export function isLauncherTerminalIds(value: unknown): value is LauncherTerminalId[] {
  return Array.isArray(value)
    && value.length <= TERMINAL_IDS.size
    && new Set(value).size === value.length
    && value.every(id => typeof id === 'string' && TERMINAL_IDS.has(id as LauncherTerminalId))
}

export function launcherTerminalDefaults(platform: LauncherTerminalPlatform): readonly LauncherTerminalId[] {
  return Object.freeze(LAUNCHER_TERMINALS[platform].filter(item => item.isEnabledByDefault).map(item => item.id))
}
