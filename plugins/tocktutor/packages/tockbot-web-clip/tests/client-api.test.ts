import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseClipApplyResult,
  parseClipPreview,
  parseReaderViewResult,
  parseViewerPageResult,
  viewerInputUrl,
} from '../src/client-api.ts'

test('normalizes viewer input without accepting credentials or local schemes', () => {
  assert.equal(viewerInputUrl('example.com/article'), 'https://example.com/article')
  assert.equal(viewerInputUrl('HTTPS://Example.COM:443/a#part'), 'https://example.com/a')
  for (const value of [
    '',
    'file:///etc/passwd',
    'data:text/html,secret',
    'https://user:secret@example.com/',
    'http://localhost/',
    'http://printer.local/',
    'http://127.0.0.1/',
    'http://10.0.0.1/',
    'http://[::1]/',
    'https://93.184.216.34/',
  ]) assert.throws(() => viewerInputUrl(value))
})

test('accepts only bounded Host Reader results', () => {
  assert.deepEqual(parseReaderViewResult({
    content: 'Readable\n',
    sourceUrl: 'https://example.com/article',
    title: 'Article',
    warnings: [],
  }), {
    content: 'Readable\n',
    sourceUrl: 'https://example.com/article',
    title: 'Article',
    warnings: [],
  })
  for (const value of [
    { content: 'x'.repeat(200_001), sourceUrl: 'https://example.com', title: 'x', warnings: [] },
    { content: 'x', sourceUrl: 'file:///etc/passwd', title: 'x', warnings: [] },
    { content: 'x', sourceUrl: 'https://example.com', title: 'x'.repeat(201), warnings: [] },
    { content: 'x', sourceUrl: 'https://example.com', title: 'x', warnings: Array(9).fill('x') },
    { content: 'x', sourceUrl: 'https://example.com', title: 'x', warnings: ['x'.repeat(201)] },
  ]) assert.throws(() => parseReaderViewResult(value))
})

test('accepts only bounded Host clip preview and create results', () => {
  const preview = {
    contentDigest: `sha256:${'a'.repeat(64)}`,
    destination: 'Clips/article.md',
    expiresAt: 1_900_000_000_000,
    markdown: '# Article\n',
    permission: 'user-approval-required',
    reviewId: 'review-1',
    sourceUrl: 'https://example.com/article',
    target: { state: 'absent' },
    title: 'Article',
    vault: { generation: 7, id: 'vault:test' },
  }
  assert.deepEqual(parseClipPreview(preview), preview)
  const created = {
    digest: preview.contentDigest,
    generation: 7,
    path: preview.destination,
    revision: 'file:test',
    status: 'created',
  }
  assert.deepEqual(parseClipApplyResult(created), created)
  for (const value of [
    { ...preview, contentDigest: 'wrong' },
    { ...preview, destination: '' },
    { ...preview, destination: '/absolute.md' },
    { ...preview, destination: '../escape.md' },
    { ...preview, markdown: 'x'.repeat(210_001) },
    { ...preview, markdown: '😀'.repeat(70_000) },
    { ...preview, sourceUrl: 'file:///tmp/local' },
    { ...preview, permission: 'write-anywhere' },
    { ...preview, target: { state: 'existing' } },
    { ...preview, vault: { generation: -1, id: 'vault' } },
    { ...preview, reviewId: 'x'.repeat(129) },
  ]) assert.throws(() => parseClipPreview(value))
  for (const value of [
    { ...created, status: 'saved', snapshotId: 'snapshot' },
    { ...created, digest: 'wrong' },
    { ...created, path: '' },
    { ...created, path: '/absolute.md' },
    { ...created, path: '../escape.md' },
    { ...created, generation: -1 },
  ]) assert.throws(() => parseClipApplyResult(value))
})

test('accepts only bounded Host viewer results', () => {
  assert.deepEqual(parseViewerPageResult({
    contentType: 'text/html',
    html: '<main>ok</main>',
    title: 'Article',
    url: 'https://example.com/article',
  }), {
    contentType: 'text/html',
    html: '<main>ok</main>',
    title: 'Article',
    url: 'https://example.com/article',
  })
  for (const value of [
    null,
    { contentType: 'image/png', html: 'x', title: 'x', url: 'https://example.com' },
    { contentType: 'text/html', html: 'x', title: 'x', url: 'file:///etc/passwd' },
    { contentType: 'text/html', html: 'x'.repeat(1_000_001), title: 'x', url: 'https://example.com' },
    { contentType: 'text/html', html: 'x', title: 'x'.repeat(241), url: 'https://example.com' },
  ]) assert.throws(() => parseViewerPageResult(value))
})
