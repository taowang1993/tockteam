import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LAUNCHER_DEEPL_QUERY_PREFIX, LAUNCHER_NETWORK_EXTENSION_DEFAULTS, LAUNCHER_NETWORK_EXTENSION_IDS, LAUNCHER_WEB_SEARCH_QUERY_PREFIX } from '../src/launcher-network-extension-config.ts'
import { createLauncherNetworkExtensions, type LauncherNetworkFetch, validateLauncherNetworkUrl } from '../src/launcher-network-extensions.ts'
import type { LauncherActionRecord, LauncherInternalResultItem } from '../src/launcher-actions.ts'

function settings<T>(key: string, fallback: T): T {
  if (key === 'extension[CurrencyConversion].currencies') return ['usd', 'eur'] as T
  if (key === 'extension[CurrencyConversion].defaultTargetCurrency') return 'eur' as T
  if (key === 'extension[DeeplTranslator].apiKey') return 'test-key' as T
  return fallback
}

function record(item: LauncherInternalResultItem): LauncherActionRecord {
  return {
    actionId: 'launcher-action:test', argument: item.defaultAction.argument, expiresAt: Date.now() + 10_000,
    handlerKey: item.defaultAction.handlerKey, hideWindowAfterInvocation: item.defaultAction.hideWindowAfterInvocation === true,
    owner: { role: 'launcher', webContentsId: 1 }, requiresConfirmation: false,
    resultSetId: 'launcher-results:test', sourceExtension: item.sourceExtension,
  }
}

function response(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

const publicResolver = async (): Promise<readonly string[]> => ['8.8.8.8']

test('network inventory preserves adapted IDs, defaults, and prefixes', () => {
  assert.deepEqual(LAUNCHER_NETWORK_EXTENSION_IDS, ['CurrencyConversion', 'CustomWebSearch', 'DeeplTranslator', 'WebSearch'])
  assert.equal(LAUNCHER_DEEPL_QUERY_PREFIX, 'tockteam:deepl:')
  assert.equal(LAUNCHER_WEB_SEARCH_QUERY_PREFIX, 'tockteam:web-search:')
  assert.equal(LAUNCHER_NETWORK_EXTENSION_DEFAULTS.CustomWebSearch.customSearchEngines[0]?.id, 'tockteam-wikipedia')
})

test('network provider creates static DeepL/Web Search rows and isolates currency failures', async () => {
  const calls: string[] = []
  const provider = createLauncherNetworkExtensions({
    copyText: () => undefined,
    enabledExtensionIds: () => ['CurrencyConversion', 'DeeplTranslator', 'WebSearch'],
    fetch: async (url) => { calls.push(url); throw new Error('offline') },
    getSetting: settings,
    openExternal: () => undefined,
    resolveAddresses: publicResolver,
  })
  const items = await provider.loadIndexedItems(new AbortController().signal)
  assert.deepEqual(items.map(item => item.sourceExtension), ['DeeplTranslator', 'WebSearch'])
  assert.equal(calls.length, 2)
  assert.deepEqual([...provider.getProviderErrors().keys()], ['CurrencyConversion'])
})

test('network query status is scoped to the queried provider when a sibling currency provider is stale', async () => {
  const provider = createLauncherNetworkExtensions({
    copyText: () => undefined,
    enabledExtensionIds: () => ['CurrencyConversion', 'DeeplTranslator', 'WebSearch'],
    fetch: async url => {
      if (url.includes('@fawazahmed0/currency-api')) throw new Error('currency offline')
      if (url === 'https://api-free.deepl.com/v2/translate') return response(JSON.stringify({ translations: [{ text: 'translated' }] }))
      return response(JSON.stringify(['term', ['suggestion']]))
    },
    getSetting: settings,
    openExternal: () => undefined,
    resolveAddresses: publicResolver,
  })
  await provider.loadIndexedItems(new AbortController().signal)
  const web = await provider.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} hello`)
  assert.equal(web.after.some(item => item.name === 'suggestion'), true)
  assert.equal(web.lastError, undefined)
  const deepL = await provider.searchInstant(`${LAUNCHER_DEEPL_QUERY_PREFIX} hello`)
  assert.equal(deepL.before[0]?.name, 'translated')
  assert.equal(deepL.lastError, undefined)
})

test('network provider uses exact DeepL request and keeps translation action main-owned', async () => {
  let request: { url: string; init: RequestInit | undefined } | undefined
  const provider = createLauncherNetworkExtensions({
    copyText: () => undefined,
    enabledExtensionIds: () => ['DeeplTranslator'],
    fetch: (url, init) => { request = { url, init }; return Promise.resolve(response(JSON.stringify({ translations: [{ text: 'Hallo' }] }))) },
    getSetting: settings,
    openExternal: () => undefined,
    resolveAddresses: publicResolver,
  })
  const result = await provider.searchInstant(`${LAUNCHER_DEEPL_QUERY_PREFIX} hello`)
  assert.equal(request?.url, 'https://api-free.deepl.com/v2/translate')
  assert.equal(request?.init?.method, 'POST')
  assert.equal((request?.init?.headers as Record<string, string>)?.Authorization, 'DeepL-Auth-Key test-key')
  assert.deepEqual(JSON.parse(String(request?.init?.body)), { target_lang: 'EN-US', text: ['hello'] })
  assert.equal(result.before[0]?.name, 'Hallo')
  assert.equal(result.before[0]?.defaultAction.argument, 'Hallo')
  assert.equal(result.before[0]?.details, undefined)
})

test('DeepL secrets never enter result, error, or provider callback data', async () => {
  const secret = 'super-secret-key'
  const callbacks: string[] = []
  const provider = createLauncherNetworkExtensions({
    copyText: () => undefined,
    enabledExtensionIds: () => ['DeeplTranslator'],
    fetch: async (_url, init) => {
      assert.equal((init?.headers as Record<string, string>)?.Authorization, `DeepL-Auth-Key ${secret}`)
      throw new Error(secret)
    },
    getSetting: <T>(key: string, fallback: T): T => key === 'extension[DeeplTranslator].apiKey' ? secret as T : fallback,
    onProviderError: (_extensionId, error) => { callbacks.push(error.message) },
    openExternal: () => undefined,
    resolveAddresses: publicResolver,
  })
  const result = await provider.searchInstant(`${LAUNCHER_DEEPL_QUERY_PREFIX} hello`)
  assert.equal(JSON.stringify(result).includes(secret), false)
  assert.equal(provider.getLastError()?.includes(secret), false)
  assert.deepEqual(callbacks, ['DeepL Translator is unavailable.'])

  const echoedKeyProvider = createLauncherNetworkExtensions({
    copyText: () => undefined,
    enabledExtensionIds: () => ['DeeplTranslator'],
    fetch: async () => response(JSON.stringify({ translations: [{ text: secret }] })),
    getSetting: <T>(key: string, fallback: T): T => key === 'extension[DeeplTranslator].apiKey' ? secret as T : fallback,
    openExternal: () => undefined,
    resolveAddresses: publicResolver,
  })
  const echoed = await echoedKeyProvider.searchInstant(`${LAUNCHER_DEEPL_QUERY_PREFIX} hello`)
  assert.equal(JSON.stringify(echoed).includes(secret), false)
})

test('network provider uses fixed custom URL and web search shapes', async () => {
  const urls: string[] = []
  const fetch: LauncherNetworkFetch = async (url) => { urls.push(url); return response(JSON.stringify(['term', ['one', 'two']])) }
  const provider = createLauncherNetworkExtensions({
    copyText: () => undefined,
    enabledExtensionIds: () => ['CustomWebSearch', 'WebSearch'], fetch,
    getSetting: settings, openExternal: () => undefined, resolveAddresses: publicResolver,
  })
  const result = await provider.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} hello world`)
  assert.equal(result.after[0]?.id, 'search-Google')
  assert.equal(urls[0], 'https://www.google.com/complete/search?client=opera&q=hello%20world&hl=en-us')
  assert.equal(result.after.length, 3)
})

test('accepted custom URL settings produce invocation-safe actions', async () => {
  for (const url of [
    'https://example.com/search?q={{query}}',
    'https://[2001:4860:4860::8888]/search?q={{query}}',
  ]) {
    const opened: string[] = []
    const network = createLauncherNetworkExtensions({
      copyText: () => undefined, enabledExtensionIds: () => ['CustomWebSearch'],
      fetch: async () => response(JSON.stringify([])),
      getSetting: <T>(key: string, fallback: T): T => key === 'extension[CustomWebSearch].customSearchEngines'
        ? [{ encodeSearchTerm: true, id: 'engine', name: 'Engine', prefix: 'e', url }] as T : fallback,
      openExternal: value => { opened.push(value) }, resolveAddresses: publicResolver,
    })
    const result = await network.searchInstant('e hello')
    const item = result.after[0]
    assert.ok(item)
    assert.equal(item.details, item.defaultAction.argument)
    assert.equal(await network.executeAction(record(item)), true)
    assert.equal(opened.length, 1)
  }
})

test('public IPv6 literal actions skip DNS preflight while unsafe literals remain rejected', async () => {
  let resolutions = 0
  const opened: string[] = []
  const network = createLauncherNetworkExtensions({
    copyText: () => undefined, enabledExtensionIds: () => ['CustomWebSearch'],
    fetch: async () => response(JSON.stringify([])),
    getSetting: <T>(key: string, fallback: T): T => key === 'extension[CustomWebSearch].customSearchEngines'
      ? [{ encodeSearchTerm: true, id: 'engine', name: 'Engine', prefix: 'e', url: 'https://[2001:4860:4860::8888]/search?q={{query}}' }] as T : fallback,
    openExternal: value => { opened.push(value) },
    resolveAddresses: async () => { resolutions += 1; throw new Error('literal addresses must not resolve') },
  })
  const result = await network.searchInstant('e hello')
  const item = result.after[0]
  assert.ok(item)
  assert.equal(await network.executeAction(record(item)), true)
  assert.equal(resolutions, 0)
  assert.deepEqual(opened, ['https://[2001:4860:4860::8888]/search?q=hello'])
  for (const url of ['https://[::192.168.1.1]/search?q=hello', 'https://[2001:db8::1]/search?q=hello']) {
    assert.equal(validateLauncherNetworkUrl(url), false, url)
  }
})

test('network result actions require current main-owned map and revalidate URL before opening', async () => {
  const opened: string[] = []
  const provider = createLauncherNetworkExtensions({
    copyText: () => undefined,
    enabledExtensionIds: () => ['WebSearch'],
    fetch: async () => response(JSON.stringify(['term', []])),
    getSetting: settings,
    openExternal: url => { opened.push(url) },
    resolveAddresses: publicResolver,
  })
  const result = await provider.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} hello`)
  const item = result.after[0]
  assert.ok(item)
  await provider.executeAction(record(item))
  assert.deepEqual(opened, ['https://google.com/search?q=hello&hl=en-us'])
  assert.equal(await provider.executeAction(record(item)), true)
})

test('close clears provider errors after aborting network work', async () => {
  const network = createLauncherNetworkExtensions({
    copyText: () => undefined, enabledExtensionIds: () => ['WebSearch'],
    fetch: async () => { throw new Error('offline') }, getSetting: settings,
    openExternal: () => undefined, resolveAddresses: publicResolver,
  })
  const failed = await network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} unavailable`)
  assert.equal(failed.lastError, 'Web Search is unavailable.')
  await network.close()
  assert.equal(network.getLastError(), undefined)
})

test('malformed Google top-level suggestions report an error and valid results clear it', async () => {
  let malformed = true
  const network = createLauncherNetworkExtensions({
    copyText: () => undefined, enabledExtensionIds: () => ['WebSearch'],
    fetch: async () => response(JSON.stringify(malformed ? ['term', 'not-an-array'] : ['term', ['valid']])),
    getSetting: settings, openExternal: () => undefined, resolveAddresses: publicResolver,
  })
  const failed = await network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} malformed`)
  assert.equal(failed.after.length, 0)
  assert.equal(failed.lastError, 'Web Search is unavailable.')
  assert.equal(network.getLastError(), 'Web Search is unavailable.')
  malformed = false
  const valid = await network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} valid`)
  assert.equal(valid.after.some(item => item.name === 'valid'), true)
  assert.equal(valid.lastError, undefined)
  assert.equal(network.getLastError(), undefined)
})

test('network suggestions validate all entries before compacting result IDs', async () => {
  const network = createLauncherNetworkExtensions({
    copyText: () => undefined, enabledExtensionIds: () => ['WebSearch'],
    fetch: async () => response(JSON.stringify(['term', ['', 'valid-first', 42, 'valid-second', '\ninvalid', ...Array.from({ length: 10 }, (_, index) => `valid-${index}`)]])),
    getSetting: settings, openExternal: () => undefined, resolveAddresses: publicResolver,
  })
  const result = await network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} suggestions`)
  const suggestions = result.after.filter(item => item.description === 'Suggestion')
  assert.deepEqual(suggestions.map(item => item.name), ['valid-first', 'valid-second', ...Array.from({ length: 8 }, (_, index) => `valid-${index}`)])
  assert.deepEqual(suggestions.map(item => item.id), ['web-suggestion:0', 'web-suggestion:1', ...Array.from({ length: 8 }, (_, index) => `web-suggestion:${index + 2}`)])
})

test('network provider rejects superseded and closed requests without publishing stale results', async () => {
  let firstSignal: AbortSignal | undefined
  const provider = createLauncherNetworkExtensions({
    copyText: () => undefined,
    enabledExtensionIds: () => ['WebSearch'],
    fetch: async (_url, init) => {
      firstSignal = init?.signal ?? undefined
      await new Promise<void>(resolve => init?.signal?.addEventListener('abort', () => resolve(), { once: true }))
      return response(JSON.stringify(['term', []]))
    },
    getSetting: settings,
    openExternal: () => undefined,
    resolveAddresses: async () => ['8.8.8.8'],
  })
  const first = provider.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} first`)
  await new Promise<void>(resolve => setImmediate(resolve))
  const second = provider.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} second`)
  await provider.close()
  assert.equal(firstSignal?.aborted, true)
  assert.deepEqual(await first, { before: [], after: [] })
  assert.deepEqual(await second, { before: [], after: [] })
})

test('network window-clear invalidation aborts a consumed copy effect', async () => {
  let observedSignal: AbortSignal | undefined
  let release!: () => void
  const pendingEffect = new Promise<void>(resolve => { release = resolve })
  const provider = createLauncherNetworkExtensions({
    copyText: async (_text, signal) => { observedSignal = signal; await pendingEffect },
    enabledExtensionIds: () => ['DeeplTranslator'],
    fetch: async () => response(JSON.stringify({ translations: [{ text: 'translated' }] })),
    getSetting: settings,
    openExternal: () => undefined,
    resolveAddresses: publicResolver,
  })
  const result = (await provider.searchInstant(`${LAUNCHER_DEEPL_QUERY_PREFIX} hello`)).before[0]
  assert.ok(result)
  const pending = provider.executeAction(record(result!))
  await new Promise<void>(resolve => setImmediate(resolve))
  provider.invalidate('launcher-owner-clear')
  assert.equal(observedSignal?.aborted, true)
  release()
  await assert.rejects(pending, /stale|canceled|current/u)
  await provider.waitForIdle()
  await provider.close()
})
