import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LAUNCHER_DEEPL_QUERY_PREFIX, LAUNCHER_NETWORK_EXTENSION_DEFAULTS, LAUNCHER_NETWORK_EXTENSION_IDS, LAUNCHER_WEB_SEARCH_QUERY_PREFIX } from '../src/launcher-network-extension-config.ts'
import { createLauncherNetworkExtensions, type LauncherNetworkFetch } from '../src/launcher-network-extensions.ts'
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
  })
  const items = await provider.loadIndexedItems(new AbortController().signal)
  assert.deepEqual(items.map(item => item.sourceExtension), ['DeeplTranslator', 'WebSearch'])
  assert.equal(calls.length, 2)
})

test('network provider uses exact DeepL request and keeps translation action main-owned', async () => {
  let request: { url: string; init: RequestInit | undefined } | undefined
  const provider = createLauncherNetworkExtensions({
    copyText: () => undefined,
    enabledExtensionIds: () => ['DeeplTranslator'],
    fetch: (url, init) => { request = { url, init }; return Promise.resolve(response(JSON.stringify({ translations: [{ text: 'Hallo' }] }))) },
    getSetting: settings,
    openExternal: () => undefined,
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

test('network provider uses fixed custom URL and web search shapes', async () => {
  const urls: string[] = []
  const fetch: LauncherNetworkFetch = async (url) => { urls.push(url); return response(JSON.stringify(['term', ['one', 'two']])) }
  const provider = createLauncherNetworkExtensions({
    copyText: () => undefined,
    enabledExtensionIds: () => ['CustomWebSearch', 'WebSearch'], fetch,
    getSetting: settings, openExternal: () => undefined,
  })
  const result = await provider.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} hello world`)
  assert.equal(result.after[0]?.id, 'search-Google')
  assert.equal(urls[0], 'https://www.google.com/complete/search?client=opera&q=hello%20world&hl=en-us')
  assert.equal(result.after.length, 3)
})

test('network result actions require current main-owned map and revalidate URL before opening', async () => {
  const opened: string[] = []
  const provider = createLauncherNetworkExtensions({
    copyText: () => undefined,
    enabledExtensionIds: () => ['WebSearch'],
    fetch: async () => response(JSON.stringify(['term', []])),
    getSetting: settings,
    openExternal: url => { opened.push(url) },
  })
  const result = await provider.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} hello`)
  const item = result.after[0]
  assert.ok(item)
  await provider.executeAction(record(item))
  assert.deepEqual(opened, ['https://google.com/search?q=hello&hl=en-us'])
  assert.equal(await provider.executeAction(record(item)), true)
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
