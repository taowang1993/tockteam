import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { link, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  MAX_DESKTOP_SOURCE_DEPTH,
  MAX_DESKTOP_SOURCE_ENTRIES,
  MAX_DESKTOP_SOURCE_ENTRY_BYTES,
  MAX_DESKTOP_SOURCE_RELATIVE_PATH_BYTES,
  MAX_DESKTOP_SOURCE_TOTAL_BYTES,
  TockTeamDesktopGrantError,
  type DesktopGrantErrorCode,
  type DesktopPickerAuthorization,
  type DesktopSha256,
  type NativeOperationIdentity,
} from '../src/host-contract.ts'
import { DesktopPickerOwner, type DesktopPickerCheckpoint } from '../src/desktop-picker-owner.ts'

const limits = {
  maxDepth: MAX_DESKTOP_SOURCE_DEPTH,
  maxEntries: MAX_DESKTOP_SOURCE_ENTRIES,
  maxEntryBytes: MAX_DESKTOP_SOURCE_ENTRY_BYTES,
  maxRelativePathBytes: MAX_DESKTOP_SOURCE_RELATIVE_PATH_BYTES,
  maxTotalBytes: MAX_DESKTOP_SOURCE_TOTAL_BYTES,
}

function identity(operationId: string, active = true): NativeOperationIdentity {
  return {
    operationId,
    requestId: `request-${operationId}`,
    sessionId: 'session',
    vaultGeneration: active ? 1 : 0,
    vaultId: active ? 'vault-1' : null,
    windowId: 'window',
  }
}

async function activate(owner: DesktopPickerOwner): Promise<void> {
  const activationIdentity = identity('activate', false)
  const picked = await owner.pick({ identity: activationIdentity, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
  assert.equal(picked.status, 'selected')
  if (picked.status !== 'selected') return
  const activation = await owner.beginVaultActivation({ authorization: picked.authorization, identity: activationIdentity }, new AbortController().signal)
  await owner.commitVaultActivation({ activationId: activation.activationId, generation: 1, vaultId: 'vault-1' }, new AbortController().signal)
}

function sha(value: string | Uint8Array): DesktopSha256 {
  return createHash('sha256').update(value).digest('hex') as DesktopSha256
}

async function grant(
  owner: DesktopPickerOwner,
  request: Parameters<DesktopPickerOwner['pick']>[0],
): Promise<DesktopPickerAuthorization> {
  const result = await owner.pick(request, new AbortController().signal)
  assert.equal(result.status, 'selected')
  if (result.status !== 'selected') throw new Error('picker did not select')
  return result.authorization
}

async function rejectsCode(promise: Promise<unknown>, code: DesktopGrantErrorCode): Promise<void> {
  await assert.rejects(
    promise,
    (error: unknown) => error instanceof TockTeamDesktopGrantError && error.code === code,
  )
}

function noStaging(entries: string[]): boolean {
  return entries.every(entry => !entry.startsWith('.tockteam-picker-stage-'))
}

test('single-file source supports stat, sequential read, and root revalidation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-picker-single-'))
  const activeVault = await mkdtemp(join(tmpdir(), 'tockteam-picker-active-'))
  const sourcePath = join(root, 'notes.zip')
  await writeFile(sourcePath, 'zip bytes')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => ({ canceled: false, filePath: options.purpose === 'activate' ? activeVault : sourcePath }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  await activate(owner)
  const operation = identity('single-file')
  const authorization = await grant(owner, { identity: operation, kind: 'source', purpose: 'markdown-zip' })
  const begun = await owner.beginSource({ authorization, identity: operation, limits, purpose: 'markdown-zip' }, new AbortController().signal)
  assert.equal(begun.root.kind, 'file')
  if (begun.root.kind !== 'file') return
  const stat = await owner.statSource({ entryId: begun.root.entry.entryId, session: begun.session }, new AbortController().signal)
  assert.equal(stat.kind, 'file')
  const read = await owner.readSource({
    entryId: begun.root.entry.entryId,
    expectedRevision: begun.root.entry.revision,
    expectedSize: begun.root.entry.size,
    length: 1024,
    offset: 0,
    session: begun.session,
  }, new AbortController().signal)
  assert.equal(Buffer.from(read.bytes).toString(), 'zip bytes')
  assert.equal(read.complete, true)
  assert.deepEqual(await owner.revalidateSource({
    expectedRootRevision: begun.root.revision,
    session: begun.session,
  }, new AbortController().signal), { revision: begun.root.revision, status: 'unchanged' })
  await owner.dispose()
})

test('directory cursors page deterministic bounded entries and detect source TOCTOU', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-picker-pages-'))
  const activeVault = await mkdtemp(join(tmpdir(), 'tockteam-picker-active-'))
  await writeFile(join(root, 'b.md'), 'b')
  await writeFile(join(root, 'a.md'), 'a')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => ({ canceled: false, filePath: options.purpose === 'activate' ? activeVault : root }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  await activate(owner)
  const operation = identity('pages')
  const authorization = await grant(owner, { identity: operation, kind: 'source', purpose: 'markdown-folder' })
  const begun = await owner.beginSource({ authorization, identity: operation, limits, purpose: 'markdown-folder' }, new AbortController().signal)
  const first = await owner.listSource({ limit: 1, session: begun.session }, new AbortController().signal)
  assert.equal(first.complete, false)
  assert.ok(first.cursor)
  assert.equal(first.entries[0]?.kind, 'file')
  assert.equal(first.entries[0]?.kind === 'file' ? first.entries[0].relativePath : '', 'a.md')
  const second = await owner.listSource({ cursor: first.cursor, limit: 1, session: begun.session }, new AbortController().signal)
  assert.equal(second.complete, true)
  assert.equal(second.entries[0]?.kind === 'file' ? second.entries[0].relativePath : '', 'b.md')
  const file = first.entries[0]
  assert.ok(file?.kind === 'file')
  if (file?.kind !== 'file') return
  await owner.readSource({
    entryId: file.entryId,
    expectedRevision: file.revision,
    expectedSize: file.size,
    length: 1,
    offset: 0,
    session: begun.session,
  }, new AbortController().signal)
  await writeFile(join(root, 'a.md'), 'changed content')
  await rejectsCode(owner.revalidateSource({
    expectedRootRevision: begun.root.revision,
    session: begun.session,
  }, new AbortController().signal), 'changed')
  await owner.dispose()
})

test('nested symlink, hardlink, and socket entries are rejected and never followed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-picker-unsafe-'))
  const activeVault = await mkdtemp(join(tmpdir(), 'tockteam-picker-active-'))
  const file = join(root, 'safe.md')
  const hard = join(root, 'hard.md')
  const symbolic = join(root, 'symbolic.md')
  const socket = join(root, 'socket')
  await writeFile(file, 'safe')
  await link(file, hard)
  await symlink(file, symbolic)
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socket, resolve)
  })
  try {
    const owner = new DesktopPickerOwner({
      isAvailable: () => true,
      showOpenDialog: async options => ({ canceled: false, filePath: options.purpose === 'activate' ? activeVault : root }),
      showSaveDialog: async () => ({ canceled: true }),
    })
    await activate(owner)
    const operation = identity('unsafe-nested')
    const authorization = await grant(owner, { identity: operation, kind: 'source', purpose: 'markdown-folder' })
    const begun = await owner.beginSource({ authorization, identity: operation, limits, purpose: 'markdown-folder' }, new AbortController().signal)
    const listed = await owner.listSource({ limit: 256, session: begun.session }, new AbortController().signal)
    const reasons = listed.entries.flatMap(entry => entry.kind === 'rejected' ? [entry.reason] : [])
    assert.ok(reasons.includes('hardlink'))
    assert.ok(reasons.includes('symlink'))
    assert.ok(reasons.includes('special-file'))
    assert.equal(listed.entries.some(entry => entry.kind === 'file'), false)
    await owner.dispose()
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('destination mismatches and TOCTOU fail closed with staging cleanup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-picker-destination-fail-'))
  const activeVault = await mkdtemp(join(tmpdir(), 'tockteam-picker-active-'))
  const paths = ['size.html', 'digest.html', 'race.html'].map(name => join(root, name))
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => options.purpose === 'activate'
      ? { canceled: false, filePath: activeVault }
      : { canceled: true },
    showSaveDialog: async () => {
      const filePath = paths.shift()
      return filePath === undefined ? { canceled: true } : { canceled: false, filePath }
    },
  })
  await activate(owner)
  const content = new TextEncoder().encode('good')

  const begin = async (name: string, expectedDigest = sha(content)) => {
    const operation = identity(name)
    const authorization = await grant(owner, { identity: operation, kind: 'destination', purpose: 'export-html' })
    return await owner.beginDestination({
      authorization,
      entries: [{ digest: expectedDigest, size: content.length, target: { kind: 'selected-file' } }],
      identity: operation,
      planDigest: sha(`plan-${name}`),
      purpose: 'export-html',
      totalBytes: content.length,
    }, new AbortController().signal)
  }

  const size = await begin('size')
  await owner.writeDestinationChunk({ bytes: content.subarray(0, 2), offset: 0, session: size.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  await rejectsCode(owner.finalizeDestination({ expectedState: size.expectedState, planDigest: sha('plan-size'), session: size.session }, new AbortController().signal), 'size-mismatch')
  assert.equal(noStaging(await readdir(root)), true)

  const digestSession = await begin('digest', sha('different'))
  await owner.writeDestinationChunk({ bytes: content, offset: 0, session: digestSession.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  await rejectsCode(owner.finalizeDestination({ expectedState: digestSession.expectedState, planDigest: sha('plan-digest'), session: digestSession.session }, new AbortController().signal), 'digest-mismatch')
  assert.equal(noStaging(await readdir(root)), true)

  const race = await begin('race')
  await owner.writeDestinationChunk({ bytes: content, offset: 0, session: race.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  await writeFile(join(root, 'race.html'), 'intruder')
  await rejectsCode(owner.finalizeDestination({ expectedState: race.expectedState, planDigest: sha('plan-race'), session: race.session }, new AbortController().signal), 'changed')
  assert.equal(await readFile(join(root, 'race.html'), 'utf8'), 'intruder')
  assert.equal(noStaging(await readdir(root)), true)
  await owner.dispose()
})

test('root caps, purpose filters, trust revocation, and active-vault overlap fail closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-picker-policy-'))
  const activeVault = await mkdtemp(join(tmpdir(), 'tockteam-picker-active-'))
  const oversized = join(root, 'oversized.zip')
  const wrongCsv = join(root, 'wrong.txt')
  const restoreFile = join(root, 'restore.zip')
  await writeFile(oversized, 'ninebytes')
  await writeFile(wrongCsv, 'csv')
  await writeFile(restoreFile, 'restore')
  let available = true
  const selections = new Map<string, string>([
    ['activate', activeVault],
    ['markdown-zip', oversized],
    ['csv', wrongCsv],
    ['restore-backup', restoreFile],
    ['markdown-folder', activeVault],
  ])
  const owner = new DesktopPickerOwner({
    isAvailable: () => available,
    showOpenDialog: async options => {
      const filePath = selections.get(options.purpose)
      return filePath === undefined ? { canceled: true } : { canceled: false, filePath }
    },
    showSaveDialog: async () => ({ canceled: true }),
  })
  await activate(owner)

  const zipIdentity = identity('root-cap')
  const zipAuthorization = await grant(owner, { identity: zipIdentity, kind: 'source', purpose: 'markdown-zip' })
  await rejectsCode(owner.beginSource({
    authorization: zipAuthorization,
    identity: zipIdentity,
    limits: { ...limits, maxEntryBytes: 1, maxTotalBytes: 1 },
    purpose: 'markdown-zip',
  }, new AbortController().signal), 'limit-exceeded')

  const wrong = await owner.pick({ identity: identity('wrong-csv'), kind: 'source', purpose: 'csv' }, new AbortController().signal)
  assert.equal(wrong.status, 'denied')
  const restore = await owner.pick({ identity: identity('restore-file'), kind: 'source', purpose: 'restore-backup' }, new AbortController().signal)
  assert.equal(restore.status, 'denied')

  const trustIdentity = identity('trust-loss')
  const trustAuthorization = await grant(owner, { identity: trustIdentity, kind: 'source', purpose: 'markdown-zip' })
  available = false
  await rejectsCode(owner.beginSource({ authorization: trustAuthorization, identity: trustIdentity, limits, purpose: 'markdown-zip' }, new AbortController().signal), 'stale')
  available = true

  const overlapIdentity = identity('overlap')
  const overlapAuthorization = await grant(owner, { identity: overlapIdentity, kind: 'source', purpose: 'markdown-folder' })
  await rejectsCode(owner.beginSource({ authorization: overlapAuthorization, identity: overlapIdentity, limits, purpose: 'markdown-folder' }, new AbortController().signal), 'unsafe-source')
  await owner.dispose()
})

test('abort checkpoints and owner disposal settle sessions and staging idempotently', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tockteam-picker-abort-'))
  const activeVault = await mkdtemp(join(tmpdir(), 'tockteam-picker-active-'))
  const source = join(root, 'source.zip')
  const output = join(root, 'output.html')
  await writeFile(source, 'source')
  let checkpoint: DesktopPickerCheckpoint | undefined
  let controller: AbortController | undefined
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => ({ canceled: false, filePath: options.purpose === 'activate' ? activeVault : source }),
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
    onCheckpoint: async value => {
      if (value === checkpoint) controller?.abort()
    },
  })

  await activate(owner)
  checkpoint = 'dialog'
  controller = new AbortController()
  assert.deepEqual(await owner.pick({ identity: identity('abort-dialog'), kind: 'source', purpose: 'markdown-zip' }, controller.signal), {
    operationId: 'abort-dialog',
    status: 'cancelled',
  })

  checkpoint = undefined
  const sourceIdentity = identity('abort-source')
  const sourceAuthorization = await grant(owner, { identity: sourceIdentity, kind: 'source', purpose: 'markdown-zip' })
  const begunSource = await owner.beginSource({ authorization: sourceAuthorization, identity: sourceIdentity, limits, purpose: 'markdown-zip' }, new AbortController().signal)
  if (begunSource.root.kind !== 'file') return
  checkpoint = 'read'
  controller = new AbortController()
  await rejectsCode(owner.readSource({
    entryId: begunSource.root.entry.entryId,
    expectedRevision: begunSource.root.entry.revision,
    expectedSize: begunSource.root.entry.size,
    length: 1,
    offset: 0,
    session: begunSource.session,
  }, controller.signal), 'aborted')

  checkpoint = undefined
  const destinationIdentity = identity('abort-destination')
  const authorization = await grant(owner, { identity: destinationIdentity, kind: 'destination', purpose: 'export-html' })
  const content = new TextEncoder().encode('data')
  const begunDestination = await owner.beginDestination({
    authorization,
    entries: [{ digest: sha(content), size: content.length, target: { kind: 'selected-file' } }],
    identity: destinationIdentity,
    planDigest: sha('abort-plan'),
    purpose: 'export-html',
    totalBytes: content.length,
  }, new AbortController().signal)
  checkpoint = 'write'
  controller = new AbortController()
  await rejectsCode(owner.writeDestinationChunk({ bytes: content, offset: 0, session: begunDestination.session, target: { kind: 'selected-file' } }, controller.signal), 'aborted')
  assert.equal((await owner.abortDestination({ session: begunDestination.session })).status, 'aborted')
  assert.equal((await owner.abortDestination({ session: begunDestination.session })).status, 'already-closed')
  assert.equal(noStaging(await readdir(root)), true)

  checkpoint = undefined
  const disposeIdentity = identity('dispose-destination')
  const disposeAuthorization = await grant(owner, { identity: disposeIdentity, kind: 'destination', purpose: 'export-html' })
  const disposable = await owner.beginDestination({
    authorization: disposeAuthorization,
    entries: [{ digest: sha(content), size: content.length, target: { kind: 'selected-file' } }],
    identity: disposeIdentity,
    planDigest: sha('dispose-plan'),
    purpose: 'export-html',
    totalBytes: content.length,
  }, new AbortController().signal)
  await owner.writeDestinationChunk({ bytes: content, offset: 0, session: disposable.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  await owner.dispose()
  assert.equal(noStaging(await readdir(root)), true)
  await rejectsCode(owner.listSource({ limit: 1, session: begunSource.session }, new AbortController().signal), 'closed')
  assert.equal((await owner.abortDestination({ session: disposable.session })).status, 'already-closed')
})
