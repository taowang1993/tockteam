import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

async function bounded(promise, milliseconds, label) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds) })]) }
  finally { clearTimeout(timer) }
}

const INDEX_CHILD_BLOCK_MS = 60000
const INDEX_CHILD_BLOCK_MARGIN_MS = 5000
// Keep the live samples and Host-only native action in one synchronous turn.
export function terminateWindowsIndexHost(api, probe, hostHandle, childHandle, recovery) {
  recovery.terminateAt = Date.now()
  recovery.hostPreTerminateWait = api.waitForSingleObject(hostHandle, 0)
  recovery.childPreTerminateWait = api.waitForSingleObject(childHandle, 0)
  assert.equal(recovery.hostPreTerminateWait, 258, 'Host exited before Host-only termination')
  assert.equal(recovery.childPreTerminateWait, 258, 'child exited before Host-only termination')
  recovery.terminateResult = probe.terminateProcess(hostHandle, 1)
  assert.equal(recovery.terminateResult, 1, 'TerminateProcess failed')
  recovery.hostTerminated = true
}

const recoveryProofFields = [
  'hostPid', 'childPid', 'hostExecPath', 'childExecPath', 'hostWait', 'childWait', 'contenderWait', 'contenderBusyCode',
  'contenderClosed', 'hostTerminated', 'terminateResult', 'mainUnchanged', 'identityUnchanged', 'observerHandleFlags',
  'blockExpired', 'blockDurationMs', 'blockedToChildSignalMs',
]

/** The replacement gate is deliberately strict: no omitted fact becomes an acceptance default. */
export function assertWindowsIndexRecoveryReopenProof(proof) {
  assert.ok(proof && typeof proof === 'object' && !Array.isArray(proof), 'missing index recovery proof')
  for (const field of recoveryProofFields) assert.ok(Object.hasOwn(proof, field), `${field} proof is required`)
  assert.ok(Number.isSafeInteger(proof.hostPid) && proof.hostPid > 0, 'hostPid proof is invalid')
  assert.ok(Number.isSafeInteger(proof.childPid) && proof.childPid > 0, 'childPid proof is invalid')
  assert.equal(typeof proof.hostExecPath, 'string', 'host executable proof is invalid')
  assert.equal(typeof proof.childExecPath, 'string', 'child executable proof is invalid')
  assert.equal(proof.childExecPath, proof.hostExecPath, 'Host and child executables differ')
  assert.equal(proof.hostWait, 0, 'Host is still live before index reopen')
  assert.equal(proof.childWait, 0, 'child is still live before index reopen')
  assert.equal(proof.contenderWait, 0, 'contender is still live after close')
  assert.equal(proof.contenderBusyCode, 'SQLITE_BUSY', 'contender did not report real SQLITE_BUSY')
  assert.equal(proof.contenderClosed, true, 'contender close was not verified')
  assert.equal(proof.hostTerminated, true, 'Host was not terminated through its observer')
  assert.equal(proof.terminateResult, 1, 'TerminateProcess was not successful')
  assert.equal(proof.mainUnchanged, true, 'main index bytes changed before reopen')
  assert.equal(proof.identityUnchanged, true, 'main index identity changed before reopen')
  assert.ok(proof.observerHandleFlags && typeof proof.observerHandleFlags === 'object', 'observer handle flags proof is invalid')
  assert.equal(proof.observerHandleFlags.host, 0, 'Host observer handle is inheritable')
  assert.equal(proof.observerHandleFlags.child, 0, 'child observer handle is inheritable')
  assert.equal(proof.blockExpired, false, 'finite child block expired before Job cleanup')
  assert.equal(proof.blockDurationMs, INDEX_CHILD_BLOCK_MS, 'child block duration changed')
  assert.ok(Number.isFinite(proof.blockedToChildSignalMs) && proof.blockedToChildSignalMs >= 0 && proof.blockedToChildSignalMs < INDEX_CHILD_BLOCK_MS - INDEX_CHILD_BLOCK_MARGIN_MS,
    'child signal did not arrive before the finite block could expire')
  return proof
}

export function assertWindowsIndexRecoveryReceipt(receipt) {
  assert.ok(receipt && typeof receipt === 'object' && !Array.isArray(receipt), 'missing index recovery receipt')
  for (const field of ['passed', 'installedResolution', 'clockCases', 'recovery']) assert.ok(Object.hasOwn(receipt, field), `${field} receipt is required`)
  assert.equal(receipt.passed, true, 'index recovery receipt did not pass')
  assert.equal(receipt.installedResolution, true, 'index recovery did not use the fresh installation')
  assert.ok(Array.isArray(receipt.clockCases), 'clockCases receipt is invalid')
  assert.deepEqual(receipt.clockCases.map(caseReceipt => caseReceipt.mode), ['progress', 'stall', 'tail'])
  assert.ok(receipt.clockCases.every(caseReceipt => caseReceipt.passed === true), 'native clock case failed')
  const recovery = receipt.recovery
  assertWindowsIndexRecoveryReopenProof(recovery)
  for (const field of ['passed', 'emergencyCleanup', 'hostInitialWait', 'childInitialWait', 'hostWaitReceipt', 'childWaitReceipt', 'mainIdentityBefore', 'mainIdentityAfter',
    'blockedAt', 'terminateAt', 'hostPreTerminateWait', 'childPreTerminateWait', 'mainBytesBeforeSha256', 'mainBytesAfterSha256', 'reopenReads', 'reopenedIdentity', 'reopenedWait', 'reopenedClosed', 'reopenedAlphaPath']) {
    assert.ok(Object.hasOwn(recovery, field), `${field} receipt is required`)
  }
  assert.ok(Number.isSafeInteger(recovery.blockedAt) && recovery.blockedAt > 0, 'blocked child timestamp is invalid')
  assert.ok(Number.isSafeInteger(recovery.terminateAt) && recovery.terminateAt > 0, 'termination timestamp is invalid')
  assert.equal(recovery.hostInitialWait, 258, 'Host was not live before termination')
  assert.equal(recovery.childInitialWait, 258, 'child was not live before termination')
  assert.equal(recovery.hostPreTerminateWait, 258, 'Host was not live immediately before termination')
  assert.equal(recovery.childPreTerminateWait, 258, 'child was not live immediately before termination')
  for (const waitReceipt of [recovery.hostWaitReceipt, recovery.childWaitReceipt]) {
    for (const field of ['label', 'initialWait', 'finalWait', 'waitValues', 'polls', 'startedAt', 'signaledAt']) {
      assert.ok(Object.hasOwn(waitReceipt, field), `${field} wait receipt is required`)
    }
    assert.ok(waitReceipt.initialWait === 0 || waitReceipt.initialWait === 258, 'invalid initial wait value')
    assert.equal(waitReceipt.finalWait, 0, 'process wait receipt is not signaled')
    assert.ok(Array.isArray(waitReceipt.waitValues) && waitReceipt.waitValues.at(-1) === 0, 'wait values are incomplete')
    assert.ok(Number.isSafeInteger(waitReceipt.polls) && waitReceipt.polls > 0, 'wait poll count is invalid')
    assert.ok(Number.isSafeInteger(waitReceipt.startedAt) && Number.isSafeInteger(waitReceipt.signaledAt), 'wait timestamps are invalid')
  }
  assert.deepEqual(recovery.mainIdentityAfter, recovery.mainIdentityBefore, 'main file identity changed')
  assert.equal(recovery.mainBytesAfterSha256, recovery.mainBytesBeforeSha256, 'main file bytes changed')
  assert.equal(recovery.passed, true, 'index recovery did not pass')
  assert.equal(recovery.emergencyCleanup, false, 'emergency cleanup cannot count as acceptance')
  assert.equal(recovery.reopenReads, 0, 'replacement reread a document')
  assert.deepEqual(recovery.reopenedIdentity, recovery.mainIdentityBefore, 'replacement changed the main file identity')
  assert.equal(recovery.reopenedWait, 0, 'replacement child was not stopped')
  assert.equal(recovery.reopenedClosed, true, 'replacement close was not verified')
  assert.equal(recovery.reopenedAlphaPath, 'Alpha.md', 'replacement indexed search result is incorrect')
  return receipt
}

async function verifyInstalledIndexModules(lib, receipt) {
  receipt.indexModules = {}
  for (const file of (await readdir(lib)).filter(file => file.endsWith('.js'))) {
    const installed = await readFile(join(lib, file))
    const expected = await readFile(new URL(`../plugins/tocktutor/packages/tockbot-note-runtime/lib/${file}`, import.meta.url))
    assert.deepEqual(installed, expected, `installed ${file} differs from the source build`)
    receipt.indexModules[file] = createHash('sha256').update(installed).digest('hex')
  }
}

async function loadInstalledIndexRuntime(installation, receipt) {
  const require = createRequire(join(installation, 'package.json'))
  const packageFile = require.resolve('tockbot-note-runtime/package.json')
  assert.ok(!relative(installation, packageFile).startsWith('..') && !isAbsolute(relative(installation, packageFile)))
  const lib = join(dirname(packageFile), 'lib')
  await verifyInstalledIndexModules(lib, receipt)
  const SearchIndexProcess = (await import(pathToFileURL(join(lib, 'search-index-process.js')).href)).SearchIndexProcess
  const spawnOwnedProcess = (await import(pathToFileURL(join(lib, 'owned-process.js')).href)).spawnOwnedProcess
  return { require, packageFile, lib, SearchIndexProcess, spawnOwnedProcess }
}

/** Real installed index processes. The Windows caller supplies retained-handle observers. */
export async function verifyInstalledSearchIndex({ installation, root, receipt, checkpoint, observe, assertStopped, release }) {
  const { require, packageFile, lib, SearchIndexProcess, spawnOwnedProcess } = await loadInstalledIndexRuntime(installation, receipt)
  const tracked = new Map()
  const request = { directory: '', groups: [[{ field: 'tag', value: '#alpha' }]], limit: 1000 }
  const document = { path: 'Alpha.md', modifiedAt: 1, revision: 'revision-1' }
  const options = directory => ({ directory, identity: 'fixture', vaultId: 'vault:fixture', maxReadBytes: 1024 * 1024,
    list: async () => [document], read: async () => ({ ...document, content: '#alpha' }) })
  const originalSpawn = SearchIndexProcess.prototype.spawn
  // Observe the returned OS identity before native initialization/contended lease can exit.
  SearchIndexProcess.prototype.spawn = async function (invocation) {
    const owner = await originalSpawn.call(this, invocation)
    const entry = tracked.get(this)
    assert.ok(entry, 'untracked index generation')
    entry.pid = owner.pid
    entry.handle = observe?.(owner.pid)
    return owner
  }
  async function close(index) {
    await index.close()
    const entry = tracked.get(index)
    if (!entry) return
    if (entry.pid) {
      if (assertStopped) assertStopped(entry.handle)
      else {
        assert.throws(() => process.kill(entry.pid, 0), { code: 'ESRCH' })
        assert.throws(() => process.kill(-entry.pid, 0), { code: 'ESRCH' })
      }
      receipt.stoppedPids.push(entry.pid)
    }
    tracked.delete(index)
    if (entry.handle) release(entry.handle)
  }
  function create(config) {
    const index = new SearchIndexProcess(config)
    tracked.set(index, {})
    return index
  }
  const record = async name => { receipt.cases.push({ name, passed: true }); await checkpoint() }
  const phase = async name => { receipt.phase = name; await checkpoint() }
  receipt.stoppedPids = []
  try {
    await phase('public-runtime')
    const { Context } = require('@deepseek-ai/cordis')
    const { default: Runtime } = await import(pathToFileURL(join(lib, 'index.js')).href)
    const vault = join(root, 'vault'), state = join(root, 'state'), legacy = join(state, 'search-index/tocktutor-search-v2')
    await mkdir(vault); await mkdir(legacy, { recursive: true })
    await writeFile(join(legacy, 'sentinel.sqlite'), 'v2 must remain untouched')
    await writeFile(join(vault, 'Alpha.md'), '#alpha')
    await writeFile(join(vault, 'False.md'), 'alpha is plain text')
    await writeFile(join(vault, 'Other.md'), 'unrelated')
    const context = new Context()
    // The live runtime creates the actor internally; admit it to the same observer before spawn.
    const observedSpawn = SearchIndexProcess.prototype.spawn
    SearchIndexProcess.prototype.spawn = function (invocation) {
      if (!tracked.has(this)) tracked.set(this, {})
      return observedSpawn.call(this, invocation)
    }
    try {
      await context.plugin(Runtime, { ...Runtime.Config(), vaultRoot: vault, stateRoot: state })
      await context.noteVault.searchIndexReplacement
      const index = context.noteVault.searchIndex?.index
      assert.ok(index instanceof SearchIndexProcess)
      await bounded(index.whenReady, 15000, 'public indexed readiness')
      const binding = { id: context.noteVault.state.id, generation: context.noteVault.state.generation }
      const result = await context.noteVault.search({ mode: 'query', query: 'tag:alpha' }, binding, new AbortController().signal)
      assert.equal(result.scan.entries, 2)
      assert.deepEqual(result.matches.map(match => match.path), ['Alpha.md'])
      receipt.publicRuntime = { hostPid: process.pid, childPid: index.pid, scanned: result.scan.entries, matches: ['Alpha.md'] }
    } finally {
      await context.fiber.dispose()
      // Cordis swallowing disposal errors is not ownership proof.
      for (const index of [...tracked.keys()]) await close(index)
      SearchIndexProcess.prototype.spawn = observedSpawn
    }
    assert.equal(await readFile(join(legacy, 'sentinel.sqlite'), 'utf8'), 'v2 must remain untouched')
    await record('public-runtime')

    await phase('paged-unicode-incremental')
    const directory = join(root, 'paged'); await mkdir(directory)
    const documents = Array.from({ length: 300 }, (_, i) => ({ path: `${i}.md`, modifiedAt: 1, revision: `revision-${i}` }))
    let changed = false, inventories = 0
    const paged = create({ ...options(directory), list: async () => { inventories++; return documents },
      read: async path => ({ ...documents.find(document => document.path === path),
        revision: changed && path === '0.md' ? 'changed' : documents.find(document => document.path === path).revision,
        content: (path === '0.md' ? '漢字😀 '.repeat(12000) : '') + (changed && path === '0.md' ? '#beta' : '#alpha') }) })
    await bounded(paged.whenReady, 15000, 'paged readiness')
    assert.equal((await paged.search(request, new AbortController().signal))?.entries.length, 300)
    const unicode = await paged.search({ ...request, groups: [[{ field: 'tag', value: '漢字' }]] }, new AbortController().signal)
    assert.deepEqual(unicode?.entries.map(entry => entry.path), ['0.md'])
    const stale = paged.search(request, new AbortController().signal)
    changed = true; paged.invalidate('0.md')
    assert.equal(await stale, null)
    let current
    const publicationDeadline = performance.now() + 5000
    while (!current && performance.now() < publicationDeadline) {
      current = await paged.search({ ...request, groups: [[{ field: 'tag', value: '#beta' }]] }, new AbortController().signal)
      if (!current) await delay(10)
    }
    assert.ok(current, 'incremental publication timed out')
    assert.deepEqual(current.entries, [{ path: '0.md', modifiedMs: 1, revision: 'changed' }])
    assert.equal(inventories, 1)
    await close(paged); await record('paged-unicode-incremental')

    await phase('lease-contention-reopen')
    const leaseDirectory = join(root, 'lease'); await mkdir(leaseDirectory)
    const first = create(options(leaseDirectory)); await bounded(first.whenReady, 15000, 'lease owner readiness')
    const before = await stat(join(leaseDirectory, 'fixture-fixture.sqlite'))
    const leaseFixture = join(root, 'lease-observer.mjs'), leaseMarker = join(root, 'lease-result')
    await writeFile(leaseFixture, `import { createRequire } from 'node:module'; import { writeFileSync } from 'node:fs'; import { pathToFileURL } from 'node:url';
const sqlite = createRequire(${JSON.stringify(packageFile)})('sqlite3');
for (const method of ['run','all']) { const original=sqlite.Database.prototype[method];
 sqlite.Database.prototype[method]=function(sql,...args){
  if(!['BEGIN EXCLUSIVE','PRAGMA journal_mode'].includes(sql))return Reflect.apply(original,this,[sql,...args]);
  const callback=args.pop();return Reflect.apply(original,this,[sql,...args,function(error,...values){
   if(error||sql==='BEGIN EXCLUSIVE')writeFileSync(process.argv[3]+'.'+process.pid+'.json',JSON.stringify({code:error?.code??null,sql}));
   return callback.call(this,error,...values);
  }]);
 };
} await import(pathToFileURL(process.argv[2]).href);\n`)
    const leaseSpawn = function (invocation) { return observedSpawn.call(this, { ...invocation, args: [leaseFixture, invocation.args[0], leaseMarker] }) }
    SearchIndexProcess.prototype.spawn = leaseSpawn
    const contender = create(options(leaseDirectory))
    await assert.rejects(bounded(contender.whenReady, 15000, 'lease contender'))
    await close(contender)
    receipt.lease = { contenderCode: JSON.parse(await readFile(leaseMarker + '.' + contender.pid + '.json', 'utf8')).code }
    assert.equal(receipt.lease.contenderCode, 'SQLITE_BUSY')
    SearchIndexProcess.prototype.spawn = observedSpawn
    assert.equal((await first.search(request, new AbortController().signal))?.entries.length, 1)
    await close(first)
    let reads = 0
    const reopened = create({ ...options(leaseDirectory), read: async () => { reads++; return { ...document, content: '#alpha' } } })
    await bounded(reopened.whenReady, 15000, 'persistent reopen')
    assert.equal(reads, 0)
    assert.equal((await stat(join(leaseDirectory, 'fixture-fixture.sqlite'))).ino, before.ino)
    assert.equal((await reopened.search(request, new AbortController().signal))?.entries.length, 1)
    await close(reopened); await record('lease-contention-reopen')

    await phase('lease-first-creation')
    const raceDirectory = join(root, 'race'); await mkdir(raceDirectory)
    SearchIndexProcess.prototype.spawn = leaseSpawn
    const racers = [create(options(raceDirectory)), create(options(raceDirectory))]
    const outcomes = await bounded(Promise.allSettled(racers.map(index => index.whenReady)), 15000, 'first-creation race')
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1)
    assert.equal(outcomes.filter(outcome => outcome.status === 'rejected').length, 1)
    for (const index of racers) await close(index)
    receipt.lease.racingCodes = await Promise.all(racers.map(async index => JSON.parse(await readFile(leaseMarker + '.' + index.pid + '.json', 'utf8')).code))
    assert.equal(receipt.lease.racingCodes.filter(code => code === 'SQLITE_BUSY').length, 1)
    assert.equal(receipt.lease.racingCodes.filter(code => code === null).length, 1)
    SearchIndexProcess.prototype.spawn = observedSpawn
    await record('lease-first-creation')

    await phase('prepared-launch-cancellation')
    const entered = Promise.withResolvers(), held = Promise.withResolvers()
    const cancellationDirectory = join(root, 'cancel'); await mkdir(cancellationDirectory)
    SearchIndexProcess.prototype.spawn = invocation => spawnOwnedProcess({ ...invocation,
      admit: async launch => { entered.resolve(); await held.promise; return invocation.admit(launch) } })
    const cancelled = create(options(cancellationDirectory))
    try {
      await bounded(entered.promise, 5000, 'platform-prepared admission')
      assert.equal(cancelled.pid, undefined)
      const closing = cancelled.close()
      held.resolve(); await bounded(closing, 5000, 'pre-launch cancellation')
      assert.equal(cancelled.pid, undefined)
      await close(cancelled)
    } finally { held.resolve(); SearchIndexProcess.prototype.spawn = observedSpawn }
    await record('prepared-launch-cancellation')

    await phase('held-native-callback')
    const heldDirectory = join(root, 'held'); await mkdir(heldDirectory)
    const fixture = join(root, 'held.mjs'), marker = join(root, 'native-held.json')
    await writeFile(fixture, `import { createRequire } from 'node:module'; import { writeFileSync, renameSync } from 'node:fs'; import { pathToFileURL } from 'node:url';
const sqlite = createRequire(${JSON.stringify(packageFile)})('sqlite3'); const run = sqlite.Database.prototype.run;
sqlite.Database.prototype.run = function(sql, ...args) {
 if (sql !== 'DELETE FROM metadata WHERE key = ?') return Reflect.apply(run, this, [sql, ...args]);
 const callback = args.pop();
 return Reflect.apply(run, this, [sql, ...args, function(error) { writeFileSync(process.argv[3]+'.tmp', JSON.stringify({ pid: process.pid, error: error?.code ?? null })); renameSync(process.argv[3]+'.tmp',process.argv[3]); if(error) callback.call(this,error); }]);
}; await import(pathToFileURL(process.argv[2]).href);\n`)
    SearchIndexProcess.prototype.spawn = function (invocation) { return observedSpawn.call(this, { ...invocation, args: [fixture, invocation.args[0], marker] }) }
    const stalled = create(options(heldDirectory))
    const rejection = assert.rejects(stalled.whenReady, /stalled/)
    void rejection.catch(() => {})
    let native
    const markerDeadline = performance.now() + 15000
    while (!native && performance.now() < markerDeadline) {
      try { native = JSON.parse(await readFile(marker, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error; await delay(10) }
    }
    assert.ok(native, 'real native completion marker timed out')
    assert.equal(native.error, null); assert.equal(native.pid, stalled.pid)
    const started = performance.now()
    await new Promise(resolve => setImmediate(resolve))
    await bounded(rejection, 10000, 'native progress failure')
    await close(stalled)
    receipt.nativeStall = { childPid: native.pid, successfulCallbackWithheld: true, hostResponsive: true, stoppedAfterMarkerMs: performance.now() - started }
    assert.ok(receipt.nativeStall.stoppedAfterMarkerMs < 10000)
    await record('held-native-callback')
    receipt.passed = true
  } catch (error) { receipt.failure = error.message; throw error } finally {
    SearchIndexProcess.prototype.spawn = originalSpawn
    const results = await Promise.allSettled([...tracked.keys()].map(index => close(index)))
    for (const entry of tracked.values()) if (entry.handle) { try { release(entry.handle) } catch (error) { receipt.failure ??= error.message } }
    if (results.some(result => result.status === 'rejected')) receipt.failure ??= 'Index ownership cleanup failed'
    if (receipt.failure) receipt.passed = false
    receipt.phase = 'complete'; await checkpoint()
    assert.equal(receipt.passed, true, receipt.failure)
  }
}

async function waitForFile(file, milliseconds, label) {
  const deadline = performance.now() + milliseconds
  while (performance.now() < deadline) {
    try { return await readFile(file, 'utf8') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    await delay(20)
  }
  throw new Error(`${label} timed out`)
}

function fileIdentity(entry) {
  assert.equal(typeof entry.dev, 'bigint', 'main file device identity is not bigint')
  assert.equal(typeof entry.ino, 'bigint', 'main file inode identity is not bigint')
  return { dev: entry.dev.toString(), ino: entry.ino.toString() }
}

function hashBytes(bytes) { return createHash('sha256').update(bytes).digest('hex') }

function assertNonInheritable(probe, api, handle, label) {
  const flags = Buffer.alloc(4)
  assert.equal(probe.getHandleInformation(handle, api.address(flags)), 1, `${label} handle information failed`)
  assert.equal(flags.readUInt32LE() & 1, 0, `${label} observer handle is inheritable`)
  return flags.readUInt32LE()
}

async function assertMainUnchanged(filename, beforeBytes, beforeIdentity) {
  const afterBytes = await readFile(filename)
  const afterIdentity = fileIdentity(await stat(filename, { bigint: true }))
  assert.deepEqual(afterBytes, beforeBytes, 'main index bytes changed')
  assert.deepEqual(afterIdentity, beforeIdentity, 'main index identity changed')
  return { bytes: afterBytes, identity: afterIdentity }
}

async function waitForSignaled(api, handle, label, milliseconds = 10000) {
  const startedAt = Date.now()
  const deadline = performance.now() + milliseconds
  const waitValues = []
  let polls = 0
  let initialWait
  let finalWait
  while (performance.now() < deadline) {
    const value = api.waitForSingleObject(handle, 0)
    polls += 1
    initialWait ??= value
    if (waitValues.length === 0 || waitValues.at(-1) !== value) waitValues.push(value)
    assert.ok(value === 0 || value === 258, `${label} returned invalid wait value ${value}`)
    if (value === 0) {
      finalWait = value
      return { label, initialWait, finalWait, waitValues, polls, startedAt, signaledAt: Date.now() }
    }
    await delay(20)
  }
  throw new Error(`${label} did not signal before the fixed deadline`)
}

function recoveryLeaseFixture(packageFile) {
  return `import { createRequire } from 'node:module'; import { writeFileSync, renameSync } from 'node:fs'; import { pathToFileURL } from 'node:url';
const sqlite = createRequire(${JSON.stringify(packageFile)})('sqlite3');
for (const method of ['all','run']) { const original = sqlite.Database.prototype[method]; sqlite.Database.prototype[method] = function(sql, ...args) {
  if (!['PRAGMA journal_mode','BEGIN EXCLUSIVE'].includes(sql)) return Reflect.apply(original, this, [sql, ...args]);
  const callback = args.pop(); return Reflect.apply(original, this, [sql, ...args, function(error, ...values) {
    if (error || sql === 'BEGIN EXCLUSIVE') {
      writeFileSync(process.argv[3] + '.tmp', JSON.stringify({ code: error?.code ?? null, sql, pid: process.pid }));
      renameSync(process.argv[3] + '.tmp', process.argv[3]);
    }
    return callback.call(this, error, ...values);
  }]);
}; }
await import(pathToFileURL(process.argv[2]).href);\n`
}

async function runInstalledIndexRecovery({ installation, root, receipt, checkpoint, observe, assertStopped, release, api, probe }) {
  assert.equal(typeof probe?.terminateProcess, 'function', 'verification-only TerminateProcess binding is unavailable')
  const { packageFile, lib, SearchIndexProcess, spawnOwnedProcess } = await loadInstalledIndexRuntime(installation, receipt)
  const fixture = fileURLToPath(new URL('../plugins/tocktutor/packages/tockbot-note-runtime/tests/fixtures/index-clock-child.mjs', import.meta.url))
  const childEntry = join(lib, 'search-index-child.js')
  const clockHarness = await import(pathToFileURL(join(dirname(fixture), '../search-index-native-clock-harness.mjs')).href)
  receipt.clockCases = []
  for (const mode of clockHarness.nativeClockModes) {
    const item = { mode, passed: false }
    receipt.clockCases.push(item)
    receipt.phase = `clock-${mode}`
    await checkpoint(receipt.phase)
    try {
      const measurement = await clockHarness.runNativeClockCase(mode, { SearchIndexProcess, NativeProgressClock: (await import(pathToFileURL(join(lib, 'search-index-progress.js')).href)).NativeProgressClock, spawnOwnedProcess }, {
        fixture, childEntry, root, observe, release,
        assertStopped: handle => assertStopped(handle),
        onDiagnostic: diagnostic => { item.diagnostic = diagnostic },
      })
      Object.assign(item, measurement, { passed: true })
      await checkpoint(receipt.phase)
    } catch (error) {
      item.failure = String(error.message ?? error).slice(0, 4096)
      throw error
    }
  }

  receipt.phase = 'recovery-readiness'
  receipt.recovery = { passed: false, phase: receipt.phase }
  await checkpoint(receipt.phase)
  const document = { path: 'Alpha.md', modifiedAt: 1, revision: 'revision-1' }
  const hostFile = join(root, 'index-recovery-host.mjs')
  const childWrapperFile = join(root, 'index-recovery-child-wrapper.mjs')
  const readyFile = join(root, 'index-recovery-host.ready')
  const blockedFile = join(root, 'index-recovery-host.blocked')
  const expiredFile = join(root, 'index-recovery-host.expired')
  const hostFailureFile = join(root, 'index-recovery-host.failure')
  const hostModule = pathToFileURL(join(lib, 'search-index-process.js')).href
  // Block the actual index child so a socket-close handler cannot masquerade as Job cleanup.
  await writeFile(childWrapperFile, `import { existsSync, writeFileSync, renameSync } from 'node:fs'; import { pathToFileURL } from 'node:url';
const [entry, ready, blocked, expired] = process.argv.slice(2);
const blockDurationMs = ${INDEX_CHILD_BLOCK_MS};
const timer = setInterval(() => {
  if (!existsSync(ready)) return;
  clearInterval(timer);
  writeFileSync(blocked + '.tmp', JSON.stringify({ childPid: process.pid, execPath: process.execPath, at: Date.now() }));
  renameSync(blocked + '.tmp', blocked);
  const result = Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, blockDurationMs);
  writeFileSync(expired, JSON.stringify({ childPid: process.pid, result, blockDurationMs, at: Date.now() }));
  process.exit(1);
}, 10);
const lifetime = setTimeout(() => {
  writeFileSync(expired, JSON.stringify({ childPid: process.pid, result: 'wrapper-lifetime-expired', blockDurationMs, at: Date.now() }));
  process.exit(1);
}, blockDurationMs + 15000);
try { await import(pathToFileURL(entry).href); } catch (error) {
  clearInterval(timer); clearTimeout(lifetime); process.exitCode = 1; process.exit(1);
}
`, { flag: 'wx' })
  await writeFile(hostFile, `import { SearchIndexProcess } from ${JSON.stringify(hostModule)};
import { writeFileSync, renameSync } from 'node:fs';
const root = ${JSON.stringify(root)}, wrapper = ${JSON.stringify(childWrapperFile)}, ready = ${JSON.stringify(readyFile)}, failed = ${JSON.stringify(hostFailureFile)};
const document = ${JSON.stringify(document)};
const originalSpawn = SearchIndexProcess.prototype.spawn;
SearchIndexProcess.prototype.spawn = function(options) {
  return originalSpawn.call(this, { ...options, args: [wrapper, options.args[0], ${JSON.stringify(readyFile)}, ${JSON.stringify(blockedFile)}, ${JSON.stringify(expiredFile)}] });
};
const index = new SearchIndexProcess({ directory: root, identity: 'fixture', vaultId: 'vault:fixture', maxReadBytes: 1024,
  list: async () => [document], read: async () => ({ ...document, content: '#alpha' }) });
try {
  await index.whenReady;
  writeFileSync(ready + '.tmp', JSON.stringify({ hostPid: process.pid, childPid: index.pid, execPath: process.execPath }));
  renameSync(ready + '.tmp', ready);
} catch (error) { writeFileSync(failed, String(error?.stack ?? error)); process.exitCode = 1; process.exit(1); }
`, { flag: 'wx' })
  const host = spawn(process.execPath, [hostFile], {
    cwd: root, env: { ...process.env, PATH: dirname(process.execPath) }, windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  const hostPid = host.pid
  assert.ok(Number.isSafeInteger(hostPid) && hostPid > 0, 'nested Host PID is unavailable')
  const hostClosed = new Promise((resolve, reject) => {
    host.once('close', (code, signal) => resolve({ code, signal }))
    host.once('error', reject)
  })
  void hostClosed.catch(() => {})
  let hostHandle
  let childHandle
  let contender
  let reopened
  let originalSpawn
  let leaseFixture, leaseMarker
  const tracked = new Map()
  let emergencyCleanup = false
  const cleanupErrors = []
  // Entries are removed after one release attempt. Never deduplicate numeric
  // handle values across generations: Windows may reuse a closed handle.
  const releaseObserver = (handle, label) => {
    if (handle === undefined) return
    try { release(handle) } catch (error) { cleanupErrors.push(`${label}: ${error.message}`) }
  }
  const closeTracked = async (index, label) => {
    let closeFailure
    try { await index.close() } catch (error) { closeFailure = error }
    const entry = tracked.get(index) // close() also settles a pending spawn.
    try {
      assert.ok(entry?.pid && entry.handle !== undefined, `${label} observer was not retained`)
      const waited = api.waitForSingleObject(entry.handle, 0)
      assert.equal(waited, 0, `${label} handle must signal when close returns`)
      if (label === 'contender') receipt.recovery.contenderWait = waited
      if (label === 'replacement') receipt.recovery.reopenedWait = waited
    } catch (error) { closeFailure ??= error }
    tracked.delete(index)
    releaseObserver(entry?.handle, `${label} observer release`)
    if (label === 'contender' && closeFailure === undefined) receipt.recovery.contenderClosed = true
    if (label === 'replacement' && closeFailure === undefined) receipt.recovery.reopenedClosed = true
    if (closeFailure) throw closeFailure
  }
  const trackedSpawn = async function (invocation) {
    const useContenderFixture = contender !== undefined && reopened === undefined
    const actual = useContenderFixture
      ? { ...invocation, args: [leaseFixture, invocation.args[0], leaseMarker] }
      : invocation
    const owner = await originalSpawn.call(this, actual)
    const entry = tracked.get(this) ?? {}
    tracked.set(this, entry)
    entry.pid = owner.pid
    try { entry.handle = observe(owner.pid) }
    catch (error) { await owner.terminate().catch(() => {}); throw error }
    return owner
  }
  try {
    receipt.recovery.hostPid = hostPid
    receipt.recovery.phase = 'host-readiness'
    await checkpoint(receipt.recovery.phase)
    const ready = JSON.parse(await waitForFile(readyFile, 15000, 'nested Host readiness'))
    assert.equal(ready.hostPid, hostPid)
    assert.equal(ready.execPath, process.execPath, 'nested Host did not use the copied executable')
    receipt.recovery.hostExecPath = ready.execPath
    const childPid = ready.childPid
    assert.ok(Number.isSafeInteger(childPid) && childPid > 0, 'nested index child PID is invalid')
    receipt.recovery.childPid = childPid
    hostHandle = observe(hostPid, 0x00101001)
    childHandle = observe(childPid)
    receipt.recovery.observerHandleFlags = {
      host: assertNonInheritable(probe, api, hostHandle, 'Host'),
      child: assertNonInheritable(probe, api, childHandle, 'child'),
    }
    const hostInitialWait = api.waitForSingleObject(hostHandle, 0)
    const childInitialWait = api.waitForSingleObject(childHandle, 0)
    assert.equal(hostInitialWait, 258, 'nested Host must be live before death')
    assert.equal(childInitialWait, 258, 'nested index child must be live before death')
    receipt.recovery.hostInitialWait = hostInitialWait
    receipt.recovery.childInitialWait = childInitialWait
    const blocked = JSON.parse(await waitForFile(blockedFile, 5000, 'blocked child marker'))
    const blockedObservedAt = performance.now()
    assert.equal(blocked.childPid, childPid)
    assert.equal(blocked.execPath, process.execPath, 'index child did not use the copied executable')
    receipt.recovery.childExecPath = blocked.execPath
    assert.ok(Number.isSafeInteger(blocked.at) && blocked.at > 0, 'blocked child marker timestamp is invalid')
    receipt.recovery.blockedAt = blocked.at
    assert.equal(api.waitForSingleObject(hostHandle, 0), 258)
    assert.equal(api.waitForSingleObject(childHandle, 0), 258)

    const filename = join(root, 'fixture-fixture.sqlite')
    const beforeStat = await stat(filename, { bigint: true })
    const beforeBytes = await readFile(filename)
    const beforeIdentity = fileIdentity(beforeStat)
    receipt.recovery.mainIdentityBefore = beforeIdentity
    receipt.recovery.mainBytesBeforeSha256 = hashBytes(beforeBytes)
    receipt.recovery.mainBytesBeforeLength = beforeBytes.length
    leaseFixture = join(root, 'index-recovery-contender.mjs')
    leaseMarker = join(root, 'index-recovery-contender.json')
    await writeFile(leaseFixture, recoveryLeaseFixture(packageFile), { flag: 'wx' })
    originalSpawn = SearchIndexProcess.prototype.spawn
    SearchIndexProcess.prototype.spawn = trackedSpawn
    let contenderReads = 0
    contender = new SearchIndexProcess({ directory: root, identity: 'fixture', vaultId: 'vault:fixture', maxReadBytes: 1024,
      list: async () => [document], read: async () => { contenderReads += 1; return { ...document, content: '#alpha' } } })
    const contenderFailure = contender.whenReady.then(() => undefined, error => error)
    const leaseResult = JSON.parse(await waitForFile(leaseMarker, 15000, 'contender SQLite callback'))
    assert.equal(leaseResult.code, 'SQLITE_BUSY', 'contender callback was not real SQLITE_BUSY')
    assert.ok(['PRAGMA journal_mode', 'BEGIN EXCLUSIVE'].includes(leaseResult.sql), 'BUSY must originate in lease acquisition')
    assert.equal(leaseResult.pid, contender.pid, 'lease callback must belong to the contender')
    const contenderError = await bounded(contenderFailure, 15000, 'contender rejection')
    assert.ok(contenderError instanceof Error, 'contender unexpectedly became ready')
    await closeTracked(contender, 'contender')
    assert.equal(contenderReads, 0)
    const afterContender = await assertMainUnchanged(filename, beforeBytes, beforeIdentity)
    receipt.recovery.contenderReads = contenderReads
    receipt.recovery.contenderSql = leaseResult.sql
    receipt.recovery.contenderPid = contender.pid
    receipt.recovery.mainAfterContenderSha256 = hashBytes(afterContender.bytes)

    receipt.recovery.phase = 'host-termination'
    await checkpoint(receipt.recovery.phase)
    terminateWindowsIndexHost(api, probe, hostHandle, childHandle, receipt.recovery)
    const deathDeadline = performance.now() + 10000
    const hostWaitReceipt = await waitForSignaled(api, hostHandle, 'nested Host', Math.max(1, deathDeadline - performance.now()))
    const childWaitReceipt = await waitForSignaled(api, childHandle, 'nested index child', Math.max(1, deathDeadline - performance.now()))
    const blockedToChildSignalMs = performance.now() - blockedObservedAt
    const expiredMarker = await readFile(expiredFile, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    assert.equal(expiredMarker, null, 'finite child block expired before Job cleanup')
    assert.ok(blockedToChildSignalMs < INDEX_CHILD_BLOCK_MS - INDEX_CHILD_BLOCK_MARGIN_MS,
      `child Job cleanup arrived too close to finite block expiry: ${blockedToChildSignalMs}ms`)
    receipt.recovery.blockExpired = expiredMarker !== null
    receipt.recovery.blockDurationMs = INDEX_CHILD_BLOCK_MS
    receipt.recovery.blockedToChildSignalMs = blockedToChildSignalMs
    receipt.recovery.hostWaitReceipt = hostWaitReceipt
    receipt.recovery.childWaitReceipt = childWaitReceipt
    await bounded(hostClosed, 5000, 'nested Host close')
    const afterDeath = await assertMainUnchanged(filename, beforeBytes, beforeIdentity)
    receipt.recovery.mainIdentityAfter = afterDeath.identity
    receipt.recovery.mainBytesAfterSha256 = hashBytes(afterDeath.bytes)
    receipt.recovery.mainBytesAfterLength = afterDeath.bytes.length
    receipt.recovery.mainUnchanged = true
    receipt.recovery.identityUnchanged = true
    receipt.recovery.hostWait = hostWaitReceipt.finalWait
    receipt.recovery.childWait = childWaitReceipt.finalWait
    receipt.recovery.contenderBusyCode = leaseResult.code
    assertWindowsIndexRecoveryReopenProof(receipt.recovery)

    receipt.recovery.phase = 'replacement'
    await checkpoint(receipt.recovery.phase)
    contender = undefined
    let reopenReads = 0
    reopened = new SearchIndexProcess({ directory: root, identity: 'fixture', vaultId: 'vault:fixture', maxReadBytes: 1024,
      list: async () => [document], read: async () => { reopenReads += 1; return { ...document, content: '#alpha' } } })
    await bounded(reopened.whenReady, 15000, 'replacement readiness')
    assert.equal(reopenReads, 0)
    const replacementIdentity = fileIdentity(await stat(filename, { bigint: true }))
    assert.deepEqual(replacementIdentity, beforeIdentity, 'replacement changed the main file identity')
    const result = await reopened.search({ directory: '', groups: [[{ field: 'tag', value: '#alpha' }]], limit: 10 }, new AbortController().signal)
    assert.deepEqual(result?.entries.map(entry => entry.path), ['Alpha.md'])
    receipt.recovery.reopenedPid = reopened.pid
    receipt.recovery.reopenReads = reopenReads
    receipt.recovery.reopenedIdentity = replacementIdentity
    receipt.recovery.reopenedAlphaPath = result?.entries.map(entry => entry.path).join(',')
    await closeTracked(reopened, 'replacement')
    receipt.recovery.passed = true
    receipt.recovery.phase = 'complete'
    receipt.recovery.emergencyCleanup = false
    receipt.passed = true
  } catch (error) {
    const hostFailure = await readFile(hostFailureFile, 'utf8').catch(() => '')
    receipt.recovery.failure = `${String(error.message ?? error)}${hostFailure ? `; nested Host: ${hostFailure.slice(0, 4096)}` : ''}`.slice(0, 8192)
    throw error
  } finally {
    SearchIndexProcess.prototype.spawn = originalSpawn ?? SearchIndexProcess.prototype.spawn
    for (const index of [...tracked.keys()]) {
      try { await closeTracked(index, 'unclassified') } catch (error) { cleanupErrors.push(`index cleanup: ${error.message}`) }
    }
    if (hostHandle !== undefined) {
      try {
        const waited = api.waitForSingleObject(hostHandle, 0)
        if (waited === 258) {
          emergencyCleanup = true
          const result = probe.terminateProcess(hostHandle, 1)
          if (result !== 1) cleanupErrors.push('emergency Host TerminateProcess failed')
        } else if (waited !== 0) cleanupErrors.push(`emergency Host wait returned ${waited}`)
      } catch (error) { cleanupErrors.push(`emergency Host cleanup: ${error.message}`) }
    } else if (host.exitCode === null && host.signalCode === null) {
      // Failure-only fallback; a passing run uses the observer-held TerminateProcess call above.
      emergencyCleanup = true
      try { host.kill('SIGKILL') } catch (error) { cleanupErrors.push(`emergency Host kill: ${error.message}`) }
    }
    try { await bounded(hostClosed, 5000, 'nested Host cleanup') } catch (error) { cleanupErrors.push(error.message) }
    releaseObserver(childHandle, 'nested child observer release')
    releaseObserver(hostHandle, 'nested Host observer release')
    if (emergencyCleanup) receipt.recovery.emergencyCleanup = true
    if (cleanupErrors.length) receipt.recovery.cleanupErrors = cleanupErrors.slice(0, 16).map(error => String(error).slice(0, 1024))
    if (emergencyCleanup || cleanupErrors.length) {
      receipt.passed = false
      receipt.recovery.passed = false
    }
    await checkpoint(receipt.recovery.phase === 'complete' && !emergencyCleanup && !cleanupErrors.length ? 'complete' : 'recovery-cleanup')
  }
}

export async function verifyInstalledSearchIndexRecovery({ installation, root, receipt, checkpoint, observe, assertStopped, release, api, probe }) {
  try {
    await runInstalledIndexRecovery({ installation, root, receipt, checkpoint, observe, assertStopped, release, api, probe })
    assertWindowsIndexRecoveryReceipt(receipt)
  } catch (error) {
    receipt.passed = false
    receipt.failure = String(error.message ?? error).slice(0, 8192)
    throw error
  } finally {
    receipt.phase = 'complete'
    await checkpoint('complete')
  }
}
