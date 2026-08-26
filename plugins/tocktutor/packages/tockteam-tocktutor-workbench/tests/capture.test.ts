import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCaptureNote,
  buildJournalNote,
  expandTemplate,
  uniqueNotePath,
} from '../dist/capture.js'

const now = new Date(2026, 7, 26, 15, 4, 5, 123)

test('builds collision-safe Inbox capture without losing meaningful Markdown whitespace', () => {
  const existing = new Set(['Inbox/2026-08-26-lesson.md'])
  assert.deepEqual(buildCaptureNote({ body: '  indented\nline  \n', existing, now, title: 'Lesson' }), {
    content: '# Lesson\n\n  indented\nline  \n',
    path: 'Inbox/2026-08-26-lesson-2.md',
  })
})

test('expands bounded template and journal date/time variables', () => {
  const template = '# {{title}}\n{{date}} {{time}} {{date:YYYY/MM/DD}} {{time:HH:mm:ss}} {{unknown}}\n'
  assert.equal(expandTemplate(template, { now, title: 'Class' }), '# Class\n2026-08-26 15:04 2026/08/26 15:04:05 {{unknown}}\n')
  assert.deepEqual(buildJournalNote({ folder: 'Journals', now, template: '# Daily\n{{date}}\n' }), {
    content: '# Daily\n2026-08-26\n',
    path: 'Journals/2026-08-26.md',
  })
})

test('allocates minute timestamp notes with bounded rollover', () => {
  const existing = new Set(['202608261504.md', '202608261505.md'])
  assert.equal(uniqueNotePath(now, existing), '202608261506.md')
  assert.throws(() => buildJournalNote({ folder: '../escape', now }), /folder/u)
})
