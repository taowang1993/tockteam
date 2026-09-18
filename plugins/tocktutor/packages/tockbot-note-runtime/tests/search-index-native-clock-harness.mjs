import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const MODES = ['progress', 'stall', 'tail']

async function rows(log) {
  const text = await readFile(log, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  return text.slice(0, text.lastIndexOf('\n') + 1).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
}

async function bounded(promise, milliseconds) {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Fixture deadline exceeded')), milliseconds)
    })])
  } finally {
    clearTimeout(timer)
  }
}

function summarize(rows) {
  const counts = {}
  for (const row of rows) counts[row.kind] = (counts[row.kind] ?? 0) + 1
  return {
    rows: rows.length,
    counts,
    operationIds: [...new Set(rows.filter(row => Number.isSafeInteger(row.id)).map(row => row.id))].slice(0, 32),
    last: rows.at(-1)?.kind ?? null,
  }
}

function assertStopped(pid, assertHandleStopped) {
  if (assertHandleStopped) {
    assertHandleStopped()
    return
  }
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
  if (process.platform !== 'win32') assert.throws(() => process.kill(-pid, 0), { code: 'ESRCH' })
}

/**
 * One shared native-clock assertion body used by source and fresh-installed JS.
 * The child entry determines both sibling modules and package dependency roots.
 */
export async function runNativeClockCase(mode, runtime, options) {
  assert.ok(MODES.includes(mode), `unknown native clock mode: ${mode}`)
  const { SearchIndexProcess, NativeProgressClock, spawnOwnedProcess } = runtime
  const { fixture, childEntry, root, observe, release, assertStopped: assertHandleStopped, onDiagnostic } = options
  assert.ok(isAbsolute(root), 'native-clock cases require an owned supervisor root')
  const directory = await mkdtemp(join(root, `index-clock-${mode}-`))
  const log = join(directory, 'native.jsonl')
  const host = []
  const failures = []
  const tracked = new Map()
  const originalObserve = NativeProgressClock.prototype.observe
  const originalSpawn = SearchIndexProcess.prototype.spawn
  let index
  let traffic
  let failure
  let diagnosticRows
  let measurement
  let cleanupVerified = true
  const verifiedClosures = new WeakSet()
  const closeIndex = async current => {
    const alreadyVerified = verifiedClosures.has(current)
    let closeFailure
    const closing = performance.now()
    try {
      await current.close()
      assert.ok(performance.now() - closing < 5000, 'native-clock index close exceeded five-second bound')
    } catch (error) {
      closeFailure = error
    }
    const entry = tracked.get(current) // close() also settles a pending spawn.
    if (!alreadyVerified && !entry) closeFailure ??= new Error('native-clock owner tracking entry was lost before verification')
    try {
      if (entry?.pid) {
        if (entry.handle !== undefined && assertHandleStopped) assertHandleStopped(entry.handle)
        else assertStopped(entry.pid)
      }
    } catch (error) {
      closeFailure ??= error
    } finally {
      tracked.delete(current)
      if (entry?.handle !== undefined && release) {
        try { release(entry.handle) } catch (error) { closeFailure ??= error }
      }
    }
    if (closeFailure) {
      cleanupVerified = false
      throw closeFailure
    }
    verifiedClosures.add(current)
  }
  const spawn = async function (invocation) {
    assert.equal(invocation.args[0], childEntry, 'native-clock fixture received an unexpected child entry')
    const owner = await spawnOwnedProcess({ ...invocation, args: [fixture, childEntry, log, mode] })
    const entry = tracked.get(this) ?? {}
    tracked.set(this, entry)
    entry.pid = owner.pid
    try {
      if (observe) entry.handle = observe(owner.pid)
    } catch (error) {
      await owner.terminate().catch(() => {})
      throw error
    }
    return owner
  }
  try {
    NativeProgressClock.prototype.observe = function (event) {
      host.push({ ...event, at: performance.now() })
      return originalObserve.call(this, event)
    }
    SearchIndexProcess.prototype.spawn = spawn
    const document = { path: 'Alpha.md', modifiedAt: 1, revision: '1' }
    index = new SearchIndexProcess({ directory, identity: 'fixture', vaultId: 'vault:fixture', maxReadBytes: 1024,
      list: async () => [document], read: async () => ({ ...document, content: '#alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu' }),
      failed: error => { failures.push({ error, at: performance.now() }) } })
    if (mode === 'stall') traffic = setInterval(() => index.invalidate('Alpha.md'), 250)
    if (mode === 'progress') {
      await bounded(index.whenReady, 12000)
      const lateDeadline = performance.now() + 3000
      while (!(await rows(log)).some(row => row.kind === 'late-complete') && performance.now() < lateDeadline) await delay(25)
      assert.ok((await rows(log)).some(row => row.kind === 'late-complete'), 'late callback verification deadline')
      const result = await index.search({ directory: '', groups: [[{ field: 'tag', value: '#alpha' }]], limit: 10 }, new AbortController().signal)
      assert.deepEqual(result?.entries.map(entry => entry.path), ['Alpha.md'])
      assert.deepEqual(failures, [])
    } else await assert.rejects(bounded(index.whenReady, 12000), /stalled/)
    const native = await rows(log)
    const start = native.find(row => row.kind === 'commit-start')
    assert.ok(start)
    assert.ok(!native.some(row => row.kind === 'fixture-error'))
    const own = host.filter(row => row.id === start.id)
    const began = own.find(row => row.phase === 'start')
    assert.ok(began)
    const continued = native.filter(row => row.kind === 'continuation')
    assert.ok(continued.every(row => row.actual === row.captured), 'late callback must restore its captured operation, not the invoker')
    if (mode === 'progress') {
      const end = own.find(row => row.phase === 'end')
      assert.ok(end && end.at - began.at > 5000, 'one finite commit+drain must outlast five seconds')
      const ticks = own.filter(row => row.phase !== 'end')
      for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i].at - ticks[i - 1].at < 4000)
      const deliveries = native.filter(row => row.kind === 'delivery')
      assert.equal(new Set(deliveries.map(row => row.sequence)).size, deliveries.length)
      assert.ok(deliveries.every(row => row.id !== row.caller))
      const late = native.findIndex(row => row.kind === 'late-delivery')
      const complete = native.findIndex(row => row.kind === 'late-complete')
      assert.ok(late > 0 && complete > late)
      assert.ok(!native.slice(late, complete + 1).some(row => row.kind === 'event'), 'ended callback/follow-on must not renew either operation')
      assert.ok(native.slice(late, complete).some(row => row.kind === 'late-follow-on' && row.captured === start.id && row.actual === start.id && row.value === 1 && row.error === null))
      assert.ok(native.some(row => row.kind === 'commit-resolved' && row.id === start.id))
    } else {
      const last = own.filter(row => row.phase !== 'end').at(-1)
      assert.ok(last)
      assert.equal(own.some(row => row.phase === 'end'), false)
      assert.equal(failures.length, 1)
      const elapsed = failures[0].at - last.at
      assert.ok(elapsed >= 4900 && elapsed < 6500, `stall measured from last Host-observed own progress: ${elapsed}ms`)
      if (mode === 'stall') {
        const other = native.find(row => row.kind === 'other-start')
        assert.ok(other)
        assert.notEqual(other.id, start.id)
        assert.ok(native.filter(row => row.kind === 'other-native' && row.value === 1 && row.error === null).length >= 5)
        assert.ok(native.filter(row => row.kind === 'invalidation').length >= 5)
      } else {
        assert.ok(native.some(row => row.kind === 'commit-resolved' && row.id === start.id))
        assert.ok(native.some(row => row.kind === 'drain-held' && row.id === start.id))
      }
    }
    const closing = performance.now()
    const pid = tracked.get(index)?.pid
    await closeIndex(index)
    measurement = {
      mode,
      pid,
      operation: start.id,
      callbacks: native.filter(row => row.kind === 'native').length,
      commitMs: own.find(row => row.phase === 'end') ? own.find(row => row.phase === 'end').at - began.at : null,
      stallAfterOwnProgressMs: failures[0] ? failures[0].at - own.filter(row => row.phase === 'progress').at(-1).at : null,
      ownProgressOffsetsMs: own.filter(row => row.phase === 'progress').map(row => row.at - began.at).slice(0, 64),
      otherNativeCompletions: native.filter(row => row.kind === 'other-native').length,
      childInvalidations: native.filter(row => row.kind === 'invalidation').length,
      lateFollowOnVerified: native.some(row => row.kind === 'late-complete'),
      closeMs: performance.now() - closing,
      stopped: true,
      fixture: summarize(native),
    }
  } catch (error) {
    failure = error
    diagnosticRows = await rows(log).catch(() => [])
  } finally {
    clearInterval(traffic)
    if (index) {
      try { await closeIndex(index) } catch (error) { cleanupVerified = false; failure ??= error }
    }
    for (const current of [...tracked.keys()]) {
      try { await closeIndex(current) } catch (error) { cleanupVerified = false; failure ??= error }
    }
    SearchIndexProcess.prototype.spawn = originalSpawn
    NativeProgressClock.prototype.observe = originalObserve
    if (cleanupVerified && tracked.size === 0) await rm(directory, { recursive: true, force: true })
    else failure ??= new Error(`Native-clock cleanup unverified; retained ${directory}`)
  }
  if (failure) {
    const diagnostic = { mode, failure: String(failure.message ?? failure), fixture: summarize(diagnosticRows ?? []), measurements: measurement ?? null }
    onDiagnostic?.(diagnostic)
    throw failure
  }
  return measurement
}

export { MODES as nativeClockModes }
