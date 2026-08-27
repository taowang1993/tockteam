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
  assert.equal(indexed[1]?.details, '/home/max')
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
      { path: '/home/max/malformed.txt', type: 'file', identity: { dev: 'not-a-device', ino: '3' } },
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

test('a slow Simple rescan cannot replace newer FileSearch actions', async () => {
  let releaseScan: (() => void) | undefined
  let scanStarted: (() => void) | undefined
  const scanReady = new Promise<void>(resolve => { scanStarted = resolve })
  const opened: string[] = []
  const provider = createLauncherFileSearchExtensions({
    effects: { openPath: target => { opened.push(target) }, revealPath: () => undefined },
    enabledExtensionIds: () => ['FileSearch', 'SimpleFileSearch'], getSetting: settings, homePath: '/home/max', platform: 'macOS',
    scanners: {
      queryFileSearch: async () => [{ path: '/home/max/query.txt', type: 'file', identity: { dev: '1', ino: '2' } }],
      scanSimpleFolder: async ({ signal }) => {
        scanStarted?.()
        return await new Promise<readonly never[]>(resolve => {
          releaseScan = () => { resolve([]) }
          signal.addEventListener('abort', () => resolve([]), { once: true })
        })
      },
      validatePath: async () => true,
    },
  })
  const scan = provider.loadIndexedItems(new AbortController().signal)
  await scanReady
  const result = (await provider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} query`)).after[0]
  assert.ok(result)
  releaseScan?.()
  await scan
  await provider.executeAction(record(result))
  assert.deepEqual(opened, ['/home/max/query.txt'])
})

test('closed providers do not start or publish FileSearch queries', async () => {
  let queried = 0
  const provider = createLauncherFileSearchExtensions({
    effects: { openPath: () => undefined, revealPath: () => undefined },
    enabledExtensionIds: () => ['FileSearch'], getSetting: settings, homePath: '/home/max', platform: 'macOS',
    scanners: {
      queryFileSearch: async () => { queried += 1; return [{ path: '/home/max/closed.txt', type: 'file', identity: { dev: '1', ino: '2' } }] },
      scanSimpleFolder: async () => [], validatePath: async () => true,
    },
  })
  await provider.close()
  assert.deepEqual(await provider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} closed`), { before: [], after: [] })
  assert.equal(queried, 0)
})

test('aborted indexed loads reject before an early disabled-provider return', async () => {
  const controller = new AbortController()
  controller.abort(new Error('load canceled'))
  const provider = createLauncherFileSearchExtensions({
    effects: { openPath: () => undefined, revealPath: () => undefined },
    enabledExtensionIds: () => ['FileSearch'], getSetting: settings, homePath: '/home/max', platform: 'macOS',
    scanners: { queryFileSearch: async () => [], scanSimpleFolder: async () => [], validatePath: async () => true },
  })
  await assert.rejects(provider.loadIndexedItems(controller.signal), /load canceled/u)
})

test('in-flight file actions are aborted and rechecked when query state changes', async () => {
  let validationSignal: AbortSignal | undefined
  let releaseValidation: (() => void) | undefined
  let opened = 0
  const scanners: LauncherFileSearchScanners = {
    queryFileSearch: async ({ searchTerm }) => [{ path: `/home/max/${searchTerm}.txt`, type: 'file', identity: { dev: '1', ino: searchTerm === 'first' ? '5' : '6' } }],
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

test('provider close waits for in-flight action validation to settle', async () => {
  let validationStarted = false
  let releaseValidation: (() => void) | undefined
  const provider = createLauncherFileSearchExtensions({
    effects: { openPath: () => undefined, revealPath: () => undefined },
    enabledExtensionIds: () => ['FileSearch'], getSetting: settings, homePath: '/home/max', platform: 'macOS',
    scanners: {
      queryFileSearch: async () => [{ path: '/home/max/report.txt', type: 'file', identity: { dev: '1', ino: '2' } }],
      scanSimpleFolder: async () => [],
      validatePath: async () => {
        validationStarted = true
        await new Promise<void>(resolve => { releaseValidation = resolve })
        return true
      },
    },
  })
  const result = (await provider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} report`)).after[0]
  assert.ok(result)
  const action = provider.executeAction(record(result)).then(() => undefined, error => error)
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(validationStarted, true)
  let closed = false
  const closing = provider.close().then(() => { closed = true })
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(closed, false)
  releaseValidation?.()
  const actionError = await action
  assert.match(actionError instanceof Error ? actionError.message : String(actionError), /canceled|closed|revalidation|superseded/u)
  await closing
  assert.equal(closed, true)
})

test('timed-out validation aborts the scanner and keeps close bounded', async () => {
  let validationSignal: AbortSignal | undefined
  const provider = createLauncherFileSearchExtensions({
    effects: { openPath: () => undefined, revealPath: () => undefined },
    enabledExtensionIds: () => ['FileSearch'], getSetting: settings, homePath: '/home/max', platform: 'macOS',
    scanners: {
      queryFileSearch: async () => [{ path: '/home/max/report.txt', type: 'file', identity: { dev: '1', ino: '2' } }],
      scanSimpleFolder: async () => [],
      validatePath: async ({ signal }) => {
        validationSignal = signal
        return await new Promise<boolean>(() => {})
      },
    },
  })
  const result = (await provider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} report`)).after[0]!
  const action = provider.executeAction(record(result)).catch(error => error)
  const actionError = await action
  assert.match(String(actionError), /timed out|canceled|revalidation/u)
  assert.equal(validationSignal?.aborted, true)
  const boundedClose = Promise.race([
    provider.close(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('provider close hung')), 250)),
  ])
  await assert.doesNotReject(boundedClose)
})

test('Simple File Search actions use real scanner validation for open and reveal', async () => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const home = await mkdtemp(join(tmpdir(), 'tockteam-simple-provider-'))
  try {
    const root = join(home, 'docs')
    const target = join(root, 'report.txt')
    await import('node:fs/promises').then(({ mkdir }) => mkdir(root))
    await writeFile(target, 'report', 'utf8')
    const { createLauncherFileSearchScanners } = await import('../src/launcher-file-search-scanners.ts')
    const scanners = createLauncherFileSearchScanners()
    const opened: string[] = []; const revealed: string[] = []
    const provider = createLauncherFileSearchExtensions({
      effects: { openPath: path => { opened.push(path) }, revealPath: path => { revealed.push(path) } },
      enabledExtensionIds: () => ['SimpleFileSearch'],
      getSetting: <T>(key: string, fallback: T): T => key === 'extension[SimpleFileSearch].folders' ? [{ id: 'docs', path: root, recursive: false, searchFor: 'files' }] as T : fallback,
      homePath: home, platform: 'macOS', scanners,
    })
    const indexed = await provider.loadIndexedItems(new AbortController().signal)
    const result = indexed.find(item => item.name === 'report.txt')
    assert.ok(result)
    await provider.executeAction(record(result))
    await provider.executeAction(record(result, result.additionalActions![0]!))
    assert.deepEqual(opened, [target]); assert.deepEqual(revealed, [target])
  } finally { await rm(home, { force: true, recursive: true }) }
})

function boundaryTarget(platform: 'Windows' | 'macOS', detailLength: number, segment = 'd'): string {
  const prefix = platform === 'Windows' ? 'C:\\Users\\Max\\' : '/home/max/'
  const separator = platform === 'Windows' ? '\\' : '/'
  return `${prefix}${segment.repeat(detailLength - prefix.length)}${separator}file.txt`
}

function serializedTarget(platform: 'Windows' | 'macOS', argumentLength: number): string {
  const prefix = platform === 'Windows' ? 'C:\\Users\\Max\\' : '/home/max/'
  const separator = platform === 'Windows' ? '\\' : '/'
  for (let quoteCount = 0; quoteCount < 9_000; quoteCount += 1) {
    for (const suffix of ['', 'a']) {
      const target = `${prefix}${'"'.repeat(quoteCount)}${suffix}${separator}file.txt`
      if (JSON.stringify({ kind: 'path', target, version: 1 }).length === argumentLength) return target
    }
  }
  throw new Error(`Unable to construct a ${argumentLength}-character path argument`)
}

function boundaryProvider(platform: 'Windows' | 'macOS', target: string, opened: string[]): ReturnType<typeof createLauncherFileSearchExtensions> {
  const homePath = platform === 'Windows' ? 'C:\\Users\\Max' : '/home/max'
  return createLauncherFileSearchExtensions({
    effects: { openPath: path => { opened.push(path) }, revealPath: () => undefined },
    enabledExtensionIds: () => ['FileSearch'], getSetting: settings, homePath, platform,
    scanners: {
      queryFileSearch: async () => [{ path: target, type: 'file', identity: { dev: '1', ino: '1' } }],
      scanSimpleFolder: async () => [], validatePath: async () => true,
    },
  })
}

test('FileSearch rejects overlong details before private action publication on POSIX and Windows', async () => {
  for (const platform of ['macOS', 'Windows'] as const) {
    const opened: string[] = []
    const accepted = boundaryTarget(platform, 8_192)
    const acceptedProvider = boundaryProvider(platform, accepted, opened)
    const acceptedResult = (await acceptedProvider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} boundary`)).after[0]
    assert.ok(acceptedResult)
    assert.equal(acceptedResult.details?.length, 8_192)
    await acceptedProvider.close()

    const rejected = boundaryTarget(platform, 8_193)
    const rejectedProvider = boundaryProvider(platform, rejected, opened)
    const rejectedResult = await rejectedProvider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} boundary`)
    assert.deepEqual(rejectedResult.after, [])
    const rejectedArgument = JSON.stringify({ kind: 'path', target: rejected, version: 1 })
    await assert.rejects(rejectedProvider.executeAction({
      actionId: 'launcher-action:boundary', argument: rejectedArgument, expiresAt: Date.now() + 10_000,
      handlerKey: 'open-file-search-path', hideWindowAfterInvocation: true,
      owner: { role: 'launcher', webContentsId: 1 }, requiresConfirmation: false,
      resultSetId: 'launcher-results:boundary', sourceExtension: 'FileSearch',
    }), /main-owned result set/u)
    assert.deepEqual(opened, [])
    await rejectedProvider.close()
  }
})

test('FileSearch enforces the 16384-character serialized path bound on POSIX and Windows', async () => {
  for (const platform of ['macOS', 'Windows'] as const) {
    const acceptedTarget = serializedTarget(platform, 16_384)
    const acceptedProvider = boundaryProvider(platform, acceptedTarget, [])
    const accepted = (await acceptedProvider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} boundary`)).after[0]
    assert.ok(accepted)
    assert.equal(accepted.defaultAction.argument.length, 16_384)
    assert.ok((accepted.details?.length ?? 0) <= 8_192)
    await acceptedProvider.close()

    const rejectedTarget = serializedTarget(platform, 16_385)
    const rejectedProvider = boundaryProvider(platform, rejectedTarget, [])
    const rejected = await rejectedProvider.searchInstant(`${LAUNCHER_FILE_SEARCH_QUERY_PREFIX} boundary`)
    assert.deepEqual(rejected.after, [])
    await rejectedProvider.close()
  }
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
    assert.equal(result.details, home)
    await provider.executeAction(record(result!))
    await provider.executeAction(record(result!, result!.additionalActions![0]!))
    assert.deepEqual(opened, [target]); assert.deepEqual(revealed, [target])
  } finally { await rm(home, { force: true, recursive: true }) }
})
