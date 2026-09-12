import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadTrustedRaycastCanIUsePreferences, saveTrustedRaycastCanIUsePreferences } from '../src/trusted-raycast-can-i-use-preference-store.ts'

const values = { defaultQuery: 'chrome 100', showReleaseDate: true, showPartialSupport: false, briefMode: false, path: '', environment: 'production' }
const options = { canonicalTargets: ['chrome 100'] }

test('Can I Use preferences require exact targets and preserve unreadable or invalid user files', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'can-i-use-preferences-'))
  const file = join(directory, 'preferences.json')
  try {
    assert.deepEqual(loadTrustedRaycastCanIUsePreferences(file), {})
    writeFileSync(file, 'user-owned invalid JSON')
    assert.deepEqual(loadTrustedRaycastCanIUsePreferences(file), {})
    assert.equal(readFileSync(file, 'utf8'), 'user-owned invalid JSON')
    for (const bad of [{ ...values, defaultQuery: 'defaults' }, { ...values, defaultQuery: 'chrome 9999' }, { ...values, path: '.' }, { ...values, extra: true }]) {
      await assert.rejects(saveTrustedRaycastCanIUsePreferences(file, bad, options))
      assert.equal(readFileSync(file, 'utf8'), 'user-owned invalid JSON')
    }
    await saveTrustedRaycastCanIUsePreferences(file, values, options)
    assert.deepEqual(loadTrustedRaycastCanIUsePreferences(file), values)
    // Windows permissions come from inherited ACLs, not POSIX mode bits.
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600)
    assert.ok(Object.isFrozen(loadTrustedRaycastCanIUsePreferences(file)))
    const link = join(directory, 'link.json'); symlinkSync(file, link)
    assert.deepEqual(loadTrustedRaycastCanIUsePreferences(link), {})
    await assert.rejects(saveTrustedRaycastCanIUsePreferences(link, values, options))
    assert.deepEqual(loadTrustedRaycastCanIUsePreferences(file), values)
    assert.deepEqual(loadTrustedRaycastCanIUsePreferences(directory), {})
    await assert.rejects(saveTrustedRaycastCanIUsePreferences(directory, values, options))
    writeFileSync(file, ' '.repeat(16385))
    assert.deepEqual(loadTrustedRaycastCanIUsePreferences(file), {})
    assert.equal(statSync(file).size, 16385)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
