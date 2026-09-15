import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stopChildProcess } from '../../../../../scripts/process-cleanup.mjs'
import { finishNativeTrace } from '../../../../../scripts/search-native-trace.mjs'

const traceDirectory = process.env.TOCKTEAM_NATIVE_TRACE_DIR
  ? mkdtempSync(join(resolve(process.env.TOCKTEAM_NATIVE_TRACE_DIR), 'capture-')) : undefined
const control = process.env.TOCKTEAM_NATIVE_TRACE_CONTROL === '1'
if (control && !traceDirectory) throw new Error('Threadpool control requires a trace directory')
const traceArgs = traceDirectory ? [
  '--trace-event-categories=node.threadpoolwork,node.console',
  `--trace-event-file-pattern=${join(traceDirectory, 'trace.raw')}`,
] : []

// No worker isolation: this PID owns SQLite. The external deadline stops its
// whole tree, including an optional diagnostic debugger, before returning.
const child = spawn(process.execPath, [...traceArgs, ...(control ? [
  fileURLToPath(new URL('../../../../../scripts/probe-search-native-threadpool.mjs', import.meta.url)),
] : [
  '--test',
  '--test-isolation=none',
  '--test-name-pattern=search index (disposal|native|remount)|Keyword search reconciles|persistent FlexSearch SQLite',
  'tests/loader-composition.test.ts',
])], {
  cwd: new URL('../', import.meta.url),
  env: traceDirectory ? { ...process.env, TOCKTEAM_NATIVE_TRACE_DIR: traceDirectory } : process.env,
  stdio: 'inherit',
  detached: process.platform !== 'win32',
  windowsHide: true,
})
console.log(`Search-index native owner PID: ${String(child.pid)}`)
let timer
let sizeTimer
try {
  const [code] = await Promise.race([
    once(child, 'exit'),
    new Promise((_, reject) => {
      if (!traceDirectory) return
      sizeTimer = setInterval(() => {
        try {
          if (statSync(join(traceDirectory, 'trace.raw')).size > 32 * 1024 * 1024) reject(new Error('Native trace exceeded 32 MiB'))
        } catch (error) { if (error.code !== 'ENOENT') reject(error) }
      }, 250)
    }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('native startup, reconciliation, or disposal exceeded 60 seconds')), 60_000) }),
  ])
  process.exitCode = code ?? 1
} catch (error) {
  console.error('Search-index gate did not finish:', error.message)
  process.exitCode = 1
} finally {
  clearTimeout(timer)
  clearInterval(sizeTimer)
  await stopChildProcess(child, 1_000)
  console.log('Search-index native owner process tree stopped.')
  if (traceDirectory) {
    try { finishNativeTrace(traceDirectory, child.pid, control) }
    catch (error) {
      console.error('Native trace is inconclusive:', error.message)
      process.exitCode = 1
    }
  }
}
