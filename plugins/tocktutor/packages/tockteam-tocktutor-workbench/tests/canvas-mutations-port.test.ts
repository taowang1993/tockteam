import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateCanvasPointerValue,
  calculateCanvasResizeGeometry,
} from '../src/canvas-geometry.ts'
import {
  CanvasLinkUrlError,
  normalizeCanvasLinkUrl,
  tryNormalizeCanvasLinkUrl,
} from '../src/canvas-links.ts'
import {
  createCanvasFileNode,
  createCanvasGroupFromSelection,
  createCanvasGroupNode,
  createCanvasLinkNode,
  createCanvasTextNode,
  deleteCanvasGroup,
  deleteCanvasNodes,
  duplicateCanvasGroup,
  duplicateCanvasNodes,
  updateCanvasGroupLabel,
  updateCanvasLinkNode,
  updateCanvasNodeGeometries,
  updateCanvasNodeGeometry,
  updateCanvasTextNode,
} from '../src/canvas-nodes.ts'
import {
  createCanvasConnectedTextNode,
  createCanvasEdge,
  deleteCanvasEdge,
  reconnectCanvasEdge,
  updateCanvasEdgeColor,
  updateCanvasEdgeLabel,
} from '../src/canvas-edges.ts'
import { createCanvasChange } from '../src/canvas-change.ts'
import { assertUniqueCanvasDocumentIdentities } from '../src/canvas-identity.ts'
import { TOCKBOT_CANVAS_PROVENANCE } from '../src/canvas-provenance.ts'

function parse(content: string): Record<string, unknown> {
  return JSON.parse(content) as Record<string, unknown>
}

function nodes(content: string): Array<Record<string, unknown>> {
  return parse(content).nodes as Array<Record<string, unknown>>
}

function edges(content: string): Array<Record<string, unknown>> {
  return (parse(content).edges ?? []) as Array<Record<string, unknown>>
}

const source = JSON.stringify({
  extension: { keep: true },
  nodes: [
    { id: 'text-1', type: 'text', x: 0, y: 0, width: 240, height: 120, text: 'First', extra: 'text' },
    { id: 'file-1', type: 'file', x: 300, y: 0, width: 240, height: 120, file: 'Notes/Source.md', extra: 'file' },
    { id: 'group-1', type: 'group', x: -20, y: -20, width: 280, height: 160, label: 'Group', extra: 'group' },
  ],
  edges: [
    { id: 'edge-1', fromNode: 'text-1', fromSide: 'right', toNode: 'file-1', toSide: 'left', toEnd: 'arrow', label: 'Read', extra: 'edge' },
  ],
})

test('ports bounded snapping and resize geometry', () => {
  assert.equal(calculateCanvasPointerValue(0, 31, false), 40)
  assert.equal(calculateCanvasPointerValue(0, 31, true), 31)
  assert.deepEqual(calculateCanvasResizeGeometry(
    { x: 0, y: 0, width: 240, height: 120 },
    { x: 80, y: 10 },
    true,
    false,
  ), { x: 0, y: 0, width: 320, height: 160 })
  assert.deepEqual(calculateCanvasResizeGeometry(
    { x: 0, y: 0, width: 240, height: 120 },
    { x: -400, y: -400 },
    false,
    false,
  ), { x: 0, y: 0, width: 120, height: 80 })
})

test('normalizes only credential-free HTTP(S) Canvas links', () => {
  assert.equal(normalizeCanvasLinkUrl('example.com:8080/path'), 'https://example.com:8080/path')
  assert.equal(tryNormalizeCanvasLinkUrl('https://example.com/%7Ereader'), 'https://example.com/%7Ereader')
  assert.equal(tryNormalizeCanvasLinkUrl('https://user:secret@example.com'), undefined)
  for (const value of ['file:///tmp/secret', 'javascript:alert(1)', 'https://user:secret@example.com']) {
    assert.throws(() => normalizeCanvasLinkUrl(value), CanvasLinkUrlError)
  }
})

test('creates typed cards and groups without replacing unknown Canvas fields', () => {
  const text = createCanvasTextNode(source, { x: 571, y: 29 })
  assert.equal(text.nodeId, 'text-2')
  assert.deepEqual(nodes(text.content).find(node => node.id === text.nodeId), {
    id: 'text-2', x: 580, y: 20, width: 260, height: 140, type: 'text', text: '',
  })

  const group = createCanvasGroupNode(text.content)
  const file = createCanvasFileNode(group.content, './Notes\\Second.md')
  const link = createCanvasLinkNode(file.content, 'example.com')
  assert.equal(nodes(link.content).find(node => node.id === group.nodeId)?.label, 'Group')
  assert.equal(nodes(link.content).find(node => node.id === file.nodeId)?.file, 'Notes/Second.md')
  assert.equal(nodes(link.content).find(node => node.id === link.nodeId)?.url, 'https://example.com/')
  const updatedLink = updateCanvasLinkNode(link.content, link.nodeId, 'https://example.org/%7Ereader')
  assert.equal(nodes(updatedLink).find(node => node.id === link.nodeId)?.url, 'https://example.org/%7Ereader')
  assert.deepEqual(parse(updatedLink).extension, { keep: true })
  assert.throws(() => createCanvasFileNode(source, '../escape.md'), /vault-relative/u)
})

test('wraps an exact supported selection in a snapped group', () => {
  const created = createCanvasGroupFromSelection(source, ['text-1', 'file-1'])
  assert.deepEqual(nodes(created.content).find(node => node.id === created.nodeId), {
    id: 'group-2', type: 'group', x: -20, y: -20, width: 580, height: 160, label: 'Group',
  })
  assert.throws(() => createCanvasGroupFromSelection(source, ['missing']), /no longer exists/u)
})

test('updates card and group content atomically while retaining extension fields', () => {
  const text = updateCanvasTextNode(source, 'text-1', 'Updated')
  const label = updateCanvasGroupLabel(text, 'group-1', '  Research  ')
  const moved = updateCanvasNodeGeometries(label, [
    { nodeId: 'text-1', geometry: { x: 40, y: 60, width: 90, height: 20 } },
    { nodeId: 'file-1', geometry: { x: 360, y: 80, width: 260, height: 140 } },
  ])
  assert.deepEqual(nodes(moved).find(node => node.id === 'text-1'), {
    id: 'text-1', type: 'text', x: 40, y: 60, width: 120, height: 80, text: 'Updated', extra: 'text',
  })
  assert.equal(nodes(moved).find(node => node.id === 'group-1')?.label, 'Research')
  assert.deepEqual(parse(moved).extension, { keep: true })

  assert.throws(() => updateCanvasNodeGeometries(source, [
    { nodeId: 'text-1', geometry: { x: 10, y: 10, width: 120, height: 80 } },
    { nodeId: 'missing', geometry: { x: 10, y: 10, width: 120, height: 80 } },
  ]), /no longer exists/u)
  assert.equal(nodes(source).find(node => node.id === 'text-1')?.x, 0)
})

test('moves fully contained extension nodes with a group but not nested groups', () => {
  const grouped = JSON.stringify({
    rootExtra: true,
    nodes: [
      { id: 'group', type: 'group', x: 0, y: 0, width: 400, height: 300, label: 'Outer' },
      { id: 'custom', type: 'plugin-card', x: 40, y: 40, width: 120, height: 80, plugin: { keep: true } },
      { id: 'nested', type: 'group', x: 200, y: 100, width: 120, height: 80, label: 'Nested' },
      { id: 'outside', type: 'text', x: 500, y: 500, width: 120, height: 80, text: 'Outside' },
    ],
    edges: [],
  })
  const moved = updateCanvasNodeGeometry(grouped, 'group', { x: 40, y: 60, width: 400, height: 300 })
  assert.deepEqual(nodes(moved).find(node => node.id === 'custom'), {
    id: 'custom', type: 'plugin-card', x: 80, y: 100, width: 120, height: 80, plugin: { keep: true },
  })
  assert.equal(nodes(moved).find(node => node.id === 'nested')?.x, 200)
  assert.equal(nodes(moved).find(node => node.id === 'outside')?.x, 500)
})

test('duplicates cards with only internal edges and duplicates groups independently', () => {
  const duplicated = duplicateCanvasNodes(source, [
    { nodeId: 'text-1', geometry: { x: 40, y: 200, width: 240, height: 120 } },
    { nodeId: 'file-1', geometry: { x: 340, y: 200, width: 240, height: 120 } },
  ])
  assert.deepEqual(duplicated.nodeIds, ['text-1-copy', 'file-1-copy'])
  assert.equal(nodes(duplicated.content).find(node => node.id === 'text-1-copy')?.extra, 'text')
  assert.deepEqual(edges(duplicated.content).find(edge => edge.id === 'edge-1-copy'), {
    id: 'edge-1-copy', fromNode: 'text-1-copy', fromSide: 'right', toNode: 'file-1-copy', toSide: 'left', toEnd: 'arrow', label: 'Read', extra: 'edge',
  })

  const group = duplicateCanvasGroup(duplicated.content, 'group-1', { x: 0, y: 400, width: 280, height: 160 })
  assert.equal(group.nodeId, 'group-1-copy')
  assert.equal(nodes(group.content).find(node => node.id === group.nodeId)?.extra, 'group')
})

test('deletes only selected cards, incident edges, or a group boundary', () => {
  const deleted = deleteCanvasNodes(source, ['text-1'])
  assert.equal(nodes(deleted).some(node => node.id === 'text-1'), false)
  assert.equal(edges(deleted).some(edge => edge.id === 'edge-1'), false)
  assert.equal(nodes(deleted).some(node => node.id === 'group-1'), true)

  const withoutGroup = deleteCanvasGroup(source, 'group-1')
  assert.equal(nodes(withoutGroup).some(node => node.id === 'group-1'), false)
  assert.equal(nodes(withoutGroup).some(node => node.id === 'text-1'), true)
  assert.equal(edges(withoutGroup).some(edge => edge.id === 'edge-1'), true)
})

test('creates, reconnects, labels, colors, and deletes directed edges losslessly', () => {
  const board = JSON.stringify({
    customRoot: 'keep',
    nodes: [
      { id: 'text', type: 'text', x: 0, y: 0, width: 240, height: 120, text: 'Text' },
      { id: 'file', type: 'file', x: 300, y: 0, width: 240, height: 120, file: 'File.md' },
      { id: 'group', type: 'group', x: 600, y: 0, width: 300, height: 200, label: 'Group' },
    ],
    edges: [{ id: 'edge-1', fromNode: 'text', toNode: 'file', fromSide: 'right', toSide: 'left', customEdge: 7 }],
  })
  const created = createCanvasEdge(board, { fromNode: 'file', fromSide: 'right', toNode: 'group', toSide: 'left' })
  assert.equal(created.edgeId, 'edge-2')
  assert.deepEqual(edges(created.content).find(edge => edge.id === created.edgeId), {
    id: 'edge-2', fromNode: 'file', fromSide: 'right', toNode: 'group', toSide: 'left', toEnd: 'arrow',
  })

  const reconnected = reconnectCanvasEdge(created.content, { edgeId: 'edge-1', endpoint: 'to', nodeId: 'group', side: 'top' })
  assert.deepEqual(edges(reconnected).find(edge => edge.id === 'edge-1'), {
    id: 'edge-1', fromNode: 'text', toNode: 'group', fromSide: 'right', toSide: 'top', customEdge: 7,
  })
  const labelled = updateCanvasEdgeLabel(reconnected, 'edge-1', '  Depends on  ')
  const colored = updateCanvasEdgeColor(labelled, 'edge-1', '6')
  assert.equal(edges(colored).find(edge => edge.id === 'edge-1')?.label, 'Depends on')
  assert.equal(edges(colored).find(edge => edge.id === 'edge-1')?.color, '6')
  assert.deepEqual(parse(colored).customRoot, 'keep')

  const deleted = deleteCanvasEdge(colored, 'edge-1')
  assert.deepEqual(edges(deleted).map(edge => edge.id), ['edge-2'])
  assert.throws(() => updateCanvasEdgeColor(created.content, 'edge-1', '#bad'), /supported JSON Canvas color/u)
})

test('atomically creates an empty-drop text card and connection', () => {
  const created = createCanvasConnectedTextNode(source, {
    fromNode: 'text-1',
    fromSide: 'right',
    position: { x: 700, y: 200 },
  })
  assert.equal(created.nodeId, 'text-2')
  assert.equal(created.edgeId, 'edge-2')
  assert.deepEqual(nodes(created.content).find(node => node.id === created.nodeId), {
    id: 'text-2', x: 700, y: 140, width: 260, height: 140, type: 'text', text: '',
  })
  assert.deepEqual(edges(created.content).find(edge => edge.id === created.edgeId), {
    id: 'edge-2', fromNode: 'text-1', fromSide: 'right', toNode: 'text-2', toSide: 'left', toEnd: 'arrow',
  })
})

test('fails closed for duplicate identities, stale targets, and excessive geometry', () => {
  assert.throws(() => assertUniqueCanvasDocumentIdentities({
    nodes: [{ id: 'node' }, { id: 'node' }],
  }), /duplicate Canvas node ids/u)
  assert.throws(() => assertUniqueCanvasDocumentIdentities({
    edges: [{ id: 'edge' }, { id: 'edge' }],
  }), /duplicate Canvas edge ids/u)
  const duplicate = JSON.stringify({
    nodes: [
      { id: 'same', type: 'text', x: 0, y: 0, width: 120, height: 80, text: '' },
      { id: 'same', type: 'file', x: 200, y: 0, width: 120, height: 80, file: 'Note.md' },
    ],
    edges: [],
  })
  assert.throws(() => createCanvasTextNode(duplicate), /duplicate/u)
  assert.throws(() => updateCanvasTextNode(source, 'missing', 'Nope'), /no longer exists/u)
  assert.throws(() => updateCanvasNodeGeometry(source, 'text-1', {
    x: 1_000_000_001,
    y: 0,
    width: 120,
    height: 80,
  }), /geometry/u)
  assert.throws(() => createCanvasEdge(source, {
    fromNode: 'text-1',
    fromSide: 'right',
    toNode: 'text-1',
    toSide: 'left',
  }), /different nodes/u)
})

test('creates conflict-safe change requests with exact rollback inputs', () => {
  const change = createCanvasChange(source, 'sha256:before', 'move-node', content =>
    updateCanvasNodeGeometry(content, 'text-1', { x: 20, y: 0, width: 240, height: 120 }))
  assert.equal(change.previousSource, source)
  assert.equal(change.expectedRevision, 'sha256:before')
  assert.equal(change.operation, 'move-node')
  assert.equal(nodes(change.source).find(node => node.id === 'text-1')?.x, 20)
  assert.throws(() => createCanvasChange(source, '', 'move-node', content => content), /revision/u)
  assert.equal(TOCKBOT_CANVAS_PROVENANCE.revision, 'af214b2d1a5df8ca23bf99fad9f0408a07c2e4ba')
})
