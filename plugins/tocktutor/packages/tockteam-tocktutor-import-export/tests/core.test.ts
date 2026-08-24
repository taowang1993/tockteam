import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ImportExportError,
  createReviewedPlan,
  normalizeRelativePath,
  type PlannedFile,
} from '../src/core.ts'

const vault = { generation: 7, id: `vault:${'7'.repeat(64)}` }
const source = {
  digest: `sha256:${'a'.repeat(64)}`,
  fingerprint: 'opaque-root-revision',
  format: 'markdown-folder' as const,
  label: 'Course Export',
  size: 12,
}

function document(destination: string, content = '# Note\n'): PlannedFile {
  return {
    bytes: new TextEncoder().encode(content),
    destination,
    kind: 'document',
    sourceKey: destination,
  }
}

test('normalizes only strict portable vault-relative paths', () => {
  assert.equal(normalizeRelativePath('Folder/Note.md'), 'Folder/Note.md')
  for (const unsafe of [
    '', '.', './Note.md', '../Note.md', 'Folder/../Note.md', '/Note.md',
    'C:\\Note.md', 'C:Note.md', 'Folder\\Note.md', 'Folder//Note.md',
    'Folder/.hidden/Note.md', 'Folder/Note\0.md', 'Folder/Note:.md',
  ]) {
    assert.throws(
      () => normalizeRelativePath(unsafe),
      (error: unknown) => error instanceof ImportExportError && error.code === 'invalid-path',
      unsafe,
    )
  }
})

test('builds a stable bounded browser preview without source bytes or handles', () => {
  const first = createReviewedPlan({
    createdAt: 1_000,
    expiresAt: 301_000,
    files: [document('Notes/B.md', '# B\n'), document('Notes/A.md', '# A\n')],
    operationId: 'operation-1',
    source,
    token: 'one-use-secret',
    vault,
    warnings: ['One unsupported file was skipped.'],
    skipped: [{ label: 'script.js', reason: 'unsupported-type' }],
  })
  const second = createReviewedPlan({
    createdAt: 1_000,
    expiresAt: 301_000,
    files: [document('Notes/A.md', '# A\n'), document('Notes/B.md', '# B\n')],
    operationId: 'operation-1',
    source,
    token: 'different-one-use-secret',
    vault,
    warnings: ['One unsupported file was skipped.'],
    skipped: [{ label: 'script.js', reason: 'unsupported-type' }],
  })

  assert.equal(first.summary.planDigest, second.summary.planDigest)
  assert.deepEqual(first.summary.items.map(item => item.destination), ['Notes/A.md', 'Notes/B.md'])
  assert.equal(first.summary.items.every(item => /^[0-9a-f]{24}$/u.test(item.id)), true)
  assert.equal(first.summary.collisionPolicy, 'preserve-existing')
  assert.equal(JSON.stringify(first.summary).includes('# A'), false)
  assert.equal(JSON.stringify(first.summary).includes('one-use-secret'), false)
  assert.equal('files' in first.summary, false)
  assert.equal(first.token, 'one-use-secret')
})

test('rejects case and Unicode destination aliases before review', () => {
  for (const files of [
    [document('Notes/A.md'), document('notes/a.md')],
    [document('Notes/Café.md'), document('Notes/Café.md')],
  ]) {
    assert.throws(
      () => createReviewedPlan({
        createdAt: 1_000,
        expiresAt: 301_000,
        files,
        operationId: 'operation-1',
        source,
        token: 'secret',
        vault,
        warnings: [],
        skipped: [],
      }),
      (error: unknown) => error instanceof ImportExportError && error.code === 'destination-collision',
    )
  }
})
