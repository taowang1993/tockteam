import assert from 'node:assert/strict'
import test from 'node:test'
import {
  projectLivePreview,
  replaceLivePreviewLine,
} from '../dist/live-preview.js'

test('projects source-preserving tasks, comments, callouts, headings, lists, and properties', () => {
  const source = [
    '---',
    'status: active',
    '---',
    '# Lesson',
    '- [ ] Review',
    '> [!tip]- Folded tip',
    '> Body',
    '%%private%%',
    '- Parent',
    '  - Child',
    '```md',
    '- [ ] literal',
    '```',
    '',
  ].join('\r\n')
  const projection = projectLivePreview(source)
  assert.equal(projection.status, 'ready')
  if (projection.status !== 'ready') return
  assert.equal(projection.lines[1]?.kind, 'property')
  assert.equal(projection.lines[3]?.kind, 'heading')
  assert.equal(projection.lines[3]?.foldEndLine, 12)
  assert.equal(projection.lines[4]?.kind, 'task')
  assert.equal(projection.lines[4]?.checked, false)
  assert.equal(projection.lines[4]?.taskIndex, 0)
  assert.equal(projection.lines[5]?.kind, 'callout')
  assert.equal(projection.lines[5]?.folded, true)
  assert.equal(projection.lines[7]?.kind, 'comment')
  assert.equal(projection.lines[8]?.kind, 'list')
  assert.equal(projection.lines[8]?.foldEndLine, 9)
  assert.equal(projection.lines[11]?.kind, 'code')
})

test('replaces one projected line while preserving every other byte and line ending', () => {
  const source = '# A\r\n- [ ] Task  \r\nTail\r\n'
  assert.equal(
    replaceLivePreviewLine(source, 1, '- [x] Task  '),
    '# A\r\n- [x] Task  \r\nTail\r\n',
  )
  assert.equal(replaceLivePreviewLine(source, -1, 'bad'), source)
  assert.equal(replaceLivePreviewLine(source, 1, 'bad\nline'), source)
})

test('fails closed for excessive source and keeps malformed callouts editable as text', () => {
  assert.equal(projectLivePreview('x'.repeat(2_000_001)).status, 'unsupported')
  const projection = projectLivePreview('> [! tip] malformed\n')
  assert.equal(projection.status, 'ready')
  if (projection.status === 'ready') assert.equal(projection.lines[0]?.kind, 'text')
})
