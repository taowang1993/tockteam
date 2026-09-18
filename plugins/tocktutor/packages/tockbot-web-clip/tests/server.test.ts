import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { once } from 'node:events'
import test from 'node:test'
import {
  WEB_CLIP_APPLY_API_PATH,
  WEB_CLIP_CANCEL_API_PATH,
  WEB_CLIP_REVIEW_API_PATH,
  createClipApplyHandler,
  createClipCancelHandler,
  createClipReviewHandler,
  createViewerHandler,
  isTrustedDesktopRequest,
  type ViewerPageResult,
} from '../src/server.ts'

const page: ViewerPageResult = {
  contentType: 'text/html',
  html: '<main>bounded</main>',
  title: 'Bounded',
  url: 'https://example.com/final',
}

async function withServer(run: (origin: string) => Promise<void>) {
  const server = createServer(createViewerHandler(async url => ({ ...page, title: url })))
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (typeof address === 'string' || address === null) throw new Error('missing server address')
  try {
    await run(`http://127.0.0.1:${String(address.port)}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

test('desktop Web Clip routes reject rebound browser authorities', () => {
  const request = (host: string, origin: string) => ({
    headers: { host, origin },
    socket: { encrypted: false },
  })
  assert.equal(isTrustedDesktopRequest(request('127.0.0.1:3080', 'http://127.0.0.1:3080') as never), true)
  assert.equal(isTrustedDesktopRequest(request('attacker.example:3080', 'http://attacker.example:3080') as never), false)
})

test('serves one same-origin bounded viewer request', async () => {
  await withServer(async origin => {
    const response = await fetch(origin, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ url: 'https://example.com/article' }),
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ...page, title: 'https://example.com/article' })
    assert.equal(response.headers.get('cache-control'), 'no-store')
  })
})

test('serves bounded review, apply, and cancel requests without accepting malformed approvals', async () => {
  const preview = {
    contentDigest: `sha256:${'a'.repeat(64)}`,
    destination: 'Clips/article.md',
    expiresAt: 1_900_000_000_000,
    markdown: '# Article\n',
    permission: 'user-approval-required' as const,
    reviewId: 'review-1',
    sourceUrl: 'https://example.com/article',
    target: { state: 'absent' as const },
    title: 'Article',
    vault: { generation: 7, id: 'vault:test' },
  }
  let applies = 0
  const review = createClipReviewHandler(async input => ({ ...preview, destination: input.destination ?? preview.destination }))
  const apply = createClipApplyHandler(async approval => {
    applies += 1
    assert.deepEqual(approval, {
      contentDigest: preview.contentDigest,
      destination: preview.destination,
      expiresAt: preview.expiresAt,
      permission: 'user-approved',
      reviewId: preview.reviewId,
      sourceUrl: preview.sourceUrl,
      target: preview.target,
      vault: preview.vault,
    })
    return {
      digest: preview.contentDigest,
      generation: 7,
      path: preview.destination,
      revision: 'file:test',
      status: 'created',
    }
  })
  const cancel = createClipCancelHandler(reviewId => reviewId === preview.reviewId)
  const server = createServer((request, response) => {
    if (request.url === WEB_CLIP_REVIEW_API_PATH) return review(request, response)
    if (request.url === WEB_CLIP_APPLY_API_PATH) return apply(request, response)
    if (request.url === WEB_CLIP_CANCEL_API_PATH) return cancel(request, response)
    response.writeHead(404).end()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (typeof address === 'string' || address === null) throw new Error('missing server address')
  const origin = `http://127.0.0.1:${String(address.port)}`
  const post = async (path: string, body: unknown) => await fetch(`${origin}${path}`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin },
    method: 'POST',
  })
  try {
    const reviewed = await post(WEB_CLIP_REVIEW_API_PATH, {
      destination: preview.destination,
      url: preview.sourceUrl,
    })
    assert.equal(reviewed.status, 200)
    assert.deepEqual(await reviewed.json(), preview)

    const applied = await post(WEB_CLIP_APPLY_API_PATH, {
      ...preview,
      permission: 'user-approved',
    })
    assert.equal(applied.status, 200)
    assert.equal((await applied.json() as { status: string }).status, 'created')

    const cancelled = await post(WEB_CLIP_CANCEL_API_PATH, { reviewId: preview.reviewId })
    assert.deepEqual(await cancelled.json(), { cancelled: true })

    const malformed = await post(WEB_CLIP_APPLY_API_PATH, {
      ...preview,
      permission: 'user-approved',
      vault: { id: 'vault:test', generation: -1 },
    })
    assert.equal(malformed.status, 400)
    assert.equal(applies, 1)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('times out incomplete request bodies without starting Host work', async () => {
  let calls = 0
  const server = createServer(createViewerHandler(async () => {
    calls += 1
    return page
  }, { requestBodyTimeoutMs: 20 }))
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (typeof address === 'string' || address === null) throw new Error('missing server address')
  const socket = connect(address.port, '127.0.0.1')
  try {
    await once(socket, 'connect')
    socket.write([
      'POST / HTTP/1.1',
      `Host: 127.0.0.1:${String(address.port)}`,
      `Origin: http://127.0.0.1:${String(address.port)}`,
      'Content-Type: application/json',
      'Content-Length: 100',
      '',
      '{',
    ].join('\r\n'))
    await once(socket, 'close')
    assert.equal(calls, 0)
  } finally {
    socket.destroy()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('rejects cross-origin, malformed, oversized, and unsupported requests before loading', async () => {
  let calls = 0
  const handler = createViewerHandler(async () => {
    calls += 1
    return page
  })
  const server = createServer(handler)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (typeof address === 'string' || address === null) throw new Error('missing server address')
  const origin = `http://127.0.0.1:${String(address.port)}`
  try {
    const responses = await Promise.all([
      fetch(origin, { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' }),
      fetch(origin, { method: 'POST', headers: { origin: origin.replace('http:', 'https:') }, body: '{}' }),
      fetch(origin, { method: 'POST', headers: { origin }, body: '{' }),
      fetch(origin, { method: 'POST', headers: { origin }, body: JSON.stringify({ nope: true }) }),
      fetch(origin, { method: 'POST', headers: { origin }, body: 'x'.repeat(9000) }),
      fetch(origin),
    ])
    assert.deepEqual(responses.map(response => response.status), [403, 403, 400, 400, 400, 405])
    assert.equal(calls, 0)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
