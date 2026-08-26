import assert from 'node:assert/strict'
import test from 'node:test'
import { collectEmbedTargets, resolveNoteEmbedFragment } from '../dist/embeds.js'

test('collects bounded safe note, media, Canvas, and Base embeds outside code', () => {
  const source = [
    '![[Note.md#Part]]',
    '![[image.png|200x100]]',
    '![[voice.weba]]',
    '![[Board.canvas]]',
    '![[Table.base#Cards]]',
    '`![[Inline.md]]`',
    '```md',
    '![[Fence.md]]',
    '```',
    '\\![[Escaped.md]]',
  ].join('\n')
  assert.deepEqual(collectEmbedTargets(source), [
    { display: null, fragment: 'Part', kind: 'note', path: 'Note.md', source: '![[Note.md#Part]]' },
    { display: '200x100', fragment: null, kind: 'media', path: 'image.png', source: '![[image.png|200x100]]' },
    { display: null, fragment: null, kind: 'media', path: 'voice.weba', source: '![[voice.weba]]' },
    { display: null, fragment: null, kind: 'canvas', path: 'Board.canvas', source: '![[Board.canvas]]' },
    { display: null, fragment: 'Cards', kind: 'base', path: 'Table.base', source: '![[Table.base#Cards]]' },
  ])
})

test('extracts bounded note headings and block fragments without frontmatter', () => {
  const source = '---\ntitle: Note\n---\n# One\nA\n\n## Part\nB\n\nBlock. ^target\n'
  assert.equal(resolveNoteEmbedFragment(source, null), '# One\nA\n\n## Part\nB\n\nBlock. ^target\n')
  assert.equal(resolveNoteEmbedFragment(source, 'Part'), '## Part\nB\n\nBlock. ^target\n')
  assert.equal(resolveNoteEmbedFragment(source, '^target'), 'Block.\n')
})

test('fails excessive and unsafe embed targets closed', () => {
  assert.throws(() => collectEmbedTargets(Array.from({ length: 101 }, (_, index) => `![[N${String(index)}.md]]`).join('\n')), /target limit/u)
  assert.deepEqual(collectEmbedTargets('![[../escape.md]]\n![[https://user:secret@example.com/x]]'), [])
})
