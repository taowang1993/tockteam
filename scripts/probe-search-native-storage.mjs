import assert from 'node:assert/strict'
import { mkdtemp, open, rm, stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'

// Diagnostic only: paired 4 KiB durable writes, not a SQLite benchmark.
assert.ok(process.env.RUNNER_TEMP, 'RUNNER_TEMP must identify the owned runner temporary folder')
const roots = [tmpdir(), process.env.RUNNER_TEMP]
const fixtures = []
const payload = Buffer.alloc(4096)
const phases = ['open', 'write', 'sync', 'close', 'remove']
const loopDelay = monitorEventLoopDelay({ resolution: 20 })
const utilization = performance.eventLoopUtilization()
loopDelay.enable()
try {
  for (const root of roots) {
    fixtures.push({ root, directory: await mkdtemp(join(root, 'search-storage-probe-')), samples: [] })
  }
  const started = performance.now()
  for (let pair = 0; pair < 128 && performance.now() - started < 10_000; pair++) {
    // Alternate order to avoid consistently giving one location the first write.
    for (const fixture of pair % 2 ? [...fixtures].reverse() : fixtures) {
      const file = join(fixture.directory, `${pair}.bin`)
      const times = [performance.now()]
      const handle = await open(file, 'wx')
      times.push(performance.now())
      try {
        await handle.writeFile(payload)
        times.push(performance.now())
        await handle.sync()
        times.push(performance.now())
      } finally { await handle.close() }
      times.push(performance.now())
      await unlink(file)
      times.push(performance.now())
      const sample = phases.map((_, i) => times[i + 1] - times[i])
      assert.ok(sample.every(value => Number.isFinite(value) && value >= 0))
      fixture.samples.push(sample)
    }
  }
  assert.ok(fixtures[0].samples.length > 0)
  assert.equal(fixtures[0].samples.length, fixtures[1].samples.length)
  for (const fixture of fixtures) {
    const timingsMs = Object.fromEntries(phases.map((phase, i) => {
      const sorted = fixture.samples.map(sample => sample[i]).sort((a, b) => a - b)
      return [phase, { p50: sorted[Math.floor((sorted.length - 1) * 0.5)], p95: sorted[Math.floor((sorted.length - 1) * 0.95)], max: sorted.at(-1) }]
    }))
    console.log(JSON.stringify({ root: fixture.root, device: (await stat(fixture.directory)).dev, pairs: fixture.samples.length, timingsMs }))
  }
  console.log(JSON.stringify({ elapsedMs: performance.now() - started, eventLoopMaxDelayMs: loopDelay.max / 1e6, eventLoopUtilization: performance.eventLoopUtilization(utilization).utilization }))
} finally {
  loopDelay.disable()
  for (const fixture of fixtures) await rm(fixture.directory, { recursive: true, force: true })
}
