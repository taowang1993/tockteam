import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rmdir, symlink, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  MAX_DESKTOP_SOURCE_DEPTH,
  MAX_DESKTOP_SOURCE_ENTRIES,
  MAX_DESKTOP_SOURCE_ENTRY_BYTES,
  MAX_DESKTOP_SOURCE_RELATIVE_PATH_BYTES,
  MAX_DESKTOP_SOURCE_TOTAL_BYTES,
  TockTeamDesktopGrantError,
  computeDesktopDestinationPlanDigest,
  type BeginDesktopDestinationResult,
  type DesktopDestinationPlan,
  type DesktopGrantErrorCode,
  type DesktopPickerAuthorization,
  type DesktopSha256,
  type NativeOperationIdentity,
} from '../src/host-contract.ts'
import { DesktopPickerOwner, type DesktopPickerCheckpoint, type DesktopPickerDialogOptions } from '../src/desktop-picker-owner.ts'

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
  const consumed = await owner.consumeVaultSelection({ authorization: picked.authorization, identity: activationIdentity }, new AbortController().signal)
  assert.equal(consumed.status, 'consumed')
  if (consumed.status !== 'consumed') return
  assert.deepEqual(await owner.bindVaultSelection({ claim: consumed.claim, operationId: activationIdentity.operationId, vaultGeneration: 1, vaultId: 'vault-1' }, new AbortController().signal), {
    operationId: activationIdentity.operationId,
    status: 'bound',
  })
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

async function lockAndBegin(
  owner: DesktopPickerOwner,
  selectionAuthorization: DesktopPickerAuthorization,
  operation: NativeOperationIdentity,
  plan: DesktopDestinationPlan,
): Promise<{ begun: BeginDesktopDestinationResult; planDigest: DesktopSha256 }> {
  const planDigest = computeDesktopDestinationPlanDigest(plan)
  const locked = await owner.lockDestinationPlan({
    ...plan,
    identity: operation,
    planDigest,
    selectionAuthorization,
  } as Parameters<DesktopPickerOwner['lockDestinationPlan']>[0], new AbortController().signal)
  const begun = await owner.beginDestination({
    ...plan,
    authorization: locked.authorization,
    identity: operation,
    planDigest,
  } as Parameters<DesktopPickerOwner['beginDestination']>[0], new AbortController().signal)
  return { begun, planDigest }
}

test('single-file source supports stat, sequential read, and root revalidation', async () => {
  const root = await canonicalTemp('tockteam-picker-single-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
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
  const root = await canonicalTemp('tockteam-picker-pages-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
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
  const root = await canonicalTemp('tockteam-picker-unsafe-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const file = join(root, 'safe.md')
  const hard = join(root, 'hard.md')
  const symbolic = join(root, 'symbolic.md')
  const socket = join(root, 'socket')
  await writeFile(file, 'safe')
  await link(file, hard)
  await symlink(file, symbolic)
  const server = process.platform === 'win32' ? undefined : createServer()
  await new Promise<void>((resolve, reject) => {
    if (server === undefined) return resolve()
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
    if (server !== undefined) assert.ok(reasons.includes('special-file'))
    assert.equal(listed.entries.some(entry => entry.kind === 'file'), false)
    await owner.dispose()
  } finally {
    if (server !== undefined) await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('pre-existing lexical symlink ancestors are denied before canonical selection', async () => {
  const realRoot = await canonicalTemp('tockteam-picker-real-root-')
  const aliasParent = await canonicalTemp('tockteam-picker-alias-parent-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const alias = join(aliasParent, 'alias-dir')
  await writeFile(join(realRoot, 'notes.zip'), 'source')
  await symlink(realRoot, alias)
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => ({
      canceled: false,
      filePath: options.purpose === 'activate' ? activeVault : join(alias, 'notes.zip'),
    }),
    showSaveDialog: async () => ({ canceled: false, filePath: join(alias, 'export.html') }),
  })
  await activate(owner)
  assert.equal((await owner.pick({ identity: identity('alias-source'), kind: 'source', purpose: 'markdown-zip' }, new AbortController().signal)).status, 'denied')
  assert.equal((await owner.pick({ identity: identity('alias-destination'), kind: 'destination', purpose: 'export-html' }, new AbortController().signal)).status, 'denied')
  await owner.dispose()
})

test('ancestor replacement between listing and read cannot redirect file bytes', async () => {
  const root = await canonicalTemp('tockteam-picker-ancestor-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const outside = await canonicalTemp('tockteam-picker-outside-')
  await mkdir(join(root, 'nested'))
  await writeFile(join(root, 'nested', 'note.md'), 'inside')
  await writeFile(join(outside, 'note.md'), 'outside secret')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => ({ canceled: false, filePath: options.purpose === 'activate' ? activeVault : root }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  await activate(owner)
  const operation = identity('ancestor-swap')
  const authorization = await grant(owner, { identity: operation, kind: 'source', purpose: 'markdown-folder' })
  const begun = await owner.beginSource({ authorization, identity: operation, limits, purpose: 'markdown-folder' }, new AbortController().signal)
  const listed = await owner.listSource({ limit: 256, session: begun.session }, new AbortController().signal)
  const entry = listed.entries.find(value => value.kind === 'file' && value.relativePath === 'nested/note.md')
  assert.ok(entry?.kind === 'file')
  if (entry?.kind !== 'file') return
  await rename(join(root, 'nested'), join(root, 'original-nested'))
  await symlink(outside, join(root, 'nested'))
  await rejectsCode(owner.readSource({
    entryId: entry.entryId,
    expectedRevision: entry.revision,
    expectedSize: entry.size,
    length: 1024,
    offset: 0,
    session: begun.session,
  }, new AbortController().signal), 'changed')
  await owner.dispose()
})

test('first destination write rechecks a replaced parent before accepting payload bytes', async () => {
  const root = await canonicalTemp('tockteam-picker-first-write-parent-')
  const moved = `${root}-moved`
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const output = join(root, 'output.html')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async () => ({ canceled: false, filePath: activeVault }),
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
  })
  await activate(owner)
  const operation = identity('first-write-parent')
  const selection = await grant(owner, { identity: operation, kind: 'destination', purpose: 'export-html' })
  const secret = new TextEncoder().encode('must never enter replacement parent')
  const { begun, planDigest } = await lockAndBegin(owner, selection, operation, {
    entries: [{ digest: sha(secret), size: secret.length, target: { kind: 'selected-file' } }],
    purpose: 'export-html',
    totalBytes: secret.length,
  })
  await rename(root, moved)
  await mkdir(root)
  await rejectsCode(owner.writeDestinationChunk({ bytes: secret, offset: 0, planDigest, session: begun.session, target: { kind: 'selected-file' } }, new AbortController().signal), 'unsafe-target')
  const replacementEntries = await readdir(root, { recursive: true })
  for (const path of replacementEntries) {
    const bytes = await readFile(join(root, path)).catch(() => Buffer.alloc(0))
    assert.notDeepEqual(bytes, Buffer.from(secret))
  }
  assert.equal((await owner.abortDestination({ session: begun.session })).status, 'already-closed')
  await owner.dispose()
})

test('journal checkpoint stage drift is rebound before any payload write', async () => {
  const root = await canonicalTemp('tockteam-picker-journal-stage-drift-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const output = join(root, 'output.html')
  let movedStage: string | undefined
  let foreignStage: string | undefined
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async () => ({ canceled: false, filePath: activeVault }),
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
    onCheckpoint: async checkpoint => {
      if (checkpoint !== 'journal-prepared') return
      const stageName = (await readdir(root)).find(name => name.startsWith('.tockteam-picker-stage-'))
      assert.ok(stageName)
      foreignStage = join(root, stageName)
      movedStage = `${foreignStage}-recorded-owner`
      await rename(foreignStage, movedStage)
      await writeFile(foreignStage, 'foreign-sentinel')
    },
  })
  await activate(owner)
  const operation = identity('journal-stage-drift')
  const selection = await grant(owner, { identity: operation, kind: 'destination', purpose: 'export-html' })
  const secret = new TextEncoder().encode('must not be written after checkpoint drift')
  const { begun, planDigest } = await lockAndBegin(owner, selection, operation, {
    entries: [{ digest: sha(secret), size: secret.length, target: { kind: 'selected-file' } }],
    purpose: 'export-html',
    totalBytes: secret.length,
  })
  await rejectsCode(owner.writeDestinationChunk({ bytes: secret, offset: 0, planDigest, session: begun.session, target: { kind: 'selected-file' } }, new AbortController().signal), 'changed')
  assert.ok(movedStage)
  assert.ok(foreignStage)
  assert.equal((await readFile(movedStage)).byteLength, 0)
  assert.equal(await readFile(foreignStage, 'utf8'), 'foreign-sentinel')
  assert.equal((await owner.abortDestination({ session: begun.session })).cleanup.status, 'residual')
  await owner.dispose()
})

test('moved destination parent reports unresolved residue instead of false scrubbed cleanup', {
  skip: process.platform === 'win32'
    ? 'Windows prevents renaming a directory that contains an open destination handle'
    : false,
}, async () => {
  const root = await canonicalTemp('tockteam-picker-moved-parent-')
  const moved = `${root}-moved`
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const output = join(root, 'output.html')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => options.purpose === 'activate'
      ? { canceled: false, filePath: activeVault }
      : { canceled: true },
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
  })
  await activate(owner)
  const operation = identity('moved-parent')
  const selection = await grant(owner, { identity: operation, kind: 'destination', purpose: 'export-html' })
  const bytes = new TextEncoder().encode('new')
  const plan = {
    entries: [{ digest: sha(bytes), size: bytes.length, target: { kind: 'selected-file' as const } }] as const,
    purpose: 'export-html' as const,
    totalBytes: bytes.length,
  }
  const planDigest = computeDesktopDestinationPlanDigest(plan)
  const locked = await owner.lockDestinationPlan({ ...plan, identity: operation, planDigest, selectionAuthorization: selection }, new AbortController().signal)
  const begun = await owner.beginDestination({ ...plan, authorization: locked.authorization, identity: operation, planDigest }, new AbortController().signal)
  await owner.writeDestinationChunk({ bytes, offset: 0, planDigest, session: begun.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  await rename(root, moved)
  await mkdir(root)
  const aborted = await owner.abortDestination({ session: begun.session })
  assert.equal(aborted.cleanup.status, 'residual')
  assert.equal(aborted.stagedBytes, bytes.length)
  const stage = (await readdir(moved)).find(name => name.startsWith('.tockteam-picker-stage-'))
  assert.ok(stage)
  assert.equal((await readFile(join(moved, stage))).byteLength, 0)
  await owner.dispose()
})

test('replaced staging leaf is preserved while retained bytes are scrubbed', async () => {
  const root = await canonicalTemp('tockteam-picker-replaced-stage-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const output = join(root, 'output.html')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => options.purpose === 'activate'
      ? { canceled: false, filePath: activeVault }
      : { canceled: true },
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
  })
  await activate(owner)
  const operation = identity('replaced-stage')
  const selection = await grant(owner, { identity: operation, kind: 'destination', purpose: 'export-html' })
  const bytes = new TextEncoder().encode('new')
  const plan = {
    entries: [{ digest: sha(bytes), size: bytes.length, target: { kind: 'selected-file' as const } }] as const,
    purpose: 'export-html' as const,
    totalBytes: bytes.length,
  }
  const planDigest = computeDesktopDestinationPlanDigest(plan)
  const locked = await owner.lockDestinationPlan({ ...plan, identity: operation, planDigest, selectionAuthorization: selection }, new AbortController().signal)
  const begun = await owner.beginDestination({ ...plan, authorization: locked.authorization, identity: operation, planDigest }, new AbortController().signal)
  await owner.writeDestinationChunk({ bytes, offset: 0, planDigest, session: begun.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  const stageName = (await readdir(root)).find(name => name.startsWith('.tockteam-picker-stage-'))
  assert.ok(stageName)
  const stage = join(root, stageName)
  const moved = `${stage}-moved`
  await rename(stage, moved)
  await writeFile(stage, 'sentinel')
  await assert.rejects(owner.dispose(), /cleanup was incomplete/)
  const aborted = await owner.abortDestination({ session: begun.session })
  assert.equal(aborted.status, 'already-closed')
  assert.equal(aborted.cleanup.status, 'residual')
  assert.equal(aborted.stagedBytes, bytes.length)
  assert.equal(await readFile(stage, 'utf8'), 'sentinel')
  assert.equal((await readFile(moved)).byteLength, 0)
})

test('finalize stage replacement scrubs confidential bytes through the retained handle', async () => {
  const root = await canonicalTemp('tockteam-picker-finalize-stage-swap-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const output = join(root, 'output.html')
  const secret = new TextEncoder().encode('finalize-race confidential bytes')
  let movedStage: string | undefined
  let replacementStage: string | undefined
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => options.purpose === 'activate'
      ? { canceled: false, filePath: activeVault }
      : { canceled: true },
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
    onCheckpoint: async checkpoint => {
      if (checkpoint !== 'finalize') return
      const stageName = (await readdir(root)).find(name => name.startsWith('.tockteam-picker-stage-'))
      assert.ok(stageName)
      replacementStage = join(root, stageName)
      movedStage = `${replacementStage}-moved`
      await rename(replacementStage, movedStage)
      await writeFile(replacementStage, 'sentinel')
    },
  })
  await activate(owner)
  const operation = identity('finalize-stage-swap')
  const selection = await grant(owner, { identity: operation, kind: 'destination', purpose: 'export-html' })
  const plan = {
    entries: [{ digest: sha(secret), size: secret.length, target: { kind: 'selected-file' as const } }] as const,
    purpose: 'export-html' as const,
    totalBytes: secret.length,
  }
  const planDigest = computeDesktopDestinationPlanDigest(plan)
  const locked = await owner.lockDestinationPlan({ ...plan, identity: operation, planDigest, selectionAuthorization: selection }, new AbortController().signal)
  const begun = await owner.beginDestination({ ...plan, authorization: locked.authorization, identity: operation, planDigest }, new AbortController().signal)
  await owner.writeDestinationChunk({ bytes: secret, offset: 0, planDigest, session: begun.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  await rejectsCode(owner.finalizeDestination({ expectedState: begun.expectedState, planDigest, session: begun.session }, new AbortController().signal), 'recovery-required')
  const closed = await owner.abortDestination({ session: begun.session })
  assert.equal(closed.status, 'already-closed')
  assert.equal(closed.cleanup.status, 'residual')
  assert.ok(movedStage)
  assert.equal((await readFile(movedStage)).byteLength, 0)
  await owner.dispose()
  assert.equal((await readFile(movedStage)).byteLength, 0)
  assert.equal(await readFile(replacementStage as string, 'utf8'), 'sentinel')
  await assert.rejects(readFile(output), { code: 'ENOENT' })
})

test('destination mismatches and TOCTOU fail closed with staging cleanup', async () => {
  const root = await canonicalTemp('tockteam-picker-destination-fail-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
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
    return await lockAndBegin(owner, authorization, operation, {
      entries: [{ digest: expectedDigest, size: content.length, target: { kind: 'selected-file' } }],
      purpose: 'export-html',
      totalBytes: content.length,
    })
  }

  const size = await begin('size')
  await owner.writeDestinationChunk({ bytes: content.subarray(0, 2), offset: 0, planDigest: size.planDigest, session: size.begun.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  await rejectsCode(owner.finalizeDestination({ expectedState: size.begun.expectedState, planDigest: size.planDigest, session: size.begun.session }, new AbortController().signal), 'size-mismatch')
  assert.equal(noStaging(await readdir(root)), false)

  const digestSession = await begin('digest', sha('different'))
  await owner.writeDestinationChunk({ bytes: content, offset: 0, planDigest: digestSession.planDigest, session: digestSession.begun.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  await rejectsCode(owner.finalizeDestination({ expectedState: digestSession.begun.expectedState, planDigest: digestSession.planDigest, session: digestSession.begun.session }, new AbortController().signal), 'digest-mismatch')
  assert.equal(noStaging(await readdir(root)), false)

  const race = await begin('race')
  await owner.writeDestinationChunk({ bytes: content, offset: 0, planDigest: race.planDigest, session: race.begun.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  await writeFile(join(root, 'race.html'), 'intruder')
  await rejectsCode(owner.finalizeDestination({ expectedState: race.begun.expectedState, planDigest: race.planDigest, session: race.begun.session }, new AbortController().signal), 'exists')
  assert.equal(await readFile(join(root, 'race.html'), 'utf8'), 'intruder')
  assert.equal(noStaging(await readdir(root)), false)
  await owner.dispose()
})

test('existing destinations are denied without snapshots, backups, or mutation', async () => {
  const root = await canonicalTemp('tockteam-picker-existing-denied-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const output = join(root, 'existing.html')
  await writeFile(output, 'original')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async () => ({ canceled: false, filePath: activeVault }),
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
  })
  await activate(owner)
  const result = await owner.pick({ identity: identity('existing-denied'), kind: 'destination', purpose: 'export-html' }, new AbortController().signal)
  assert.equal(result.status, 'denied')
  assert.equal(await readFile(output, 'utf8'), 'original')
  assert.equal((await readdir(root)).some(name => /snapshot|backup|commit/u.test(name)), false)
  await owner.dispose()
})

test('crash recovery preserves evidence and validates resolved tombstones idempotently', async () => {
  const checkpoints: DesktopPickerCheckpoint[] = ['journal-prepared', 'target-published', 'journal-published']
  for (const checkpoint of checkpoints) {
    const root = await canonicalTemp(`tockteam-picker-crash-${checkpoint}-`)
    const recoveryRoot = await canonicalTemp('tockteam-picker-recovery-index-')
    const activeVault = await canonicalTemp('tockteam-picker-active-')
    const destinationPath = join(root, 'output.html')
    const child = spawnSync(process.execPath, [
      fileURLToPath(new URL('./fixtures/desktop-picker-crash.ts', import.meta.url)),
      checkpoint,
      destinationPath,
      recoveryRoot,
      activeVault,
    ], { encoding: 'utf8', timeout: 30_000 })
    assert.equal(child.status, 77, child.stderr || child.stdout)
    const owner = new DesktopPickerOwner({
      isAvailable: () => true,
      recoveryRoot,
      showOpenDialog: async () => ({ canceled: false, filePath: activeVault }),
      showSaveDialog: async () => ({ canceled: false, filePath: join(root, 'next.html') }),
    })
    await owner.ready()
    if (checkpoint === 'journal-prepared') await assert.rejects(readFile(destinationPath), { code: 'ENOENT' })
    else assert.equal(await readFile(destinationPath, 'utf8'), 'new')
    assert.equal((await readdir(recoveryRoot)).filter(name => name.startsWith('destination-')).length, 1)
    if (checkpoint === 'journal-prepared') {
      await activate(owner)
      const operation = identity('unresolved-blocked')
      const selection = await grant(owner, { identity: operation, kind: 'destination', purpose: 'export-html' })
      const plan = { entries: [{ digest: sha('x'), size: 1, target: { kind: 'selected-file' as const } }] as const, purpose: 'export-html' as const, totalBytes: 1 }
      await rejectsCode(owner.lockDestinationPlan({ ...plan, identity: operation, planDigest: computeDesktopDestinationPlanDigest(plan), selectionAuthorization: selection }, new AbortController().signal), 'recovery-required')
    }
    await owner.dispose()
    const restarted = new DesktopPickerOwner({
      isAvailable: () => true,
      recoveryRoot,
      showOpenDialog: async () => ({ canceled: true }),
      showSaveDialog: async () => ({ canceled: true }),
    })
    await restarted.ready()
    await restarted.dispose()
  }
})

test('valid resolved scrubbed tombstone is read-only validated and nonblocking', async () => {
  const root = await canonicalTemp('tockteam-picker-scrubbed-restart-')
  const recoveryRoot = await canonicalTemp('tockteam-picker-scrubbed-index-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const outputs = [join(root, 'aborted.html'), join(root, 'next.html')]
  const options = {
    isAvailable: () => true,
    recoveryRoot,
    showOpenDialog: async () => ({ canceled: false, filePath: activeVault }),
    showSaveDialog: async () => ({ canceled: false, filePath: outputs[0] as string }),
  }
  const owner = new DesktopPickerOwner(options)
  await activate(owner)
  const operation = identity('scrubbed-create')
  const selection = await grant(owner, { identity: operation, kind: 'destination', purpose: 'export-html' })
  const bytes = new TextEncoder().encode('abort me')
  const { begun, planDigest } = await lockAndBegin(owner, selection, operation, {
    entries: [{ digest: sha(bytes), size: bytes.length, target: { kind: 'selected-file' } }],
    purpose: 'export-html',
    totalBytes: bytes.length,
  })
  await owner.writeDestinationChunk({ bytes, offset: 0, planDigest, session: begun.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  assert.equal((await owner.abortDestination({ session: begun.session })).cleanup.status, 'scrubbed')
  await owner.dispose()
  outputs.shift()
  const restarted = new DesktopPickerOwner(options)
  await restarted.ready()
  await activate(restarted)
  const nextOperation = identity('scrubbed-next')
  const nextSelection = await grant(restarted, { identity: nextOperation, kind: 'destination', purpose: 'export-html' })
  const plan = { entries: [{ digest: sha('x'), size: 1, target: { kind: 'selected-file' as const } }] as const, purpose: 'export-html' as const, totalBytes: 1 }
  const locked = await restarted.lockDestinationPlan({ ...plan, identity: nextOperation, planDigest: computeDesktopDestinationPlanDigest(plan), selectionAuthorization: nextSelection }, new AbortController().signal)
  await restarted.revokeDestinationPlan({ authorization: locked.authorization })
  await restarted.dispose()
})

test('valid retained tombstone is nonblocking before later mismatch and manual removal', async () => {
  const root = await canonicalTemp('tockteam-picker-retained-restart-')
  const recoveryRoot = await canonicalTemp('tockteam-picker-retained-index-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const output = join(root, 'output.html')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    recoveryRoot,
    showOpenDialog: async () => ({ canceled: false, filePath: activeVault }),
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
  })
  await activate(owner)
  const operation = identity('retained-restart')
  const authorization = await grant(owner, { identity: operation, kind: 'destination', purpose: 'export-html' })
  const bytes = new TextEncoder().encode('published')
  const { begun, planDigest } = await lockAndBegin(owner, authorization, operation, {
    entries: [{ digest: sha(bytes), size: bytes.length, target: { kind: 'selected-file' } }],
    purpose: 'export-html',
    totalBytes: bytes.length,
  })
  await owner.writeDestinationChunk({ bytes, offset: 0, planDigest, session: begun.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  const published = await owner.finalizeDestination({ expectedState: begun.expectedState, planDigest, session: begun.session }, new AbortController().signal)
  assert.equal(published.status, 'published')
  if (published.status === 'published') assert.equal(published.cleanup.status, 'retained')
  await owner.dispose()
  const validRestart = new DesktopPickerOwner({
    isAvailable: () => true,
    recoveryRoot,
    showOpenDialog: async () => ({ canceled: false, filePath: activeVault }),
    showSaveDialog: async () => ({ canceled: false, filePath: join(root, 'next.html') }),
  })
  await validRestart.ready()
  await activate(validRestart)
  const nextOperation = identity('retained-next')
  const nextSelection = await grant(validRestart, { identity: nextOperation, kind: 'destination', purpose: 'export-html' })
  const nextPlan = { entries: [{ digest: sha('x'), size: 1, target: { kind: 'selected-file' as const } }] as const, purpose: 'export-html' as const, totalBytes: 1 }
  const nextLocked = await validRestart.lockDestinationPlan({ ...nextPlan, identity: nextOperation, planDigest: computeDesktopDestinationPlanDigest(nextPlan), selectionAuthorization: nextSelection }, new AbortController().signal)
  await validRestart.revokeDestinationPlan({ authorization: nextLocked.authorization })
  await validRestart.dispose()
  const stageName = (await readdir(root)).find(name => name.startsWith('.tockteam-picker-stage-'))
  assert.ok(stageName)
  await writeFile(output, 'edited-after-publication')
  const journalName = (await readdir(recoveryRoot)).find(name => name.startsWith('destination-'))
  assert.ok(journalName)
  const restarted = new DesktopPickerOwner({ isAvailable: () => true, recoveryRoot, showOpenDialog: async () => ({ canceled: true }), showSaveDialog: async () => ({ canceled: true }) })
  await restarted.ready()
  await restarted.dispose()
  await unlink(join(root, stageName))
  const manualOptions = {
    isAvailable: () => true,
    recoveryRoot,
    showOpenDialog: async () => ({ canceled: false, filePath: activeVault }),
    showSaveDialog: async () => ({ canceled: false, filePath: join(root, 'manual-next.html') }),
  }
  const aliasRemoved = new DesktopPickerOwner(manualOptions)
  await aliasRemoved.ready()
  await activate(aliasRemoved)
  const blockedOperation = identity('alias-first-blocked')
  const blockedSelection = await grant(aliasRemoved, { identity: blockedOperation, kind: 'destination', purpose: 'export-html' })
  const blockedPlan = { entries: [{ digest: sha('x'), size: 1, target: { kind: 'selected-file' as const } }] as const, purpose: 'export-html' as const, totalBytes: 1 }
  await rejectsCode(aliasRemoved.lockDestinationPlan({ ...blockedPlan, identity: blockedOperation, planDigest: computeDesktopDestinationPlanDigest(blockedPlan), selectionAuthorization: blockedSelection }, new AbortController().signal), 'recovery-required')
  await aliasRemoved.dispose()
  await unlink(join(recoveryRoot, journalName))
  const tombstoneRemoved = new DesktopPickerOwner(manualOptions)
  await tombstoneRemoved.ready()
  await activate(tombstoneRemoved)
  const clearedOperation = identity('manual-cleared')
  const clearedSelection = await grant(tombstoneRemoved, { identity: clearedOperation, kind: 'destination', purpose: 'export-html' })
  const cleared = await tombstoneRemoved.lockDestinationPlan({ ...blockedPlan, identity: clearedOperation, planDigest: computeDesktopDestinationPlanDigest(blockedPlan), selectionAuthorization: clearedSelection }, new AbortController().signal)
  await tombstoneRemoved.revokeDestinationPlan({ authorization: cleared.authorization })
  await tombstoneRemoved.dispose()
  assert.deepEqual(await readdir(recoveryRoot), [])
})

test('recovery cap fails closed until reviewed manual tombstone removal and restart', async () => {
  const root = await canonicalTemp('tockteam-picker-cap-root-')
  const recoveryRoot = await canonicalTemp('tockteam-picker-cap-index-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const parentStat = await lstat(root)
  const record = (index: number) => JSON.stringify({
    destinationIdentity: null,
    destinationPath: join(root, `old-${index}.html`),
    newDigest: sha(''),
    newSize: 0,
    parentIdentity: `${String(parentStat.dev)}:${String(parentStat.ino)}`,
    residues: [],
    resolution: 'scrubbed',
    version: 2,
  })
  await Promise.all(Array.from({ length: 1024 }, (_, index) => writeFile(
    join(recoveryRoot, `destination-${String(index).padStart(4, '0')}.json`),
    record(index),
    { mode: 0o600 },
  )))
  const output = join(root, 'next.html')
  const makeOwner = () => new DesktopPickerOwner({
    isAvailable: () => true,
    recoveryRoot,
    showOpenDialog: async () => ({ canceled: false, filePath: activeVault }),
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
  })
  const capped = makeOwner()
  await capped.ready()
  await activate(capped)
  const operation = identity('cap-blocked')
  const selection = await grant(capped, { identity: operation, kind: 'destination', purpose: 'export-html' })
  const plan = { entries: [{ digest: sha('x'), size: 1, target: { kind: 'selected-file' as const } }] as const, purpose: 'export-html' as const, totalBytes: 1 }
  await rejectsCode(capped.lockDestinationPlan({ ...plan, identity: operation, planDigest: computeDesktopDestinationPlanDigest(plan), selectionAuthorization: selection }, new AbortController().signal), 'recovery-required')
  await capped.dispose()
  await Promise.all((await readdir(recoveryRoot)).map(name => unlink(join(recoveryRoot, name))))
  const recovered = makeOwner()
  await recovered.ready()
  await activate(recovered)
  const nextOperation = identity('cap-recovered')
  const nextSelection = await grant(recovered, { identity: nextOperation, kind: 'destination', purpose: 'export-html' })
  const locked = await recovered.lockDestinationPlan({ ...plan, identity: nextOperation, planDigest: computeDesktopDestinationPlanDigest(plan), selectionAuthorization: nextSelection }, new AbortController().signal)
  assert.equal(locked.expectedState.status, 'absent')
  await recovered.revokeDestinationPlan({ authorization: locked.authorization })
  await recovered.dispose()
})

test('forged resolved startup journal cannot hide unresolved plaintext', async () => {
  const root = await canonicalTemp('tockteam-picker-forged-resolved-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const recoveryRoot = await canonicalTemp('tockteam-picker-recovery-index-')
  const output = join(root, 'next.html')
  const stagePath = join(root, '.tockteam-picker-stage-orphan')
  const secret = Buffer.from('unresolved plaintext hidden by forged resolved record')
  await writeFile(stagePath, secret, { mode: 0o600 })
  const parentStat = await lstat(root)
  await writeFile(join(recoveryRoot, 'destination-forged-resolved.json'), JSON.stringify({
    destinationIdentity: null,
    destinationPath: output,
    newDigest: sha(''),
    newSize: 0,
    parentIdentity: `${String(parentStat.dev)}:${String(parentStat.ino)}`,
    residues: [],
    resolution: 'scrubbed',
    version: 2,
  }), { mode: 0o600 })
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    recoveryRoot,
    showOpenDialog: async () => ({ canceled: false, filePath: activeVault }),
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
  })
  await owner.ready()
  await activate(owner)
  const operation = identity('forged-resolved')
  const selection = await grant(owner, { identity: operation, kind: 'destination', purpose: 'export-html' })
  const plan = { entries: [{ digest: sha('x'), size: 1, target: { kind: 'selected-file' as const } }] as const, purpose: 'export-html' as const, totalBytes: 1 }
  await rejectsCode(owner.lockDestinationPlan({ ...plan, identity: operation, planDigest: computeDesktopDestinationPlanDigest(plan), selectionAuthorization: selection }, new AbortController().signal), 'recovery-required')
  assert.deepEqual(await readFile(stagePath), secret)
  await owner.dispose()
})

test('corrupted recovery index fails all destination locks closed without filesystem effects', async () => {
  const root = await canonicalTemp('tockteam-picker-recovery-corrupt-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const recoveryRoot = await canonicalTemp('tockteam-picker-recovery-index-')
  await writeFile(join(recoveryRoot, 'destination-corrupt.json'), '{"version":1,"destinationPath":"/escape"}', { mode: 0o600 })
  const output = join(root, 'next.html')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    recoveryRoot,
    showOpenDialog: async options => options.purpose === 'activate'
      ? { canceled: false, filePath: activeVault }
      : { canceled: true },
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
  })
  await owner.ready()
  await activate(owner)
  const operation = identity('corrupt-recovery')
  const selection = await grant(owner, { identity: operation, kind: 'destination', purpose: 'export-html' })
  const bytes = new TextEncoder().encode('next')
  const plan = {
    entries: [{ digest: sha(bytes), size: bytes.length, target: { kind: 'selected-file' as const } }] as const,
    purpose: 'export-html' as const,
    totalBytes: bytes.length,
  }
  await rejectsCode(owner.lockDestinationPlan({
    ...plan,
    identity: operation,
    planDigest: computeDesktopDestinationPlanDigest(plan),
    selectionAuthorization: selection,
  }, new AbortController().signal), 'recovery-required')
  await assert.rejects(readFile(output), { code: 'ENOENT' })
  await owner.dispose()
})

test('destination plan authorization rotates once, revokes idempotently, and tombstones drift', async () => {
  const root = await canonicalTemp('tockteam-picker-plan-lock-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const paths = ['revoke.html', 'drift.html'].map(name => join(root, name))
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
  const content = new TextEncoder().encode('plan')
  const plan = {
    entries: [{ digest: sha(content), size: content.length, target: { kind: 'selected-file' as const } }] as const,
    purpose: 'export-html' as const,
    totalBytes: content.length,
  }
  const planDigest = computeDesktopDestinationPlanDigest(plan)

  const revokeIdentity = identity('plan-revoke')
  const selection = await grant(owner, { identity: revokeIdentity, kind: 'destination', purpose: 'export-html' })
  const locked = await owner.lockDestinationPlan({ ...plan, identity: revokeIdentity, planDigest, selectionAuthorization: selection }, new AbortController().signal)
  await rejectsCode(owner.lockDestinationPlan({ ...plan, identity: revokeIdentity, planDigest, selectionAuthorization: selection }, new AbortController().signal), 'replayed')
  assert.deepEqual(await owner.revokeDestinationPlan({ authorization: locked.authorization }), { status: 'revoked' })
  assert.deepEqual(await owner.revokeDestinationPlan({ authorization: locked.authorization }), { status: 'already-closed' })
  await rejectsCode(owner.beginDestination({ ...plan, authorization: locked.authorization, identity: revokeIdentity, planDigest }, new AbortController().signal), 'replayed')

  const driftIdentity = identity('plan-drift')
  const driftSelection = await grant(owner, { identity: driftIdentity, kind: 'destination', purpose: 'export-html' })
  const driftLocked = await owner.lockDestinationPlan({ ...plan, identity: driftIdentity, planDigest, selectionAuthorization: driftSelection }, new AbortController().signal)
  const begun = await owner.beginDestination({ ...plan, authorization: driftLocked.authorization, identity: driftIdentity, planDigest }, new AbortController().signal)
  await rejectsCode(owner.writeDestinationChunk({
    bytes: content,
    offset: 0,
    planDigest: sha('wrong-plan'),
    session: begun.session,
    target: { kind: 'selected-file' },
  }, new AbortController().signal), 'digest-mismatch')
  const tombstone = await owner.abortDestination({ session: begun.session })
  assert.equal(tombstone.status, 'already-closed')
  assert.equal(tombstone.cleanup.status, 'complete')
  await owner.dispose()
})

test('vault backup publishes one opaque selected-file archive', async () => {
  const root = await canonicalTemp('tockteam-picker-backup-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const output = join(root, 'vault-backup')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async () => ({ canceled: false, filePath: activeVault }),
    showSaveDialog: async () => ({ canceled: false, filePath: output }),
  })
  await activate(owner)
  const operation = identity('vault-backup')
  const authorization = await grant(owner, { identity: operation, kind: 'destination', purpose: 'vault-backup' })
  const archive = new TextEncoder().encode('opaque archive bytes')
  const { begun, planDigest } = await lockAndBegin(owner, authorization, operation, {
    entries: [{ digest: sha(archive), size: archive.length, target: { kind: 'selected-file' } }],
    purpose: 'vault-backup',
    totalBytes: archive.length,
  })
  await owner.writeDestinationChunk({ bytes: archive, offset: 0, planDigest, session: begun.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  const finalized = await owner.finalizeDestination({ expectedState: begun.expectedState, planDigest, session: begun.session }, new AbortController().signal)
  assert.equal(finalized.status, 'published')
  assert.deepEqual(await readFile(output), Buffer.from(archive))
  assert.equal(noStaging(await readdir(root)), false)
  await owner.dispose()
})

test('root caps, purpose filters, trust revocation, and active-vault overlap fail closed', async () => {
  const root = await canonicalTemp('tockteam-picker-policy-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const oversized = join(root, 'oversized.zip')
  const wrongCsv = join(root, 'wrong.txt')
  const restoreFile = join(root, 'restore.zip')
  await writeFile(oversized, 'ninebytes')
  await writeFile(wrongCsv, 'csv')
  await writeFile(restoreFile, 'restore')
  let available = true
  let restoreDialog: DesktopPickerDialogOptions | undefined
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
      if (options.purpose === 'restore-backup') restoreDialog = options
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
  const restoreIdentity = identity('restore-file')
  const restore = await owner.pick({ identity: restoreIdentity, kind: 'source', purpose: 'restore-backup' }, new AbortController().signal)
  assert.equal(restore.status, 'selected')
  assert.deepEqual(restoreDialog, {
    directory: false,
    extensions: ['zip'],
    file: true,
    kind: 'open',
    purpose: 'restore-backup',
  })
  if (restore.status === 'selected') {
    const source = await owner.beginSource({
      authorization: restore.authorization,
      identity: restoreIdentity,
      limits,
      purpose: 'restore-backup',
    }, new AbortController().signal)
    assert.equal(source.root.kind, 'file')
    assert.equal((await owner.releaseSource({ session: source.session })).status, 'released')
  }

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
  const root = await canonicalTemp('tockteam-picker-abort-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
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
  const destination = await lockAndBegin(owner, authorization, destinationIdentity, {
    entries: [{ digest: sha(content), size: content.length, target: { kind: 'selected-file' } }],
    purpose: 'export-html',
    totalBytes: content.length,
  })
  const begunDestination = destination.begun
  checkpoint = 'write'
  controller = new AbortController()
  await rejectsCode(owner.writeDestinationChunk({ bytes: content, offset: 0, planDigest: destination.planDigest, session: begunDestination.session, target: { kind: 'selected-file' } }, controller.signal), 'aborted')
  assert.equal((await owner.abortDestination({ session: begunDestination.session })).status, 'already-closed')
  assert.equal((await owner.abortDestination({ session: begunDestination.session })).status, 'already-closed')
  assert.equal(noStaging(await readdir(root)), true)

  checkpoint = undefined
  const disposeIdentity = identity('dispose-destination')
  const disposeAuthorization = await grant(owner, { identity: disposeIdentity, kind: 'destination', purpose: 'export-html' })
  const disposeDestination = await lockAndBegin(owner, disposeAuthorization, disposeIdentity, {
    entries: [{ digest: sha(content), size: content.length, target: { kind: 'selected-file' } }],
    purpose: 'export-html',
    totalBytes: content.length,
  })
  const disposable = disposeDestination.begun
  await owner.writeDestinationChunk({ bytes: content, offset: 0, planDigest: disposeDestination.planDigest, session: disposable.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  await owner.dispose()
  assert.equal(noStaging(await readdir(root)), false)
  await rejectsCode(owner.listSource({ limit: 1, session: begunSource.session }, new AbortController().signal), 'closed')
  assert.equal((await owner.abortDestination({ session: disposable.session })).status, 'already-closed')
})
