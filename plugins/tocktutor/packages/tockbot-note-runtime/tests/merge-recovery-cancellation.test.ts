import assert from 'node:assert/strict'
import fs, { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { setTimeout } from 'node:timers/promises'

const { Context } = await import(process.env.TOCKTEAM_RECOVERY_CORDIS_MODULE ?? '@deepseek-ai/cordis') as typeof import('@deepseek-ai/cordis')
const { default: NoteVaultRuntime, Config } = await import(process.env.TOCKTEAM_RECOVERY_RUNTIME_MODULE ?? '../src/index.ts') as typeof import('../src/index.ts')

for (const interruption of ['cancellation', 'vault replacement', 'unload', 'none', 'after publication'] as const) test(`merge recovery handles ${interruption} at final journal publication`, { timeout: 10_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'note-merge-recovery-cancel-'))
  const vaultRoot = join(root, 'vault'), stateRoot = join(root, 'state')
  await mkdir(vaultRoot)
  await writeFile(join(vaultRoot, 'Source.md'), 'Source\n')
  await writeFile(join(vaultRoot, 'Dest.md'), 'Destination\n')
  let context = new Context()
  const idleIndex = { search: async () => null, invalidate() {}, close: async () => {} }
  t.mock.method(NoteVaultRuntime.prototype as unknown as { createSearchIndex(): typeof idleIndex }, 'createSearchIndex', () => idleIndex)
  try {
    await context.plugin(NoteVaultRuntime, { ...Config(), vaultRoot, stateRoot })
    const runtime = context.noteVault, vault = runtime.state, signal = new AbortController().signal
    assert.ok(vault.active)
    const source = await runtime.openDocument('Source.md', vault, signal)
    const destination = await runtime.openDocument('Dest.md', vault, signal)
    const request = {
      expectedVault: vault, sourcePath: source.path, destinationPath: destination.path,
      expectedSourceRevision: source.revision, expectedDestinationRevision: destination.revision,
      mergedContent: 'Destination\n\nSource\n', keepSource: true,
    }
    const preview = await runtime.previewMergeLinks(request, signal)
    const grant = await runtime.prepareMerge({ ...request, fingerprint: preview.fingerprint!, sourceDisposition: 'keep', sourceContent: null }, signal)
    const applied = await runtime.applyMerge({ id: grant.id, expectedVault: vault, confirmed: true }, signal)
    assert.equal(applied.status, 'applied')
    const mergesRoot = join(await realpath(stateRoot), 'merges')
    const directory = join(mergesRoot, (await readdir(mergesRoot))[0]!)
    const journal = join(directory, `${grant.id}.json`)
    const before = await readFile(journal, 'utf8')
    const caller = new AbortController()
    const nativeRealpath = fs.realpath
    const nativeRename = fs.rename
    let unloading: Promise<void> | undefined
    const otherVault = join(root, 'other-vault')
    await mkdir(otherVault)
    let interrupted = false
    t.mock.method(fs, 'realpath', async (...args: Parameters<typeof nativeRealpath>) => {
      const result = await nativeRealpath(...args)
      if (!interrupted && args[0] === directory
        && (await readdir(directory)).some(name => name.startsWith(`.${grant.id}.json.`) && name.endsWith('.tmp'))) {
        if (interruption !== 'after publication') interrupted = true
        if (interruption === 'cancellation') caller.abort()
        else if (interruption === 'vault replacement') runtime.activate(otherVault, vault.generation)
        else if (interruption === 'unload') {
          unloading = context.fiber.dispose()
          await setTimeout(0)
        }
      }
      return result
    })
    t.mock.method(fs, 'rename', async (...args: Parameters<typeof nativeRename>) => {
      const result = await nativeRename(...args)
      if (interruption === 'after publication' && args[1] === journal) {
        interrupted = true
        caller.abort()
      }
      return result
    })
    syncBuiltinESMExports()
    const recovering = runtime.recoverMerge({ id: grant.id, expectedVault: vault }, caller.signal)
    if (interruption === 'none' || interruption === 'after publication') {
      assert.equal((await recovering).status, 'recovered')
      assert.equal(JSON.parse(await readFile(journal, 'utf8')).status, 'recovered')
    } else {
      await assert.rejects(recovering, interruption === 'cancellation' ? { name: 'AbortError' }
        : { code: interruption === 'unload' ? 'unavailable' : 'stale-vault' })
      assert.equal(await readFile(journal, 'utf8'), before)
    }
    assert.ok(interrupted, 'the final journal publication boundary was reached')
    assert.deepEqual(await readdir(directory), [`${grant.id}.json`])
    assert.equal(await readFile(join(vaultRoot, 'Source.md'), 'utf8'), 'Source\n')
    assert.equal(await readFile(join(vaultRoot, 'Dest.md'), 'utf8'), request.mergedContent)
    for (const [name, content] of [['Source.md', 'Source\n'], ['Dest.md', 'Destination\n']]) {
      assert.equal(await readFile(join(vaultRoot, applied.recoveryPath, name!), 'utf8'), content)
    }
    t.mock.restoreAll()
    syncBuiltinESMExports()
    if (unloading !== undefined) {
      await unloading
      context = new Context()
      t.mock.method(NoteVaultRuntime.prototype as unknown as { createSearchIndex(): typeof idleIndex }, 'createSearchIndex', () => idleIndex)
      await context.plugin(NoteVaultRuntime, { ...Config(), vaultRoot, stateRoot })
    } else if (interruption === 'vault replacement') {
      runtime.activate(vaultRoot, runtime.state.generation)
    }
    const retryVault = context.noteVault.state
    assert.ok(retryVault.active)
    const retry = await context.noteVault.recoverMerge({ id: grant.id, expectedVault: retryVault }, signal)
    assert.equal(retry.status, 'recovered')
    assert.equal((await context.noteVault.listMerges({ expectedVault: retryVault }, signal)).merges[0]?.status, 'recovered')
    assert.deepEqual(await readdir(directory), [`${grant.id}.json`])
  } finally {
    t.mock.restoreAll()
    syncBuiltinESMExports()
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
