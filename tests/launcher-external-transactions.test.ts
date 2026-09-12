import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { LauncherPersistenceRepository } from '../src/launcher-persistence.ts'

async function fixture() {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'tockteam-external-transaction-'))
  const external = path.join(root, 'external.json')
  await fs.writeFile(external, JSON.stringify({ 'general.language': 'en-US' }))
  const repository = await LauncherPersistenceRepository.open({ userDataPath: root, externalWriteAvailable: true })
  await repository.grantExternalSettingsFile(external)
  return { root, external, repository, grantPath: path.join(root, 'launcher/external-settings-grant.json'), journalPath: path.join(root, 'launcher/external-settings-transaction.json') }
}

async function interruptedReplacement(f: Awaited<ReturnType<typeof fixture>>) {
  const previous = JSON.parse(await fs.readFile(f.grantPath, 'utf8'))
  const replacement = path.join(f.root, 'replacement.json')
  await fs.writeFile(replacement, JSON.stringify({ 'general.language': 'zh-CN' }))
  await fs.rename(replacement, f.external)
  const stat = await fs.lstat(f.external, { bigint: true })
  const next = { ...previous, dev: String(stat.dev), ino: String(stat.ino) }
  await fs.writeFile(f.journalPath, JSON.stringify({ next, previous, version: 1 }))
}

for (const timing of ['journal', 'displacement', 'publication'] as const) test(`external saves preserve another app's edit during ${timing}`, { skip: process.platform === 'win32' }, async t => {
  const f = await fixture()
  const editor = path.join(f.root, 'editor.json')
  const destination = await fs.realpath(f.external)
  const rename = fs.rename
  const link = fs.link
  let injected = false
  try {
    await fs.writeFile(editor, JSON.stringify({ 'general.language': 'de-CH' }))
    if (timing !== 'publication') t.mock.method(fs, 'rename', async (from: Parameters<typeof rename>[0], to: Parameters<typeof rename>[1]) => {
      if (timing === 'displacement' && String(from) === destination && !injected) { injected = true; await rename(editor, f.external) }
      await rename(from, to)
      if (timing === 'journal' && String(to) === f.journalPath && !injected) { injected = true; await rename(editor, f.external) }
    })
    else t.mock.method(fs, 'link', async (from: Parameters<typeof link>[0], to: Parameters<typeof link>[1]) => {
      if (String(to) === destination && !injected) { injected = true; await rename(editor, f.external) }
      await link(from, to)
    })
    syncBuiltinESMExports()
    await assert.rejects(f.repository.updateSetting('general.language', 'fr-FR'), /changed|revoked/)
    assert.equal(injected, true)
    assert.deepEqual(JSON.parse(await fs.readFile(f.external, 'utf8')), { 'general.language': 'de-CH' })
    assert.equal(f.repository.snapshot().externalGrantStatus, 'revoked')
    if (timing === 'publication') {
      const directory = (await fs.readdir(f.root)).find(name => name.startsWith('.external.json.tockteam-'))
      assert.ok(directory, 'conflicting versions remain recoverable beside the shared file')
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.root, directory, 'previous.json'), 'utf8')), { 'general.language': 'en-US' })
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.root, directory, 'next.json'), 'utf8')), { 'general.language': 'fr-FR' })
    }
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports()
    await f.repository.close()
    await fs.rm(f.root, { recursive: true, force: true })
  }
})

test('an editor writing through the displaced file during commit keeps its recovery copy', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture()
  const handle = await fs.open(f.external, 'r+')
  const rename = fs.rename
  let edited = false
  let reopened: LauncherPersistenceRepository | undefined
  try {
    t.mock.method(fs, 'rename', async (from: Parameters<typeof rename>[0], to: Parameters<typeof rename>[1]) => {
      await rename(from, to)
      if (String(to) === f.grantPath && !edited) {
        edited = true
        await handle.truncate(0)
        await handle.writeFile(JSON.stringify({ 'general.language': 'de-CH' }))
      }
    })
    syncBuiltinESMExports()
    await assert.rejects(f.repository.updateSetting('general.language', 'fr-FR'), /changed|revoked/)
    t.mock.restoreAll(); syncBuiltinESMExports()
    await handle.close(); await f.repository.close()
    reopened = await LauncherPersistenceRepository.open({ userDataPath: f.root, externalWriteAvailable: true })
    assert.equal(reopened.snapshot().settingsSource, 'managed', 'recovery must not silently discard the changed displaced file')
    const directory = (await fs.readdir(f.root)).find(name => name.startsWith('.external.json.tockteam-'))
    assert.ok(directory)
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.root, directory, 'previous.json'), 'utf8')), { 'general.language': 'de-CH' })
    assert.deepEqual(JSON.parse(await fs.readFile(f.external, 'utf8')), { 'general.language': 'fr-FR' })
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports()
    await handle.close(); await f.repository.close(); await reopened?.close()
    await fs.rm(f.root, { recursive: true, force: true })
  }
})

for (const published of [false, true]) test(`startup recovers an external save ${published ? 'after publication' : 'during the missing-path interval'}`, { skip: process.platform === 'win32' }, async () => {
  const f = await fixture()
  let reopened: LauncherPersistenceRepository | undefined
  try {
    const previous = JSON.parse(await fs.readFile(f.grantPath, 'utf8'))
    const directory = await fs.mkdtemp(path.join(path.dirname(previous.path), '.external.json.tockteam-'))
    const nextFile = path.join(directory, 'next.json')
    await fs.writeFile(nextFile, JSON.stringify({ 'general.language': 'fr-FR' }))
    const identity = await fs.lstat(nextFile, { bigint: true })
    const next = { ...previous, dev: String(identity.dev), ino: String(identity.ino) }
    const previousSha256 = createHash('sha256').update(await fs.readFile(f.external)).digest('hex')
    await fs.writeFile(f.journalPath, JSON.stringify({ next, previous, directory, previousSha256, version: 2 }))
    await fs.rename(f.external, path.join(directory, 'previous.json'))
    if (published) await fs.link(nextFile, f.external)
    await f.repository.close()
    reopened = await LauncherPersistenceRepository.open({ userDataPath: f.root, externalWriteAvailable: true })
    assert.equal(reopened.snapshot().settingsSource, 'external')
    assert.equal(reopened.getSetting('general.language', ''), published ? 'fr-FR' : 'en-US')
    assert.deepEqual(JSON.parse(await fs.readFile(f.external, 'utf8')), { 'general.language': published ? 'fr-FR' : 'en-US' })
    await assert.rejects(fs.lstat(directory), { code: 'ENOENT' })
    await assert.rejects(fs.lstat(f.journalPath), { code: 'ENOENT' })
  } finally { await f.repository.close(); await reopened?.close(); await fs.rm(f.root, { recursive: true, force: true }) }
})

test('recovery cannot revive a grant removed before its journal was retired', { skip: process.platform === 'win32' }, async () => {
  const f = await fixture()
  let reopened: LauncherPersistenceRepository | undefined
  try {
    await interruptedReplacement(f)
    await f.repository.close()
    await fs.rm(f.grantPath)
    reopened = await LauncherPersistenceRepository.open({ userDataPath: f.root, externalWriteAvailable: true })
    assert.equal(reopened.snapshot().settingsSource, 'managed')
    await assert.rejects(fs.lstat(f.grantPath), { code: 'ENOENT' })
    assert.deepEqual(JSON.parse(await fs.readFile(f.external, 'utf8')), { 'general.language': 'zh-CN' })
  } finally { await f.repository.close(); await reopened?.close(); await fs.rm(f.root, { recursive: true, force: true }) }
})

test('recovery rejects a journal pointing outside the external file directory', { skip: process.platform === 'win32' }, async () => {
  const f = await fixture()
  let reopened: LauncherPersistenceRepository | undefined
  try {
    const previous = JSON.parse(await fs.readFile(f.grantPath, 'utf8'))
    const protectedDirectory = path.join(f.root, 'unrelated')
    await fs.mkdir(protectedDirectory)
    const sentinel = path.join(protectedDirectory, 'previous.json')
    await fs.writeFile(sentinel, 'preserve')
    const previousSha256 = createHash('sha256').update(await fs.readFile(f.external)).digest('hex')
    await fs.writeFile(f.journalPath, JSON.stringify({ next: previous, previous, directory: protectedDirectory, previousSha256, version: 2 }))
    await f.repository.close()
    reopened = await LauncherPersistenceRepository.open({ userDataPath: f.root, externalWriteAvailable: true })
    assert.equal(await fs.readFile(sentinel, 'utf8'), 'preserve')
    assert.equal(reopened.getSetting('general.language', ''), 'en-US')
  } finally { await f.repository.close(); await reopened?.close(); await fs.rm(f.root, { recursive: true, force: true }) }
})

test('successful external saves retain a bounded recovery set', { skip: process.platform === 'win32' }, async () => {
  const f = await fixture()
  try {
    for (let index = 0; index < 8; index++) await f.repository.updateSetting('general.language', index % 2 ? 'en-US' : 'fr-FR')
    assert.ok((await fs.readdir(path.join(f.root, 'launcher/external-backups'))).length <= 2)
    assert.equal((await fs.readdir(f.root)).some(name => name.startsWith('.external.json.tockteam-')), false)
  } finally { await f.repository.close(); await fs.rm(f.root, { recursive: true, force: true }) }
})

test('revocation or a new selection retires an interrupted external grant', { skip: process.platform === 'win32' }, async () => {
  for (const replaceGrant of [false, true]) {
    const f = await fixture()
    let reopened: LauncherPersistenceRepository | undefined
    try {
      await interruptedReplacement(f)
      if (replaceGrant) {
        const other = path.join(f.root, 'other.json')
        await fs.writeFile(other, JSON.stringify({ 'general.language': 'fr-FR' }))
        await f.repository.grantExternalSettingsFile(other)
      } else await f.repository.revokeExternalSettingsFile()
      await f.repository.close()
      reopened = await LauncherPersistenceRepository.open({ userDataPath: f.root, externalWriteAvailable: true })
      assert.equal(reopened.snapshot().settingsSource, replaceGrant ? 'external' : 'managed')
      assert.equal(reopened.getSetting('general.language', 'en-US'), replaceGrant ? 'fr-FR' : 'en-US')
      assert.deepEqual(JSON.parse(await fs.readFile(f.external, 'utf8')), { 'general.language': 'zh-CN' })
      await assert.rejects(fs.readFile(f.journalPath), { code: 'ENOENT' })
    } finally {
      await f.repository.close()
      await reopened?.close()
      await fs.rm(f.root, { recursive: true, force: true })
    }
  }
})
