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

test('Simple File Search isolates a broken root and reports bounded provider status', async () => {
  const errors: string[] = []
  const provider = createLauncherFileSearchExtensions({
    effects: { openPath: () => undefined, revealPath: () => undefined },
    enabledExtensionIds: () => ['SimpleFileSearch'],
    getSetting: <T>(key: string, fallback: T): T => key === 'extension[SimpleFileSearch].folders' ? [
      { id: 'broken', path: '/home/max/missing', recursive: true, searchFor: 'files' as const },
      { id: 'good', path: '/home/max/docs', recursive: false, searchFor: 'files' as const },
    ] as T : fallback,
    homePath: '/home/max', onProviderError: (id, error) => errors.push(`${id}:${error.message}`), platform: 'Linux',
    scanners: {
      queryFileSearch: async () => [],
      scanSimpleFolder: async ({ folder }) => folder.id === 'broken'
        ? await Promise.reject(new Error('permission denied /home/max/missing'))
        : [{ path: '/home/max/docs/readme.md', type: 'file', identity: { dev: '1', ino: '2' } }],
      validatePath: async () => true,
    },
  })
  const indexed = await provider.loadIndexedItems(new AbortController().signal)
  assert.equal(indexed[0]?.name, 'readme.md')
  assert.match(errors.join('\n'), /SimpleFileSearch/u)
  const status = await provider.searchInstant('ordinary launcher term')
  assert.equal(status.lastError, 'Simple File Search is unavailable. Check configured roots.')
  assert.doesNotMatch(status.lastError!, /permission|home|missing/u)
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

test('file providers require identity and revoke replaced path actions', async () => {
  let resultPath = '/home/max/one.txt'
  const effects = { openPath: async (_target: string) => undefined, revealPath: async (_target: string) => undefined }
  const scanners: LauncherFileSearchScanners = {
    queryFileSearch: async () => [{ path: resultPath, type: 'file', identity: { dev: '1', ino: resultPath.endsWith('one.txt') ? '1' : '2' } }],
    scanSimpleFolder: async () => [
      { path: '/home/max/missing.txt', type: 'file', identity: { dev: '', ino: '' } },
      { path: '/home/max/valid.txt', type: 'file', identity: { dev: '1', ino: '3' } },
    ],
    validatePath: async () => true,
  }
  const provider = createLauncherFileSearchExtensions({ effects, enabledExtensionIds: () => ['FileSearch', 'SimpleFileSearch'], getSetting: settings, homePath: '/home/max', platform: 'macOS', scanners })
  const first = await provider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} one`)
  assert.equal(first.after.length, 1)
  const old = first.after[0]!
  resultPath = '/home/max/two.txt'
  await provider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} two`)
  await assert.rejects(provider.executeAction(record(old)), /main-owned result set/u)
  const indexed = await provider.loadIndexedItems(new AbortController().signal)
  assert.deepEqual(indexed.filter(item => item.sourceExtension === 'SimpleFileSearch').map(item => item.name), ['valid.txt'])
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
  assert.deepEqual(await first, { before: [], after: [] }); assert.equal(firstSignal === undefined || firstSignal.aborted, true)
  assert.equal((await second).after[0]?.name, 'second.txt')
})

test('in-flight file actions are aborted and rechecked when query state changes', async () => {
  let validationSignal: AbortSignal | undefined
  let releaseValidation: (() => void) | undefined
  let opened = 0
  const scanners: LauncherFileSearchScanners = {
    queryFileSearch: async ({ searchTerm }) => [{ path: `/home/max/${searchTerm}.txt`, type: 'file', identity: { dev: '1', ino: searchTerm } }],
    scanSimpleFolder: async () => [],
    validatePath: async ({ signal }) => {
      validationSignal = signal
      await new Promise<void>(resolve => { releaseValidation = resolve; signal.addEventListener('abort', () => resolve(), { once: true }) })
      return true
    },
  }
  const provider = createLauncherFileSearchExtensions({
    effects: { openPath: () => { opened += 1 }, revealPath: () => undefined },
    enabledExtensionIds: () => ['FileSearch'], getSetting: settings, homePath: '/home/max', platform: 'macOS', scanners,
  })
  const result = (await provider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} first`)).after[0]!
  const action = provider.executeAction(record(result))
  await new Promise<void>(resolve => setImmediate(resolve))
  const replacement = provider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} second`)
  assert.equal(validationSignal?.aborted, true)
  releaseValidation?.()
  await assert.rejects(action, /main-owned result set|canceled|superseded|revalidation/u)
  await replacement
  assert.equal(opened, 0)
})

test('provider errors return bounded status instead of an empty-success message', async () => {
  const provider = createLauncherFileSearchExtensions({
    effects: { openPath: () => undefined, revealPath: () => undefined },
    enabledExtensionIds: () => ['FileSearch'], getSetting: settings, homePath: '/home/max', platform: 'macOS',
    scanners: {
      queryFileSearch: async () => { throw new Error('/private/path must not be published') },
      scanSimpleFolder: async () => [], validatePath: async () => true,
    },
  })
  const result = await provider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} report`)
  assert.equal(result.after.length, 0)
  assert.equal(result.lastError, 'File Search is unavailable. Check the native provider configuration.')
  assert.ok(result.lastError)
  assert.doesNotMatch(result.lastError, /private|path/u)
})

test('closing a provider aborts and quiesces an in-flight simple scan', async () => {
  let scanSignal: AbortSignal | undefined
  const provider = createLauncherFileSearchExtensions({
    effects: { openPath: () => undefined, revealPath: () => undefined },
    enabledExtensionIds: () => ['SimpleFileSearch'], getSetting: settings, homePath: '/home/max', platform: 'macOS',
    scanners: {
      queryFileSearch: async () => [],
      scanSimpleFolder: async ({ signal }) => {
        scanSignal = signal
        return await new Promise<readonly never[]>(resolve => signal.addEventListener('abort', () => resolve([]), { once: true }))
      },
      validatePath: async () => true,
    },
  })
  const loading = provider.loadIndexedItems(new AbortController().signal)
  await new Promise<void>(resolve => setImmediate(resolve))
  await provider.close()
  assert.equal(scanSignal?.aborted, true)
  await assert.rejects(loading, /canceled|closed|superseded/u)
})

test('FileSearch actions use home-scope canonical revalidation without a strict root', async () => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const home = await mkdtemp(join(tmpdir(), 'tockteam-file-provider-'))
  try {
    const target = join(home, 'report.txt')
    await writeFile(target, 'report', 'utf8')
    const { createLauncherFileSearchScanners } = await import('../src/launcher-file-search-scanners.ts')
    const scanners = createLauncherFileSearchScanners({ runFile: async () => ({ stdout: `${target}\n` }) })
    const opened: string[] = []; const revealed: string[] = []
    const provider = createLauncherFileSearchExtensions({
      effects: { openPath: path => { opened.push(path) }, revealPath: path => { revealed.push(path) } },
      enabledExtensionIds: () => ['FileSearch'], getSetting: settings, homePath: home, platform: 'macOS', scanners,
    })
    const result = (await provider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} report`)).after[0]
    assert.ok(result)
    assert.equal(result.details, undefined)
    await provider.executeAction(record(result!))
    await provider.executeAction(record(result!, result!.additionalActions![0]!))
    assert.deepEqual(opened, [target]); assert.deepEqual(revealed, [target])
  } finally { await rm(home, { force: true, recursive: true }) }
})
