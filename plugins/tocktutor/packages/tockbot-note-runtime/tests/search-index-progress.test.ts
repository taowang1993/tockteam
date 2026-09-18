import assert from 'node:assert/strict'
import { test } from 'node:test'
import sqlite3 from 'sqlite3'
import { NativeOperationProgress, NativeProgressClock, type NativeProgressEvent } from '../src/search-index-progress.ts'

test('real SQLite callbacks preserve statement results and exclude native errors from progress', { timeout: 5000 }, async () => {
  const events: NativeProgressEvent[] = []
  const clock = new NativeProgressClock()
  const tracker = new NativeOperationProgress(event => { events.push(event); clock.observe(event) }, error => { throw error })
  const database = await tracker.run(() => new Promise<sqlite3.Database>((resolve, reject) => {
    const raw: sqlite3.Database = new sqlite3.Database(':memory:', tracker.wrap((error: Error | null): void => error ? reject(error) : resolve(raw)))
  }))
  const execute = (sql: string) => new Promise<{ id: number; changes: number }>((resolve, reject) => {
    database.run(sql, tracker.wrap(function (this: sqlite3.RunResult, error: Error | null) {
      if (error) reject(error)
      else resolve({ id: this.lastID, changes: this.changes })
    }))
  })
  try {
    await tracker.run(async () => {
      await execute('CREATE TABLE entry(id INTEGER PRIMARY KEY)')
      assert.deepEqual(await execute('INSERT INTO entry DEFAULT VALUES'), { id: 1, changes: 1 })
    })
    await assert.rejects(tracker.run(() => execute('INVALID SQL')), { code: 'SQLITE_ERROR' })
  } finally {
    await tracker.run(() => new Promise<void>((resolve, reject) => database.close(tracker.wrap((error: Error | null) => error ? reject(error) : resolve()))))
  }
  assert.equal(events.filter(event => event.phase === 'progress' && event.id === 2).length, 2)
  assert.equal(events.filter(event => event.phase === 'progress' && event.id === 3).length, 0)
  assert.equal(clock.isStalled(performance.now() + 6000), false)
})

test('native callbacks retain operation identity, receiver, arguments and return value', async () => {
  const events: NativeProgressEvent[] = []
  const progress = new NativeOperationProgress(event => { events.push(event) }, error => { throw error })
  const first = Promise.withResolvers<void>()
  let callback!: (this: { tag: string }, error: null, value: number) => string
  const a = progress.run(async () => {
    callback = progress.wrap(function (this: { tag: string }, _error: null, value: number) { return `${this.tag}:${value}` })
    await first.promise
  })
  await new Promise<void>(resolve => setImmediate(resolve))
  await progress.run(async () => { assert.equal(callback.call({ tag: 'original' }, null, 7), 'original:7') })
  assert.deepEqual(events.filter(event => event.phase === 'progress'), [{ phase: 'progress', id: 1 }])
  first.resolve()
  await a
  callback.call({ tag: 'late' }, null, 8)
  assert.equal(events.filter(event => event.phase === 'progress').length, 1)
})

test('native work does not start before its start notification is delivered', async () => {
  const start = Promise.withResolvers<void>()
  let entered = false
  const progress = new NativeOperationProgress(event => event.phase === 'start' ? start.promise : undefined, error => { throw error })
  const work = progress.run(async () => { entered = true })
  await Promise.resolve()
  assert.equal(entered, false)
  start.resolve()
  await work
  assert.equal(entered, true)
})

test('callback failure does not renew progress and transport failure is surfaced', async () => {
  const events: NativeProgressEvent[] = []
  const failures: Error[] = []
  const progress = new NativeOperationProgress(event => {
    events.push(event)
    if (event.phase === 'progress') return Promise.reject(new Error('channel failed'))
  }, error => { failures.push(error) })
  await assert.rejects(progress.run(async () => {
    const callback = progress.wrap((_error: Error | null) => {})
    callback(new Error('native failure'))
    assert.equal(events.filter(event => event.phase === 'progress').length, 0)
    callback(null)
    await new Promise<void>(resolve => setImmediate(resolve))
  }), /channel failed/u)
  assert.equal(failures[0]?.message, 'channel failed')
})

test('native callback continuations retain their original context when invoked by another operation', async () => {
  const events: NativeProgressEvent[] = []
  const progress = new NativeOperationProgress(event => { events.push(event) }, error => { throw error })
  const held = Promise.withResolvers<void>()
  let follow!: (error: null) => void
  let callback!: (error: null) => void
  const first = progress.run(async () => {
    callback = progress.wrap((_error: null) => { follow = progress.wrap((_nextError: null) => {}) })
    await held.promise
  })
  await new Promise<void>(resolve => setImmediate(resolve))
  try {
    await progress.run(async () => { callback(null); follow(null) })
    assert.deepEqual(events.filter(event => event.phase === 'progress').map(event => event.id), [1, 1])
  } finally { held.resolve(); await first }
})

test('unscoped and completed callbacks cannot enroll follow-on callbacks into a current operation', async () => {
  const events: NativeProgressEvent[] = []
  const progress = new NativeOperationProgress(event => { events.push(event) }, error => { throw error })
  let follow!: (error: null) => void
  const body = (_error: null) => { follow = progress.wrap((_nextError: null) => {}) }
  const unscoped = progress.wrap(body)
  let completed!: (error: null) => void
  await progress.run(async () => { completed = progress.wrap(body) })
  await progress.run(async () => {
    unscoped(null); follow(null)
    completed(null); follow(null)
  })
  assert.equal(events.filter(event => event.phase === 'progress').length, 0)
})

for (const phase of ['start', 'end'] as const) {
  test(`${phase} delivery failure reports fatal failure once and poisons future work`, async () => {
    const events: NativeProgressEvent[] = []
    const failures: Error[] = []
    let executions = 0
    const progress = new NativeOperationProgress(event => {
      events.push(event)
      if (event.phase === phase) return Promise.reject(new Error(`${phase} transport failed`))
    }, error => { failures.push(error) })
    const work = () => progress.run(async () => { executions += 1 })
    await assert.rejects(work(), new RegExp(`${phase} transport failed`, 'u'))
    await assert.rejects(work(), new RegExp(`${phase} transport failed`, 'u'))
    assert.equal(failures.length, 1)
    assert.equal(executions, phase === 'start' ? 0 : 1)
    assert.deepEqual(events.map(event => event.phase), phase === 'start' ? ['start'] : ['start', 'end'])
  })
}

test('transport failure rejects an already active operation without waiting for its native callback', { timeout: 1000 }, async () => {
  const entered = Promise.withResolvers<void>()
  const held = Promise.withResolvers<void>()
  const failures: Error[] = []
  const progress = new NativeOperationProgress(event => {
    if (event.phase === 'start' && event.id === 2) throw new Error('channel failed')
  }, error => { failures.push(error) })
  const first = progress.run(async () => { entered.resolve(); await held.promise })
  const rejected = assert.rejects(first, /channel failed/u)
  await entered.promise
  try {
    await assert.rejects(progress.run(async () => {}), /channel failed/u)
    await rejected
    assert.equal(failures.length, 1)
  } finally { held.resolve() }
})

test('nested helpers share one finite native operation and failed work ends its clock', async () => {
  const events: NativeProgressEvent[] = []
  const progress = new NativeOperationProgress(event => { events.push(event) }, error => { throw error })
  await assert.rejects(progress.run(() => progress.run(async () => { throw new Error('native failed') })), /native failed/u)
  assert.deepEqual(events, [{ phase: 'start', id: 1 }, { phase: 'end', id: 1 }])
})

test('native emitter bounds concurrent operations without allocating another identity', async () => {
  const held = Promise.withResolvers<void>()
  const events: NativeProgressEvent[] = []
  const progress = new NativeOperationProgress(event => { events.push(event) }, error => { throw error })
  const pending = Array.from({ length: 4 }, () => progress.run(() => held.promise))
  await assert.rejects(progress.run(async () => {}), /limit/iu)
  held.resolve()
  await Promise.all(pending)
  await progress.run(async () => {})
  assert.deepEqual(events.filter(event => event.phase === 'start').map(event => event.id), [1, 2, 3, 4, 5])
})

test('finite native work may exceed five seconds with its own successful callback progress', () => {
  const clock = new NativeProgressClock()
  clock.observe({ phase: 'start', id: 1 }, 0)
  for (const time of [4000, 8000, 12000]) {
    assert.equal(clock.isStalled(time), false)
    clock.observe({ phase: 'progress', id: 1 }, time)
  }
  assert.equal(clock.isStalled(17000), true)
  clock.observe({ phase: 'end', id: 1 }, 17000)
  assert.equal(clock.isStalled(20000), false)
})

test('other native operations cannot rescue a stalled commit or its unfinished drain', () => {
  const clock = new NativeProgressClock()
  clock.observe({ phase: 'start', id: 1 }, 0)
  clock.observe({ phase: 'start', id: 2 }, 1000)
  clock.observe({ phase: 'progress', id: 2 }, 4999)
  assert.equal(clock.isStalled(5000), true)
  clock.observe({ phase: 'progress', id: 1 }, 5001)
  // A COMMIT callback is progress, not the terminal end of commit+drain.
  clock.observe({ phase: 'end', id: 2 }, 5002)
  assert.equal(clock.isStalled(10001), true)
})

test('native clock rejects forged heartbeats, unknown identities and excess concurrent steps', () => {
  const clock = new NativeProgressClock()
  for (const value of [{ phase: 'heartbeat', id: 1 }, { phase: 'progress', id: 1 }, { phase: 'start', id: 2 }, { phase: 'start', id: 1, extra: true }]) assert.throws(() => clock.observe(value, 0))
  for (let id = 1; id <= 4; id += 1) clock.observe({ phase: 'start', id }, 0)
  assert.throws(() => clock.observe({ phase: 'start', id: 5 }, 0))
  clock.observe({ phase: 'end', id: 1 }, 1)
  assert.throws(() => clock.observe({ phase: 'progress', id: 1 }, 2))
  assert.throws(() => clock.observe({ phase: 'start', id: 1 }, 2))
})
