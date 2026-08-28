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

test('every redirect status is rejected without following a chain or loop', async () => {
  for (const status of [300, 301, 302, 303, 307, 308]) {
    let calls = 0
    const network = provider(async () => {
      calls += 1
      return response('', { status, headers: { location: 'https://evil.example/loop' } })
    })
    const result = await network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} status-${status}`)
    assert.equal(result.after.length, 0)
    assert.equal(result.lastError, 'Web Search is unavailable.')
    assert.equal(calls, 1)
  }
})

test('status and declared-size exits cancel response bodies without reading them', async () => {
  for (const status of [300, 301, 302, 303, 307, 308, 500, 502, 599]) {
    let cancelCount = 0
    let readCount = 0
    const network = provider(async () => ({
      body: { getReader: () => ({
        cancel: async () => { cancelCount += 1 },
        read: async () => { readCount += 1; return { done: true, value: undefined } },
      }) },
      headers: new Headers({ location: 'https://evil.example/redirect' }), ok: false, status,
    } as unknown as Response))
    const result = await network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} status-${status}`)
    assert.equal(result.lastError, 'Web Search is unavailable.')
    assert.equal(cancelCount, 1, `status ${status} must cancel its body`)
    assert.equal(readCount, 0, `status ${status} must not read its body`)
  }

  let cancelCount = 0
  let readCount = 0
  const network = provider(async () => ({
    body: { getReader: () => ({
      cancel: async () => { cancelCount += 1 },
      read: async () => { readCount += 1; return { done: true, value: undefined } },
    }) },
    headers: new Headers({ 'content-length': '1048577' }), ok: true, status: 200,
  } as unknown as Response))
  const result = await network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} declared-oversize`)
  assert.equal(result.lastError, 'Web Search is unavailable.')
  assert.equal(cancelCount, 1)
  assert.equal(readCount, 0)
})

test('stalled response-body cancellation is bounded and tracked through close', async () => {
  let releaseCancel!: () => void
  let cancelCount = 0
  const network = provider(async () => ({
    body: { getReader: () => ({
      cancel: () => { cancelCount += 1; return new Promise<void>(resolve => { releaseCancel = resolve }) },
      read: async () => { throw new Error('body must not be read') },
    }) },
    headers: new Headers(), ok: false, status: 503,
  } as unknown as Response))
  const started = Date.now()
  const result = await network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} stalled-status`)
  assert.equal(result.lastError, 'Web Search is unavailable.')
  assert.equal(cancelCount, 1)
  assert.ok(Date.now() - started < 250)
  const closeStarted = Date.now()
  await network.close()
  assert.ok(Date.now() - closeStarted < 250)
  releaseCancel()
})

test('oversized streamed bodies cancel their reader and malformed UTF-8 remains bounded', async () => {
  let cancelCount = 0
  let readCount = 0
  const reader = {
    cancel: async () => { cancelCount += 1 },
    read: async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
      readCount += 1
      return readCount === 1
        ? { done: false, value: new Uint8Array(1_048_576) }
        : { done: false, value: new Uint8Array(1) }
    },
  } as unknown as ReadableStreamDefaultReader<Uint8Array>
  const oversized = provider(async () => ({
    body: { getReader: () => reader }, headers: new Headers(), ok: true, status: 200,
  } as unknown as Response))
  const oversizedResult = await oversized.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} streamed`)
  assert.equal(oversizedResult.lastError, 'Web Search is unavailable.')
  assert.equal(cancelCount, 1)
  assert.ok(readCount <= 2)

  for (const fetch of [
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

  const mixed = createLauncherNetworkExtensions({
    copyText: () => undefined, enabledExtensionIds: () => ['WebSearch'],
    fetch: async () => { fetched = true; return response(JSON.stringify([])) },
    getSetting: baseSettings, openExternal: () => undefined,
    resolveAddresses: async () => ['2001:4860:4860::8888', '::192.168.1.2'],
  })
  await mixed.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} mixed`)
  assert.equal(fetched, false)
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

test('custom and web rows expose bounded generated URLs without making actions public', async () => {
  const network = provider(async () => response(JSON.stringify(['term', []])), key => key === 'extension[CustomWebSearch].customSearchEngines'
    ? [{ encodeSearchTerm: true, id: 'custom', name: 'Example', prefix: 'x', url: 'https://example.com/search?q={{query}}' }] as unknown as never
    : baseSettings(key, undefined as never))
  const custom = await network.searchInstant('x hello')
  assert.equal(custom.after[0]?.details, 'https://example.com/search?q=hello')
  assert.match(custom.after[0]?.defaultAction.argument ?? '', /^https:\/\/example\.com\/search\?q=hello$/u)
  const web = await network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} hello`)
  assert.equal(web.after[0]?.details, 'https://google.com/search?q=hello&hl=en-us')
})

test('DeepL preserves bounded multiline translation text and copies it through its action', async () => {
  let copied = ''
  const text = 'line one\nline two\r\nline three'
  const network = createLauncherNetworkExtensions({
    copyText: value => { copied = value }, enabledExtensionIds: () => ['DeeplTranslator'],
    fetch: async () => response(JSON.stringify({ translations: [{ text }] })), getSetting: baseSettings,
    openExternal: () => undefined, resolveAddresses: publicResolver,
  })
  const result = await network.searchInstant(`${LAUNCHER_DEEPL_QUERY_PREFIX} hello`)
  assert.equal(result.before[0]?.name, text)
  assert.equal(await network.executeAction(actionRecord(result.before[0]!)), true)
  assert.equal(copied, text)
})

test('empty search stays bounded while retaining provider status', async () => {
  const network = provider(async () => { throw new Error('offline') })
  const failed = await network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} hello`)
  assert.equal(failed.lastError, 'Web Search is unavailable.')
  const empty = await network.searchInstant('')
  assert.deepEqual(empty, { before: [], after: [], lastError: 'Web Search is unavailable.' })
})

test('successful custom search clears only its provider error and preserves other provider status', async () => {
  const getSetting = <T>(key: string, fallback: T): T => key === 'extension[CustomWebSearch].customSearchEngines'
    ? [{ encodeSearchTerm: true, id: 'custom', name: 'Example', prefix: 'x', url: 'https://example.com/search?q={{query}}' }] as T
    : baseSettings(key, fallback)
  const network = provider(async () => { throw new Error('offline') }, getSetting)
  const failed = await network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} hello`)
  assert.equal(failed.lastError, 'Web Search is unavailable.')
  const custom = await network.searchInstant('x hello')
  assert.equal(custom.lastError, 'Web Search is unavailable.')
  assert.equal(network.getLastError(), 'Web Search is unavailable.')
})

test('abort before and during body reads cancels the reader and does not publish stale results', async () => {
  const makeReaderResponse = (reader: ReadableStreamDefaultReader<Uint8Array>): Response => ({
    body: { getReader: () => reader }, headers: new Headers(), ok: true, status: 200,
  } as unknown as Response)
  let beforeCancelCount = 0
  let beforeRead!: () => void
  let network!: ReturnType<typeof createLauncherNetworkExtensions>
  const beforeReader = {
    cancel: async () => { beforeCancelCount += 1; beforeRead() },
    read: () => new Promise<ReadableStreamReadResult<Uint8Array>>(resolve => { beforeRead = () => resolve({ done: true, value: undefined }) }),
  } as unknown as ReadableStreamDefaultReader<Uint8Array>
  network = provider(async () => {
    queueMicrotask(() => network.invalidate())
    return makeReaderResponse(beforeReader)
  })
  assert.deepEqual(await network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} before`), { before: [], after: [] })
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(beforeCancelCount, 1)

  let duringCancelCount = 0
  let duringRead!: () => void
  const duringReader = {
    cancel: async () => { duringCancelCount += 1; duringRead() },
    read: () => new Promise<ReadableStreamReadResult<Uint8Array>>(resolve => { duringRead = () => resolve({ done: true, value: undefined }) }),
  } as unknown as ReadableStreamDefaultReader<Uint8Array>
  network = provider(async () => makeReaderResponse(duringReader))
  const pending = network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} during`)
  await new Promise<void>(resolve => setImmediate(resolve))
  network.invalidate()
  assert.deepEqual(await pending, { before: [], after: [] })
  assert.equal(duringCancelCount, 1)
})

test('abort-aware supersession settles the old request before latest results publish', async () => {
  const calls: string[] = []
  const network = createLauncherNetworkExtensions({
    copyText: () => undefined, enabledExtensionIds: () => ['WebSearch'],
    fetch: async (url, init) => {
      calls.push(url)
      if (url.includes('first')) {
        return await new Promise<Response>(resolve => init?.signal?.addEventListener('abort', () => resolve(response(JSON.stringify(['first', []]))), { once: true }))
      }
      return response(JSON.stringify(['second', ['latest']]))
    },
    getSetting: baseSettings, openExternal: () => undefined, resolveAddresses: publicResolver,
  })
  const first = network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} first`)
  await new Promise<void>(resolve => setImmediate(resolve))
  await new Promise<void>(resolve => setImmediate(resolve))
  const second = network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} second`)
  const [firstResult, secondResult] = await Promise.all([first, second])
  assert.deepEqual(firstResult, { before: [], after: [] })
  assert.equal(secondResult.after[0]?.name, 'Search "second"')
  assert.equal(calls.length, 2)
})

test('ignored-abort fetch is not replaced unboundedly and close remains bounded', async () => {
  let calls = 0
  const network = createLauncherNetworkExtensions({
    copyText: () => undefined, enabledExtensionIds: () => ['WebSearch'],
    fetch: async () => { calls += 1; return await new Promise<Response>(() => {}) },
    getSetting: baseSettings, openExternal: () => undefined, requestTimeoutMs: 5, resolveAddresses: publicResolver,
  })
  const first = await network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} first`)
  assert.equal(first.lastError, 'Web Search is unavailable.')
  const second = await network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} second`)
  assert.equal(second.lastError, 'Web Search is unavailable.')
  assert.equal(calls, 1)
  const started = Date.now()
  await network.close()
  assert.equal(Date.now() - started < 250, true)
})

test('load invalidation during raw-operation wait cannot register or publish stale work', async () => {
  let releaseFetch!: () => void
  const network = createLauncherNetworkExtensions({
    copyText: () => undefined, enabledExtensionIds: () => ['WebSearch'],
    fetch: async () => await new Promise<Response>(resolve => { releaseFetch = () => resolve(response(JSON.stringify(['term', []]))) }),
    getSetting: baseSettings, openExternal: () => undefined, resolveAddresses: publicResolver,
  })
  const pendingSearch = network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} waiting`)
  await new Promise<void>(resolve => setImmediate(resolve))
  const pendingLoad = network.loadIndexedItems(new AbortController().signal)
  await new Promise<void>(resolve => setImmediate(resolve))
  network.invalidate()
  releaseFetch()
  assert.deepEqual(await pendingSearch, { before: [], after: [] })
  await assert.rejects(pendingLoad, /superseded|canceled/u)
  await network.close()
})

test('load close during raw-operation wait cannot register or publish stale work', async () => {
  let releaseFetch!: () => void
  const network = createLauncherNetworkExtensions({
    copyText: () => undefined, enabledExtensionIds: () => ['WebSearch'],
    fetch: async () => await new Promise<Response>(resolve => { releaseFetch = () => resolve(response(JSON.stringify(['term', []]))) }),
    getSetting: baseSettings, openExternal: () => undefined, resolveAddresses: publicResolver,
  })
  const pendingSearch = network.searchInstant(`${LAUNCHER_WEB_SEARCH_QUERY_PREFIX} waiting-close`)
  await new Promise<void>(resolve => setImmediate(resolve))
  const pendingLoad = network.loadIndexedItems(new AbortController().signal)
  await new Promise<void>(resolve => setImmediate(resolve))
  const closing = network.close()
  releaseFetch()
  await assert.rejects(pendingLoad, /closed|superseded|canceled/u)
  await closing
  assert.deepEqual(await pendingSearch, { before: [], after: [] })
})

test('currency refresh owns and aborts its raw operation', async () => {
  let fetchSignal!: AbortSignal
  const network = createLauncherNetworkExtensions({
    copyText: () => undefined, enabledExtensionIds: () => ['CurrencyConversion'],
    fetch: async (_url, init) => { fetchSignal = init?.signal as AbortSignal; return await new Promise<Response>(() => {}) },
    getSetting: baseSettings, openExternal: () => undefined, requestTimeoutMs: 5, resolveAddresses: publicResolver,
  })
  const load = network.loadIndexedItems(new AbortController().signal)
  await new Promise<void>(resolve => setImmediate(resolve))
  network.invalidate()
  await assert.rejects(load)
  assert.equal(fetchSignal.aborted, true)
  await network.close()
})
