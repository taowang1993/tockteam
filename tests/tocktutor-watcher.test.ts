import assert from 'node:assert/strict'
import fs, { type FSWatcher } from 'node:fs'
import { mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import type { NoteVaultChangeEvent } from 'tockbot-note-runtime'

test('packaged vault watcher survives replacement, forwards native errors, and stops pending writes', { timeout: 15_000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tocktutor-watcher-')))
  const target = join(root, '中文 Note.md')
  const context = new Context()
  const native: FSWatcher[] = []
  const lateStats: ((error: NodeJS.ErrnoException) => void)[] = []
  const originalWatch = fs.watch
  const originalStat = fs.stat
  let holdStats = false
  const waitUntil = async (check: () => boolean): Promise<void> => {
    for (let attempt = 0; attempt < 200 && !check(); attempt++) await new Promise(resolve => setTimeout(resolve, 10))
    assert.ok(check(), 'watcher must deliver the expected filesystem transition')
  }
  t.mock.method(fs, 'watch', (...args: Parameters<typeof fs.watch>) => {
    const watcher = Reflect.apply(originalWatch, fs, args) as FSWatcher
    native.push(watcher)
    return watcher
  })
  t.mock.method(fs, 'stat', (...args: Parameters<typeof fs.stat>) => {
    if (holdStats && resolve(String(args[0])) === target) lateStats.push(args.at(-1) as (error: NodeJS.ErrnoException) => void)
    else Reflect.apply(originalStat, fs, args)
  })
  syncBuiltinESMExports()
  try {
    await writeFile(target, '# Initial\n')
    const { default: Runtime } = await import('tockbot-note-runtime')
    await context.plugin(Runtime, { ...Runtime.Config(), vaultRoot: root, stateRoot: join(root, '.state') })
    const runtime = context.get('noteVault')!
    const state = runtime.state
    if (!state.active) assert.fail('fixture vault must be active')
    await t.test('equivalent root spellings are not ignored', () => {
      const ignored = (runtime as unknown as { watcher: { options: { ignored: ((path: string) => boolean)[] } } }).watcher.options.ignored[0]!
      assert.equal(ignored(root + '/'), false)
      assert.equal(ignored(root.replaceAll('\\', '/')), false)
    })
    const events: NoteVaultChangeEvent[] = []
    context.on('note-vault/change', event => { events.push(event) })
    const signal = new AbortController().signal
    const opened = await runtime.openDocument('中文 Note.md', state, signal)
    await runtime.saveDocument({ path: opened.path, expectedVault: state, expectedRevision: opened.revision, content: '# Saved\n' }, signal)
    for (const [index, content] of ['# In-Place\n', '# Atomic\n', '# Later Edit\n'].entries()) {
      events.length = 0
      if (index === 1) {
        await writeFile(join(root, '.replacement'), content)
        await rename(join(root, '.replacement'), target)
      } else await writeFile(target, content)
      await waitUntil(() => events.some(event => event.kind === 'entry' && event.path === opened.path && event.action.startsWith('external-')))
      assert.equal(await readFile(target, 'utf8'), content)
    }
    await t.test('nonpersistent native errors reach the runtime error event', () => {
      const before = events.length
      assert.ok(native.length > 0, 'the vault root must not be ignored on any platform')
      assert.doesNotThrow(() => native.at(-1)!.emit('error', Object.assign(new Error('fixture watch error'), { code: 'EPERM' })))
      assert.ok(events.slice(before).some(event => event.kind === 'tree' && event.action === 'watcher-error'))
    })
    await t.test('closing cancels pending write waits and ignores late stat errors', async () => {
      const watcher = (runtime as unknown as { watcher: { _pendingWrites: Map<string, unknown> } }).watcher
      holdStats = true
      await writeFile(target, '# Pending Write\n')
      await waitUntil(() => lateStats.length > 0)
      await context.fiber.dispose()
      assert.equal(watcher._pendingWrites.size, 0, 'no write-finish poll may survive disposal')
      assert.doesNotThrow(() => {
        for (const callback of lateStats.splice(0)) callback(Object.assign(new Error('late stat error'), { code: 'EACCES' }))
      })
    })
  } finally {
    holdStats = false
    await context.fiber.dispose()
    for (const callback of lateStats.splice(0)) callback(Object.assign(new Error('fixture removed'), { code: 'ENOENT' }))
    t.mock.restoreAll()
    syncBuiltinESMExports()
    await rm(root, { recursive: true, force: true })
  }
})
