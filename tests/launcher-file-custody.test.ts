import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { open } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensurePrivateDirectory } from '../src/launcher-persistence.ts'
import { readBoundedRegularFile } from '../src/trusted-raycast-bounded-file.ts'
import { readTrustedRaycastFile } from '../src/trusted-raycast-artifact-admission.ts'

const readers = [
  { name: 'text', read: readBoundedRegularFile },
  { name: 'artifact', read: readTrustedRaycastFile },
]

test('managed Windows directories retain custody checks without unsupported POSIX fchmod', async t => {
  const root = fs.mkdtempSync(join(tmpdir(), 'windows-directory-contract-'))
  const directory = join(root, 'managed')
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
  const probe = await open(root, fs.constants.O_RDONLY)
  const prototype = Object.getPrototypeOf(probe)
  await probe.close()
  let chmodCalls = 0
  t.mock.method(prototype, 'chmod', async () => {
    chmodCalls++
    throw Object.assign(new Error('Windows directory fchmod is unsupported'), { code: 'EPERM' })
  })
  try {
    Object.defineProperty(process, 'platform', { ...descriptor, value: 'win32' })
    await ensurePrivateDirectory(directory)
    assert.equal(chmodCalls, 0)
    assert.equal(fs.lstatSync(directory).isDirectory(), true)
    const alias = join(root, 'alias')
    fs.symlinkSync(directory, alias, 'junction')
    await assert.rejects(ensurePrivateDirectory(alias), /symlink/)
    Object.defineProperty(process, 'platform', { ...descriptor, value: 'darwin' })
    await assert.rejects(ensurePrivateDirectory(directory), /fchmod is unsupported/)
    assert.equal(chmodCalls, 1, 'POSIX permission failures still propagate')
  } finally {
    Object.defineProperty(process, 'platform', descriptor)
    t.mock.restoreAll()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('bounded reads accept the exact limit and reject oversized files, directories and invalid bounds', () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'bounded-file-contract-'))
  const selected = join(root, 'selected.json')
  try {
    fs.writeFileSync(selected, '1234')
    assert.equal(readBoundedRegularFile(selected, 4), '1234')
    assert.throws(() => readBoundedRegularFile(selected, 3), /invalid|size limit/)
    assert.throws(() => readBoundedRegularFile(root, 4), /invalid/)
    for (const limit of [0, -1, NaN, Infinity]) assert.throws(() => readBoundedRegularFile(selected, limit), /Invalid bounded file limit/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('artifact reads preserve binary bytes and enforce exact size bounds', () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'artifact-bytes-contract-'))
  const file = join(root, 'artifact.bin')
  try {
    const bytes = Buffer.from([0, 255, 128, 10])
    fs.writeFileSync(file, bytes)
    assert.deepEqual(readTrustedRaycastFile(file, 4), bytes)
    assert.throws(() => readTrustedRaycastFile(file, 3), /size bound/)
    for (const limit of [-1, NaN, Infinity, 1.5]) assert.throws(() => readTrustedRaycastFile(file, limit), /size bound/)
    fs.writeFileSync(file, '')
    assert.deepEqual(readTrustedRaycastFile(file, 0), Buffer.alloc(0))
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

for (const reader of readers) for (const mode of ['symlink', 'symlink-on-open', 'file-on-open', 'symlink-on-read', 'growth'] as const) {
  test(`bounded ${reader.name} reads fail closed and release their descriptor: ${mode}`, t => {
    const root = fs.mkdtempSync(join(tmpdir(), 'windows-nofollow-contract-'))
    const target = join(root, 'target.json')
    const selected = join(root, 'selected.json')
    fs.writeFileSync(target, '6789')
    if (mode === 'symlink') fs.symlinkSync(target, selected)
    else fs.writeFileSync(selected, '1234')
    const nativeOpen = fs.openSync
    const nativeRead = fs.readSync
    const nativeStat = fs.fstatSync
    let opened: number | undefined
    let reads = 0
    let swapped = false
    const swap = () => {
      fs.renameSync(selected, join(root, 'displaced.json'))
      if (mode === 'file-on-open') fs.copyFileSync(target, selected)
      else fs.symlinkSync(target, selected)
      swapped = true
    }
    t.mock.method(fs, 'openSync', (path: fs.PathLike, flags: fs.OpenMode, modeBits?: fs.Mode) => {
      if (String(path) === selected && (mode === 'symlink-on-open' || mode === 'file-on-open')) swap()
      // Model platforms where O_NOFOLLOW is absent, without weakening production flags.
      const fd = nativeOpen(path, typeof flags === 'number' ? flags & ~(fs.constants.O_NOFOLLOW ?? 0) : flags, modeBits)
      if (String(path) === selected) opened = fd
      return fd
    })
    t.mock.method(fs, 'readSync', (fd: number, buffer: NodeJS.ArrayBufferView, offset: number, length: number, position: fs.ReadPosition | null) => {
      const bytes = nativeRead(fd, buffer, offset, length, position)
      if (fd === opened) {
        reads++
        if (mode === 'symlink-on-read' && !swapped) swap()
      }
      return bytes
    })
    t.mock.method(fs, 'fstatSync', ((fd: number, options?: { bigint?: boolean }) => {
      const stat = nativeStat(fd, options as { bigint: true })
      if (fd === opened && mode === 'growth' && !swapped) {
        swapped = true
        fs.appendFileSync(selected, '5')
      }
      return stat
    }) as typeof fs.fstatSync)
    syncBuiltinESMExports()
    try {
      assert.throws(() => reader.read(selected, 4), /invalid|changed|symlink|size (?:limit|bound)|regular file/i)
      if (mode === 'symlink' || mode.endsWith('-on-open')) assert.equal(reads, 0, 'rejected custody must not read any file bytes')
      const closedDescriptor = opened
      if (closedDescriptor !== undefined) assert.throws(() => nativeStat(closedDescriptor), { code: 'EBADF' }, 'failed admission/revalidation closes its descriptor')
      assert.equal(fs.readFileSync(target, 'utf8'), '6789')
    } finally {
      t.mock.restoreAll()
      syncBuiltinESMExports()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
}
