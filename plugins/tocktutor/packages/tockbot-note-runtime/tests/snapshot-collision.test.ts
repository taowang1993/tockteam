import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs, { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { type TestContext } from 'node:test'
import type { NoteVaultRuntime as Runtime, VaultReference } from '../src/index.ts'
const { Context } = await import(process.env.TOCKTUTOR_CORDIS_ENTRY ?? '@deepseek-ai/cordis') as typeof import('@deepseek-ai/cordis')
const { default: NoteVaultRuntime, Config, NoteVaultError } = await import(process.env.TOCKTUTOR_RUNTIME_ENTRY ?? '../src/index.ts') as typeof import('../src/index.ts')

async function withRuntime(t: TestContext, check: (fixture: {
  runtime: Runtime
  signal: AbortSignal
  stateRoot: string
  vault: VaultReference
  vaultRoot: string
}) => Promise<void>): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'note-snapshot-collision-'))
  const vaultRoot = join(temporaryRoot, 'vault')
  const stateRoot = join(temporaryRoot, 'state')
  await mkdir(vaultRoot)
  const context = new Context()
  const idleIndex = { search: async () => null, invalidate() {}, close: async () => {} }
  t.mock.method(NoteVaultRuntime.prototype as unknown as { createSearchIndex(): typeof idleIndex }, 'createSearchIndex', () => idleIndex)
  try {
    await context.plugin(NoteVaultRuntime, { ...Config(), vaultRoot, stateRoot })
    const runtime = context.noteVault
    const vault = runtime.state
    assert.ok(vault.active)
    await check({ runtime, signal: new AbortController().signal, stateRoot, vault, vaultRoot })
  } finally {
    t.mock.restoreAll()
    syncBuiltinESMExports()
    await context.fiber.dispose()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

function collideSnapshotNames(t: TestContext): void {
  const now = Date.now()
  const randomUUID = crypto.randomUUID
  t.mock.method(Date, 'now', () => now)
  // Keep temporary filenames independent while reproducing the snapshot's eight-character collision.
  t.mock.method(crypto, 'randomUUID', () => `12345678${randomUUID().slice(8)}`)
  syncBuiltinESMExports()
}

test('a snapshot filename collision preserves the existing recovery copy', async t => {
  await withRuntime(t, async ({ runtime, vault, signal, stateRoot }) => {
    collideSnapshotNames(t)
    const request = { expectedVault: vault, path: 'Note.md' }
    const first = await runtime.captureSnapshot({ ...request, content: 'Original recovery copy' }, signal)
    assert.ok(first.snapshot)
    await assert.rejects(runtime.captureSnapshot({ ...request, content: 'Different recovery copy' }, signal),
      error => error instanceof NoteVaultError && error.code === 'recovery-unavailable')
    const retained = await runtime.readSnapshot({ ...request, snapshotId: first.snapshot.id }, signal)
    assert.equal(retained.content, 'Original recovery copy')
    assert.deepEqual((await runtime.listSnapshots(request, signal)).snapshots.map(snapshot => snapshot.id), [first.snapshot.id])
    assert.deepEqual((await readdir(stateRoot, { recursive: true })).filter(name => name.endsWith('.tmp')), [])
  })
})

test('a metadata collision preserves the existing metadata and removes only the new body', async t => {
  await withRuntime(t, async ({ runtime, vault, signal, stateRoot }) => {
    collideSnapshotNames(t)
    const request = { expectedVault: vault, path: 'Note.md' }
    const first = await runtime.captureSnapshot({ ...request, content: 'Earlier recovery copy' }, signal)
    assert.ok(first.snapshot)
    const files = await readdir(stateRoot, { recursive: true })
    const body = files.find(name => name.endsWith(`${first.snapshot!.id}.body`))
    const metadata = files.find(name => name.endsWith(`${first.snapshot!.id}.json`))
    assert.ok(body)
    assert.ok(metadata)
    const originalMetadata = await readFile(join(stateRoot, metadata))
    await rm(join(stateRoot, body))
    await assert.rejects(runtime.captureSnapshot({ ...request, content: 'New recovery copy' }, signal),
      error => error instanceof NoteVaultError && error.code === 'recovery-unavailable')
    assert.deepEqual(await readFile(join(stateRoot, metadata)), originalMetadata)
    await assert.rejects(readFile(join(stateRoot, body)), { code: 'ENOENT' })
    assert.deepEqual((await readdir(stateRoot, { recursive: true })).filter(name => name.endsWith('.tmp')), [])
  })
})

test('a failed metadata publication removes the newly created recovery body', async t => {
  await withRuntime(t, async ({ runtime, vault, signal, stateRoot }) => {
    const nativeLink = fs.link
    t.mock.method(fs, 'link', async (...args: Parameters<typeof nativeLink>) => {
      if (String(args[1]).endsWith('.json')) throw Object.assign(new Error('Metadata publication failed'), { code: 'EIO' })
      return nativeLink(...args)
    })
    syncBuiltinESMExports()
    await assert.rejects(runtime.captureSnapshot({ expectedVault: vault, path: 'Note.md', content: 'New copy' }, signal),
      error => error instanceof NoteVaultError && error.code === 'recovery-unavailable')
    assert.deepEqual((await readdir(stateRoot, { recursive: true })).filter(name => /\.(?:body|tmp)$/u.test(name) || name.includes('Z-')), [])
  })
})

test('a cleanup failure after metadata publication retains the complete recovery copy', async t => {
  await withRuntime(t, async ({ runtime, vault, signal, stateRoot }) => {
    const nativeRm = fs.rm
    let interrupted = false
    t.mock.method(fs, 'rm', async (...args: Parameters<typeof nativeRm>) => {
      if (!interrupted && String(args[0]).includes('Z-') && String(args[0]).includes('.json.') && String(args[0]).endsWith('.tmp')) {
        interrupted = true
        throw Object.assign(new Error('Temporary cleanup failed'), { code: 'EIO' })
      }
      return nativeRm(...args)
    })
    syncBuiltinESMExports()
    const request = { expectedVault: vault, path: 'Note.md' }
    await assert.rejects(runtime.captureSnapshot({ ...request, content: 'Published recovery copy' }, signal),
      error => error instanceof NoteVaultError && error.code === 'partial')
    assert.equal(interrupted, true)
    const records = await runtime.listSnapshots(request, signal)
    assert.equal(records.snapshots.length, 1)
    assert.equal((await runtime.readSnapshot({ ...request, snapshotId: records.snapshots[0]!.id }, signal)).content, 'Published recovery copy')
    assert.deepEqual((await readdir(stateRoot, { recursive: true })).filter(name => name.endsWith('.tmp')), [])
  })
})

test('a recovery collision rejects a note save without changing bytes and a fresh retry succeeds', async t => {
  await withRuntime(t, async ({ runtime, vault, signal, vaultRoot }) => {
    collideSnapshotNames(t)
    const request = { expectedVault: vault, path: 'Note.md' }
    await writeFile(join(vaultRoot, request.path), 'Original note bytes')
    const snapshot = await runtime.captureSnapshot({ ...request, content: 'Earlier recovery copy' }, signal)
    assert.ok(snapshot.snapshot)
    const opened = await runtime.openDocument(request.path, vault, signal)
    const saving = { ...request, expectedRevision: opened.revision, content: 'Updated note bytes' }
    await assert.rejects(runtime.saveDocument(saving, signal), error => error instanceof NoteVaultError && error.code === 'recovery-unavailable')
    assert.equal(await readFile(join(vaultRoot, request.path), 'utf8'), 'Original note bytes')
    assert.equal((await runtime.readSnapshot({ ...request, snapshotId: snapshot.snapshot.id }, signal)).content, 'Earlier recovery copy')
    t.mock.restoreAll()
    syncBuiltinESMExports()
    const saved = await runtime.saveDocument(saving, signal)
    assert.equal(saved.status, 'saved')
    assert.ok(saved.snapshotId)
    assert.equal(await readFile(join(vaultRoot, request.path), 'utf8'), 'Updated note bytes')
    assert.equal((await runtime.readSnapshot({ ...request, snapshotId: saved.snapshotId }, signal)).content, 'Original note bytes')
  })
})
