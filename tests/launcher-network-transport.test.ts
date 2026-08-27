import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LAUNCHER_DEEPL_QUERY_PREFIX, LAUNCHER_WEB_SEARCH_QUERY_PREFIX } from '../src/launcher-network-extension-config.ts'
import { createLauncherNetworkExtensions } from '../src/launcher-network-extensions.ts'
import type { LauncherNetworkFetch } from '../src/launcher-network-extensions.ts'
import type { LauncherActionRecord, LauncherInternalResultItem } from '../src/launcher-actions.ts'

const publicResolver = async (): Promise<readonly string[]> => ['8.8.8.8']
const baseSettings = <T>(key: string, fallback: T): T => {
  if (key === 'extension[CurrencyConversion].currencies') return ['usd', 'eur'] as T
  if (key === 'extension[CurrencyConversion].defaultTargetCurrency') return 'eur' as T
  if (key === 'extension[DeeplTranslator].apiKey') return 'secret-key' as T
  return fallback
}
function response(body: string | Uint8Array, init: ResponseInit = {}): Response {
  return new Response(body as unknown as BodyInit, { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}
function actionRecord(item: LauncherInternalResultItem): LauncherActionRecord {
  return {
    actionId: 'launcher-action:test', argument: item.defaultAction.argument, expiresAt: Date.now() + 10_000,
    handlerKey: item.defaultAction.handlerKey, hideWindowAfterInvocation: item.defaultAction.hideWindowAfterInvocation === true,
    owner: { role: 'launcher', webContentsId: 1 }, requiresConfirmation: false,
    resultSetId: 'launcher-results:test', sourceExtension: item.sourceExtension,
  }
}
function provider(fetch: LauncherNetworkFetch, getSetting = baseSettings, onProviderError?: (id: string, error: Error) => void) {
  return createLauncherNetworkExtensions({
    copyText: () => undefined, enabledExtensionIds: () => ['CurrencyConversion', 'CustomWebSearch', 'DeeplTranslator', 'WebSearch'],
    fetch, getSetting, ...(onProviderError === undefined ? null : { onProviderError }), openExternal: () => undefined, resolveAddresses: publicResolver,
  })
}

test('currency adapter fetches exact pinned URLs and converts bounded grammar', async () => {
  const urls: string[] = []
  const network = provider(async url => {
    urls.push(url)
    const currency = url.endsWith('/usd.json') ? 'usd' : 'eur'
    return response(JSON.stringify({ [currency]: { eur: currency === 'usd' ? 0.9 : 1, usd: currency === 'eur' ? 1.1 : 1 } }))
  })
  await network.loadIndexedItems(new AbortController().signal)
  assert.deepEqual(urls, [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json',
  ])
  const result = await network.searchInstant('10 usd in eur')
  assert.equal(result.before[0]?.name, '9.00 EUR')
})

test('custom query metacharacters remain one encoded same-origin URL action', async () => {
  const term = 'a & b | c > d < e ^ "quoted"'
  const getSetting = <T>(key: string, fallback: T): T => key === 'extension[CustomWebSearch].customSearchEngines'
    ? [{ encodeSearchTerm: true, id: 'custom', name: 'Example', prefix: 'x', url: 'https://example.com/search?q={{query}}' }] as T
    : baseSettings(key, fallback)
  const network = provider(async () => response(JSON.stringify([])), getSetting)
  const result = await network.searchInstant(`x ${term}`)
  assert.equal(result.after[0]?.sourceExtension, 'CustomWebSearch')
  assert.match(result.after[0]?.defaultAction.argument ?? '', /^https:\/\/example\.com\/search\?q=a%20%26%20b%20%7C%20c%20%3E%20d%20%3C%20e%20%5E%20%22quoted%22$/u)
})

test('redirects, oversized bodies, and malformed UTF-8 become bounded provider errors', async () => {
  for (const fetch of [
    async () => response('', { status: 302, headers: { location: 'https://evil.example/' } }),
    async () => response('x'.repeat(1_048_577)),
    async () => response(new Uint8Array([0xff, 0xfe])),
  ] satisfies readonly LauncherNetworkFetch[]) {
    const network = provider(fetch)
    const result = await network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} term`)
    assert.equal(result.after.length, 0)
    assert.equal(result.lastError, 'Web Search is unavailable.')
  }
})

test('DNS preflight rejects any private address and does not call fetch', async () => {
  let fetched = false
  const network = createLauncherNetworkExtensions({
    copyText: () => undefined, enabledExtensionIds: () => ['WebSearch'],
    fetch: async () => { fetched = true; return response(JSON.stringify([])) },
    getSetting: baseSettings, openExternal: () => undefined,
    resolveAddresses: async () => ['8.8.8.8', '192.168.1.2'],
  })
  const result = await network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} term`)
  assert.equal(fetched, false)
  assert.equal(result.lastError, 'Web Search is unavailable.')
})

test('DeepL omits Auto source language and rejects invalid or oversized typed input before fetch', async () => {
  const requests: RequestInit[] = []
  const network = createLauncherNetworkExtensions({
    copyText: () => undefined, enabledExtensionIds: () => ['DeeplTranslator'],
    fetch: async (_url, init) => { requests.push(init ?? {}); return response(JSON.stringify({ translations: [{ text: 'ok' }] })) },
    getSetting: baseSettings, openExternal: () => undefined, resolveAddresses: publicResolver,
  })
  const result = await network.searchInstant(`${LAUNCHER_DEEPL_QUERY_PREFIX} hello`)
  assert.equal(result.before.length, 1)
  assert.equal(JSON.parse(String(requests[0]?.body)).source_lang, undefined)
  assert.deepEqual(await network.searchInstant(`${LAUNCHER_DEEPL_QUERY_PREFIX}${'x'.repeat(481)}`), { before: [], after: [] })
  assert.equal(requests.length, 1)
})

test('current custom settings are revalidated before external navigation', async () => {
  let engineUrl = 'https://example.com/search?q={{query}}'
  const opened: string[] = []
  const getSetting = <T>(key: string, fallback: T): T => key === 'extension[CustomWebSearch].customSearchEngines'
    ? [{ encodeSearchTerm: true, id: 'custom', name: 'Example', prefix: 'x', url: engineUrl }] as T
    : baseSettings(key, fallback)
  const network = createLauncherNetworkExtensions({
    copyText: () => undefined, enabledExtensionIds: () => ['CustomWebSearch'],
    fetch: async () => response(JSON.stringify([])), getSetting, openExternal: url => { opened.push(url) }, resolveAddresses: publicResolver,
  })
  const result = await network.searchInstant('x hello')
  assert.ok(result.after[0])
  engineUrl = 'https://other.example/search?q={{query}}'
  await assert.rejects(network.executeAction(actionRecord(result.after[0]!)), /stale|current|main-owned/u)
  assert.deepEqual(opened, [])
})
