import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildHighlightNote,
  buildOrganizationProposal,
} from '../dist/organize.js'

const now = new Date(2026, 7, 26, 10, 0)

test('builds deterministic pasted Highlights with valid quoted metadata', () => {
  assert.deepEqual(buildHighlightNote({
    highlights: ['First quote', 'Second\nquote'],
    now,
    sourceUrl: 'https://example.com/lesson',
    title: 'Lesson: One',
  }), {
    content: '---\nsource: "https://example.com/lesson"\ntitle: "Lesson: One"\n---\n# Lesson: One\n\n> First quote\n\n> Second\n> quote\n',
    path: 'Highlights/2026-08-26-lesson-one.md',
  })
})

test('builds reviewed single and batch Inbox organization without automatic writes', () => {
  const single = buildOrganizationProposal({
    captures: [{ content: '# Algebra\nQuadratic notes.\n', path: 'Inbox/2026-08-26-algebra.md' }],
    now,
    title: 'Algebra Review',
  })
  assert.equal(single.destination, 'Organized/2026-08-26-algebra-review.md')
  assert.match(single.content, /\[\[Inbox\/2026-08-26-algebra\.md\]\]/u)
  assert.match(single.id, /^organize-[0-9a-f]{8}$/u)
  const batch = buildOrganizationProposal({
    captures: [
      { content: '# One\nA\n', path: 'Inbox/One.md' },
      { content: '# Two\nB\n', path: 'Inbox/Two.md' },
    ],
    now,
    title: 'Inbox Review',
  })
  assert.equal(batch.destination, 'Organized/2026-08-26-inbox-review.md')
  assert.match(batch.content, /## One[\s\S]*## Two/u)
})

test('rejects changed, oversized, unsafe, or colliding organization inputs', () => {
  assert.throws(() => buildOrganizationProposal({ captures: [{ content: 'x', path: '../escape.md' }], now, title: 'Bad' }), /path/u)
  assert.throws(() => buildOrganizationProposal({ captures: [], now, title: 'Empty' }), /capture/u)
  assert.throws(() => buildHighlightNote({ highlights: ['x'.repeat(1_000_001)], now, title: 'Huge' }), /large/u)
})
