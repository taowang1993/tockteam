import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  parseCanvasDocument,
  projectCanvas,
  updateCanvasNodePosition,
} from '../src/canvas.ts'
import { projectBase } from '../src/base.ts'

test('preserves unknown Canvas fields while projecting and updating known geometry', () => {
  const source = JSON.stringify({
    customRoot: { owner: 'fixture' },
    nodes: [{
      id: 'card-1',
      type: 'text',
      x: 1,
      y: 2,
      width: 120,
      height: 80,
      text: 'Hello',
      customNode: ['keep', 7],
    }],
    edges: [],
  })
  const parsed = parseCanvasDocument(source)
  assert.equal(parsed.status, 'ready')
  if (parsed.status !== 'ready') return
  assert.deepEqual(parsed.document.customRoot, { owner: 'fixture' })
  assert.equal(projectCanvas(parsed).nodes[0]?.supported, true)

  const updated = JSON.parse(updateCanvasNodePosition(source, 'card-1', 40, 50)) as Record<string, unknown>
  assert.deepEqual(updated.customRoot, { owner: 'fixture' })
  assert.deepEqual((updated.nodes as Array<Record<string, unknown>>)[0]?.customNode, ['keep', 7])
  assert.equal((updated.nodes as Array<Record<string, unknown>>)[0]?.x, 40)
  assert.equal((updated.nodes as Array<Record<string, unknown>>)[0]?.y, 50)
})

test('fails closed for duplicate Canvas identities and excessive node counts', () => {
  const duplicate = parseCanvasDocument(JSON.stringify({
    nodes: [
      { id: 'same', type: 'text', x: 0, y: 0, width: 1, height: 1 },
      { id: 'same', type: 'file', x: 0, y: 0, width: 1, height: 1 },
    ],
  }))
  assert.equal(duplicate.status, 'unsupported')
  assert.equal(parseCanvasDocument(JSON.stringify({
    nodes: [{ id: 'bad', type: 'text', x: 0, y: 0, width: -1, height: 1 }],
  })).status, 'unsupported')

  const excessive = parseCanvasDocument(JSON.stringify({
    nodes: Array.from({ length: 2_001 }, (_, index) => ({
      id: `node-${index}`,
      type: 'text',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })),
  }))
  assert.equal(excessive.status, 'unsupported')
})

test('projects supported Base views without evaluating formulas', () => {
  const projection = projectBase([
    'views:',
    '  - type: table',
    '    name: Tasks',
    '    order:',
    '      - file.name',
    '      - status',
    '    formula: status == "open"',
    '  - type: list',
    '    name: Queue',
  ].join('\n'))

  assert.equal(projection.status, 'ready')
  if (projection.status !== 'ready') return
  assert.deepEqual(projection.views.map(view => view.name), ['Tasks', 'Queue'])
  assert.equal(projection.views[0]?.status, 'unsupported')
  assert.match(projection.views[0]?.warnings.join(' ') ?? '', /inert/i)
  assert.equal(projection.views[1]?.status, 'ready')
})

test('shows unsupported Base syntax instead of executing or dropping it', async () => {
  assert.equal(projectBase('views:\n\t- type: table').status, 'unsupported')
  assert.equal(projectBase('views:\n  - type: !!js Function').status, 'unsupported')
  assert.equal(projectBase('x'.repeat(2_000_001)).status, 'unsupported')

  const source = await readFile(new URL('../src/base.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\beval\s*\(|new Function|dynamic import|node:fs|fetch\s*\(/u)
})
