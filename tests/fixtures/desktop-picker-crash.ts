import { readFile, writeFile } from 'node:fs/promises'
import { DesktopPickerOwner, type DesktopPickerCheckpoint } from '../../src/desktop-picker-owner.ts'
import { computeDesktopDestinationPlanDigest } from '../../src/host-contract.ts'

const [checkpoint, destinationPath, recoveryRoot, activeVault] = process.argv.slice(2) as [
  DesktopPickerCheckpoint,
  string,
  string,
  string,
]
const owner = new DesktopPickerOwner({
  isAvailable: () => true,
  recoveryRoot,
  showOpenDialog: async () => ({ canceled: false, filePath: activeVault }),
  showSaveDialog: async () => ({ canceled: false, filePath: destinationPath }),
  onCheckpoint: async value => {
    if (value === checkpoint) process.exit(77)
  },
})
await owner.ready()
const inactive = {
  operationId: 'activate',
  requestId: 'activate',
  sessionId: 'session',
  vaultGeneration: 0,
  vaultId: null,
  windowId: 'window',
}
const selectedVault = await owner.pick({ identity: inactive, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
if (selectedVault.status !== 'selected') throw new Error('vault selection failed')
const consumed = await owner.consumeVaultSelection({ authorization: selectedVault.authorization, identity: inactive }, new AbortController().signal)
if (consumed.status !== 'consumed') throw new Error('vault consume failed')
const bound = await owner.bindVaultSelection({ claim: consumed.claim, operationId: inactive.operationId, vaultGeneration: 1, vaultId: 'vault' }, new AbortController().signal)
if (bound.status !== 'bound') throw new Error('vault bind failed')
const identity = { ...inactive, operationId: 'export', requestId: 'export', vaultGeneration: 1, vaultId: 'vault' }
const selected = await owner.pick({ identity, kind: 'destination', purpose: 'export-html' }, new AbortController().signal)
if (selected.status !== 'selected') throw new Error('destination selection failed')
const bytes = new TextEncoder().encode('new')
const digest = await import('node:crypto').then(({ createHash }) => createHash('sha256').update(bytes).digest('hex'))
const plan = {
  entries: [{ digest: digest as never, size: bytes.length, target: { kind: 'selected-file' as const } }] as const,
  purpose: 'export-html' as const,
  totalBytes: bytes.length,
}
const planDigest = computeDesktopDestinationPlanDigest(plan)
const locked = await owner.lockDestinationPlan({ ...plan, identity, planDigest, selectionAuthorization: selected.authorization }, new AbortController().signal)
const begun = await owner.beginDestination({ ...plan, authorization: locked.authorization, identity, planDigest }, new AbortController().signal)
await owner.writeDestinationChunk({ bytes, offset: 0, planDigest, session: begun.session, target: { kind: 'selected-file' } }, new AbortController().signal)
await owner.finalizeDestination({ expectedState: begun.expectedState, planDigest, session: begun.session }, new AbortController().signal)
await writeFile(`${destinationPath}.fixture-complete`, await readFile(destinationPath))
await owner.dispose()
