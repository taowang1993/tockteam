import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { SearchIndexProcess } from '../src/search-index-process.ts'
import { spawnOwnedProcess, type OwnedProcessOptions } from '../src/owned-process.ts'
import { stopChildProcess } from '../../../../../scripts/process-cleanup.mjs'
const execute = promisify(execFile)
const document = { path: 'Alpha.md', modifiedAt: 1, revision: '1' }
const options = (directory: string) => ({ directory, identity: 'fixture', vaultId: 'vault:fixture', maxReadBytes: 1024,
  list: async () => [document], read: async () => ({ ...document, content: '#alpha' }) })
async function until<T>(get: () => Promise<T>, accepted: (value: T) => boolean, ms = 5000): Promise<T> {
  const end = performance.now() + ms
  do { const value = await get(); if (accepted(value)) return value; await delay(25) } while (performance.now() < end)
  throw new Error('Host-death fixture deadline exceeded')
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Readiness fixture deadline')), 10000) })]) }
  finally { clearTimeout(timer) }
}
async function inventory(root: string) {
  const { stdout } = await execute('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,stat=,args='], { timeout: 3000, maxBuffer: 4 * 1024 * 1024 })
  return stdout.split('\n').flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/)
    return match && (match[5]!.includes(join(root, 'host.mjs')) || match[5]!.includes(join(root, 'child.mjs')))
      ? [{ pid: +match[1]!, parent: +match[2]!, group: +match[3]!, state: match[4]!, command: match[5]! }] : []
  })
}

test('a stopped index surviving Host death retains its lease until actual child death', { skip: process.platform !== 'darwin' && 'macOS orphan reaping/stop-state acceptance', timeout: 25000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'index-host-death-')))
  const module = new URL('../src/search-index-process.ts', import.meta.url).href
  const childEntry = fileURLToPath(new URL('../src/search-index-child.ts', import.meta.url))
  const packageFile = fileURLToPath(new URL('../package.json', import.meta.url))
  const fixture = join(root, 'child.mjs'), leaseLog = join(root, 'lease.json')
  await writeFile(fixture, `import { createRequire } from 'node:module'; import { writeFileSync,renameSync } from 'node:fs'; import { pathToFileURL } from 'node:url';
const sqlite=createRequire(${JSON.stringify(packageFile)})('sqlite3');
for(const method of ['all','run']) { const original=sqlite.Database.prototype[method]; sqlite.Database.prototype[method]=function(sql,...args){
 if(!['PRAGMA journal_mode','BEGIN EXCLUSIVE'].includes(sql))return original.call(this,sql,...args);
 const callback=args.pop(); return original.call(this,sql,...args,function(error,...values){
 if(error){writeFileSync(process.argv[3]+'.tmp',JSON.stringify({code:error.code,sql}));renameSync(process.argv[3]+'.tmp',process.argv[3]);}
 return callback.call(this,error,...values);
 }); }; }
await import(pathToFileURL(process.argv[2]).href);\n`)
  await writeFile(join(root, 'host.mjs'), `import { SearchIndexProcess } from ${JSON.stringify(module)};
const original=SearchIndexProcess.prototype.spawn;
SearchIndexProcess.prototype.spawn=async function(options){const owner=await original.call(this,{...options,args:[${JSON.stringify(fixture)},options.args[0],${JSON.stringify(leaseLog)}]}); process.send({childPid:owner.pid}); return owner;};
const document=${JSON.stringify(document)}; const index=new SearchIndexProcess({directory:${JSON.stringify(root)},identity:'fixture',vaultId:'vault:fixture',maxReadBytes:1024,list:async()=>[document],read:async()=>({...document,content:'#alpha'})});
await index.whenReady;process.send({ready:true,childPid:index.pid});\n`)
  const host = spawn(process.execPath, [join(root, 'host.mjs')], { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR } })
  const ready = Promise.withResolvers<number>()
  let childPid: number | undefined, contender: SearchIndexProcess | undefined, reopened: SearchIndexProcess | undefined
  let childVerifiedGone = false
  host.on('message', (message: any) => { if (Number.isSafeInteger(message.childPid)) childPid = message.childPid; if (message.ready) ready.resolve(message.childPid) })
  host.once('error', ready.reject)
  host.once('exit', () => ready.reject(new Error('Host exited before readiness')))
  void ready.promise.catch(() => {})
  try {
    let timer: ReturnType<typeof setTimeout> | undefined
    try { childPid = await Promise.race([ready.promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Host readiness deadline')), 10000) })]) }
    finally { clearTimeout(timer) }
    const filename = join(root, 'fixture-fixture.sqlite')
    const before = await stat(filename), contents = createHash('sha256').update(await readFile(filename)).digest('hex')
    process.kill(childPid, 'SIGSTOP')
    await until(() => inventory(root), rows => rows.some(row => row.pid === childPid && row.parent === host.pid && row.state.includes('T')))
    host.kill('SIGKILL') // Deliberately kill ONLY the Host, not the independent index group.
    await until(() => inventory(root), rows => !rows.some(row => row.pid === host.pid) && rows.some(row => row.pid === childPid && row.parent !== host.pid && row.state.includes('T')))
    assert.throws(() => process.kill(host.pid!, 0), { code: 'ESRCH' })
    process.kill(childPid, 0)
    const prototype = SearchIndexProcess.prototype as unknown as { spawn(options: OwnedProcessOptions): ReturnType<typeof spawnOwnedProcess> }
    t.mock.method(prototype, 'spawn', (invocation: OwnedProcessOptions) => spawnOwnedProcess({ ...invocation, args: [fixture, childEntry, leaseLog] }))
    contender = new SearchIndexProcess(options(root))
    await assert.rejects(bounded(contender.whenReady), error => error instanceof Error && error.message !== 'Readiness fixture deadline')
    await contender.close()
    assert.equal(JSON.parse(await readFile(leaseLog, 'utf8')).code, 'SQLITE_BUSY')
    assert.equal((await stat(filename)).ino, before.ino)
    assert.equal(createHash('sha256').update(await readFile(filename)).digest('hex'), contents)
    assert.ok((await inventory(root)).some(row => row.pid === childPid && row.state.includes('T')))
    process.kill(-childPid, 'SIGKILL')
    await until(() => inventory(root), rows => !rows.some(row => row.pid === childPid))
    assert.throws(() => process.kill(childPid!, 0), { code: 'ESRCH' })
    assert.throws(() => process.kill(-childPid!, 0), { code: 'ESRCH' })
    childVerifiedGone = true
    let reads = 0
    reopened = new SearchIndexProcess({ ...options(root), read: async () => { reads++; return { ...document, content: '#alpha' } } })
    await bounded(reopened.whenReady)
    assert.equal(reads, 0)
    assert.equal((await stat(filename)).ino, before.ino)
    assert.deepEqual((await reopened.search({ directory: '', groups: [[{ field: 'tag', value: '#alpha' }]], limit: 10 }, new AbortController().signal))?.entries.map(entry => entry.path), ['Alpha.md'])
    await reopened.close()
    t.diagnostic(JSON.stringify({ hostPid: host.pid, childPid, contenderPid: contender.pid, reopenedPid: reopened.pid, busyWhileOrphanStopped: true, mainUnchanged: true, reopenReads: reads }))
  } finally {
    const errors: unknown[] = []
    // Discovery failure must not bypass known-owner cleanup. Keep unresolved roots.
    try {
      for (const row of await inventory(root)) {
        try {
          assert.ok(row.command.startsWith(process.execPath + ' '), 'do not terminate a foreign executable')
          process.kill(row.pid === row.group ? -row.pid : row.pid, 'SIGKILL')
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') errors.push(error) }
      }
    } catch (error) { errors.push(error) }
    if (childPid && !childVerifiedGone) {
      try { process.kill(-childPid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') errors.push(error) }
    }
    for (const outcome of await Promise.allSettled([contender?.close(), reopened?.close(), stopChildProcess(host)])) {
      if (outcome.status === 'rejected') errors.push(outcome.reason)
    }
    try {
      await until(() => inventory(root), rows => rows.length === 0)
      if (childPid) {
        assert.throws(() => process.kill(childPid!, 0), { code: 'ESRCH' })
        assert.throws(() => process.kill(-childPid!, 0), { code: 'ESRCH' })
      }
    } catch (error) { errors.push(error) }
    if (errors.length) throw new AggregateError(errors, `Host-death cleanup unverified; retained ${root}`)
    await rm(root, { recursive: true, force: true })
  }
})
