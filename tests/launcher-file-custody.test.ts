import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import promises, { open } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensurePrivateDirectory, LauncherPersistenceRepository } from '../src/launcher-persistence.ts'
import { MAX_LAUNCHER_SETTINGS_BYTES } from '../src/launcher-settings-contract.ts'
import { readBoundedRegularFile } from '../src/trusted-raycast-bounded-file.ts'
import { readTrustedRaycastFile } from '../src/trusted-raycast-artifact-admission.ts'

for (const mode of ['replacement', 'growth'] as const) test(`settings imports keep file reads bounded and identity-bound during ${mode}`, async t => {
  const root = fs.mkdtempSync(join(tmpdir(), 'launcher-settings-read-'))
  const selected = join(root, 'selected.json')
  const repository = await LauncherPersistenceRepository.open({ userDataPath: root })
  fs.writeFileSync(selected, '{}')
  const nativeOpen = promises.open
  let bytesRead = 0
  let opened: number | undefined
  t.mock.method(promises, 'open', async (...args: Parameters<typeof nativeOpen>) => {
    if (String(args[0]) === selected && mode === 'replacement') {
      fs.renameSync(selected, join(root, 'original.json'))
      fs.writeFileSync(selected, '{"general.language":"zh-CN"}')
    }
    const handle = await nativeOpen(...args)
    if (String(args[0]) !== selected) return handle
    opened = handle.fd
    const nativeStat = handle.stat.bind(handle)
    t.mock.method(handle, 'stat', async (...statArgs: Parameters<typeof handle.stat>) => {
      const stat = await nativeStat(...statArgs)
      if (mode === 'growth') fs.appendFileSync(selected, ' '.repeat(MAX_LAUNCHER_SETTINGS_BYTES * 2))
      return stat
    })
    const nativeReadFile = handle.readFile.bind(handle)
    t.mock.method(handle, 'readFile', async (...readArgs: Parameters<typeof handle.readFile>) => {
      const result = await nativeReadFile(...readArgs)
      bytesRead += Buffer.byteLength(result)
      return result
    })
    const nativeRead = handle.read
    t.mock.method(handle, 'read', async (...readArgs: any[]) => {
      const result = await Reflect.apply(nativeRead, handle, readArgs)
      bytesRead += result.bytesRead
      return result
    })
    return handle
  })
  syncBuiltinESMExports()
  try {
    await assert.rejects(repository.importSettingsFromPath(selected), /changed|large|limit/)
    assert.ok(bytesRead <= (mode === 'replacement' ? 0 : MAX_LAUNCHER_SETTINGS_BYTES + 1), `read ${bytesRead} bytes before rejection`)
    assert.deepEqual(repository.snapshot().values, {})
    assert.notEqual(opened, undefined)
    assert.throws(() => fs.fstatSync(opened!), { code: 'EBADF' })
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports()
    await repository.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('settings imports accept the exact byte limit across short reads', async t => {
  const root = fs.mkdtempSync(join(tmpdir(), 'launcher-settings-limit-'))
  const selected = join(root, 'selected.json')
  const repository = await LauncherPersistenceRepository.open({ userDataPath: root })
  const contents = '{"general.language":"zh-CN"}'
  fs.writeFileSync(selected, contents.padEnd(MAX_LAUNCHER_SETTINGS_BYTES, ' '))
  const nativeOpen = promises.open
  t.mock.method(promises, 'open', async (...args: Parameters<typeof nativeOpen>) => {
    const handle = await nativeOpen(...args)
    if (String(args[0]) === selected) {
      const nativeRead = handle.read.bind(handle)
      t.mock.method(handle, 'read', async (buffer: Buffer, offset: number, length: number, position: number) =>
        await nativeRead(buffer, offset, Math.min(length, 1024), position))
    }
    return handle
  })
  syncBuiltinESMExports()
  try {
    await repository.importSettingsFromPath(selected)
    assert.equal(repository.getSetting('general.language', ''), 'zh-CN')
    fs.appendFileSync(selected, ' ')
    await assert.rejects(repository.importSettingsFromPath(selected), /bounded regular file/)
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports()
    await repository.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

for (const operation of ['importSettingsFromPath', 'grantExternalSettingsFile'] as const) test(`${operation} rejects a FIFO swapped in during open without blocking`, { skip: process.platform === 'win32' }, async t => {
  const root = fs.mkdtempSync(join(tmpdir(), 'launcher-settings-fifo-'))
  const selected = join(root, 'selected.json')
  const repository = await LauncherPersistenceRepository.open({ userDataPath: root })
  fs.writeFileSync(selected, '{}')
  const nativeOpen = promises.open
  let nonblocking = false
  t.mock.method(promises, 'open', async (...args: Parameters<typeof nativeOpen>) => {
    if (String(args[0]) === selected) {
      fs.renameSync(selected, join(root, 'original.json'))
      execFileSync('/usr/bin/mkfifo', [selected])
      nonblocking = typeof args[1] === 'number' && (args[1] & fs.constants.O_NONBLOCK) !== 0
      // Keep the regression safe even if production loses its nonblocking flag.
      args[1] = Number(args[1]) | fs.constants.O_NONBLOCK
    }
    return await nativeOpen(...args)
  })
  syncBuiltinESMExports()
  try {
    await assert.rejects(repository[operation](selected), /regular file|changed/)
    assert.equal(nonblocking, true)
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports()
    await repository.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

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
