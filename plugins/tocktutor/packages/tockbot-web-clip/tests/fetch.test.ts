import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import {
  WebFetchError,
  createPinnedLookup,
  fetchPublicText,
  isPublicAddress,
  maximumPublicFetchLimits,
  normalizePublicHttpUrl,
  type PublicFetchRequest,
} from '../src/fetch.ts'

const publicLookup = async () => [{ address: '93.184.216.34' }]
const html = (body = 'ok', headers: Record<string, string> = {}) => new Response(body, {
  headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
})

async function rejectsCode(run: () => Promise<unknown>, code: string) {
  await assert.rejects(run, (error: unknown) => error instanceof WebFetchError && error.code === code)
}

test('normalizes only bounded credential-free HTTP(S) URLs', () => {
  assert.equal(maximumPublicFetchLimits.maxUrlBytes, 4096)
  assert.equal(normalizePublicHttpUrl('HTTPS://Example.COM:443/a?b=1#part'), 'https://example.com/a?b=1')
  for (const value of [
    '',
    '/etc/passwd',
    'file:///etc/passwd',
    'data:text/plain,secret',
    'blob:https://example.com/id',
    'https://user@example.com/',
    'https://:secret@example.com/',
    'https://example.com/\nnext',
    'http://localhost/',
    'http://printer.local/',
    'http://router.home.arpa/',
    `https://example.com/${'a'.repeat(4096)}`,
  ]) assert.throws(() => normalizePublicHttpUrl(value), WebFetchError)
})

test('accepts public addresses and rejects non-public IPv4, IPv6, and mapped-private ranges', () => {
  for (const address of ['93.184.216.34', '2606:4700:4700::1111', '::ffff:93.184.216.34']) {
    assert.equal(isPublicAddress(address), true, address)
  }
  for (const address of [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.1.1',
    '172.16.0.1', '192.0.2.1', '192.168.1.1', '198.18.0.1', '198.51.100.1',
    '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255',
    '::', '::1', '64:ff9b::1', '100::1', '2001:db8::1', '2002::1', 'fc00::1',
    'fe80::1', 'fec0::1', 'ff00::1', '2001:100::1', '2620:4f:8000::1',
    '::ffff:127.0.0.1', '::ffff:a00:1', 'not-an-ip',
  ]) assert.equal(isPublicAddress(address), false, address)
})

test('rejects invalid or effectively unbounded direct fetch limits', async () => {
  for (const key of Object.keys({
    connectTimeoutMs: 0,
    maxAddresses: 0,
    maxRedirects: 0,
    maxResponseBytes: 0,
    maxResponseHeadersBytes: 0,
    maxTextChars: 0,
    maxUrlBytes: 0,
    timeoutMs: 0,
  })) {
    await rejectsCode(() => fetchPublicText('https://example.com', {
      limits: { [key]: Number.MAX_SAFE_INTEGER },
      lookup: publicLookup,
      request: async () => html(),
    }), 'network')
  }
})

test('fails closed on empty, excessive, or mixed public/private DNS results', async () => {
  const request = async () => html()
  await rejectsCode(() => fetchPublicText('https://example.com', { lookup: async () => [], request }), 'address')
  await rejectsCode(() => fetchPublicText('https://example.com', {
    lookup: async () => [{ address: '93.184.216.34' }, { address: '127.0.0.1' }],
    request,
  }), 'address')
  await rejectsCode(() => fetchPublicText('https://example.com', {
    lookup: async () => Array.from({ length: 17 }, () => ({ address: '93.184.216.34' })),
    request,
  }), 'address')
})

test('pins each request and revalidates every redirect without forwarding credentials', async () => {
  const seen: PublicFetchRequest[] = []
  const result = await fetchPublicText('https://example.com/start', {
    lookup: async hostname => [{ address: hostname === 'example.com' ? '93.184.216.34' : '1.1.1.1' }],
    request: async request => {
      seen.push(request)
      return seen.length === 1
        ? new Response(null, { status: 302, headers: { location: 'https://example.net/final' } })
        : html('final')
    },
  })

  assert.equal(result.url, 'https://example.net/final')
  assert.equal(result.text, 'final')
  assert.deepEqual(seen.map(({ url, address }) => [url, address]), [
    ['https://example.com/start', '93.184.216.34'],
    ['https://example.net/final', '1.1.1.1'],
  ])
  assert.deepEqual(seen[0]?.headers, {
    accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
    'accept-encoding': 'identity',
  })
  assert.equal(seen[0]?.connectTimeoutMs, 5_000)

  let rebindingLookups = 0
  let rebindingRequests = 0
  await rejectsCode(() => fetchPublicText('https://example.com/start', {
    lookup: async () => [{ address: ++rebindingLookups === 1 ? '93.184.216.34' : '127.0.0.1' }],
    request: async () => {
      rebindingRequests += 1
      return new Response(null, { status: 302, headers: { location: '/again' } })
    },
  }), 'address')
  assert.equal(rebindingLookups, 2)
  assert.equal(rebindingRequests, 1)

  await rejectsCode(() => fetchPublicText('https://example.com', {
    lookup: publicLookup,
    request: async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }),
  }), 'address')
  await rejectsCode(() => fetchPublicText('https://example.com', {
    lookup: publicLookup,
    request: async () => new Response(null, { status: 302, headers: { location: 'https://user:secret@example.net/' } }),
  }), 'url')
})

test('bypasses ambient proxy settings and connects only to the pinned address', async () => {
  let proxyRequests = 0
  const proxy = createServer((_request, response) => {
    proxyRequests += 1
    response.writeHead(200, { 'content-type': 'text/plain' }).end('proxy')
  })
  await new Promise<void>((resolve, reject) => {
    proxy.once('error', reject)
    proxy.listen(0, '127.0.0.1', resolve)
  })
  const address = proxy.address()
  if (typeof address === 'string' || address === null) throw new Error('missing proxy address')
  const previousHttpProxy = process.env.HTTP_PROXY
  const previousHttpsProxy = process.env.HTTPS_PROXY
  process.env.HTTP_PROXY = `http://127.0.0.1:${String(address.port)}`
  process.env.HTTPS_PROXY = process.env.HTTP_PROXY
  try {
    await assert.rejects(fetchPublicText(`http://proxy-bypass.invalid:${String(address.port)}/`, {
      limits: { connectTimeoutMs: 10, timeoutMs: 20 },
      lookup: async () => [{ address: '1.1.1.1' }],
    }), WebFetchError)
    assert.equal(proxyRequests, 0)
  } finally {
    if (previousHttpProxy === undefined) delete process.env.HTTP_PROXY
    else process.env.HTTP_PROXY = previousHttpProxy
    if (previousHttpsProxy === undefined) delete process.env.HTTPS_PROXY
    else process.env.HTTPS_PROXY = previousHttpsProxy
    await new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve()))
  }
})

test('returns pinned DNS results in the shape requested by Node', () => {
  const lookup = createPinnedLookup('2606:4700:4700::1111')
  lookup('example.com', { all: false }, (error, address, family) => {
    assert.equal(error, null)
    assert.equal(address, '2606:4700:4700::1111')
    assert.equal(family, 6)
  })
  lookup('example.com', { all: true }, (error, addresses) => {
    assert.equal(error, null)
    assert.deepEqual(addresses, [{ address: '2606:4700:4700::1111', family: 6 }])
  })
  assert.throws(() => createPinnedLookup('example.com'), WebFetchError)
})

test('enforces status, content type, response header, byte, and decoded-text bounds', async () => {
  await rejectsCode(() => fetchPublicText('https://example.com', {
    lookup: publicLookup,
    request: async () => new Response('no', { status: 404, headers: { 'content-type': 'text/plain' } }),
  }), 'status')
  let unsupportedCancelled = false
  const unsupportedBody = new ReadableStream<Uint8Array>({ cancel: () => { unsupportedCancelled = true } })
  await rejectsCode(() => fetchPublicText('https://example.com', {
    lookup: publicLookup,
    request: async () => new Response(unsupportedBody, { headers: { 'content-type': 'image/png' } }),
  }), 'content-type')
  assert.equal(unsupportedCancelled, true)
  await rejectsCode(() => fetchPublicText('https://example.com', {
    lookup: publicLookup,
    request: async () => html('compressed', { 'content-encoding': 'gzip' }),
  }), 'encoding')
  await rejectsCode(() => fetchPublicText('https://example.com', {
    lookup: publicLookup,
    request: async () => html('x', { 'x-large': 'a'.repeat(100) }),
    limits: { maxResponseHeadersBytes: 32 },
  }), 'headers')
  await rejectsCode(() => fetchPublicText('https://example.com', {
    lookup: publicLookup,
    request: async () => html('small', { 'content-length': '100' }),
    limits: { maxResponseBytes: 4 },
  }), 'body')

  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('abc'))
      controller.enqueue(new TextEncoder().encode('def'))
    },
    cancel() {
      cancelled = true
    },
  })
  await rejectsCode(() => fetchPublicText('https://example.com', {
    lookup: publicLookup,
    request: async () => new Response(body, { headers: { 'content-type': 'text/plain' } }),
    limits: { maxResponseBytes: 4 },
  }), 'body')
  assert.equal(cancelled, true)

  await rejectsCode(() => fetchPublicText('https://example.com', {
    lookup: publicLookup,
    request: async () => html('éé'),
    limits: { maxTextChars: 1 },
  }), 'text')
})

test('bounds redirects, timeout, cancellation, and response cleanup', async () => {
  let redirectCancelled = false
  const redirectBody = new ReadableStream<Uint8Array>({ cancel: () => { redirectCancelled = true } })
  await rejectsCode(() => fetchPublicText('https://example.com', {
    lookup: publicLookup,
    request: async () => new Response(redirectBody, { status: 302, headers: { location: '/again' } }),
    limits: { maxRedirects: 0 },
  }), 'redirect')
  assert.equal(redirectCancelled, true)

  await rejectsCode(() => fetchPublicText('https://example.com', {
    lookup: publicLookup,
    request: async () => await new Promise<Response>(() => undefined),
    limits: { timeoutMs: 5 },
  }), 'timeout')

  let bodyCancelled = false
  const stalledBody = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode('a'))
      return new Promise<void>(() => undefined)
    },
    cancel() {
      bodyCancelled = true
    },
  })
  await rejectsCode(() => fetchPublicText('https://example.com', {
    lookup: publicLookup,
    request: async () => new Response(stalledBody, { headers: { 'content-type': 'text/plain' } }),
    limits: { timeoutMs: 5 },
  }), 'timeout')
  assert.equal(bodyCancelled, true)

  const dnsStarted = Date.now()
  await rejectsCode(() => fetchPublicText('https://example.com', {
    lookup: async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
      return [{ address: '93.184.216.34' }]
    },
    request: async () => html(),
    limits: { timeoutMs: 5 },
  }), 'timeout')
  assert.ok(Date.now() - dnsStarted < 50)

  const controller = new AbortController()
  const pending = fetchPublicText('https://example.com', {
    lookup: publicLookup,
    signal: controller.signal,
    request: request => new Promise((_resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true })
    }),
  })
  controller.abort()
  await rejectsCode(() => pending, 'aborted')
})
