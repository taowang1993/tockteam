import type { LauncherSearchOptions } from './launcher-core-search.ts'
import type { LauncherSettingsSnapshot } from './launcher-settings-contract.ts'
import { LAUNCHER_COMPOSITION } from './launcher-contract.ts'

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

function value<T>(snapshot: LauncherSettingsSnapshot, key: string, fallback: T, valid: (candidate: unknown) => candidate is T): T {
  const stored = snapshot.values[key]
  return valid(stored) ? stored : fallback
}

export function readPersistedLauncherState(snapshot: LauncherSettingsSnapshot, availableExtensionIds: readonly string[] = LAUNCHER_COMPOSITION.extensionIds): PersistedLauncherState {
  const preferences: LauncherSurfacePreferences = {
    alwaysOnTop: value(snapshot, 'window.alwaysOnTop', true, bool),
    fuzziness: Math.min(1, Math.max(0, value(snapshot, 'searchEngine.fuzziness', 0.5, finiteNumber))),
    historyEnabled: value(snapshot, 'general.searchHistory.enabled', false, bool),
    historyLimit: Math.min(100, Math.max(1, value(snapshot, 'general.searchHistory.limit', 10, finiteNumber))),
    language: value(snapshot, 'general.language', 'en-US', text),
    maxSearchResultItems: Math.min(200, Math.max(1, value(snapshot, 'searchEngine.maxResultLength', 50, finiteNumber))),
    preserveUserInput: value(snapshot, 'general.preserveUserInput', true, bool),
    searchEngineId: value(snapshot, 'searchEngine.id', 'fuzzysort', engine),
    showDockIcon: value(snapshot, 'appearance.showAppIconInDock', false, bool),
    showOnStartup: value(snapshot, 'window.showOnStartup', false, bool),
    showTrayIcon: value(snapshot, 'general.tray.showIcon', true, bool),
    themeSource: value(snapshot, 'appearance.themeSource', 'system', theme),
    visibleOnAllWorkspaces: value(snapshot, 'window.visibleOnAllWorkspaces', true, bool),
  }
  const enabledExtensionIds = value(snapshot, 'extensions.enabledExtensionIds', ['ApplicationSearch', 'UeliCommand'], strings)
    .filter(id => availableExtensionIds.includes(id))
  const history = value(snapshot, 'general.searchHistory.history', [], strings).slice(0, preferences.historyLimit)
  return Object.freeze({ enabledExtensionIds: Object.freeze([...enabledExtensionIds]), history: Object.freeze([...history]), preferences: Object.freeze(preferences) })
}
