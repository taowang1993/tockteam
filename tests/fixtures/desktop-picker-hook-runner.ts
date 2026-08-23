import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { DesktopPickerOwner } from '../../src/desktop-picker-owner.ts'
import { computeDesktopDestinationPlanDigest } from '../../src/host-contract.ts'

const [mode, destinationPath, recoveryRoot, activeVault, resultPath] = process.argv.slice(2) as [string, string, string, string, string]
const owner = new DesktopPickerOwner({
  isAvailable: () => true,
  recoveryRoot,
  showOpenDialog: async () => ({ canceled: false, filePath: activeVault }),
  showSaveDialog: async () => ({ canceled: false, filePath: destinationPath }),
})
await owner.ready()
if (mode === 'startup-stage-swap') {
  await writeFile(resultPath, JSON.stringify({ ready: true }))
  await owner.dispose().catch(() => undefined)
  process.exit(0)
}
const inactive = { operationId: 'activate', requestId: 'activate', sessionId: 's', vaultGeneration: 0, vaultId: null, windowId: 'w' }
const selectedVault = await owner.pick({ identity: inactive, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
if (selectedVault.status !== 'selected') throw new Error('vault selection failed')
const consumed = await owner.consumeVaultSelection({ authorization: selectedVault.authorization, identity: inactive }, new AbortController().signal)
if (consumed.status !== 'consumed') throw new Error('vault consume failed')
await owner.bindVaultSelection({ claim: consumed.claim, operationId: inactive.operationId, vaultGeneration: 1, vaultId: 'v' }, new AbortController().signal)
const identity = { ...inactive, operationId: 'export', requestId: 'export', vaultGeneration: 1, vaultId: 'v' }
const selected = await owner.pick({ identity, kind: 'destination', purpose: 'export-html' }, new AbortController().signal)
if (selected.status !== 'selected') throw new Error(`destination selection ${selected.status}`)
const bytes = Buffer.from('reviewed-output')
const plan = { entries: [{ digest: createHash('sha256').update(bytes).digest('hex') as never, size: bytes.length, target: { kind: 'selected-file' as const } }] as const, purpose: 'export-html' as const, totalBytes: bytes.length }
const planDigest = computeDesktopDestinationPlanDigest(plan)
let locked
try {
  locked = await owner.lockDestinationPlan({ ...plan, identity, planDigest, selectionAuthorization: selected.authorization }, new AbortController().signal)
} catch (cause) {
  if (mode !== 'startup-journal-open-swap' && mode !== 'startup-resolved-stage-open-swap' && mode !== 'startup-residue-ancestor-swap' && mode !== 'startup-recovery-root-opendir-swap' && mode !== 'startup-journal-growth' && mode !== 'startup-journal-same-size' && mode !== 'startup-journal-shrink') throw cause
  await writeFile(resultPath, JSON.stringify({ outcome: `error:${String((cause as { code?: string }).code ?? 'unknown')}` }))
  await owner.dispose().catch(() => undefined)
  process.exit(0)
}
const begun = await owner.beginDestination({ ...plan, authorization: locked.authorization, identity, planDigest }, new AbortController().signal)
await owner.writeDestinationChunk({ bytes, offset: 0, planDigest, session: begun.session, target: { kind: 'selected-file' } }, new AbortController().signal)
let outcome: string
try {
  const result = await owner.finalizeDestination({ expectedState: begun.expectedState, planDigest, session: begun.session }, new AbortController().signal)
  outcome = result.status === 'published' ? `published:${result.cleanup.status}` : result.status
} catch (cause) {
  outcome = `error:${String((cause as { code?: string }).code ?? 'unknown')}`
}
await writeFile(resultPath, JSON.stringify({ outcome }))
await owner.dispose().catch(() => undefined)
