// Temporary native diagnosis for tockteam-bon; no production imports.
import { createHook } from 'node:async_hooks'
import { writeSync } from 'node:fs'
import { createRequire } from 'node:module'

const started = performance.now()
const active = new Map()
const recent = []
function record(event) {
  recent.push([Math.round(performance.now() - started), ...event])
  if (recent.length > 40) recent.shift()
}
const hook = createHook({
  init(id, type) {
    if (type.startsWith('sqlite3.')) { active.set(id, type); record(['issued', id, type]) }
  },
  before(id) {
    if (active.has(id)) { record(['callback', id, active.get(id)]); active.delete(id) }
  },
  destroy(id) { active.delete(id) },
}).enable()
const require = createRequire(import.meta.url)
for (const [label, prototype, methods] of [
  ['document', require('flexsearch').Document.prototype, ['mount', 'commit']],
  ['storage', require('flexsearch/db/sqlite').prototype, ['open', 'transaction']],
]) {
  for (const method of methods) {
    const original = prototype[method]
    prototype[method] = function (...args) {
      record([`${label}.${method}`, 'start'])
      return original.apply(this, args).finally(() => record([`${label}.${method}`, 'settled']))
    }
  }
}
function snapshot(reason) {
  writeSync(2, `[DEBUG-bon] ${JSON.stringify({ pid: process.pid, reason, elapsed: Math.round(performance.now() - started), active: [...active], recent })}\n`)
}
setInterval(() => snapshot('heartbeat'), 5_000).unref()
process.on('beforeExit', () => snapshot('beforeExit'))
process.on('uncaughtExceptionMonitor', error => { record(['uncaught', error.message]); snapshot('uncaughtException') })
