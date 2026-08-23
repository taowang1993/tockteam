import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
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
  type NativeOperationIdentity,
} from '../src/host-contract.ts'
import { DesktopPickerOwner, type DesktopPickerDialogOptions } from '../src/desktop-picker-owner.ts'
import type { DesktopPickerDialogResult } from '../src/desktop-picker-owner.ts'

const identity: NativeOperationIdentity = {
  operationId: 'operation-1',
  requestId: 'request-1',
  sessionId: 'session-1',
  vaultGeneration: 0,
  vaultId: null,
  windowId: 'window-1',
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

test('picker owner consumes opaque source grants and reads bounded path-free sessions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-picker-source-'))
  await mkdir(join(root, 'nested'))
  await writeFile(join(root, 'note.md'), 'hello world')
  await writeFile(join(root, 'nested', 'other.md'), 'nested')
  const dialogs = dialogQueue([root])
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: dialogs.open,
    showSaveDialog: dialogs.save,
    randomId: (() => { let count = 0; return () => `opaque-${++count}` })(),
  })

  const picked = await owner.pick({ identity, kind: 'source', purpose: 'markdown-folder' }, new AbortController().signal)
  assert.equal(picked.status, 'selected')
  if (picked.status !== 'selected') return
  assert.equal(JSON.stringify(picked).includes(root), false)

  const begun = await owner.beginSource({
    authorization: picked.authorization,
    identity,
    limits,
    purpose: 'markdown-folder',
  }, new AbortController().signal)
  assert.equal(begun.root.kind, 'directory')
  assert.equal('entry' in begun.root, false)
  const listed = await owner.listSource({ limit: 256, session: begun.session }, new AbortController().signal)
  const file = listed.entries.find(entry => entry.kind === 'file' && entry.relativePath.endsWith('note.md'))
  assert.ok(file && file.kind === 'file')
  const first = await owner.readSource({
    entryId: file.entryId,
    expectedRevision: file.revision,
    expectedSize: file.size,
    length: 5,
    offset: 0,
    session: begun.session,
  }, new AbortController().signal)
  assert.equal(Buffer.from(first.bytes).toString(), 'hello')
  const second = await owner.readSource({
    entryId: file.entryId,
    expectedRevision: file.revision,
    expectedSize: file.size,
    length: MAX_DESKTOP_DESTINATION_CHUNK_BYTES,
    offset: first.nextOffset,
    session: begun.session,
  }, new AbortController().signal)
  assert.equal(Buffer.from(second.bytes).toString(), ' world')
  assert.equal(JSON.stringify(listed).includes(root), false)

  await assert.rejects(
    owner.beginSource({ authorization: picked.authorization, identity, limits, purpose: 'markdown-folder' }, new AbortController().signal),
    (error: unknown) => error instanceof TockTeamDesktopGrantError && error.code === 'replayed',
  )
  assert.deepEqual(await owner.releaseSource({ session: begun.session }), { status: 'released' })
  assert.deepEqual(await owner.releaseSource({ session: begun.session }), { status: 'already-released' })
  await owner.dispose()
})

test('picker owner enforces destination plan purpose and publishes atomically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-picker-destination-'))
  const output = join(root, 'export.html')
  const content = new TextEncoder().encode('<p>ok</p>')
  const dialogs = dialogQueue([output])
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: dialogs.open,
    showSaveDialog: dialogs.save,
  })
  const picked = await owner.pick({ identity, kind: 'destination', purpose: 'export-html' }, new AbortController().signal)
  assert.equal(picked.status, 'selected')
  if (picked.status !== 'selected') return
  const begun = await owner.beginDestination({
    authorization: picked.authorization,
    entries: [{ digest: digest(content) as never, size: content.byteLength, target: { kind: 'selected-file' } }],
    identity,
    planDigest: digest(new TextEncoder().encode('plan')) as never,
    purpose: 'export-html',
    totalBytes: content.byteLength,
  }, new AbortController().signal)
  await owner.writeDestinationChunk({
    bytes: content,
    offset: 0,
    session: begun.session,
    target: { kind: 'selected-file' },
  }, new AbortController().signal)
  const finalized = await owner.finalizeDestination({
    expectedState: begun.expectedState,
    planDigest: digest(new TextEncoder().encode('plan')) as never,
    session: begun.session,
  }, new AbortController().signal)
  assert.equal(finalized.status, 'published')
  assert.equal(await readFile(output, 'utf8'), '<p>ok</p>')
  await owner.dispose()
})

test('picker owner aborts and expires sessions without retaining grants', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-picker-expiry-'))
  let now = 1_000
  const dialogs = dialogQueue([root])
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: dialogs.open,
    showSaveDialog: dialogs.save,
    now: () => now,
  })
  const aborted = new AbortController()
  aborted.abort()
  const canceled = await owner.pick({ identity, kind: 'source', purpose: 'markdown-folder' }, aborted.signal)
  assert.deepEqual(canceled, { operationId: identity.operationId, status: 'cancelled' })
  const picked = await owner.pick({ identity, kind: 'source', purpose: 'markdown-folder' }, new AbortController().signal)
  if (picked.status !== 'selected') return
  now += 15 * 60 * 1000 + 1
  await assert.rejects(
    owner.beginSource({ authorization: picked.authorization, identity, limits, purpose: 'markdown-folder' }, new AbortController().signal),
    (error: unknown) => error instanceof TockTeamDesktopGrantError && error.code === 'expired',
  )
  await owner.dispose()
})
