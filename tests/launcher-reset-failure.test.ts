import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { LauncherPersistenceRepository } from '../src/launcher-persistence.ts'

test('a rejected reset preserves Recent history and recovery bytes across restart', { skip: process.platform === 'win32' }, async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'tockteam-reset-failure-'))
  const repository = await LauncherPersistenceRepository.open({ userDataPath, externalWriteAvailable: true })
  try {
    await repository.updateSetting('general.language', 'fr-FR')
    await repository.recordUsage('previous')
    await repository.recordUsage('previous')
    const ranking = repository.readRanking()
    const rankingPath = path.join(userDataPath, 'launcher', 'usage-ranking.json')
    const primary = await readFile(rankingPath)
    const backup = await readFile(`${rankingPath}.bak`)
    const externalPath = path.join(userDataPath, 'external.json')
    await writeFile(externalPath, JSON.stringify({ 'general.language': 'de-CH' }))
    await repository.grantExternalSettingsFile(externalPath)
    const edited = JSON.stringify({ 'general.language': 'zh-CN' })
    await writeFile(externalPath, edited)

    await assert.rejects(repository.resetSettings(), /changed or was revoked/u)
    assert.equal(await readFile(externalPath, 'utf8'), edited)
    assert.deepEqual(repository.readRanking(), ranking)
    assert.deepEqual(await readFile(rankingPath), primary)
    assert.deepEqual(await readFile(`${rankingPath}.bak`), backup)
    assert.equal(repository.getSetting('general.language', 'en-US'), 'fr-FR')
    await repository.close()

    const restarted = await LauncherPersistenceRepository.open({ userDataPath })
    try {
      assert.deepEqual(restarted.readRanking(), ranking)
      assert.equal(restarted.getSetting('general.language', 'en-US'), 'fr-FR')
      await restarted.resetSettings()
      assert.deepEqual(restarted.readRanking(), [])
      await assert.rejects(readFile(rankingPath), /ENOENT/u)
      await assert.rejects(readFile(`${rankingPath}.bak`), /ENOENT/u)
    } finally { await restarted.close() }
  } finally {
    await repository.close()
    await rm(userDataPath, { recursive: true, force: true })
  }
})

test('usage queued behind a rejected reset remains saved across restart', { skip: process.platform === 'win32' }, async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'tockteam-reset-queued-'))
  const repository = await LauncherPersistenceRepository.open({ userDataPath, externalWriteAvailable: true })
  try {
    await repository.recordUsage('previous')
    const externalPath = path.join(userDataPath, 'external.json')
    await writeFile(externalPath, JSON.stringify({ 'general.language': 'de-CH' }))
    await repository.grantExternalSettingsFile(externalPath)
    await writeFile(externalPath, JSON.stringify({ 'general.language': 'zh-CN' }))

    const reset = repository.resetSettings()
    const usage = repository.recordUsage('queued')
    await assert.rejects(reset, /changed or was revoked/u)
    await usage
    assert.deepEqual(repository.readRanking().map(entry => entry.id), ['previous', 'queued'])
    await repository.close()

    const restarted = await LauncherPersistenceRepository.open({ userDataPath })
    try {
      assert.deepEqual(restarted.readRanking().map(entry => entry.id), ['previous', 'queued'])
      await restarted.recordUsage('after-restart')
      assert.deepEqual(restarted.readRanking().map(entry => entry.id), ['after-restart', 'previous', 'queued'])
    } finally { await restarted.close() }
  } finally {
    await repository.close()
    await rm(userDataPath, { recursive: true, force: true })
  }
})

test('a failed managed settings publication leaves Recent history and its backup recoverable', async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'tockteam-reset-publication-'))
  const repository = await LauncherPersistenceRepository.open({ userDataPath })
  try {
    await repository.updateSetting('general.language', 'fr-FR')
    await repository.recordUsage('previous')
    await repository.recordUsage('previous')
    const ranking = repository.readRanking()
    const rankingPath = path.join(userDataPath, 'launcher', 'usage-ranking.json')
    const primary = await readFile(rankingPath)
    const backup = await readFile(`${rankingPath}.bak`)
    const settingsPath = path.join(userDataPath, 'launcher', 'settings.json')
    const retainedSettingsPath = path.join(userDataPath, 'retained-settings.json')
    const settings = await readFile(settingsPath)
    await rename(settingsPath, retainedSettingsPath)
    await mkdir(settingsPath)

    await assert.rejects(repository.resetSettings(), /EISDIR|EPERM|EACCES/u)
    assert.deepEqual(repository.readRanking(), ranking)
    assert.deepEqual(await readFile(rankingPath), primary)
    assert.deepEqual(await readFile(`${rankingPath}.bak`), backup)
    assert.deepEqual(await readFile(retainedSettingsPath), settings)
    assert.equal(repository.getSetting('general.language', 'en-US'), 'fr-FR')
    await rm(settingsPath, { recursive: true })
    await rename(retainedSettingsPath, settingsPath)
    await repository.close()

    const restarted = await LauncherPersistenceRepository.open({ userDataPath })
    try {
      assert.deepEqual(restarted.readRanking(), ranking)
      assert.equal(restarted.getSetting('general.language', 'en-US'), 'fr-FR')
    } finally { await restarted.close() }
  } finally {
    await repository.close()
    await rm(userDataPath, { recursive: true, force: true })
  }
})
