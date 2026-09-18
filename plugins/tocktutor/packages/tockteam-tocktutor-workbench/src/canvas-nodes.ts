import {
  type CanvasDocument,
  type CanvasNode,
  parseCanvasForMutation,
  serializeCanvasDocument,
} from './canvas.ts'
import {
  CANVAS_GRID_SIZE,
  MIN_CANVAS_NODE_HEIGHT,
  MIN_CANVAS_NODE_WIDTH,
  calculateCanvasPointerValue,
  isBoundedCanvasGeometry,
  type CanvasNodeGeometry,
  type CanvasNodeGeometryUpdate,
} from './canvas-geometry.ts'
import { normalizeCanvasLinkUrl } from './canvas-links.ts'

const SUPPORTED_CANVAS_CARD_TYPES = new Set(['text', 'file', 'link'])
export const CANVAS_DEFAULT_TEXT_CARD_SIZE = { width: 260, height: 140 } as const

export function isSupportedCanvasCard(node: Record<string, unknown>): boolean {
  return typeof node.type === 'string' && SUPPORTED_CANVAS_CARD_TYPES.has(node.type)
}

function nextCanvasId(document: CanvasDocument, prefix: 'text' | 'file' | 'link' | 'group'): string {
  const existingIds = new Set([
    ...document.nodes.map(node => node.id),
    ...(document.edges ?? []).map(edge => edge.id),
  ])
  let index = 1
  while (existingIds.has(`${prefix}-${String(index)}`)) index += 1
  return `${prefix}-${String(index)}`
}

function createCanvasNode(
  content: string,
  prefix: 'text' | 'file' | 'link' | 'group',
  fields: Record<string, unknown>,
  size: { width: number; height: number } = CANVAS_DEFAULT_TEXT_CARD_SIZE,
): { nodeId: string; content: string } {
  const document = parseCanvasForMutation(content)
  const rightmost = document.nodes.reduce(
    (right, node) => Math.max(right, node.x + Math.max(MIN_CANVAS_NODE_WIDTH, node.width)),
    0,
  )
  const nodeId = nextCanvasId(document, prefix)
  document.nodes.push({
    id: nodeId,
    x: rightmost ? rightmost + 40 : 0,
    y: 0,
    ...size,
    ...fields,
  } as CanvasNode)
  return { nodeId, content: serializeCanvasDocument(document) }
}

/** Add a new editable text card without replacing unrelated fields. */
export function createCanvasTextNode(content: string, position?: { x: number; y: number }): { nodeId: string; content: string } {
  if (position !== undefined && ![position.x, position.y].every(Number.isFinite)) {
    throw new Error('The Canvas card position is invalid.')
  }
  return createCanvasNode(content, 'text', {
    type: 'text',
    text: '',
    ...(position === undefined ? {} : {
      x: calculateCanvasPointerValue(0, position.x, false),
      y: calculateCanvasPointerValue(0, position.y, false),
    }),
  })
}

/** Add an editable group boundary. */
export function createCanvasGroupNode(content: string): { nodeId: string; content: string } {
  return createCanvasNode(content, 'group', { type: 'group', label: 'Group' }, { width: 420, height: 260 })
}

/** Add a snapped group around an exact selection of supported cards. */
export function createCanvasGroupFromSelection(content: string, nodeIds: readonly string[]): { nodeId: string; content: string } {
  const document = parseCanvasForMutation(content)
  const selectedIds = new Set(nodeIds)
  const selectedNodes = document.nodes.filter(node => selectedIds.has(node.id))
  if (selectedIds.size === 0 || selectedIds.size !== nodeIds.length || selectedNodes.length !== selectedIds.size
    || selectedNodes.some(node => !isSupportedCanvasCard(node))) {
    throw new Error('A selected supported Canvas card no longer exists.')
  }

  const left = Math.min(...selectedNodes.map(node => node.x))
  const top = Math.min(...selectedNodes.map(node => node.y))
  const right = Math.max(...selectedNodes.map(node => node.x + node.width))
  const bottom = Math.max(...selectedNodes.map(node => node.y + node.height))
  const x = Math.floor((left - CANVAS_GRID_SIZE) / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE
  const y = Math.floor((top - CANVAS_GRID_SIZE) / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE
  const outerRight = Math.ceil((right + CANVAS_GRID_SIZE) / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE
  const outerBottom = Math.ceil((bottom + CANVAS_GRID_SIZE) / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE
  const geometry = {
    x,
    y,
    width: Math.max(MIN_CANVAS_NODE_WIDTH, outerRight - x),
    height: Math.max(MIN_CANVAS_NODE_HEIGHT, outerBottom - y),
  }
  if (!isBoundedCanvasGeometry(geometry)) throw new Error('The Canvas group geometry is invalid.')

  const nodeId = nextCanvasId(document, 'group')
  document.nodes.push({ id: nodeId, type: 'group', ...geometry, label: 'Group' })
  return { nodeId, content: serializeCanvasDocument(document) }
}

/** Add a syntactically safe vault-relative file card. Host authority still resolves the path. */
export function createCanvasFileNode(content: string, relativePath: string): { nodeId: string; content: string } {
  const normalizedPath = relativePath.trim().replaceAll('\\', '/').replace(/^\.\//u, '')
  if (!normalizedPath || normalizedPath.startsWith('/')
    || normalizedPath.split('/').some(segment => segment === '..' || segment === '')) {
    throw new Error('Canvas file cards require a safe vault-relative file path.')
  }
  return createCanvasNode(content, 'file', { type: 'file', file: normalizedPath })
}

export function createCanvasLinkNode(content: string, value: string): { nodeId: string; content: string } {
  return createCanvasNode(content, 'link', { type: 'link', url: normalizeCanvasLinkUrl(value) })
}

export function updateCanvasLinkNode(content: string, nodeId: string, value: string): string {
  const document = parseCanvasForMutation(content)
  const node = document.nodes.find(candidate => candidate.id === nodeId)
  if (node?.type !== 'link') throw new Error('The selected Canvas link card no longer exists.')
  node.url = normalizeCanvasLinkUrl(value)
  return serializeCanvasDocument(document)
}

export function updateCanvasTextNode(content: string, nodeId: string, text: string): string {
  const document = parseCanvasForMutation(content)
  const node = document.nodes.find(candidate => candidate.id === nodeId)
  if (node?.type !== 'text') throw new Error('The selected Canvas text card no longer exists.')
  node.text = text
  return serializeCanvasDocument(document)
}

/** Validate every selected card before applying one atomic geometry update. */
export function updateCanvasNodeGeometries(content: string, updates: readonly CanvasNodeGeometryUpdate[]): string {
  const document = parseCanvasForMutation(content)
  if (new Set(updates.map(update => update.nodeId)).size !== updates.length) {
    throw new Error('A Canvas card was selected more than once.')
  }
  const nodesById = new Map(document.nodes.map(node => [node.id, node]))
  for (const update of updates) {
    const node = nodesById.get(update.nodeId)
    if (node === undefined || !isSupportedCanvasCard(node)) {
      throw new Error('A selected supported Canvas card no longer exists.')
    }
    if (!isBoundedCanvasGeometry(update.geometry)) throw new Error('The Canvas card geometry is invalid.')
  }
  for (const update of updates) {
    Object.assign(nodesById.get(update.nodeId)!, {
      ...update.geometry,
      width: Math.max(MIN_CANVAS_NODE_WIDTH, update.geometry.width),
      height: Math.max(MIN_CANVAS_NODE_HEIGHT, update.geometry.height),
    })
  }
  return serializeCanvasDocument(document)
}

/** Move a mixed card/group selection once, including unselected cards contained by selected groups. */
export function moveCanvasNodes(content: string, nodeIds: readonly string[], deltaX: number, deltaY: number): string {
  const document = parseCanvasForMutation(content)
  const selected = new Set(nodeIds)
  if (selected.size !== nodeIds.length) throw new Error('A Canvas card was selected more than once.')
  if (selected.size === 0 || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
    throw new Error('The Canvas selection movement is invalid.')
  }
  const selectedNodes = document.nodes.filter(node => selected.has(node.id))
  if (selectedNodes.length !== selected.size || selectedNodes.some(node => !isSupportedCanvasCard(node) && node.type !== 'group')) {
    throw new Error('A selected supported Canvas card no longer exists.')
  }
  const selectedGroups = selectedNodes.filter(node => node.type === 'group')
  const moved = document.nodes.filter(node => selected.has(node.id)
    || (node.type !== 'group' && selectedGroups.some(group => contains(group, node))))
  for (const node of moved) {
    if (!isBoundedCanvasGeometry({ ...node, x: node.x + deltaX, y: node.y + deltaY })) {
      throw new Error('The Canvas selection movement is invalid.')
    }
  }
  for (const node of moved) {
    node.x += deltaX
    node.y += deltaY
  }
  return serializeCanvasDocument(document)
}

function contains(group: CanvasNodeGeometry, node: CanvasNodeGeometry): boolean {
  return node.x >= group.x
    && node.y >= group.y
    && node.x + node.width <= group.x + group.width
    && node.y + node.height <= group.y + group.height
}

/** Move or resize a group; position-only moves translate fully contained non-group nodes. */
export function updateCanvasGroupGeometry(content: string, nodeId: string, geometry: CanvasNodeGeometry): string {
  const document = parseCanvasForMutation(content)
  const group = document.nodes.find(node => node.id === nodeId)
  if (group?.type !== 'group') throw new Error('The selected Canvas group no longer exists.')
  if (!isBoundedCanvasGeometry(geometry)) throw new Error('The Canvas group geometry is invalid.')

  const startingGeometry = { x: group.x, y: group.y, width: group.width, height: group.height }
  const deltaX = geometry.x - group.x
  const deltaY = geometry.y - group.y
  const positionOnly = geometry.width === group.width && geometry.height === group.height
  const contained = positionOnly
    ? document.nodes.filter(node => node !== group && node.type !== 'group' && contains(startingGeometry, node))
    : []
  for (const node of contained) {
    if (!isBoundedCanvasGeometry({ ...node, x: node.x + deltaX, y: node.y + deltaY })) {
      throw new Error('The Canvas group geometry is invalid.')
    }
  }
  for (const node of contained) {
    node.x += deltaX
    node.y += deltaY
  }
  Object.assign(group, {
    ...geometry,
    width: Math.max(MIN_CANVAS_NODE_WIDTH, geometry.width),
    height: Math.max(MIN_CANVAS_NODE_HEIGHT, geometry.height),
  })
  return serializeCanvasDocument(document)
}

export function updateCanvasNodeGeometry(content: string, nodeId: string, geometry: CanvasNodeGeometry): string {
  const document = parseCanvasForMutation(content)
  const node = document.nodes.find(candidate => candidate.id === nodeId)
  if (node?.type === 'group') return updateCanvasGroupGeometry(content, nodeId, geometry)
  return updateCanvasNodeGeometries(content, [{ nodeId, geometry }])
}

export function updateCanvasGroupLabel(content: string, nodeId: string, label: string): string {
  const document = parseCanvasForMutation(content)
  const node = document.nodes.find(candidate => candidate.id === nodeId)
  if (node?.type !== 'group') throw new Error('The selected Canvas group no longer exists.')
  const normalizedLabel = label.trim()
  if (!normalizedLabel) throw new Error('The Canvas group label cannot be empty.')
  node.label = normalizedLabel
  return serializeCanvasDocument(document)
}

/** Delete a group boundary without deleting contained cards or edges. */
export function deleteCanvasGroup(content: string, nodeId: string): string {
  const document = parseCanvasForMutation(content)
  const nodeIndex = document.nodes.findIndex(node => node.id === nodeId)
  if (nodeIndex < 0 || document.nodes[nodeIndex]?.type !== 'group') {
    throw new Error('The selected Canvas group no longer exists.')
  }
  document.nodes.splice(nodeIndex, 1)
  if (document.edges !== undefined) {
    document.edges = document.edges.filter(edge => edge.fromNode !== nodeId && edge.toNode !== nodeId)
  }
  return serializeCanvasDocument(document)
}

/** Delete supported cards and only their incident edges. */
export function deleteCanvasNodes(content: string, nodeIds: readonly string[]): string {
  const document = parseCanvasForMutation(content)
  const selectedIds = new Set(nodeIds)
  const selectedNodes = document.nodes.filter(node => selectedIds.has(node.id))
  if (selectedIds.size !== nodeIds.length || selectedNodes.length !== selectedIds.size
    || selectedNodes.some(node => !isSupportedCanvasCard(node))) {
    throw new Error('A selected supported Canvas card no longer exists.')
  }
  document.nodes = document.nodes.filter(node => !selectedIds.has(node.id))
  if (document.edges !== undefined) {
    document.edges = document.edges.filter(edge => !selectedIds.has(edge.fromNode) && !selectedIds.has(edge.toNode))
  }
  return serializeCanvasDocument(document)
}

export function deleteCanvasNode(content: string, nodeId: string): string {
  return deleteCanvasNodes(content, [nodeId])
}

function nextCopyId(sourceId: string, existingIds: Set<string>): string {
  const base = `${sourceId}-copy`
  let candidate = base
  let index = 2
  while (existingIds.has(candidate)) {
    candidate = `${base}-${String(index)}`
    index += 1
  }
  existingIds.add(candidate)
  return candidate
}

export function duplicateCanvasGroup(content: string, nodeId: string, geometry: CanvasNodeGeometry): { nodeId: string; content: string } {
  const document = parseCanvasForMutation(content)
  const source = document.nodes.find(node => node.id === nodeId)
  if (source?.type !== 'group') throw new Error('The selected Canvas group no longer exists.')
  if (!isBoundedCanvasGeometry(geometry)) throw new Error('The Canvas group geometry is invalid.')
  const ids = new Set([...document.nodes.map(node => node.id), ...(document.edges ?? []).map(edge => edge.id)])
  const copiedNodeId = nextCopyId(nodeId, ids)
  document.nodes.push({
    ...source,
    id: copiedNodeId,
    ...geometry,
    width: Math.max(MIN_CANVAS_NODE_WIDTH, geometry.width),
    height: Math.max(MIN_CANVAS_NODE_HEIGHT, geometry.height),
  })
  return { nodeId: copiedNodeId, content: serializeCanvasDocument(document) }
}

/** Duplicate supported cards and edges wholly contained by the selection. */
export function duplicateCanvasNodes(content: string, updates: readonly CanvasNodeGeometryUpdate[]): { nodeIds: string[]; content: string } {
  const document = parseCanvasForMutation(content)
  const selectedIds = new Set(updates.map(update => update.nodeId))
  if (selectedIds.size !== updates.length) throw new Error('A Canvas card was selected more than once.')
  const nodesById = new Map(document.nodes.map(node => [node.id, node]))
  for (const update of updates) {
    const node = nodesById.get(update.nodeId)
    if (node === undefined || !isSupportedCanvasCard(node)) {
      throw new Error('A selected supported Canvas card no longer exists.')
    }
    if (!isBoundedCanvasGeometry(update.geometry)) throw new Error('The Canvas card geometry is invalid.')
  }

  const ids = new Set([...document.nodes.map(node => node.id), ...(document.edges ?? []).map(edge => edge.id)])
  const copiedNodeIds = new Map<string, string>()
  for (const update of updates) copiedNodeIds.set(update.nodeId, nextCopyId(update.nodeId, ids))
  for (const update of updates) {
    const source = nodesById.get(update.nodeId)!
    document.nodes.push({
      ...source,
      id: copiedNodeIds.get(update.nodeId)!,
      ...update.geometry,
      width: Math.max(MIN_CANVAS_NODE_WIDTH, update.geometry.width),
      height: Math.max(MIN_CANVAS_NODE_HEIGHT, update.geometry.height),
    })
  }

  const copiedEdges = (document.edges ?? []).flatMap(edge => {
    const fromNode = copiedNodeIds.get(edge.fromNode)
    const toNode = copiedNodeIds.get(edge.toNode)
    return fromNode !== undefined && toNode !== undefined
      ? [{ ...edge, id: nextCopyId(edge.id, ids), fromNode, toNode }]
      : []
  })
  if (copiedEdges.length > 0) document.edges = [...(document.edges ?? []), ...copiedEdges]
  return {
    nodeIds: updates.map(update => copiedNodeIds.get(update.nodeId)!),
    content: serializeCanvasDocument(document),
  }
}
