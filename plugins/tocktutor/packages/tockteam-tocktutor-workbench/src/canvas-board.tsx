import { Button } from '@tockteam/ui/button'
import { Input } from '@tockteam/ui/input'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Textarea } from '@tockteam/ui/textarea'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createCanvasChange, type CanvasChange } from './canvas-change.ts'
import {
  createCanvasEdge,
  deleteCanvasEdge,
  isConnectableCanvasNode,
  reconnectCanvasEdge,
  updateCanvasEdgeColor,
  updateCanvasEdgeLabel,
} from './canvas-edges.ts'
import { calculateCanvasPointerValue, CANVAS_GRID_SIZE, type CanvasSide } from './canvas-geometry.ts'
import { tryNormalizeCanvasLinkUrl } from './canvas-links.ts'
import {
  createCanvasFileNode,
  createCanvasGroupNode,
  createCanvasLinkNode,
  createCanvasTextNode,
  deleteCanvasGroup,
  deleteCanvasNode,
  duplicateCanvasGroup,
  duplicateCanvasNodes,
  updateCanvasGroupLabel,
  updateCanvasLinkNode,
  updateCanvasNodeGeometry,
  updateCanvasTextNode,
} from './canvas-nodes.ts'
import { parseCanvasDocument, type CanvasDocument } from './canvas.ts'

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
type NodeKind = 'file' | 'group' | 'link' | 'text'
type NodeEditor = { mode: 'create'; kind: NodeKind } | { mode: 'edit'; nodeId: string }
type EdgeEditor = { edgeId: string }

const controlClass = 'rounded border border-[var(--tt-border)] bg-[var(--tt-panel)] px-2 py-1 text-xs text-inherit'

function CanvasNodeEditor(props: {
  document: CanvasDocument
  editor: NodeEditor
  onCancel(): void
  onSubmit(event: FormEvent<HTMLFormElement>): void
}): ReactNode {
  const editedNodeId = props.editor.mode === 'edit' ? props.editor.nodeId : null
  const node = editedNodeId === null
    ? undefined
    : props.document.nodes.find(candidate => candidate.id === editedNodeId)
  const kind = props.editor.mode === 'create' ? props.editor.kind : node?.type as NodeKind | undefined
  if (kind === undefined) return null
  const editing = props.editor.mode === 'edit'
  const value = kind === 'text' ? node?.text : kind === 'link' ? node?.url : kind === 'file' ? node?.file : node?.label
  const label = editing ? kind === 'group' ? 'Group' : 'Card' : kind === 'group' ? 'Group' : 'Card'
  return (
    <form aria-label={`${label} Editor`} className="absolute top-12 left-2 z-40 grid min-w-64 gap-2 rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-3 shadow-lg" onSubmit={props.onSubmit}>
      <strong>{editing ? `Edit ${label}` : `Add ${kind === 'group' ? 'Group' : `${kind[0]!.toUpperCase()}${kind.slice(1)} Card`}`}</strong>
      {kind === 'text' && <label className="grid gap-1 text-xs">Card Text<Textarea unstyled aria-label="Card Text" className={controlClass} defaultValue={String(value ?? '')} maxLength={100_000} name="value" required /></label>}
      {kind === 'link' && <label className="grid gap-1 text-xs">Card URL<Input unstyled aria-label="Card URL" className={controlClass} defaultValue={String(value ?? '')} maxLength={2_000} name="value" required type="url" /></label>}
      {kind === 'file' && <label className="grid gap-1 text-xs">Card File<Input unstyled aria-label="Card File" className={controlClass} defaultValue={String(value ?? '')} maxLength={1_000} name="value" readOnly={editing} required /></label>}
      {kind === 'group' && <label className="grid gap-1 text-xs">Group Label<Input unstyled aria-label="Group Label" className={controlClass} defaultValue={String(value ?? 'Group')} maxLength={200} name="value" required /></label>}
      {editing && node !== undefined && (
        <fieldset className="grid grid-cols-2 gap-2 border-0 p-0">
          <legend className="sr-only">Card Geometry</legend>
          {(['x', 'y', 'width', 'height'] as const).map(key => <label className="grid gap-1 text-xs" key={key}>{`Card ${key[0]!.toUpperCase()}${key.slice(1)}`}<Input unstyled aria-label={`Card ${key[0]!.toUpperCase()}${key.slice(1)}`} className={controlClass} defaultValue={String(node[key])} name={key} required type="number" /></label>)}
        </fieldset>
      )}
      <div className="flex justify-end gap-2"><Button unstyled className={controlClass} onClick={props.onCancel} type="button">Cancel</Button><Button unstyled className={controlClass} type="submit">{editing ? `Save ${label}` : `Create ${label}`}</Button></div>
    </form>
  )
}

function CanvasEdgeEditor(props: {
  document: CanvasDocument
  edgeId: string
  onCancel(): void
  onSubmit(event: FormEvent<HTMLFormElement>): void
}): ReactNode {
  const edge = props.document.edges?.find(candidate => candidate.id === props.edgeId)
  if (edge === undefined) return null
  return (
    <form aria-label="Connection Editor" className="absolute top-12 right-2 z-40 grid min-w-72 gap-2 rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-3 shadow-lg" onSubmit={props.onSubmit}>
      <strong>Edit Connection</strong>
      <label className="grid gap-1 text-xs">Label<Input unstyled aria-label="Connection Label" className={controlClass} defaultValue={typeof edge.label === 'string' ? edge.label : ''} maxLength={200} name="label" /></label>
      <label className="grid gap-1 text-xs">Color<NativeSelect unstyled aria-label="Connection Color" className={controlClass} defaultValue={typeof edge.color === 'string' ? edge.color : ''} name="color"><NativeSelectOption value="">Default</NativeSelectOption>{[1, 2, 3, 4, 5, 6].map(value => <NativeSelectOption key={value} value={String(value)}>{String(value)}</NativeSelectOption>)}</NativeSelect></label>
      {(['from', 'to'] as const).map(endpoint => {
        const nodeId = endpoint === 'from' ? edge.fromNode : edge.toNode
        const side = endpoint === 'from' ? edge.fromSide : edge.toSide
        return (
          <fieldset className="grid grid-cols-2 gap-2 border-0 p-0" key={endpoint}>
            <legend className="sr-only">{endpoint === 'from' ? 'Connection Source' : 'Connection Target'}</legend>
            <label className="grid gap-1 text-xs">{endpoint === 'from' ? 'Source Card' : 'Target Card'}<NativeSelect unstyled aria-label={`Connection ${endpoint === 'from' ? 'Source' : 'Target'} Card`} className={controlClass} defaultValue={nodeId} name={`${endpoint}Node`}>{props.document.nodes.filter(isConnectableCanvasNode).map(node => <NativeSelectOption key={node.id} value={node.id}>{nodeLabel(node)}</NativeSelectOption>)}</NativeSelect></label>
            <label className="grid gap-1 text-xs">{endpoint === 'from' ? 'Source Side' : 'Target Side'}<NativeSelect unstyled aria-label={`Connection ${endpoint === 'from' ? 'Source' : 'Target'} Side`} className={controlClass} defaultValue={typeof side === 'string' ? side : endpoint === 'from' ? 'right' : 'left'} name={`${endpoint}Side`}>{SIDES.map(value => <NativeSelectOption key={value} value={value}>{titleCaseSide(value)}</NativeSelectOption>)}</NativeSelect></label>
          </fieldset>
        )
      })}
      <div className="flex justify-end gap-2"><Button unstyled className={controlClass} onClick={props.onCancel} type="button">Cancel</Button><Button unstyled className={controlClass} type="submit">Save Connection</Button></div>
    </form>
  )
}

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
  const [nodeEditor, setNodeEditor] = useState<NodeEditor | null>(null)
  const [edgeEditor, setEdgeEditor] = useState<EdgeEditor | null>(null)
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const pointerCleanup = useRef<(() => void) | null>(null)

  const document = parsed.status === 'ready' ? parsed.document : null
  const labels = useMemo(() => new Map(
    (document?.nodes ?? []).map(node => [node.id, nodeLabel(node)]),
  ), [document])
  const selectedNode = document?.nodes.find(node => node.id === selectedNodeId)
  const selectedEdge = document?.edges?.find(edge => edge.id === selectedEdgeId)

  useEffect(() => () => { pointerCleanup.current?.() }, [])

  useEffect(() => {
    if (document === null) {
      setArmed(null)
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setNodeEditor(null)
      setEdgeEditor(null)
      return
    }
    if (armed !== null && !document.nodes.some(node => node.id === armed.nodeId)) setArmed(null)
    if (selectedNodeId !== null && !document.nodes.some(node => node.id === selectedNodeId)) setSelectedNodeId(null)
    if (selectedEdgeId !== null && !document.edges?.some(edge => edge.id === selectedEdgeId)) setSelectedEdgeId(null)
    if (nodeEditor?.mode === 'edit' && !document.nodes.some(node => node.id === nodeEditor.nodeId)) setNodeEditor(null)
    if (edgeEditor !== null && !document.edges?.some(edge => edge.id === edgeEditor.edgeId)) setEdgeEditor(null)
  }, [armed, document, edgeEditor, nodeEditor, selectedEdgeId, selectedNodeId])

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

  const emit = (operation: CanvasChange['operation'], mutate: (content: string) => string): boolean => {
    if (disabled) return false
    try {
      setError(null)
      onChange(createCanvasChange(source, revision, operation, mutate))
      return true
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'The Canvas change could not be prepared.')
      return false
    }
  }

  const submitNodeEditor = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (nodeEditor === null || document === null) return
    const form = new FormData(event.currentTarget)
    const value = String(form.get('value') ?? '')
    const prepared = nodeEditor.mode === 'create'
      ? emit('create-node', content => {
          if (nodeEditor.kind === 'text') {
            const created = createCanvasTextNode(content)
            return updateCanvasTextNode(created.content, created.nodeId, value)
          }
          if (nodeEditor.kind === 'link') return createCanvasLinkNode(content, value).content
          if (nodeEditor.kind === 'file') return createCanvasFileNode(content, value).content
          const created = createCanvasGroupNode(content)
          return updateCanvasGroupLabel(created.content, created.nodeId, value)
        })
      : emit('update-node', content => {
          const node = document.nodes.find(candidate => candidate.id === nodeEditor.nodeId)
          if (node === undefined) throw new Error('The selected Canvas card no longer exists.')
          let next = updateCanvasNodeGeometry(content, node.id, {
            x: Number(form.get('x')),
            y: Number(form.get('y')),
            width: Number(form.get('width')),
            height: Number(form.get('height')),
          })
          if (node.type === 'text') next = updateCanvasTextNode(next, node.id, value)
          else if (node.type === 'link') next = updateCanvasLinkNode(next, node.id, value)
          else if (node.type === 'group') next = updateCanvasGroupLabel(next, node.id, value)
          return next
        })
    if (prepared) setNodeEditor(null)
  }

  const submitEdgeEditor = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (edgeEditor === null) return
    const form = new FormData(event.currentTarget)
    const prepared = emit('reconnect-edge', content => {
      let next = reconnectCanvasEdge(content, {
        edgeId: edgeEditor.edgeId,
        endpoint: 'from',
        nodeId: String(form.get('fromNode') ?? ''),
        side: String(form.get('fromSide') ?? '') as CanvasSide,
      })
      next = reconnectCanvasEdge(next, {
        edgeId: edgeEditor.edgeId,
        endpoint: 'to',
        nodeId: String(form.get('toNode') ?? ''),
        side: String(form.get('toSide') ?? '') as CanvasSide,
      })
      next = updateCanvasEdgeLabel(next, edgeEditor.edgeId, String(form.get('label') ?? ''))
      return updateCanvasEdgeColor(next, edgeEditor.edgeId, String(form.get('color') ?? ''))
    })
    if (prepared) setEdgeEditor(null)
  }

  const duplicateSelectedNode = (): void => {
    if (document === null || selectedNodeId === null) return
    const node = document.nodes.find(candidate => candidate.id === selectedNodeId)
    if (node === undefined) return
    const geometry = { x: node.x + CANVAS_GRID_SIZE, y: node.y + CANVAS_GRID_SIZE, width: node.width, height: node.height }
    const prepared = emit('duplicate-node', content => node.type === 'group'
      ? duplicateCanvasGroup(content, node.id, geometry).content
      : duplicateCanvasNodes(content, [{ nodeId: node.id, geometry }]).content)
    if (prepared) setSelectedNodeId(null)
  }

  const deleteSelectedNode = (): void => {
    if (document === null || selectedNodeId === null) return
    const node = document.nodes.find(candidate => candidate.id === selectedNodeId)
    if (node === undefined) return
    const prepared = emit('delete-node', content => node.type === 'group'
      ? deleteCanvasGroup(content, node.id)
      : deleteCanvasNode(content, node.id))
    if (prepared) setSelectedNodeId(null)
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

  const beginPointerGeometry = (
    node: CanvasDocument['nodes'][number],
    event: ReactPointerEvent<HTMLElement>,
    mode: 'move' | 'resize',
  ): void => {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    pointerCleanup.current?.()
    const startX = event.clientX
    const startY = event.clientY
    const snappingDisabled = event.altKey
    let deltaX = 0
    let deltaY = 0
    const move = (next: PointerEvent): void => {
      deltaX = calculateCanvasPointerValue(0, (next.clientX - startX) / zoom, snappingDisabled)
      deltaY = calculateCanvasPointerValue(0, (next.clientY - startY) / zoom, snappingDisabled)
    }
    const cleanup = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      if (pointerCleanup.current === cleanup) pointerCleanup.current = null
    }
    const finish = (): void => {
      cleanup()
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return
      emit(mode === 'move' ? 'move-node' : 'resize-node', content => updateCanvasNodeGeometry(content, node.id, mode === 'move'
        ? { x: node.x + deltaX, y: node.y + deltaY, width: node.width, height: node.height }
        : { x: node.x, y: node.y, width: node.width + deltaX, height: node.height + deltaY }))
    }
    const cancel = (): void => { cleanup() }
    pointerCleanup.current = cleanup
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
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
      {!disabled && (
        <div aria-label="Canvas Actions" className="sticky top-2 left-2 z-30 m-2 flex w-fit max-w-[calc(100%-16px)] flex-wrap gap-1 rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-1 shadow-sm" role="toolbar">
          <Button unstyled className={controlClass} onClick={() => { setNodeEditor({ kind: 'text', mode: 'create' }) }} type="button">Add Text Card</Button>
          <Button unstyled className={controlClass} onClick={() => { setNodeEditor({ kind: 'link', mode: 'create' }) }} type="button">Add Link Card</Button>
          <Button unstyled className={controlClass} onClick={() => { setNodeEditor({ kind: 'file', mode: 'create' }) }} type="button">Add File Card</Button>
          <Button unstyled className={controlClass} onClick={() => { setNodeEditor({ kind: 'group', mode: 'create' }) }} type="button">Add Group</Button>
          <Button unstyled aria-label="Zoom Canvas Out" className={controlClass} disabled={zoom <= 0.5} onClick={() => { setZoom(value => Math.max(0.5, value - 0.25)) }} type="button">−</Button>
          <Button unstyled aria-label="Reset Canvas Zoom" className={controlClass} onClick={() => { setZoom(1) }} type="button">{String(Math.round(zoom * 100))}%</Button>
          <Button unstyled aria-label="Zoom Canvas In" className={controlClass} disabled={zoom >= 2} onClick={() => { setZoom(value => Math.min(2, value + 0.25)) }} type="button">+</Button>
          {selectedNode !== undefined && (
            <>
              <Button unstyled className={controlClass} onClick={() => { setNodeEditor({ mode: 'edit', nodeId: selectedNode.id }) }} type="button">Edit {selectedNode.type === 'group' ? 'Group' : 'Card'}</Button>
              <Button unstyled className={controlClass} onClick={duplicateSelectedNode} type="button">Duplicate {selectedNode.type === 'group' ? 'Group' : 'Card'}</Button>
              <Button unstyled className={controlClass} onClick={deleteSelectedNode} type="button">Delete {selectedNode.type === 'group' ? 'Group' : 'Card'}</Button>
            </>
          )}
          {selectedEdge !== undefined && (
            <>
              <Button unstyled className={controlClass} onClick={() => { setEdgeEditor({ edgeId: selectedEdge.id }) }} type="button">Edit Connection</Button>
              <Button unstyled className={controlClass} onClick={() => { if (emit('delete-edge', content => deleteCanvasEdge(content, selectedEdge.id))) setSelectedEdgeId(null) }} type="button">Delete Connection</Button>
            </>
          )}
        </div>
      )}
      {nodeEditor !== null && <CanvasNodeEditor document={document} editor={nodeEditor} onCancel={() => { setNodeEditor(null) }} onSubmit={submitNodeEditor} />}
      {edgeEditor !== null && <CanvasEdgeEditor document={document} edgeId={edgeEditor.edgeId} onCancel={() => { setEdgeEditor(null) }} onSubmit={submitEdgeEditor} />}
      <div
        aria-label="Canvas Board Surface"
        className="relative"
        style={{ height: bounds.height, width: bounds.width, zoom }}
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
              <Button unstyled
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
                onPointerDown={event => { beginPointerGeometry(node, event, 'move') }}
                type="button"
              >
                <strong className="block truncate">{label}</strong>
                {node.type === 'text' && typeof node.text === 'string' && <span className="block line-clamp-3 whitespace-pre-wrap text-xs">{node.text}</span>}
                {node.type === 'link' && safeLink === undefined && <span className="block text-xs" role="note">This unsafe link is inert.</span>}
                {!connectable && <span className="block text-xs" role="note">This unsupported card is inert.</span>}
              </Button>
              {connectable && !disabled && <Button unstyled aria-label={`Resize ${node.type === 'group' ? 'Group' : 'Card'} ${label}`} className="absolute right-0 bottom-0 z-10 size-5 translate-1/2 cursor-nwse-resize rounded border border-[var(--tt-border)] bg-[var(--tt-panel)] p-0" onPointerDown={event => { beginPointerGeometry(node, event, 'resize') }} type="button" />}
              {connectable && (
                <fieldset className="contents" disabled={disabled}>
                  <legend className="sr-only">Connect {label}</legend>
                  {SIDES.map(side => (
                    <Button unstyled
                      aria-label={`${titleCaseSide(side)} Connection Handle for ${label}`}
                      aria-pressed={armed?.nodeId === node.id && armed.side === side}
                      className="absolute z-10 m-0 size-5 rounded-full border border-[var(--tt-border)] bg-[var(--tt-panel)] text-[10px]"
                      key={side}
                      onClick={() => { activateHandle(node.id, side) }}
                      style={sideHandleStyle(side)}
                      type="button"
                    >
                      <span aria-hidden="true">{side.slice(0, 1).toUpperCase()}</span>
                    </Button>
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
              <Button unstyled
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
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
