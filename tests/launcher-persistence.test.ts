import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { LauncherPersistenceRepository } from '../src/launcher-persistence.ts'

const codec = {
  isAvailable: () => true,
  encrypt: (value: string) => `cipher:${Buffer.from(value).toString('base64')}`,
  decrypt: (value: string) => Buffer.from(value.slice('cipher:'.length), 'base64').toString('utf8'),
}

async function root(): Promise<string> { return await mkdtemp(path.join(tmpdir(), 'tockteam-launcher-')) }

const item = {
  defaultAction: { argument: 'tockcoder', description: 'Open TockCoder', handlerKey: 'focus-tockcoder' },
  description: 'Coding workspace',
  id: 'route:tockcoder',
  imageUrl: 'data:image/png;base64,c2VjcmV0',
  name: 'TockCoder',
  sourceExtension: 'TockTeam',
}

test('persistence survives restart, encrypts secrets, strips index image data, and recovers backups', async () => {
  const userDataPath = await root()
  try {
    const repository = await LauncherPersistenceRepository.open({ secureStorageAvailable: true, secretCodec: codec, userDataPath })
    await Promise.all([
      repository.updateSetting('general.language', 'fr-FR'),
      repository.updateSetting('searchEngine.fuzziness', 0.7),
      repository.updateSetting('extension[DeeplTranslator].apiKey', 'secret-token'),
    ])
    await repository.writeIndex([item])
    await repository.appendLog('INFO', 'index ready')
    await repository.flush()
    const settingsText = await readFile(path.join(userDataPath, 'launcher', 'settings.json'), 'utf8')
    assert.equal(settingsText.includes('secret-token'), false)
    assert.equal(repository.getSetting('extension[DeeplTranslator].apiKey', ''), 'secret-token')
    assert.equal(repository.snapshot().missingSensitiveKeys.includes('extension[DeeplTranslator].apiKey'), false)
    assert.equal('imageUrl' in (repository.readIndex()[0] ?? {}), false)
    await repository.close()
    await assert.rejects(repository.updateSetting('general.language', 'de-CH'))

    const restarted = await LauncherPersistenceRepository.open({ secureStorageAvailable: true, secretCodec: codec, userDataPath })
    assert.equal(restarted.getSetting('general.language', 'en-US'), 'fr-FR')
    assert.equal(restarted.getSetting('searchEngine.fuzziness', 0), 0.7)
    await writeFile(path.join(userDataPath, 'launcher', 'settings.json'), '{bad', 'utf8')
    const recovered = await LauncherPersistenceRepository.open({ secureStorageAvailable: true, secretCodec: codec, userDataPath })
    assert.equal(recovered.snapshot().recoveredSettings, true)
    assert.equal(recovered.getSetting('general.language', 'en-US'), 'fr-FR')
    await recovered.close()
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('external settings accepts regular files, preserves replacement, and fails closed on unsupported writes', async () => {
  const userDataPath = await root()
  try {
    const external = path.join(userDataPath, 'settings.json')
    const link = path.join(userDataPath, 'link.json')
    await writeFile(external, JSON.stringify({ 'general.language': 'de-CH' }), { mode: 0o600 })
    await symlink(external, link)
    const repository = await LauncherPersistenceRepository.open({ secureStorageAvailable: true, secretCodec: codec, userDataPath, externalWriteAvailable: true })
    await assert.rejects(repository.grantExternalSettingsFile(link))
    await repository.grantExternalSettingsFile(external)
    assert.equal(repository.snapshot().settingsSource, 'external')
    await repository.updateSetting('general.language', 'fr-FR')
    assert.deepEqual(JSON.parse(await readFile(external, 'utf8')), { 'general.language': 'fr-FR' })
    const replacement = `${external}.replacement`
    await writeFile(replacement, JSON.stringify({ 'general.language': 'zh-CN' }), { mode: 0o600 })
    await rm(external); await rename(replacement, external)
    await assert.rejects(repository.updateSetting('general.language', 'ja-JP'))
    assert.equal(repository.snapshot().externalGrantStatus, 'revoked')
    assert.deepEqual(JSON.parse(await readFile(external, 'utf8')), { 'general.language': 'zh-CN' })
    await repository.revokeExternalSettingsFile()
    assert.equal(repository.snapshot().externalGrantStatus, 'none')
    await repository.close()

    const readonly = await LauncherPersistenceRepository.open({ secureStorageAvailable: true, secretCodec: codec, userDataPath: await root(), externalWriteAvailable: false })
    // The path is readable and grantable; a later mutation fails before opening it for write.
    await readonly.grantExternalSettingsFile(external)
    await assert.rejects(readonly.updateSetting('general.language', 'en-US'), /unavailable|platform/i)
    await readonly.close()
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('history records serialize and disabling history clears persisted queries', async () => {
  const userDataPath = await root()
  try {
    const repository = await LauncherPersistenceRepository.open({ userDataPath })
    await repository.updateSetting('general.searchHistory.enabled', true)
    await Promise.all([
      repository.recordSearch('alpha', { historyEnabled: false, historyLimit: 10 }),
      repository.recordSearch('beta', { historyEnabled: false, historyLimit: 10 }),
    ])
    assert.deepEqual(new Set(repository.getSetting('general.searchHistory.history', [])), new Set(['alpha', 'beta']))
    await repository.updateSetting('general.searchHistory.enabled', false)
    assert.deepEqual(repository.getSetting('general.searchHistory.history', ['stale']), [])
    await repository.recordSearch('ignored', { historyEnabled: true, historyLimit: 10 })
    assert.deepEqual(repository.getSetting('general.searchHistory.history', ['stale']), [])
    await repository.close()
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('logs recover independently when the primary contains renderer-unsafe text', async () => {
  const userDataPath = await root()
  try {
    const launcherRoot = path.join(userDataPath, 'launcher')
    await mkdir(launcherRoot, { recursive: true })
    await writeFile(path.join(launcherRoot, 'logs.json'), JSON.stringify(['bad\nlog']), 'utf8')
    await writeFile(path.join(launcherRoot, 'logs.json.bak'), JSON.stringify(['[2026-01-01T00:00:00.000Z][INFO] safe']), 'utf8')
    const repository = await LauncherPersistenceRepository.open({ userDataPath })
    assert.deepEqual(repository.snapshot().logs, ['[2026-01-01T00:00:00.000Z][INFO] safe'])
    assert.deepEqual(repository.snapshot().recoveredArtifacts, ['logs'])
    await repository.close()
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('artifact backups retain the last validated settings bytes', async () => {
  const userDataPath = await root()
  try {
    const repository = await LauncherPersistenceRepository.open({ userDataPath })
    await repository.updateSetting('general.language', 'fr-FR')
    await repository.updateSetting('general.language', 'de-CH')
    const settingsPath = path.join(userDataPath, 'launcher', 'settings.json')
    await writeFile(settingsPath, JSON.stringify({ 'appearance.searchBarPlaceholderText': 'x'.repeat(2 * 1024 * 1024) }), 'utf8')
    await repository.updateSetting('general.language', 'ja-JP')
    await repository.close()
    await writeFile(settingsPath, '{bad', 'utf8')
    const recovered = await LauncherPersistenceRepository.open({ userDataPath })
    assert.equal(recovered.getSetting('general.language', 'en-US'), 'fr-FR')
    await recovered.close()
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('index and external recovery retain only last validated artifacts', async () => {
  const userDataPath = await root()
  try {
    const repository = await LauncherPersistenceRepository.open({ userDataPath, externalWriteAvailable: true })
    await repository.writeIndex([{ ...item, id: 'first', name: 'First' }])
    await repository.writeIndex([{ ...item, id: 'second', name: 'Second' }])
    const indexPath = path.join(userDataPath, 'launcher', 'search-index.json')
    await writeFile(indexPath, JSON.stringify([{ ...item, defaultAction: { ...item.defaultAction, handlerKey: 'INVALID HANDLER' } }]), 'utf8')
    await repository.writeIndex([{ ...item, id: 'third', name: 'Third' }])

    const external = path.join(userDataPath, 'external.json')
    await writeFile(external, JSON.stringify({ 'general.language': 'de-CH' }), { mode: 0o600 })
    await repository.grantExternalSettingsFile(external)
    await repository.updateSetting('general.language', 'fr-FR')
    await repository.close()

    await writeFile(indexPath, '{bad', 'utf8')
    await writeFile(external, '{bad', 'utf8')
    const recovered = await LauncherPersistenceRepository.open({ userDataPath, externalWriteAvailable: true })
    assert.equal(recovered.readIndex()[0]?.id, 'first')
    assert.equal(recovered.getSetting('general.language', 'en-US'), 'fr-FR')
    assert.equal(recovered.snapshot().recoveredSettings, true)
    assert.deepEqual(recovered.snapshot().recoveredArtifacts, ['external', 'index'])
    assert.deepEqual(JSON.parse(await readFile(external, 'utf8')), { 'general.language': 'fr-FR' })
    await recovered.close()
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('secure storage failure is fail-closed and reset removes the envelope', async () => {
  const userDataPath = await root()
  try {
    const unavailable = await LauncherPersistenceRepository.open({ secureStorageAvailable: false, secretCodec: codec, userDataPath })
    await assert.rejects(unavailable.updateSetting('extension[DeeplTranslator].apiKey', 'secret'))
    assert.equal(unavailable.getSetting('extension[DeeplTranslator].apiKey', 'missing'), 'missing')
    await unavailable.resetSettings()
    await unavailable.close()
    const settings = await readFile(path.join(userDataPath, 'launcher', 'settings.json'), 'utf8')
    assert.equal(settings, '{}')
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})
