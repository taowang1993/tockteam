import assert from 'node:assert/strict'
import fs, { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import NoteVaultRuntime, { Config, NoteVaultError } from '../src/index.ts'

for (const operation of ['create', 'save', 'attachment', 'passive-config'] as const) {
  for (const interruption of ['cancel', 'replace-vault'] as const) {
    test(`${interruption} during the final filesystem check prevents ${operation}`, async t => {
      const temporaryRoot = await mkdtemp(join(tmpdir(), 'note-write-cancellation-'))
      const root = join(temporaryRoot, 'vault')
      const path = operation === 'attachment' ? 'Target.png'
        : operation === 'passive-config' ? '.obsidian/types.json' : 'Target.md'
      const target = join(root, path)
      const parent = dirname(target)
      await mkdir(parent, { recursive: true })
      const canonicalParent = await realpath(parent)
      const canonicalTarget = join(canonicalParent, basename(target))
      if (operation === 'save') await writeFile(target, '# Original note')
      const context = new Context()
      const controller = new AbortController()
      const nativeRealpath = fs.realpath
      let interrupted = false
      try {
        await context.plugin(NoteVaultRuntime, { ...Config(), vaultRoot: root, stateRoot: join(temporaryRoot, 'state') })
        const runtime = context.noteVault
        const vault = runtime.state
        assert.ok(vault.active)
        const opened = operation === 'save' ? await runtime.openDocument(path, vault, controller.signal) : undefined
        t.mock.method(fs, 'realpath', async (...args: Parameters<typeof nativeRealpath>) => {
          const resolved = await nativeRealpath(...args)
          if (!interrupted && (args[0] === canonicalParent || args[0] === canonicalTarget)
            && (await readdir(parent)).some(name => name.startsWith(`.${basename(target)}.`) && name.endsWith('.tmp'))) {
            interrupted = true
            if (interruption === 'cancel') controller.abort(new DOMException('Cancelled during filesystem validation', 'AbortError'))
            else assert.notEqual(runtime.openSandboxVault(vault.generation).generation, vault.generation)
          }
          return resolved
        })
        syncBuiltinESMExports()
        let writing: Promise<unknown>
        if (operation === 'create') writing = runtime.createDocument({ content: '# Changed note', expectedVault: vault, path }, controller.signal)
        else if (operation === 'save') writing = runtime.saveDocument({ content: '# Changed note', expectedRevision: opened!.revision, expectedVault: vault, path }, controller.signal)
        else if (operation === 'attachment') writing = runtime.storeAttachment({ data: new Uint8Array([1, 2, 3]), expectedVault: vault, path }, controller.signal)
        else writing = runtime.restorePassiveBackupEntry({ data: new TextEncoder().encode('{}\n'), expectedVault: vault, path }, controller.signal)
        const [result] = await Promise.allSettled([writing])

        assert.equal(interrupted, true, 'interruption must occur during the final filesystem validation')
        if (operation === 'save') assert.equal(await readFile(target, 'utf8'), '# Original note')
        else await assert.rejects(readFile(target), { code: 'ENOENT' })
        assert.equal(result?.status, 'rejected')
        if (result?.status === 'rejected') {
          if (interruption === 'cancel') assert.equal(result.reason.name, 'AbortError')
          else assert.ok(result.reason instanceof NoteVaultError && result.reason.code === 'stale-vault')
        }
        assert.equal((await readdir(parent)).some(name => name.endsWith('.tmp')), false)
      } finally {
        t.mock.restoreAll()
        syncBuiltinESMExports()
        await context.fiber.dispose()
        await rm(temporaryRoot, { recursive: true, force: true })
      }
    })
  }
}
