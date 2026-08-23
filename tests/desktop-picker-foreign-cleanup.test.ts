import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { DesktopPickerOwner } from '../src/desktop-picker-owner.ts'
import { computeDesktopDestinationPlanDigest, type NativeOperationIdentity } from '../src/host-contract.ts'

const temp = async (prefix: string): Promise<string> => await realpath(await mkdtemp(join(tmpdir(), prefix)))
const identity = (operationId: string, active = true): NativeOperationIdentity => ({ operationId, requestId: `r-${operationId}`, sessionId: 's', vaultGeneration: active ? 1 : 0, vaultId: active ? 'v' : null, windowId: 'w' })

async function activate(owner: DesktopPickerOwner): Promise<void> {
  const operation = identity('activate', false)
  const picked = await owner.pick({ identity: operation, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
  assert.equal(picked.status, 'selected')
  if (picked.status !== 'selected') return
  const consumed = await owner.consumeVaultSelection({ authorization: picked.authorization, identity: operation }, new AbortController().signal)
  assert.equal(consumed.status, 'consumed')
  if (consumed.status !== 'consumed') return
  assert.equal((await owner.bindVaultSelection({ claim: consumed.claim, operationId: operation.operationId, vaultGeneration: 1, vaultId: 'v' }, new AbortController().signal)).status, 'bound')
}

test('foreign snapshot replacement preserves cleanup ownership and removes its journal', async () => {
  const root = await temp('tockteam-foreign-cleanup-root-')
  const vault = await temp('tockteam-foreign-cleanup-vault-')
  const recoveryRoot = await temp('tockteam-foreign-cleanup-recovery-')
  const output = join(root, 'output.html')
  const oldSecret = Buffer.from('old confidential destination bytes')
  const replacement = Buffer.from('reviewed replacement bytes')
  await writeFile(output, oldSecret)
  const owner = new DesktopPickerOwner({ isAvailable: () => true, recoveryRoot, showOpenDialog: async () => ({ canceled: false, filePath: vault }), showSaveDialog: async () => ({ canceled: false, filePath: output }) })
  await activate(owner)
  const operation = identity('export')
  const picked = await owner.pick({ identity: operation, kind: 'destination', purpose: 'export-html' }, new AbortController().signal)
  assert.equal(picked.status, 'selected')
  if (picked.status !== 'selected') return
  const plan = { entries: [{ digest: createHash('sha256').update(replacement).digest('hex') as never, size: replacement.length, target: { kind: 'selected-file' as const } }] as const, purpose: 'export-html' as const, totalBytes: replacement.length }
  const planDigest = computeDesktopDestinationPlanDigest(plan)
  const locked = await owner.lockDestinationPlan({ ...plan, identity: operation, planDigest, selectionAuthorization: picked.authorization }, new AbortController().signal)
  type InternalPlan = { journalPath: string; snapshot: { path: string } }
  const plans = (owner as unknown as { destinationPlans: Map<string, InternalPlan> }).destinationPlans
  const retained = plans.get(locked.authorization)
  assert.ok(retained)
  const movedRoot = `${root}-moved`
  await rename(root, movedRoot)
  await mkdir(root)
  await writeFile(retained.snapshot.path, 'foreign-sentinel')
  await assert.rejects(owner.beginDestination({ ...plan, authorization: locked.authorization, identity: operation, planDigest }, new AbortController().signal), (cause: unknown) => (cause as { code?: string }).code === 'recovery-required')
  assert.equal(plans.has(locked.authorization), true)
  assert.equal(await readFile(retained.snapshot.path, 'utf8'), 'foreign-sentinel')
  const movedSnapshot = join(movedRoot, retained.snapshot.path.slice(dirname(retained.snapshot.path).length + 1))
  assert.equal((await readFile(movedSnapshot)).byteLength, 0)
  await assert.rejects(readFile(retained.journalPath))
  await assert.rejects(owner.revokeDestinationPlan({ authorization: locked.authorization }), (cause: unknown) => (cause as { code?: string }).code === 'recovery-required')
  await assert.rejects(owner.dispose(), /cleanup|recovery/i)
})
