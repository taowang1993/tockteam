import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { stopChildProcess } from './process-cleanup.mjs'

const script = fileURLToPath(new URL('../plugins/tocktutor/packages/tockbot-note-runtime/tests/native-stack.ts', import.meta.url))
const child = spawn(process.execPath, [script], { stdio: 'inherit', windowsHide: true })
console.log(`Native debugger preflight owner PID: ${String(child.pid)}`)
let timer
try {
  const [code] = await Promise.race([
    once(child, 'exit'),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Native debugger preflight exceeded 20 seconds')), 20_000) }),
  ])
  assert.equal(code, 0)
} finally {
  clearTimeout(timer)
  await stopChildProcess(child, 1_000)
  console.log('Native debugger preflight process tree stopped.')
}
