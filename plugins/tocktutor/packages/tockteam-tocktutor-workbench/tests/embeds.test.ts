import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectEmbedTargets,
  resolveEmbedGraph,
  resolveEmbedTargetPath,
  resolveNoteEmbedFragment,
} from '../dist/embeds.js'

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

test('resolves relative media and note embeds from the source path without escaping the vault', () => {
  assert.deepEqual(collectEmbedTargets('![[../Attachments/pixel.png|16x16]]\n![[./Sibling.md]]', 'Notes/Welcome.md'), [
    { display: '16x16', fragment: null, kind: 'media', path: 'Attachments/pixel.png', source: '![[../Attachments/pixel.png|16x16]]' },
    { display: null, fragment: null, kind: 'note', path: 'Notes/Sibling.md', source: '![[./Sibling.md]]' },
  ])
  assert.deepEqual(collectEmbedTargets('![[../escape.md]]', 'Welcome.md'), [])
})

test('resolves nested relative embeds with parent identity and bounded reads', async () => {
  const result = await resolveEmbedGraph({
    entries: [{ path: 'Notes/Parent.md' }, { path: 'Attachments/nested.png' }],
    readAttachment: async path => ({ dataBase64: 'iVBORw0KGgo=', mimeType: 'image/png', path }),
    readDocument: async path => ({ content: path === 'Notes/Parent.md' ? '# Parent\n\n![[../Attachments/nested.png|8x8]]\n' : '', path }),
    source: '![[./Parent.md]]\n',
    sourcePath: 'Notes/Welcome.md',
  })
  assert.equal(result.status, 'ready')
  assert.equal(result.truncated, false)
  assert.deepEqual(result.embeds.map(embed => ({ depth: embed.depth, parentPath: embed.parentPath, path: embed.target.path })), [
    { depth: 0, parentPath: undefined, path: 'Notes/Parent.md' },
    { depth: 1, parentPath: 'Notes/Parent.md', path: 'Attachments/nested.png' },
  ])
})

test('prefers an exact embed path before an otherwise ambiguous basename', () => {
  const entries = [{ path: 'Course/Note.md' }, { path: 'Archive/Note.md' }]
  assert.equal(resolveEmbedTargetPath(entries, 'Course/Note.md'), 'Course/Note.md')
  assert.equal(resolveEmbedTargetPath(entries, 'Note.md'), null)
  assert.equal(resolveEmbedTargetPath([{ path: 'Course/Note.md' }], 'Note.md'), 'Course/Note.md')
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
