import assert from 'node:assert/strict'
import test from 'node:test'

import { createDeterministicZip } from '../src/archive.ts'
import { ImportExportError } from '../src/core.ts'
import {
  MARKDOWN_ARCHIVE_LIMITS,
  planMarkdownFolder,
  planMarkdownZip,
  type InspectedSourceFile,
} from '../src/formats/markdown.ts'

const encode = (value: string): Uint8Array => new TextEncoder().encode(value)
const file = (path: string, bytes: Uint8Array): InspectedSourceFile => ({
  bytes,
  fingerprint: `revision:${path}`,
  path,
})

test('plans supported Markdown folder bytes in deterministic relative order', () => {
  const result = planMarkdownFolder([
    file('Images/photo.png', new Uint8Array([1, 2, 3])),
    file('Notes/Course.canvas', encode('{"nodes":[],"edges":[]}')),
    file('Notes/Course.md', encode('# Course\n')),
    file('plugin.js', encode('unsafe()')),
  ])

  assert.deepEqual(result.files.map(entry => [entry.destination, entry.kind]), [
    ['Images/photo.png', 'attachment'],
    ['Notes/Course.canvas', 'document'],
    ['Notes/Course.md', 'document'],
  ])
  assert.deepEqual(result.skipped, [{ label: 'plugin.js', reason: 'unsupported-type' }])
  assert.deepEqual(result.warnings, ['1 unsupported or unsafe source entry will not be imported.'])
  assert.match(result.digest, /^sha256:[0-9a-f]{64}$/u)
  assert.equal(result.size, 3 + 23 + 9)
})

test('uses the same planner for a bounded hostile ZIP source', () => {
  const archive = createDeterministicZip([
    { bytes: encode('# B\n'), path: 'B.md' },
    { bytes: encode('# A\n'), path: 'A.md' },
    { bytes: encode('no'), path: 'script.sh' },
  ])
  const result = planMarkdownZip(archive)
  assert.deepEqual(result.files.map(entry => entry.destination), ['A.md', 'B.md'])
  assert.deepEqual(result.skipped, [{ label: 'script.sh', reason: 'unsupported-type' }])
  assert.equal(result.sourceEntries, 3)
})

test('rejects invalid document encoding, destination aliases, and source limits', () => {
  assert.throws(
    () => planMarkdownFolder([file('Broken.md', new Uint8Array([0xff]))]),
    (error: unknown) => error instanceof ImportExportError && error.code === 'unsupported-type',
  )
  assert.throws(
    () => planMarkdownFolder([
      file('Notes/A.md', encode('# A')),
      file('notes/a.md', encode('# other')),
    ]),
    (error: unknown) => error instanceof ImportExportError && error.code === 'destination-collision',
  )
  assert.throws(
    () => planMarkdownZip(new Uint8Array(MARKDOWN_ARCHIVE_LIMITS.maxArchiveBytes + 1)),
    (error: unknown) => error instanceof ImportExportError && error.code === 'limit-exceeded',
  )
})
