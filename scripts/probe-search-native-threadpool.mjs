import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { markNativeTrace } from '../plugins/tocktutor/packages/tockbot-note-runtime/tests/native-trace.ts'

assert.ok(process.env.TOCKTEAM_NATIVE_TRACE_DIR, 'This control requires tracing')
const require = createRequire(new URL('../plugins/tocktutor/packages/tockbot-note-runtime/package.json', import.meta.url))
const sqlite3 = require('sqlite3')
const raw = await new Promise((resolve, reject) => {
  const database = new sqlite3.Database(':memory:', error => error ? reject(error) : resolve(database))
})
try {
  markNativeTrace('control/start', { sqlite: sqlite3.VERSION })
  await new Promise((resolve, reject) => {
    raw.exec('SELECT 1', error => error ? reject(error) : resolve())
    // Test-only positive control: native execution can finish while JS waits.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
  })
  markNativeTrace('control/end')
} finally {
  await new Promise((resolve, reject) => raw.close(error => error ? reject(error) : resolve()))
}
