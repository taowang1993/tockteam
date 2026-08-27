import path from 'node:path'
import { launcherSettingCatalogEntry } from './launcher-setting-catalog.ts'

export const LAUNCHER_DISCOVERY_EXTENSION_IDS = Object.freeze([
  'ApplicationSearch',
  'BrowserBookmarks',
  'JetBrainsToolbox',
  'VSCode',
] as const)

export type LauncherDiscoveryExtensionId = (typeof LAUNCHER_DISCOVERY_EXTENSION_IDS)[number]
export type LauncherDiscoveryPlatform = 'Linux' | 'macOS' | 'Windows'

export type LauncherDiscoveryDefaults = Readonly<{
  ApplicationSearch: Readonly<{
    includeWindowsStoreApps: boolean
    linuxFolders: readonly string[]
    macOsFolders: readonly string[]
    mdfindFilterOption: string
    windowsFileExtensions: readonly string[]
    windowsFolders: readonly string[]
  }>
  BrowserBookmarks: Readonly<{
    browsers: readonly string[]
    iconType: 'browserIcon' | 'favicon'
    searchResultStyle: 'nameAndUrl' | 'nameOnly' | 'urlOnly'
  }>
  VSCode: Readonly<{ command: string; prefix: string; showPath: boolean }>
}>

/** Resolve bounded platform defaults without writing them into settings.json. */
export function LAUNCHER_DISCOVERY_DEFAULTS(
  platform: LauncherDiscoveryPlatform,
  homePath: string,
  _appDataPath: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): LauncherDiscoveryDefaults {
  const linuxDirs = (environment.XDG_DATA_DIRS || '/usr/local/share:/usr/share')
    .split(':').filter(Boolean).slice(0, 32)
  return Object.freeze({
    ApplicationSearch: Object.freeze({
      includeWindowsStoreApps: true,
      linuxFolders: Object.freeze(linuxDirs.map(dir => path.join(dir, 'applications'))),
      macOsFolders: Object.freeze([
        '/System/Applications', '/System/Library/CoreServices', '/Applications', path.join(homePath, 'Applications'),
      ]),
      mdfindFilterOption: "kMDItemKind=='Application'",
      windowsFileExtensions: Object.freeze(['lnk']),
      windowsFolders: Object.freeze([
        'C:\\ProgramData\\Microsoft\\Windows\\Start Menu',
        path.win32.join(homePath, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu'),
      ]),
    }),
    BrowserBookmarks: Object.freeze({ browsers: Object.freeze([]), iconType: 'favicon', searchResultStyle: 'nameOnly' }),
    VSCode: Object.freeze({ command: platform === 'macOS' ? '/usr/local/bin/code %s' : 'code %s', prefix: 'vscode', showPath: false }),
  })
}

export const launcherDiscoveryDefault = LAUNCHER_DISCOVERY_DEFAULTS

export function launcherDiscoveryDefaultFor(key: string, platform: LauncherDiscoveryPlatform, homePath: string, appDataPath: string, environment?: Readonly<Record<string, string | undefined>>): unknown {
  const defaults = LAUNCHER_DISCOVERY_DEFAULTS(platform, homePath, appDataPath, environment)
  const [, extension, name] = /^extension\[([^\]]+)\]\.(.+)$/u.exec(key) ?? []
  if (extension === 'ApplicationSearch') return defaults.ApplicationSearch[name as keyof typeof defaults.ApplicationSearch]
  if (extension === 'BrowserBookmarks') return defaults.BrowserBookmarks[name as keyof typeof defaults.BrowserBookmarks]
  if (extension === 'VSCode') return defaults.VSCode[name as keyof typeof defaults.VSCode]
  return launcherSettingCatalogEntry(key)?.defaultValue
}
