import assert from 'node:assert/strict'
import fs, { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { type TestContext } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import NoteVaultRuntime, { Config, NoteVaultError, type DraftRequest } from '../src/index.ts'

async function withBlockedDraft(t: TestContext, check: (fixture: {
  runtime: NoteVaultRuntime
  request: DraftRequest
  saving: Promise<unknown>
  saveAbort: AbortController
  release: () => void
}) => Promise<void>): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'note-draft-ordering-'))
  const vaultRoot = join(temporaryRoot, 'vault')
  const stateRoot = join(temporaryRoot, 'state')
  await mkdir(vaultRoot)
  const context = new Context()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const nativeMkdir = fs.mkdir
  let saving: Promise<unknown> | undefined
  try {
    await context.plugin(NoteVaultRuntime, { ...Config(), vaultRoot, stateRoot })
    const runtime = context.noteVault
    const vault = runtime.state
    assert.ok(vault.active)
    const draftDirectory = join(await realpath(stateRoot), 'drafts')
    let held = false
    t.mock.method(fs, 'mkdir', async (...args: Parameters<typeof nativeMkdir>) => {
      if (!held && args[0] === draftDirectory) {
        held = true
        entered.resolve()
        await release.promise
      }
      return nativeMkdir(...args)
    })
    syncBuiltinESMExports()
    const saveAbort = new AbortController()
    const request = { expectedVault: vault, path: 'Note.md' }
    saving = runtime.saveDraft({ ...request, content: 'First draft' }, saveAbort.signal)
    void saving.catch(() => undefined)
    const deadline = new AbortController()
    try {
      await Promise.race([entered.promise, setTimeout(1_000, undefined, { signal: deadline.signal }).then(() => {
        throw new Error('The first draft save did not reach directory creation')
      })])
    } finally {
      deadline.abort()
    }
    await check({ runtime, request, saving, saveAbort, release: release.resolve })
  } finally {
    release.resolve()
    await saving?.catch(() => undefined)
    t.mock.restoreAll()
    syncBuiltinESMExports()
    await context.fiber.dispose()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

test('clearing a draft waits for its initial save and removes the recovery copy', { timeout: 5_000 }, async t => {
  await withBlockedDraft(t, async ({ runtime, request, saving, release }) => {
    const signal = new AbortController().signal
    const clearing = runtime.clearDraft(request, signal)
    // Give the later clear a chance to finish while the first directory creation is held.
    await Promise.race([clearing, setTimeout(100)])
    release()
    await Promise.all([saving, clearing])
    assert.equal((await runtime.readDraft(request, signal)).draft, null,
      'an earlier unfinished save must not bring back a cleared draft')
  })
})

test('a draft read waits for an earlier initial save', { timeout: 5_000 }, async t => {
  await withBlockedDraft(t, async ({ runtime, request, saving, release }) => {
    const reading = runtime.readDraft(request, new AbortController().signal)
    await Promise.race([reading, setTimeout(100)])
    release()
    await saving
    assert.equal((await reading).draft?.content, 'First draft')
  })
})

test('later draft saves keep their call order before directory creation', { timeout: 5_000 }, async t => {
  await withBlockedDraft(t, async ({ runtime, request, saving, release }) => {
    const signal = new AbortController().signal
    const later = runtime.saveDraft({ ...request, content: 'Latest draft' }, signal)
    await Promise.race([later, setTimeout(100)])
    release()
    await Promise.all([saving, later])
    assert.equal((await runtime.readDraft(request, signal)).draft?.content, 'Latest draft')
  })
})

test('draft queues for different notes remain independent', { timeout: 5_000 }, async t => {
  await withBlockedDraft(t, async ({ runtime, request }) => {
    const signal = new AbortController().signal
    const other = { ...request, path: 'Other.md' }
    await runtime.saveDraft({ ...other, content: 'Other draft' }, signal)
    assert.equal((await runtime.readDraft(other, signal)).draft?.content, 'Other draft')
    await runtime.clearDraft(other, signal)
    assert.equal((await runtime.readDraft(other, signal)).draft, null)
  })
})

test('a failed initial draft save does not block a later valid save', { timeout: 5_000 }, async t => {
  await withBlockedDraft(t, async ({ runtime, request, saving, saveAbort, release }) => {
    const signal = new AbortController().signal
    const later = runtime.saveDraft({ ...request, content: 'Latest draft' }, signal)
    saveAbort.abort()
    release()
    await assert.rejects(saving, { name: 'AbortError' })
    await later
    assert.equal((await runtime.readDraft(request, signal)).draft?.content, 'Latest draft')
  })
})

for (const operation of ['read', 'clear'] as const) {
  test(`cancelled queued draft ${operation} preserves the accepted draft`, { timeout: 5_000 }, async t => {
    await withBlockedDraft(t, async ({ runtime, request, saving, release }) => {
      const controller = new AbortController()
      const pending = operation === 'read' ? runtime.readDraft(request, controller.signal)
        : runtime.clearDraft(request, controller.signal)
      const settled = Promise.allSettled([pending])
      controller.abort()
      release()
      await saving
      const [result] = await settled
      assert.equal(result?.status, 'rejected')
      if (result?.status === 'rejected') assert.equal(result.reason.name, 'AbortError')
      assert.equal((await runtime.readDraft(request, new AbortController().signal)).draft?.content, 'First draft')
    })
  })

  test(`vault replacement rejects a queued draft ${operation}`, { timeout: 5_000 }, async t => {
    await withBlockedDraft(t, async ({ runtime, request, saving, release }) => {
      const pending = operation === 'read' ? runtime.readDraft(request, new AbortController().signal)
        : runtime.clearDraft(request, new AbortController().signal)
      const settled = Promise.allSettled([saving, pending])
      runtime.openSandboxVault(request.expectedVault.generation)
      release()
      for (const result of await settled) {
        assert.equal(result.status, 'rejected')
        if (result.status === 'rejected') assert.ok(result.reason instanceof NoteVaultError && result.reason.code === 'stale-vault')
      }
      const reopened = runtime.activateRecentVault(request.expectedVault.id, runtime.state.generation)
      assert.ok(reopened.active)
      assert.equal((await runtime.readDraft({ ...request, expectedVault: reopened }, new AbortController().signal)).draft, null)
    })
  })
}
