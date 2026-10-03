import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs, { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test, { type TestContext } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import NoteVaultRuntime, { Config, NoteVaultError } from '../src/index.ts'

async function withRuntime(t: TestContext, limit: number, check: (runtime: NoteVaultRuntime, vaultRoot: string, context: Context) => Promise<void>): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'note-snapshot-retention-'))
  const vaultRoot = join(temporaryRoot, 'vault')
  await mkdir(vaultRoot)
  const context = new Context()
  const idleIndex = { search: async () => null, invalidate() {}, close: async () => {} }
  t.mock.method(NoteVaultRuntime.prototype as unknown as { createSearchIndex(): typeof idleIndex }, 'createSearchIndex', () => idleIndex)
  try {
    await context.plugin(NoteVaultRuntime, { ...Config(), vaultRoot, stateRoot: join(temporaryRoot, 'state'), snapshotLimit: limit })
    await check(context.noteVault, vaultRoot, context)
  } finally {
    t.mock.restoreAll()
    syncBuiltinESMExports()
    await context.fiber.dispose()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

for (const clockChange of [0, -60 * 60_000]) {
  test(`snapshot retention keeps the newest capture when timestamps ${clockChange === 0 ? 'tie' : 'go backwards'}`, async t => {
    await withRuntime(t, 1, async runtime => {
      const vault = runtime.state
      assert.ok(vault.active)
      const request = { expectedVault: vault, path: 'Note.md', reason: 'manual' }
      const signal = new AbortController().signal
      let now = Date.now()
      t.mock.method(Date, 'now', () => now)
      const ids = ['11111111-0000-4000-8000-000000000000', '22222222-0000-4000-8000-000000000000'] as const
      let uuid = 0
      t.mock.method(crypto, 'randomUUID', () => ids[uuid++ % ids.length])
      syncBuiltinESMExports()
      const first = await runtime.captureSnapshot({ ...request, content: 'Earlier recovery copy' }, signal)
      now += clockChange
      const latest = await runtime.captureSnapshot({ ...request, content: 'Latest recovery copy' }, signal)
      assert.ok(first.snapshot)
      assert.ok(latest.snapshot)
      assert.equal(latest.snapshot.createdAt - first.snapshot.createdAt, clockChange)
      const retained = await runtime.listSnapshots(request, signal)
      assert.deepEqual(retained.snapshots.map(snapshot => snapshot.id), [latest.snapshot.id])
      assert.equal((await runtime.readSnapshot({ ...request, snapshotId: latest.snapshot.id }, signal)).content, 'Latest recovery copy')
    })
  })
}

test('overlapping captures retain one complete latest recovery copy', async t => {
  await withRuntime(t, 1, async runtime => {
    const vault = runtime.state
    assert.ok(vault.active)
    const signal = new AbortController().signal
    const request = { expectedVault: vault, path: 'Note.md', reason: 'manual' }
    const results = await Promise.all(['First', 'Second', 'Latest'].map(content => runtime.captureSnapshot({ ...request, content }, signal)))
    const latest = results[2]?.snapshot
    assert.ok(latest)
    const retained = await runtime.listSnapshots(request, signal)
    assert.deepEqual(retained.snapshots.map(snapshot => snapshot.id), [latest.id])
    assert.equal((await runtime.readSnapshot({ ...request, snapshotId: latest.id }, signal)).content, 'Latest')
  })
})

for (const operation of ['clear', 'list', 'cancelled-clear', 'other-note', 'vault-change', 'unload'] as const) {
  test(`snapshot ${operation} observes an earlier capture before the first storage directory exists`, { timeout: 5_000 }, async t => {
    await withRuntime(t, 2, async (runtime, vaultRoot, context) => {
      const vault = runtime.state
      assert.ok(vault.active)
      const signal = new AbortController().signal
      const request = { expectedVault: vault, path: 'Note.md' }
      const directory = join(await realpath(join(dirname(vaultRoot), 'state')), 'snapshots')
      const entered = Promise.withResolvers<void>()
      const resume = Promise.withResolvers<void>()
      const nativeMkdir = fs.mkdir
      let blocked = false
      t.mock.method(fs, 'mkdir', async (...args: Parameters<typeof nativeMkdir>) => {
        if (!blocked && args[0] === directory) {
          blocked = true
          entered.resolve()
          await resume.promise
        }
        return nativeMkdir(...args)
      })
      syncBuiltinESMExports()
      const capturing = runtime.captureSnapshot({ ...request, content: 'Pending recovery copy' }, signal)
      void capturing.catch(() => undefined)
      const cancelled = new AbortController()
      let following: ReturnType<NoteVaultRuntime['clearSnapshots']> | ReturnType<NoteVaultRuntime['listSnapshots']> | undefined
      let unloading: Promise<void> | undefined
      const deadline = new AbortController()
      try {
        await Promise.race([entered.promise, setTimeout(1_000, undefined, { signal: deadline.signal }).then(() => { throw new Error('Snapshot directory creation did not begin') })])
        deadline.abort()
        if (operation === 'other-note') {
          const other = { ...request, path: 'Other.md' }
          await runtime.captureSnapshot({ ...other, content: 'Independent note' }, signal)
          assert.equal((await runtime.listSnapshots(other, signal)).snapshots.length, 1)
          return
        }
        if (operation === 'clear' || operation === 'cancelled-clear') following = runtime.clearSnapshots(request, cancelled.signal)
        else following = runtime.listSnapshots(request, signal)
        void following.catch(() => undefined)
        await Promise.race([following, setTimeout(100)])
        if (operation === 'cancelled-clear') cancelled.abort()
        if (operation === 'vault-change') {
          const otherVault = join(dirname(vaultRoot), 'other-vault')
          await mkdir(otherVault)
          runtime.activate(otherVault, vault.generation)
        } else if (operation === 'unload') {
          unloading = context.fiber.dispose()
          await new Promise<void>(resolve => setImmediate(resolve))
        }
        resume.resolve()
        if (operation === 'vault-change' || operation === 'unload') {
          const rejected = (error: unknown) => error instanceof NoteVaultError && error.code === (operation === 'unload' ? 'unavailable' : 'stale-vault')
          await assert.rejects(capturing, rejected)
          await assert.rejects(following, rejected)
          assert.deepEqual((await readdir(directory, { recursive: true })).filter(name => /\.(?:body|json)$/u.test(name)), [])
          return
        }
        const captured = await capturing
        if (operation === 'cancelled-clear') {
          await assert.rejects(following, { name: 'AbortError' })
          assert.deepEqual((await runtime.listSnapshots(request, signal)).snapshots.map(snapshot => snapshot.id), [captured.snapshot?.id])
          return
        }
        const result = await following
        if (operation === 'clear') {
          assert.ok('removed' in result)
          assert.equal(result.removed, 1)
          assert.deepEqual((await runtime.listSnapshots(request, signal)).snapshots, [])
        } else {
          assert.ok('snapshots' in result)
          assert.deepEqual(result.snapshots.map(snapshot => snapshot.id), [captured.snapshot?.id])
        }
      } finally {
        deadline.abort()
        resume.resolve()
        await Promise.allSettled([capturing, following])
        await unloading
      }
    })
  })
}

test('a successful save returns readable original bytes after the clock goes backwards', async t => {
  await withRuntime(t, 1, async (runtime, vaultRoot) => {
    await writeFile(join(vaultRoot, 'Note.md'), '# Original note\n')
    const vault = runtime.state
    assert.ok(vault.active)
    const signal = new AbortController().signal
    const request = { expectedVault: vault, path: 'Note.md' }
    let now = Date.now()
    t.mock.method(Date, 'now', () => now)
    await runtime.captureSnapshot({ ...request, content: 'Earlier draft', reason: 'manual' }, signal)
    now -= 60 * 60_000
    const opened = await runtime.openDocument(request.path, vault, signal)
    const result = await runtime.saveDocument({ ...request, content: '# Saved note\n', expectedRevision: opened.revision }, signal)
    assert.equal(result.status, 'saved')
    assert.ok(result.snapshotId)
    assert.equal((await runtime.readSnapshot({ ...request, snapshotId: result.snapshotId }, signal)).content, '# Original note\n')
    await runtime.restoreSnapshotAsNew({ ...request, snapshotId: result.snapshotId, toPath: 'Recovered.md' }, signal)
    assert.equal(await readFile(join(vaultRoot, 'Note.md'), 'utf8'), '# Saved note\n')
    assert.equal(await readFile(join(vaultRoot, 'Recovered.md'), 'utf8'), '# Original note\n')
  })
})

test('retention still removes old copies and deduplicates unchanged content', async t => {
  await withRuntime(t, 2, async runtime => {
    const vault = runtime.state
    assert.ok(vault.active)
    const signal = new AbortController().signal
    const request = { expectedVault: vault, path: 'Note.md', reason: 'manual' }
    const currentTime = Date.now()
    let now = currentTime - 31 * 24 * 60 * 60_000
    t.mock.method(Date, 'now', () => now)
    await runtime.captureSnapshot({ ...request, content: 'Expired copy' }, signal)
    now = currentTime - 1_000
    await runtime.captureSnapshot({ ...request, content: 'Previous copy' }, signal)
    now = currentTime
    const latest = await runtime.captureSnapshot({ ...request, content: 'Latest copy' }, signal)
    assert.deepEqual((await runtime.listSnapshots(request, signal)).snapshots.map(snapshot => snapshot.reason), ['manual', 'manual'])
    now += 1_000
    const duplicate = await runtime.captureSnapshot({ ...request, content: 'Latest copy' }, signal)
    assert.equal(duplicate.snapshot?.id, latest.snapshot?.id)
    const retained = await runtime.listSnapshots(request, signal)
    assert.equal(retained.snapshots.length, 2)
    assert.equal((await runtime.readSnapshot({ ...request, snapshotId: retained.snapshots[1]!.id }, signal)).content, 'Previous copy')
  })
})
