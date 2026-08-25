import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ClipReviewError,
  ClipReviewStore,
  MAX_PENDING_CLIP_REVIEWS,
  buildClipMarkdown,
  normalizeClipDestination,
  type ClipApproval,
  type ClipPreview,
} from '../src/review.ts'

const vault = Object.freeze({ generation: 7, id: 'vault:opaque' })

function store(clock = { now: 1_700_000_000_000 }) {
  let nextId = 0
  return new ClipReviewStore({
    createId: () => `review-${String(++nextId)}`,
    now: () => clock.now,
    ttlMs: 60_000,
  })
}

function preview(reviewStore: ClipReviewStore, overrides: Partial<Parameters<ClipReviewStore['create']>[0]> = {}): ClipPreview {
  return reviewStore.create({
    capturedAt: new Date('2026-01-02T03:04:05.000Z'),
    content: 'Readable body.\n',
    sourceUrl: 'https://example.com/article#section',
    title: 'Example Article',
    vault,
    ...overrides,
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
    target: { state: 'absent' },
    vault: value.vault,
  }
}

test('builds a bounded source-attributed Markdown preview and safe default destination', () => {
  const reviewStore = store()
  const value = preview(reviewStore)
  assert.equal(value.sourceUrl, 'https://example.com/article')
  assert.equal(value.destination, '2026-01-02-example-article.md')
  assert.equal(value.permission, 'user-approval-required')
  assert.deepEqual(value.target, { state: 'absent' })
  assert.match(value.contentDigest, /^sha256:[0-9a-f]{64}$/u)
  assert.equal(value.markdown, buildClipMarkdown({
    capturedAt: new Date('2026-01-02T03:04:05.000Z'),
    content: 'Readable body.',
    sourceUrl: 'https://example.com/article',
    title: 'Example Article',
  }))
  assert.match(value.markdown, /^---\nsource: https:\/\/example\.com\/article\ncaptured: 2026-01-02T03:04:05\.000Z\nkind: web-clip\n---\n\n# Example Article\n\nSource: \[Source\]\(<https:\/\/example\.com\/article>\)\n\nReadable body\.\n$/u)
  assert.match(buildClipMarkdown({
    capturedAt: new Date('2026-01-02T03:04:05.000Z'),
    content: 'Readable body.',
    sourceUrl: 'https://example.com/a_(b)',
    title: 'Parenthesized URL',
  }), /\[Source\]\(<https:\/\/example\.com\/a_\(b\)>\)/u)
  assert.equal(value.expiresAt, 1_700_000_060_000)
})

test('normalizes only bounded relative Markdown destinations', () => {
  assert.equal(normalizeClipDestination(' Clips\\News//Article.markdown '), 'Clips/News/Article.markdown')
  for (const value of [
    '', '/absolute.md', 'C:\\absolute.md', '../escape.md', 'Clips/../escape.md',
    'Clips/not-markdown.txt', 'Clips/bad:name.md', `Clips/${'x'.repeat(256)}.md`,
    `${'x'.repeat(1020)}.md`,
  ]) assert.throws(() => normalizeClipDestination(value), ClipReviewError)
})

test('consumes one exact approval into an immutable runtime create payload', () => {
  const reviewStore = store()
  const value = preview(reviewStore, { destination: 'Inbox/Article.md' })
  const consumed = reviewStore.consume(approval(value), vault)
  assert.deepEqual(consumed, {
    content: value.markdown,
    contentDigest: value.contentDigest,
    expectedVault: vault,
    path: 'Inbox/Article.md',
    sourceUrl: 'https://example.com/article',
    target: { state: 'absent' },
  })
  assert.equal(Object.isFrozen(consumed), true)
  assert.throws(() => reviewStore.consume(approval(value), vault), (error: unknown) => (
    error instanceof ClipReviewError && error.code === 'missing'
  ))
})

test('mismatch attempts consume the review and reject every bound field', () => {
  const mutations: Array<(value: ClipApproval) => ClipApproval> = [
    value => ({ ...value, sourceUrl: 'https://example.net/' }),
    value => ({ ...value, destination: 'Other.md' }),
    value => ({ ...value, contentDigest: `sha256:${'0'.repeat(64)}` }),
    value => ({ ...value, expiresAt: value.expiresAt + 1 }),
    value => ({ ...value, permission: 'denied' as ClipApproval['permission'] }),
    value => ({ ...value, target: { state: 'changed' } as unknown as ClipApproval['target'] }),
    value => ({ ...value, vault: { ...value.vault, id: 'vault:other' } }),
    value => ({ ...value, vault: { ...value.vault, generation: value.vault.generation + 1 } }),
  ]
  for (const mutate of mutations) {
    const reviewStore = store()
    const value = preview(reviewStore)
    assert.throws(() => reviewStore.consume(mutate(approval(value)), vault), (error: unknown) => (
      error instanceof ClipReviewError && error.code === 'mismatch'
    ))
    assert.throws(() => reviewStore.consume(approval(value), vault), (error: unknown) => (
      error instanceof ClipReviewError && error.code === 'missing'
    ))
  }

  const reviewStore = store()
  const value = preview(reviewStore)
  assert.throws(
    () => reviewStore.consume(approval(value), { ...vault, generation: vault.generation + 1 }),
    (error: unknown) => error instanceof ClipReviewError && error.code === 'mismatch',
  )
})

test('expires, cancels, disposes, and bounds pending one-use reviews', () => {
  const clock = { now: 1_700_000_000_000 }
  const expiring = store(clock)
  const expired = preview(expiring)
  clock.now = expired.expiresAt
  assert.throws(() => expiring.consume(approval(expired), vault), (error: unknown) => (
    error instanceof ClipReviewError && error.code === 'expired'
  ))

  const cancelledStore = store()
  const cancelled = preview(cancelledStore)
  assert.equal(cancelledStore.cancel(cancelled.reviewId), true)
  assert.equal(cancelledStore.cancel(cancelled.reviewId), false)
  assert.throws(() => cancelledStore.consume(approval(cancelled), vault), ClipReviewError)

  const bounded = store()
  for (let index = 0; index < MAX_PENDING_CLIP_REVIEWS; index += 1) preview(bounded, { title: `Clip ${String(index)}` })
  assert.throws(() => preview(bounded), (error: unknown) => (
    error instanceof ClipReviewError && error.code === 'capacity'
  ))
  bounded.dispose()
  const afterDispose = preview(bounded)
  assert.equal(afterDispose.reviewId, `review-${String(MAX_PENDING_CLIP_REVIEWS + 1)}`)
})

test('rejects malformed source, content, vault, timestamps, and colliding review identities', () => {
  const reviewStore = new ClipReviewStore({ createId: () => 'same', now: () => 1_000, ttlMs: 1_000 })
  preview(reviewStore)
  for (const overrides of [
    { sourceUrl: 'https://user:secret@example.com/' },
    { sourceUrl: 'file:///tmp/local' },
    { title: '' },
    { title: 'x'.repeat(201) },
    { content: '' },
    { content: 'x'.repeat(200_001) },
    { content: '😀'.repeat(70_000) },
    { vault: { generation: -1, id: 'vault' } },
    { vault: { generation: 1, id: '' } },
    { capturedAt: new Date(Number.NaN) },
  ]) assert.throws(() => preview(store(), overrides), ClipReviewError)
  assert.throws(() => preview(reviewStore), ClipReviewError)
})
