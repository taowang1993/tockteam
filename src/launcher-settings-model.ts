import type { LauncherSearchOptions } from './launcher-core-search.ts'
import type { LauncherSettingsSnapshot } from './launcher-settings-contract.ts'
import { LAUNCHER_COMPOSITION, normalizeLauncherLocale } from './launcher-contract.ts'
import { LAUNCHER_INTERNAL_SETTING_KEYS, LAUNCHER_MAIN_OWNED_SETTING_KEYS, LAUNCHER_RUNTIME_SETTING_KEYS } from './launcher-setting-keys.ts'
import { launcherSettingCatalogEntry } from './launcher-setting-catalog.ts'

export type LauncherThemeSource = 'dark' | 'light' | 'system'
export type LauncherSurfacePreferences = Readonly<{
  alwaysOnTop: boolean
  doubleClickBehavior: 'selectSearchResultItem' | 'invokeSearchResultItem'
  fuzziness: number
  historyEnabled: boolean
  historyLimit: number
  hideWindowOn: readonly ('blur' | 'afterInvocation' | 'escapePressed')[]
  language: string
  maxSearchResultItems: number
  placeholder: string
  preserveUserInput: boolean
  searchBarAppearance: 'auto' | 'outline' | 'underline' | 'filled-darker' | 'filled-lighter'
  searchBarSize: 'small' | 'medium' | 'large'
  searchEngineId: LauncherSearchOptions['searchEngineId']
  searchResultLayout: 'compact' | 'detailed'
  scrollBehavior: 'auto' | 'smooth' | 'instant'
  showDockIcon: boolean
  showOnStartup: boolean
  showSearchIcon: boolean
  showTrayIcon: boolean
  singleClickBehavior: 'selectSearchResultItem' | 'invokeSearchResultItem'
  themeSource: LauncherThemeSource
  visibleOnAllWorkspaces: boolean
}>

export type PersistedLauncherState = Readonly<{
  enabledExtensionIds: readonly string[]
  history: readonly string[]
  preferences: LauncherSurfacePreferences
}>

export type LauncherSettingDisposition = 'effective' | 'platform-disabled' | 'status-only' | 'internal'

/** Every accepted setting is either rendered, explicitly disabled, or delegated to one owner. */
export function launcherSettingDisposition(key: string, platform: 'Linux' | 'macOS' | 'Windows'): LauncherSettingDisposition {
  if (LAUNCHER_INTERNAL_SETTING_KEYS.includes(key as never)) return 'internal'
  if (LAUNCHER_MAIN_OWNED_SETTING_KEYS.includes(key as never)
    || key === 'general.browser.customWebBrowser.commandlineArguments'
    || key === 'appearance.themeName'
    || key === 'appearance.themeSource'
    || key === 'keyboardAndMouse.dragAndDropEnabled'
    || key === 'general.language'
    || key === 'general.hotkey'
    || key === 'imageGenerator.faviconApiProvider'
    || key === 'searchEngine.automaticRescan'
    || key === 'searchEngine.rescanIntervalInSeconds'
    || key === 'window.acrylicOpacity'
    || key === 'window.backgroundMaterial'
    || key === 'window.vibrancy') return 'status-only'
  const entry = launcherSettingCatalogEntry(key)
  if (entry !== undefined && !entry.applicability.includes(platform)) return 'platform-disabled'
  return 'effective'
}

export function launcherSettingDispositions(platform: 'Linux' | 'macOS' | 'Windows'): Readonly<Record<string, LauncherSettingDisposition>> {
  const result: Record<string, LauncherSettingDisposition> = {}
  for (const key of LAUNCHER_RUNTIME_SETTING_KEYS) result[key] = launcherSettingDisposition(key, platform)
  return Object.freeze(result)
}

const bool = (value: unknown): value is boolean => typeof value === 'boolean'
const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const text = (value: unknown): value is string => typeof value === 'string'
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 50_000 && value.every(item => typeof item === 'string' && item.length <= 512)
const engine = (value: unknown): value is LauncherSearchOptions['searchEngineId'] => value === 'fuzzysort' || value === 'Fuse.js'
const theme = (value: unknown): value is LauncherThemeSource => value === 'dark' || value === 'light' || value === 'system'
const clickBehavior = (value: unknown): value is LauncherSurfacePreferences['singleClickBehavior'] => value === 'selectSearchResultItem' || value === 'invokeSearchResultItem'
const searchAppearance = (value: unknown): value is LauncherSurfacePreferences['searchBarAppearance'] => value === 'auto' || value === 'outline' || value === 'underline' || value === 'filled-darker' || value === 'filled-lighter'
const searchSize = (value: unknown): value is LauncherSurfacePreferences['searchBarSize'] => value === 'small' || value === 'medium' || value === 'large'
const resultLayout = (value: unknown): value is LauncherSurfacePreferences['searchResultLayout'] => value === 'compact' || value === 'detailed'
const scrollBehavior = (value: unknown): value is LauncherSurfacePreferences['scrollBehavior'] => value === 'auto' || value === 'smooth' || value === 'instant'
const hideWindowOn = (value: unknown): value is LauncherSurfacePreferences['hideWindowOn'] => Array.isArray(value) && new Set(value).size === value.length && value.every(reason => reason === 'blur' || reason === 'afterInvocation' || reason === 'escapePressed')

function value<T>(snapshot: LauncherSettingsSnapshot, key: string, fallback: T, valid: (candidate: unknown) => candidate is T): T {
  const stored = snapshot.values[key]
  return valid(stored) ? stored : fallback
}

export function readPersistedLauncherState(snapshot: LauncherSettingsSnapshot, availableExtensionIds: readonly string[] = LAUNCHER_COMPOSITION.extensionIds): PersistedLauncherState {
  const preferences: LauncherSurfacePreferences = {
    alwaysOnTop: value(snapshot, 'window.alwaysOnTop', true, bool),
    doubleClickBehavior: value(snapshot, 'keyboardAndMouse.doubleClickBehavior', 'invokeSearchResultItem', clickBehavior),
    fuzziness: Math.min(1, Math.max(0, value(snapshot, 'searchEngine.fuzziness', 0.5, finiteNumber))),
    historyEnabled: value(snapshot, 'general.searchHistory.enabled', false, bool),
    historyLimit: Math.min(100, Math.max(1, value(snapshot, 'general.searchHistory.limit', 10, finiteNumber))),
    hideWindowOn: Object.freeze([...value(snapshot, 'window.hideWindowOn', Object.freeze(['blur', 'afterInvocation'] as const), hideWindowOn)]),
    language: normalizeLauncherLocale(value(snapshot, 'general.language', 'en-US', text)),
    maxSearchResultItems: Math.min(200, Math.max(1, value(snapshot, 'searchEngine.maxResultLength', 50, finiteNumber))),
    placeholder: value(snapshot, 'appearance.searchBarPlaceholderText', 'Search TockTeam', text).slice(0, 512),
    preserveUserInput: value(snapshot, 'general.preserveUserInput', true, bool),
    searchBarAppearance: value(snapshot, 'appearance.searchBarAppearance', 'auto', searchAppearance),
    searchBarSize: value(snapshot, 'appearance.searchBarSize', 'large', searchSize),
    searchEngineId: value(snapshot, 'searchEngine.id', 'fuzzysort', engine),
    searchResultLayout: value(snapshot, 'appearance.searchResultListLayout', 'compact', resultLayout),
    scrollBehavior: value(snapshot, 'window.scrollBehavior', 'smooth', scrollBehavior),
    showDockIcon: value(snapshot, 'appearance.showAppIconInDock', false, bool),
    showOnStartup: value(snapshot, 'window.showOnStartup', false, bool),
    showSearchIcon: value(snapshot, 'appearance.showSearchIcon', true, bool),
    showTrayIcon: value(snapshot, 'general.tray.showIcon', true, bool),
    singleClickBehavior: value(snapshot, 'keyboardAndMouse.singleClickBehavior', 'selectSearchResultItem', clickBehavior),
    themeSource: value(snapshot, 'appearance.themeSource', 'system', theme),
    visibleOnAllWorkspaces: value(snapshot, 'window.visibleOnAllWorkspaces', true, bool),
  }
  const enabledExtensionIds = value(snapshot, 'extensions.enabledExtensionIds', ['ApplicationSearch', 'UeliCommand'], strings)
    .filter(id => availableExtensionIds.includes(id))
  const history = preferences.historyEnabled
    ? value(snapshot, 'general.searchHistory.history', [], strings).slice(0, preferences.historyLimit)
    : []
  return Object.freeze({ enabledExtensionIds: Object.freeze([...enabledExtensionIds]), history: Object.freeze([...history]), preferences: Object.freeze(preferences) })
}
