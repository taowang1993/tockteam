import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { spawnOwnedProcess, type OwnedProcessOptions } from '../src/owned-process.ts'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { SearchIndexProcess } from '../src/search-index-process.ts'
import { adoptSearchIndex, retireSearchIndex } from '../src/search-index-ownership.ts'
import { PersistentSearchIndex } from '../src/search-index-native.ts'
import { NativeOperationProgress } from '../src/search-index-progress.ts'

const request = { directory: '', groups: [[{ field: 'tag' as const, value: '#alpha' }]], limit: 1000 }
const document = { path: 'Alpha.md', modifiedAt: 1, revision: 'revision-1' }
const fixtureOptions = (directory: string) => ({ directory, identity: 'fixture', vaultId: 'vault:fixture', maxReadBytes: 1024,
  list: async () => [document], read: async () => ({ ...document, content: '#alpha' }) })

test('an authenticated owned child indexes paged inventory and chunked Unicode documents', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'index-child-'))
  const documents = Array.from({ length: 300 }, (_, i) => ({ path: `${i}.md`, modifiedAt: 1, revision: `revision-${i}` }))
  const index = new SearchIndexProcess({
    directory, identity: 'fixture', vaultId: 'vault:fixture', maxReadBytes: 1024 * 1024,
    list: async () => documents,
    read: async path => ({ ...documents.find(document => document.path === path)!, content: (path === '0.md' ? '漢字😀 '.repeat(12000) : '') + '#alpha' }),
  })
  let pid: number | undefined
  try {
    assert.equal(await index.search(request, new AbortController().signal), null)
    await index.whenReady
    pid = index.pid
    assert.ok(pid && pid !== process.pid)
    const result = await index.search(request, new AbortController().signal)
    assert.equal(result?.complete, true)
    assert.equal(result?.entries.length, 300)
    assert.deepEqual(new Set(result?.entries.map(entry => entry.path)), new Set(documents.map(document => document.path)))
    const unicode = await index.search({ ...request, groups: [[{ field: 'tag', value: '漢字' }]] }, new AbortController().signal)
    assert.deepEqual(unicode?.entries.map(entry => entry.path), ['0.md'])
  } finally {
    await index.close()
    if (pid) assert.throws(() => process.kill(pid!, 0), { code: 'ESRCH' })
    await rm(directory, { recursive: true, force: true })
  }
})

test('four searches plus an invalidation retain control capacity and fence old results', { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'index-burst-'))
  const failures: Error[] = []
  const index = new SearchIndexProcess({ ...fixtureOptions(directory), failed: error => { failures.push(error) } })
  try {
    await index.whenReady
    const pending = Array.from({ length: 4 }, () => index.search(request, new AbortController().signal))
    index.invalidate('Alpha.md')
    assert.deepEqual(await Promise.all(pending), [null, null, null, null])
    assert.equal(failures.length, 0, failures[0]?.message)
    const deadline = performance.now() + 5000
    let result = await index.search(request, new AbortController().signal)
    while (!result && performance.now() < deadline) { await delay(10); result = await index.search(request, new AbortController().signal) }
    assert.equal(result?.entries.length, 1)
    assert.equal(failures.length, 0)
  } finally { await index.close(); await rm(directory, { recursive: true, force: true }) }
})

test('a changed document reconciles incrementally without another full inventory', { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'index-incremental-'))
  let inventories = 0
  let revision = 'revision-1'
  let content = '#alpha'
  const index = new SearchIndexProcess({ ...fixtureOptions(directory),
    list: async () => { inventories += 1; return [{ ...document, revision }] },
    read: async () => ({ ...document, revision, content }) })
  try {
    await index.whenReady
    revision = 'revision-2'; content = '#beta'
    index.invalidate('Alpha.md')
    assert.equal(await index.search(request, new AbortController().signal), null)
    const changedRequest = { ...request, groups: [[{ field: 'tag' as const, value: '#beta' }]] }
    const deadline = performance.now() + 5000
    let result = await index.search(changedRequest, new AbortController().signal)
    while (!result && performance.now() < deadline) { await delay(10); result = await index.search(changedRequest, new AbortController().signal) }
    assert.deepEqual(result?.entries, [{ path: 'Alpha.md', modifiedMs: 1, revision: 'revision-2' }])
    assert.equal(inventories, 1)
  } finally { await index.close(); await rm(directory, { recursive: true, force: true }) }
})

test('changed-path count or byte overflow collapses to one full invalidation', { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'index-invalidation-overflow-'))
  let inventories = 0
  const failures: Error[] = []
  const index = new SearchIndexProcess({ ...fixtureOptions(directory), failed: error => { failures.push(error) },
    list: async () => { inventories += 1; return [document] } })
  try {
    await index.whenReady
    for (const paths of [Array.from({ length: 300 }, (_, i) => `changed-${i}.md`), ['漢'.repeat(12000) + '.md']]) {
      const before = inventories
      for (const path of paths) index.invalidate(path)
      const deadline = performance.now() + 5000
      let result = await index.search(request, new AbortController().signal)
      while (!result && performance.now() < deadline) { await delay(10); result = await index.search(request, new AbortController().signal) }
      assert.equal(result?.entries.length, 1)
      assert.equal(inventories, before + 1)
    }
    assert.equal(failures.length, 0)
  } finally { await index.close(); await rm(directory, { recursive: true, force: true }) }
})

test('the child engine bounds changed paths across multiple admitted batches', async () => {
  for (const paths of [Array.from({ length: 5000 }, (_, i) => `changed-${i}.md`), Array.from({ length: 700 }, (_, i) => `${'漢'.repeat(512)}-${i}.md`)]) {
    const held = Promise.withResolvers<null>()
    const index = new PersistentSearchIndex({ ...fixtureOptions(tmpdir()), list: () => held.promise,
      progress: new NativeOperationProgress(() => {}, error => { throw error }) })
    try {
      for (const path of paths) index.invalidate(path)
      assert.ok((Reflect.get(index, 'pendingPaths') as Set<string>).size <= 4096)
      assert.ok((Reflect.get(index, 'pendingPathBytes') as number) <= 1024 * 1024)
      assert.equal(Reflect.get(index, 'fullReconcilePending'), true)
    } finally { held.resolve(null); await index.close() }
  }
})

test('cancelled callers settle promptly without bypassing native admission limits', { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'index-cancel-'))
  const failures: Error[] = []
  const index = new SearchIndexProcess({ ...fixtureOptions(directory), failed: error => { failures.push(error) } })
  try {
    await index.whenReady
    const controller = new AbortController()
    const cancelled = Array.from({ length: 4 }, () => assert.rejects(index.search(request, controller.signal), { name: 'AbortError' }))
    controller.abort()
    assert.equal(await index.search(request, new AbortController().signal), null)
    await Promise.all(cancelled)
    const deadline = performance.now() + 5000
    let result = await index.search(request, new AbortController().signal)
    while (!result && performance.now() < deadline) { await delay(10); result = await index.search(request, new AbortController().signal) }
    assert.equal(result?.entries.length, 1)
    assert.equal(failures.length, 0)
  } finally { await index.close(); await rm(directory, { recursive: true, force: true }) }
})

test('lease excludes a contender and persistent index reopens after verified owner death', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'index-lease-'))
  const first = new SearchIndexProcess(fixtureOptions(directory))
  let contender: SearchIndexProcess | undefined
  let reopened: SearchIndexProcess | undefined
  try {
    await first.whenReady
    const filename = join(directory, 'fixture-fixture.sqlite')
    const before = await stat(filename)
    contender = new SearchIndexProcess(fixtureOptions(directory))
    await assert.rejects(contender.whenReady)
    await contender.close()
    assert.equal((await first.search(request, new AbortController().signal))?.entries.length, 1)
    await first.close()
    let reads = 0
    reopened = new SearchIndexProcess({ ...fixtureOptions(directory), read: async () => { reads += 1; return { ...document, content: '#alpha' } } })
    await reopened.whenReady
    assert.equal((await stat(filename)).ino, before.ino)
    assert.equal(reads, 0, 'reopen must reuse current indexed document revisions')
    assert.equal((await reopened.search(request, new AbortController().signal))?.entries.length, 1)
  } finally {
    await Promise.all([first.close(), contender?.close(), reopened?.close()])
    await rm(directory, { recursive: true, force: true })
  }
})

test('a first lease survives a briefly held startup reader', { timeout: 5000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'index-lease-reader-'))
  const fixture = join(directory, 'reader.mjs')
  const packagePath = fileURLToPath(new URL('../package.json', import.meta.url))
  await writeFile(fixture, `import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';
const sqlite = createRequire(${JSON.stringify(packagePath)})('sqlite3');
const reader = await new Promise((resolve,reject) => { const db=new sqlite.Database(process.argv[3],error=>error?reject(error):resolve(db)); });
await new Promise((resolve,reject) => reader.exec('CREATE TABLE held (value); INSERT INTO held VALUES (1); BEGIN; SELECT * FROM held;',error=>error?reject(error):resolve()));
const run = sqlite.Database.prototype.run;
sqlite.Database.prototype.run = function(sql,...args) {
  if (sql === 'BEGIN EXCLUSIVE') setTimeout(() => reader.exec('ROLLBACK',error=>{ if(error) throw error; reader.close(); }),50);
  return Reflect.apply(run,this,[sql,...args]);
};
await import(pathToFileURL(process.argv[2]).href);\n`)
  const prototype = SearchIndexProcess.prototype as unknown as { spawn(options: OwnedProcessOptions): ReturnType<typeof spawnOwnedProcess> }
  t.mock.method(prototype, 'spawn', (options: OwnedProcessOptions) => spawnOwnedProcess({ ...options, args: [fixture, options.args[0]!, join(directory, 'fixture-fixture.sqlite.lease')] }))
  const index = new SearchIndexProcess(fixtureOptions(directory))
  try {
    await index.whenReady
    assert.equal((await index.search(request, new AbortController().signal))?.entries.length, 1)
  } finally {
    await index.close()
    if (index.pid) assert.throws(() => process.kill(index.pid!, 0), { code: 'ESRCH' })
    await rm(directory, { recursive: true, force: true })
  }
})

test('simultaneous first lease acquisition admits exactly one child', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'index-lease-race-'))
  const indexes = [new SearchIndexProcess(fixtureOptions(directory)), new SearchIndexProcess(fixtureOptions(directory))]
  try {
    const outcomes = await Promise.allSettled(indexes.map(index => index.whenReady))
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1,
      outcomes.map(outcome => outcome.status === 'rejected' ? String(outcome.reason) : 'ready').join('\n'))
    assert.equal(outcomes.filter(outcome => outcome.status === 'rejected').length, 1)
  } finally { await Promise.all(indexes.map(index => index.close())); await rm(directory, { recursive: true, force: true }) }
})

test('held child-native callback cannot keep the Host alive past its progress deadline', { timeout: 15000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'index-native-held-'))
  const fixture = join(directory, 'held.mjs')
  const marker = join(directory, 'native-held.json')
  const packagePath = fileURLToPath(new URL('../package.json', import.meta.url))
  await writeFile(fixture, `import { createRequire } from 'node:module'; import { writeFileSync } from 'node:fs'; import { pathToFileURL } from 'node:url';
const sqlite = createRequire(${JSON.stringify(packagePath)})('sqlite3'); const run = sqlite.Database.prototype.run;
sqlite.Database.prototype.run = function(sql, ...args) {
  if (sql !== 'DELETE FROM metadata WHERE key = ?') return Reflect.apply(run, this, [sql, ...args]);
  const callback = args.pop();
  return Reflect.apply(run, this, [sql, ...args, function(error) {
    writeFileSync(process.argv[3], JSON.stringify({ pid: process.pid, error: error?.code ?? null }));
    if (error) callback.call(this, error);
  }]);
};
await import(pathToFileURL(process.argv[2]).href);\n`)
  const prototype = SearchIndexProcess.prototype as unknown as { spawn(options: OwnedProcessOptions): ReturnType<typeof spawnOwnedProcess> }
  t.mock.method(prototype, 'spawn', (options: OwnedProcessOptions) => spawnOwnedProcess({ ...options, args: [fixture, options.args[0]!, marker] }))
  const index = new SearchIndexProcess(fixtureOptions(directory))
  const rejected = assert.rejects(index.whenReady, /stalled/u)
  const started = performance.now()
  try {
    let receipt: { pid: number; error: string | null } | undefined
    while (!receipt && performance.now() - started < 3000) {
      try { receipt = JSON.parse(await readFile(marker, 'utf8')) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await delay(10) }
    }
    assert.equal(receipt?.pid, index.pid)
    assert.equal(receipt?.error, null, 'the real native callback completed successfully before the fixture withheld it')
    let responsive = false
    await new Promise<void>(resolve => setImmediate(() => { responsive = true; resolve() }))
    assert.equal(responsive, true)
    await rejected
    await index.close()
    assert.ok(performance.now() - started < 10000)
    assert.throws(() => process.kill(index.pid!, 0), { code: 'ESRCH' })
  } finally { await index.close(); await rm(directory, { recursive: true, force: true }) }
})

test('retiring a generation waiting for global spawn admission cannot deadlock on itself', { timeout: 5000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'index-spawn-admission-'))
  const held = Promise.withResolvers<void>()
  const blocker = { close: () => held.promise }
  adoptSearchIndex(blocker)
  const blocked = retireSearchIndex(blocker)
  let spawned = false
  const index = new SearchIndexProcess(fixtureOptions(directory))
  adoptSearchIndex(index)
  t.mock.method(index as unknown as { spawn(): never }, 'spawn', () => { spawned = true; throw new Error('must not spawn') })
  try {
    const deadline = performance.now() + 1000
    while (!Reflect.get(index, 'listener') && performance.now() < deadline) await delay(1)
    assert.ok(Reflect.get(index, 'listener'))
    const closing = retireSearchIndex(index)
    const timeout = setTimeout(() => held.reject(new Error('admission cancellation did not settle')), 1000)
    try { await closing } finally { clearTimeout(timeout) }
    assert.equal(spawned, false)
  } finally { held.resolve(); await blocked; await index.close(); await rm(directory, { recursive: true, force: true }) }
})

test('failed spawn cleanup never becomes a fulfilled generation close', { timeout: 10000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'index-spawn-uncertain-'))
  const uncertainty = new Error('Owned process cleanup could not be verified')
  const prototype = SearchIndexProcess.prototype as unknown as { spawn(options: OwnedProcessOptions): ReturnType<typeof spawnOwnedProcess> }
  // No OS process is launched by these fault fixtures, including failures after admission.
  try {
    for (const mode of ['before', 'synchronous', 'asynchronous']) {
      const mocked = t.mock.method(prototype, 'spawn', async (options: OwnedProcessOptions) => {
        if (mode === 'before') throw uncertainty
        return options.admit!(mode === 'synchronous' ? () => { throw uncertainty } : async () => { throw uncertainty })
      })
      const index = new SearchIndexProcess(fixtureOptions(directory))
      try {
        await assert.rejects(index.whenReady, error => error === uncertainty)
        await assert.rejects(index.close(), error => error === uncertainty)
        await assert.rejects(index.close(), error => error === uncertainty)
      } finally { await index.close().catch(() => {}); mocked.mock.restore() }
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('cancellation during platform preparation rejects admission without inventing ownership uncertainty', { timeout: 5000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'index-platform-cancel-'))
  const entered = Promise.withResolvers<void>(), held = Promise.withResolvers<void>()
  const prototype = SearchIndexProcess.prototype as unknown as { spawn(options: OwnedProcessOptions): ReturnType<typeof spawnOwnedProcess> }
  let launched = false
  t.mock.method(prototype, 'spawn', async (options: OwnedProcessOptions) => {
    entered.resolve(); await held.promise
    return options.admit!(async () => { launched = true; throw new Error('must not launch') })
  })
  const index = new SearchIndexProcess(fixtureOptions(directory))
  try {
    await entered.promise
    const closing = index.close()
    held.resolve(); await closing
    assert.equal(launched, false)
    await index.close()
  } finally { held.resolve(); await index.close(); await rm(directory, { recursive: true, force: true }) }
})

test('closing an authenticated generation before spawn returns leaves no polling timer', { timeout: 10000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'index-start-close-'))
  const baseline = process.getActiveResourcesInfo().filter(type => type === 'Timeout').length
  const spawned = Promise.withResolvers<void>()
  const held = Promise.withResolvers<void>()
  const prototype = SearchIndexProcess.prototype as unknown as { spawn(options: OwnedProcessOptions): ReturnType<typeof spawnOwnedProcess> }
  t.mock.method(prototype, 'spawn', async (options: OwnedProcessOptions) => {
    const owner = await spawnOwnedProcess(options)
    spawned.resolve()
    await held.promise
    return owner
  })
  const index = new SearchIndexProcess(fixtureOptions(directory))
  const rejected = assert.rejects(index.whenReady)
  try {
    await spawned.promise
    await (Reflect.get(index, 'listener') as { peer: Promise<unknown> }).peer
    const closed = index.close()
    held.resolve()
    await closed
    await rejected
    assert.equal(process.getActiveResourcesInfo().filter(type => type === 'Timeout').length, baseline)
  } finally {
    held.resolve()
    await index.close()
    // The RED version leaks this interval; clean that test-owned resource even on assertion failure.
    clearInterval(Reflect.get(index, 'timer') as ReturnType<typeof setInterval>)
    await rm(directory, { recursive: true, force: true })
  }
})

test('disposal does not wait for a held Host inventory callback and rejects retired readiness', { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'index-held-'))
  const entered = Promise.withResolvers<void>()
  const held = Promise.withResolvers<null>()
  const index = new SearchIndexProcess({ directory, identity: 'fixture', vaultId: 'vault:fixture', maxReadBytes: 1024,
    list: async () => { entered.resolve(); return held.promise }, read: async () => null })
  const readiness = assert.rejects(index.whenReady)
  try {
    await entered.promise
    const pid = index.pid!
    await index.close()
    await readiness
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    assert.equal(await index.search(request, new AbortController().signal), null)
  } finally { held.resolve(null); await index.close(); await rm(directory, { recursive: true, force: true }) }
})
