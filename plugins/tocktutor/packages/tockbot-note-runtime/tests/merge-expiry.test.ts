import assert from 'node:assert/strict'
import fs, { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import NoteVaultRuntime, { Config } from '../src/index.ts'

test('a merge review expiring during final preflight preserves both original notes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'note-merge-expiry-'))
  const vaultRoot = join(root, 'vault'), stateRoot = join(root, 'state')
  await mkdir(vaultRoot)
  await writeFile(join(vaultRoot, 'Source.md'), 'Source\n')
  await writeFile(join(vaultRoot, 'Dest.md'), 'Destination\n')
  const context = new Context()
  const idleIndex = { search: async () => null, invalidate() {}, close: async () => {} }
  t.mock.method(NoteVaultRuntime.prototype as unknown as { createSearchIndex(): typeof idleIndex }, 'createSearchIndex', () => idleIndex)
  let now = Date.now()
  t.mock.method(Date, 'now', () => now)
  try {
    await context.plugin(NoteVaultRuntime, { ...Config(), vaultRoot, stateRoot })
    const runtime = context.noteVault, vault = runtime.state, signal = new AbortController().signal
    assert.ok(vault.active)
    const source = await runtime.openDocument('Source.md', vault, signal)
    const destination = await runtime.openDocument('Dest.md', vault, signal)
    const request = {
      expectedVault: vault,
      sourcePath: source.path,
      destinationPath: destination.path,
      expectedSourceRevision: source.revision,
      expectedDestinationRevision: destination.revision,
      mergedContent: 'Destination\n\nSource\n',
      keepSource: false,
    }
    const preview = await runtime.previewMergeLinks(request, signal)
    const grant = await runtime.prepareMerge({ ...request, fingerprint: preview.fingerprint!, sourceDisposition: 'trash', sourceContent: null }, signal)
    const previewMerge = runtime.previewMergeLinks.bind(runtime)
    t.mock.method(runtime, 'previewMergeLinks', async (...args: Parameters<typeof previewMerge>) => {
      const result = await previewMerge(...args)
      now += 5 * 60_000
      return result
    })
    await assert.rejects(runtime.applyMerge({ id: grant.id, expectedVault: vault, confirmed: true }, signal), { code: 'conflict' })
    assert.equal(await readFile(join(vaultRoot, 'Source.md'), 'utf8'), 'Source\n')
    assert.equal(await readFile(join(vaultRoot, 'Dest.md'), 'utf8'), 'Destination\n')
    assert.deepEqual((await runtime.listMerges({ expectedVault: vault }, signal)).merges, [])
    assert.deepEqual((await readdir(vaultRoot)).sort(), ['Dest.md', 'Source.md'])
  } finally {
    t.mock.restoreAll()
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

for (const interruption of ['expiry', 'caller cancellation'] as const) test(`${interruption} interrupts a merge waiting at the final note write and preserves recovery originals`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'note-merge-write-expiry-'))
  const vaultRoot = join(root, 'vault'), stateRoot = join(root, 'state')
  await mkdir(vaultRoot)
  await writeFile(join(vaultRoot, 'Source.md'), 'Source\n')
  await writeFile(join(vaultRoot, 'Dest.md'), 'Destination\n')
  const canonicalRoot = await realpath(vaultRoot)
  const context = new Context()
  const idleIndex = { search: async () => null, invalidate() {}, close: async () => {} }
  t.mock.method(NoteVaultRuntime.prototype as unknown as { createSearchIndex(): typeof idleIndex }, 'createSearchIndex', () => idleIndex)
  try {
    await context.plugin(NoteVaultRuntime, { ...Config(), vaultRoot, stateRoot })
    const runtime = context.noteVault, vault = runtime.state, caller = new AbortController(), signal = caller.signal
    assert.ok(vault.active)
    const source = await runtime.openDocument('Source.md', vault, signal)
    const destination = await runtime.openDocument('Dest.md', vault, signal)
    const request = {
      expectedVault: vault,
      sourcePath: source.path,
      destinationPath: destination.path,
      expectedSourceRevision: source.revision,
      expectedDestinationRevision: destination.revision,
      mergedContent: 'Destination\n\nSource\n',
      keepSource: false,
    }
    const now = Date.now()
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now })
    const preview = await runtime.previewMergeLinks(request, signal)
    const grant = await runtime.prepareMerge({ ...request, fingerprint: preview.fingerprint!, sourceDisposition: 'trash', sourceContent: null }, signal)
    const nativeRealpath = fs.realpath
    let expired = false
    t.mock.method(fs, 'realpath', async (...args: Parameters<typeof nativeRealpath>) => {
      const result = await nativeRealpath(...args)
      if (!expired && args[0] === join(canonicalRoot, 'Dest.md')
        && (await readdir(vaultRoot)).some(name => name.startsWith('.Dest.md.') && name.endsWith('.tmp'))) {
        expired = true
        if (interruption === 'expiry') t.mock.timers.tick(5 * 60_000)
        else caller.abort()
      }
      return result
    })
    syncBuiltinESMExports()
    const result = await runtime.applyMerge({ id: grant.id, expectedVault: vault, confirmed: true }, signal)
    assert.ok(expired, 'the deadline passed inside the final filesystem validation')
    assert.equal(await readFile(join(vaultRoot, 'Dest.md'), 'utf8'), 'Destination\n')
    assert.equal(await readFile(join(vaultRoot, 'Source.md'), 'utf8'), 'Source\n')
    assert.equal(result.status, 'recovery-required')
    assert.deepEqual((await readdir(vaultRoot)).sort(), ['Dest.md', 'Source.md'])
    t.mock.restoreAll()
    syncBuiltinESMExports()
    t.mock.timers.reset()
    const recovered = await runtime.recoverMerge({ id: grant.id, expectedVault: vault }, new AbortController().signal)
    assert.equal(await readFile(join(vaultRoot, recovered.recoveryPath, 'Dest.md'), 'utf8'), 'Destination\n')
    assert.equal(await readFile(join(vaultRoot, recovered.recoveryPath, 'Source.md'), 'utf8'), 'Source\n')
  } finally {
    t.mock.restoreAll()
    syncBuiltinESMExports()
    t.mock.timers.reset()
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('expiry after one merge write preserves its committed bytes and leaves remaining notes recoverable', async t => {
  const root = await mkdtemp(join(tmpdir(), 'note-merge-partial-expiry-'))
  const vaultRoot = join(root, 'vault'), stateRoot = join(root, 'state')
  await mkdir(vaultRoot)
  await writeFile(join(vaultRoot, 'Source.md'), 'Source\n')
  await writeFile(join(vaultRoot, 'Dest.md'), 'Destination\n')
  await writeFile(join(vaultRoot, 'Ref.md'), '[[Source]]\n')
  const context = new Context()
  const idleIndex = { search: async () => null, invalidate() {}, close: async () => {} }
  t.mock.method(NoteVaultRuntime.prototype as unknown as { createSearchIndex(): typeof idleIndex }, 'createSearchIndex', () => idleIndex)
  try {
    await context.plugin(NoteVaultRuntime, { ...Config(), vaultRoot, stateRoot })
    const runtime = context.noteVault, vault = runtime.state, signal = new AbortController().signal
    assert.ok(vault.active)
    const source = await runtime.openDocument('Source.md', vault, signal)
    const destination = await runtime.openDocument('Dest.md', vault, signal)
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() })
    const request = {
      expectedVault: vault,
      sourcePath: source.path,
      destinationPath: destination.path,
      expectedSourceRevision: source.revision,
      expectedDestinationRevision: destination.revision,
      mergedContent: 'Destination\n\nSource\n',
      keepSource: false,
    }
    const preview = await runtime.previewMergeLinks(request, signal)
    const grant = await runtime.prepareMerge({ ...request, fingerprint: preview.fingerprint!, sourceDisposition: 'trash', sourceContent: null }, signal)
    const save = runtime.saveDocument.bind(runtime)
    t.mock.method(runtime, 'saveDocument', async (...args: Parameters<typeof save>) => {
      const result = await save(...args)
      if (args[0].path === 'Dest.md') t.mock.timers.tick(5 * 60_000)
      return result
    })
    const result = await runtime.applyMerge({ id: grant.id, expectedVault: vault, confirmed: true }, signal)
    assert.equal(result.status, 'recovery-required')
    assert.equal(await readFile(join(vaultRoot, 'Dest.md'), 'utf8'), request.mergedContent)
    assert.equal(await readFile(join(vaultRoot, 'Source.md'), 'utf8'), 'Source\n')
    assert.equal(await readFile(join(vaultRoot, 'Ref.md'), 'utf8'), '[[Source]]\n')
    t.mock.restoreAll()
    t.mock.timers.reset()
    const recovered = await runtime.recoverMerge({ id: grant.id, expectedVault: vault }, signal)
    assert.equal(await readFile(join(vaultRoot, recovered.recoveryPath, 'Dest.md'), 'utf8'), 'Destination\n')
    assert.equal(await readFile(join(vaultRoot, recovered.recoveryPath, 'Source.md'), 'utf8'), 'Source\n')
    assert.equal(await readFile(join(vaultRoot, recovered.recoveryPath, 'Ref.md'), 'utf8'), '[[Source]]\n')
    assert.equal(await readFile(join(vaultRoot, 'Dest.md'), 'utf8'), request.mergedContent)
  } finally {
    t.mock.restoreAll()
    t.mock.timers.reset()
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
