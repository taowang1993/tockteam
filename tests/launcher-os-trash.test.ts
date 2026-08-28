import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
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
