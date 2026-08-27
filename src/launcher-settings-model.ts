import type { LauncherSearchOptions } from './launcher-core-search.ts'
import type { LauncherSettingsSnapshot } from './launcher-settings-contract.ts'
import { LAUNCHER_COMPOSITION } from './launcher-contract.ts'
import { resolveLauncherSettingDefault, type LauncherDefaultContext } from './launcher-settings-defaults.ts'

export type LauncherThemeSource = 'dark' | 'light' | 'system'
export type LauncherSurfacePreferences = Readonly<{
  alwaysOnTop: boolean
  fuzziness: number
  historyEnabled: boolean
  historyLimit: number
  language: string
  maxSearchResultItems: number
  preserveUserInput: boolean
  searchEngineId: LauncherSearchOptions['searchEngineId']
  showDockIcon: boolean
  showOnStartup: boolean
  showTrayIcon: boolean
  themeSource: LauncherThemeSource
  visibleOnAllWorkspaces: boolean
}>

export type PersistedLauncherState = Readonly<{
  enabledExtensionIds: readonly string[]
  history: readonly string[]
  preferences: LauncherSurfacePreferences
}>

const bool = (value: unknown): value is boolean => typeof value === 'boolean'
const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const text = (value: unknown): value is string => typeof value === 'string'
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 50_000 && value.every(item => typeof item === 'string' && item.length <= 512)
const engine = (value: unknown): value is LauncherSearchOptions['searchEngineId'] => value === 'fuzzysort' || value === 'Fuse.js'
const theme = (value: unknown): value is LauncherThemeSource => value === 'dark' || value === 'light' || value === 'system'

function value<T>(snapshot: LauncherSettingsSnapshot, key: string, fallback: T, valid: (candidate: unknown) => candidate is T, context?: LauncherDefaultContext): T {
  const stored = snapshot.values[key]
  if (valid(stored)) return stored
  if (context !== undefined) {
    const resolved = resolveLauncherSettingDefault(key, context)
    if (valid(resolved)) return resolved
  }
  return fallback
}

export function readPersistedLauncherState(snapshot: LauncherSettingsSnapshot, availableExtensionIds: readonly string[] = LAUNCHER_COMPOSITION.extensionIds, context?: LauncherDefaultContext): PersistedLauncherState {
  const preferences: LauncherSurfacePreferences = {
    alwaysOnTop: value(snapshot, 'window.alwaysOnTop', true, bool, context),
    fuzziness: Math.min(1, Math.max(0, value(snapshot, 'searchEngine.fuzziness', 0.5, finiteNumber, context))),
    historyEnabled: value(snapshot, 'general.searchHistory.enabled', false, bool, context),
    historyLimit: Math.min(100, Math.max(1, value(snapshot, 'general.searchHistory.limit', 10, finiteNumber, context))),
    language: value(snapshot, 'general.language', 'en-US', text, context),
    maxSearchResultItems: Math.min(200, Math.max(1, value(snapshot, 'searchEngine.maxResultLength', 50, finiteNumber, context))),
    preserveUserInput: value(snapshot, 'general.preserveUserInput', true, bool, context),
    searchEngineId: value(snapshot, 'searchEngine.id', 'fuzzysort', engine, context),
    showDockIcon: value(snapshot, 'appearance.showAppIconInDock', false, bool, context),
    showOnStartup: value(snapshot, 'window.showOnStartup', false, bool, context),
    showTrayIcon: value(snapshot, 'general.tray.showIcon', true, bool, context),
    themeSource: value(snapshot, 'appearance.themeSource', 'system', theme, context),
    visibleOnAllWorkspaces: value(snapshot, 'window.visibleOnAllWorkspaces', true, bool, context),
  }
  const enabledExtensionIds = value(snapshot, 'extensions.enabledExtensionIds', ['ApplicationSearch', 'UeliCommand'], strings, context)
    .filter(id => availableExtensionIds.includes(id))
  const history = value(snapshot, 'general.searchHistory.history', [], strings, context).slice(0, preferences.historyLimit)
  return Object.freeze({ enabledExtensionIds: Object.freeze([...enabledExtensionIds]), history: Object.freeze([...history]), preferences: Object.freeze(preferences) })
}
