import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, realpath, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DesktopPickerChannel } from '../src/desktop-picker-channel.ts'
import { DesktopPickerOwner } from '../src/desktop-picker-owner.ts'
import { DesktopPickerProvider } from '../src/desktop-picker-provider.ts'
import { computeDesktopDestinationPlanDigest, type NativeOperationIdentity } from '../src/host-contract.ts'

async function canonicalTemp(prefix: string): Promise<string> {
  return await realpath(await mkdtemp(join(tmpdir(), prefix)))
}

function identity(operationId: string, active = true): NativeOperationIdentity {
  return {
    operationId,
    requestId: `request-${operationId}`,
    sessionId: 'channel-session',
    vaultGeneration: active ? 1 : 0,
    vaultId: active ? 'vault-1' : null,
    windowId: 'channel-window',
  }
}

function providerFor(owner: DesktopPickerOwner): { channel: DesktopPickerChannel; provider: DesktopPickerProvider } {
  const channel = new DesktopPickerChannel(owner)
  return { channel, provider: new DesktopPickerProvider({ endpoint: '', token: '' }) }
}

async function activate(owner: DesktopPickerOwner): Promise<void> {
  const operation = identity('activate', false)
  const picked = await owner.pick({ identity: operation, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
  assert.equal(picked.status, 'selected')
  if (picked.status !== 'selected') return
  const consumed = await owner.consumeVaultSelection({ authorization: picked.authorization, identity: operation }, new AbortController().signal)
  assert.equal(consumed.status, 'consumed')
  if (consumed.status !== 'consumed') return
  assert.equal((await owner.bindVaultSelection({ claim: consumed.claim, operationId: operation.operationId, vaultGeneration: 1, vaultId: 'vault-1' }, new AbortController().signal)).status, 'bound')
}

test('picker channel authenticates, forwards opaque sessions, and rejects replay', async () => {
  const root = await canonicalTemp('tockteam-picker-channel-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  await writeFile(join(root, 'note.md'), 'channel note')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => ({ canceled: false, filePath: options.purpose === 'activate' ? activeVault : root }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  const activationIdentity = identity('activate', false)
  const activationPick = await owner.pick({ identity: activationIdentity, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
  assert.equal(activationPick.status, 'selected')
  if (activationPick.status !== 'selected') return
  const consumed = await owner.consumeVaultSelection({ authorization: activationPick.authorization, identity: activationIdentity }, new AbortController().signal)
  assert.equal(consumed.status, 'consumed')
  if (consumed.status !== 'consumed') return
  assert.equal((await owner.bindVaultSelection({ claim: consumed.claim, operationId: activationIdentity.operationId, vaultGeneration: 1, vaultId: 'vault-1' }, new AbortController().signal)).status, 'bound')
  const channel = new DesktopPickerChannel(owner)
  const environment = await channel.start()
  const provider = new DesktopPickerProvider(environment, fetch, () => ({ active: true, generation: 1, id: 'vault-1' }))
  const unauthorized = await fetch(environment.endpoint, {
    method: 'POST',
    headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
    body: '{}',
  })
  assert.equal(unauthorized.status, 401)

  const operation = identity('channel-operation')
  const picked = await provider.pick({ identity: operation, kind: 'source', purpose: 'markdown-folder' }, new AbortController().signal)
  assert.equal(picked.status, 'selected')
  if (picked.status !== 'selected') return
  const replay = await provider.pick({ identity: operation, kind: 'source', purpose: 'markdown-folder' }, new AbortController().signal)
  assert.deepEqual(replay, { operationId: operation.operationId, status: 'denied' })
  const begun = await provider.beginSource({
    authorization: picked.authorization,
    identity: operation,
    limits: {
      maxDepth: 128,
      maxEntries: 100_000,
      maxEntryBytes: 1024 * 1024,
      maxRelativePathBytes: 4096,
      maxTotalBytes: 1024 * 1024,
    },
    purpose: 'markdown-folder',
  }, new AbortController().signal)
  const listed = await provider.listSource({ limit: 256, session: begun.session }, new AbortController().signal)
  assert.equal(listed.entries.some(entry => entry.kind === 'file'), true)
  await channel.stop()
  await assert.rejects(
    provider.listSource({ limit: 1, session: begun.session }, new AbortController().signal),
  )
})

test('provider unload closes admission before its cleanup snapshot', async () => {
  const root = await canonicalTemp('tockteam-picker-unload-race-')
  const activeVault = await canonicalTemp('tockteam-picker-unload-vault-')
  const source = await canonicalTemp('tockteam-picker-unload-source-')
  const output = join(root, 'export.html')
  const bytes = new TextEncoder().encode('confidential unload race bytes')
  await writeFile(join(source, 'note.md'), 'source')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => ({ canceled: false, filePath: options.purpose === 'activate' ? activeVault : source }),
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
  })
  await activate(owner)
  const channel = new DesktopPickerChannel(owner)
  const environment = await channel.start()
  let releaseStarted!: () => void
  const started = new Promise<void>(resolve => { releaseStarted = resolve })
  let unblockRelease!: () => void
  const blocked = new Promise<void>(resolve => { unblockRelease = resolve })
  let blockFirstRelease = true
  const fetcher: typeof fetch = async (input, init) => {
    const method = JSON.parse(String(init?.body)) as { method?: string }
    if (method.method === 'releaseSource' && blockFirstRelease) {
      blockFirstRelease = false
      releaseStarted()
      await blocked
    }
    return await fetch(input, init)
  }
  const provider = new DesktopPickerProvider(environment, fetcher, () => ({ active: true, generation: 1, id: 'vault-1' }))
  const sourceOperation = identity('unload-source')
  const selectedSource = await provider.pick({ identity: sourceOperation, kind: 'source', purpose: 'markdown-folder' }, new AbortController().signal)
  assert.equal(selectedSource.status, 'selected')
  if (selectedSource.status !== 'selected') return
  await provider.beginSource({
    authorization: selectedSource.authorization,
    identity: sourceOperation,
    limits: { maxDepth: 8, maxEntries: 16, maxEntryBytes: 1024, maxRelativePathBytes: 256, maxTotalBytes: 1024 },
    purpose: 'markdown-folder',
  }, new AbortController().signal)

  const disposing = provider.dispose()
  await started
  let lateSession: string | undefined
  try {
    const destinationOperation = identity('unload-destination')
    const selected = await provider.pick({ identity: destinationOperation, kind: 'destination', purpose: 'export-html' }, new AbortController().signal)
    assert.equal(selected.status, 'selected')
    if (selected.status === 'selected') {
      const plan = {
        entries: [{ digest: createHash('sha256').update(bytes).digest('hex') as never, size: bytes.byteLength, target: { kind: 'selected-file' as const } }] as const,
        purpose: 'export-html' as const,
        totalBytes: bytes.byteLength,
      }
      const planDigest = computeDesktopDestinationPlanDigest(plan)
      const locked = await provider.lockDestinationPlan({ ...plan, identity: destinationOperation, planDigest, selectionAuthorization: selected.authorization }, new AbortController().signal)
      const begun = await provider.beginDestination({ ...plan, authorization: locked.authorization, identity: destinationOperation, planDigest }, new AbortController().signal)
      lateSession = begun.session
      await provider.writeDestinationChunk({ bytes, offset: 0, planDigest, session: begun.session, target: { kind: 'selected-file' } }, new AbortController().signal)
    }
  } catch {
    // Closing admission is the expected unload result.
  } finally {
    unblockRelease()
    await disposing
  }

  const staged = (await readdir(root)).filter(name => name.startsWith('.tockteam-picker-stage-'))
  const reported = lateSession === undefined ? undefined : await provider.abortDestination({ session: lateSession as never })
  await channel.stop()
  assert.equal(lateSession, undefined)
  assert.deepEqual(staged, [])
  assert.equal(reported, undefined)
})

test('provider unload propagates residual destination cleanup evidence', async () => {
  const root = await canonicalTemp('tockteam-picker-unload-residual-')
  const activeVault = await canonicalTemp('tockteam-picker-unload-residual-vault-')
  const output = join(root, 'export.html')
  const bytes = new TextEncoder().encode('residual unload bytes')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async () => ({ canceled: false, filePath: activeVault }),
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
  })
  await activate(owner)
  const channel = new DesktopPickerChannel(owner)
  const provider = new DesktopPickerProvider(await channel.start(), fetch, () => ({ active: true, generation: 1, id: 'vault-1' }))
  const operation = identity('unload-residual')
  const selected = await provider.pick({ identity: operation, kind: 'destination', purpose: 'export-html' }, new AbortController().signal)
  assert.equal(selected.status, 'selected')
  if (selected.status !== 'selected') return
  const plan = {
    entries: [{ digest: createHash('sha256').update(bytes).digest('hex') as never, size: bytes.byteLength, target: { kind: 'selected-file' as const } }] as const,
    purpose: 'export-html' as const,
    totalBytes: bytes.byteLength,
  }
  const planDigest = computeDesktopDestinationPlanDigest(plan)
  const locked = await provider.lockDestinationPlan({ ...plan, identity: operation, planDigest, selectionAuthorization: selected.authorization }, new AbortController().signal)
  const begun = await provider.beginDestination({ ...plan, authorization: locked.authorization, identity: operation, planDigest }, new AbortController().signal)
  await provider.writeDestinationChunk({ bytes, offset: 0, planDigest, session: begun.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  const stageName = (await readdir(root)).find(name => name.startsWith('.tockteam-picker-stage-'))
  assert.ok(stageName)
  const stage = join(root, stageName)
  await rename(stage, `${stage}.moved`)
  await mkdir(stage)
  await writeFile(join(stage, 'attacker-sentinel'), 'keep')

  await assert.rejects(provider.dispose(), /cleanup was incomplete/)
  const reported = await provider.abortDestination({ session: begun.session })
  assert.equal(reported.status, 'already-closed')
  assert.equal(reported.cleanup.status, 'residual')
  await channel.stop()
})

test('vault selection binding publishes authority only after identity and trust recheck', async () => {
  const activeVault = await canonicalTemp('tockteam-picker-activation-race-')
  let available = true
  const owner = new DesktopPickerOwner({
    isAvailable: () => available,
    showOpenDialog: async () => ({ canceled: false, filePath: activeVault }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  const activationIdentity = identity('activation-race', false)
  const picked = await owner.pick({ identity: activationIdentity, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
  assert.equal(picked.status, 'selected')
  if (picked.status !== 'selected') return
  const consumed = await owner.consumeVaultSelection({ authorization: picked.authorization, identity: activationIdentity }, new AbortController().signal)
  assert.equal(consumed.status, 'consumed')
  if (consumed.status !== 'consumed') return
  available = false
  assert.equal((await owner.bindVaultSelection({ claim: consumed.claim, operationId: activationIdentity.operationId, vaultGeneration: 1, vaultId: 'vault-1' }, new AbortController().signal)).status, 'unavailable')
  available = true
  assert.deepEqual(
    await owner.pick({ identity: identity('after-race'), kind: 'source', purpose: 'markdown-folder' }, new AbortController().signal),
    { operationId: 'after-race', status: 'stale' },
  )
  await owner.dispose()
})

test('picker provider cancellation fails closed before native dialog publication', async () => {
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async () => ({ canceled: true }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  const { channel } = providerFor(owner)
  const environment = await channel.start()
  const provider = new DesktopPickerProvider(environment)
  const controller = new AbortController()
  controller.abort()
  const operation = identity('cancelled')
  const result = await provider.pick({ identity: operation, kind: 'source', purpose: 'markdown-folder' }, controller.signal)
  assert.deepEqual(result, { operationId: operation.operationId, status: 'cancelled' })
  await channel.stop()
})
