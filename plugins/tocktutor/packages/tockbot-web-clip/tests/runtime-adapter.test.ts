import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Context, Service } from '@deepseek-ai/cordis'
import type {
  CreateDocumentRequest,
  NoteVaultState,
  WriteDocumentResult,
} from 'tockbot-note-runtime'
import WebClipHost, {
  ClipReviewError,
  ClipRuntimeError,
  defaultPublicFetchLimits,
  WebFetchError,
  defaultReaderViewLimits,
  maximumReaderViewLimits,
  type ClipApproval,
  type ClipPreview,
  type Config,
  type PublicTextResult,
} from '../src/index.ts'
import { parseReaderViewResult, parseViewerPageResult } from '../src/client-api.ts'

const config: Config = { ...defaultPublicFetchLimits, ...defaultReaderViewLimits, maxConcurrentRequests: 8 }

class FixedFetchHost extends WebClipHost {
  protected override async loadPublicText(url: string): Promise<PublicTextResult> {
    return {
      contentType: 'text/html',
      text: '<title>Bounded</title><style>body{background:url(https://example.net/x)}</style><p>Reader</p><img src="data:image/png,x"><script>active()</script>',
      url,
    }
  }
}

class MaximumReaderHost extends WebClipHost {
  protected override async loadPublicText(url: string): Promise<PublicTextResult> {
    return {
      contentType: 'text/html',
      text: `<title>${'T'.repeat(maximumReaderViewLimits.maxReaderTitleChars)}</title><p>${'x'.repeat(maximumReaderViewLimits.maxReaderOutputChars)}</p>`,
      url,
    }
  }
}

class BlockingFetchHost extends WebClipHost {
  protected override async loadPublicText(_url: string, signal: AbortSignal): Promise<PublicTextResult> {
    return await new Promise<PublicTextResult>((_resolve, reject) => {
      signal.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
    })
  }
}

class TestWebClipHost extends WebClipHost {
  override async readerView(_url: string, options: { signal?: AbortSignal } = {}) {
    options.signal?.throwIfAborted()
    return {
      content: 'Fetched Reader content.',
      sourceUrl: 'https://example.com/final',
      title: 'Fetched Article',
      warnings: [],
    }
  }
}

class TestWebServer extends Service {
  readonly routes = new Set<string>()
  throwAt = Number.POSITIVE_INFINITY
  private registrations = 0

  constructor(ctx: Context) {
    super(ctx, 'webServer')
  }

  register(route: {
    handler(request: IncomingMessage, response: ServerResponse): void | Promise<void>
    kind: 'exact'
    path: string
  }): () => void {
    this.registrations += 1
    if (this.registrations === this.throwAt) throw new Error('duplicate route')
    this.routes.add(route.path)
    return () => { this.routes.delete(route.path) }
  }
}

class TestDesktopSurface extends Service {
  readonly kind = 'desktop'

  constructor(ctx: Context) {
    super(ctx, 'tockTeamSurface')
  }
}

class TestNoteVault extends Service {
  state: NoteVaultState = { active: true, generation: 7, id: 'vault:test' }
  readonly calls: Array<{ request: CreateDocumentRequest, signal: AbortSignal }> = []
  error: Error | null = null
  overrideResult: WriteDocumentResult | null = null
  waitForAbort = false

  constructor(ctx: Context) {
    super(ctx, 'noteVault')
  }

  async createDocument(request: CreateDocumentRequest, signal: AbortSignal): Promise<WriteDocumentResult> {
    this.calls.push({ request, signal })
    signal.throwIfAborted()
    if (this.waitForAbort) {
      return await new Promise<WriteDocumentResult>((_resolve, reject) => {
        signal.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
      })
    }
    if (this.error) throw this.error
    return this.overrideResult ?? {
      digest: `sha256:${createHash('sha256').update(request.content).digest('hex')}`,
      generation: request.expectedVault.generation,
      path: request.path,
      revision: 'file:test',
      status: 'created',
    }
  }
}

async function setup(withRuntime = true): Promise<{
  context: Context
  host: WebClipHost
  runtime: TestNoteVault | null
  runtimeFiber: { dispose(): Promise<void> } | null
}> {
  const context = new Context()
  const runtimeFiber = withRuntime ? await context.plugin(TestNoteVault) : null
  await context.plugin(TestWebClipHost, config)
  return {
    context,
    host: context.webClip,
    runtime: withRuntime ? context.get('noteVault') as unknown as TestNoteVault : null,
    runtimeFiber,
  }
}

function createPreview(host: WebClipHost): ClipPreview {
  return host.createClipReview({
    capturedAt: new Date('2026-01-02T03:04:05.000Z'),
    content: 'Reviewed content.',
    destination: 'Clips/reviewed.md',
    sourceUrl: 'https://example.com/article',
    title: 'Reviewed Article',
    vault: { generation: 7, id: 'vault:test' },
  })
}

function approval(value: ClipPreview): ClipApproval {
  return {
    contentDigest: value.contentDigest,
    destination: value.destination,
    expiresAt: value.expiresAt,
    permission: 'user-approved',
    reviewId: value.reviewId,
    sourceUrl: value.sourceUrl,
    target: value.target,
    vault: value.vault,
  }
}

test('configured Host Reader maxima round-trip through browser response validators', async () => {
  const context = new Context()
  const fiber = await context.plugin(MaximumReaderHost, {
    ...defaultPublicFetchLimits,
    ...maximumReaderViewLimits,
    maxConcurrentRequests: 8,
  })
  try {
    const reader = await context.webClip.readerView('https://example.com/max')
    assert.deepEqual(parseReaderViewResult(reader), reader)
    const page = await context.webClip.viewerPage('https://example.com/max')
    assert.deepEqual(parseViewerPageResult(page), page)
  } finally {
    await fiber.dispose()
    await context.fiber.dispose()
  }
})

test('rolls back partial route registration and removes successful routes on unload', async () => {
  const failedContext = new Context()
  await failedContext.plugin(TestDesktopSurface)
  await failedContext.plugin(TestWebServer)
  const failedServer = failedContext.get('webServer') as unknown as TestWebServer
  failedServer.throwAt = 3
  await failedContext.plugin(TestWebClipHost, config)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual([...failedServer.routes], [])
  await failedContext.fiber.dispose()

  const context = new Context()
  await context.plugin(TestDesktopSurface)
  await context.plugin(TestWebServer)
  const server = context.get('webServer') as unknown as TestWebServer
  const fiber = await context.plugin(TestWebClipHost, config)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(server.routes.size, 5)
  await fiber.dispose()
  assert.equal(server.routes.size, 0)
  await context.fiber.dispose()
})

async function withLoopbackFixture(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  run: (host: WebClipHost, fixtureUrl: string, baseUrl: string) => Promise<void>,
  hostConfig: Config = config,
): Promise<void> {
  const server = createServer(handler)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (typeof address !== 'object' || address === null) throw new Error('fixture server did not bind')
  const baseUrl = `http://127.0.0.1.nip.io:${String(address.port)}`
  const fixtureUrl = `${baseUrl}/tockteam-web-clip-fixture`
  const previousFixtureUrl = process.env.TOCKTEAM_WEB_CLIP_FIXTURE_URL
  process.env.TOCKTEAM_WEB_CLIP_FIXTURE_URL = fixtureUrl
  const context = new Context()
  await context.plugin(WebClipHost, hostConfig)
  try {
    await run(context.webClip, fixtureUrl, baseUrl)
  } finally {
    await context.fiber.dispose()
    if (previousFixtureUrl === undefined) delete process.env.TOCKTEAM_WEB_CLIP_FIXTURE_URL
    else process.env.TOCKTEAM_WEB_CLIP_FIXTURE_URL = previousFixtureUrl
    await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()) })
  }
}

test('loads an explicit development loopback fixture without weakening production URL validation', async () => {
  let requests = 0
  await withLoopbackFixture((_request, response) => {
    requests += 1
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<title>Loopback Fixture</title><h1>Fixture Article</h1><p>Loaded from the local test server.</p>')
  }, async (host, fixtureUrl, baseUrl) => {
    const page = await host.viewerPage(fixtureUrl)
    assert.equal(page.title, 'Loopback Fixture')
    assert.match(page.html, /Fixture Article/u)
    await assert.rejects(
      host.viewerPage(`${baseUrl}/not-the-fixture`),
      error => error instanceof WebFetchError && error.code === 'address',
    )
    assert.equal(requests, 1)
  })
})

test('fails closed for loopback fixture redirects, statuses, content types, and bounded bodies', async () => {
  let requests = 0
  await withLoopbackFixture((_request, response) => {
    requests += 1
    if (requests === 1) {
      response.writeHead(302, { location: '/tockteam-web-clip-fixture' })
      response.end()
      return
    }
    if (requests === 2) {
      response.writeHead(503, { 'content-type': 'text/html' })
      response.end('unavailable')
      return
    }
    if (requests === 3) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"private":true}')
      return
    }
    if (requests === 4) {
      response.writeHead(200, { 'content-length': '65', 'content-type': 'text/html' })
      response.end('x'.repeat(65))
      return
    }
    if (requests === 5) {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.write('x'.repeat(40))
      setImmediate(() => { response.end('y'.repeat(40)) })
      return
    }
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('x'.repeat(40))
  }, async (host, fixtureUrl) => {
    const expectCode = async (code: WebFetchError['code']) => {
      await assert.rejects(
        host.viewerPage(fixtureUrl),
        error => error instanceof WebFetchError && error.code === code,
      )
    }
    await expectCode('redirect')
    await expectCode('status')
    await expectCode('content-type')
    await expectCode('body')
    await expectCode('body')
    await expectCode('text')
  }, { ...config, maxResponseBytes: 64, maxTextChars: 32 })
})

test('propagates caller aborts and fixture timeouts while streaming the body', async () => {
  await withLoopbackFixture((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.write('<title>slow</title>')
    const timer = setTimeout(() => { response.end('<p>late</p>') }, 500)
    response.once('close', () => { clearTimeout(timer) })
  }, async (host, fixtureUrl) => {
    const controller = new AbortController()
    const pending = host.viewerPage(fixtureUrl, { signal: controller.signal })
    await new Promise(resolve => setTimeout(resolve, 20))
    controller.abort()
    await assert.rejects(pending, error => error instanceof DOMException && error.name === 'AbortError')
  })

  await withLoopbackFixture((_request, response) => {
    const timer = setTimeout(() => { response.end('<title>too late</title>') }, 500)
    response.once('close', () => { clearTimeout(timer) })
  }, async (host, fixtureUrl) => {
    await assert.rejects(
      host.viewerPage(fixtureUrl),
      error => error instanceof WebFetchError && error.code === 'timeout',
    )
  }, { ...config, timeoutMs: 20 })
})

test('keeps Reader limits independent from a valid zero-redirect fetch policy', async () => {
  const context = new Context()
  await context.plugin(FixedFetchHost, { ...config, maxRedirects: 0 })
  try {
    assert.equal((await context.webClip.readerView('https://example.com/')).content, 'Reader\n')
    const page = await context.webClip.viewerPage('https://example.com/')
    assert.match(page.html, /<h1>Bounded<\/h1>/u)
    assert.match(page.html, /<pre>Reader\n<\/pre>/u)
    assert.doesNotMatch(page.html, /script|style|img|data:|https:\/\/example\.net/iu)
  } finally {
    await context.fiber.dispose()
  }
})

test('bounds concurrent Host network operations and releases capacity after cancellation', async () => {
  const context = new Context()
  await context.plugin(BlockingFetchHost, { ...config, maxConcurrentRequests: 1 })
  const host = context.webClip
  const controller = new AbortController()
  const pending = host.fetchText('https://example.com/one', { signal: controller.signal })
  await assert.rejects(
    host.fetchText('https://example.com/two'),
    error => error instanceof ClipRuntimeError && error.code === 'capacity',
  )
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  await context.fiber.dispose()
})

test('creates the reviewed payload from the hardened Reader result and active vault', async () => {
  const { context, host } = await setup()
  try {
    const value = await host.createClipReviewFromUrl({
      destination: 'Inbox/Fetched.md',
      url: 'https://example.com/original',
    }, new AbortController().signal)
    assert.equal(value.sourceUrl, 'https://example.com/final')
    assert.equal(value.destination, 'Inbox/Fetched.md')
    assert.match(value.markdown, /Fetched Reader content\./u)
    assert.deepEqual(value.vault, { generation: 7, id: 'vault:test' })
  } finally {
    await context.fiber.dispose()
  }
})

test('applies an approved clip only through generation-bound exclusive create', async () => {
  const { context, host, runtime } = await setup()
  if (!runtime) assert.fail('runtime must be available')
  try {
    const value = createPreview(host)
    const result = await host.applyClipReview(approval(value), new AbortController().signal)
    assert.equal(result.status, 'created')
    assert.equal(result.path, 'Clips/reviewed.md')
    assert.equal(runtime.calls.length, 1)
    assert.deepEqual(runtime.calls[0]?.request, {
      content: value.markdown,
      expectedVault: { generation: 7, id: 'vault:test' },
      path: 'Clips/reviewed.md',
    })
    assert.match(value.markdown, /source: https:\/\/example\.com\/article/u)
    await assert.rejects(
      host.applyClipReview(approval(value), new AbortController().signal),
      error => error instanceof ClipReviewError && error.code === 'missing',
    )
  } finally {
    await context.fiber.dispose()
  }
})

test('fails closed before mutation for unavailable, stale, changed, or aborted approvals', async () => {
  const unavailable = await setup(false)
  try {
    const value = createPreview(unavailable.host)
    await assert.rejects(
      unavailable.host.applyClipReview(approval(value), new AbortController().signal),
      error => error instanceof ClipRuntimeError && error.code === 'runtime-unavailable',
    )
  } finally {
    await unavailable.context.fiber.dispose()
  }

  const { context, host, runtime } = await setup()
  if (!runtime) assert.fail('runtime must be available')
  try {
    const stale = createPreview(host)
    runtime.state = { active: true, generation: 8, id: 'vault:test' }
    await assert.rejects(host.applyClipReview(approval(stale), new AbortController().signal), ClipReviewError)
    assert.equal(runtime.calls.length, 0)

    runtime.state = { active: true, generation: 7, id: 'vault:test' }
    const changed = createPreview(host)
    await assert.rejects(host.applyClipReview({
      ...approval(changed),
      contentDigest: `sha256:${'0'.repeat(64)}`,
    }, new AbortController().signal), ClipReviewError)
    assert.equal(runtime.calls.length, 0)

    const aborted = createPreview(host)
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(host.applyClipReview(approval(aborted), controller.signal), { name: 'AbortError' })
    assert.equal(runtime.calls.length, 0)
  } finally {
    await context.fiber.dispose()
  }
})

test('invalidates pending approvals when the runtime service restarts at the same generation', async () => {
  const { context, host, runtimeFiber } = await setup()
  if (!runtimeFiber) assert.fail('runtime fiber must be available')
  try {
    const value = createPreview(host)
    await runtimeFiber.dispose()
    await context.plugin(TestNoteVault)
    await assert.rejects(
      host.applyClipReview(approval(value), new AbortController().signal),
      error => error instanceof ClipReviewError && error.code === 'missing',
    )
  } finally {
    await context.fiber.dispose()
  }
})

test('aborts and drains an in-flight runtime create on Host unload', async () => {
  const { context, host, runtime } = await setup()
  if (!runtime) assert.fail('runtime must be available')
  runtime.waitForAbort = true
  const pending = host.applyClipReview(approval(createPreview(host)), new AbortController().signal)
  const late = createPreview(host)
  await context.fiber.dispose()
  await assert.rejects(pending, error => error instanceof DOMException && error.name === 'AbortError')
  assert.equal(runtime.calls[0]?.signal.aborted, true)
  assert.throws(() => createPreview(host), error => (
    error instanceof ClipRuntimeError && error.code === 'runtime-unavailable'
  ))
  await assert.rejects(
    host.applyClipReview(approval(late), new AbortController().signal),
    error => error instanceof ClipRuntimeError && error.code === 'runtime-unavailable',
  )
  await assert.rejects(
    host.createClipReviewFromUrl({ url: 'https://example.com/' }, new AbortController().signal),
    error => error instanceof ClipRuntimeError && error.code === 'runtime-unavailable',
  )
})

test('preserves typed create conflicts and rejects invalid runtime results', async () => {
  const { context, host, runtime } = await setup()
  if (!runtime) assert.fail('runtime must be available')
  try {
    const conflict = Object.assign(new Error('exists'), { code: 'exists' })
    runtime.error = conflict
    await assert.rejects(
      host.applyClipReview(approval(createPreview(host)), new AbortController().signal),
      error => error === conflict,
    )

    runtime.error = null
    runtime.overrideResult = {
      digest: `sha256:${'0'.repeat(64)}`,
      generation: 7,
      path: 'Clips/reviewed.md',
      revision: 'file:wrong',
      status: 'created',
    }
    await assert.rejects(
      host.applyClipReview(approval(createPreview(host)), new AbortController().signal),
      error => error instanceof ClipRuntimeError && error.code === 'runtime-result',
    )
  } finally {
    await context.fiber.dispose()
  }
})
