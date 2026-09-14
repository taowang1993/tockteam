import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { stopChildProcess } from './process-cleanup.mjs'

assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--storage'), 'Only --storage is supported')
const storage = process.argv[2] === '--storage'
const label = storage ? 'Native storage probe' : 'Native debugger preflight'
const script = fileURLToPath(new URL(storage ? './probe-search-native-storage.mjs' : '../plugins/tocktutor/packages/tockbot-note-runtime/tests/native-stack.ts', import.meta.url))
const child = spawn(process.execPath, [script], { stdio: 'inherit', detached: process.platform !== 'win32', windowsHide: true })
console.log(`${label} owner PID: ${String(child.pid)}`)
let timer
try {
  const [code] = await Promise.race([
    once(child, 'exit'),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded 20 seconds`)), 20_000) }),
  ])
  assert.equal(code, 0)
} finally {
  clearTimeout(timer)
  await stopChildProcess(child, 1_000)
  console.log(`${label} process tree stopped.`)
}
