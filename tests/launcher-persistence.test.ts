import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { link as hardLink, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { LauncherPersistenceRepository } from '../src/launcher-persistence.ts'

const persistenceSource = readFileSync(path.join(import.meta.dirname, '..', 'src', 'launcher-persistence.ts'), 'utf8')

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

test('ranking persistence survives restart, recovers its validated backup, and resets independently', async () => {
  const userDataPath = await root()
  const now = 2_000_000
  try {
    const repository = await LauncherPersistenceRepository.open({ now: () => now, userDataPath })
    await repository.updateSetting('general.language', 'fr-FR')
    await repository.writeIndex([{ ...item, id: 'indexed' }])
    await repository.recordUsage('recent')
    await repository.recordUsage('recent')
    await repository.flush()
    assert.deepEqual(repository.readRanking().map(value => value.id), ['recent'])
    assert.equal(repository.readRanking()[0]?.useCount, 2)
    await repository.close()

    const rankingPath = path.join(userDataPath, 'launcher', 'usage-ranking.json')
    await writeFile(rankingPath, '{bad', 'utf8')
    const recovered = await LauncherPersistenceRepository.open({ now: () => now, userDataPath })
    assert.equal(recovered.readRanking()[0]?.useCount, 1)
    assert.equal(recovered.getSetting('general.language', 'en-US'), 'fr-FR')
    assert.equal(recovered.readIndex()[0]?.id, 'indexed')
    await recovered.resetSettings()
    assert.deepEqual(recovered.readRanking(), [])
    await assert.rejects(readFile(rankingPath), /ENOENT/u)
    await assert.rejects(readFile(`${rankingPath}.bak`), /ENOENT/u)
    await recovered.close()
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('invalid ranking persistence falls back to empty without damaging other launcher artifacts', async () => {
  const userDataPath = await root()
  try {
    const launcherRoot = path.join(userDataPath, 'launcher')
    await mkdir(launcherRoot, { recursive: true })
    await writeFile(path.join(launcherRoot, 'usage-ranking.json'), JSON.stringify([{ id: 'bad', score: 'not-a-number', lastUsedAt: 1, useCount: 1 }]), 'utf8')
    await writeFile(path.join(launcherRoot, 'usage-ranking.json.bak'), JSON.stringify([{ id: 'recovered', score: 1, lastUsedAt: 1, useCount: 1 }]), 'utf8')
    const repository = await LauncherPersistenceRepository.open({ now: () => 1_000, userDataPath })
    assert.deepEqual(repository.readRanking().map(value => value.id), ['recovered'])
    await repository.close()

    await writeFile(path.join(launcherRoot, 'usage-ranking.json'), 'x'.repeat(512 * 1024 + 1), 'utf8')
    const oversized = await LauncherPersistenceRepository.open({ now: () => 1_000, userDataPath })
    assert.deepEqual(oversized.readRanking().map(value => value.id), ['recovered'])
    await oversized.close()
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('persistence tolerates only unsupported Windows directory fsync after committing the file', () => {
  assert.match(persistenceSource, /process\.platform !== 'win32'[\s\S]+EPERM/u)
  assert.match(persistenceSource, /await handle\.sync\(\)/u)
})

test('managed persistence rejects a pre-existing launcher symlink', async () => {
  const userDataPath = await root()
  const redirected = await root()
  try {
    await symlink(redirected, path.join(userDataPath, 'launcher'))
    await assert.rejects(LauncherPersistenceRepository.open({ userDataPath }), /directory|symlink/u)
    assert.equal(await readFile(path.join(redirected, 'settings.json'), 'utf8').catch(() => undefined), undefined)
  } finally { await Promise.all([userDataPath, redirected].map(value => rm(value, { recursive: true, force: true }))) }
})

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

test('external settings accepts regular files, preserves replacement, and fails closed on unsupported writes', { skip: process.platform === 'win32' }, async () => {
  const userDataPath = await root()
  const readonlyUserDataPath = await root()
  try {
    const external = path.join(userDataPath, 'settings.json')
    const link = path.join(userDataPath, 'link.json')
    await writeFile(external, JSON.stringify({ 'general.language': 'de-CH' }), { mode: 0o600 })
    await symlink(external, link)
    const repository = await LauncherPersistenceRepository.open({ secureStorageAvailable: true, secretCodec: codec, userDataPath, externalWriteAvailable: true })
    await assert.rejects(repository.grantExternalSettingsFile(link))
    await repository.grantExternalSettingsFile(external)
    assert.equal(repository.snapshot().settingsSource, 'external')
    const originalIdentity = await lstat(external, { bigint: true })
    await repository.updateSetting('general.language', 'fr-FR')
    const replacedIdentity = await lstat(external, { bigint: true })
    assert.notEqual(`${replacedIdentity.dev}:${replacedIdentity.ino}`, `${originalIdentity.dev}:${originalIdentity.ino}`)
    assert.deepEqual(JSON.parse(await readFile(external, 'utf8')), { 'general.language': 'fr-FR' })
    await repository.updateSetting('general.language', 'de-CH')
    assert.deepEqual(JSON.parse(await readFile(external, 'utf8')), { 'general.language': 'de-CH' })
    const replacement = `${external}.replacement`
    await writeFile(replacement, JSON.stringify({ 'general.language': 'zh-CN' }), { mode: 0o600 })
    await rm(external); await rename(replacement, external)
    await assert.rejects(repository.updateSetting('general.language', 'ja-JP'))
    assert.equal(repository.snapshot().externalGrantStatus, 'revoked')
    assert.deepEqual(JSON.parse(await readFile(external, 'utf8')), { 'general.language': 'zh-CN' })
    await repository.revokeExternalSettingsFile()
    assert.equal(repository.snapshot().externalGrantStatus, 'none')
    await repository.close()

    const readonly = await LauncherPersistenceRepository.open({ secureStorageAvailable: true, secretCodec: codec, userDataPath: readonlyUserDataPath, externalWriteAvailable: false })
    // The path is readable and grantable; a later mutation fails before opening it for write.
    await readonly.grantExternalSettingsFile(external)
    await assert.rejects(readonly.updateSetting('general.language', 'en-US'), /unavailable|platform/i)
    await readonly.close()
  } finally { await Promise.all([userDataPath, readonlyUserDataPath].map(path => rm(path, { recursive: true, force: true }))) }
})

test('external settings cannot be exported over the active grant or a hard-link alias', { skip: process.platform === 'win32' }, async () => {
  const userDataPath = await root()
  try {
    const external = path.join(userDataPath, 'external.json')
    const alias = path.join(userDataPath, 'external-alias.json')
    await writeFile(external, JSON.stringify({ 'general.language': 'de-CH' }), { mode: 0o600 })
    await hardLink(external, alias)
    const repository = await LauncherPersistenceRepository.open({ externalWriteAvailable: true, secretCodec: codec, secureStorageAvailable: true, userDataPath })
    await repository.grantExternalSettingsFile(external)
    await assert.rejects(repository.exportSettingsToPath(external), /active external settings/u)
    await assert.rejects(repository.exportSettingsToPath(alias), /active external settings/u)
    assert.deepEqual(JSON.parse(await readFile(external, 'utf8')), { 'general.language': 'de-CH' })
    assert.equal(repository.snapshot().settingsSource, 'external')
    await repository.close()
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('same-inode external edits are preserved and revoke stale launcher state', { skip: process.platform === 'win32' }, async () => {
  const userDataPath = await root()
  try {
    const external = path.join(userDataPath, 'external.json')
    await writeFile(external, JSON.stringify({ 'general.language': 'de-CH' }), { mode: 0o600 })
    const repository = await LauncherPersistenceRepository.open({ externalWriteAvailable: true, secretCodec: codec, secureStorageAvailable: true, userDataPath })
    await repository.grantExternalSettingsFile(external)
    const identity = await lstat(external, { bigint: true })
    await writeFile(external, JSON.stringify({ 'general.language': 'zh-CN', 'searchEngine.fuzziness': 0.9 }), { mode: 0o600 })
    const editedIdentity = await lstat(external, { bigint: true })
    assert.equal(`${editedIdentity.dev}:${editedIdentity.ino}`, `${identity.dev}:${identity.ino}`)
    await assert.rejects(repository.updateSetting('general.language', 'fr-FR'), /changed or was revoked/u)
    assert.deepEqual(JSON.parse(await readFile(external, 'utf8')), { 'general.language': 'zh-CN', 'searchEngine.fuzziness': 0.9 })
    assert.equal(repository.snapshot().externalGrantStatus, 'revoked')
    await repository.close()
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('startup rejects an external grant whose canonical parent metadata changed', { skip: process.platform === 'win32' }, async () => {
  const userDataPath = await root()
  try {
    const external = path.join(userDataPath, 'external.json')
    await writeFile(external, JSON.stringify({ 'general.language': 'de-CH' }), { mode: 0o600 })
    const repository = await LauncherPersistenceRepository.open({ externalWriteAvailable: true, userDataPath })
    await repository.grantExternalSettingsFile(external)
    await repository.close()
    const grantPath = path.join(userDataPath, 'launcher', 'external-settings-grant.json')
    const grant = JSON.parse(await readFile(grantPath, 'utf8')) as Record<string, unknown>
    await writeFile(grantPath, JSON.stringify({ ...grant, parentRealPath: path.dirname(userDataPath) }), 'utf8')
    const restarted = await LauncherPersistenceRepository.open({ externalWriteAvailable: true, userDataPath })
    assert.equal(restarted.snapshot().externalGrantStatus, 'revoked')
    assert.equal(restarted.snapshot().settingsSource, 'managed')
    await restarted.close()
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('startup completes a journaled external settings replacement', async () => {
  const userDataPath = await root()
  const externalRoot = await root()
  const external = path.join(externalRoot, 'settings.json')
  try {
    await writeFile(external, JSON.stringify({ 'general.language': 'en-US' }))
    const repository = await LauncherPersistenceRepository.open({ userDataPath, externalWriteAvailable: true })
    await repository.grantExternalSettingsFile(external)
    await repository.close()
    const grantPath = path.join(userDataPath, 'launcher', 'external-settings-grant.json')
    const previous = JSON.parse(await readFile(grantPath, 'utf8')) as Record<string, unknown>
    const staged = path.join(externalRoot, '.replacement')
    await writeFile(staged, JSON.stringify({ 'general.language': 'zh-CN' }))
    await rename(staged, external)
    const identity = await lstat(external, { bigint: true })
    const next = { ...previous, dev: identity.dev.toString(), ino: identity.ino.toString() }
    const journalPath = path.join(userDataPath, 'launcher', 'external-settings-transaction.json')
    await writeFile(journalPath, JSON.stringify({ next, previous, version: 1 }))

    const reopened = await LauncherPersistenceRepository.open({ userDataPath, externalWriteAvailable: true })
    assert.equal(reopened.snapshot().settingsSource, 'external')
    assert.equal(reopened.getSetting('general.language', 'en-US'), 'zh-CN')
    assert.deepEqual(JSON.parse(await readFile(grantPath, 'utf8')), next)
    await assert.rejects(readFile(journalPath), /ENOENT/u)
    await reopened.close()
  } finally { await Promise.all([userDataPath, externalRoot].map(value => rm(value, { recursive: true, force: true }))) }
})

test('external folder grant drift falls back to managed folders before later writes', async () => {
  const userDataPath = await root()
  try {
    const external = path.join(userDataPath, 'external.json')
    const managedFolders = [{ id: 'root', path: '/managed/root', recursive: true, searchFor: 'filesAndFolders' as const }]
    const externalFolders = [{ id: 'root', path: '/external/root', recursive: true, searchFor: 'filesAndFolders' as const }]
    const repository = await LauncherPersistenceRepository.open({ externalWriteAvailable: true, secretCodec: codec, secureStorageAvailable: true, userDataPath })
    await repository.updateSetting('extension[SimpleFileSearch].folders', managedFolders)
    await writeFile(external, JSON.stringify({ 'extension[SimpleFileSearch].folders': externalFolders }), { mode: 0o600 })
    await repository.grantExternalSettingsFile(external)
    assert.deepEqual(repository.snapshot().values['extension[SimpleFileSearch].folders'], externalFolders)
    const replacement = `${external}.replacement`
    await writeFile(replacement, JSON.stringify({ 'extension[SimpleFileSearch].folders': externalFolders }), { mode: 0o600 })
    await rm(external)
    await rename(replacement, external)
    await assert.rejects(repository.updateSetting('general.language', 'fr-FR'), /changed or was revoked/u)
    assert.equal(repository.snapshot().settingsSource, 'managed')
    assert.equal(repository.snapshot().externalGrantStatus, 'revoked')
    assert.deepEqual(repository.snapshot().values['extension[SimpleFileSearch].folders'], managedFolders)
    await repository.updateSetting('general.language', 'zh-CN')
    assert.deepEqual(repository.snapshot().values['extension[SimpleFileSearch].folders'], managedFolders)
    await repository.close()
  } finally { await rm(userDataPath, { recursive: true, force: true }) }
})

test('history records serialize and disabled history rejects injected or imported queries', async () => {
  const userDataPath = await root()
  try {
    const repository = await LauncherPersistenceRepository.open({ userDataPath })
    await repository.updateSetting('general.searchHistory.history', ['injected before enable'])
    assert.deepEqual(repository.getSetting('general.searchHistory.history', ['stale']), [])
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

    const imported = path.join(userDataPath, 'history-import.json')
    await writeFile(imported, JSON.stringify({
      'general.searchHistory.enabled': false,
      'general.searchHistory.history': ['private imported query'],
    }), 'utf8')
    await repository.importSettingsFromPath(imported)
    assert.deepEqual(repository.snapshot().values['general.searchHistory.history'], [])
    await repository.close()

    const settingsPath = path.join(userDataPath, 'launcher', 'settings.json')
    await writeFile(settingsPath, JSON.stringify({
      'general.searchHistory.enabled': false,
      'general.searchHistory.history': ['private startup query'],
    }), 'utf8')
    const restarted = await LauncherPersistenceRepository.open({ userDataPath })
    assert.deepEqual(restarted.snapshot().values['general.searchHistory.history'], [])
    await restarted.close()
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

test('index and external recovery retain only last validated artifacts', { skip: process.platform === 'win32' }, async () => {
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
