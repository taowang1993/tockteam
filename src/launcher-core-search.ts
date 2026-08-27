import Fuse from 'fuse.js'
import fuzzysort from 'fuzzysort'
import {
  LAUNCHER_MAX_RESULT_ITEMS,
  type LauncherActionRecord,
  type LauncherInternalAction,
  type LauncherInternalResultItem,
} from './launcher-actions.ts'

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

type LauncherCoreSearchResult = Readonly<{
  after: readonly LauncherInternalResultItem[]
  before: readonly LauncherInternalResultItem[]
  status: LauncherCoreStatus
}>

export type LauncherCoreSearchOptions = Readonly<{
  appendLog?: (level: 'ERROR', message: string) => Promise<void>
  initialExcludedItemIds?: readonly string[]
  initialFavoriteItemIds?: readonly string[]
  initialIndexedItems?: readonly LauncherInternalResultItem[]
  loadIndexedItems: (signal: AbortSignal) => Promise<readonly LauncherInternalResultItem[]>
  persistIndex?: (items: readonly LauncherInternalResultItem[]) => Promise<void>
  persistSettings?: (values: Readonly<Record<string, unknown>>) => Promise<void>
  platform?: LauncherCorePlatform
  searchInstant?: (searchTerm: string) => Promise<Readonly<{
    after: readonly LauncherInternalResultItem[]
    before: readonly LauncherInternalResultItem[]
  }>>
}>

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message.slice(0, 512)
    : 'TockLauncher provider failed'
}

function alphabetically(left: LauncherInternalResultItem, right: LauncherInternalResultItem): number {
  return left.name.localeCompare(right.name)
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
  executeAction: (record: LauncherActionRecord) => Promise<boolean>
  flush: () => Promise<void>
  replacePersistentSettings: (settings: Readonly<{
    excludedItemIds: readonly string[]
    favoriteItemIds: readonly string[]
  }>) => void
  rescan: () => Promise<LauncherCoreStatus>
  search: (searchTerm: string, searchOptions: LauncherSearchOptions) => Promise<LauncherCoreSearchResult>
}> {
  const commandModifier = options.platform === 'macOS' ? 'Cmd' : 'Ctrl'
  let indexedItems: readonly LauncherInternalResultItem[] = Object.freeze([...(options.initialIndexedItems ?? [])])
  let indexLoaded = false
  let lastError: string | undefined
  let latestSearchToken: object | undefined
  let activeRescan: Readonly<{ controller: AbortController; token: object }> | undefined
  let rescanStatus: LauncherCoreStatus['rescanStatus'] = 'idle'
  const excluded = new Set<string>(options.initialExcludedItemIds ?? [])
  const favorites = new Set<string>(options.initialFavoriteItemIds ?? [])
  const knownItemIds = new Set<string>()
  let indexGeneration = 0
  let indexWriteTail: Promise<void> = Promise.resolve()
  let settingsMutationTail: Promise<void> = Promise.resolve()

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

  const rescan = async (): Promise<LauncherCoreStatus> => {
    activeRescan?.controller.abort(new Error('TockLauncher rescan was superseded'))
    const controller = new AbortController()
    const token = Object.freeze({})
    activeRescan = Object.freeze({ controller, token })
    rescanStatus = 'scanning'
    try {
      const loaded = await options.loadIndexedItems(controller.signal)
      if (activeRescan?.token !== token) return status()
      const nextItems = Object.freeze([...loaded])
      indexedItems = nextItems
      indexGeneration += 1
      if (options.persistIndex !== undefined) await queueIndexPersistence(nextItems)
      if (activeRescan?.token !== token) return status()
      indexLoaded = true
      lastError = undefined
      rescanStatus = 'idle'
    } catch (error) {
      if (activeRescan?.token !== token || controller.signal.aborted) return status()
      indexLoaded = true
      lastError = errorMessage(error)
      rescanStatus = 'error'
      await options.appendLog?.('ERROR', lastError)
    } finally {
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
    const trimmedSearchTerm = searchTerm.trim()
    const filtered = searchTerm.length > 0
      ? searchIndexedItems(available, trimmedSearchTerm, searchOptions)
      : available.toSorted(alphabetically)
    const favoriteItems = filtered.filter(({ id }) => favorites.has(id))
    const ordinaryItems = filtered
      .filter(({ id }) => !favorites.has(id))
      .slice(0, searchOptions.maxSearchResultItems)
    let instantBefore: readonly LauncherInternalResultItem[] = []
    let instantAfter: readonly LauncherInternalResultItem[] = []
    if (searchTerm.length > 0 && options.searchInstant !== undefined) {
      try {
        const instant = await options.searchInstant(searchTerm)
        if (indexGeneration !== searchGeneration) throw new Error('TockLauncher search was superseded')
        if (latestSearchToken === searchToken) {
          instantBefore = instant.before
          instantAfter = instant.after
          if (rescanStatus !== 'error') lastError = undefined
        }
      } catch (error) {
        if (indexGeneration !== searchGeneration) throw new Error('TockLauncher search was superseded')
        if (latestSearchToken === searchToken) lastError = errorMessage(error)
      }
    }
    if (indexGeneration !== searchGeneration) throw new Error('TockLauncher search was superseded')

    const before = favoriteItems.slice(0, LAUNCHER_MAX_RESULT_ITEMS).map(decorate)
    const after = [...instantBefore, ...ordinaryItems, ...instantAfter]
      .slice(0, LAUNCHER_MAX_RESULT_ITEMS - before.length)
      .map(decorate)
    if (latestSearchToken === searchToken) {
      knownItemIds.clear()
      for (const item of [...before, ...after]) knownItemIds.add(item.id)
    }
    return Object.freeze({
      after: Object.freeze(after),
      before: Object.freeze(before),
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
        await options.persistSettings?.({ favorites: [...favorites, record.argument] })
        favorites.add(record.argument)
        return
      }
      if (record.handlerKey === LAUNCHER_CORE_ACTION_HANDLERS.removeFavorite) {
        if (!favorites.has(record.argument)) throw new Error('TockLauncher favorite was not found')
        const nextFavorites = [...favorites].filter(id => id !== record.argument)
        await options.persistSettings?.({ favorites: nextFavorites })
        favorites.delete(record.argument)
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

  const replacePersistentSettings = (settings: Readonly<{
    excludedItemIds: readonly string[]
    favoriteItemIds: readonly string[]
  }>): void => {
    excluded.clear()
    favorites.clear()
    settings.excludedItemIds.forEach(id => excluded.add(id))
    settings.favoriteItemIds.forEach(id => favorites.add(id))
  }

  const flush = async (): Promise<void> => {
    await Promise.all([indexWriteTail, settingsMutationTail])
  }

  return Object.freeze({ executeAction, flush, replacePersistentSettings, rescan, search })
}

export { LAUNCHER_MAX_RESULT_ITEMS }
