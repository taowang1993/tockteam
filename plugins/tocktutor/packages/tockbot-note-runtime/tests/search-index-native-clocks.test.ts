import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { SearchIndexProcess } from '../src/search-index-process.ts'
import { NativeProgressClock } from '../src/search-index-progress.ts'
import { spawnOwnedProcess } from '../src/owned-process.ts'
// @ts-expect-error JavaScript verification helper.
import { nativeClockModes, runNativeClockCase } from './search-index-native-clock-harness.mjs'

const runtime = { SearchIndexProcess, NativeProgressClock, spawnOwnedProcess }
const fixture = fileURLToPath(new URL('./fixtures/index-clock-child.mjs', import.meta.url))
const childEntry = fileURLToPath(new URL('../src/search-index-child.ts', import.meta.url))

for (const mode of nativeClockModes) test(`real native commit clock: ${mode}`, { timeout: 25000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'index-clock-supervisor-'))
  let safeToRemove = false
  try {
    const measurement = await runNativeClockCase(mode, runtime, {
      fixture,
      childEntry,
      root,
      onDiagnostic: (diagnostic: unknown) => t.diagnostic(JSON.stringify(diagnostic)),
    })
    safeToRemove = true
    t.diagnostic(JSON.stringify(measurement))
  } finally {
    if (safeToRemove) await rm(root, { recursive: true, force: true })
  }
})
