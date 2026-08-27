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

export const LAUNCHER_IPC_CHANNELS = Object.freeze({
  invokeAction: 'launcher:invoke-action',
  rescan: 'launcher:rescan',
  search: 'launcher:search',
})

export const LAUNCHER_SURFACE_IPC_CHANNELS = Object.freeze({
  getSettings: 'launcher:surface-settings',
  recordSearch: 'launcher:record-search',
})

/** TockLauncher composition inventory; provider execution is staged in later slices. */
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

export type LauncherSurfaceSettings = Readonly<{
  fuzziness: number
  history: readonly string[]
  historyEnabled: boolean
  historyLimit: number
  maxSearchResultItems: number
  searchEngineId: LauncherSearchEngineId
}>

const ACTION_ID_PATTERN = /^launcher-action:[0-9A-Za-z-]{1,96}$/u
const RESULT_SET_ID_PATTERN = /^launcher-results:[1-9][0-9]*$/u
const MAX_SEARCH_TERM_LENGTH = 512

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

export function parseLauncherSearchArgs(value: unknown): Readonly<{
  searchTerm: string
} & LauncherSearchOptions> {
  if (!isRecord(value)
    || !hasExactKeys(value, ['fuzziness', 'maxSearchResultItems', 'searchEngineId', 'searchTerm'])
    || typeof value.searchTerm !== 'string'
    || value.searchTerm.length > MAX_SEARCH_TERM_LENGTH
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
    || !hasExactKeys(value, ['fuzziness', 'history', 'historyEnabled', 'historyLimit', 'maxSearchResultItems', 'searchEngineId'])
    || typeof value.fuzziness !== 'number' || !Number.isFinite(value.fuzziness) || value.fuzziness < 0 || value.fuzziness > 1
    || !Array.isArray(value.history) || value.history.length > 100 || value.history.some(item => typeof item !== 'string' || item.length === 0 || item.length > 512 || /[\0\r\n]/u.test(item))
    || typeof value.historyEnabled !== 'boolean'
    || typeof value.historyLimit !== 'number' || !Number.isSafeInteger(value.historyLimit) || value.historyLimit < 1 || value.historyLimit > 100
    || typeof value.maxSearchResultItems !== 'number' || !Number.isSafeInteger(value.maxSearchResultItems) || value.maxSearchResultItems < 1 || value.maxSearchResultItems > 200
    || (value.searchEngineId !== 'Fuse.js' && value.searchEngineId !== 'fuzzysort')) {
    throw new Error('Invalid launcher surface settings')
  }
  return Object.freeze({
    fuzziness: value.fuzziness,
    history: Object.freeze([...(value.history as string[])]),
    historyEnabled: value.historyEnabled,
    historyLimit: value.historyLimit as number,
    maxSearchResultItems: value.maxSearchResultItems as number,
    searchEngineId: value.searchEngineId as LauncherSearchEngineId,
  })
}
