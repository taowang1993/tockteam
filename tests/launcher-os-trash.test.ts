import assert from 'node:assert/strict'
import { mkdtemp, mkdir, link, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { emptyLauncherLinuxTrash } from '../src/launcher-os-process.ts'

test('Linux trash deletion is bounded, home-derived, and no-follow', { skip: process.platform !== 'linux' }, async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-trash-')))
  const trash = join(home, '.local', 'share', 'Trash')
  await mkdir(join(trash, 'files'), { recursive: true })
  await mkdir(join(trash, 'info'), { recursive: true })
  await writeFile(join(trash, 'files', 'remove-me'), 'x')
  await writeFile(join(trash, 'info', 'remove-me.trashinfo'), 'x')
  await emptyLauncherLinuxTrash(home)
  await assert.rejects(readFile(join(trash, 'files', 'remove-me')))
  await assert.rejects(readFile(join(trash, 'info', 'remove-me.trashinfo')))
  await rm(home, { recursive: true, force: true })
})

test('Linux trash deletion skips symlinked queued directories and preserves outside entries', { skip: process.platform !== 'linux' }, async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-trash-queued-link-')))
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-trash-queued-outside-')))
  const trash = join(home, '.local', 'share', 'Trash')
  await mkdir(join(trash, 'files'), { recursive: true })
  await mkdir(join(trash, 'info'), { recursive: true })
  await writeFile(join(outside, 'kept'), 'x')
  await symlink(outside, join(trash, 'files', 'queued'))
  await emptyLauncherLinuxTrash(home)
  assert.equal(await readFile(join(outside, 'kept'), 'utf8'), 'x')
  assert.deepEqual(await readdir(join(trash, 'files')), ['queued'])
  await rm(home, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

test('Linux trash deletion unlinks only the in-trash hardlink and skips special-looking links', { skip: process.platform !== 'linux' }, async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-trash-hardlink-')))
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-trash-hardlink-outside-')))
  const trash = join(home, '.local', 'share', 'Trash')
  await mkdir(join(trash, 'files'), { recursive: true })
  await mkdir(join(trash, 'info'), { recursive: true })
  await writeFile(join(outside, 'kept'), 'x')
  await link(join(outside, 'kept'), join(trash, 'files', 'hardlink'))
  await symlink(join(outside, 'kept'), join(trash, 'files', 'symlink'))
  await emptyLauncherLinuxTrash(home)
  assert.equal(await readFile(join(outside, 'kept'), 'utf8'), 'x')
  await assert.rejects(readFile(join(trash, 'files', 'hardlink')))
  assert.deepEqual(await readdir(join(trash, 'files')), ['symlink'])
  await rm(home, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

test('Linux trash deletion observes cancellation and does not leak descriptors', { skip: process.platform !== 'linux' }, async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-trash-cancel-')))
  const trash = join(home, '.local', 'share', 'Trash')
  await mkdir(join(trash, 'files'), { recursive: true })
  await mkdir(join(trash, 'info'), { recursive: true })
  await writeFile(join(trash, 'files', 'kept'), 'x')
  const signalController = new AbortController()
  signalController.abort(new Error('test canceled'))
  const before = (await readdir('/proc/self/fd')).length
  await assert.rejects(emptyLauncherLinuxTrash(home, signalController.signal), /canceled/i)
  const after = (await readdir('/proc/self/fd')).length
  assert.equal(after, before)
  assert.equal(await readFile(join(trash, 'files', 'kept'), 'utf8'), 'x')
  await rm(home, { recursive: true, force: true })
})

test('Linux trash deletion rejects a symlinked fixed directory', { skip: process.platform !== 'linux' }, async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-trash-link-')))
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-trash-outside-')))
  await mkdir(join(home, '.local', 'share'), { recursive: true })
  await symlink(outside, join(home, '.local', 'share', 'Trash'))
  await emptyLauncherLinuxTrash(home)
  await writeFile(join(outside, 'kept'), 'x')
  assert.equal(await readFile(join(outside, 'kept'), 'utf8'), 'x')
  await rm(home, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

test('Linux Trash capability stays fail-closed when an open root is moved outside', { skip: process.platform !== 'linux' }, async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-trash-moved-')))
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-trash-moved-outside-')))
  const trash = join(home, '.local', 'share', 'Trash')
  const files = join(trash, 'files')
  await mkdir(files, { recursive: true })
  await mkdir(join(trash, 'info'), { recursive: true })
  await writeFile(join(files, 'kept'), 'x')
  const moved = join(outside, 'files')
  await rename(files, moved)
  await mkdir(files)
  await emptyLauncherLinuxTrash(home)
  assert.equal(await readFile(join(moved, 'kept'), 'utf8'), 'x')
  await rm(home, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})
