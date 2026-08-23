import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  MAX_DESKTOP_DESTINATION_CHUNK_BYTES,
  MAX_DESKTOP_SOURCE_DEPTH,
  MAX_DESKTOP_SOURCE_ENTRIES,
  MAX_DESKTOP_SOURCE_ENTRY_BYTES,
  MAX_DESKTOP_SOURCE_RELATIVE_PATH_BYTES,
  MAX_DESKTOP_SOURCE_TOTAL_BYTES,
  TockTeamDesktopGrantError,
  computeDesktopDestinationPlanDigest,
  type NativeOperationIdentity,
} from '../src/host-contract.ts'
import {
  DesktopPickerOwner,
  type DesktopPickerDialogOptions,
  type DesktopPickerDialogResult,
} from '../src/desktop-picker-owner.ts'

function identity(operationId: string, active = true): NativeOperationIdentity {
  return {
    operationId,
    requestId: `request-${operationId}`,
    sessionId: 'session-1',
    vaultGeneration: active ? 1 : 0,
    vaultId: active ? 'vault-1' : null,
    windowId: 'window-1',
  }
}

async function canonicalTemp(prefix: string): Promise<string> {
  return await realpath(await mkdtemp(join(tmpdir(), prefix)))
}

const limits = {
  maxDepth: MAX_DESKTOP_SOURCE_DEPTH,
  maxEntries: MAX_DESKTOP_SOURCE_ENTRIES,
  maxEntryBytes: MAX_DESKTOP_SOURCE_ENTRY_BYTES,
  maxRelativePathBytes: MAX_DESKTOP_SOURCE_RELATIVE_PATH_BYTES,
  maxTotalBytes: MAX_DESKTOP_SOURCE_TOTAL_BYTES,
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function dialogQueue(paths: string[]): {
  open: (options: DesktopPickerDialogOptions) => Promise<DesktopPickerDialogResult>
  save: (options: DesktopPickerDialogOptions) => Promise<DesktopPickerDialogResult>
} {
  const next = (): DesktopPickerDialogResult => {
    const filePath = paths.shift()
    return filePath === undefined ? { canceled: true } : { canceled: false, filePath }
  }
  return {
    open: async (_options) => next(),
    save: async (_options) => next(),
  }
}

async function activate(owner: DesktopPickerOwner): Promise<void> {
  const activationIdentity = identity('activate', false)
  const picked = await owner.pick({ identity: activationIdentity, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
  assert.equal(picked.status, 'selected')
  if (picked.status !== 'selected') return
  const consumed = await owner.consumeVaultSelection({ authorization: picked.authorization, identity: activationIdentity }, new AbortController().signal)
  assert.equal(consumed.status, 'consumed')
  if (consumed.status !== 'consumed') return
  assert.deepEqual(await owner.bindVaultSelection({ claim: consumed.claim, operationId: activationIdentity.operationId, vaultGeneration: 1, vaultId: 'vault-1' }, new AbortController().signal), {
    operationId: activationIdentity.operationId,
    status: 'bound',
  })
}

test('picker owner consumes opaque source grants and reads bounded path-free sessions', async () => {
  const root = await canonicalTemp('tockteam-picker-source-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  await mkdir(join(root, 'nested'))
  await writeFile(join(root, 'note.md'), 'hello world')
  await writeFile(join(root, 'nested', 'other.md'), 'nested')
  const dialogs = dialogQueue([root])
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => options.purpose === 'activate'
      ? { canceled: false, filePath: activeVault }
      : await dialogs.open(options),
    showSaveDialog: dialogs.save,
    randomId: (() => { let count = 0; return () => `opaque-${++count}` })(),
  })
  await activate(owner)
  const operation = identity('source')
  const picked = await owner.pick({ identity: operation, kind: 'source', purpose: 'markdown-folder' }, new AbortController().signal)
  assert.equal(picked.status, 'selected')
  if (picked.status !== 'selected') return
  assert.equal(JSON.stringify(picked).includes(root), false)

  const begun = await owner.beginSource({ authorization: picked.authorization, identity: operation, limits, purpose: 'markdown-folder' }, new AbortController().signal)
  assert.equal(begun.root.kind, 'directory')
  assert.equal('entry' in begun.root, false)
  const listed = await owner.listSource({ limit: 256, session: begun.session }, new AbortController().signal)
  const file = listed.entries.find(entry => entry.kind === 'file' && entry.relativePath.endsWith('note.md'))
  assert.ok(file && file.kind === 'file')
  const first = await owner.readSource({ entryId: file.entryId, expectedRevision: file.revision, expectedSize: file.size, length: 5, offset: 0, session: begun.session }, new AbortController().signal)
  assert.equal(Buffer.from(first.bytes).toString(), 'hello')
  const second = await owner.readSource({ entryId: file.entryId, expectedRevision: file.revision, expectedSize: file.size, length: MAX_DESKTOP_DESTINATION_CHUNK_BYTES, offset: first.nextOffset, session: begun.session }, new AbortController().signal)
  assert.equal(Buffer.from(second.bytes).toString(), ' world')
  assert.equal(JSON.stringify(listed).includes(root), false)
  await assert.rejects(
    owner.beginSource({ authorization: picked.authorization, identity: operation, limits, purpose: 'markdown-folder' }, new AbortController().signal),
    (error: unknown) => error instanceof TockTeamDesktopGrantError && error.code === 'replayed',
  )
  assert.deepEqual(await owner.releaseSource({ session: begun.session }), { status: 'released' })
  assert.deepEqual(await owner.releaseSource({ session: begun.session }), { status: 'already-released' })
  await owner.dispose()
})

test('picker owner enforces destination plan purpose and publishes atomically', async () => {
  const root = await canonicalTemp('tockteam-picker-destination-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const output = join(root, 'export.html')
  const content = new TextEncoder().encode('<p>ok</p>')
  const dialogs = dialogQueue([output])
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => options.purpose === 'activate'
      ? { canceled: false, filePath: activeVault }
      : await dialogs.open(options),
    showSaveDialog: dialogs.save,
  })
  await activate(owner)
  const operation = identity('destination')
  const picked = await owner.pick({ identity: operation, kind: 'destination', purpose: 'export-html' }, new AbortController().signal)
  assert.equal(picked.status, 'selected')
  if (picked.status !== 'selected') return
  const plan = {
    entries: [{ digest: digest(content) as never, size: content.byteLength, target: { kind: 'selected-file' as const } }] as const,
    purpose: 'export-html' as const,
    totalBytes: content.byteLength,
  }
  const planDigest = computeDesktopDestinationPlanDigest(plan)
  const locked = await owner.lockDestinationPlan({
    ...plan,
    identity: operation,
    planDigest,
    selectionAuthorization: picked.authorization,
  }, new AbortController().signal)
  const begun = await owner.beginDestination({ ...plan, authorization: locked.authorization, identity: operation, planDigest }, new AbortController().signal)
  await owner.writeDestinationChunk({ bytes: content, offset: 0, planDigest, session: begun.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  const finalized = await owner.finalizeDestination({ expectedState: begun.expectedState, planDigest, session: begun.session }, new AbortController().signal)
  assert.equal(finalized.status, 'published')
  assert.equal(await readFile(output, 'utf8'), '<p>ok</p>')
  await owner.dispose()
})

test('picker owner aborts and expires sessions without retaining grants', async () => {
  const root = await canonicalTemp('tockteam-picker-expiry-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  let now = 1_000
  const dialogs = dialogQueue([root])
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => options.purpose === 'activate'
      ? { canceled: false, filePath: activeVault }
      : await dialogs.open(options),
    showSaveDialog: dialogs.save,
    now: () => now,
  })
  await activate(owner)
  const aborted = new AbortController()
  aborted.abort()
  const canceled = await owner.pick({ identity: identity('aborted'), kind: 'source', purpose: 'markdown-folder' }, aborted.signal)
  assert.deepEqual(canceled, { operationId: 'aborted', status: 'cancelled' })
  const operation = identity('expiry')
  const picked = await owner.pick({ identity: operation, kind: 'source', purpose: 'markdown-folder' }, new AbortController().signal)
  if (picked.status !== 'selected') return
  now += 15 * 60 * 1000 + 1
  await assert.rejects(
    owner.beginSource({ authorization: picked.authorization, identity: operation, limits, purpose: 'markdown-folder' }, new AbortController().signal),
    (error: unknown) => error instanceof TockTeamDesktopGrantError && error.code === 'expired',
  )
  await owner.dispose()
})
