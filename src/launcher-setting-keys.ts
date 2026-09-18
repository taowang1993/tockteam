import { LAUNCHER_SETTINGS_CATALOG } from './launcher-setting-catalog.ts'

/** Runtime setting names accepted by the launcher owner, in manifest order. */
const CATALOG_KEYS = LAUNCHER_SETTINGS_CATALOG.map(entry => entry.key)

export const LAUNCHER_RUNTIME_SETTING_KEYS = Object.freeze([
  ...CATALOG_KEYS,
  'favorites',
  'searchEngine.excludedItems',
] as const)

export const LAUNCHER_UPSTREAM_SETTING_KEYS = Object.freeze(CATALOG_KEYS as string[])
export const LAUNCHER_INTERNAL_SETTING_KEYS = Object.freeze([
  'favorites',
  'searchEngine.excludedItems',
] as const)

export const LAUNCHER_SENSITIVE_SETTING_KEYS = Object.freeze([
  'extension[DeeplTranslator].apiKey',
] as const)

export const LAUNCHER_MAIN_OWNED_SETTING_KEYS = Object.freeze([
  'general.browser.customWebBrowser.executableFilePath',
  'general.browser.customWebBrowserName',
] as const)

export const LAUNCHER_RUNTIME_SETTING_KEY_COUNT = 102 as const

if (LAUNCHER_SETTINGS_CATALOG.length !== 100
  || LAUNCHER_RUNTIME_SETTING_KEYS.length !== LAUNCHER_RUNTIME_SETTING_KEY_COUNT
  || new Set(LAUNCHER_RUNTIME_SETTING_KEYS).size !== LAUNCHER_RUNTIME_SETTING_KEYS.length) {
  throw new Error('TockLauncher runtime setting key manifest drifted')
}

export type LauncherRuntimeSettingKey = (typeof LAUNCHER_RUNTIME_SETTING_KEYS)[number]
export type LauncherUpstreamSettingKey = (typeof LAUNCHER_UPSTREAM_SETTING_KEYS)[number]

export function isLauncherRuntimeSettingKey(value: unknown): value is LauncherRuntimeSettingKey {
  return typeof value === 'string' && (LAUNCHER_RUNTIME_SETTING_KEYS as readonly string[]).includes(value)
}

/** Settings that change indexed catalogs or provider actions require a rescan. */
export function launcherSettingRequiresProviderRescan(key: string): boolean {
  return key === 'extensions.enabledExtensionIds'
    || key === 'general.hotkey.enabled'
    || key === 'favorites'
    || key === 'searchEngine.excludedItems'
    || key.startsWith('extension[')
}
