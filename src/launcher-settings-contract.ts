import { isLauncherCustomBrowserArgumentTemplate } from './launcher-custom-browser-contract.ts'
import { validateLauncherNetworkTemplate } from './launcher-network-url-policy.ts'
import { LAUNCHER_COMPOSITION } from './launcher-contract.ts'
import { LAUNCHER_INTERNAL_SETTING_KEYS, LAUNCHER_RUNTIME_SETTING_KEYS, LAUNCHER_SENSITIVE_SETTING_KEYS, LAUNCHER_MAIN_OWNED_SETTING_KEYS, isLauncherRuntimeSettingKey } from './launcher-setting-keys.ts'
import { LAUNCHER_TERMINALS, isLauncherTerminalIds, isLauncherTerminalPrefix } from './launcher-terminal-config.ts'
import { isLauncherWorkflows } from './launcher-workflow-contract.ts'

export { LAUNCHER_INTERNAL_SETTING_KEYS, LAUNCHER_SENSITIVE_SETTING_KEYS, LAUNCHER_MAIN_OWNED_SETTING_KEYS, LAUNCHER_RUNTIME_SETTING_KEYS }

export const MAX_LAUNCHER_SETTINGS_BYTES = 2 * 1024 * 1024
export const MAX_LAUNCHER_SETTING_VALUE_BYTES = 256 * 1024
export const MAX_LAUNCHER_INDEX_BYTES = 16 * 1024 * 1024
export const MAX_LAUNCHER_LOG_BYTES = 512 * 1024
export const MAX_LAUNCHER_LOG_ENTRIES = 200

const BROWSER_BOOKMARK_NAMES = new Set(['Arc', 'Brave Browser', 'Firefox', 'Google Chrome', 'Microsoft Edge', 'Yandex Browser', 'Zen'])
const UELI_EXTENSION_IDS = new Set<string>(LAUNCHER_COMPOSITION.extensionIds)
const DEEPL_SOURCE_LANGUAGES = new Set(['Auto', 'BG', 'CS', 'DA', 'DE', 'EL', 'EN', 'ES', 'ET', 'FI', 'FR', 'HU', 'ID', 'IT', 'JA', 'KO', 'LT', 'LV', 'NB', 'NL', 'PL', 'PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'ZH'])
const DEEPL_TARGET_LANGUAGES = new Set(['BG', 'CS', 'DA', 'DE', 'EL', 'EN', 'EN-GB', 'EN-US', 'ES', 'ET', 'FI', 'FR', 'HU', 'ID', 'IT', 'JA', 'KO', 'LT', 'LV', 'NB', 'NL', 'PL', 'PT', 'PT-BR', 'PT-PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'ZH'])
const HIDE_WINDOW_ON = new Set(['blur', 'afterInvocation', 'escapePressed'])
const VIBRANCY = new Set(['None', 'content', 'fullscreen-ui', 'header', 'hud', 'menu', 'popover', 'selection', 'sheet', 'sidebar', 'titlebar', 'tooltip', 'under-page', 'under-window', 'window'])
const BACKGROUND_MATERIAL = new Set(['Acrylic', 'Mica', 'None', 'Tabbed'])
const FAVICON_PROVIDERS = new Set(['Google', 'Favicone', 'DuckDuckGo'])
const CLICK_BEHAVIOR = new Set(['selectSearchResultItem', 'invokeSearchResultItem'])
const SEARCH_APPEARANCE = new Set(['auto', 'outline', 'underline', 'filled-darker', 'filled-lighter'])
const SEARCH_BAR_SIZE = new Set(['small', 'medium', 'large'])
const SEARCH_RESULT_LAYOUT = new Set(['compact', 'detailed'])
const UUID_VERSIONS = new Set(['v4', 'v6', 'v7'])
const UUID_FORMATS = new Set(['HEX', 'HSL', 'RGB'])
const MAX_TEXT = 16_384

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type LauncherSettingsRecord = Record<string, unknown>

function isRecord(value: unknown): value is LauncherSettingsRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(value: LauncherSettingsRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every(key => keys.includes(key))
}

function boundedString(value: unknown, maxLength: number, nonEmpty = true): value is string {
  return typeof value === 'string' && value.length <= maxLength && (!nonEmpty || value.length > 0) && !/[\0\r\n]/u.test(value)
}

function boundedStringArray(value: unknown, maxItems: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every(entry => boundedString(entry, 512))
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
}

function boundedJson(value: unknown, maxBytes = MAX_LAUNCHER_SETTING_VALUE_BYTES): boolean {
  try {
    const serialized = JSON.stringify(value)
    return serialized !== undefined && Buffer.byteLength(serialized, 'utf8') <= maxBytes
  } catch { return false }
}

function absolutePath(value: unknown): value is string {
  return boundedString(value, 4_096) && (value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value))
}

function discoveryPaths(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 32 && value.every(entry => absolutePath(entry))
}

function simpleFileSearchFolders(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 16) return false
  const ids = new Set<string>()
  return value.every(entry => {
    if (!isRecord(entry)) return false
    const keys = entry.excludeHiddenFiles === undefined
      ? ['id', 'path', 'recursive', 'searchFor']
      : ['excludeHiddenFiles', 'id', 'path', 'recursive', 'searchFor']
    if (!hasExactKeys(entry, keys)
      || !boundedString(entry.id, 128) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(entry.id)
      || ids.has(entry.id) || !absolutePath(entry.path)
      || typeof entry.recursive !== 'boolean'
      || (entry.excludeHiddenFiles !== undefined && typeof entry.excludeHiddenFiles !== 'boolean')
      || (entry.searchFor !== 'files' && entry.searchFor !== 'folders' && entry.searchFor !== 'filesAndFolders')) return false
    ids.add(entry.id)
    return true
  })
}

export function isAllowedLauncherVSCodeExecutable(executable: string): boolean {
  const normalized = executable.replaceAll('\\', '/').toLocaleLowerCase('en-US')
  return ['code', 'code.cmd', 'code.exe', '/usr/local/bin/code', '/opt/homebrew/bin/code'].includes(normalized)
    || /^[a-z]:\/(?:program files(?: \(x86\))?|users\/[^/]+\/appdata\/local\/programs)\/microsoft vs code(?: insiders)?\/bin\/code(?:\.cmd|\.exe)?$/u.test(normalized)
}

function vscodeCommand(value: unknown): value is string {
  if (!boundedString(value, 1_024)) return false
  const match = /^(?:"([^"]+)"|(\S+))\s+%s$/u.exec(value.trim())
  return match !== null && isAllowedLauncherVSCodeExecutable(match[1] ?? match[2] ?? '')
}

export function isAllowedLauncherEverythingCliPath(value: unknown): value is string {
  if (value === '') return true
  if (!boundedString(value, 1_024)) return false
  const normalized = value.replaceAll('/', '\\')
  if (normalized.split('\\').some(segment => segment === '.' || segment === '..')) return false
  return /^(?:[A-Za-z]:\\Program Files(?: \(x86\))?\\Everything\\es\.exe|[A-Za-z]:\\Users\\[^\\]+\\AppData\\Local\\Everything\\es\.exe)$/iu.test(normalized)
}

function customSearchEngines(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 32) return false
  const ids = new Set<string>(); const prefixes = new Set<string>()
  return value.every(entry => {
    if (!isRecord(entry) || !hasExactKeys(entry, ['encodeSearchTerm', 'id', 'name', 'prefix', 'url'])
      || !boundedString(entry.id, 128) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(entry.id) || ids.has(entry.id)
      || !boundedString(entry.name, 128) || !boundedString(entry.prefix, 64) || prefixes.has(entry.prefix)
      || typeof entry.encodeSearchTerm !== 'boolean' || !publicHttpsTemplate(entry.url)) return false
    ids.add(entry.id); prefixes.add(entry.prefix); return true
  })
}

function publicHttpsTemplate(value: unknown): value is string {
  return typeof value === 'string' && validateLauncherNetworkTemplate(value)
}

function exactBooleanRecord(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ['braces', 'hyphens', 'quotes', 'uppercase']) && Object.values(value).every(entry => typeof entry === 'boolean')
}

function uuidFormatArray(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 16 && value.every(exactBooleanRecord)
}

function hideWindowOn(value: unknown): boolean {
  return Array.isArray(value) && value.length <= HIDE_WINDOW_ON.size && new Set(value).size === value.length && value.every(entry => typeof entry === 'string' && HIDE_WINDOW_ON.has(entry))
}

function safeScalar(value: unknown, maxLength = MAX_TEXT): boolean {
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value) && Number.isSafeInteger(value)
  return typeof value === 'string' && value.length <= maxLength && !/[\0\r\n]/u.test(value)
}

/** Validate a renderer-provided value for any one of the 102 allowlisted keys. */
export function isLauncherRendererSettingValue(key: string, value: unknown): boolean {
  if (!isLauncherRuntimeSettingKey(key)) return false
  switch (key) {
    case 'extension[ApplicationSearch].includeWindowsStoreApps': return typeof value === 'boolean'
    case 'extension[ApplicationSearch].linuxFolders':
    case 'extension[ApplicationSearch].macOsFolders':
    case 'extension[ApplicationSearch].windowsFolders': return discoveryPaths(value)
    case 'extension[ApplicationSearch].windowsFileExtensions': return Array.isArray(value) && value.length <= 16 && value.every(entry => boundedString(entry, 16) && /^[A-Za-z0-9]+$/u.test(entry))
    case 'extension[ApplicationSearch].mdfindFilterOption': return value === "kind:application" || value === "kMDItemKind=='Application'" || value === "kMDItemContentType=='com.apple.application-bundle'"
    case 'extension[BrowserBookmarks].browsers': return Array.isArray(value) && value.length <= 7 && new Set(value).size === value.length && value.every(entry => typeof entry === 'string' && BROWSER_BOOKMARK_NAMES.has(entry))
    case 'extension[BrowserBookmarks].iconType': return value === 'favicon' || value === 'browserIcon'
    case 'extension[BrowserBookmarks].searchResultStyle': return value === 'nameOnly' || value === 'urlOnly' || value === 'nameAndUrl'
    case 'extension[Calculator].argumentSeparator':
    case 'extension[Calculator].decimalSeparator': return boundedString(value, 1)
    case 'extension[Calculator].precision': return integer(value, 0, 64)
    case 'extension[ColorConverter].formats': return Array.isArray(value) && value.length <= 3 && new Set(value).size === value.length && value.every(entry => typeof entry === 'string' && UUID_FORMATS.has(entry))
    case 'extension[CurrencyConversion].currencies': return Array.isArray(value) && value.length > 0 && value.length <= 32 && new Set(value).size === value.length && value.every(entry => typeof entry === 'string' && /^[a-z0-9.]{2,16}$/u.test(entry))
    case 'extension[CurrencyConversion].defaultTargetCurrency': return typeof value === 'string' && /^[a-z0-9.]{2,16}$/u.test(value)
    case 'extension[CustomWebSearch].customSearchEngines': return customSearchEngines(value)
    case 'extension[DeeplTranslator].apiKey': return boundedString(value, 8_192)
    case 'extension[DeeplTranslator].defaultSourceLanguage': return typeof value === 'string' && DEEPL_SOURCE_LANGUAGES.has(value)
    case 'extension[DeeplTranslator].defaultTargetLanguage': return typeof value === 'string' && DEEPL_TARGET_LANGUAGES.has(value)
    case 'extension[FileSearch].everythingCliFilePath': return isAllowedLauncherEverythingCliPath(value)
    case 'extension[FileSearch].maxSearchResultCount': return integer(value, 1, 100)
    case 'extension[PasswordGenerator].beginWithALetter':
    case 'extension[PasswordGenerator].includeLowercaseCharacters':
    case 'extension[PasswordGenerator].includeNumbers':
    case 'extension[PasswordGenerator].includeSymbols':
    case 'extension[PasswordGenerator].includeUppercaseCharacters':
    case 'extension[PasswordGenerator].noDuplicateCharacters':
    case 'extension[PasswordGenerator].noSequentialCharacters':
    case 'extension[PasswordGenerator].noSimilarCharacters':
    case 'extension[QuickFormatter].enableDeepFormatting':
    case 'extension[QuickFormatter].enableJson':
    case 'extension[QuickFormatter].enableStackTrace':
    case 'extension[QuickFormatter].enableXml':
    case 'extension[VSCode].showPath': return typeof value === 'boolean'
    case 'extension[PasswordGenerator].command':
    case 'extension[QuickFormatter].command':
    case 'extension[Base64Conversion].decodePrefix':
    case 'extension[Base64Conversion].encodeDecodePrefix':
    case 'extension[Base64Conversion].encodePrefix': return boundedString(value, 64)
    case 'extension[PasswordGenerator].passwordLength': return integer(value, 1, 128)
    case 'extension[PasswordGenerator].quantity': return integer(value, 1, 50)
    case 'extension[PasswordGenerator].symbols': return typeof value === 'string' && value.length <= 256 && !/[\0\r\n]/u.test(value)
    case 'extension[RowlandTextEditor].columnSeparator':
    case 'extension[RowlandTextEditor].rowSeparator': return typeof value === 'string' && value.length <= 32 && !/[\0\r\n]/u.test(value)
    case 'extension[SimpleFileSearch].folders': return simpleFileSearchFolders(value)
    case 'extension[TerminalLauncher].prefix': return isLauncherTerminalPrefix(value)
    case 'extension[TerminalLauncher].terminalIds': return isLauncherTerminalIds(value)
    case 'extension[UuidGenerator].braces':
    case 'extension[UuidGenerator].hyphens':
    case 'extension[UuidGenerator].quotes':
    case 'extension[UuidGenerator].uppercase':
    case 'extension[UuidGenerator].validateStrictly': return typeof value === 'boolean'
    case 'extension[UuidGenerator].generatorFormat': return exactBooleanRecord(value)
    case 'extension[UuidGenerator].searchResultFormats': return uuidFormatArray(value)
    case 'extension[UuidGenerator].uuidVersion': return typeof value === 'string' && UUID_VERSIONS.has(value)
    case 'extension[UuidGenerator].numberOfUuids': return integer(value, 1, 100)
    case 'extension[VSCode].command': return vscodeCommand(value)
    case 'extension[VSCode].prefix': return boundedString(value, 64)
    case 'extension[WebSearch].locale': return typeof value === 'string' && /^[a-z]{2,3}(?:-[A-Z]{2})?$/u.test(value)
    case 'extension[WebSearch].searchEngine': return value === 'DuckDuckGo' || value === 'Google'
    case 'extension[WebSearch].showInstantSearchResult': return typeof value === 'boolean'
    case 'extension[Workflow].workflows': return isLauncherWorkflows(value, 'Linux') || isLauncherWorkflows(value, 'macOS') || isLauncherWorkflows(value, 'Windows')
    case 'appearance.searchBarAppearance': return typeof value === 'string' && SEARCH_APPEARANCE.has(value)
    case 'appearance.searchBarPlaceholderText': return boundedString(value, 512)
    case 'appearance.searchBarSize': return typeof value === 'string' && SEARCH_BAR_SIZE.has(value)
    case 'appearance.searchResultListLayout': return typeof value === 'string' && SEARCH_RESULT_LAYOUT.has(value)
    case 'appearance.showAppIconInDock':
    case 'appearance.showSearchIcon':
    case 'general.browser.useDefaultWebBrowser':
    case 'general.hotkey.enabled':
    case 'general.preserveUserInput':
    case 'general.searchHistory.enabled':
    case 'general.tray.showIcon':
    case 'searchEngine.automaticRescan':
    case 'window.alwaysOnTop':
    case 'window.showOnStartup':
    case 'window.visibleOnAllWorkspaces': return typeof value === 'boolean'
    case 'appearance.themeName': return boundedString(value, 128)
    case 'appearance.themeSource': return value === 'dark' || value === 'light' || value === 'system'
    case 'extensions.enabledExtensionIds': return boundedStringArray(value, UELI_EXTENSION_IDS.size) && value.every(id => UELI_EXTENSION_IDS.has(id))
    case 'general.browser.customWebBrowser.commandlineArguments': return isLauncherCustomBrowserArgumentTemplate(value)
    case 'general.browser.customWebBrowser.executableFilePath':
    case 'general.browser.customWebBrowserName': return boundedString(value, 4_096, false)
    case 'general.hotkey': return boundedString(value, 128)
    case 'general.language': return typeof value === 'string' && value.length <= 32 && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(value)
    case 'general.searchHistory.history': return boundedStringArray(value, 100)
    case 'general.searchHistory.limit': return integer(value, 1, 100)
    case 'imageGenerator.faviconApiProvider': return typeof value === 'string' && FAVICON_PROVIDERS.has(value)
    case 'keyboardAndMouse.doubleClickBehavior':
    case 'keyboardAndMouse.singleClickBehavior': return typeof value === 'string' && CLICK_BEHAVIOR.has(value)
    case 'keyboardAndMouse.dragAndDropEnabled': return typeof value === 'boolean'
    case 'searchEngine.fuzziness': return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    case 'searchEngine.id': return value === 'Fuse.js' || value === 'fuzzysort'
    case 'searchEngine.maxResultLength': return integer(value, 1, 200)
    case 'searchEngine.rescanIntervalInSeconds': return integer(value, 1, 86_400)
    case 'window.acrylicOpacity': return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    case 'window.backgroundMaterial': return typeof value === 'string' && BACKGROUND_MATERIAL.has(value)
    case 'window.hideWindowOn': return hideWindowOn(value)
    case 'window.scrollBehavior': return value === 'auto' || value === 'smooth' || value === 'instant'
    case 'window.vibrancy': return typeof value === 'string' && VIBRANCY.has(value)
    case 'favorites':
    case 'searchEngine.excludedItems': return boundedStringArray(value, 50_000)
    default: return safeScalar(value)
  }
}

export type LauncherSettingsSnapshot = Readonly<{
  customBrowserStatus?: 'active' | 'none' | 'revoked'
  externalGrantStatus: 'active' | 'none' | 'revoked'
  externalWriteAvailable?: boolean
  logs: readonly string[]
  missingSensitiveKeys: readonly string[]
  recoveredArtifacts?: readonly ('external' | 'index' | 'logs' | 'settings')[]
  recoveredSettings: boolean
  secureStorageAvailable?: boolean
  settingsSource: 'external' | 'managed'
  values: Readonly<Record<string, unknown>>
}>

function cloneJson<T>(value: T, maxBytes = MAX_LAUNCHER_SETTING_VALUE_BYTES): T {
  if (!boundedJson(value, maxBytes)) throw new Error('TockLauncher JSON value exceeds its size limit')
  return JSON.parse(JSON.stringify(value)) as T
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  return Object.freeze(value)
}

export function isLauncherSettingKey(value: unknown): value is string {
  return isLauncherRuntimeSettingKey(value)
}

export function normalizeLauncherSearchHistory<T extends Record<string, unknown>>(settings: T): T {
  if (settings['general.searchHistory.enabled'] === true
    || !Object.hasOwn(settings, 'general.searchHistory.history')) return settings
  return { ...settings, 'general.searchHistory.history': [] }
}

/** Parse a disk/import/settings update map, including every key's validator. */
export function parseLauncherSettingsRecord(value: unknown, options: Readonly<{ omitMainOwned?: boolean; omitSensitive?: boolean }> = {}): LauncherSettingsRecord {
  if (!isRecord(value)) throw new Error('TockLauncher settings must be a JSON object')
  const parsed: LauncherSettingsRecord = {}
  for (const [key, settingValue] of Object.entries(value)) {
    if (!isLauncherRuntimeSettingKey(key)) throw new Error('TockLauncher setting key is not allowlisted')
    if (options.omitMainOwned && LAUNCHER_MAIN_OWNED_SETTING_KEYS.includes(key as never)) continue
    if (options.omitSensitive && LAUNCHER_SENSITIVE_SETTING_KEYS.includes(key as never)) continue
    if (!isLauncherRendererSettingValue(key, settingValue)) throw new Error('Invalid TockLauncher setting value')
    parsed[key] = cloneJson(settingValue)
  }
  const normalized = normalizeLauncherSearchHistory(parsed)
  if (!boundedJson(normalized, MAX_LAUNCHER_SETTINGS_BYTES)) throw new Error('TockLauncher settings file exceeds the size limit')
  return normalized
}

export function parseLauncherSettingUpdateArgs(value: unknown): Readonly<{ key: string; value: unknown }> {
  if (!isRecord(value) || !hasExactKeys(value, ['key', 'value']) || typeof value.key !== 'string'
    || !isLauncherRuntimeSettingKey(value.key)
    || LAUNCHER_INTERNAL_SETTING_KEYS.includes(value.key as never)
    || LAUNCHER_MAIN_OWNED_SETTING_KEYS.includes(value.key as never)
    || !isLauncherRendererSettingValue(value.key, value.value) || !boundedJson(value.value)) throw new Error('Invalid launcher setting update')
  return Object.freeze({ key: value.key, value: cloneJson(value.value) })
}

export function parseLauncherSettingsSnapshot(value: unknown): LauncherSettingsSnapshot {
  if (!isRecord(value)) throw new Error('Invalid launcher settings snapshot')
  const allowed = ['customBrowserStatus', 'externalGrantStatus', 'externalWriteAvailable', 'logs', 'missingSensitiveKeys', 'recoveredArtifacts', 'recoveredSettings', 'secureStorageAvailable', 'settingsSource', 'values']
  if (Object.keys(value).some(key => !allowed.includes(key))
    || !hasExactKeys(value, Object.keys(value))
    || (value.externalGrantStatus !== 'active' && value.externalGrantStatus !== 'none' && value.externalGrantStatus !== 'revoked')
    || (value.settingsSource !== 'external' && value.settingsSource !== 'managed')
    || typeof value.recoveredSettings !== 'boolean'
    || (value.customBrowserStatus !== undefined && value.customBrowserStatus !== 'active' && value.customBrowserStatus !== 'none' && value.customBrowserStatus !== 'revoked')
    || (value.externalWriteAvailable !== undefined && typeof value.externalWriteAvailable !== 'boolean')
    || (value.secureStorageAvailable !== undefined && typeof value.secureStorageAvailable !== 'boolean')
    || !Array.isArray(value.logs) || value.logs.length > MAX_LAUNCHER_LOG_ENTRIES || value.logs.some(entry => typeof entry !== 'string' || entry.length > 576 || /[\0\r\n]/u.test(entry))
    || !Array.isArray(value.missingSensitiveKeys) || new Set(value.missingSensitiveKeys).size !== value.missingSensitiveKeys.length
    || value.missingSensitiveKeys.some(key => !LAUNCHER_SENSITIVE_SETTING_KEYS.includes(key as never))
    || (value.recoveredArtifacts !== undefined && (!Array.isArray(value.recoveredArtifacts)
      || new Set(value.recoveredArtifacts).size !== value.recoveredArtifacts.length
      || value.recoveredArtifacts.some(artifact => artifact !== 'external' && artifact !== 'index' && artifact !== 'logs' && artifact !== 'settings')))
    || !isRecord(value.values)) throw new Error('Invalid launcher settings snapshot')
  const values: LauncherSettingsRecord = {}
  for (const [key, settingValue] of Object.entries(value.values)) {
    if (!isLauncherRuntimeSettingKey(key) || LAUNCHER_SENSITIVE_SETTING_KEYS.includes(key as never) || LAUNCHER_MAIN_OWNED_SETTING_KEYS.includes(key as never) || !isLauncherRendererSettingValue(key, settingValue)) throw new Error('Invalid launcher settings snapshot values')
    values[key] = cloneJson(settingValue)
  }
  const normalizedValues = normalizeLauncherSearchHistory(values)
  if (!boundedJson(normalizedValues, MAX_LAUNCHER_SETTINGS_BYTES)) throw new Error('Invalid launcher settings snapshot values')
  const snapshot = {
    ...(value.customBrowserStatus === undefined ? {} : { customBrowserStatus: value.customBrowserStatus }),
    externalGrantStatus: value.externalGrantStatus,
    ...(value.externalWriteAvailable === undefined ? {} : { externalWriteAvailable: value.externalWriteAvailable }),
    logs: [...value.logs],
    missingSensitiveKeys: [...value.missingSensitiveKeys],
    ...(value.recoveredArtifacts === undefined ? {} : { recoveredArtifacts: [...value.recoveredArtifacts] }),
    recoveredSettings: value.recoveredSettings,
    ...(value.secureStorageAvailable === undefined ? {} : { secureStorageAvailable: value.secureStorageAvailable }),
    settingsSource: value.settingsSource,
    values: normalizedValues,
  } as LauncherSettingsSnapshot
  return deepFreeze(snapshot)
}

export function parseLauncherSettingsOperationResult(value: unknown): Readonly<{ canceled?: boolean; ok: true }> {
  if (!isRecord(value) || value.ok !== true
    || (value.canceled === undefined && !hasExactKeys(value, ['ok']))
    || (value.canceled !== undefined && (!hasExactKeys(value, ['canceled', 'ok']) || typeof value.canceled !== 'boolean'))) throw new Error('Invalid launcher settings operation result')
  return Object.freeze({ ...(value.canceled === undefined ? {} : { canceled: value.canceled }), ok: true as const })
}

export const LAUNCHER_SETTINGS_KEYS = LAUNCHER_RUNTIME_SETTING_KEYS
