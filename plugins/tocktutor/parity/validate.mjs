import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const parityRoot = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(parityRoot, '../../..')
const ledger = JSON.parse(await readFile(resolve(parityRoot, 'ledger.json'), 'utf8'))
const manifest = JSON.parse(await readFile(resolve(parityRoot, 'fixtures/manifest.json'), 'utf8'))
const hex64 = /^[0-9a-f]{64}$/u
const issuePattern = /^tockteam-3t5\.(?:[2-9]|1\d|2[0-8])$/u

assert.equal(ledger.schemaVersion, 1)
assert.match(ledger.sources.tockbotCommit, /^[0-9a-f]{40}$/u)
assert.match(ledger.sources.tockbotReference.sha256, hex64)
assert.match(ledger.sources.obsidianChecklist.sha256, hex64)
assert.equal(ledger.sources.obsidianChecklist.observedRows, ledger.rows.length)
assert.equal(
  ledger.sources.obsidianChecklist.observedChecked,
  ledger.rows.filter(row => row.sourceChecked).length,
)
assert.equal(
  ledger.sources.obsidianChecklist.observedUnchecked,
  ledger.rows.filter(row => !row.sourceChecked).length,
)
assert.equal(
  ledger.sources.obsidianChecklist.observedNotNeeded,
  ledger.rows.filter(row => row.scope === 'not-needed').length,
)
if (ledger.sources.obsidianChecklist.declaredRows !== ledger.rows.length) {
  assert.ok(ledger.sources.obsidianChecklist.discrepancy?.includes('invent'))
}

const ids = new Set()
const assignedIssues = new Set()
for (const [index, row] of ledger.rows.entries()) {
  assert.equal(row.id, `obsidian-${String(index + 1).padStart(3, '0')}`)
  assert.ok(!ids.has(row.id), `duplicate row id ${row.id}`)
  ids.add(row.id)
  assert.ok(typeof row.title === 'string' && row.title.length > 0)
  assert.ok(typeof row.section === 'string' && row.section.length > 0)
  assert.ok(Number.isSafeInteger(row.sourceLine) && row.sourceLine > 0)
  assert.ok(['included', 'excluded', 'not-needed'].includes(row.scope))
  assert.ok(['proven', 'gap', 'excluded'].includes(row.status))
  assert.ok(Array.isArray(row.evidence) && row.evidence.length > 0)
  assert.ok(typeof row.owner === 'string' && row.owner.length > 0)
  if (row.scope === 'included') {
    assert.ok(row.status === 'proven' || row.status === 'gap')
    if (row.status === 'gap') assert.match(row.issueId, issuePattern)
    if (row.issueId !== null) {
      assert.match(row.issueId, issuePattern)
      assignedIssues.add(row.issueId)
    }
  } else {
    assert.equal(row.status, 'excluded')
    assert.equal(row.issueId, null)
    assert.equal(row.owner, 'none')
  }
}

for (const capability of ledger.additionalCapabilities) {
  assert.ok(typeof capability.id === 'string' && capability.id.length > 0)
  assert.equal(capability.scope, 'included')
  assert.ok(capability.status === 'proven' || capability.status === 'gap')
  assert.match(capability.issueId, issuePattern)
  assert.ok(Array.isArray(capability.evidence) && capability.evidence.length > 0)
  assignedIssues.add(capability.issueId)
}
for (let number = 2; number <= 28; number += 1) {
  if (number === 27) continue
  assert.ok(assignedIssues.has(`tockteam-3t5.${String(number)}`), `issue 3t5.${String(number)} owns no capability`)
}

for (const evidence of new Set([
  ...ledger.rows.filter(row => row.scope === 'included').flatMap(row => row.evidence),
  ...ledger.additionalCapabilities.flatMap(capability => capability.evidence),
])) {
  assert.ok(!evidence.startsWith('/'), `included evidence must be repository-relative: ${evidence}`)
  await stat(resolve(repositoryRoot, evidence))
}

assert.equal(manifest.schemaVersion, 1)
assert.ok(Number.isSafeInteger(manifest.limits.maxFixtureFiles) && manifest.limits.maxFixtureFiles > 0)
assert.ok(Number.isSafeInteger(manifest.limits.maxFixtureFileBytes) && manifest.limits.maxFixtureFileBytes > 0)
const required = Object.entries(manifest.required).flatMap(([category, paths]) => {
  assert.ok(Array.isArray(paths) && paths.length > 0, `${category} has no fixture`)
  return paths
})
assert.ok(required.length <= manifest.limits.maxFixtureFiles)
for (const path of required) {
  assert.ok(typeof path === 'string' && !path.startsWith('/') && !path.includes('..'))
  const info = await stat(resolve(parityRoot, 'fixtures', path))
  assert.ok(info.isFile(), `${path} is not a regular fixture file`)
  assert.ok(info.size <= manifest.limits.maxFixtureFileBytes, `${path} exceeds the fixture bound`)
}

const welcome = await readFile(resolve(parityRoot, 'fixtures/vault/Notes/Welcome.md'), 'utf8')
assert.match(welcome, /^---[\s\S]*aliases:[\s\S]*^---$/mu)
assert.match(welcome, /\[\[Alias Target#Details\|the alias note\]\]/u)
assert.match(welcome, /```mermaid/u)
const canvas = JSON.parse(await readFile(resolve(parityRoot, 'fixtures/vault/Boards/Lesson.canvas'), 'utf8'))
assert.ok(Array.isArray(canvas.nodes) && Array.isArray(canvas.edges))
assert.equal(new Set(canvas.nodes.map(node => node.id)).size, canvas.nodes.length)
assert.equal(new Set(canvas.edges.map(edge => edge.id)).size, canvas.edges.length)
assert.ok(canvas.nodes.some(node => node.type === 'group'))
assert.ok(canvas.nodes.some(node => node.type === 'link'))
const base = await readFile(resolve(parityRoot, 'fixtures/vault/Bases/Lessons.base'), 'utf8')
for (const token of ['formulas:', 'filters:', 'type: table', 'type: list', 'type: cards', 'type: map']) {
  assert.ok(base.includes(token), `Base fixture is missing ${token}`)
}
const hostile = JSON.parse(await readFile(resolve(parityRoot, 'fixtures/hostile-cases.json'), 'utf8'))
assert.ok(Array.isArray(hostile.cases) && hostile.cases.length >= 8)
assert.equal(new Set(hostile.cases.map(entry => entry.id)).size, hostile.cases.length)
for (const kind of ['path', 'url', 'canvas', 'base', 'filesystem']) {
  assert.ok(hostile.cases.some(entry => entry.kind === kind), `hostile fixture lacks ${kind}`)
}

const proven = ledger.rows.filter(row => row.status === 'proven').length
  + ledger.additionalCapabilities.filter(capability => capability.status === 'proven').length
const gaps = ledger.rows.filter(row => row.status === 'gap').length
  + ledger.additionalCapabilities.filter(capability => capability.status === 'gap').length
assert.equal(gaps, 0, 'the completed parity ledger cannot retain assigned gaps')
console.log(`TockTutor parity ledger: ${String(ledger.rows.length)} checklist rows plus ${String(ledger.additionalCapabilities.length)} additional capabilities, ${String(proven)} proven, ${String(gaps)} gaps, ${String(ledger.rows.filter(row => row.status === 'excluded').length)} excluded.`)
