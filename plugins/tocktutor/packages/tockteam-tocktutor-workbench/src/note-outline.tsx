import { Button } from '@tockteam/ui/button'
import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { renderMarkdownHtml } from './rich-markdown.ts'
import { projectLivePreview } from './live-preview.ts'
import type { TockTutorRouteViewProps } from './route.tsx'
import type { VaultHeading } from './types.ts'

interface OutlineNode { heading: VaultHeading; index: number; children: OutlineNode[] }

function outlineTree(headings: VaultHeading[]): OutlineNode[] {
  const roots: OutlineNode[] = []
  const parents: OutlineNode[] = []
  for (const [index, heading] of headings.entries()) {
    const node: OutlineNode = { heading, index, children: [] }
    while (parents.length > 0 && parents.at(-1)!.heading.level >= heading.level) parents.pop()
    ;(parents.at(-1)?.children ?? roots).push(node)
    parents.push(node)
  }
  return roots
}

/** Match rendered labels, including formatting and duplicate headings, within the current editor only. */
export function scrollOutlineHeading(root: HTMLElement | null, headings: VaultHeading[], index: number): boolean {
  const heading = headings[index]
  if (root === null || heading === undefined) return false
  const label = (text: string): string => {
    const container = document.createElement('div')
    container.innerHTML = renderMarkdownHtml(`# ${text}`)
    return (container.textContent ?? '').trim()
  }
  const wanted = label(heading.text)
  const occurrence = headings.slice(0, index).filter(previous => previous.level === heading.level && label(previous.text) === wanted).length
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(`h${String(heading.level)}`))
    .filter(element => element.closest('[data-embed-kind], [data-embed-depth]') === null && element.textContent?.trim() === wanted)
  const target = candidates[occurrence]
  if (target === undefined) return false
  target.scrollIntoView({ block: 'start' })
  return true
}

const controlClass = 'flex size-7 shrink-0 items-center justify-center rounded border-0 bg-transparent text-[var(--tt-muted)] hover:bg-[var(--tt-selected)] focus-visible:outline focus-visible:outline-[var(--tt-accent)]'

export function NoteOutline({ headings, onNavigate }: {
  headings: VaultHeading[]
  onNavigate(index: number): boolean | Promise<boolean>
}): ReactNode {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<number | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const roots = outlineTree(headings)
  const branches = headings.flatMap((heading, index) => (headings[index + 1]?.level ?? 0) > heading.level ? [index] : [])
  const renderNodes = (nodes: OutlineNode[], nested = false): ReactNode => (
    <ul className={nested ? 'm-0 ml-3 list-none border-l border-[var(--tt-border)] py-0 pl-2 pr-0' : 'm-0 list-none p-0'}>
      {nodes.map(({ heading, index, children }) => {
        const folded = collapsed.has(index)
        return <li key={`${String(heading.line)}:${heading.selector}`}>
          <div className="flex min-w-0 items-center rounded hover:bg-[var(--tt-selected)]" data-outline-line={heading.line}>
            {children.length > 0 ? <Button unstyled aria-label={`${folded ? 'Expand' : 'Collapse'} ${heading.text}`} aria-expanded={!folded} className={controlClass} onClick={() => { setCollapsed(current => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next }) }} type="button"><ChevronRight aria-hidden="true" className={folded ? '' : 'rotate-90'} /></Button> : <span aria-hidden="true" className="w-7 shrink-0" />}
            <Button unstyled aria-current={selected === index ? 'location' : undefined} aria-label={`Go to ${heading.text}`} className="min-h-7 min-w-0 flex-1 truncate rounded border-0 bg-transparent py-1 pr-2 pl-0 text-left text-xs aria-[current=location]:bg-[var(--tt-selected)] aria-[current=location]:text-[var(--tt-accent)] focus-visible:outline focus-visible:outline-[var(--tt-accent)] disabled:opacity-50" onClick={() => { const finish = (success: boolean): void => { setUnavailable(!success); if (success) setSelected(index) }; const result = onNavigate(index); if (typeof result === 'boolean') finish(result); else void result.then(finish, () => { finish(false) }) }} title={`${heading.text} · Heading ${String(heading.level)}, line ${String(heading.line)}`} type="button">{heading.text}</Button>
          </div>
          {children.length > 0 && !folded && renderNodes(children, true)}
        </li>
      })}
    </ul>
  )
  return <div className="min-w-0">
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-xs text-[var(--tt-muted)]">{headings.length} headings</span>
      <div className="flex gap-1">
        <Button unstyled aria-label="Expand All Headings" className={controlClass} disabled={branches.length === 0} onClick={() => { setCollapsed(new Set()) }} title="Expand all headings" type="button"><ChevronsUpDown aria-hidden="true" /></Button>
        <Button unstyled aria-label="Collapse All Headings" className={controlClass} disabled={branches.length === 0} onClick={() => { setCollapsed(new Set(branches)) }} title="Collapse all headings" type="button"><ChevronsDownUp aria-hidden="true" /></Button>
      </div>
    </div>
    <nav aria-label="Note Headings">{renderNodes(roots)}</nav>
    {headings.length === 0 && <p className="px-2 py-4 text-xs text-[var(--tt-muted)]">No headings in this note.</p>}
    {unavailable && <p className="px-2 text-xs text-[var(--tt-muted)]" role="status">This heading is not displayed in the current view. Open Source Mode to jump to its line.</p>}
  </div>
}

export function NoteOutlinePanel({ snapshot, onJumpToLine, onNavigateHeading }: { onNavigateHeading?: (headings: VaultHeading[], index: number) => boolean | Promise<boolean>; snapshot: TockTutorRouteViewProps['snapshot']; onJumpToLine: TockTutorRouteViewProps['onJumpToLine'] }): ReactNode {
  const projection = useMemo(() => projectLivePreview(snapshot.source), [snapshot.source])
  const headings = useMemo(() => projection.status !== 'ready' ? [] : projection.lines.flatMap(line => {
    if (line.kind !== 'heading' || line.headingLevel === undefined) return []
    const text = line.content.replace(/^ {0,3}#{1,6}(?:\s+|$)/u, '').replace(/\s+#+\s*$/u, '').trim()
    return [{ level: line.headingLevel, line: line.index + 1, selector: String(line.index), text }]
  }), [projection])
  if (snapshot.documentKind !== 'markdown' || snapshot.path === null) return <p className="text-xs text-[var(--tt-muted)]">Open a Markdown note to see its outline.</p>
  if (projection.status !== 'ready') return <p className="text-xs text-[var(--tt-muted)]">This note is too large to show an outline.</p>
  return <NoteOutline headings={headings} key={JSON.stringify([snapshot.vault, snapshot.path, headings])} onNavigate={index => {
    const heading = headings[index]
    if (heading === undefined) return false
    if (onNavigateHeading) return onNavigateHeading(headings, index)
    if (snapshot.mode === 'source') { onJumpToLine?.(heading.line); return onJumpToLine !== undefined }
    const seat = Array.from(document.querySelectorAll<HTMLElement>('[data-pane-id]')).find(node => node.dataset.paneId === snapshot.focusedPaneId)
    return scrollOutlineHeading((seat ?? document).querySelector<HTMLElement>(snapshot.mode === 'reading' ? '[aria-label="Reading View"] .tocktutor-reading' : '.tocktutor-editor-body .ProseMirror'), headings, index)
  }} />
}
