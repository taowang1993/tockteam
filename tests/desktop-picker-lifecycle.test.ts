import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { link, lstat, mkdir, mkdtemp, readFile, readdir, rename, symlink, writeFile, realpath } from 'node:fs/promises'
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
  computeDesktopDestinationPlanDigest,
  type BeginDesktopDestinationResult,
  type DesktopDestinationPlan,
  type DesktopGrantErrorCode,
  type DesktopPickerAuthorization,
  type DesktopSha256,
  type NativeOperationIdentity,
} from '../src/host-contract.ts'
import { DesktopPickerOwner, type DesktopPickerCheckpoint } from '../src/desktop-picker-owner.ts'

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

function artifactIdentity(stat: Awaited<ReturnType<typeof lstat>>): string {
  return createHash('sha256').update([
    String(stat.dev), String(stat.ino), String(stat.size), String(stat.mode), String(stat.birthtimeMs),
  ].join(':')).digest('hex')
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

test('moved destination parent reports residual staging instead of false complete cleanup', async () => {
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
  assert.equal((await readFile(join(moved, stage, 'selected-file'))).byteLength, 0)
  await owner.dispose()
})

test('replaced staging directory is never recursively removed and retained bytes are scrubbed', async () => {
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
  await mkdir(stage)
  await writeFile(join(stage, 'sentinel'), 'keep')
  await assert.rejects(owner.dispose(), /cleanup was incomplete/)
  const aborted = await owner.abortDestination({ session: begun.session })
  assert.equal(aborted.status, 'already-closed')
  assert.equal(aborted.cleanup.status, 'residual')
  assert.equal(aborted.stagedBytes, bytes.length)
  assert.equal(await readFile(join(stage, 'sentinel'), 'utf8'), 'keep')
  assert.equal((await readFile(join(moved, 'selected-file'))).byteLength, 0)
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
      await mkdir(replacementStage)
      await writeFile(join(replacementStage, 'sentinel'), 'keep')
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
  await rejectsCode(owner.finalizeDestination({ expectedState: begun.expectedState, planDigest, session: begun.session }, new AbortController().signal), 'unsafe-target')
  const closed = await owner.abortDestination({ session: begun.session })
  assert.equal(closed.status, 'already-closed')
  assert.equal(closed.cleanup.status, 'residual')
  assert.ok(movedStage)
  assert.equal((await readFile(join(movedStage, 'selected-file'))).byteLength, 0)
  await owner.dispose()
  assert.equal((await readFile(join(movedStage, 'selected-file'))).byteLength, 0)
  assert.equal(await readFile(join(replacementStage as string, 'sentinel'), 'utf8'), 'keep')
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
  await rejectsCode(owner.finalizeDestination({ expectedState: race.begun.expectedState, planDigest: race.planDigest, session: race.begun.session }, new AbortController().signal), 'changed')
  assert.equal(await readFile(join(root, 'race.html'), 'utf8'), 'intruder')
  assert.equal(noStaging(await readdir(root)), false)
  await owner.dispose()
})

test('reviewed existing-file snapshots reject swaps and replace only the verified inode', async () => {
  const root = await canonicalTemp('tockteam-picker-replace-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const beforeBegin = join(root, 'before-begin.html')
  const beforeCommit = join(root, 'before-commit.html')
  const normal = join(root, 'normal.html')
  await Promise.all([beforeBegin, beforeCommit, normal].map(path => writeFile(path, 'old')))
  const paths = [beforeBegin, beforeCommit, normal]
  let swapAtFinalize: string | undefined
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => options.purpose === 'activate'
      ? { canceled: false, filePath: activeVault }
      : { canceled: true },
    showSaveDialog: async () => {
      const filePath = paths.shift()
      return filePath === undefined ? { canceled: true } : { canceled: false, filePath }
    },
    onCheckpoint: async checkpoint => {
      if (checkpoint === 'finalize' && swapAtFinalize !== undefined) {
        await writeFile(swapAtFinalize, 'racer')
        swapAtFinalize = undefined
      }
    },
  })
  await activate(owner)
  const bytes = new TextEncoder().encode('new')
  const plan = {
    entries: [{ digest: sha(bytes), size: bytes.length, target: { kind: 'selected-file' as const } }] as const,
    purpose: 'export-html' as const,
    totalBytes: bytes.length,
  }
  const planDigest = computeDesktopDestinationPlanDigest(plan)

  const lockOnly = async (name: string) => {
    const operation = identity(name)
    const selection = await grant(owner, { identity: operation, kind: 'destination', purpose: 'export-html' })
    const locked = await owner.lockDestinationPlan({ ...plan, identity: operation, planDigest, selectionAuthorization: selection }, new AbortController().signal)
    return { locked, operation }
  }

  const first = await lockOnly('replace-before-begin')
  await writeFile(beforeBegin, 'changed-before-begin')
  await rejectsCode(owner.beginDestination({ ...plan, authorization: first.locked.authorization, identity: first.operation, planDigest }, new AbortController().signal), 'recovery-required')
  assert.equal(await readFile(beforeBegin, 'utf8'), 'changed-before-begin')

  const second = await lockOnly('replace-before-commit')
  const secondSession = await owner.beginDestination({ ...plan, authorization: second.locked.authorization, identity: second.operation, planDigest }, new AbortController().signal)
  await owner.writeDestinationChunk({ bytes, offset: 0, planDigest, session: secondSession.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  swapAtFinalize = beforeCommit
  await rejectsCode(owner.finalizeDestination({ expectedState: secondSession.expectedState, planDigest, session: secondSession.session }, new AbortController().signal), 'changed')
  assert.equal(await readFile(beforeCommit, 'utf8'), 'racer')

  const third = await lockOnly('replace-normal')
  const thirdSession = await owner.beginDestination({ ...plan, authorization: third.locked.authorization, identity: third.operation, planDigest }, new AbortController().signal)
  await owner.writeDestinationChunk({ bytes, offset: 0, planDigest, session: thirdSession.session, target: { kind: 'selected-file' } }, new AbortController().signal)
  assert.equal((await owner.finalizeDestination({ expectedState: thirdSession.expectedState, planDigest, session: thirdSession.session }, new AbortController().signal)).status, 'published')
  assert.equal(await readFile(normal, 'utf8'), 'new')
  const retainedArtifacts = (await readdir(root)).filter(name => name.startsWith('.tockteam-picker-'))
  assert.ok(retainedArtifacts.length > 0)
  for (const name of retainedArtifacts.filter(name => name.includes('-backup-') || name.includes('-snapshot-'))) {
    assert.equal((await readFile(join(root, name))).byteLength, 0)
  }
  await assert.rejects(owner.dispose(), /recovery|cleanup/i)
})

test('subprocess crashes at every replacement boundary recover to old or new, never absent', async () => {
  const checkpoints: DesktopPickerCheckpoint[] = [
    'journal-prepared',
    'backup-moved',
    'backup-verified',
    'target-published',
    'journal-published',
    'backup-removed',
    'journal-removed',
  ]
  for (const checkpoint of checkpoints) {
    const root = await canonicalTemp(`tockteam-picker-crash-${checkpoint}-`)
    const recoveryRoot = await canonicalTemp('tockteam-picker-recovery-index-')
    const activeVault = await canonicalTemp('tockteam-picker-active-')
    const destinationPath = join(root, 'output.html')
    await writeFile(destinationPath, 'old')
    const child = spawnSync(process.execPath, [
      new URL('./fixtures/desktop-picker-crash.ts', import.meta.url).pathname,
      checkpoint,
      destinationPath,
      recoveryRoot,
      activeVault,
    ], { encoding: 'utf8', timeout: 30_000 })
    assert.equal(child.status, 77, child.stderr || child.stdout)
    const owner = new DesktopPickerOwner({
      isAvailable: () => true,
      recoveryRoot,
      showOpenDialog: async () => ({ canceled: true }),
      showSaveDialog: async () => ({ canceled: true }),
    })
    await owner.ready()
    const content = await readFile(destinationPath, 'utf8')
    assert.ok(content === 'old' || content === 'new', `${checkpoint}: ${content}`)
    const journals = (await readdir(recoveryRoot)).filter(name => name.startsWith('destination-')).length
    assert.ok(journals >= 1 && journals <= 5, `${checkpoint}: ${journals}`)
    await owner.dispose()
  }
})

test('startup recovery index restores a moved target without another plan lock', async () => {
  const root = await canonicalTemp('tockteam-picker-recovery-')
  const recoveryRoot = await canonicalTemp('tockteam-picker-recovery-index-')
  const destinationPath = join(root, 'crashed.html')
  const backupPath = join(root, '.tockteam-picker-backup-crash')
  const commitPath = join(root, '.tockteam-picker-commit-crash')
  const snapshotPath = join(root, '.tockteam-picker-snapshot-crash')
  const journalPath = join(recoveryRoot, 'destination-crash.json')
  await writeFile(backupPath, 'old')
  await writeFile(commitPath, 'new')
  await writeFile(snapshotPath, 'old')
  const backupStat = await lstat(backupPath)
  const commitStat = await lstat(commitPath)
  const snapshotStat = await lstat(snapshotPath)
  const parentStat = await lstat(root)
  await writeFile(journalPath, JSON.stringify({
    backupIdentity: artifactIdentity(backupStat),
    backupPath,
    commitIdentity: artifactIdentity(commitStat),
    commitPath,
    destinationPath,
    newDigest: sha('new'),
    newIdentity: artifactIdentity(commitStat),
    newSize: 3,
    oldDigest: sha('old'),
    oldIdentity: `${String(backupStat.dev)}:${String(backupStat.ino)}`,
    oldSize: 3,
    parentIdentity: `${String(parentStat.dev)}:${String(parentStat.ino)}`,
    snapshotIdentity: artifactIdentity(snapshotStat),
    snapshotPath,
    state: 'moved',
    version: 1,
  }), { mode: 0o600 })
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    recoveryRoot,
    showOpenDialog: async () => ({ canceled: true }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  await owner.ready()
  assert.equal(await readFile(destinationPath, 'utf8'), 'old')
  assert.equal(await readFile(backupPath, 'utf8'), 'old')
  for (const path of [commitPath, snapshotPath]) assert.equal((await readFile(path)).byteLength, 0)
  assert.deepEqual(await readdir(recoveryRoot), ['destination-crash.json'])
  await owner.dispose()
})

test('published journal with a missing target restores the exact reviewed backup', async () => {
  const root = await canonicalTemp('tockteam-picker-recovery-published-')
  const recoveryRoot = await canonicalTemp('tockteam-picker-recovery-index-')
  const destinationPath = join(root, 'published.html')
  const backupPath = join(root, '.tockteam-picker-backup-published')
  const snapshotPath = join(root, '.tockteam-picker-snapshot-published')
  const old = 'reviewed-old'
  const next = 'reviewed-new'
  await writeFile(backupPath, old)
  await writeFile(snapshotPath, old)
  const backupStat = await lstat(backupPath)
  const snapshotStat = await lstat(snapshotPath)
  const parentStat = await lstat(root)
  await writeFile(join(recoveryRoot, 'destination-published.json'), JSON.stringify({
    backupIdentity: artifactIdentity(backupStat),
    backupPath,
    commitIdentity: null,
    commitPath: null,
    destinationPath,
    newDigest: sha(next),
    newIdentity: null,
    newSize: next.length,
    oldDigest: sha(old),
    oldIdentity: `${String(backupStat.dev)}:${String(backupStat.ino)}`,
    oldSize: old.length,
    parentIdentity: `${String(parentStat.dev)}:${String(parentStat.ino)}`,
    snapshotIdentity: artifactIdentity(snapshotStat),
    snapshotPath,
    state: 'published',
    version: 1,
  }), { mode: 0o600 })
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    recoveryRoot,
    showOpenDialog: async () => ({ canceled: true }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  await owner.ready()
  assert.equal(await readFile(destinationPath, 'utf8'), old)
  assert.equal((await readdir(recoveryRoot)).filter(name => name.startsWith('destination-')).length, 1)
  assert.equal(await readFile(backupPath, 'utf8'), old)
  assert.equal((await readFile(snapshotPath)).byteLength, 0)
  await owner.dispose()
})

test('startup recovery never overwrites an unknown occupied target and blocks the destination parent', async () => {
  const root = await canonicalTemp('tockteam-picker-recovery-blocked-')
  const activeVault = await canonicalTemp('tockteam-picker-active-')
  const recoveryRoot = await canonicalTemp('tockteam-picker-recovery-index-')
  const destinationPath = join(root, 'occupied.html')
  const backupPath = join(root, '.tockteam-picker-backup-occupied')
  const commitPath = join(root, '.tockteam-picker-commit-occupied')
  const snapshotPath = join(root, '.tockteam-picker-snapshot-occupied')
  await writeFile(destinationPath, 'unknown-racer')
  await writeFile(backupPath, 'reviewed-old')
  await writeFile(commitPath, 'reviewed-new')
  await writeFile(snapshotPath, 'reviewed-old')
  const backupStat = await lstat(backupPath)
  const commitStat = await lstat(commitPath)
  const snapshotStat = await lstat(snapshotPath)
  const parentStat = await lstat(root)
  await writeFile(join(recoveryRoot, 'destination-occupied.json'), JSON.stringify({
    backupIdentity: artifactIdentity(backupStat),
    backupPath,
    commitIdentity: artifactIdentity(commitStat),
    commitPath,
    destinationPath,
    newDigest: sha('reviewed-new'),
    newIdentity: artifactIdentity(commitStat),
    newSize: 'reviewed-new'.length,
    oldDigest: sha('reviewed-old'),
    oldIdentity: `${String(backupStat.dev)}:${String(backupStat.ino)}`,
    oldSize: 'reviewed-old'.length,
    parentIdentity: `${String(parentStat.dev)}:${String(parentStat.ino)}`,
    snapshotIdentity: artifactIdentity(snapshotStat),
    snapshotPath,
    state: 'moved',
    version: 1,
  }), { mode: 0o600 })
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    recoveryRoot,
    showOpenDialog: async options => options.purpose === 'activate'
      ? { canceled: false, filePath: activeVault }
      : { canceled: true },
    showSaveDialog: async () => ({ canceled: false, filePath: join(root, 'next.html') }),
  })
  await owner.ready()
  assert.equal(await readFile(destinationPath, 'utf8'), 'unknown-racer')
  assert.equal(await readFile(backupPath, 'utf8'), 'reviewed-old')
  await activate(owner)
  const operation = identity('blocked-recovery')
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
  assert.equal(noStaging(await readdir(root)), false)

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
  await assert.rejects(owner.dispose(), /cleanup was incomplete/)
  assert.equal(noStaging(await readdir(root)), false)
  await rejectsCode(owner.listSource({ limit: 1, session: begunSource.session }, new AbortController().signal), 'closed')
  assert.equal((await owner.abortDestination({ session: disposable.session })).status, 'already-closed')
})
