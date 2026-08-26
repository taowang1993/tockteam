import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createCanvasChange, type CanvasChange } from './canvas-change.ts'
import { createCanvasEdge, deleteCanvasEdge, isConnectableCanvasNode } from './canvas-edges.ts'
import { CANVAS_GRID_SIZE, type CanvasSide } from './canvas-geometry.ts'
import { tryNormalizeCanvasLinkUrl } from './canvas-links.ts'
import { updateCanvasNodeGeometry } from './canvas-nodes.ts'
import { parseCanvasDocument } from './canvas.ts'

const BOARD_PADDING = 40
const MAX_CANVAS_BOARD_SPAN = 100_000
const SIDES: readonly CanvasSide[] = ['top', 'right', 'bottom', 'left']

export interface CanvasBoardProps {
  source: string
  revision: string
  onChange(change: CanvasChange): void
  disabled?: boolean
}

type ArmedConnection = { nodeId: string; side: CanvasSide }

function nodeLabel(node: Record<string, unknown>): string {
  if (node.type === 'file' && typeof node.file === 'string') return node.file
  if (node.type === 'link' && typeof node.url === 'string') return node.url
  if (node.type === 'group' && typeof node.label === 'string') return node.label
  if (typeof node.text === 'string') {
    const first = node.text.trim().split(/\r?\n/u)[0]?.replace(/^#{1,6}\s+/u, '').trim()
    if (first) return first
  }
  return typeof node.id === 'string' ? node.id : 'Canvas Card'
}

function titleCaseSide(side: CanvasSide): string {
  return `${side.slice(0, 1).toUpperCase()}${side.slice(1)}`
}

function sideHandleStyle(side: CanvasSide): CSSProperties {
  return {
    bottom: side === 'bottom' ? 0 : undefined,
    left: side === 'left' ? 0 : side === 'top' || side === 'bottom' ? '50%' : undefined,
    right: side === 'right' ? 0 : undefined,
    top: side === 'top' ? 0 : side === 'left' || side === 'right' ? '50%' : undefined,
    transform: ({
      top: 'translate(-50%, -50%)',
      right: 'translate(50%, -50%)',
      bottom: 'translate(-50%, 50%)',
      left: 'translate(-50%, -50%)',
    } as const)[side],
  }
}

/**
 * Controlled, browser-only Canvas seam. It never saves or owns optimistic
 * source; every edit carries the exact previous source and expected revision.
 */
export function CanvasBoard({ source, revision, onChange, disabled = false }: CanvasBoardProps) {
  const parsed = useMemo(() => parseCanvasDocument(source), [source])
  const [armed, setArmed] = useState<ArmedConnection | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const document = parsed.status === 'ready' ? parsed.document : null
  const labels = useMemo(() => new Map(
    (document?.nodes ?? []).map(node => [node.id, nodeLabel(node)]),
  ), [document])

  useEffect(() => {
    if (document === null) {
      setArmed(null)
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      return
    }
    if (armed !== null && !document.nodes.some(node => node.id === armed.nodeId)) setArmed(null)
    if (selectedNodeId !== null && !document.nodes.some(node => node.id === selectedNodeId)) setSelectedNodeId(null)
    if (selectedEdgeId !== null && !document.edges?.some(edge => edge.id === selectedEdgeId)) setSelectedEdgeId(null)
  }, [armed, document, selectedEdgeId, selectedNodeId])

  const bounds = useMemo(() => {
    if (document === null || document.nodes.length === 0) {
      return { minX: 0, minY: 0, width: 800, height: 500, supported: true }
    }
    const minX = Math.min(0, ...document.nodes.map(node => node.x))
    const minY = Math.min(0, ...document.nodes.map(node => node.y))
    const maxX = Math.max(...document.nodes.map(node => node.x + node.width))
    const maxY = Math.max(...document.nodes.map(node => node.y + node.height))
    const width = maxX - minX + BOARD_PADDING * 2
    const height = maxY - minY + BOARD_PADDING * 2
    return {
      minX,
      minY,
      width: Math.max(800, width),
      height: Math.max(500, height),
      supported: width <= MAX_CANVAS_BOARD_SPAN && height <= MAX_CANVAS_BOARD_SPAN,
    }
  }, [document])

  const emit = (operation: CanvasChange['operation'], mutate: (content: string) => string): void => {
    if (disabled) return
    try {
      setError(null)
      onChange(createCanvasChange(source, revision, operation, mutate))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The Canvas change could not be prepared.')
    }
  }

  const activateHandle = (nodeId: string, side: CanvasSide): void => {
    if (disabled) return
    if (armed === null) {
      setError(null)
      setArmed({ nodeId, side })
      return
    }
    emit('create-edge', content => createCanvasEdge(content, {
      fromNode: armed.nodeId,
      fromSide: armed.side,
      toNode: nodeId,
      toSide: side,
    }).content)
    setArmed(null)
  }

  const moveNode = (nodeId: string, event: KeyboardEvent<HTMLButtonElement>): void => {
    const delta = ({
      ArrowDown: { x: 0, y: CANVAS_GRID_SIZE },
      ArrowLeft: { x: -CANVAS_GRID_SIZE, y: 0 },
      ArrowRight: { x: CANVAS_GRID_SIZE, y: 0 },
      ArrowUp: { x: 0, y: -CANVAS_GRID_SIZE },
    } as const)[event.key as 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'ArrowUp']
    if (delta === undefined || document === null) return
    const node = document.nodes.find(candidate => candidate.id === nodeId)
    if (node === undefined) return
    event.preventDefault()
    emit('move-node', content => updateCanvasNodeGeometry(content, nodeId, {
      x: node.x + delta.x,
      y: node.y + delta.y,
      width: node.width,
      height: node.height,
    }))
  }

  const cancelConnection = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Escape' || armed === null) return
    event.preventDefault()
    setArmed(null)
  }

  if (document === null) {
    const reason = parsed.status === 'unsupported' ? parsed.reason : 'This Canvas could not be displayed.'
    return <section aria-label="Canvas Board" role="region"><p role="note">{reason}</p></section>
  }
  if (!bounds.supported) {
    return (
      <section aria-label="Canvas Board" role="region">
        <p role="note">This Canvas exceeds the bounded board display limit.</p>
      </section>
    )
  }

  return (
    <section
      aria-label="Canvas Board"
      className="relative min-h-0 overflow-auto bg-[var(--tt-bg)] text-[var(--tt-text)]"
      data-canvas-revision={revision}
      onKeyDown={cancelConnection}
      role="region"
    >
      {armed !== null && <p className="sr-only" role="status">Choose a target side for {labels.get(armed.nodeId) ?? armed.nodeId}.</p>}
      {error !== null && <p className="m-3 text-sm text-red-600" role="note">{error}</p>}
      <div
        aria-label="Canvas Board Surface"
        className="relative"
        style={{ height: bounds.height, width: bounds.width }}
      >
        {document.nodes.map(node => {
          const label = labels.get(node.id) ?? node.id
          const connectable = isConnectableCanvasNode(node)
          const safeLink = node.type === 'link' ? tryNormalizeCanvasLinkUrl(node.url) : undefined
          const style: CSSProperties = {
            height: node.height,
            left: node.x - bounds.minX + BOARD_PADDING,
            top: node.y - bounds.minY + BOARD_PADDING,
            width: node.width,
          }
          return (
            <article
              aria-label={`${node.type === 'group' ? 'Canvas Group' : 'Canvas Card'} ${label}`}
              className="absolute rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-2 shadow-sm"
              key={node.id}
              style={style}
            >
              <button
                aria-label={`${node.type === 'group' ? 'Canvas Group' : 'Canvas Card'} ${label}`}
                aria-pressed={selectedNodeId === node.id}
                className="h-full w-full border-0 bg-transparent p-1 text-left text-inherit outline-offset-2"
                data-canvas-x={String(node.x)}
                disabled={disabled || !connectable}
                onClick={() => {
                  setSelectedNodeId(node.id)
                  setSelectedEdgeId(null)
                }}
                onKeyDown={event => { moveNode(node.id, event) }}
                type="button"
              >
                <strong className="block truncate">{label}</strong>
                {node.type === 'text' && typeof node.text === 'string' && <span className="block line-clamp-3 whitespace-pre-wrap text-xs">{node.text}</span>}
                {node.type === 'link' && safeLink === undefined && <span className="block text-xs" role="note">This unsafe link is inert.</span>}
                {!connectable && <span className="block text-xs" role="note">This unsupported card is inert.</span>}
              </button>
              {connectable && (
                <fieldset className="contents" disabled={disabled}>
                  <legend className="sr-only">Connect {label}</legend>
                  {SIDES.map(side => (
                    <button
                      aria-label={`${titleCaseSide(side)} Connection Handle for ${label}`}
                      aria-pressed={armed?.nodeId === node.id && armed.side === side}
                      className="absolute z-10 m-0 size-5 rounded-full border border-[var(--tt-border)] bg-[var(--tt-panel)] text-[10px]"
                      key={side}
                      onClick={() => { activateHandle(node.id, side) }}
                      style={sideHandleStyle(side)}
                      type="button"
                    >
                      <span aria-hidden="true">{side.slice(0, 1).toUpperCase()}</span>
                    </button>
                  ))}
                </fieldset>
              )}
            </article>
          )
        })}
      </div>
      {(document.edges?.length ?? 0) > 0 && (
        <ul aria-label="Canvas Connections" className="absolute top-2 right-2 z-20 m-0 max-w-72 list-none rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-1 text-xs shadow-sm">
          {document.edges?.map(edge => (
            <li key={edge.id}>
              <button
                aria-pressed={selectedEdgeId === edge.id}
                className="block w-full rounded-sm border-0 bg-transparent px-2 py-1 text-left text-inherit outline-offset-2"
                onClick={() => {
                  setSelectedEdgeId(edge.id)
                  setSelectedNodeId(null)
                }}
                onKeyDown={event => {
                  if (event.key !== 'Delete' && event.key !== 'Backspace') return
                  event.preventDefault()
                  emit('delete-edge', content => deleteCanvasEdge(content, edge.id))
                  setSelectedEdgeId(null)
                }}
                type="button"
              >
                Canvas Edge {typeof edge.label === 'string' ? edge.label : 'Unlabeled'} from {labels.get(edge.fromNode) ?? edge.fromNode} to {labels.get(edge.toNode) ?? edge.toNode}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
