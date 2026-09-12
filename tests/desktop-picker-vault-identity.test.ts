import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DesktopPickerOwner } from '../src/desktop-picker-owner.ts'

// Substitute filesystem IDs, not the real path checks or public grant transitions.
// Dialog callbacks select only the disposable fixture, without opening native UI.
test('Desktop vault claims preserve large file IDs and reject rounded-identity collisions', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-vault-identity-')))
  const vault = join(root, 'vault')
  await mkdir(vault)
  const dev = 9007199254740995n
  let ino = 9007199254740993n
  function metadata<T extends { dev: number | bigint; ino: number | bigint } | undefined>(stat: T, filePath: unknown): T {
    if (stat !== undefined && String(filePath) === vault) {
      stat.dev = typeof stat.dev === 'bigint' ? dev : Number(dev)
      stat.ino = typeof stat.ino === 'bigint' ? ino : Number(ino)
    }
    return stat
  }
  const originalLstat = fs.promises.lstat
  const originalLstatSync = fs.lstatSync
  t.mock.method(fs.promises, 'lstat', async (...args: Parameters<typeof originalLstat>) => metadata(await originalLstat(...args), args[0]))
  t.mock.method(fs, 'lstatSync', (...args: Parameters<typeof originalLstatSync>) => metadata(originalLstatSync(...args), args[0]))
  syncBuiltinESMExports()
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    recoveryRoot: join(root, 'recovery'),
    showOpenDialog: async () => ({ canceled: false, filePath: vault }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  const signal = new AbortController().signal
  const identity = { operationId: 'activate', requestId: 'request', sessionId: 'session', windowId: 'window', vaultGeneration: 0, vaultId: null }
  const vaultId = `vault:${'a'.repeat(64)}`
  try {
    const picked = await owner.pick({ identity, kind: 'vault', purpose: 'activate' }, signal)
    assert.equal(picked.status, 'selected')
    if (picked.status !== 'selected') return
    const consumed = await owner.consumeVaultSelection({ authorization: picked.authorization, identity }, signal)
    assert.equal(consumed.status, 'consumed')
    if (consumed.status !== 'consumed') return
    assert.deepEqual(consumed.identity, { dev: dev.toString(), ino: ino.toString() })

    const binding = { claim: consumed.claim, operationId: 'activate', vaultGeneration: 1, vaultId }
    // These distinct inode values collide if read as ordinary JS numbers.
    assert.equal(Number(ino), Number(ino - 1n))
    ino -= 1n
    assert.equal((await owner.bindVaultSelection(binding, signal)).status, 'stale')
    ino += 1n
    assert.equal((await owner.bindVaultSelection(binding, signal)).status, 'bound')

    const adopted = await owner.adoptVaultSelection({ canonicalPath: vault, operationId: 'adopt', vaultGeneration: 1, vaultId }, signal)
    assert.equal(adopted.status, 'bound')
    const activeIdentity = { ...identity, vaultGeneration: 1, vaultId }
    assert.equal(owner.matchesActiveIdentity(activeIdentity), true)
    ino -= 1n
    assert.equal(owner.matchesActiveIdentity(activeIdentity), false)
  } finally {
    try { await owner.dispose() } finally {
      t.mock.restoreAll()
      syncBuiltinESMExports()
      await rm(root, { recursive: true, force: true })
    }
  }
})
