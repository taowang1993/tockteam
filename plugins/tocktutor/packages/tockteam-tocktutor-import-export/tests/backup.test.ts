import assert from 'node:assert/strict'
import test from 'node:test'

import { createDeterministicZip, parseZip } from '../src/archive.ts'
import {
  BACKUP_ARCHIVE_LIMITS,
  createBackupArchive,
  planVerifiedRestore,
  verifyBackupArchive,
  type BackupSnapshotEntry,
} from '../src/backup.ts'
import { ImportExportError, sha256 } from '../src/core.ts'

const encode = (value: string): Uint8Array => new TextEncoder().encode(value)
const vault = { generation: 8, id: `vault:${'8'.repeat(64)}` }
const entries: BackupSnapshotEntry[] = [
  { bytes: encode('# Nested\n'), kind: 'document', path: 'Folder/Nested.md', revision: 'rev-note' },
  { bytes: new Uint8Array([1, 2, 3]), kind: 'attachment', path: 'Images/photo.png', revision: 'rev-image' },
]

test('creates a deterministic complete nested backup and independently verifies it', () => {
  const first = createBackupArchive({ createdAt: 1_000, entries, vault })
  const second = createBackupArchive({ createdAt: 1_000, entries: [...entries].reverse(), vault })
  assert.deepEqual(first, second)
  const verified = verifyBackupArchive(first)
  assert.equal(verified.manifest.version, 2)
  assert.equal(verified.manifest.totalBytes, 12)
  assert.deepEqual(verified.manifest.entries.map(entry => entry.path), ['Folder/Nested.md', 'Images/photo.png'])
  assert.deepEqual(verified.entries.map(entry => entry.path), ['Folder/Nested.md', 'Images/photo.png'])
  assert.equal(verified.outerDigest, sha256(first))

  const restore = planVerifiedRestore(first)
  assert.deepEqual(restore.files.map(file => [file.destination, file.kind]), [
    ['Folder/Nested.md', 'document'],
    ['Images/photo.png', 'attachment'],
  ])
})

test('rejects missing, extra, duplicate, changed, malformed, and incompatible members', () => {
  const archive = createBackupArchive({ createdAt: 1_000, entries, vault })
  const parsed = parseZip(archive, BACKUP_ARCHIVE_LIMITS, { allowNestedArchives: true })
  const manifest = parsed.find(entry => entry.path === 'backup/manifest.json')!
  const payload = parsed.filter(entry => entry.path !== 'backup/manifest.json')

  for (const replacement of [
    [manifest, payload[0]!],
    [manifest, ...payload, { path: 'backup/files/Extra.md', bytes: encode('extra'), compressedSize: 5 }],
  ]) {
    const rebuilt = createDeterministicZip(replacement.map(entry => ({ path: entry.path, bytes: entry.bytes })))
    assert.throws(
      () => verifyBackupArchive(rebuilt),
      (error: unknown) => error instanceof ImportExportError && error.code === 'invalid-manifest',
    )
  }

  const rawManifest = JSON.parse(new TextDecoder().decode(manifest.bytes)) as Record<string, unknown>
  for (const mutate of [
    (value: Record<string, unknown>) => { value.version = 99 },
    (value: Record<string, unknown>) => { (value.entries as Array<Record<string, unknown>>)[0]!.sha256 = `sha256:${'0'.repeat(64)}` },
    (value: Record<string, unknown>) => { (value.entries as Array<Record<string, unknown>>)[1]!.path = 'Folder/Nested.md' },
    (value: Record<string, unknown>) => { value.totalBytes = -1 },
  ]) {
    const changed = structuredClone(rawManifest)
    mutate(changed)
    const rebuilt = createDeterministicZip([
      { path: 'backup/manifest.json', bytes: encode(`${JSON.stringify(changed)}\n`) },
      ...payload.map(entry => ({ path: entry.path, bytes: entry.bytes })),
    ])
    assert.throws(
      () => verifyBackupArchive(rebuilt),
      (error: unknown) => error instanceof ImportExportError && error.code === 'invalid-manifest',
    )
  }
})

test('rejects cancellation and oversized outer archives before member use', () => {
  const controller = new AbortController()
  controller.abort()
  assert.throws(
    () => verifyBackupArchive(createBackupArchive({ createdAt: 1_000, entries, vault }), controller.signal),
    (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
  )
  assert.throws(
    () => verifyBackupArchive(new Uint8Array(BACKUP_ARCHIVE_LIMITS.maxArchiveBytes + 1)),
    (error: unknown) => error instanceof ImportExportError && error.code === 'limit-exceeded',
  )
})
