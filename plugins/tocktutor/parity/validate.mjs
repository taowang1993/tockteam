import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const parityRoot = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(parityRoot, '../../..')
const HEX_64 = /^[0-9a-f]{64}$/u
const TOCKBOT_COMMIT = 'af214b2d1a5df8ca23bf99fad9f0408a07c2e4ba'
const LEGACY_ISSUE = /^tockteam-3t5\.(?:[2-9]|1\d|2[0-8])$/u
const RESIDUAL_ISSUE = /^tockteam-tc9\.(?:[2-9]|1[0-6])$/u
const RESIDUAL_IDS = new Set([
  'editor-source-codemirror',
  'editor-source-fidelity',
  'editor-live-preview-milkdown',
  'editor-live-preview-blocks',
  'editor-live-preview-tables-commands',
  'embed-recursive-resolution',
  'embed-reading-slides-export',
  'embed-editor-widgets',
  'render-safe-raw-html',
  'render-external-embeds',
  'protocol-vault-routing',
  'protocol-pane-clipboard-callbacks',
  'agent-note-read-tools',
  'agent-staged-write-tools',
])
const DIVERGENCE_IDS = new Set([
  'static-export-network-content',
  'static-export-active-media',
])

function nonEmptyString(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`)
  assert.ok(value.length > 0, `${label} must not be empty`)
}

function relativeOraclePath(value, label) {
  nonEmptyString(value, label)
  assert.ok(!value.startsWith('/'), `${label} must be Tockbot-relative`)
  assert.ok(!value.includes('..'), `${label} must not escape the Tockbot checkout`)
}

function validateOracle(oracle, expectedCommit, label) {
  assert.ok(oracle && typeof oracle === 'object', `${label} is missing`)
  assert.equal(oracle.commit, expectedCommit, `${label}.commit must pin the Tockbot oracle`)
  assert.ok(Array.isArray(oracle.source) && oracle.source.length > 0, `${label}.source is required`)
  assert.ok(Array.isArray(oracle.tests) && oracle.tests.length > 0, `${label}.tests is required`)
  for (const [index, source] of oracle.source.entries()) relativeOraclePath(source, `${label}.source[${String(index)}]`)
  for (const [index, test] of oracle.tests.entries()) relativeOraclePath(test, `${label}.tests[${String(index)}]`)
}

function validateCapabilityShape(capability, issuePattern, label) {
  nonEmptyString(capability.id, `${label}.id`)
  nonEmptyString(capability.title, `${label}.title`)
  assert.equal(capability.scope, 'included', `${label}.scope must be included`)
  assert.ok(capability.status === 'proven' || capability.status === 'gap', `${label}.status is invalid`)
  assert.match(capability.issueId, issuePattern, `${label}.issueId is invalid`)
  nonEmptyString(capability.owner, `${label}.owner`)
  nonEmptyString(capability.focusedCommand, `${label}.focusedCommand`)
  nonEmptyString(capability.realConsumerCheck, `${label}.realConsumerCheck`)
}

export async function validateLedger(ledger, manifest, roots = {}) {
  const currentParityRoot = roots.parityRoot ?? parityRoot
  const currentRepositoryRoot = roots.repositoryRoot ?? repositoryRoot

  assert.equal(ledger.schemaVersion, 2)
  assert.deepEqual(new Set(ledger.statuses), new Set(['proven', 'partial', 'gap', 'excluded']))
  assert.equal(ledger.sources.tockbotCommit, TOCKBOT_COMMIT)
  nonEmptyString(ledger.sources.tockbotReference.path, 'sources.tockbotReference.path')
  assert.match(ledger.sources.tockbotReference.sha256, HEX_64)
  assert.match(ledger.sources.obsidianChecklist.sha256, HEX_64)
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
  assert.equal(ledger.claims.exhaustive, false)
  assert.match(ledger.claims.text, /scoped|bounded|not claim exhaustive/iu)

  const ids = new Set()
  const assignedIssues = new Set()
  for (const [index, row] of ledger.rows.entries()) {
    assert.equal(row.id, `obsidian-${String(index + 1).padStart(3, '0')}`)
    assert.ok(!ids.has(row.id), `duplicate row id ${row.id}`)
    ids.add(row.id)
    nonEmptyString(row.title, `rows[${String(index)}].title`)
    nonEmptyString(row.section, `rows[${String(index)}].section`)
    assert.ok(Number.isSafeInteger(row.sourceLine) && row.sourceLine > 0)
    assert.ok(['included', 'excluded', 'not-needed'].includes(row.scope))
    assert.ok(['proven', 'gap', 'excluded'].includes(row.status))
    assert.ok(Array.isArray(row.evidence) && row.evidence.length > 0)
    nonEmptyString(row.owner, `rows[${String(index)}].owner`)
    if (row.scope === 'included') {
      assert.ok(row.status === 'proven' || row.status === 'gap')
      if (row.status === 'gap') assert.match(row.issueId, LEGACY_ISSUE)
      if (row.issueId !== null) {
        assert.match(row.issueId, LEGACY_ISSUE)
        assignedIssues.add(row.issueId)
      }
    } else {
      assert.equal(row.status, 'excluded')
      assert.equal(row.issueId, null)
      assert.equal(row.owner, 'none')
    }
  }

  const aggregateIds = new Set()
  for (const [index, capability] of ledger.additionalCapabilities.entries()) {
    const label = `additionalCapabilities[${String(index)}]`
    nonEmptyString(capability.id, `${label}.id`)
    assert.ok(!aggregateIds.has(capability.id), `duplicate capability id ${capability.id}`)
    aggregateIds.add(capability.id)
    nonEmptyString(capability.title, `${label}.title`)
    assert.equal(capability.scope, 'included')
    assert.ok(['proven', 'partial', 'gap'].includes(capability.status), `${label}.status is invalid`)
    assert.match(capability.issueId, LEGACY_ISSUE, `${label}.issueId is invalid`)
    nonEmptyString(capability.owner, `${label}.owner`)
    assert.ok(Array.isArray(capability.evidence) && capability.evidence.length > 0)
    assignedIssues.add(capability.issueId)
    if (capability.status === 'partial') {
      assert.ok(Array.isArray(capability.children) && capability.children.length > 0, `${label}.children is required for a partial aggregate`)
      for (const childId of capability.children) {
        assert.ok(RESIDUAL_IDS.has(childId), `${label}.children contains unknown residual ${String(childId)}`)
        const child = ledger.residualCapabilities.find(row => row.id === childId)
        assert.ok(child, `${label}.children references missing residual ${childId}`)
        assert.notEqual(child.status, 'proven', `${label} cannot be proven while ${childId} is unresolved`)
      }
    } else if (capability.children !== undefined) {
      assert.ok(Array.isArray(capability.children), `${label}.children must be an array`)
      for (const childId of capability.children) {
        const child = ledger.residualCapabilities.find(row => row.id === childId)
        assert.ok(child, `${label}.children references missing residual ${String(childId)}`)
        assert.equal(child.status, 'proven', `${label} cannot be proven while ${String(childId)} is unresolved`)
      }
    }
  }
  for (let number = 2; number <= 28; number += 1) {
    if (number === 27) continue
    assert.ok(assignedIssues.has(`tockteam-3t5.${String(number)}`), `issue 3t5.${String(number)} owns no capability`)
  }

  assert.ok(Array.isArray(ledger.residualCapabilities), 'residualCapabilities is required')
  assert.equal(ledger.residualCapabilities.length, RESIDUAL_IDS.size)
  const residualIds = new Set()
  for (const [index, capability] of ledger.residualCapabilities.entries()) {
    const label = `residualCapabilities[${String(index)}]`
    validateCapabilityShape(capability, RESIDUAL_ISSUE, label)
    assert.ok(!residualIds.has(capability.id), `duplicate residual id ${capability.id}`)
    residualIds.add(capability.id)
    assert.ok(RESIDUAL_IDS.has(capability.id), `unknown residual id ${capability.id}`)
    nonEmptyString(capability.area, `${label}.area`)
    validateOracle(capability.oracle, TOCKBOT_COMMIT, `${label}.oracle`)
  }
  assert.deepEqual([...residualIds].sort(), [...RESIDUAL_IDS].sort())

  assert.ok(Array.isArray(ledger.retainedDivergences), 'retainedDivergences is required')
  assert.equal(ledger.retainedDivergences.length, DIVERGENCE_IDS.size)
  const divergenceIds = new Set()
  for (const [index, divergence] of ledger.retainedDivergences.entries()) {
    const label = `retainedDivergences[${String(index)}]`
    nonEmptyString(divergence.id, `${label}.id`)
    assert.ok(!divergenceIds.has(divergence.id), `duplicate divergence id ${divergence.id}`)
    divergenceIds.add(divergence.id)
    assert.ok(DIVERGENCE_IDS.has(divergence.id), `unknown divergence id ${divergence.id}`)
    nonEmptyString(divergence.title, `${label}.title`)
    assert.equal(divergence.kind, 'security')
    assert.equal(divergence.scope, 'excluded')
    assert.equal(divergence.status, 'excluded')
    assert.equal(divergence.issueId, null)
    assert.equal(divergence.owner, 'none')
    assert.ok(Array.isArray(divergence.oracleSources) && divergence.oracleSources.length > 0, `${label}.oracleSources is required`)
    assert.ok(Array.isArray(divergence.oracleTests) && divergence.oracleTests.length > 0, `${label}.oracleTests is required`)
    for (const [sourceIndex, source] of divergence.oracleSources.entries()) relativeOraclePath(source, `${label}.oracleSources[${String(sourceIndex)}]`)
    for (const [testIndex, test] of divergence.oracleTests.entries()) relativeOraclePath(test, `${label}.oracleTests[${String(testIndex)}]`)
    nonEmptyString(divergence.focusedCommand, `${label}.focusedCommand`)
    nonEmptyString(divergence.realConsumerCheck, `${label}.realConsumerCheck`)
    nonEmptyString(divergence.securityRationale, `${label}.securityRationale`)
    nonEmptyString(divergence.disposition, `${label}.disposition`)
  }
  assert.deepEqual([...divergenceIds].sort(), [...DIVERGENCE_IDS].sort())

  const localEvidence = [
    ...ledger.rows.filter(row => row.scope === 'included').flatMap(row => row.evidence),
    ...ledger.additionalCapabilities.flatMap(capability => capability.evidence),
    ...ledger.residualCapabilities.flatMap(capability => capability.evidence),
    ...ledger.retainedDivergences.flatMap(divergence => divergence.evidence),
  ]
  await Promise.all(localEvidence.map(async evidence => {
    assert.ok(!evidence.startsWith('/'), `included evidence must be repository-relative: ${evidence}`)
    await stat(resolve(currentRepositoryRoot, evidence))
  }))

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
    const info = await stat(resolve(currentParityRoot, 'fixtures', path))
    assert.ok(info.isFile(), `${path} is not a regular fixture file`)
    assert.ok(info.size <= manifest.limits.maxFixtureFileBytes, `${path} exceeds the fixture bound`)
  }

  const welcome = await readFile(resolve(currentParityRoot, 'fixtures/vault/Notes/Welcome.md'), 'utf8')
  assert.match(welcome, /^---[\s\S]*aliases:[\s\S]*^---$/mu)
  assert.match(welcome, /\[\[Alias Target#Details\|the alias note\]\]/u)
  assert.match(welcome, /```mermaid/u)
  const canvas = JSON.parse(await readFile(resolve(currentParityRoot, 'fixtures/vault/Boards/Lesson.canvas'), 'utf8'))
  assert.ok(Array.isArray(canvas.nodes) && Array.isArray(canvas.edges))
  assert.equal(new Set(canvas.nodes.map(node => node.id)).size, canvas.nodes.length)
  assert.equal(new Set(canvas.edges.map(edge => edge.id)).size, canvas.edges.length)
  assert.ok(canvas.nodes.some(node => node.type === 'group'))
  assert.ok(canvas.nodes.some(node => node.type === 'link'))
  const base = await readFile(resolve(currentParityRoot, 'fixtures/vault/Bases/Lessons.base'), 'utf8')
  for (const token of ['formulas:', 'filters:', 'type: table', 'type: list', 'type: cards', 'type: map']) {
    assert.ok(base.includes(token), `Base fixture is missing ${token}`)
  }
  const hostile = JSON.parse(await readFile(resolve(currentParityRoot, 'fixtures/hostile-cases.json'), 'utf8'))
  assert.ok(Array.isArray(hostile.cases) && hostile.cases.length >= 8)
  assert.equal(new Set(hostile.cases.map(entry => entry.id)).size, hostile.cases.length)
  for (const kind of ['path', 'url', 'canvas', 'base', 'filesystem']) {
    assert.ok(hostile.cases.some(entry => entry.kind === kind), `hostile fixture lacks ${kind}`)
  }

  return {
    checklistRows: ledger.rows.length,
    residualCapabilities: ledger.residualCapabilities.length,
    proven: ledger.rows.filter(row => row.status === 'proven').length
      + ledger.additionalCapabilities.filter(capability => capability.status === 'proven').length
      + ledger.residualCapabilities.filter(capability => capability.status === 'proven').length,
    gaps: ledger.rows.filter(row => row.status === 'gap').length
      + ledger.additionalCapabilities.filter(capability => capability.status === 'gap').length
      + ledger.residualCapabilities.filter(capability => capability.status === 'gap').length,
    excluded: ledger.rows.filter(row => row.status === 'excluded').length
      + ledger.retainedDivergences.length,
    retainedDivergences: ledger.retainedDivergences.length,
  }
}

const ledger = JSON.parse(await readFile(resolve(parityRoot, 'ledger.json'), 'utf8'))
const manifest = JSON.parse(await readFile(resolve(parityRoot, 'fixtures/manifest.json'), 'utf8'))
const result = await validateLedger(ledger, manifest)
console.log(`TockTutor parity ledger: ${String(result.checklistRows)} checklist rows plus ${String(result.residualCapabilities)} residual capabilities, ${String(result.proven)} proven, ${String(result.gaps)} gaps, ${String(result.excluded)} excluded, ${String(result.retainedDivergences)} retained security divergences.`)
