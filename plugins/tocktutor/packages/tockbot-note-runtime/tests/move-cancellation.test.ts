import assert from 'node:assert/strict'
import fs, { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import NoteVaultRuntime, { Config, NoteVaultError } from '../src/index.ts'

for (const operation of ['move-note', 'trash-attachment'] as const) {
  for (const interruption of ['cancel', 'replace-vault'] as const) {
    test(`${interruption} during final source validation preserves ${operation}`, async t => {
      const temporaryRoot = await mkdtemp(join(tmpdir(), 'note-move-cancellation-'))
      const root = join(temporaryRoot, 'vault')
      await mkdir(root)
      const relativePath = operation === 'move-note' ? 'Source.md' : 'Source.png'
      const source = join(root, relativePath)
      const bytes = Buffer.from(operation === 'move-note' ? '# Original note' : 'original attachment')
      await writeFile(source, bytes)
      const canonicalSource = await realpath(source)
      const context = new Context()
      const controller = new AbortController()
      const nativeLstat = fs.lstat
      let interrupted = false
      try {
        await context.plugin(NoteVaultRuntime, { ...Config(), vaultRoot: root, stateRoot: join(temporaryRoot, 'state') })
        const runtime = context.noteVault
        const vault = runtime.state
        assert.ok(vault.active)
        const opened = operation === 'move-note'
          ? await runtime.openDocument(relativePath, vault, controller.signal)
          : await runtime.inspectAttachment(relativePath, vault, controller.signal)
        t.mock.method(fs, 'lstat', async (...args: Parameters<typeof nativeLstat>) => {
          const resolved = await nativeLstat(...args)
          const staged = operation === 'move-note'
            ? await readFile(join(root, 'Destination.md')).then(() => true, () => false)
            : await readdir(join(root, '.trash')).then(entries => entries.length > 0, () => false)
          if (!interrupted && args[0] === canonicalSource && staged) {
            interrupted = true
            if (interruption === 'cancel') controller.abort(new DOMException('Cancelled during source validation', 'AbortError'))
            else runtime.openSandboxVault(vault.generation)
          }
          return resolved
        })
        syncBuiltinESMExports()
        const request = { expectedRevision: opened.revision, expectedVault: vault }
        const moving = operation === 'move-note'
          ? runtime.moveFile({ ...request, fromPath: relativePath, toPath: 'Destination.md' }, controller.signal)
          : runtime.trashEntry({ ...request, path: relativePath }, controller.signal)
        const [result] = await Promise.allSettled([moving])
        assert.equal(interrupted, true, 'interruption must occur after the destination is staged')
        assert.deepEqual(await readFile(source), bytes)
        if (operation === 'move-note') await assert.rejects(readFile(join(root, 'Destination.md')), { code: 'ENOENT' })
        else assert.deepEqual(await readdir(join(root, '.trash')), [])
        assert.equal(result?.status, 'rejected')
        if (result?.status === 'rejected') {
          if (interruption === 'cancel') assert.equal(result.reason.name, 'AbortError')
          else assert.ok(result.reason instanceof NoteVaultError && result.reason.code === 'stale-vault')
        }
      } finally {
        t.mock.restoreAll()
        syncBuiltinESMExports()
        await context.fiber.dispose()
        await rm(temporaryRoot, { recursive: true, force: true })
      }
    })
  }
}
