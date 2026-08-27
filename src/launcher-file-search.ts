import { createHash } from 'node:crypto'
import path from 'node:path'
import type { LauncherActionRecord, LauncherInternalAction, LauncherInternalResultItem } from './launcher-actions.ts'
import { LAUNCHER_FILE_SEARCH_QUERY_PREFIX } from './launcher-contract.ts'
import { isLauncherRendererSettingValue } from './launcher-settings-contract.ts'
import type {
  LauncherFileSearchEntry,
  LauncherFileSearchIdentity,
  LauncherFileSearchPlatform,
  LauncherFileSearchScanners,
  LauncherSimpleFileSearchFolder,
} from './launcher-file-search-scanners.ts'

export type { LauncherFileSearchEntry, LauncherFileSearchIdentity, LauncherFileSearchPlatform, LauncherFileSearchScanners, LauncherSimpleFileSearchFolder } from './launcher-file-search-scanners.ts'

export const LAUNCHER_FILE_SEARCH_EXTENSION_IDS = Object.freeze(['FileSearch', 'SimpleFileSearch'] as const)
type LauncherFileSearchExtensionId = typeof LAUNCHER_FILE_SEARCH_EXTENSION_IDS[number]

const HANDLERS = Object.freeze({
  invoke: 'open-file-search-extension',
  open: 'open-file-search-path',
  reveal: 'reveal-file-search-path',
})
const MAX_SIMPLE_RESULTS = 200
const MAX_FILE_SEARCH_RESULTS = 100
const MAX_ARGUMENT_TEXT = 16_384
const QUERY_TIMEOUT_MS = 8_000
const ACTION_VALIDATION_TIMEOUT_MS = 1_000
const DEFAULT_SCAN_TIMEOUT_MS = 10_000
const MAX_SCAN_TIMEOUT_MS = 60_000

type FileSearchOptions = Readonly<{
  effects: Readonly<{
    openPath: (target: string) => Promise<void> | void
    revealPath: (target: string) => Promise<void> | void
  }>
  enabledExtensionIds: () => readonly string[]
  getSetting: <T>(key: string, fallback: T) => T
  homePath: string
  onProviderError?: (extensionId: LauncherFileSearchExtensionId, error: Error) => void
  platform: LauncherFileSearchPlatform
  scanTimeoutMs?: number
  scanners: LauncherFileSearchScanners
}>

type KnownPath = Readonly<{ entry: LauncherFileSearchEntry; root?: string }>
type FileSearchInstantResult = Readonly<{
  after: readonly LauncherInternalResultItem[]
  before: readonly LauncherInternalResultItem[]
  lastError?: string
}>

function emptySearch(lastError?: string): FileSearchInstantResult {
  return Object.freeze({
    after: Object.freeze([]),
    before: Object.freeze([]),
    ...(lastError === undefined ? null : { lastError }),
  })
}

function error(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback)
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw error(signal.reason, 'TockLauncher file search canceled')
}

function throwIfNotCurrent(signal: AbortSignal, generation: number, currentGeneration: number): void {
  throwIfAborted(signal)
  if (generation !== currentGeneration) throw new Error('TockLauncher file search was superseded')
}

function bounded(value: unknown, maxLength = MAX_ARGUMENT_TEXT): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && !/[\0\r\n]/u.test(value)
}

function pathApi(platform: LauncherFileSearchPlatform): typeof path.posix | typeof path.win32 {
  return platform === 'Windows' ? path.win32 : path.posix
}

function isWithinHome(platform: LauncherFileSearchPlatform, homePath: string, candidate: string, strict = false): boolean {
  const api = pathApi(platform)
  if (!bounded(homePath, 4_096) || !bounded(candidate) || !api.isAbsolute(homePath) || !api.isAbsolute(candidate)) return false
  const relative = api.relative(api.resolve(homePath), api.resolve(candidate))
  return (!strict && relative === '') || (relative !== '' && !relative.startsWith('..') && !api.isAbsolute(relative))
}

function sameIdentity(left: LauncherFileSearchIdentity, right: LauncherFileSearchIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function asFolderSettings(value: unknown): readonly LauncherSimpleFileSearchFolder[] {
  if (!isLauncherRendererSettingValue('extension[SimpleFileSearch].folders', value) || !Array.isArray(value)) return Object.freeze([])
  return Object.freeze(value.map(entry => {
    const row = entry as Record<string, unknown>
    return Object.freeze({
      ...(row.excludeHiddenFiles === undefined ? null : { excludeHiddenFiles: row.excludeHiddenFiles as boolean }),
      id: row.id as string,
      path: row.path as string,
      recursive: row.recursive as boolean,
      searchFor: row.searchFor as LauncherSimpleFileSearchFolder['searchFor'],
    })
  }))
}

function encodedPath(target: string): string {
  return JSON.stringify(Object.freeze({ kind: 'path', target, version: 1 }))
}

function pathAction(handlerKey: string, description: string, target: string, hideWindowAfterInvocation: boolean, keyboardShortcut?: string): LauncherInternalAction {
  return Object.freeze({
    argument: encodedPath(target),
    description,
    handlerKey,
    hideWindowAfterInvocation,
    ...(keyboardShortcut === undefined ? null : { keyboardShortcut }),
    requiresConfirmation: false,
  })
}

function itemId(extensionId: LauncherFileSearchExtensionId, target: string): string {
  const prefix = extensionId === 'FileSearch' ? 'file-search-result' : 'simple-file-search'
  return `${prefix}:${createHash('sha256').update(target).digest('hex')}`
}

function parsePathArgument(raw: string): string {
  if (!bounded(raw)) throw new Error('Invalid file-search action argument')
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('Invalid file-search action argument') }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Invalid file-search action argument')
  const value = parsed as Record<string, unknown>
  const keys = Object.keys(value)
  if (keys.length !== 3 || !keys.includes('kind') || !keys.includes('target') || !keys.includes('version')
    || value.kind !== 'path' || value.version !== 1 || !bounded(value.target)) {
    throw new Error('Invalid file-search action argument')
  }
  return value.target
}

async function runBounded<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(parentSignal?.reason instanceof Error ? parentSignal.reason : new Error('TockLauncher file search canceled'))
  if (parentSignal?.aborted) abortFromParent()
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true })
  const timer = setTimeout(() => controller.abort(new Error(timeoutMessage)), timeoutMs)
  try {
    if (controller.signal.aborted) throw controller.signal.reason
    const pending = Promise.resolve().then(() => operation(controller.signal))
    return await new Promise<T>((resolve, reject) => {
      let settled = false
      const finish = (value: T | undefined, reason?: unknown): void => {
        if (settled) return
        settled = true
        controller.signal.removeEventListener('abort', rejectOnAbort)
        if (reason === undefined) resolve(value as T)
        else reject(error(reason, 'TockLauncher file search operation failed'))
      }
      const rejectOnAbort = () => finish(undefined, controller.signal.reason)
      if (controller.signal.aborted) rejectOnAbort()
      else controller.signal.addEventListener('abort', rejectOnAbort, { once: true })
      void pending.then(value => finish(value), reason => finish(undefined, reason))
    })
  } finally {
    clearTimeout(timer)
    parentSignal?.removeEventListener('abort', abortFromParent)
  }
}

export function createLauncherFileSearchExtensions(options: FileSearchOptions): Readonly<{
  close: () => Promise<void>
  executeAction: (record: LauncherActionRecord) => Promise<boolean>
  invalidate: () => void
  loadIndexedItems: (signal: AbortSignal) => Promise<readonly LauncherInternalResultItem[]>
  searchInstant: (searchTerm: string) => Promise<FileSearchInstantResult>
}> {
  const scanTimeoutMs = Number.isSafeInteger(options.scanTimeoutMs)
    ? Math.max(1, Math.min(MAX_SCAN_TIMEOUT_MS, options.scanTimeoutMs as number))
    : DEFAULT_SCAN_TIMEOUT_MS
  const enabled = (): ReadonlySet<string> => new Set(options.enabledExtensionIds())
  let simpleActions = new Set<string>()
  let fileActions = new Set<string>()
  let knownSimple = new Map<string, KnownPath>()
  let knownFile = new Map<string, KnownPath>()
  let activeQuery: Readonly<{ controller: AbortController; generation: number }> | undefined
  const activeScanControllers = new Set<AbortController>()
  const activeValidations = new Set<AbortController>()
  const activeWork = new Set<Promise<unknown>>()
  let queryGeneration = 0
  let scanGeneration = 0
  let simpleActionGeneration = 0
  let fileActionGeneration = 0
  let closed = false
  const providerErrors = new Set<LauncherFileSearchExtensionId>()

  const providerErrorStatus = (): string | undefined => providerErrors.has('FileSearch')
    ? 'File Search is unavailable. Check the native provider configuration.'
    : providerErrors.has('SimpleFileSearch')
      ? 'Simple File Search is unavailable. Check configured roots.'
      : undefined
  const reportProviderError = (extensionId: LauncherFileSearchExtensionId, reason: unknown): void => {
    providerErrors.add(extensionId)
    options.onProviderError?.(extensionId, error(reason, `${extensionId} provider failed`))
  }
  const clearProviderError = (extensionId: LauncherFileSearchExtensionId): void => { providerErrors.delete(extensionId) }
  const abortActiveValidations = (): void => {
    for (const controller of activeValidations) controller.abort(new Error('TockLauncher file search action was superseded'))
  }
  const abortActiveScans = (): void => {
    for (const controller of activeScanControllers) controller.abort(new Error('TockLauncher file search scan was superseded'))
  }
  const trackWork = <T>(work: Promise<T>): Promise<T> => {
    let tracked!: Promise<T>
    tracked = work.then(
      value => { activeWork.delete(tracked); return value },
      reason => { activeWork.delete(tracked); throw reason },
    )
    activeWork.add(tracked)
    return tracked
  }
  const clearActions = (): void => {
    ++simpleActionGeneration
    ++fileActionGeneration
    abortActiveValidations()
    simpleActions = new Set()
    fileActions = new Set()
    knownSimple = new Map()
    knownFile = new Map()
  }
  const invalidateFileActions = (): void => {
    ++fileActionGeneration
    abortActiveValidations()
    fileActions = new Set()
    knownFile = new Map()
  }
  const invalidate = (): void => {
    ++scanGeneration
    ++queryGeneration
    clearActions()
    abortActiveScans()
    activeQuery?.controller.abort(new Error('TockLauncher file search was invalidated'))
    activeQuery = undefined
  }

  const mapEntry = (
    extensionId: LauncherFileSearchExtensionId,
    entry: LauncherFileSearchEntry,
    actions: Set<string>,
    known: Map<string, KnownPath>,
    root?: string,
  ): LauncherInternalResultItem | undefined => {
    if (!bounded(entry.path) || !isWithinHome(options.platform, options.homePath, entry.path, true)
      || (entry.type !== 'file' && entry.type !== 'folder')
      || !bounded(entry.identity?.dev, 128) || !bounded(entry.identity?.ino, 128)) return undefined
    const api = pathApi(options.platform)
    const target = api.normalize(entry.path)
    const name = api.basename(target)
    const details = api.dirname(target)
    if (!bounded(name, 512) || !bounded(details, 8_192)) return undefined
    const open = pathAction(HANDLERS.open, `Open ${entry.type}`, target, true)
    const reveal = pathAction(
      HANDLERS.reveal,
      options.platform === 'macOS' ? 'Show in Finder' : 'Show in file explorer',
      target,
      false,
      options.platform === 'macOS' ? 'Cmd+O' : 'Ctrl+O',
    )
    actions.add(open.argument); actions.add(reveal.argument)
    const knownEntry = Object.freeze({ entry: Object.freeze({ ...entry, path: target }), ...(root === undefined ? null : { root }) })
    known.set(open.argument, knownEntry)
    known.set(reveal.argument, knownEntry)
    return Object.freeze({
      additionalActions: Object.freeze([reveal]),
      defaultAction: open,
      description: entry.type === 'folder' ? 'Folder' : 'File',
      details,
      id: itemId(extensionId, target),
      imageKey: extensionId === 'FileSearch'
        ? 'file-search-folder'
        : `simple-file-search-${options.platform === 'macOS' ? 'macos' : options.platform.toLocaleLowerCase('en-US')}`,
      name,
      sourceExtension: extensionId,
    })
  }

  const loadIndexedItems = async (signal: AbortSignal): Promise<readonly LauncherInternalResultItem[]> => {
    if (closed) throw new Error('TockLauncher file search is closed')
    const generation = ++scanGeneration
    abortActiveScans()
    activeQuery?.controller.abort(new Error('TockLauncher file search scan superseded'))
    activeQuery = undefined
    clearActions()
    clearProviderError('FileSearch')
    clearProviderError('SimpleFileSearch')
    const scanController = new AbortController()
    const abortFromSignal = (): void => scanController.abort(signal.reason instanceof Error ? signal.reason : new Error('TockLauncher file search canceled'))
    if (signal.aborted) abortFromSignal()
    else signal.addEventListener('abort', abortFromSignal, { once: true })
    activeScanControllers.add(scanController)
    try {
      const enabledIds = enabled()
      const nextSimpleActions = new Set<string>()
      const nextFileActions = new Set<string>()
      const nextSimple = new Map<string, KnownPath>()
      const nextFile = new Map<string, KnownPath>()
      const items: LauncherInternalResultItem[] = []
      if (enabledIds.has('FileSearch')) {
        if (options.platform === 'Linux') reportProviderError('FileSearch', new Error('File Search is unsupported on Linux'))
        else items.push(Object.freeze({
          defaultAction: Object.freeze({ argument: 'FileSearch', description: 'Search files', handlerKey: HANDLERS.invoke, hideWindowAfterInvocation: false, requiresConfirmation: false }),
          description: 'File Search', id: 'file-search:invoke', imageKey: 'file-search-folder', name: 'Search files', sourceExtension: 'FileSearch',
        }))
      }
      if (!enabledIds.has('SimpleFileSearch')) return Object.freeze(items)
      const folders = asFolderSettings(options.getSetting('extension[SimpleFileSearch].folders', []))
      let count = 0
      const seen = new Set<string>()
      for (const folder of folders) {
        if (scanController.signal.aborted || signal.aborted) throw error(signal.reason, 'TockLauncher file search canceled')
        if (!isWithinHome(options.platform, options.homePath, folder.path, true)) {
          reportProviderError('SimpleFileSearch', new Error('Configured root is outside the allowed home scope'))
          continue
        }
        try {
          const entries = await runBounded(scanSignal => {
            throwIfAborted(scanSignal)
            return trackWork(options.scanners.scanSimpleFolder({
              folder,
              homePath: options.homePath,
              maxResults: MAX_SIMPLE_RESULTS - count,
              maxVisitedEntries: 10_000,
              scanTimeoutMs,
              signal: scanSignal,
            }))
          }, scanController.signal, scanTimeoutMs, `Simple File Search root timed out: ${folder.path}`)
          throwIfNotCurrent(scanController.signal, generation, scanGeneration)
          for (const entry of entries) {
            throwIfNotCurrent(scanController.signal, generation, scanGeneration)
            if (count >= MAX_SIMPLE_RESULTS || seen.has(entry.path)) continue
            const target = pathApi(options.platform).normalize(entry.path)
            if (seen.has(target)) continue
            const mapped = mapEntry('SimpleFileSearch', { ...entry, path: target }, nextSimpleActions, nextSimple, folder.path)
            if (mapped === undefined) continue
            seen.add(target); items.push(mapped); count += 1
          }
        } catch (reason) {
          if (signal.aborted || generation !== scanGeneration || closed) throw error(signal.reason, 'TockLauncher file search canceled')
          reportProviderError('SimpleFileSearch', reason)
        }
        if (count >= MAX_SIMPLE_RESULTS) break
      }
      throwIfNotCurrent(scanController.signal, generation, scanGeneration)
      simpleActions = nextSimpleActions; fileActions = nextFileActions
      knownSimple = nextSimple; knownFile = nextFile
      return Object.freeze(items)
    } finally {
      activeScanControllers.delete(scanController)
      signal.removeEventListener('abort', abortFromSignal)
    }
  }

  const searchInstant = async (searchTerm: string): Promise<FileSearchInstantResult> => {
    const generation = ++queryGeneration
    activeQuery?.controller.abort(new Error('TockLauncher file search query superseded'))
    activeQuery = undefined
    invalidateFileActions()
    if (typeof searchTerm !== 'string' || searchTerm.length > 512 || /[\0\r\n]/u.test(searchTerm)
      || !enabled().has('FileSearch') || !searchTerm.startsWith(LAUNCHER_FILE_SEARCH_QUERY_PREFIX)) return emptySearch(providerErrorStatus())
    const queryTerm = searchTerm.slice(LAUNCHER_FILE_SEARCH_QUERY_PREFIX.length).trim()
    if (queryTerm.length === 0 || queryTerm.length > 512 || /[\0\r\n]/u.test(queryTerm)) return emptySearch()
    if (options.platform === 'Linux') {
      reportProviderError('FileSearch', new Error('File Search is unsupported on Linux'))
      return emptySearch(providerErrorStatus())
    }
    clearProviderError('FileSearch')
    const controller = new AbortController()
    activeQuery = Object.freeze({ controller, generation })
    const maxSetting = options.getSetting('extension[FileSearch].maxSearchResultCount', 20)
    const maxResults = Number.isSafeInteger(maxSetting) && (maxSetting as number) >= 1 && (maxSetting as number) <= MAX_FILE_SEARCH_RESULTS
      ? maxSetting as number
      : 20
    const everything = options.getSetting('extension[FileSearch].everythingCliFilePath', '')
    const everythingCliFilePath = typeof everything === 'string' ? everything : ''
    try {
      const entries = await runBounded(signal => {
        throwIfAborted(signal)
        return trackWork(options.scanners.queryFileSearch({
          everythingCliFilePath,
          homePath: options.homePath,
          maxResults,
          platform: options.platform,
          searchTerm: queryTerm,
          signal,
        }))
      }, controller.signal, QUERY_TIMEOUT_MS, 'File Search query timed out')
      if (activeQuery?.controller !== controller || activeQuery.generation !== generation || controller.signal.aborted || generation !== queryGeneration) return emptySearch()
      const nextActions = new Set<string>(); const nextKnown = new Map<string, KnownPath>(); const items: LauncherInternalResultItem[] = []
      for (const entry of entries.slice(0, maxResults)) {
        const mapped = mapEntry('FileSearch', entry, nextActions, nextKnown)
        if (mapped !== undefined) items.push(mapped)
      }
      if (generation !== queryGeneration || activeQuery?.controller !== controller) return emptySearch()
      fileActions = nextActions; knownFile = nextKnown
      const lastError = providerErrorStatus()
      return Object.freeze({ after: Object.freeze(items), before: Object.freeze([]), ...(lastError === undefined ? null : { lastError }) })
    } catch (reason) {
      if (activeQuery?.controller !== controller || generation !== queryGeneration || closed) return emptySearch()
      reportProviderError('FileSearch', reason)
      return emptySearch(providerErrorStatus())
    } finally {
      if (activeQuery?.controller === controller) activeQuery = undefined
    }
  }

  const executeAction = async (record: LauncherActionRecord): Promise<boolean> => {
    if (closed) throw new Error('TockLauncher file search is closed')
    if (record.sourceExtension !== 'FileSearch' && record.sourceExtension !== 'SimpleFileSearch') return false
    if (record.handlerKey === HANDLERS.invoke) {
      if (record.sourceExtension !== 'FileSearch' || record.argument !== 'FileSearch' || options.platform === 'Linux' || !enabled().has('FileSearch')) throw new Error('Invalid File Search invocation')
      return true
    }
    if (record.handlerKey !== HANDLERS.open && record.handlerKey !== HANDLERS.reveal) throw new Error('Invalid file-search action handler')
    const isFileSearch = record.sourceExtension === 'FileSearch'
    const known = isFileSearch ? knownFile : knownSimple
    const actions = isFileSearch ? fileActions : simpleActions
    const actionGeneration = isFileSearch ? fileActionGeneration : simpleActionGeneration
    if (!actions.has(record.argument)) throw new Error('File-search action is not from the current main-owned result set')
    const target = parsePathArgument(record.argument)
    const current = known.get(record.argument)
    if (current === undefined || current.entry.path !== target || current.entry.identity === undefined) throw new Error('File-search action is not from the current main-owned result set')
    const validationController = new AbortController()
    activeValidations.add(validationController)
    let valid = false
    try {
      valid = await runBounded(signal => options.scanners.validatePath({
        expectedKind: current.entry.type,
        homePath: options.homePath,
        identity: current.entry.identity,
        path: target,
        platform: options.platform,
        ...(current.root === undefined ? null : { root: current.root }),
        signal,
      }), validationController.signal, ACTION_VALIDATION_TIMEOUT_MS, 'File-search action validation timed out')
    } finally { activeValidations.delete(validationController) }
    const latestKnown = isFileSearch ? knownFile : knownSimple
    const latestActions = isFileSearch ? fileActions : simpleActions
    const latestGeneration = isFileSearch ? fileActionGeneration : simpleActionGeneration
    if (!valid || validationController.signal.aborted || closed || latestGeneration !== actionGeneration
      || !latestActions.has(record.argument) || latestKnown.get(record.argument) !== current) {
      throw new Error('File-search action target failed immediate revalidation')
    }
    if (record.handlerKey === HANDLERS.open) await options.effects.openPath(target)
    else await options.effects.revealPath(target)
    return true
  }

  const close = async (): Promise<void> => {
    if (closed) {
      while (activeWork.size > 0) await Promise.allSettled([...activeWork])
      return
    }
    closed = true
    ++scanGeneration; ++queryGeneration
    activeQuery?.controller.abort(new Error('TockLauncher file search is closed'))
    activeQuery = undefined
    abortActiveScans()
    clearActions()
    while (activeWork.size > 0) await Promise.allSettled([...activeWork])
  }

  return Object.freeze({ close, executeAction, invalidate, loadIndexedItems, searchInstant })
}
