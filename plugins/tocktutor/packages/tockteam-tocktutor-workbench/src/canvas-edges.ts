import {
  type CanvasDocument,
  parseCanvasForMutation,
  serializeCanvasDocument,
} from './canvas.ts'
import { isCanvasSide, type CanvasSide } from './canvas-geometry.ts'
import {
  CANVAS_DEFAULT_TEXT_CARD_SIZE,
  createCanvasTextNode,
  isSupportedCanvasCard,
} from './canvas-nodes.ts'

export type CanvasEdgeEndpoint = 'from' | 'to'

export function isConnectableCanvasNode(node: Record<string, unknown>): boolean {
  return isSupportedCanvasCard(node) || node.type === 'group'
}

function nodeMap(document: CanvasDocument) {
  return new Map(document.nodes.map(node => [node.id, node]))
}

/** Add one directed edge between two supported cards or groups. */
export function createCanvasEdge(content: string, connection: {
  fromNode: string
  fromSide: CanvasSide
  toNode: string
  toSide: CanvasSide
}): { edgeId: string; content: string } {
  const document = parseCanvasForMutation(content)
  const nodes = nodeMap(document)
  const fromNode = nodes.get(connection.fromNode)
  const toNode = nodes.get(connection.toNode)
  if (fromNode === undefined || toNode === undefined
    || !isConnectableCanvasNode(fromNode) || !isConnectableCanvasNode(toNode)) {
    throw new Error('Canvas connections require two supported nodes.')
  }
  if (connection.fromNode === connection.toNode) {
    throw new Error('Canvas connections require two different nodes.')
  }
  if (!isCanvasSide(connection.fromSide) || !isCanvasSide(connection.toSide)) {
    throw new Error('Canvas connections require valid node sides.')
  }

  const existingIds = new Set([
    ...document.nodes.map(node => node.id),
    ...(document.edges ?? []).map(edge => edge.id),
  ])
  let index = 1
  while (existingIds.has(`edge-${String(index)}`)) index += 1
  const edgeId = `edge-${String(index)}`
  document.edges = [
    ...(document.edges ?? []),
    { id: edgeId, ...connection, toEnd: 'arrow' },
  ]
  return { edgeId, content: serializeCanvasDocument(document) }
}

/** Create one text card and incoming connection as one serialized mutation. */
export function createCanvasConnectedTextNode(content: string, connection: {
  fromNode: string
  fromSide: CanvasSide
  position: { x: number; y: number }
}): { nodeId: string; edgeId: string; content: string } {
  if (!isCanvasSide(connection.fromSide)) throw new Error('Canvas connections require valid node sides.')
  const { width, height } = CANVAS_DEFAULT_TEXT_CARD_SIZE
  const toSide: CanvasSide = ({ top: 'bottom', right: 'left', bottom: 'top', left: 'right' } as const)[connection.fromSide]
  const position = {
    x: connection.position.x - (toSide === 'right' ? width : toSide === 'top' || toSide === 'bottom' ? width / 2 : 0),
    y: connection.position.y - (toSide === 'bottom' ? height : toSide === 'left' || toSide === 'right' ? height / 2 : 0),
  }
  const node = createCanvasTextNode(content, position)
  const edge = createCanvasEdge(node.content, {
    fromNode: connection.fromNode,
    fromSide: connection.fromSide,
    toNode: node.nodeId,
    toSide,
  })
  return { nodeId: node.nodeId, edgeId: edge.edgeId, content: edge.content }
}

/** Move one endpoint while retaining edge identity and every unrelated field. */
export function reconnectCanvasEdge(content: string, update: {
  edgeId: string
  endpoint: CanvasEdgeEndpoint
  nodeId: string
  side: CanvasSide
}): string {
  const document = parseCanvasForMutation(content)
  const edge = document.edges?.find(candidate => candidate.id === update.edgeId)
  if (edge === undefined) throw new Error('The selected Canvas edge no longer exists.')
  if ((update.endpoint !== 'from' && update.endpoint !== 'to') || !isCanvasSide(update.side)) {
    throw new Error('Canvas connections require a valid endpoint and node side.')
  }

  const nodes = nodeMap(document)
  const nextNode = nodes.get(update.nodeId)
  const fixedNodeId = update.endpoint === 'from' ? edge.toNode : edge.fromNode
  const fixedNode = nodes.get(fixedNodeId)
  if (nextNode === undefined || fixedNode === undefined
    || !isConnectableCanvasNode(nextNode) || !isConnectableCanvasNode(fixedNode)) {
    throw new Error('Canvas connections require two supported nodes.')
  }
  if (update.nodeId === fixedNodeId) throw new Error('Canvas connections require two different nodes.')

  if (update.endpoint === 'from') {
    edge.fromNode = update.nodeId
    edge.fromSide = update.side
  } else {
    edge.toNode = update.nodeId
    edge.toSide = update.side
  }
  return serializeCanvasDocument(document)
}

function edgeDocument(content: string): CanvasDocument & { edges: NonNullable<CanvasDocument['edges']> } {
  const document = parseCanvasForMutation(content)
  if (document.edges === undefined) throw new Error('This .canvas file does not contain Canvas edges.')
  return document as CanvasDocument & { edges: NonNullable<CanvasDocument['edges']> }
}

export function updateCanvasEdgeLabel(content: string, edgeId: string, label: string): string {
  const document = edgeDocument(content)
  const edge = document.edges.find(candidate => candidate.id === edgeId)
  if (edge === undefined) throw new Error('The selected Canvas edge no longer exists.')
  const normalizedLabel = label.trim()
  if (normalizedLabel) edge.label = normalizedLabel
  else delete edge.label
  return serializeCanvasDocument(document)
}

export function updateCanvasEdgeColor(content: string, edgeId: string, color: string): string {
  const document = edgeDocument(content)
  const edge = document.edges.find(candidate => candidate.id === edgeId)
  if (edge === undefined) throw new Error('The selected Canvas edge no longer exists.')
  if (color && !/^[1-6]$/u.test(color)) {
    throw new Error('The selected color is not a supported JSON Canvas color.')
  }
  if (color) edge.color = color
  else delete edge.color
  return serializeCanvasDocument(document)
}

export function deleteCanvasEdge(content: string, edgeId: string): string {
  const document = edgeDocument(content)
  const edgeIndex = document.edges.findIndex(edge => edge.id === edgeId)
  if (edgeIndex < 0) throw new Error('The selected Canvas edge no longer exists.')
  document.edges.splice(edgeIndex, 1)
  return serializeCanvasDocument(document)
}
