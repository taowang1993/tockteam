import { Alert } from '@tockteam/ui/alert'
import { Button } from '@tockteam/ui/button'
import { useEffect, type ReactNode } from 'react'
import { MarkdownDocumentHeader } from './live-preview-editor.tsx'
import { NoteBacklinks, NoteOutgoingLinks } from './note-backlinks.tsx'
import { NoteOutlinePanel, scrollOutlineHeading } from './note-outline.tsx'
import { NoteGraphPanel } from './note-graph.tsx'
import type { WorkbenchRouteController } from './route.tsx'
import type { LinkedViewKind } from './session.ts'

export const LINKED_VIEW_TITLES: Record<LinkedViewKind, string> = { backlinks: 'Backlinks', 'outgoing-links': 'Outgoing Links', properties: 'Properties', outline: 'Outline', graph: 'Local Graph' }

export function LinkedNotePane({ controller, id }: { controller: WorkbenchRouteController; id: string }): ReactNode {
  const snapshot = controller.getPaneSnapshot(id)
  const pane = snapshot.panes.find(pane => pane.id === id)
  const linked = pane?.linkedView
  const lifetime = controller.paneLifetimeFor(id)
  useEffect(() => { void controller.loadLinkedView(id) }, [controller, id, lifetime, snapshot.revision])
  if (!linked) return null
  const current = (): boolean => controller.paneLifetimeFor(id) === lifetime
  const onSelect = (path: string): void => { if (current()) void controller.navigateLinkedView(id, path) }
  const retry = (): void => { if (current()) void controller.loadLinkedView(id) }
  const property = controller.bindLinkedProperty(id)
  const title = LINKED_VIEW_TITLES[linked.kind]
  const loading = snapshot.linkedLoading === true || (snapshot.revision === null && snapshot.linkedError == null)
  return <section onKeyDown={event => { event.stopPropagation() }} aria-label={`${title} Linked View`} data-pane-id={id} data-linked-kind={linked.kind} className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[var(--tt-bg)]">
    <header className="flex min-h-10 flex-wrap items-center gap-2 border-b border-[var(--tt-border)] bg-[var(--tt-panel)] px-3 py-1">
      <h2 className="m-0 truncate text-sm" title={linked.path ?? undefined}>{title}{linked.path ? ` · ${linked.path}` : ''}</h2>
      <span className="text-xs text-[var(--tt-muted)]">{linked.sourceGroupId ? 'Bound' : linked.pinned ? 'Pinned' : 'Following Active Note'}{linked.sourceGroupId && linked.pinned ? ' · Pinned' : ''}</span>
      <span className="flex-1" />
      {snapshot.saveStatus !== 'saved' && <Button size="sm" variant="ghost" disabled={snapshot.saveStatus === 'saving' || snapshot.documentUnavailable} onClick={() => { if (current()) void controller.saveLinkedView(id) }}>{snapshot.saveStatus === 'saving' ? 'Saving…' : 'Save'}</Button>}
      {linked.sourceGroupId && <Button size="sm" variant="ghost" onClick={() => { if (current()) controller.unlinkLinkedView(id) }}>Unlink</Button>}
      <Button size="sm" variant="ghost" disabled={!linked.path} aria-pressed={linked.pinned} onClick={() => { if (current()) controller.toggleLinkedPin(id) }}>{linked.pinned ? 'Unpin' : 'Pin'}</Button>
      <Button size="sm" variant="ghost" aria-label={`Close ${title} Linked View`} onClick={() => { if (current()) void controller.closePane(id) }}>Close</Button>
    </header>
    <div className={`min-h-0 min-w-0 overflow-auto ${linked.kind === 'graph' ? 'relative' : 'p-5'}`}>
      {snapshot.saveStatus === 'save-failed' && <Alert unstyled role="alert">{snapshot.message}</Alert>}
      {!linked.path ? <Alert unstyled role="status">No active editor note.</Alert>
        : loading ? <Alert unstyled role="status">Loading {title.toLocaleLowerCase()}…</Alert>
          : snapshot.linkedError || snapshot.documentUnavailable ? <Alert unstyled role="status">{snapshot.linkedError ?? 'This note is unavailable. Any local draft has been retained.'} <Button variant="ghost" onClick={retry}>Retry</Button></Alert>
            : snapshot.documentKind !== 'markdown' ? <Alert unstyled role="status">Open a Markdown note to use this linked view.</Alert>
              : <>
                {(linked.kind === 'backlinks' || linked.kind === 'outgoing-links' || linked.kind === 'graph') && snapshot.saveStatus !== 'saved' && <Alert unstyled role="status">Relationships reflect the saved note. Save to refresh.</Alert>}
                {linked.kind === 'backlinks' && <NoteBacklinks links={snapshot.links} loading={snapshot.linksLoading === true} onSelect={onSelect} onRetry={retry} />}
                {linked.kind === 'outgoing-links' && <NoteOutgoingLinks links={snapshot.links} loading={snapshot.linksLoading === true} onSelect={onSelect} onRetry={retry} />}
                {linked.kind === 'properties' && <MarkdownDocumentHeader editableProperties source={snapshot.source} onAddProperty={key => property(key, '')} onSetProperty={property} />}
                {linked.kind === 'outline' && <NoteOutlinePanel snapshot={snapshot} onJumpToLine={undefined} onNavigateHeading={async (headings, index) => {
                  if (!current() || !linked.path || !await controller.navigateLinkedView(id, linked.path)) return false
                  const editor = controller.getSnapshot()
                  if (!current() || editor.path !== linked.path || editor.source !== snapshot.source) return false
                  if (editor.mode === 'source') return controller.jumpToLine(headings[index]!.line)
                  const seat = Array.from(document.querySelectorAll<HTMLElement>('[data-pane-id]')).find(node => node.dataset.paneId === editor.focusedPaneId)
                  return scrollOutlineHeading(seat?.querySelector<HTMLElement>(editor.mode === 'reading' ? '.tocktutor-reading' : '.ProseMirror') ?? null, headings, index)
                }} />}
                {linked.kind === 'graph' && <>
                  <NoteGraphPanel snapshot={snapshot} localOnly onOpenGraphNode={onSelect} />
                  {(snapshot.graph?.complete === false || snapshot.graph?.truncated) && <Alert unstyled className="absolute bottom-0 right-0 max-w-64 bg-[var(--tt-panel)] p-2 text-xs" role="status">Graph results are incomplete because the vault scan reached its limit.</Alert>}
                </>}
              </>}
    </div>
  </section>
}
