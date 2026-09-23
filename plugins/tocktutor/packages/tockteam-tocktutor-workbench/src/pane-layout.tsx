import { Button } from '@tockteam/ui/button'
import { useRef, type ReactNode } from 'react'
import type { PaneLayout } from './session.ts'

/** Flat, keyed pane seats preserve editor DOM/history when a split reparents a leaf. */
export function PaneLayoutView(props: {
  layout: PaneLayout
  renderPane(id: string): ReactNode
  onResize(path: readonly number[], ratio: number): void
}): ReactNode {
  const root = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointer: number; start: number; size: number; ratio: number; path: number[] } | null>(null)
  const panes: ReactNode[] = []
  const handles: ReactNode[] = []
  const visit = (node: PaneLayout, path: number[], x: number, y: number, width: number, height: number): void => {
    if ('groupId' in node) {
      panes.push(<div className="absolute min-h-0 min-w-0 overflow-hidden" key={node.groupId} style={{ left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%` }}>{props.renderPane(node.groupId)}</div>)
      return
    }
    const horizontal = node.axis === 'horizontal'
    const ratio = node.ratio
    handles.push(<Button unstyled key={path.join('.') || 'root'} role="separator" type="button"
      aria-label={horizontal ? 'Resize Right Split' : 'Resize Down Split'} aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(ratio * 100)}
      className="absolute z-10 touch-none border-0 bg-[var(--tt-border)] p-0 focus-visible:bg-[var(--tt-accent)]"
      style={horizontal ? { left: `calc(${x + width * ratio}% - 2px)`, top: `${y}%`, width: 4, height: `${height}%`, cursor: 'col-resize' }
        : { left: `${x}%`, top: `calc(${y + height * ratio}% - 2px)`, width: `${width}%`, height: 4, cursor: 'row-resize' }}
      onKeyDown={event => {
        const negative = horizontal ? 'ArrowLeft' : 'ArrowUp'
        const positive = horizontal ? 'ArrowRight' : 'ArrowDown'
        if (![negative, positive, 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        props.onResize(path, event.key === 'Home' ? .15 : event.key === 'End' ? .85 : ratio + (event.key === negative ? -.05 : .05))
      }}
      onPointerDown={event => {
        const bounds = root.current?.getBoundingClientRect()
        if (!bounds || event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { pointer: event.pointerId, start: horizontal ? event.clientX : event.clientY, size: horizontal ? bounds.width * width / 100 : bounds.height * height / 100, ratio, path }
      }}
      onPointerMove={event => {
        const current = drag.current
        if (!current || current.pointer !== event.pointerId || current.size <= 0) return
        props.onResize(current.path, current.ratio + ((horizontal ? event.clientX : event.clientY) - current.start) / current.size)
      }}
      onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
      onLostPointerCapture={() => { drag.current = null }}
      onPointerCancel={() => { drag.current = null }}
    />)
    visit(node.children[0], [...path, 0], x, y, horizontal ? width * ratio : width, horizontal ? height : height * ratio)
    visit(node.children[1], [...path, 1], horizontal ? x + width * ratio : x, horizontal ? y : y + height * ratio, horizontal ? width * (1 - ratio) : width, horizontal ? height : height * (1 - ratio))
  }
  visit(props.layout, [], 0, 0, 100, 100)
  return <div aria-label="Note Panes" className="relative h-full min-h-0 min-w-0 overflow-hidden" ref={root}>{panes}{handles}</div>
}
