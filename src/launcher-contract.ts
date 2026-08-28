import { isLauncherImageUrl } from './launcher-image-url.ts'
import type {
  LauncherPublicResultItem,
  LauncherPublicAction,
} from './launcher-actions.ts'
import type {
  LauncherCoreStatus,
  LauncherSearchEngineId,
  LauncherSearchOptions,
} from './launcher-core-search.ts'

export const LAUNCHER_FILE_SEARCH_QUERY_PREFIX = 'tockteam:file-search:'

export const LAUNCHER_IPC_CHANNELS = Object.freeze({
  cancelAction: 'launcher:cancel-action',
  invokeAction: 'launcher:invoke-action',
  rescan: 'launcher:rescan',
  search: 'launcher:search',
})

export const LAUNCHER_SURFACE_IPC_CHANNELS = Object.freeze({
  getLocalExtensionSettings: 'launcher:local-extension-settings',
  getSettings: 'launcher:surface-settings',
  recordSearch: 'launcher:record-search',
})

/** TockLauncher composition inventory; Desktop providers execute through main-owned typed seams. */
export const LAUNCHER_COMPOSITION = Object.freeze({
  upstream: Object.freeze({
    tag: 'v9.29.0',
    commit: 'c9670d61cb2576802adf99d95622c58538d265f3',
  }),
  extensions: Object.freeze([
    'AppearanceSwitcherModule',
    'ApplicationSearchModule',
    'Base64ConversionModule',
    'BrowserBookmarksModule',
    'CalculatorModule',
    'ColorConverterExtensionModule',
    'CurrencyConversionModule',
    'CustomWebSearchModule',
    'DeeplTranslatorModule',
    'FileSearchModule',
    'JetBrainsToolboxModule',
    'PasswordGeneratorModule',
    'QuickFormatterModule',
    'RowlandTextEditorModule',
    'SimpleFileSearchExtensionModule',
    'SystemCommandsModule',
    'SystemSettingsModule',
    'TerminalLauncherModule',
    'UeliCommandModule',
    'UuidGeneratorModule',
    'VSCodeModule',
    'WebSearchExtensionModule',
    'WindowsControlPanelModule',
    'WorkflowExtensionModule',
  ] as const),
  extensionIds: Object.freeze([
    'AppearanceSwitcher',
    'ApplicationSearch',
    'Base64Conversion',
    'BrowserBookmarks',
    'Calculator',
    'ColorConverter',
    'CurrencyConversion',
    'CustomWebSearch',
    'DeeplTranslator',
    'FileSearch',
    'JetBrainsToolbox',
    'PasswordGenerator',
    'QuickFormatter',
    'RowlandTextEditor',
    'SimpleFileSearch',
    'SystemCommands',
    'SystemSettings',
    'TerminalLauncher',
    'UeliCommand',
    'UuidGenerator',
    'VSCode',
    'WebSearch',
    'WindowsControlPanel',
    'Workflow',
  ] as const),
})

export type LauncherSearchResponse = Readonly<{
  after: readonly LauncherPublicResultItem[]
  before: readonly LauncherPublicResultItem[]
  resultSetId: string
  status: LauncherCoreStatus
}>

export type LauncherInvokeResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: 'expired' }>

export type LauncherSurfacePlatform = 'Linux' | 'macOS' | 'Windows'
export type LauncherLocale = 'en-US' | 'zh-CN'
export type LauncherSearchBarAppearance = 'auto' | 'outline' | 'underline' | 'filled-darker' | 'filled-lighter'
export type LauncherSearchBarSize = 'small' | 'medium' | 'large'
export type LauncherResultLayout = 'compact' | 'detailed'
export type LauncherScrollBehavior = 'auto' | 'smooth' | 'instant'
export type LauncherClickBehavior = 'selectSearchResultItem' | 'invokeSearchResultItem'
export type LauncherProviderState = 'ready' | 'disabled' | 'unsupported' | 'unavailable'
export type LauncherProviderStatus = Readonly<{
  extensionId: (typeof LAUNCHER_COMPOSITION.extensionIds)[number]
  state: LauncherProviderState
  messageKey?: 'disabled' | 'unsupported' | 'unavailable'
}>

export type LauncherSurfaceSettings = Readonly<{
  doubleClickBehavior: LauncherClickBehavior
  dragAndDropEnabled: boolean
  fuzziness: number
  history: readonly string[]
  historyEnabled: boolean
  historyLimit: number
  hideWindowOn: readonly ('blur' | 'afterInvocation' | 'escapePressed')[]
  locale: LauncherLocale
  maxSearchResultItems: number
  placeholder: string
  preserveUserInput: boolean
  providerStatuses: readonly LauncherProviderStatus[]
  searchBarAppearance: LauncherSearchBarAppearance
  searchBarSize: LauncherSearchBarSize
  searchEngineId: LauncherSearchEngineId
  searchResultLayout: LauncherResultLayout
  scrollBehavior: LauncherScrollBehavior
  showSearchIcon: boolean
  singleClickBehavior: LauncherClickBehavior
}>

const ACTION_ID_PATTERN = /^launcher-action:[0-9A-Za-z-]{1,96}$/u
const MAX_RESULT_SET_ID_LENGTH = 64
const RESULT_SET_ID_PATTERN = /^launcher-results:[1-9][0-9]{0,46}$/u
const SURFACE_PROVIDER_IDS = new Set<string>(LAUNCHER_COMPOSITION.extensionIds)
const SEARCH_BAR_APPEARANCES = new Set<LauncherSearchBarAppearance>(['auto', 'outline', 'underline', 'filled-darker', 'filled-lighter'])
const SEARCH_BAR_SIZES = new Set<LauncherSearchBarSize>(['small', 'medium', 'large'])
const RESULT_LAYOUTS = new Set<LauncherResultLayout>(['compact', 'detailed'])
const SCROLL_BEHAVIORS = new Set<LauncherScrollBehavior>(['auto', 'smooth', 'instant'])
const CLICK_BEHAVIORS = new Set<LauncherClickBehavior>(['selectSearchResultItem', 'invokeSearchResultItem'])
const HIDE_WINDOW_REASONS = new Set(['blur', 'afterInvocation', 'escapePressed'])
export const LAUNCHER_MAX_SEARCH_TERM_LENGTH = 512
export const LAUNCHER_MAX_SEARCH_INPUT_LENGTH = LAUNCHER_FILE_SEARCH_QUERY_PREFIX.length + LAUNCHER_MAX_SEARCH_TERM_LENGTH

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every(key => keys.includes(key))
}

function hasAllowedKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  const actual = Object.keys(value)
  return required.every(key => actual.includes(key))
    && actual.every(key => required.includes(key) || optional.includes(key))
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

export function normalizeLauncherLocale(value: unknown): LauncherLocale {
  if (typeof value === 'string' && /^(?:zh|zh-CN)$/iu.test(value)) return 'zh-CN'
  return 'en-US'
}

function isLauncherProviderId(value: unknown): value is (typeof LAUNCHER_COMPOSITION.extensionIds)[number] {
  return typeof value === 'string' && SURFACE_PROVIDER_IDS.has(value)
}

export function parseLauncherProviderStatus(value: unknown): LauncherProviderStatus {
  if (!isRecord(value)
    || Object.keys(value).length < 2
    || Object.keys(value).length > 3
    || Object.keys(value).some(key => !['extensionId', 'state', 'messageKey'].includes(key))
    || !isLauncherProviderId(value.extensionId)
    || (value.state !== 'ready' && value.state !== 'disabled' && value.state !== 'unsupported' && value.state !== 'unavailable')
    || (value.messageKey !== undefined && value.messageKey !== 'disabled' && value.messageKey !== 'unsupported' && value.messageKey !== 'unavailable')) {
    throw new Error('Invalid launcher provider status')
  }
  if ((value.state === 'ready' && value.messageKey !== undefined)
    || (value.state !== 'disabled' && value.messageKey === 'disabled')
    || (value.state !== 'unsupported' && value.messageKey === 'unsupported')
    || (value.state !== 'unavailable' && value.messageKey === 'unavailable')) {
    throw new Error('Invalid launcher provider status message')
  }
  return Object.freeze({
    extensionId: value.extensionId,
    state: value.state,
    ...(value.messageKey === undefined ? null : { messageKey: value.messageKey }),
  }) as LauncherProviderStatus
}

export type LauncherShortcutEvent = Readonly<Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>>

/** Match only a finite provider-declared shortcut with an exact modifier set. */
export function launcherShortcutMatches(
  event: LauncherShortcutEvent,
  shortcut: string,
  platform: LauncherSurfacePlatform,
): boolean {
  if (typeof shortcut !== 'string' || shortcut.length === 0 || shortcut.length > 128) return false
  const parts = shortcut.split('+').map(part => part.trim()).filter(Boolean)
  const key = parts.pop()?.toLocaleLowerCase('en-US')
  if (key === undefined || parts.some(part => !['Cmd', 'Ctrl', 'Alt', 'Shift'].includes(part))) return false
  const expected = new Set(parts)
  // Platform chooses the labels providers publish; matching still honors the literal
  // modifier set so Shift+Enter and other non-primary shortcuts remain valid.
  void platform
  if (expected.has('Alt') !== event.altKey) return false
  if (expected.has('Shift') !== event.shiftKey) return false
  if (event.metaKey !== expected.has('Cmd') || event.ctrlKey !== expected.has('Ctrl')) return false
  const eventKey = event.key.toLocaleLowerCase('en-US')
  return eventKey === key
}

export function launcherShortcutLabel(shortcut: string, _platform: LauncherSurfacePlatform): string {
  return typeof shortcut === 'string' && shortcut.length <= 128 ? shortcut : ''
}

export function parseLauncherSearchArgs(value: unknown): Readonly<{
  searchTerm: string
} & LauncherSearchOptions> {
  if (!isRecord(value)
    || !hasExactKeys(value, ['fuzziness', 'maxSearchResultItems', 'searchEngineId', 'searchTerm'])
    || typeof value.searchTerm !== 'string'
    || value.searchTerm.length > (value.searchTerm.startsWith(LAUNCHER_FILE_SEARCH_QUERY_PREFIX)
      ? LAUNCHER_MAX_SEARCH_INPUT_LENGTH
      : LAUNCHER_MAX_SEARCH_TERM_LENGTH)
    || typeof value.fuzziness !== 'number'
    || !Number.isFinite(value.fuzziness)
    || value.fuzziness < 0
    || value.fuzziness > 1
    || typeof value.maxSearchResultItems !== 'number'
    || !Number.isSafeInteger(value.maxSearchResultItems)
    || value.maxSearchResultItems < 1
    || value.maxSearchResultItems > 200
    || (value.searchEngineId !== 'Fuse.js' && value.searchEngineId !== 'fuzzysort')) {
    throw new Error('Invalid launcher search term')
  }
  return Object.freeze({
    fuzziness: value.fuzziness,
    maxSearchResultItems: value.maxSearchResultItems,
    searchEngineId: value.searchEngineId as LauncherSearchEngineId,
    searchTerm: value.searchTerm,
  })
}

export function parseLauncherInvokeActionArgs(value: unknown): Readonly<{ actionId: string }> {
  if (!isRecord(value)
    || !hasExactKeys(value, ['actionId'])
    || typeof value.actionId !== 'string'
    || !ACTION_ID_PATTERN.test(value.actionId)) {
    throw new Error('Invalid launcher action ID')
  }
  return Object.freeze({ actionId: value.actionId })
}

export function parseLauncherCancelActionArgs(value: unknown): Readonly<{ actionId: string; resultSetId: string }> {
  if (!isRecord(value)
    || !hasExactKeys(value, ['actionId', 'resultSetId'])
    || typeof value.actionId !== 'string'
    || !ACTION_ID_PATTERN.test(value.actionId)
    || typeof value.resultSetId !== 'string'
    || value.resultSetId.length > MAX_RESULT_SET_ID_LENGTH
    || !RESULT_SET_ID_PATTERN.test(value.resultSetId)) {
    throw new Error('Invalid launcher cancellation')
  }
  return Object.freeze({ actionId: value.actionId, resultSetId: value.resultSetId })
}

function parsePublicAction(value: unknown): asserts value is LauncherPublicAction {
  if (!isRecord(value)
    || !hasAllowedKeys(
      value,
      ['actionId', 'description'],
      ['hideWindowAfterInvocation', 'keyboardShortcut', 'requiresConfirmation'],
    )
    || typeof value.actionId !== 'string'
    || !ACTION_ID_PATTERN.test(value.actionId)
    || !isBoundedText(value.description, 512)
    || (value.hideWindowAfterInvocation !== undefined && typeof value.hideWindowAfterInvocation !== 'boolean')
    || (value.keyboardShortcut !== undefined && !isBoundedText(value.keyboardShortcut, 128))
    || (value.requiresConfirmation !== undefined && typeof value.requiresConfirmation !== 'boolean')) {
    throw new Error('Invalid launcher action result')
  }
}

function parsePublicItem(value: unknown): asserts value is LauncherPublicResultItem {
  if (!isRecord(value)
    || !hasAllowedKeys(
      value,
      ['defaultAction', 'description', 'id', 'name', 'sourceExtension'],
      ['additionalActions', 'details', 'imageKey', 'imageUrl'],
    )
    || !isBoundedText(value.id, 512)
    || !isBoundedText(value.name, 512)
    || !isBoundedText(value.description, 2_048)
    || !isBoundedText(value.sourceExtension, 128)
    || (value.imageKey !== undefined
      && (!isBoundedText(value.imageKey, 64) || !/^[a-z][a-z0-9-]*$/u.test(value.imageKey)))
    || (value.imageUrl !== undefined && !isLauncherImageUrl(value.imageUrl))
    || (value.details !== undefined && (typeof value.details !== 'string' || value.details.length > 8_192))) {
    throw new Error('Invalid launcher search result item')
  }
  parsePublicAction(value.defaultAction)
  if (value.additionalActions !== undefined) {
    if (!Array.isArray(value.additionalActions) || value.additionalActions.length > 16) {
      throw new Error('Invalid launcher additional actions')
    }
    value.additionalActions.forEach(parsePublicAction)
  }
}

export function parseLauncherSearchResponse(value: unknown): LauncherSearchResponse {
  if (!isRecord(value)
    || !hasExactKeys(value, ['after', 'before', 'resultSetId', 'status'])
    || typeof value.resultSetId !== 'string'
    || value.resultSetId.length > MAX_RESULT_SET_ID_LENGTH
    || !RESULT_SET_ID_PATTERN.test(value.resultSetId)
    || !Array.isArray(value.before)
    || !Array.isArray(value.after)
    || value.before.length + value.after.length > 200) {
    throw new Error('Invalid launcher search response')
  }
  value.before.forEach(parsePublicItem)
  value.after.forEach(parsePublicItem)
  const status = parseLauncherCoreStatus(value.status)
  return Object.freeze({
    after: Object.freeze(value.after),
    before: Object.freeze(value.before),
    resultSetId: value.resultSetId,
    status,
  })
}

export function parseLauncherCoreStatus(value: unknown): LauncherCoreStatus {
  if (!isRecord(value)
    || !hasAllowedKeys(value, ['indexedItemCount', 'rescanStatus'], ['lastError'])
    || !Number.isSafeInteger(value.indexedItemCount)
    || (value.indexedItemCount as number) < 0
    || (value.indexedItemCount as number) > 1_000_000
    || (value.rescanStatus !== 'idle' && value.rescanStatus !== 'scanning' && value.rescanStatus !== 'error')
    || (value.lastError !== undefined
      && (typeof value.lastError !== 'string' || value.lastError.length === 0 || value.lastError.length > 512))) {
    throw new Error('Invalid launcher core status')
  }
  return Object.freeze({
    indexedItemCount: value.indexedItemCount as number,
    ...(value.lastError === undefined ? null : { lastError: value.lastError as string }),
    rescanStatus: value.rescanStatus as LauncherCoreStatus['rescanStatus'],
  })
}

export function parseLauncherInvokeResult(value: unknown): LauncherInvokeResult {
  if (isRecord(value) && hasExactKeys(value, ['ok']) && value.ok === true) {
    return Object.freeze({ ok: true as const })
  }
  if (isRecord(value)
    && hasExactKeys(value, ['ok', 'reason'])
    && value.ok === false
    && value.reason === 'expired') {
    return Object.freeze({ ok: false as const, reason: 'expired' as const })
  }
  throw new Error('Invalid launcher invocation result')
}

export function parseLauncherSuccessResult(value: unknown): Readonly<{ ok: true }> {
  if (!isRecord(value) || !hasExactKeys(value, ['ok']) || value.ok !== true) {
    throw new Error('Invalid launcher operation result')
  }
  return Object.freeze({ ok: true as const })
}

export function parseLauncherSurfaceSettings(value: unknown): LauncherSurfaceSettings {
  if (!isRecord(value)
    || !hasAllowedKeys(value,
      ['fuzziness', 'history', 'historyEnabled', 'historyLimit', 'maxSearchResultItems', 'searchEngineId'],
      ['doubleClickBehavior', 'dragAndDropEnabled', 'locale', 'placeholder', 'preserveUserInput', 'providerStatuses', 'searchBarAppearance', 'searchBarSize', 'searchResultLayout', 'scrollBehavior', 'showSearchIcon', 'singleClickBehavior'],
    )
    || typeof value.fuzziness !== 'number' || !Number.isFinite(value.fuzziness) || value.fuzziness < 0 || value.fuzziness > 1
    || !Array.isArray(value.history) || value.history.length > 100 || value.history.some(item => typeof item !== 'string' || item.length === 0 || item.length > 512 || /[\0\r\n]/u.test(item))
    || typeof value.historyEnabled !== 'boolean'
    || typeof value.historyLimit !== 'number' || !Number.isSafeInteger(value.historyLimit) || value.historyLimit < 1 || value.historyLimit > 100
    || typeof value.maxSearchResultItems !== 'number' || !Number.isSafeInteger(value.maxSearchResultItems) || value.maxSearchResultItems < 1 || value.maxSearchResultItems > 200
    || (value.searchEngineId !== 'Fuse.js' && value.searchEngineId !== 'fuzzysort')) {
    throw new Error('Invalid launcher surface settings')
  }
  const locale = value.locale === undefined ? 'en-US' : normalizeLauncherLocale(value.locale)
  const placeholder = value.placeholder === undefined ? 'Search TockTeam' : value.placeholder
  const providerStatuses = value.providerStatuses === undefined ? [] : value.providerStatuses
  if (!isBoundedText(placeholder, 512) || /[\0\r\n]/u.test(placeholder)
    || (value.locale !== undefined && value.locale !== 'en-US' && value.locale !== 'zh-CN')
    || !Array.isArray(providerStatuses) || providerStatuses.length > LAUNCHER_COMPOSITION.extensionIds.length) {
    throw new Error('Invalid launcher surface settings')
  }
  const parsedStatuses = providerStatuses.map(parseLauncherProviderStatus)
  const statusIds = new Set<string>()
  for (const status of parsedStatuses) {
    if (statusIds.has(status.extensionId)) throw new Error('Duplicate launcher provider status')
    statusIds.add(status.extensionId)
  }
  if (value.providerStatuses !== undefined && (parsedStatuses.length !== LAUNCHER_COMPOSITION.extensionIds.length
    || parsedStatuses.some((status, index) => status.extensionId !== LAUNCHER_COMPOSITION.extensionIds[index]))) {
    throw new Error('Launcher provider status projection is incomplete')
  }
  const hideWindowOn = value.hideWindowOn === undefined ? ['blur', 'afterInvocation'] : value.hideWindowOn
  const doubleClickBehavior = value.doubleClickBehavior === undefined ? 'invokeSearchResultItem' : value.doubleClickBehavior
  const singleClickBehavior = value.singleClickBehavior === undefined ? 'selectSearchResultItem' : value.singleClickBehavior
  const searchBarAppearance = value.searchBarAppearance === undefined ? 'auto' : value.searchBarAppearance
  const searchBarSize = value.searchBarSize === undefined ? 'large' : value.searchBarSize
  const searchResultLayout = value.searchResultLayout === undefined ? 'compact' : value.searchResultLayout
  const scrollBehavior = value.scrollBehavior === undefined ? 'smooth' : value.scrollBehavior
  if (!CLICK_BEHAVIORS.has(doubleClickBehavior as LauncherClickBehavior)
    || !CLICK_BEHAVIORS.has(singleClickBehavior as LauncherClickBehavior)
    || !SEARCH_BAR_APPEARANCES.has(searchBarAppearance as LauncherSearchBarAppearance)
    || !SEARCH_BAR_SIZES.has(searchBarSize as LauncherSearchBarSize)
    || !RESULT_LAYOUTS.has(searchResultLayout as LauncherResultLayout)
    || !SCROLL_BEHAVIORS.has(scrollBehavior as LauncherScrollBehavior)
    || (value.dragAndDropEnabled !== undefined && typeof value.dragAndDropEnabled !== 'boolean')
    || (value.preserveUserInput !== undefined && typeof value.preserveUserInput !== 'boolean')
    || (value.showSearchIcon !== undefined && typeof value.showSearchIcon !== 'boolean')
    || !Array.isArray(hideWindowOn) || hideWindowOn.length > 3 || new Set(hideWindowOn).size !== hideWindowOn.length || hideWindowOn.some(reason => typeof reason !== 'string' || !HIDE_WINDOW_REASONS.has(reason))) {
    throw new Error('Invalid launcher surface settings')
  }
  return Object.freeze({
    doubleClickBehavior: doubleClickBehavior as LauncherClickBehavior,
    dragAndDropEnabled: value.dragAndDropEnabled === true,
    fuzziness: value.fuzziness,
    history: Object.freeze([...(value.history as string[])]),
    historyEnabled: value.historyEnabled,
    historyLimit: value.historyLimit as number,
    hideWindowOn: Object.freeze([...(hideWindowOn as string[])]) as LauncherSurfaceSettings['hideWindowOn'],
    locale,
    maxSearchResultItems: value.maxSearchResultItems as number,
    placeholder,
    preserveUserInput: value.preserveUserInput !== false,
    providerStatuses: Object.freeze(parsedStatuses),
    searchBarAppearance: searchBarAppearance as LauncherSearchBarAppearance,
    searchBarSize: searchBarSize as LauncherSearchBarSize,
    searchEngineId: value.searchEngineId as LauncherSearchEngineId,
    searchResultLayout: searchResultLayout as LauncherResultLayout,
    scrollBehavior: scrollBehavior as LauncherScrollBehavior,
    showSearchIcon: value.showSearchIcon !== false,
    singleClickBehavior: singleClickBehavior as LauncherClickBehavior,
  })
}
