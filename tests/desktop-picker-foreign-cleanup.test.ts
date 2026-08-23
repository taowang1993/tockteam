import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DesktopPickerOwner } from '../src/desktop-picker-owner.ts'
import { computeDesktopDestinationPlanDigest, type NativeOperationIdentity } from '../src/host-contract.ts'

const temp = async (prefix: string) => await realpath(await mkdtemp(join(tmpdir(), prefix)))
const identity = (operationId: string, active = true): NativeOperationIdentity => ({ operationId, requestId: operationId, sessionId: 's', vaultGeneration: active ? 1 : 0, vaultId: active ? 'v' : null, windowId: 'w' })

async function activate(owner: DesktopPickerOwner): Promise<void> {
  const operation = identity('activate', false)
  const selected = await owner.pick({ identity: operation, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
  assert.equal(selected.status, 'selected')
  if (selected.status !== 'selected') return
  const consumed = await owner.consumeVaultSelection({ authorization: selected.authorization, identity: operation }, new AbortController().signal)
  assert.equal(consumed.status, 'consumed')
  if (consumed.status !== 'consumed') return
  assert.equal((await owner.bindVaultSelection({ claim: consumed.claim, operationId: operation.operationId, vaultGeneration: 1, vaultId: 'v' }, new AbortController().signal)).status, 'bound')
}

test('late destination occupant is preserved and the retained stage fd is scrubbed', async () => {
  const root = await temp('tockteam-foreign-cleanup-root-')
  const vault = await temp('tockteam-foreign-cleanup-vault-')
  const output = join(root, 'output.html')
  const secret = Buffer.from('reviewed confidential bytes')
  const foreign = Buffer.from('foreign-sentinel')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async () => ({ canceled: false, filePath: vault }),
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
    onCheckpoint: async checkpoint => {
      if (checkpoint === 'finalize') await writeFile(output, foreign)
    },
  })
  await activate(owner)
  const operation = identity('export')
  const selected = await owner.pick({ identity: operation, kind: 'destination', purpose: 'export-html' }, new AbortController().signal)
  assert.equal(selected.status, 'selected')
  if (selected.status !== 'selected') return
  const plan = { entries: [{ digest: createHash('sha256').update(secret).digest('hex') as never, size: secret.length, target: { kind: 'selected-file' as const } }] as const, purpose: 'export-html' as const, totalBytes: secret.length }
  const planDigest = computeDesktopDestinationPlanDigest(plan)
  const locked = await owner.lockDestinationPlan({ ...plan, identity: operation, planDigest, selectionAuthorization: selected.authorization }, new AbortController().signal)
  const begun = await owner.beginDestination({ ...plan, authorization: locked.authorization, identity: operation, planDigest }, new AbortController().signal)
  await owner.writeDestinationChunk({ bytes: secret, offset: 0, planDigest, session: begun.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  await assert.rejects(owner.finalizeDestination({ expectedState: begun.expectedState, planDigest, session: begun.session }, new AbortController().signal), (cause: unknown) => (cause as { code?: string }).code === 'exists')
  assert.deepEqual(await readFile(output), foreign)
  const stage = (await readdir(root)).find(name => name.startsWith('.tockteam-picker-stage-'))
  assert.ok(stage)
  assert.equal((await readFile(join(root, stage, 'selected-file'))).byteLength, 0)
  await owner.dispose()
})
