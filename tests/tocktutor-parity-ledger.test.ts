import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const parityRoot = join(root, 'plugins', 'tocktutor', 'parity')

type Ledger = {
  schemaVersion: number
  sources: { tockbotCommit: string }
  additionalCapabilities: Array<Record<string, unknown>>
  residualCapabilities: Array<Record<string, unknown>>
  retainedDivergences: Array<Record<string, unknown>>
}

async function loadLedger(): Promise<Ledger> {
  return JSON.parse(await readFile(join(parityRoot, 'ledger.json'), 'utf8')) as Ledger
}

test('residual parity is feature-level and anchored to the pinned Tockbot oracle', async () => {
  const ledger = await loadLedger()
  assert.equal(ledger.schemaVersion, 2)
  assert.equal(ledger.sources.tockbotCommit, 'af214b2d1a5df8ca23bf99fad9f0408a07c2e4ba')
  assert.ok(ledger.residualCapabilities.length >= 14)

  const ids = new Set<string>()
  for (const row of ledger.residualCapabilities) {
    const id = row.id
    assert.equal(typeof id, 'string')
    assert.equal(ids.has(id as string), false, `duplicate residual id ${String(id)}`)
    ids.add(id as string)
    assert.equal(row.scope, 'included')
    assert.ok(row.status === 'gap' || row.status === 'proven')
    assert.match(String(row.issueId), /^tockteam-tc9\.(?:[2-9]|1[0-6])$/u)
    assert.equal(typeof row.owner, 'string')
    assert.equal(typeof row.focusedCommand, 'string')
    assert.equal(typeof row.realConsumerCheck, 'string')
    assert.ok(Array.isArray(row.evidence) && row.evidence.length > 0)
    const oracle = row.oracle as { commit?: unknown; source?: unknown; tests?: unknown }
    assert.equal(oracle.commit, ledger.sources.tockbotCommit)
    assert.ok(Array.isArray(oracle.source) && oracle.source.length > 0)
    assert.ok(Array.isArray(oracle.tests) && oracle.tests.length > 0)
  }

  const divergenceIds = new Set<string>()
  for (const row of ledger.retainedDivergences) {
    const id = row.id
    assert.equal(typeof id, 'string')
    assert.equal(divergenceIds.has(id as string), false, `duplicate divergence id ${String(id)}`)
    divergenceIds.add(id as string)
    assert.equal(row.kind, 'security')
    assert.equal(row.scope, 'excluded')
    assert.equal(row.status, 'excluded')
    assert.equal(row.owner, 'none')
    assert.equal(row.issueId, null)
    assert.equal(row.securityRationale !== undefined, true)
    assert.ok(Array.isArray(row.oracleSources) && row.oracleSources.length > 0)
  }
  assert.deepEqual([...divergenceIds].sort(), [
    'static-export-active-media',
    'static-export-network-content',
  ])
})

test('the validator rejects a residual row that loses its exact oracle or an umbrella child', async () => {
  const { validateLedger } = await import(pathToFileURL(join(parityRoot, 'validate.mjs')).href) as {
    validateLedger(ledger: Ledger, manifest: unknown, roots: { repositoryRoot: string; parityRoot: string }): Promise<unknown>
  }
  const ledger = await loadLedger()
  const manifest = JSON.parse(await readFile(join(parityRoot, 'fixtures', 'manifest.json'), 'utf8'))

  const missingField = structuredClone(ledger) as Ledger
  delete missingField.residualCapabilities[0]?.focusedCommand
  await assert.rejects(
    validateLedger(missingField, manifest, { repositoryRoot: root, parityRoot }),
    /focusedCommand/u,
  )

  const wrongOracle = structuredClone(ledger) as Ledger
  const oracle = wrongOracle.residualCapabilities[0]?.oracle as Record<string, unknown>
  oracle.commit = '0000000000000000000000000000000000000000'
  await assert.rejects(
    validateLedger(wrongOracle, manifest, { repositoryRoot: root, parityRoot }),
    /oracle\.commit/u,
  )

  const unresolvedChild = structuredClone(ledger) as Ledger
  const aggregate = unresolvedChild.additionalCapabilities.find(row => (
    row.status === 'proven' && Array.isArray(row.children) && row.children.length > 0
  ))
  assert.ok(aggregate)
  const child = unresolvedChild.residualCapabilities.find(row => row.id === (aggregate.children as string[])[0])
  assert.ok(child)
  child.status = 'gap'
  await assert.rejects(
    validateLedger(unresolvedChild, manifest, { repositoryRoot: root, parityRoot }),
    /cannot be proven/u,
  )
})
