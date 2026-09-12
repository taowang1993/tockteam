import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
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
