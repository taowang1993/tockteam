import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLauncherSettingsWriteQueue } from '../src/launcher-settings-write-queue.ts'

const FOLDERS_KEY = 'extension[SimpleFileSearch].folders'

test('folder writes await ownership reload and drop queued old-owner values', async () => {
  let ownership = 'external:active'
  let reloadCompleted = false
  let reloadStarted = false
  let releaseReload!: () => void
  const reloadGate = new Promise<void>(resolve => { releaseReload = resolve })
  const updates: unknown[] = []
  const reloadForUpdateCounts: number[] = []
  const pending = new Map<string, unknown>()
  const managedFolders = [{ id: 'root', path: '/managed', recursive: true, searchFor: 'filesAndFolders' }]
  const firstFolders = [{ id: 'root', path: '/external-first', recursive: true, searchFor: 'filesAndFolders' }]
  const queuedFolders = [{ id: 'root', path: '/external-queued', recursive: true, searchFor: 'filesAndFolders' }]
  let visibleFolders: unknown = managedFolders
  const queue = createLauncherSettingsWriteQueue({
    getOwnershipToken: () => ownership,
    updateSetting: async (_key, value) => {
      updates.push(value)
      if (updates.length === 1) {
        ownership = 'managed:revoked'
        throw new Error('external settings grant changed')
      }
    },
    reload: async () => {
      reloadStarted = true
      reloadForUpdateCounts.push(updates.length)
      await reloadGate
      reloadCompleted = true
      visibleFolders = pending.has(FOLDERS_KEY) ? pending.get(FOLDERS_KEY) : managedFolders
    },
    clearPendingValue: (key, value, onlyIfCurrent) => {
      if (!onlyIfCurrent || Object.is(pending.get(key), value)) pending.delete(key)
    },
  })
  pending.set(FOLDERS_KEY, firstFolders)
  const first = queue.enqueue(FOLDERS_KEY, firstFolders)
  pending.set(FOLDERS_KEY, queuedFolders)
  const second = queue.enqueue(FOLDERS_KEY, queuedFolders)
  const firstOutcome = first.then(
    () => 'resolved' as const,
    () => { assert.equal(reloadCompleted, true); return 'rejected' as const },
  )

  for (let attempt = 0; !reloadStarted && attempt < 20; attempt += 1) await Promise.resolve()
  assert.equal(reloadStarted, true)
  releaseReload()
  assert.equal(await firstOutcome, 'rejected')
  assert.equal(await second, false)
  assert.deepEqual(reloadForUpdateCounts, [1])
  assert.deepEqual(updates, [firstFolders])
  assert.deepEqual(visibleFolders, managedFolders)
  assert.equal(pending.has(FOLDERS_KEY), false)
})

test('same-owner queued folder writes remain valid', async () => {
  const updates: unknown[] = []
  const queue = createLauncherSettingsWriteQueue({
    getOwnershipToken: () => 'external:active',
    updateSetting: async (_key, value) => { updates.push(value) },
    reload: async () => undefined,
    clearPendingValue: () => undefined,
  })
  const firstFolders = [{ id: 'root', path: '/one', recursive: true, searchFor: 'filesAndFolders' }]
  const secondFolders = [{ id: 'root', path: '/two', recursive: true, searchFor: 'filesAndFolders' }]
  assert.equal(await queue.enqueue(FOLDERS_KEY, firstFolders), true)
  assert.equal(await queue.enqueue(FOLDERS_KEY, secondFolders), true)
  assert.deepEqual(updates, [firstFolders, secondFolders])
})
