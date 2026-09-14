import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { stopChildProcess } from '../../../../../scripts/process-cleanup.mjs'

// No worker isolation: this PID owns SQLite. The external deadline stops its
// whole tree, including an optional diagnostic debugger, before returning.
const child = spawn(process.execPath, [
  '--test',
  '--test-isolation=none',
  '--test-name-pattern=search index (disposal|native|remount)|Keyword search reconciles|persistent FlexSearch SQLite',
  'tests/loader-composition.test.ts',
], {
  cwd: new URL('../', import.meta.url),
  stdio: 'inherit',
  detached: process.platform !== 'win32',
  windowsHide: true,
})
console.log(`Search-index native owner PID: ${String(child.pid)}`)
let timer
try {
  const [code] = await Promise.race([
    once(child, 'exit'),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('native startup, reconciliation, or disposal exceeded 60 seconds')), 60_000) }),
  ])
  process.exitCode = code ?? 1
} catch (error) {
  console.error('Search-index gate did not finish:', error.message)
  process.exitCode = 1
} finally {
  clearTimeout(timer)
  await stopChildProcess(child, 1_000)
  console.log('Search-index native owner process tree stopped.')
}
