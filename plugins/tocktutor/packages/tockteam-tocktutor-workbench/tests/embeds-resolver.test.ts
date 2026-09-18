import assert from 'node:assert/strict'
import test from 'node:test'
import { collectEmbedTargets, resolveEmbedGraph } from '../dist/embeds.js'

const entries = [
  { kind: 'document', path: 'Root.md' },
  { kind: 'document', path: 'Section.md' },
  { kind: 'document', path: 'Cycle.md' },
  { kind: 'document', path: 'Board.canvas' },
  { kind: 'document', path: 'Tasks.base' },
  { kind: 'attachment', path: 'photo.png' },
]

function resolver(source: string, overrides: Record<string, string> = {}) {
  const documents: Record<string, string> = {
    'Root.md': '# Root\n![[Section.md#Details]]\n![[photo.png]]',
    'Section.md': '# Details\nNested\n![[Cycle.md]]',
    'Cycle.md': '# Cycle\n![[Section.md]]',
    'Board.canvas': '{"nodes":[]}',
    'Tasks.base': 'views:\n  - type: table',
    ...overrides,
  }
  return resolveEmbedGraph({
    entries,
    readAttachment: async path => ({ dataBase64: 'AQID', mimeType: 'image/png', path }),
    readDocument: async path => ({ content: documents[path]!, path }),
    source,
  })
}

test('resolves nested note sections and media through depth three with cached reads', async () => {
  const calls: string[] = []
  const result = await resolveEmbedGraph({
    entries,
    readAttachment: async path => ({ dataBase64: 'AQID', mimeType: 'image/png', path }),
    readDocument: async path => {
      calls.push(path)
      return {
        content: path === 'Root.md'
          ? '# Root\n![[Section.md#Details]]\n![[Board.canvas]]\n![[Tasks.base]]'
          : path === 'Section.md' ? '# Details\n![[Cycle.md]]' : path === 'Cycle.md' ? '![[Section.md]]' : '{}',
        path,
      }
    },
    source: '![[Root.md]]',
  })
  assert.equal(result.status, 'ready')
  assert.deepEqual(result.embeds.map(embed => [embed.target.path, embed.depth]), [
    ['Root.md', 0],
    ['Section.md', 1],
    ['Cycle.md', 2],
    ['Board.canvas', 1],
    ['Tasks.base', 1],
  ])
  assert.deepEqual(calls.sort(), ['Board.canvas', 'Cycle.md', 'Root.md', 'Section.md', 'Tasks.base'])
  assert.match(result.warnings.join('\n'), /cycle ignored/u)
})

test('enforces depth, aggregate, and media budgets without unbounded reads', async () => {
  const depth = await resolver('![[Root.md]]', {
    'Root.md': '![[Section.md]]',
    'Section.md': '![[Cycle.md]]',
    'Cycle.md': '![[Section.md]]',
  })
  assert.equal(depth.status, 'ready')
  assert.ok(depth.embeds.length <= 4)

  const limited = await resolveEmbedGraph({
    entries,
    maxTotalBytes: 1,
    readAttachment: async path => ({ dataBase64: 'AQID', mimeType: 'image/png', path }),
    readDocument: async path => ({ content: 'too large', path }),
    source: '![[Root.md]]',
  })
  assert.equal(limited.status, 'ready')
  assert.equal(limited.embeds.length, 0)
  assert.equal(limited.truncated, true)

  const media = await resolveEmbedGraph({
    entries,
    maxMediaBytes: 2,
    readAttachment: async path => ({ dataBase64: 'AQID', mimeType: 'image/png', path }),
    readDocument: async path => ({ content: '{}', path }),
    source: '![[photo.png]]',
  })
  assert.equal(media.embeds.length, 0)
  assert.equal(media.truncated, true)
})

test('returns cancelled and stale results and never publishes late content', async () => {
  const controller = new AbortController()
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const cancelled = resolveEmbedGraph({
    entries,
    readAttachment: async path => ({ dataBase64: 'AQID', mimeType: 'image/png', path }),
    readDocument: async path => { await pending; return { content: 'late', path } },
    signal: controller.signal,
    source: '![[Root.md]]',
  })
  controller.abort()
  release()
  assert.equal((await cancelled).status, 'cancelled')

  let current = true
  const stale = await resolveEmbedGraph({
    entries,
    isCurrent: () => current,
    readAttachment: async path => ({ dataBase64: 'AQID', mimeType: 'image/png', path }),
    readDocument: async path => {
      current = false
      return { content: 'late', path }
    },
    source: '![[Root.md]]',
  })
  assert.equal(stale.status, 'stale')
  assert.equal(stale.embeds.length, 0)
})

test('keeps media kinds aligned with the Host attachment boundary', () => {
  assert.deepEqual(collectEmbedTargets('![[safe.png]]\n![[unsafe.svg]]\n![[unsupported.flac]]\n').map(target => target.path), ['safe.png'])
})

test('rejects malformed media payloads and keeps unsafe targets inert', async () => {
  const result = await resolveEmbedGraph({
    entries,
    readAttachment: async path => ({ dataBase64: 'not-base64', mimeType: 'text/html', path }),
    readDocument: async path => ({ content: '{}', path }),
    source: '![[photo.png]]\n![[../secret.png]]\n![[https://user:secret@example.com/a]]',
  })
  assert.equal(result.status, 'ready')
  assert.equal(result.embeds.length, 0)
  assert.match(result.warnings.join('\n'), /media type/u)
})
