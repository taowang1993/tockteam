import assert from 'node:assert/strict'
import test from 'node:test'

import { ImportExportError } from '../src/core.ts'
import {
  createDeterministicZip,
  parseZip,
  type ArchiveLimits,
} from '../src/archive.ts'

const limits: ArchiveLimits = {
  maxArchiveBytes: 2 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxDepth: 8,
  maxEntries: 20,
  maxEntryBytes: 1024 * 1024,
  maxFilenameBytes: 200,
  maxParserMs: 5_000,
  maxTotalBytes: 2 * 1024 * 1024,
}

function replaceAll(bytes: Uint8Array, from: string, to: string): Uint8Array {
  assert.equal(Buffer.byteLength(from), Buffer.byteLength(to))
  const output = Buffer.from(bytes)
  let offset = 0
  while ((offset = output.indexOf(from, offset, 'utf8')) >= 0) {
    output.write(to, offset, 'utf8')
    offset += Buffer.byteLength(to)
  }
  return output
}

test('writes and reads deterministic confined ZIP entries', () => {
  const entries = [
    { bytes: new TextEncoder().encode('# Nested\n'), path: 'Folder/Nested.md' },
    { bytes: new Uint8Array([0, 1, 2, 3]), path: 'image.png' },
  ]
  const first = createDeterministicZip(entries)
  const second = createDeterministicZip([...entries].reverse())
  assert.deepEqual(first, second)
  assert.deepEqual(
    parseZip(first, limits),
    [
      { bytes: new TextEncoder().encode('# Nested\n'), compressedSize: 9, path: 'Folder/Nested.md' },
      { bytes: new Uint8Array([0, 1, 2, 3]), compressedSize: 4, path: 'image.png' },
    ],
  )
})

test('rejects traversal, absolute, drive, NUL, dot, nested archive, and aliases', () => {
  const base = createDeterministicZip([
    { bytes: new Uint8Array([1]), path: 'safe.md' },
  ])
  for (const unsafe of ['../x.md', '/bad.md', 'C:bad.md', './bad.md', 'bad\0.md']) {
    const archive = replaceAll(base, 'safe.md', unsafe.padEnd(7, '_').slice(0, 7))
    assert.throws(
      () => parseZip(archive, limits),
      (error: unknown) => error instanceof ImportExportError && error.code === 'invalid-archive',
      unsafe,
    )
  }
  assert.throws(
    () => createDeterministicZip([
      { bytes: new Uint8Array([1]), path: 'A.md' },
      { bytes: new Uint8Array([2]), path: 'a.md' },
    ]),
    (error: unknown) => error instanceof ImportExportError && error.code === 'invalid-archive',
  )
  assert.throws(
    () => parseZip(createDeterministicZip([
      { bytes: new Uint8Array([1]), path: 'nested.zip' },
    ]), limits),
    (error: unknown) => error instanceof ImportExportError && error.code === 'invalid-archive',
  )
})

test('rejects checksum changes, truncation, symlinks, and compression bombs', () => {
  const archive = createDeterministicZip([
    { bytes: new TextEncoder().encode('plain payload'), path: 'Note.md' },
  ])
  const changed = Buffer.from(archive)
  const payload = changed.indexOf('plain payload', 0, 'utf8')
  assert.notEqual(payload, -1)
  changed[payload] = changed[payload]! ^ 1
  assert.throws(() => parseZip(changed, limits), ImportExportError)
  assert.throws(() => parseZip(archive.subarray(0, archive.byteLength - 1), limits), ImportExportError)

  const symlink = Buffer.from(archive)
  const central = symlink.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  assert.notEqual(central, -1)
  symlink.writeUInt32LE(0xa1ff0000, central + 38)
  assert.throws(
    () => parseZip(symlink, limits),
    (error: unknown) => error instanceof ImportExportError && error.code === 'invalid-archive',
  )
  const executable = Buffer.from(archive)
  executable.writeUInt32LE((0o100700 << 16) >>> 0, central + 38)
  assert.throws(
    () => parseZip(executable, limits),
    (error: unknown) => error instanceof ImportExportError && error.code === 'invalid-archive',
  )
  assert.throws(
    () => parseZip(createDeterministicZip([{ bytes: new Uint8Array([1]), path: '__MACOSX/resource' }]), limits),
    (error: unknown) => error instanceof ImportExportError && error.code === 'invalid-archive',
  )

  const bomb = createDeterministicZip([
    { bytes: new Uint8Array(1024 * 1024), path: 'zeros.bin' },
  ])
  assert.throws(
    () => parseZip(bomb, { ...limits, maxCompressionRatio: 10 }),
    (error: unknown) => error instanceof ImportExportError && error.code === 'limit-exceeded',
  )
})
