import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LAUNCHER_FILE_SEARCH_QUERY_PREFIX } from '../src/launcher-contract.ts'
import { createLauncherFileSearchExtensions, type LauncherFileSearchScanners } from '../src/launcher-file-search.ts'
import type { LauncherActionRecord, LauncherInternalResultItem } from '../src/launcher-actions.ts'

function record(item: LauncherInternalResultItem, action = item.defaultAction): LauncherActionRecord {
  return {
    actionId: 'launcher-action:test', argument: action.argument, expiresAt: Date.now() + 10_000,
    handlerKey: action.handlerKey, hideWindowAfterInvocation: action.hideWindowAfterInvocation === true,
    owner: { role: 'launcher', webContentsId: 1 }, requiresConfirmation: action.requiresConfirmation === true,
    resultSetId: 'launcher-results:test', sourceExtension: item.sourceExtension,
  }
}

function settings<T>(key: string, fallback: T): T {
  if (key === 'extension[FileSearch].maxSearchResultCount') return 20 as T
  if (key === 'extension[FileSearch].everythingCliFilePath') return '' as T
  if (key === 'extension[SimpleFileSearch].folders') return [{ id: 'docs', path: '/home/max/docs', recursive: true, excludeHiddenFiles: true, searchFor: 'filesAndFolders' }] as T
  return fallback
}

test('file providers isolate Linux FileSearch while preserving Simple FileSearch and opaque actions', async () => {
  const effects = { openPath: (_target: string) => undefined, revealPath: (_target: string) => undefined }
  const scanners: LauncherFileSearchScanners = {
    queryFileSearch: async () => [],
    scanSimpleFolder: async () => [{ path: '/home/max/docs/readme.md', type: 'file', identity: { dev: '1', ino: '2' } }],
    validatePath: async () => true,
  }
  const errors: string[] = []
  const provider = createLauncherFileSearchExtensions({
    effects, enabledExtensionIds: () => ['FileSearch', 'SimpleFileSearch'], getSetting: settings,
    homePath: '/home/max', onProviderError: (id, error) => errors.push(`${id}:${error.message}`), platform: 'Linux', scanners,
  })
  const indexed = await provider.loadIndexedItems(new AbortController().signal)
  assert.equal(indexed.length, 1)
  assert.equal(indexed[0]?.sourceExtension, 'SimpleFileSearch')
  assert.equal(indexed[0]?.name, 'readme.md')
  assert.match(errors.join('\n'), /FileSearch.*unsupported/i)
})

test('file providers index bounded simple results and query the exact prefixed FileSearch surface', async () => {
  const opened: string[] = []; const revealed: string[] = []; let queried = 0
  const scanners: LauncherFileSearchScanners = {
    queryFileSearch: async ({ searchTerm, signal }) => { queried++; assert.equal(searchTerm, 'report'); assert.equal(signal.aborted, false); return [{ path: '/home/max/report.txt', type: 'file', identity: { dev: '1', ino: '3' } }] },
    scanSimpleFolder: async () => [{ path: '/home/max/docs', type: 'folder', identity: { dev: '1', ino: '2' } }],
    validatePath: async ({ identity, expectedKind }) => identity?.ino === '3' && expectedKind === 'file',
  }
  const provider = createLauncherFileSearchExtensions({
    effects: { openPath: target => { opened.push(target) }, revealPath: target => { revealed.push(target) } },
    enabledExtensionIds: () => ['FileSearch', 'SimpleFileSearch'], getSetting: settings, homePath: '/home/max', platform: 'macOS', scanners,
  })
  const indexed = await provider.loadIndexedItems(new AbortController().signal)
  assert.equal(indexed[0]?.id, 'file-search:invoke')
  assert.equal(indexed[1]?.name, 'docs')
  assert.equal(indexed[1]?.defaultAction.argument.includes('/home/max'), true)
  const instant = await provider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} report`)
  assert.equal(queried, 1); assert.equal(instant.after[0]?.name, 'report.txt')
  await provider.executeAction(record(instant.after[0]!))
  await provider.executeAction(record(instant.after[0]!, { ...instant.after[0]!.additionalActions![0]!, argument: instant.after[0]!.additionalActions![0]!.argument }))
  assert.deepEqual(opened, ['/home/max/report.txt']); assert.deepEqual(revealed, ['/home/max/report.txt'])
  assert.match(instant.after[0]!.defaultAction.argument, /home\/max\/report\.txt/u)
})

test('superseded FileSearch queries abort and stale results cannot replace current actions', async () => {
  let firstSignal: AbortSignal | undefined
  const scanners: LauncherFileSearchScanners = {
    queryFileSearch: async ({ searchTerm, signal }) => {
      if (searchTerm === 'first') {
        firstSignal = signal
        return await new Promise<readonly never[]>(resolve => signal.addEventListener('abort', () => resolve([]), { once: true }))
      }
      return [{ path: '/home/max/second.txt', type: 'file', identity: { dev: '1', ino: '4' } }]
    },
    scanSimpleFolder: async () => [], validatePath: async () => true,
  }
  const provider = createLauncherFileSearchExtensions({ effects: { openPath: () => undefined, revealPath: () => undefined }, enabledExtensionIds: () => ['FileSearch'], getSetting: settings, homePath: '/home/max', platform: 'macOS', scanners })
  const first = provider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} first`)
  const second = provider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} second`)
  assert.deepEqual(await first, { before: [], after: [] }); assert.equal(firstSignal?.aborted, true)
  assert.equal((await second).after[0]?.name, 'second.txt')
})
