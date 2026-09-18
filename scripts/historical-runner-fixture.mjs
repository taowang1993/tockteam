import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

export const HISTORICAL_COMMIT = '9a709fc995343debed13740065039302a86c21e1'
export const HISTORICAL_TREE = '8cad8eca84d72d5110807c04a65b302b212ae53e'
export const HISTORICAL_TEST = 'plugins/tocktutor/packages/tockbot-note-runtime/tests/loader-composition.test.ts'
export const HISTORICAL_TEST_SHA256 = 'd12cdfdbf0f1772c3d72623cde52cb01012a992cc79e699799de27dd69407130'
export const sha256 = value => createHash('sha256').update(value).digest('hex')
const identities = ['keyword', 'persistent', 'control']
const phases = ['test', 'load', 'reopen-1', 'reopen-2', 'indexed-readiness', 'dispose', 'schema-mutation', 'cleanup', 'pending-descendant']

export function historicalArgs(arm) {
  assert.ok(['default', 'none'].includes(arm), 'unknown historical arm')
  return ['--test', ...(arm === 'none' ? ['--test-isolation=none'] : []), '--test-name-pattern=Keyword search reconciles|persistent FlexSearch SQLite', 'tests/loader-composition.test.ts']
}

// Synchronous private file writes deliberately perturb I/O/scheduling. No polls,
// fsync, native callbacks or production-method wrappers are added.
export const JOURNAL_SOURCE = `
import { appendFileSync as historicalAppend, writeFileSync as historicalWrite } from 'node:fs'
import { join as historicalJoin } from 'node:path'
const historicalEpoch = performance.now()
let historicalIdentity = 'control', historicalCount = 0, historicalBytes = 0
const historicalPending = []
const historicalFile = historicalJoin(process.env.HISTORICAL_JOURNAL, process.pid + '.jsonl')
historicalWrite(historicalFile, '', { flag: 'wx', mode: 0o600 })
function historicalRecord(phase, state, error) {
  const row = { test: historicalIdentity, phase, state, pid: process.pid, elapsedMs: performance.now() - historicalEpoch }
  if (error) row.error = /timed out waiting for/.test(String(error.message)) ? String(error.message).slice(0, 200) : 'test operation failed'
  const line = JSON.stringify(row) + '\\n'
  if (++historicalCount > 64 || (historicalBytes += Buffer.byteLength(line)) > 32768) throw new Error('historical journal bound exceeded')
  historicalAppend(historicalFile, line)
}
function historicalBegin(phase) { historicalRecord(phase, 'start'); historicalPending.push(phase) }
function historicalEnd(phase) {
  if (historicalPending.pop() !== phase) throw new Error('historical journal phase mismatch')
  historicalRecord(phase, 'end')
}
function historicalError(error) {
  while (historicalPending.length && historicalPending.at(-1) !== 'test') historicalRecord(historicalPending.pop(), 'error', error)
}
`

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'historical instrumentation exact-match guard')
  return source.replace(before, after)
}

export function instrumentHistoricalTest(source) {
  assert.equal(sha256(source), HISTORICAL_TEST_SHA256, 'historical source hash mismatch')
  for (const [identity, name] of [['keyword', 'Keyword search reconciles state-owned indexed candidates through the exact verifier'], ['persistent', 'persistent FlexSearch SQLite indexes reopen outside the user vault']]) {
    const start = source.indexOf(`test('${name}', async () => {`)
    const end = source.indexOf('\n})', start) + 3
    assert.ok(start >= 0 && end > start)
    let block = source.slice(start, end)
    block = replaceOnce(block, `test('${name}', async () => {`, `test('${name}', async () => {\n  historicalIdentity = '${identity}'\n  historicalBegin('test')\n  try {`)
    if (identity === 'keyword') {
      block = replaceOnce(block, '  const loaded = await load([', "  historicalBegin('load')\n  const loaded = await load([");
      block = replaceOnce(block, "  ].join('\\n'))\n  try {", "  ].join('\\n'))\n  historicalEnd('load')\n  try {")
      block = replaceOnce(block, '    const indexedSearch = async (expectedEntries: number) => {', "    const indexedSearch = async (expectedEntries: number) => {\n      historicalBegin('indexed-readiness')")
      block = replaceOnce(block, 'if (observedEntries === expectedEntries) return result', "if (observedEntries === expectedEntries) { historicalEnd('indexed-readiness'); return result }")
    } else {
      block = replaceOnce(block, '  const verifyIndexedSearch = async () => {', "  const verifyIndexedSearch = async () => {\n    historicalBegin('indexed-readiness')")
      block = replaceOnce(block, "        return\n", "        historicalEnd('indexed-readiness')\n        return\n")
      let loadIndex = 0
      block = block.replaceAll('    loaded = await load(config)', () => {
        const phase = ['load', 'reopen-1', 'reopen-2'][loadIndex++]
        return `    historicalBegin('${phase}')\n    loaded = await load(config)\n    historicalEnd('${phase}')`
      })
      assert.equal(loadIndex, 3)
      block = replaceOnce(block, '    await new Promise<void>((resolve, reject) => {', "    historicalBegin('schema-mutation')\n    await new Promise<void>((resolve, reject) => {")
      block = replaceOnce(block, "    })\n    historicalBegin('reopen-2')", "    })\n    historicalEnd('schema-mutation')\n    historicalBegin('reopen-2')")
    }
    block = replaceOnce(block, '  } finally {', '  } catch (error) {\n    historicalError(error)\n    throw error\n  } finally {')
    let disposals = 0
    block = block.replace(/^(\s*)(if \(loaded !== null\) )?await dispose\(([^\n]+)\)$/gm, (_, space, conditional, args) => {
      disposals++
      return `${space}${conditional ?? ''}{ historicalBegin('dispose'); await dispose(${args}); historicalEnd('dispose') }`
    })
    assert.equal(disposals, identity === 'keyword' ? 1 : 3)
    block = replaceOnce(block, '    await rm(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })', "    historicalBegin('cleanup')\n    await rm(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })\n    historicalEnd('cleanup')")
    block = block.slice(0, -3) + `\n  historicalEnd('test')\n  } catch (error) {\n    historicalError(error)\n    historicalPending.pop()\n    historicalRecord('test', 'error', error)\n    throw error\n  }\n})`
    source = source.slice(0, start) + block + source.slice(end)
  }
  return JOURNAL_SOURCE + source
}

export function parseJournal(text, pid) {
  assert.ok(Buffer.byteLength(text) > 0 && Buffer.byteLength(text) <= 32768, 'journal byte bound')
  assert.ok(text.endsWith('\n'), 'incomplete journal')
  const rows = text.trimEnd().split('\n').map(line => JSON.parse(line))
  assert.ok(rows.length <= 64, 'journal transition bound')
  const pending = []; let previous = -1; let identity
  for (const row of rows) {
    assert.ok(Object.keys(row).every(key => ['test', 'phase', 'state', 'pid', 'elapsedMs', 'error'].includes(key)), 'unexpected journal fields')
    assert.ok(identities.includes(row.test) && phases.includes(row.phase) && ['start', 'end', 'error'].includes(row.state), 'invalid journal record')
    assert.ok(Number.isSafeInteger(row.pid) && row.pid > 0 && (pid === undefined || row.pid === pid), 'journal PID mismatch')
    pid ??= row.pid
    assert.ok(Number.isFinite(row.elapsedMs) && row.elapsedMs >= previous, 'invalid monotonic clock')
    previous = row.elapsedMs
    if (pending.length) assert.equal(row.test, identity, 'overlapping test identities')
    identity = row.test
    assert.ok(row.error === undefined || (row.state === 'error' && typeof row.error === 'string' && row.error.length <= 200), 'invalid journal error')
    if (row.state === 'start') pending.push(row.phase)
    else assert.equal(pending.pop(), row.phase, 'journal phase mismatch')
  }
  return rows
}

export function classifyPair(arms) {
  if (arms.length !== 2 || arms.some(arm => arm.cleanupVerified !== true || arm.evidenceIncomplete || arm.dependencies?.available === false || !['passed', 'failed', 'deadline'].includes(arm.status))) return 'INCONCLUSIVE'
  return arms[0].status !== arms[1].status ? 'LEAD_NOT_CAUSAL_PROOF' : 'INCONCLUSIVE'
}
