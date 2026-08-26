import assert from 'node:assert/strict'
import test from 'node:test'
import { layoutGraph, projectGraph } from '../dist/graph.js'

const graph = {
  complete: true,
  cursor: null,
  edges: [
    { fragment: null, kind: 'wiki' as const, line: 1, sourcePath: 'A.md', targetPath: 'B.md' },
    { fragment: null, kind: 'markdown' as const, line: 2, sourcePath: 'B.md', targetPath: 'C.md' },
  ],
  generation: 1,
  missing: [],
  nodes: [
    { depth: 0, path: 'A.md' },
    { depth: 1, path: 'B.md' },
    { depth: 2, path: 'C.md' },
    { depth: null, path: 'Orphan.md' },
  ],
  orphans: ['Orphan.md'],
  path: null,
  scan: { bytes: 10, entries: 4, files: 4 },
  truncated: false,
  truncationReason: null,
  warnings: [],
}

test('projects deterministic bounded Global and Local Graph topology', () => {
  const global = projectGraph(graph, { includeOrphans: false, query: 'md' })
  assert.deepEqual(global.nodes.map(node => node.path), ['A.md', 'B.md', 'C.md'])
  assert.equal(global.edges.length, 2)
  const local = projectGraph({ ...graph, path: 'A.md' }, { includeOrphans: true, query: '' })
  assert.equal(local.activePath, 'A.md')
})

test('settles one deterministic finite layout without a background simulation', () => {
  const projected = projectGraph(graph, { includeOrphans: true, query: '' })
  const first = layoutGraph(projected, { centerForce: 0.1, iterations: 32, linkDistance: 120, linkForce: 0.08, repelForce: 1800 })
  const second = layoutGraph(projected, { centerForce: 0.1, iterations: 32, linkDistance: 120, linkForce: 0.08, repelForce: 1800 })
  assert.deepEqual(first, second)
  assert.equal(first.length, 4)
  assert.equal(first.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)), true)
})

test('caps excessive graph input before force work', () => {
  const excessive = { ...graph, nodes: Array.from({ length: 181 }, (_, index) => ({ depth: null, path: `N${String(index)}.md` })) }
  assert.throws(() => projectGraph(excessive, { includeOrphans: true, query: '' }), /node limit/u)
})
