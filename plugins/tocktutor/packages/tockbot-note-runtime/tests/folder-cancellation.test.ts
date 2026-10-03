import assert from 'node:assert/strict'
import fs, { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import test, { type TestContext } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import NoteVaultRuntime, { Config, NoteVaultError } from '../src/index.ts'

async function preservesFolder(t: TestContext, options: {
  operation: 'move' | 'duplicate'
  stage: 'quarantine' | 'destination'
  interruption: 'cancel' | 'replace-vault'
}) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'note-folder-cancellation-'))
  const root = join(temporaryRoot, 'vault')
  await mkdir(join(root, 'Source'), { recursive: true })
  const canonicalRoot = await realpath(root)
  const bytes = '# Original note\n'
  await writeFile(join(root, 'Source', 'Note.md'), bytes)
  const context = new Context()
  const controller = new AbortController()
  const nativeLstat = fs.lstat
  const nativeOpendir = fs.opendir
  let inspectedFolder: string | undefined
  let validationChecks = 0
  try {
    await context.plugin(NoteVaultRuntime, { ...Config(), vaultRoot: root, stateRoot: join(temporaryRoot, 'state') })
    const runtime = context.noteVault
    const vault = runtime.state
    assert.ok(vault.active)
    const tree = await runtime.listTree({ expectedVault: vault }, controller.signal)
    const source = tree.entries.find(entry => entry.path === 'Source')
    assert.ok(source?.kind === 'directory')
    t.mock.method(fs, 'opendir', async (...args: Parameters<typeof nativeOpendir>) => {
      const stream = await nativeOpendir(...args)
      const requested = String(args[0])
      const target = options.stage === 'quarantine'
        ? dirname(requested) === canonicalRoot && basename(requested).startsWith('.Source.') && requested.endsWith('.tmp')
        : requested === join(canonicalRoot, 'Destination')
      if (target) inspectedFolder = requested
      return stream
    })
    t.mock.method(fs, 'lstat', async (...args: Parameters<typeof nativeLstat>) => {
      const resolved = await nativeLstat(...args)
      const requested = String(args[0])
      if (requested === inspectedFolder) {
        validationChecks += 1
        // The directory check is followed by the manifest's final root check.
        if (validationChecks === 2) {
          if (options.interruption === 'cancel') controller.abort(new DOMException('Cancelled during final folder validation', 'AbortError'))
          else runtime.openSandboxVault(vault.generation)
        }
      }
      return resolved
    })
    syncBuiltinESMExports()
    const request = {
      fromPath: 'Source', toPath: 'Destination', expectedVault: vault, expectedRevision: source.revision,
    }
    const [result] = await Promise.allSettled([options.operation === 'move'
      ? runtime.moveFolder(request, controller.signal)
      : runtime.duplicateFolder(request, controller.signal)])
    assert.ok(validationChecks >= 2, 'interruption must occur at the manifest final root check')
    assert.equal(await readFile(join(root, 'Source', 'Note.md'), 'utf8'), bytes)
    assert.equal(await readFile(join(root, 'Destination', 'Note.md'), 'utf8'), bytes)
    assert.equal((await readdir(root)).some(name => name.startsWith('.Source.')), false)
    assert.equal(result?.status, 'rejected')
    if (result?.status === 'rejected') assert.ok(result.reason instanceof NoteVaultError && result.reason.code === 'partial')
  } finally {
    t.mock.restoreAll()
    syncBuiltinESMExports()
    await context.fiber.dispose()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

test('cancellation during final quarantine validation preserves the original folder', async t => {
  await preservesFolder(t, { operation: 'move', stage: 'quarantine', interruption: 'cancel' })
})

test('vault replacement during final quarantine validation restores the original folder', async t => {
  await preservesFolder(t, { operation: 'move', stage: 'quarantine', interruption: 'replace-vault' })
})

for (const operation of ['move', 'duplicate'] as const) {
  for (const interruption of ['cancel', 'replace-vault'] as const) {
    test(`${interruption} during final destination validation rejects a folder ${operation}`, async t => {
      await preservesFolder(t, { operation, stage: 'destination', interruption })
    })
  }
}
