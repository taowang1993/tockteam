import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_WEB_CLIP_DOCUMENT_CHARS,
  WEB_CLIP_DOCUMENT_PREFIX,
  WEB_CLIP_GUEST_ARGUMENT,
  WEB_CLIP_PARTITION_PREFIX,
  WebClipFrameAuthorizations,
  isWebClipPartition,
  stripWebClipRequestHeaders,
  stripWebClipResponseHeaders,
} from '../src/web-clip-frame.ts'

const html = '<main>ok</main><script>cannotRun()</script>'

test('recognizes only ephemeral Web Clip partitions', () => {
  assert.equal(isWebClipPartition(`${WEB_CLIP_PARTITION_PREFIX}session-1`), true)
  assert.equal(isWebClipPartition(`persist:${WEB_CLIP_PARTITION_PREFIX}session-1`), false)
  assert.equal(isWebClipPartition('persist:tockteam-browser'), false)
  assert.equal(WEB_CLIP_GUEST_ARGUMENT.startsWith('--'), true)
})

test('authorizes one exact bounded inert HTML document for its embedder', () => {
  const frames = new WebClipFrameAuthorizations()
  frames.attach(7, 11)
  const documentUrl = frames.authorize(7, 11, html)
  assert.ok(decodeURIComponent(documentUrl).startsWith(`data:text/html;charset=utf-8,${WEB_CLIP_DOCUMENT_PREFIX}`))
  assert.equal(frames.allows(7, documentUrl), true)
  for (const url of [
    `${documentUrl}x`,
    'https://example.com/',
    'https://user:secret@example.com/',
    'http://127.0.0.1/',
    'file:///etc/passwd',
  ]) assert.equal(frames.allows(7, url), false, url)
  frames.commit(7)
  assert.equal(frames.allows(7, documentUrl), false)
  assert.throws(() => frames.authorize(7, 12, html), /frame/i)
})

test('rejects non-string and oversized documents', () => {
  const frames = new WebClipFrameAuthorizations()
  frames.attach(1, 2)
  assert.throws(() => frames.authorize(1, 2, 'a'.repeat(MAX_WEB_CLIP_DOCUMENT_CHARS + 1)), /document/i)
  assert.throws(() => frames.authorize(1, 2, 42 as unknown as string), /document/i)
})

test('detaching a frame removes all navigation authority', () => {
  const frames = new WebClipFrameAuthorizations()
  frames.attach(3, 4)
  const documentUrl = frames.authorize(3, 4, html)
  frames.detach(3)
  assert.equal(frames.allows(3, documentUrl), false)
  assert.throws(() => frames.authorize(3, 4, html), /frame/i)
})

test('strips request credentials and response authentication state', () => {
  assert.deepEqual(stripWebClipRequestHeaders({
    Accept: 'text/html',
    Authorization: 'Bearer secret',
    COOKIE: 'session=secret',
    'Proxy-Authorization': 'Basic secret',
  }), { Accept: 'text/html' })
  assert.deepEqual(stripWebClipResponseHeaders({
    'Content-Type': ['text/html'],
    'Proxy-Authenticate': ['Basic'],
    'Set-Cookie': ['session=secret'],
    'Set-Cookie2': ['legacy=secret'],
    'WWW-Authenticate': ['Basic'],
  }), { 'Content-Type': ['text/html'] })
})
