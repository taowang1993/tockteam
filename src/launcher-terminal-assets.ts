export type LauncherTerminalImageKey =
  | 'terminal-command-prompt'
  | 'terminal-iterm'
  | 'terminal-powershell-core'
  | 'terminal-powershell'
  | 'terminal-macos'
  | 'terminal-windows'
  | 'terminal-wsl'

export type LauncherTerminalAsset = Readonly<{
  fileName: string
  hash: string
  key: LauncherTerminalImageKey
  source: string
}>

const rows: readonly LauncherTerminalAsset[] = [
  { fileName: 'terminal-command-prompt.png', hash: '9daa6c7d9a1237dd77c267ef9cc54b1ac0513cf5f8b3b1fbd99da402eca7c1e4', key: 'terminal-command-prompt', source: 'vendor/ueli/assets/Core/Terminal/command-prompt.png' },
  { fileName: 'terminal-iterm.png', hash: 'c7358e53c5756539d9d35379d8733f44e08ebbb598cee730083d2fb0613b0b9a', key: 'terminal-iterm', source: 'vendor/ueli/assets/Core/Terminal/iterm.png' },
  { fileName: 'terminal-powershell-core.svg', hash: '5998c6d08f3076521328a39a856ca381cdc5b5935892dd62c0557fa230e28fa8', key: 'terminal-powershell-core', source: 'vendor/ueli/assets/Core/Terminal/powershell-core.svg' },
  { fileName: 'terminal-powershell.png', hash: 'dac022e145d0c63c53908fd4cd07a6bb1ceba3149c0a9b6aa8761928e1297fe2', key: 'terminal-powershell', source: 'vendor/ueli/assets/Core/Terminal/powershell.png' },
  { fileName: 'terminal-macos.png', hash: '95ee8153a87c68f3a4a432b94c0a24a8a77961905bd049e0b7242f83be67385e', key: 'terminal-macos', source: 'vendor/ueli/assets/Core/Terminal/terminal.png' },
  { fileName: 'terminal-windows.png', hash: 'd55cfcdce8e000ec4e4490ef487b147d63d2c1ed8d063f8d01e7ffecaaf450ac', key: 'terminal-windows', source: 'vendor/ueli/assets/Core/Terminal/windows-terminal.png' },
  { fileName: 'terminal-wsl.png', hash: '8974f977ee2bb8b72917c0361a1eab77e20580e41d072efeff3f2d8a5757e0e0', key: 'terminal-wsl', source: 'vendor/ueli/assets/Core/Terminal/wsl.png' },
]

export const LAUNCHER_TERMINAL_ASSETS = Object.freeze(rows.map(row => Object.freeze(row)))
export const LAUNCHER_TERMINAL_ASSET_HASHES = Object.freeze(Object.fromEntries(rows.map(row => [row.key, row.hash])) as Record<LauncherTerminalImageKey, string>)
export const LAUNCHER_TERMINAL_ASSET_URLS = Object.freeze(Object.fromEntries(rows.map(row => [row.key, `./launcher-assets/${row.fileName}`])) as Record<LauncherTerminalImageKey, string>)

export function launcherTerminalAssetUrl(key: string): string | undefined {
  return Object.hasOwn(LAUNCHER_TERMINAL_ASSET_URLS, key)
    ? LAUNCHER_TERMINAL_ASSET_URLS[key as LauncherTerminalImageKey]
    : undefined
}
