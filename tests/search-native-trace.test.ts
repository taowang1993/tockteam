import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { finishNativeTrace, summarizeNativeTrace } from '../scripts/search-native-trace.mjs'

const event = (ph: string, ts: number, id = '0xa', tid = 1) => ({ pid: 10, tid, ph, ts, id, name: 'node_api', cat: `node.threadpoolwork.${ph === ph.toUpperCase() ? 'sync' : 'async'}` })
const work = (start: number, end: number, tid = 2) => [event('B', start, undefined, tid), event('E', end, undefined, tid)]

test('native tracing separates an exclusive worker interval from dispatch delay', () => {
  const result = summarizeNativeTrace([event('b', 10), ...work(20, 30), event('e', 230)])
  assert.deepEqual(result.intervals[0], { pid: 10, id: '0xa', start: 10, end: 230, workerTid: 2, queueUs: 10, nativeUs: 10, dispatchUs: 200 })
})

test('native tracing does not guess associations for overlapping requests', () => {
  const result = summarizeNativeTrace([event('b', 10), event('b', 15, '0xb'), ...work(20, 30), ...work(25, 40, 3), event('e', 60), event('e', 65, '0xb')])
  assert.equal(result.intervals.length, 0)
  assert.equal(result.unresolved.length, 2)
})

test('native tracing supports reused pointer IDs without merging their lifetimes', () => {
  const result = summarizeNativeTrace([event('b', 10), ...work(20, 30), event('e', 40), event('b', 50), ...work(60, 70), event('e', 80)])
  assert.equal(result.intervals.length, 2)
  assert.deepEqual(result.intervals.map(row => row.nativeUs), [10, 10])
})

test('native tracing rejects missing, unmatched, or duplicate boundaries', () => {
  for (const events of [[], [event('b', 10)], [event('e', 10)], [event('B', 10)], [event('b', 10), event('b', 11)]]) {
    assert.throws(() => summarizeNativeTrace(events))
  }
})

test('native tracing keeps cancelled or unobserved work unresolved', () => {
  const result = summarizeNativeTrace([event('b', 10), event('e', 40)])
  assert.equal(result.intervals.length, 0)
  assert.equal(result.unresolved[0]?.reason, 'No Unique Worker Span')
})

test('native tracing never associates work across different processes', () => {
  const events = [event('b', 10), ...work(20, 30).map(row => ({ ...row, pid: 20 })), event('e', 40)]
  assert.equal(summarizeNativeTrace(events).intervals.length, 0)
})

test('trace evidence requires owner clock markers and preserves escaped marker details', () => {
  const directory = mkdtempSync(join(tmpdir(), 'trace-evidence-'))
  const raw = join(directory, 'trace.raw')
  const marker = (name: string, ts: number, detail: unknown = null) => ({ pid: 10, ph: 'b', ts, name: `time::bon:${encodeURIComponent(JSON.stringify({ event: name, detail }))}` })
  const events: Array<Record<string, unknown>> = [event('b', 10), ...work(20, 30), event('e', 40)]
  try {
    writeFileSync(raw, JSON.stringify({ traceEvents: events }))
    assert.throws(() => finishNativeTrace(directory, 10), /owner-start/)
    events.push(marker('owner/start', 0, 'C:\\Temp\\"quoted"'), marker('owner/end', 50))
    writeFileSync(raw, JSON.stringify({ traceEvents: events }))
    assert.equal(finishNativeTrace(directory, 10).intervals.length, 1)
    const evidence = JSON.parse(readFileSync(join(directory, 'evidence.json'), 'utf8'))
    assert.equal(evidence.markers[0].detail, 'C:\\Temp\\"quoted"')
    assert.throws(() => finishNativeTrace(directory, 10, true), /control clock/)
    events.push(marker('control/start', 5), marker('control/end', 45))
    writeFileSync(raw, JSON.stringify({ traceEvents: events }))
    assert.throws(() => finishNativeTrace(directory, 10, true), /delayed completion/)
    events[5]!.ts = -1
    writeFileSync(raw, JSON.stringify({ traceEvents: events }))
    assert.throws(() => finishNativeTrace(directory, 10), /marker clock/)
    assert.equal(JSON.parse(readFileSync(join(directory, 'evidence.json'), 'utf8')).intervals, undefined)
    truncateSync(raw, 33 * 1024 * 1024)
    assert.throws(() => finishNativeTrace(directory, 10), /32 MiB/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
