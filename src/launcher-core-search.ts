import Fuse from 'fuse.js'
import fuzzysort from 'fuzzysort'
import {
  LAUNCHER_MAX_RESULT_ITEMS,
  type LauncherActionRecord,
  type LauncherInternalAction,
  type LauncherInternalResultItem,
} from './launcher-actions.ts'
import {
  LAUNCHER_RECENT_RESULT_LIMIT,
  pruneLauncherRanking,
  rankLauncherItems,
  recordLauncherUsage,
  type LauncherRankingEntry,
} from './launcher-ranking.ts'

export const LAUNCHER_CORE_ACTION_HANDLERS = Object.freeze({
  addFavorite: 'launcher-add-favorite',
  exclude: 'launcher-exclude-result',
  removeFavorite: 'launcher-remove-favorite',
})

export type LauncherSearchEngineId = 'Fuse.js' | 'fuzzysort'
export type LauncherCorePlatform = 'Linux' | 'macOS' | 'Windows'

export type LauncherSearchOptions = Readonly<{
  fuzziness: number
  maxSearchResultItems: number
  searchEngineId: LauncherSearchEngineId
}>

export type LauncherCoreStatus = Readonly<{
  indexedItemCount: number
  lastError?: string
  rescanStatus: 'error' | 'idle' | 'scanning'
}>

export type LauncherSearchSectionId = 'pinned' | 'recent' | 'commands' | 'applications' | 'results'

export type LauncherCoreSearchSection = Readonly<{
  id: LauncherSearchSectionId
  items: readonly LauncherInternalResultItem[]
}>

type LauncherCoreSearchResult = Readonly<{
  after: readonly LauncherInternalResultItem[]
  before: readonly LauncherInternalResultItem[]
  sections: readonly LauncherCoreSearchSection[]
  status: LauncherCoreStatus
}>

/** Only these existing providers may fill the unpinned opening screen. */
export const LAUNCHER_OPENING_SCREEN_SOURCE_SECTIONS = Object.freeze({
  AppearanceSwitcher: 'commands',
  ApplicationSearch: 'applications',
  Base64Conversion: 'commands',
  Calculator: 'commands',
  ColorConverter: 'commands',
  CurrencyConversion: 'commands',
  CustomWebSearch: 'commands',
  DeeplTranslator: 'commands',
  PasswordGenerator: 'commands',
  QuickFormatter: 'commands',
  RowlandTextEditor: 'commands',
  SystemCommands: 'commands',
  SystemSettings: 'commands',
  TerminalLauncher: 'commands',
  TockTeam: 'commands',
  UeliCommand: 'commands',
  UuidGenerator: 'commands',
  WebSearch: 'commands',
  WindowsControlPanel: 'commands',
  Workflow: 'commands',
} as const satisfies Readonly<Record<string, 'commands' | 'applications'>>)

export type LauncherCoreSearchOptions = Readonly<{
  appendLog?: (level: 'ERROR', message: string) => Promise<void>
  initialExcludedItemIds?: readonly string[]
  initialFavoriteItemIds?: readonly string[]
  initialIndexedItems?: readonly LauncherInternalResultItem[]
  initialRanking?: readonly LauncherRankingEntry[]
  getIndexedError?: () => string | undefined
  loadIndexedItems: (signal: AbortSignal, preserveSignal?: AbortSignal) => Promise<readonly LauncherInternalResultItem[]>
  now?: () => number
  persistIndex?: (items: readonly LauncherInternalResultItem[]) => Promise<void>
  persistSettings?: (values: Readonly<Record<string, unknown>>) => Promise<void>
  persistUsage?: (itemId: string, now: number) => Promise<void>
  platform?: LauncherCorePlatform
  searchInstant?: (searchTerm: string) => Promise<Readonly<{
    after: readonly LauncherInternalResultItem[]
    before: readonly LauncherInternalResultItem[]
    lastError?: string
  }>>
}>

function errorMessage(_error: unknown): string {
  // Provider errors are untrusted and may contain paths, URLs, or user input.
  return 'TockLauncher provider failed'
}

function alphabetically(left: LauncherInternalResultItem, right: LauncherInternalResultItem): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
}

function openingSectionFor(item: LauncherInternalResultItem): 'commands' | 'applications' | undefined {
  if (!Object.hasOwn(LAUNCHER_OPENING_SCREEN_SOURCE_SECTIONS, item.sourceExtension)) return undefined
  return LAUNCHER_OPENING_SCREEN_SOURCE_SECTIONS[item.sourceExtension as keyof typeof LAUNCHER_OPENING_SCREEN_SOURCE_SECTIONS]
}

function searchIndexedItems(
  searchResultItems: readonly LauncherInternalResultItem[],
  searchTerm: string,
  options: LauncherSearchOptions,
): LauncherInternalResultItem[] {
  if (options.searchEngineId === 'Fuse.js') {
    return new Fuse([...searchResultItems], {
      keys: ['name'],
      shouldSort: true,
      threshold: options.fuzziness,
    })
      .search(searchTerm)
      .slice(0, options.maxSearchResultItems)
      .map(result => result.item)
  }
  // Ueli inverts fuzzysort's strictness scale and rounds it to one decimal.
  const threshold = Math.round((1 - options.fuzziness) * 10) / 10
  return fuzzysort.go(searchTerm, [...searchResultItems], {
    key: 'name',
    limit: options.maxSearchResultItems,
    threshold,
  }).map(result => result.obj)
}

function coreAction(
  handlerKey: string,
  argument: string,
  description: string,
  keyboardShortcut: string,
): LauncherInternalAction {
  return Object.freeze({
    argument,
    description,
    handlerKey,
    hideWindowAfterInvocation: false,
    keyboardShortcut,
    requiresConfirmation: false,
  })
}

export function createLauncherCoreSearch(options: LauncherCoreSearchOptions): Readonly<{
  close: () => Promise<void>
  executeAction: (record: LauncherActionRecord) => Promise<boolean>
  flush: () => Promise<void>
  recordUsage: (itemId: string) => Promise<void>
  replaceRanking: (ranking: readonly LauncherRankingEntry[]) => void
  invalidate: (reason?: string, preserveSignal?: AbortSignal) => void
  replacePersistentSettings: (settings: Readonly<{
    excludedItemIds: readonly string[]
    favoriteItemIds: readonly string[]
  }>) => void
  rescan: (signal?: AbortSignal, preserveSignal?: AbortSignal) => Promise<LauncherCoreStatus>
  search: (searchTerm: string, searchOptions: LauncherSearchOptions) => Promise<LauncherCoreSearchResult>
}> {
  const commandModifier = options.platform === 'macOS' ? 'Cmd' : 'Ctrl'
  const now = options.now ?? Date.now
  let indexedItems: readonly LauncherInternalResultItem[] = Object.freeze([...(options.initialIndexedItems ?? [])])
  let ranking: readonly LauncherRankingEntry[] = pruneLauncherRanking(options.initialRanking ?? [], now())
  let indexLoaded = false
  let hasValidatedIndex = false
  let lastError: string | undefined
  let latestSearchToken: object | undefined
  let activeRescan: Readonly<{ controller: AbortController; token: object }> | undefined
  let rescanStatus: LauncherCoreStatus['rescanStatus'] = 'idle'
  const excluded = new Set<string>(options.initialExcludedItemIds ?? [])
  const favorites = new Set<string>()
  const favoriteOrder: string[] = []
  for (const id of options.initialFavoriteItemIds ?? []) {
    if (favorites.has(id)) continue
    favorites.add(id)
    favoriteOrder.push(id)
  }
  const knownItemIds = new Set<string>()
  let indexGeneration = 0
  let indexWriteTail: Promise<void> = Promise.resolve()
  let settingsMutationTail: Promise<void> = Promise.resolve()
  let closed = false
  const activeOperations = new Set<Promise<unknown>>()

  const status = (): LauncherCoreStatus => Object.freeze({
    indexedItemCount: indexedItems.length,
    ...(lastError === undefined ? null : { lastError }),
    rescanStatus,
  })

  const queueIndexPersistence = (items: readonly LauncherInternalResultItem[]): Promise<void> => {
    const write = indexWriteTail
      .catch(() => undefined)
      .then(async () => { await options.persistIndex?.(items) })
    indexWriteTail = write.catch(() => undefined)
    return write
  }

  const queueSettingsMutation = (mutation: () => Promise<void>): Promise<void> => {
    const operation = settingsMutationTail.then(mutation)
    settingsMutationTail = operation.catch(() => undefined)
    return operation
  }

  const rescan = async (parentSignal?: AbortSignal, preserveSignal?: AbortSignal): Promise<LauncherCoreStatus> => {
    knownItemIds.clear()
    activeRescan?.controller.abort(new Error('TockLauncher rescan was superseded'))
    const controller = new AbortController()
    const abortFromParent = (): void => { controller.abort(parentSignal?.reason instanceof Error ? parentSignal.reason : new Error('TockLauncher rescan was canceled')) }
    if (parentSignal?.aborted) abortFromParent()
    else parentSignal?.addEventListener('abort', abortFromParent, { once: true })
    const token = Object.freeze({})
    activeRescan = Object.freeze({ controller, token })
    rescanStatus = 'scanning'
    try {
      if (controller.signal.aborted) throw controller.signal.reason
      const loaded = await options.loadIndexedItems(controller.signal, preserveSignal)
      if (activeRescan?.token !== token || controller.signal.aborted) return status()
      const nextItems = Object.freeze([...loaded])
      const indexedError = options.getIndexedError?.()
      indexedItems = nextItems
      indexGeneration += 1
      if (options.persistIndex !== undefined) await queueIndexPersistence(nextItems)
      if (activeRescan?.token !== token || controller.signal.aborted) return status()
      indexLoaded = true
      hasValidatedIndex = true
      lastError = indexedError
      rescanStatus = indexedError === undefined ? 'idle' : 'error'
    } catch (error) {
      if (activeRescan?.token !== token || controller.signal.aborted) return status()
      indexLoaded = true
      if (!hasValidatedIndex) {
        // A persisted cache improves recovery evidence but never grants action authority.
        indexedItems = Object.freeze([])
        knownItemIds.clear()
        indexGeneration += 1
      }
      lastError = errorMessage(error)
      rescanStatus = 'error'
      await options.appendLog?.('ERROR', lastError)
    } finally {
      parentSignal?.removeEventListener('abort', abortFromParent)
      if (activeRescan?.token === token) activeRescan = undefined
    }
    return status()
  }

  const decorate = (item: LauncherInternalResultItem): LauncherInternalResultItem => {
    const favoriteAction = favorites.has(item.id)
      ? coreAction(
        LAUNCHER_CORE_ACTION_HANDLERS.removeFavorite,
        item.id,
        'Remove from Favorites',
        `${commandModifier}+F`,
      )
      : coreAction(
        LAUNCHER_CORE_ACTION_HANDLERS.addFavorite,
        item.id,
        'Add to Favorites',
        `${commandModifier}+F`,
      )
    return Object.freeze({
      ...item,
      additionalActions: Object.freeze([
        ...(item.additionalActions ?? []),
        favoriteAction,
        coreAction(
          LAUNCHER_CORE_ACTION_HANDLERS.exclude,
          item.id,
          'Exclude from Search Results',
          `${commandModifier}+Delete`,
        ),
      ]),
    })
  }

  const search = async (
    searchTerm: string,
    searchOptions: LauncherSearchOptions,
  ): Promise<LauncherCoreSearchResult> => {
    const searchToken = Object.freeze({})
    latestSearchToken = searchToken
    if (!indexLoaded) await rescan()

    const searchGeneration = indexGeneration
    const available = indexedItems.filter(({ id }) => !excluded.has(id))
    const availableById = new Map<string, LauncherInternalResultItem>()
    for (const item of available) if (!availableById.has(item.id)) availableById.set(item.id, item)
    const trimmedSearchTerm = searchTerm.trim()
    const filtered = trimmedSearchTerm.length > 0
      ? searchIndexedItems(available, trimmedSearchTerm, searchOptions)
      : available.toSorted(alphabetically)
    const favoriteItems = trimmedSearchTerm.length > 0
      ? filtered.filter(({ id }) => favorites.has(id))
      : favoriteOrder
        .map(id => availableById.get(id))
        .filter((item): item is LauncherInternalResultItem => item !== undefined)
    const ordinaryItems = trimmedSearchTerm.length > 0
      ? filtered
        .filter(({ id }) => !favorites.has(id))
        .slice(0, searchOptions.maxSearchResultItems)
      : []
    let instantBefore: readonly LauncherInternalResultItem[] = []
    let instantAfter: readonly LauncherInternalResultItem[] = []
    if (trimmedSearchTerm.length > 0 && options.searchInstant !== undefined) {
      try {
        const instant = await options.searchInstant(trimmedSearchTerm)
        if (indexGeneration !== searchGeneration) throw new Error('TockLauncher search was superseded')
        if (latestSearchToken === searchToken) {
          instantBefore = instant.before
          instantAfter = instant.after
          if (instant.lastError !== undefined) lastError = instant.lastError
          else if (rescanStatus !== 'error') lastError = undefined
        }
      } catch (error) {
        if (indexGeneration !== searchGeneration) throw new Error('TockLauncher search was superseded')
        if (latestSearchToken === searchToken) lastError = errorMessage(error)
      }
    }
    if (indexGeneration !== searchGeneration) throw new Error('TockLauncher search was superseded')

    let beforeItems = favoriteItems.slice(0, LAUNCHER_MAX_RESULT_ITEMS)
    let afterItems: readonly LauncherInternalResultItem[] = [...instantBefore, ...ordinaryItems, ...instantAfter]
      .slice(0, Math.max(0, LAUNCHER_MAX_RESULT_ITEMS - beforeItems.length))
    let sections: readonly LauncherCoreSearchSection[]
    if (trimmedSearchTerm.length === 0) {
      beforeItems = beforeItems.slice(0, Math.min(searchOptions.maxSearchResultItems, LAUNCHER_MAX_RESULT_ITEMS))
      const pinnedIds = new Set(beforeItems.map(item => item.id))
      const uniqueAvailable = [...availableById.values()]
      const remaining = Math.max(0, Math.min(searchOptions.maxSearchResultItems, LAUNCHER_MAX_RESULT_ITEMS) - beforeItems.length)
      const recentItems = rankLauncherItems(
        uniqueAvailable.filter(item => !pinnedIds.has(item.id)),
        ranking,
        now(),
      ).slice(0, Math.min(LAUNCHER_RECENT_RESULT_LIMIT, remaining))
      const recentIds = new Set(recentItems.map(item => item.id))
      const commands = uniqueAvailable
        .filter(item => !pinnedIds.has(item.id) && !recentIds.has(item.id) && openingSectionFor(item) === 'commands')
        .toSorted(alphabetically)
      const applications = uniqueAvailable
        .filter(item => !pinnedIds.has(item.id) && !recentIds.has(item.id) && openingSectionFor(item) === 'applications')
        .toSorted(alphabetically)
      const commandItems = commands.slice(0, Math.max(0, remaining - recentItems.length))
      const applicationItems = applications.slice(0, Math.max(0, remaining - recentItems.length - commandItems.length))
      afterItems = [...recentItems, ...commandItems, ...applicationItems]
      sections = [
        { id: 'pinned' as const, items: beforeItems },
        { id: 'recent' as const, items: recentItems },
        { id: 'commands' as const, items: commandItems },
        { id: 'applications' as const, items: applicationItems },
      ]
        .filter(section => section.items.length > 0)
        .map(section => Object.freeze({ id: section.id, items: Object.freeze([...section.items]) }))
    } else {
      sections = [
        { id: 'pinned' as const, items: beforeItems },
        { id: 'results' as const, items: afterItems },
      ]
        .filter(section => section.items.length > 0)
        .map(section => Object.freeze({ id: section.id, items: Object.freeze([...section.items]) }))
    }
    const before = Object.freeze(beforeItems.map(decorate))
    const after = Object.freeze(afterItems.map(decorate))
    sections = Object.freeze(sections.map(section => Object.freeze({
      id: section.id,
      items: Object.freeze(section.items.map(decorate)),
    })))
    if (latestSearchToken === searchToken) {
      knownItemIds.clear()
      for (const item of [...before, ...after]) knownItemIds.add(item.id)
    }
    return Object.freeze({
      after,
      before,
      sections,
      status: status(),
    })
  }

  const executeAction = async (record: LauncherActionRecord): Promise<boolean> => {
    const handlers = Object.values(LAUNCHER_CORE_ACTION_HANDLERS) as string[]
    if (!handlers.includes(record.handlerKey)) return false
    await queueSettingsMutation(async () => {
      if (!knownItemIds.has(record.argument)) throw new Error('TockLauncher core item is unknown')

      if (record.handlerKey === LAUNCHER_CORE_ACTION_HANDLERS.addFavorite) {
        if (favorites.has(record.argument)) throw new Error('TockLauncher item is already a favorite')
        const nextFavorites = [...favoriteOrder, record.argument]
        await options.persistSettings?.({ favorites: nextFavorites })
        favorites.add(record.argument)
        if (!favoriteOrder.includes(record.argument)) favoriteOrder.push(record.argument)
        return
      }
      if (record.handlerKey === LAUNCHER_CORE_ACTION_HANDLERS.removeFavorite) {
        if (!favorites.has(record.argument)) throw new Error('TockLauncher favorite was not found')
        const nextFavorites = favoriteOrder.filter(id => id !== record.argument)
        await options.persistSettings?.({ favorites: nextFavorites })
        favorites.delete(record.argument)
        favoriteOrder.splice(0, favoriteOrder.length, ...nextFavorites)
        return
      }
      if (excluded.has(record.argument)) throw new Error('TockLauncher item is already excluded')
      const nextFavorites = [...favorites].filter(id => id !== record.argument)
      await options.persistSettings?.({
        favorites: nextFavorites,
        'searchEngine.excludedItems': [...excluded, record.argument],
      })
      excluded.add(record.argument)
      favorites.delete(record.argument)
    })
    return true
  }

  const recordUsage = async (itemId: string): Promise<void> => {
    const timestamp = now()
    await options.persistUsage?.(itemId, timestamp)
    ranking = recordLauncherUsage(ranking, itemId, timestamp)
  }

  const replaceRanking = (next: readonly LauncherRankingEntry[]): void => {
    ranking = pruneLauncherRanking(next, now())
  }

  const invalidate = (reason = 'TockLauncher core search was invalidated', _preserveSignal?: AbortSignal): void => {
    ++indexGeneration
    latestSearchToken = undefined
    knownItemIds.clear()
    activeRescan?.controller.abort(new Error(reason))
  }

  const replacePersistentSettings = (settings: Readonly<{
    excludedItemIds: readonly string[]
    favoriteItemIds: readonly string[]
  }>): void => {
    excluded.clear()
    favorites.clear()
    favoriteOrder.splice(0, favoriteOrder.length)
    settings.excludedItemIds.forEach(id => excluded.add(id))
    settings.favoriteItemIds.forEach(id => {
      if (favorites.has(id)) return
      favorites.add(id)
      favoriteOrder.push(id)
    })
  }

  const track = <T>(operation: () => Promise<T>): Promise<T> => {
    if (closed) return Promise.reject(new Error('TockLauncher core search is closed'))
    const active = operation()
    activeOperations.add(active)
    active.then(
      () => { activeOperations.delete(active) },
      () => { activeOperations.delete(active) },
    )
    return active
  }

  const flush = async (): Promise<void> => {
    while (activeOperations.size > 0) await Promise.allSettled([...activeOperations])
    await Promise.all([indexWriteTail, settingsMutationTail])
  }

  const close = async (): Promise<void> => {
    if (closed) { await flush(); return }
    closed = true
    invalidate('TockLauncher core search is closed')
    await flush()
  }

  return Object.freeze({
    close,
    executeAction: (record: LauncherActionRecord) => track(async () => await executeAction(record)),
    flush,
    recordUsage: (itemId: string) => track(async () => await recordUsage(itemId)),
    replaceRanking,
    invalidate,
    replacePersistentSettings,
    rescan: (signal?: AbortSignal, preserveSignal?: AbortSignal) => track(async () => await rescan(signal, preserveSignal)),
    search: (searchTerm: string, searchOptions: LauncherSearchOptions) => track(async () => await search(searchTerm, searchOptions)),
  })
}

export { LAUNCHER_MAX_RESULT_ITEMS }
