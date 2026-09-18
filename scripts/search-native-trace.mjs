import assert from 'node:assert/strict'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Node's worker B/E events have no request ID. Attribute only fully exclusive
// request windows; overlapping, cancelled, and unobserved work stays unresolved.
export function summarizeNativeTrace(events) {
  const requests = []
  const workers = []
  const active = new Map()
  const selected = events.filter(event => event.name === 'node_api' && event.cat?.includes('node.threadpoolwork'))
  assert.ok(selected.length, 'No N-API work events captured')
  for (const event of selected.sort((a, b) => a.ts - b.ts)) {
    assert.ok(Number.isFinite(event.ts) && Number.isInteger(event.pid) && Number.isInteger(event.tid), 'Invalid trace identity or clock')
    const async = event.cat.includes('node.threadpoolwork.async')
    assert.ok(async ? ['b', 'e'].includes(event.ph) : ['B', 'E'].includes(event.ph), 'Unsupported work event')
    if (async) assert.equal(typeof event.id, 'string', 'Missing request ID')
    const key = JSON.stringify([event.pid, async ? event.id : event.tid, async])
    if (event.ph === 'b' || event.ph === 'B') {
      assert.ok(!active.has(key), 'Duplicate work start')
      active.set(key, event)
    } else {
      const start = active.get(key)
      assert.ok(start, 'Unmatched work end')
      active.delete(key)
      ;(async ? requests : workers).push({ ...start, start: start.ts, end: event.ts })
    }
  }
  assert.equal(active.size, 0, 'Incomplete work intervals')
  const intervals = []
  const unresolved = []
  // ponytail: quadratic matching is adequate for bounded diagnostic traces;
  // use an interval sweep if substantially larger captures become necessary.
  for (const request of requests) {
    const identity = { pid: request.pid, id: request.id, start: request.start, end: request.end }
    const overlaps = requests.some(other => other !== request && other.pid === request.pid && other.start <= request.end && other.end >= request.start)
    const candidates = workers.filter(worker => worker.pid === request.pid && worker.start >= request.start && worker.end <= request.end)
    if (overlaps || candidates.length !== 1) {
      unresolved.push({ ...identity, reason: overlaps ? 'Overlapping Requests' : 'No Unique Worker Span' })
      continue
    }
    const worker = candidates[0]
    intervals.push({ ...identity, workerTid: worker.tid, queueUs: worker.start - request.start, nativeUs: worker.end - worker.start, dispatchUs: request.end - worker.end })
  }
  return { intervals, unresolved }
}

export function finishNativeTrace(directory, pid, control = false) {
  const rawPath = join(directory, 'trace.raw')
  assert.ok(statSync(rawPath).size <= 32 * 1024 * 1024, 'Trace exceeds the 32 MiB analysis limit')
  const { traceEvents } = JSON.parse(readFileSync(rawPath, 'utf8'))
  const markers = traceEvents.filter(event => event.ph === 'b' && event.name.startsWith('time::bon:'))
    .map(event => ({ pid: event.pid, ts: event.ts, ...JSON.parse(decodeURIComponent(event.name.slice(10))) }))
  const starts = markers.filter(marker => marker.event === 'owner/start' && marker.pid === pid)
  const ends = markers.filter(marker => marker.event === 'owner/end' && marker.pid === pid)
  const work = traceEvents.filter(event => event.cat?.includes('node.threadpoolwork'))
  const output = join(directory, 'evidence.json')
  const evidence = { pid, control, markers, work }
  let summary
  try {
    assert.equal(starts.length, 1, 'Missing owner-start marker')
    assert.equal(ends.length, 1, 'Missing owner-end marker')
    assert.ok(starts[0].ts <= ends[0].ts && markers.every(marker => marker.pid === pid && Number.isFinite(marker.ts) && marker.ts >= starts[0].ts && marker.ts <= ends[0].ts), 'Invalid marker clock or owner')
    assert.ok(work.every(event => event.pid === pid), 'Unexpected trace owner')
    summary = summarizeNativeTrace(work)
    if (control) {
      const start = markers.find(marker => marker.event === 'control/start')
      const end = markers.find(marker => marker.event === 'control/end')
      assert.ok(start && end, 'Missing control clock markers')
      const requests = summary.intervals.filter(interval => interval.start >= start.ts && interval.end <= end.ts)
      assert.equal(requests.length, 1, 'Control must have one uniquely associated request')
      assert.ok(requests[0].dispatchUs >= 100_000 && requests[0].nativeUs < requests[0].dispatchUs, 'Control did not establish delayed completion dispatch')
    }
    Object.assign(evidence, summary)
  } catch (error) {
    evidence.error = error.message
    throw error
  } finally { writeFileSync(output, JSON.stringify(evidence)) }
  console.log(`[DEBUG-bon-threadpool] ${JSON.stringify({ output, associated: summary.intervals.length, unresolved: summary.unresolved.length, longest: [...summary.intervals].sort((a, b) => (b.end - b.start) - (a.end - a.start)).slice(0, 8) })}`)
  return summary
}
