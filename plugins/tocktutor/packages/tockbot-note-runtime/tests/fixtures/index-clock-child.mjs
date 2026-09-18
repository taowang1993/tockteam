// Test-only: delay delivery, never fabricate a successful native callback.
import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
const [entry, log, mode] = process.argv.slice(2)
assert.equal(typeof entry, 'string')
assert.equal(typeof log, 'string')
assert.ok(['.js', '.ts'].includes(extname(entry)))
const require = createRequire(pathToFileURL(entry).href)
const [{ NativeOperationProgress }, { PersistentSearchIndex }] = await Promise.all([
  import(pathToFileURL(join(dirname(entry), `search-index-progress${extname(entry)}`)).href),
  import(pathToFileURL(join(dirname(entry), `search-index-native${extname(entry)}`)).href),
])
const sqlite = require('sqlite3'), Sqlite = require('flexsearch/db/sqlite')
let count = 0, commit, tail = false, otherId, sideDb, lateCallback, followOnIssued = false
const ended = new Set(), followOn = Promise.withResolvers()
const record = row => { assert.ok(++count < 1000); appendFileSync(log, JSON.stringify({ at: performance.now(), ...row }) + '\n') }
const report = NativeOperationProgress.prototype.report
NativeOperationProgress.prototype.report = function (event) {
  record({ kind: 'event', ...event })
  if (event.phase === 'end') ended.add(event.id)
  return report.call(this, event)
}
const wrap = NativeOperationProgress.prototype.wrap
NativeOperationProgress.prototype.wrap = function (callback) {
  const progress = this, captured = this.context.getStore()?.id
  return wrap.call(this, function (...args) {
    if (captured === commit?.id) {
      record({ kind: 'continuation', captured, actual: progress.context.getStore()?.id, ended: ended.has(captured) })
      if (ended.has(captured) && !followOnIssued) {
        followOnIssued = true
        sideDb.get('SELECT 1 AS value', progress.wrap((error, row) => {
          record({ kind: 'late-follow-on', captured, actual: progress.context.getStore()?.id, value: row?.value, error: error?.code ?? null })
          error ? followOn.reject(error) : followOn.resolve()
        }))
      }
    }
    return callback.apply(this, args)
  })
}
const invalidate = PersistentSearchIndex.prototype.invalidate
PersistentSearchIndex.prototype.invalidate = function (...args) { record({ kind: 'invalidation' }); return invalidate.apply(this, args) }
const originalCommit = Sqlite.prototype.commit
Sqlite.prototype.commit = function (...args) {
  const promise = originalCommit.apply(this, args)
  void promise.then(() => record({ kind: 'commit-resolved', id: this.db.progress.context.getStore()?.id }), () => {})
  return promise
}
async function deliver() {
  const { progress, pending, id } = commit
  assert.ok(pending.length >= 6)
  // Run genuine unrelated callbacks and deliver A callbacks from B's context.
  await progress.context.exit(() => progress.run(async () => {
    otherId = progress.context.getStore().id
    record({ kind: 'other-start', id: otherId, commitId: id })
    const db = await new Promise((resolve, reject) => {
      const raw = new sqlite.Database(':memory:', progress.wrap(error => error ? reject(error) : resolve(raw)))
    })
    sideDb = db
    try {
      for (let group = 0; group < 12; group++) {
        await delay(900)
        await new Promise((resolve, reject) => db.get('SELECT 1 AS value', progress.wrap((error, row) => {
          record({ kind: 'other-native', id: otherId, value: row?.value, error: error?.code ?? null })
          error ? reject(error) : resolve()
        })))
        if (group < (mode === 'progress' ? 8 : 2)) {
          for (const item of pending.slice(Math.floor(group * pending.length / 8), Math.floor((group + 1) * pending.length / 8))) {
            record({ kind: 'delivery', sequence: item.sequence, sql: item.sql, id, caller: progress.context.getStore()?.id })
            item.callback.apply(item.receiver, item.args)
          }
        }
        if (mode === 'progress' && group === 8) {
          assert.ok(ended.has(id) && lateCallback)
          record({ kind: 'late-delivery', id, caller: progress.context.getStore()?.id })
          lateCallback()
          await followOn.promise
          record({ kind: 'late-complete', id })
        }
      }
    } finally { await new Promise((resolve, reject) => db.close(progress.wrap(error => error ? reject(error) : resolve()))) }
  }))
}
for (const method of ['exec', 'run', 'wait']) {
  const original = sqlite.Database.prototype[method]
  sqlite.Database.prototype[method] = function (...args) {
    const sql = method === 'wait' ? 'WAIT' : args[0], progress = this.progress
    if (sql === 'BEGIN' && !commit) {
      commit = { id: progress.context.getStore().id, progress, pending: [] }
      record({ kind: 'commit-start', id: commit.id })
    }
    const id = progress?.context.getStore()?.id
    const late = mode === 'progress' && !lateCallback && sql === 'PRAGMA shrink_memory' && id === commit?.id
    const intercept = late || (commit && id === commit.id && (mode === 'tail' ? sql === 'WAIT' && tail : !tail))
    if (!intercept || typeof args.at(-1) !== 'function') return original.apply(this, args)
    const callback = args.pop()
    return original.apply(this, [...args, function (...values) {
      assert.ok(values[0] == null, `${sql} native failure`)
      const sequence = commit.pending.length
      record({ kind: 'native', sql, id, sequence, error: null })
      if (late) { lateCallback = () => callback.apply(this, values); return }
      if (mode === 'tail') { record({ kind: 'drain-held', id }); return }
      const item = { sql, callback, args: values, receiver: this, sequence }
      if (sql === 'COMMIT') {
        // The native work has finished. Only callback delivery is being delayed.
        commit.pending.push(item)
        tail = true
        void deliver().catch(error => { record({ kind: 'fixture-error', message: error.message }); process.exit(2) })
      } else commit.pending.push(item)
    }])
  }
}
// Tail mode does not delay COMMIT; only its subsequent real drain callback.
if (mode === 'tail') {
  const exec = sqlite.Database.prototype.exec
  sqlite.Database.prototype.exec = function (sql, ...args) {
    if (sql === 'COMMIT') tail = true
    return exec.call(this, sql, ...args)
  }
}
await import(pathToFileURL(entry).href)
