import { LAUNCHER_LOCAL_EXTENSION_DEFAULTS, LAUNCHER_PASSWORD_SYMBOLS } from './launcher-local-extension-config.ts'
import { LAUNCHER_NETWORK_EXTENSION_DEFAULTS } from './launcher-network-extension-config.ts'
import { LAUNCHER_DISCOVERY_DEFAULTS, type LauncherDiscoveryPlatform } from './launcher-discovery-extensions.ts'
import { launcherTerminalDefaults, type LauncherTerminalId } from './launcher-terminal-config.ts'
import { LAUNCHER_SETTINGS_CATALOG, launcherSettingCatalogEntry } from './launcher-setting-catalog.ts'

export type LauncherDefaultContext = Readonly<{
  appDataPath?: string
  environment?: Readonly<Record<string, string | undefined>>
  homePath: string
  locale?: string
  platform: LauncherDiscoveryPlatform
  terminalIds?: readonly LauncherTerminalId[]
}>

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function placeholder(locale: string): string {
  if (locale.toLowerCase().startsWith('zh')) return '在此输入…'
  if (locale.toLowerCase().startsWith('de')) return 'Hier eingeben…'
  if (locale.toLowerCase().startsWith('fr')) return 'Saisissez ici…'
  return 'Type here...'
}

const HIDE_WINDOW_ON = Object.freeze(['blur', 'afterInvocation', 'escapePressed'])

/** Resolve effective settings without writing defaults into the override map. */
export function resolveLauncherSettingDefault(key: string, context: LauncherDefaultContext): unknown {
  const discovery = LAUNCHER_DISCOVERY_DEFAULTS(context.platform, context.homePath, context.appDataPath ?? '', context.environment)
  switch (key) {
    case 'extension[ApplicationSearch].includeWindowsStoreApps': return discovery.ApplicationSearch.includeWindowsStoreApps
    case 'extension[ApplicationSearch].linuxFolders': return clone(discovery.ApplicationSearch.linuxFolders)
    case 'extension[ApplicationSearch].macOsFolders': return clone(discovery.ApplicationSearch.macOsFolders)
    case 'extension[ApplicationSearch].mdfindFilterOption': return discovery.ApplicationSearch.mdfindFilterOption
    case 'extension[ApplicationSearch].windowsFileExtensions': return clone(discovery.ApplicationSearch.windowsFileExtensions)
    case 'extension[ApplicationSearch].windowsFolders': return clone(discovery.ApplicationSearch.windowsFolders)
    case 'extension[BrowserBookmarks].browsers': return []
    case 'extension[BrowserBookmarks].iconType': return 'favicon'
    case 'extension[BrowserBookmarks].searchResultStyle': return 'nameOnly'
    case 'extension[CustomWebSearch].customSearchEngines': return clone(LAUNCHER_NETWORK_EXTENSION_DEFAULTS.CustomWebSearch.customSearchEngines)
    case 'extension[TerminalLauncher].terminalIds': return clone(context.terminalIds ?? launcherTerminalDefaults(context.platform))
    case 'extension[VSCode].command': return context.platform === 'macOS' ? '/usr/local/bin/code %s' : 'code %s'
    case 'appearance.searchBarPlaceholderText': return placeholder(context.locale ?? 'en-US')
    case 'appearance.showSearchIcon': return false
    case 'searchEngine.rescanIntervalInSeconds': return 300
    case 'window.hideWindowOn': return clone(HIDE_WINDOW_ON)
    // Approved TockTeam safety divergences from the Ueli rows.
    case 'window.alwaysOnTop': return true
    case 'window.showOnStartup': return false
    case 'window.visibleOnAllWorkspaces': return true
    case 'extension[DeeplTranslator].apiKey': return ''
    case 'extension[UuidGenerator].braces':
    case 'extension[UuidGenerator].hyphens':
    case 'extension[UuidGenerator].quotes':
    case 'extension[UuidGenerator].uppercase': return undefined
    case 'extension[PasswordGenerator].symbols': return LAUNCHER_PASSWORD_SYMBOLS
    default: {
      const entry = launcherSettingCatalogEntry(key)
      if (entry === undefined || entry.defaultKind !== 'literal') return undefined
      return clone(entry.defaultValue)
    }
  }
}

export const LAUNCHER_DEFAULT_CATALOG = LAUNCHER_SETTINGS_CATALOG
