import assert from 'node:assert/strict'
import fs, { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import NoteVaultRuntime, { Config, NoteVaultError } from '../src/index.ts'

for (const operation of ['create', 'save', 'attachment', 'passive-config', 'property-registry'] as const) {
  test(`unloading the Runtime prevents pending ${operation} publication`, async t => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'note-disposal-cancellation-'))
    const root = join(temporaryRoot, 'vault')
    const relativePath = operation === 'attachment' ? 'Target.png'
      : operation === 'passive-config' || operation === 'property-registry' ? '.obsidian/types.json' : 'Target.md'
    const target = join(root, relativePath)
    const parent = dirname(target)
    await mkdir(parent, { recursive: true })
    const canonicalParent = await realpath(parent)
    if (operation === 'save') await writeFile(target, '# Original note')
    const context = new Context()
    const idleIndex = { search: async () => null, invalidate() {}, close: async () => {} }
    t.mock.method(NoteVaultRuntime.prototype as unknown as { createSearchIndex(): typeof idleIndex }, 'createSearchIndex', () => idleIndex)
    const nativeRealpath = fs.realpath
    const reached = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    let blocked = false
    let writing: Promise<unknown> | undefined
    try {
      await context.plugin(NoteVaultRuntime, { ...Config(), vaultRoot: root, stateRoot: join(temporaryRoot, 'state') })
      const runtime = context.noteVault
      const vault = runtime.state
      assert.ok(vault.active)
      const signal = new AbortController().signal
      const opened = operation === 'save' ? await runtime.openDocument(relativePath, vault, signal) : undefined
      t.mock.method(fs, 'realpath', async (...args: Parameters<typeof nativeRealpath>) => {
        const resolved = await nativeRealpath(...args)
        if (!blocked && (args[0] === canonicalParent || args[0] === join(canonicalParent, basename(target)))
          && (await readdir(parent)).some(name => name.startsWith(`.${basename(target)}.`) && name.endsWith('.tmp'))) {
          blocked = true
          reached.resolve()
          await resume.promise
        }
        return resolved
      })
      syncBuiltinESMExports()
      if (operation === 'create') writing = runtime.createDocument({ content: '# Must not appear', expectedVault: vault, path: relativePath }, signal)
      else if (operation === 'save') writing = runtime.saveDocument({ content: '# Must not appear', expectedRevision: opened!.revision, expectedVault: vault, path: relativePath }, signal)
      else if (operation === 'attachment') writing = runtime.storeAttachment({ data: new Uint8Array([1, 2, 3]), expectedVault: vault, path: relativePath }, signal)
      else if (operation === 'passive-config') writing = runtime.restorePassiveBackupEntry({ data: new TextEncoder().encode('{}\n'), expectedVault: vault, path: relativePath }, signal)
      else writing = runtime.setObsidianPropertyType({ expectedVault: vault, expectedRevision: null, key: 'due', type: 'date' }, signal)
      const outcome = Promise.allSettled([writing])
      await reached.promise
      const unloading = context.fiber.dispose()
      await new Promise<void>(resolve => setImmediate(resolve))
      resume.resolve()
      const [result] = await outcome
      await unloading
      if (operation === 'save') assert.equal(await readFile(target, 'utf8'), '# Original note')
      else await assert.rejects(readFile(target), { code: 'ENOENT' })
      assert.equal(result?.status, 'rejected')
      if (result?.status === 'rejected') assert.ok(result.reason instanceof NoteVaultError && result.reason.code === 'unavailable')
      assert.deepEqual(await readdir(parent), operation === 'save' ? ['Target.md'] : [])
    } finally {
      resume.resolve()
      if (writing) await writing.catch(() => undefined)
      t.mock.restoreAll()
      syncBuiltinESMExports()
      await context.fiber.dispose()
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })
}

test('an unloaded Runtime cannot create vaults or revive its previous selection', async t => {
  const root = await mkdtemp(join(tmpdir(), 'note-disposed-authority-'))
  const vaultRoot = join(root, 'vault'), stateRoot = join(root, 'state')
  await mkdir(vaultRoot)
  const context = new Context()
  const idleIndex = { search: async () => null, invalidate() {}, close: async () => {} }
  t.mock.method(NoteVaultRuntime.prototype as unknown as { createSearchIndex(): typeof idleIndex }, 'createSearchIndex', () => idleIndex)
  try {
    await context.plugin(NoteVaultRuntime, { ...Config(), vaultRoot, stateRoot })
    const runtime = context.noteVault
    const vault = runtime.state
    assert.ok(vault.active)
    const selectionFile = join(stateRoot, 'vault-state', 'selection.json')
    const originalSelection = await readFile(selectionFile, 'utf8')
    await context.fiber.dispose()
    const unavailable = (error: unknown) => error instanceof NoteVaultError && error.code === 'unavailable'
    assert.throws(() => runtime.activate(vaultRoot, vault.generation), unavailable)
    assert.throws(() => runtime.openSandboxVault(vault.generation), unavailable)
    assert.throws(() => runtime.createManagedVault('After unload', vault.generation), unavailable)
    assert.throws(() => runtime.removeRecentVault(vault.id, vault.generation), unavailable)
    await assert.rejects(runtime.createDocument({ expectedVault: vault, path: 'Late.md', content: '# Late' }, new AbortController().signal), unavailable)
    assert.equal(await readFile(selectionFile, 'utf8'), originalSelection)
    assert.deepEqual(await readdir(vaultRoot), [])
    await assert.rejects(readdir(join(stateRoot, 'TockTutor Sandbox')), { code: 'ENOENT' })
    await assert.rejects(readdir(join(stateRoot, 'TockTutor Vaults')), { code: 'ENOENT' })
  } finally {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
