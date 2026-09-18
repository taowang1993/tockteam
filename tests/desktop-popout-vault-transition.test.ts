import assert from 'node:assert/strict'
import { mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DesktopPickerOwner } from '../src/desktop-picker-owner.ts'
import { DesktopPopOutOwner } from '../src/desktop-popout-owner.ts'
import type { NativeOperationIdentity } from '../src/host-contract.ts'

function identity(operationId: string, vaultId: string | null, vaultGeneration: number): NativeOperationIdentity {
  return { operationId, requestId: `r-${operationId}`, sessionId: 'session', vaultGeneration, vaultId, windowId: 'main' }
}

test('binding a new vault immediately closes old-vault pop-outs', async () => {
  const vaultA = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-popout-vault-a-')))
  const vaultB = await realpath(await mkdtemp(join(tmpdir(), 'tockteam-popout-vault-b-')))
  const selections = [vaultA, vaultB]
  const windows = new Set<string>()
  const popOut = new DesktopPopOutOwner({
    isAvailable: () => true,
    isCurrent: () => true,
    native: {
      close: windowId => { windows.delete(windowId) },
      focus: () => true,
      isOpen: windowId => windows.has(windowId),
      open: async () => { windows.add('old-vault-window'); return 'old-vault-window' },
    },
  })
  const picker = new DesktopPickerOwner({
    isAvailable: () => true,
    onVaultTransition: () => { popOut.disposeProvider() },
    showOpenDialog: async () => ({ canceled: false, filePath: selections.shift() as string }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  const bind = async (operationId: string, generation: number, vaultId: string): Promise<void> => {
    const operation = identity(operationId, null, 0)
    const selected = await picker.pick({ identity: operation, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
    assert.equal(selected.status, 'selected')
    if (selected.status !== 'selected') return
    const consumed = await picker.consumeVaultSelection({ authorization: selected.authorization, identity: operation }, new AbortController().signal)
    assert.equal(consumed.status, 'consumed')
    if (consumed.status !== 'consumed') return
    assert.equal((await picker.bindVaultSelection({ claim: consumed.claim, operationId, vaultGeneration: generation, vaultId }, new AbortController().signal)).status, 'bound')
  }
  await bind('activate-a', 1, 'vault-a')
  assert.equal((await popOut.open({ identity: identity('open', 'vault-a', 1), relativePath: 'same.md' }, new AbortController().signal)).status, 'opened')
  assert.deepEqual([...windows], ['old-vault-window'])
  await bind('activate-b', 2, 'vault-b')
  assert.deepEqual([...windows], [])
  await picker.dispose()
  popOut.dispose()
})
