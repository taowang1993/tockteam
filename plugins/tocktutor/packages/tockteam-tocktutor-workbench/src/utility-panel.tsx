import { Alert } from '@tockteam/ui/alert'
import { Button } from '@tockteam/ui/button'
import { Checkbox } from '@tockteam/ui/checkbox'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@tockteam/ui/tooltip'
import { useRef, useState, type ReactNode } from 'react'
import { ExecutableBaseView } from './base-executable-view.tsx'
import { CanvasBoard } from './canvas-board.tsx'
import { BUILTIN_TEMPLATES } from './capture.ts'
import { renderMarkdownHtml } from './rich-markdown.ts'
import type { TockTutorRouteViewProps } from './route.tsx'
import { MAX_PANE_GROUPS } from './session.ts'
import { WorkbenchGlyph } from './workbench-glyph.tsx'

export type WorkbenchUtilityView = 'attachments' | 'backlinks' | 'bookmarks' | 'extensions' | 'graph' | 'properties' | 'recovery' | 'tags' | 'tools' | 'web' | 'workspace'

const UTILITY_TITLES: Record<WorkbenchUtilityView, string> = {
  attachments: 'Attachments and Embeds',
  extensions: 'Reviews and Actions',
  graph: 'Graph View',
  backlinks: 'Backlinks',
  bookmarks: 'Bookmarks',
  properties: 'Properties',
  tags: 'Tags',
  recovery: 'File Recovery',
  tools: 'Note Tools',
  web: 'Web Viewer',
  workspace: 'Workspaces and Panes',
}

export type WorkbenchUtilitiesProps = TockTutorRouteViewProps & {
  onClose(): void
  view: WorkbenchUtilityView | null
}

function graphFolder(path: string): string {
  return path.includes('/') ? path.split('/', 1)[0]! : 'Vault Root'
}

function snapshotDateLabel(createdAt: number): string {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString(undefined, { day: 'numeric', hour: 'numeric', minute: '2-digit', month: 'short' })
}

function snapshotRevisionLabel(digest: string): string {
  return digest.startsWith('sha256:') ? digest.slice(7, 15) : digest.slice(0, 8)
}

function graphFolderColor(folder: string): string {
  let hash = 0
  for (const character of folder) hash = (Math.imul(hash, 31) + character.codePointAt(0)!) >>> 0
  return `hsl(${String(hash % 360)} 62% 48%)`
}

function graphCoordinate(value: number, minimum: number, maximum: number): number {
  if (minimum === maximum) return 50
  return 12 + ((value - minimum) / (maximum - minimum)) * 76
}

export function WorkbenchUtilities(props: WorkbenchUtilitiesProps): ReactNode {
  const { snapshot } = props
  const [graphZoom, setGraphZoom] = useState(1)
  const open = props.view !== null
  const [graphPan, setGraphPan] = useState({ x: 0, y: 0 })
  const [rovingSnapshotId, setRovingSnapshotId] = useState<string | null>(null)
  const recoverySnapshots = (snapshot.snapshots ?? []).filter(entry => snapshot.path !== null && entry.path === snapshot.path)
  const selectedSnapshot = snapshot.path !== null
    && snapshot.selectedSnapshot?.snapshot.path === snapshot.path
    ? snapshot.selectedSnapshot
    : null
  const rovingId = recoverySnapshots.some(entry => entry.id === rovingSnapshotId)
    ? rovingSnapshotId
    : selectedSnapshot?.snapshot.id ?? recoverySnapshots[0]?.id ?? null
  const graphQuery = (snapshot.settings?.graphQuery ?? '').trim().toLocaleLowerCase()
  const graphNodes = (snapshot.graphLayout ?? []).filter(node => graphQuery === '' || node.path.toLocaleLowerCase().includes(graphQuery))
  const graphPaths = new Set(graphNodes.map(node => node.path))
  const graphBounds = {
    maxX: Math.max(...graphNodes.map(node => node.x)),
    maxY: Math.max(...graphNodes.map(node => node.y)),
    minX: Math.min(...graphNodes.map(node => node.x)),
    minY: Math.min(...graphNodes.map(node => node.y)),
  }
  const graphPoints = new Map(graphNodes.map(node => [node.path, {
    x: graphCoordinate(node.x, graphBounds.minX, graphBounds.maxX),
    y: graphCoordinate(node.y, graphBounds.minY, graphBounds.maxY),
  }]))
  const graphEdges = (snapshot.graph?.edges ?? []).filter(edge => graphPaths.has(edge.sourcePath) && graphPaths.has(edge.targetPath))
  const graphGroups = Object.entries(Object.groupBy(graphNodes, node => snapshot.settings?.graphGroupBy === 'folder' ? graphFolder(node.path) : 'All Notes'))
    .toSorted(([left], [right]) => left.localeCompare(right))
  const vaultProperties = snapshot.facets?.properties ?? []
  const vaultTags = snapshot.facets?.tags ?? []
  const linkedMentions = snapshot.links?.backlinkDetails ?? []
  const unlinkedMentions = snapshot.links?.unlinkedMentions ?? []
  const snapshotOptionRefs = useRef(new Map<string, HTMLButtonElement>())
  const selectSnapshot = (id: string): void => {
    setRovingSnapshotId(id)
    props.onReadSnapshot?.(id)
    snapshotOptionRefs.current.get(id)?.focus()
  }
  return (
        <aside
          aria-hidden={!open}
          aria-label="Workbench Utilities"
          className={`tocktutor-right-panel invisible grid min-h-0 min-w-0 w-0 translate-x-6 auto-rows-max grid-rows-[40px] overflow-x-hidden overflow-y-auto border-l border-[var(--tt-border)] bg-[var(--tt-panel)] data-[open=false]:border-l-0 opacity-0 shadow-none transition-[width,opacity,transform,visibility] [transition-duration:420ms,300ms,460ms,0s] [transition-timing-function:cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),linear] [transition-delay:0s,0s,0s,420ms] pointer-events-none data-[open=true]:visible data-[open=true]:w-[min(300px,calc(100vw-262px))] data-[view=recovery]:w-[min(560px,calc(100vw-262px))] data-[open=true]:translate-x-0 data-[open=true]:opacity-100 data-[open=true]:[transition-delay:0s] data-[open=true]:pointer-events-auto [&>:not(.tocktutor-assistant-resize)]:min-w-[min(300px,calc(100vw-262px))] ${props.view === 'graph' ? 'z-20 !absolute !inset-y-0 !right-0 !left-[var(--tocktutor-sidebar-width)] !h-auto !w-auto !translate-x-0 !visible !overflow-hidden !border-l-0 !opacity-100 !pointer-events-auto [&>:not(.tocktutor-assistant-resize)]:min-w-0' : ''}`}
          data-open={open}
          data-view={props.view ?? undefined}
          {...(open ? {} : { inert: '' })}
        >
          <header className="flex items-center justify-between border-b border-[var(--tt-border)] px-3">
            <h2 className="m-0 text-sm">{props.view === null ? 'Note Tools' : UTILITY_TITLES[props.view]}</h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button unstyled aria-label="Close Utility Panel" className="border-0 bg-transparent p-[5px]" onClick={props.onClose} type="button"><WorkbenchGlyph kind="close" /></Button>
              </TooltipTrigger>
              <TooltipContent>Close Utility Panel</TooltipContent>
            </Tooltip>
          </header>
          <section aria-label="File Recovery" className="p-3" hidden={props.view !== 'recovery'}>
            <div className="flex items-center justify-end gap-2">
              <span className="flex gap-1">
                <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" disabled={snapshot.path === null} onClick={props.onCaptureSnapshot} type="button">Capture</Button>
                <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" disabled={recoverySnapshots.length === 0} onClick={props.onClearSnapshots} type="button">Clear</Button>
                <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={props.onOpenRecovery} type="button">Refresh</Button>
              </span>
            </div>
            {snapshot.draftRecovered === true && <Alert unstyled className="mt-2" role="status">A local draft was recovered for this note.</Alert>}
            <div className="mt-2 flex gap-2">
              <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" disabled={snapshot.path === null} onClick={props.onTrashCurrent} type="button">Move Current File to Trash</Button>
            </div>
            <div className="mt-3 grid min-w-0 gap-3 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] max-[640px]:grid-cols-1">
              <section aria-label="Snapshot Selector" className="min-w-0">
                <h3 className="mb-1 text-xs">Snapshots</h3>
                {recoverySnapshots.length > 0 ? (
                  <div aria-label="Recovery Snapshots" className="grid min-w-0 gap-1 overflow-auto" role="listbox">
                    {recoverySnapshots.map((snapshotEntry, index) => {
                      const selected = selectedSnapshot?.snapshot.id === snapshotEntry.id
                      return (
                        <div className="grid min-w-0 gap-1 rounded-md" key={snapshotEntry.id}>
                          <Button
                            unstyled
                            aria-selected={selected}
                            className="grid min-w-0 gap-0.5 rounded-md border border-[var(--tt-border)] bg-transparent px-2 py-1.5 text-left text-xs outline-none hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)] aria-selected:border-[var(--tt-accent)] aria-selected:bg-[var(--tt-selected)]"
                            onClick={() => { selectSnapshot(snapshotEntry.id) }}
                            onKeyDown={event => {
                              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
                              event.preventDefault()
                              const offset = event.key === 'ArrowDown' ? 1 : -1
                              const next = (index + offset + recoverySnapshots.length) % recoverySnapshots.length
                              const nextSnapshot = recoverySnapshots[next]
                              if (nextSnapshot !== undefined) selectSnapshot(nextSnapshot.id)
                            }}
                            ref={element => {
                              if (element === null) snapshotOptionRefs.current.delete(snapshotEntry.id)
                              else snapshotOptionRefs.current.set(snapshotEntry.id, element)
                            }}
                            role="option"
                            tabIndex={snapshotEntry.id === rovingId ? 0 : -1}
                            type="button"
                          >
                            <span className="truncate font-medium">Snapshot {String(index + 1)} · {snapshotEntry.reason}</span>
                            <span className="truncate text-[10px] text-[var(--tt-muted)]">{snapshotDateLabel(snapshotEntry.createdAt)} · rev {snapshotRevisionLabel(snapshotEntry.digest)}</span>
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                ) : <span className="text-xs text-[var(--tt-muted)]">No snapshots for the active file.</span>}
              </section>
              <section aria-label="Selected Snapshot Content" className="grid min-w-0 content-start gap-2">
                <h3 className="mb-0 text-xs">Snapshot Preview</h3>
                {selectedSnapshot !== null ? (
                  <>
                    <div className="truncate text-[10px] text-[var(--tt-muted)]">{snapshotDateLabel(selectedSnapshot.snapshot.createdAt)} · rev {snapshotRevisionLabel(selectedSnapshot.snapshot.digest)}</div>
                    <pre aria-label="Snapshot Preview" className="m-0 max-h-48 min-h-24 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--tt-border)] bg-[color-mix(in_srgb,var(--tt-text)_3%,transparent)] p-2 text-[11px] leading-4">{selectedSnapshot.content}</pre>
                    <div className="flex min-w-0 flex-wrap gap-1">
                      <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-[11px] text-inherit" onClick={() => { props.onRestoreSnapshotOverwrite?.(selectedSnapshot.snapshot.id) }} type="button">Restore Original</Button>
                      <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-[11px] text-inherit" onClick={() => { props.onRestoreSnapshot?.(selectedSnapshot.snapshot.id) }} type="button">Restore as New</Button>
                    </div>
                  </>
                ) : <span className="text-xs text-[var(--tt-muted)]">Select a snapshot to inspect its content.</span>}
              </section>
            </div>
            <h3 className="mt-3 mb-1 text-xs">Trash</h3>
            <div className="grid gap-1">
              {(snapshot.trash ?? []).map((entry, index) => (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1" key={entry.id}>
                  <span className="truncate text-xs">{entry.originalPath}</span>
                  <Button unstyled aria-label={`Restore Trash Entry ${String(index + 1)}`} className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { props.onRestoreTrash?.(entry.id) }} type="button">Restore</Button>
                </div>
              ))}
              {(snapshot.trash?.length ?? 0) === 0 && <span className="text-xs text-[var(--tt-muted)]">Trash is empty.</span>}
            </div>
          </section>
          <section aria-label="Web Viewer" className="min-h-80 p-3" hidden={props.view !== 'web'}>
            <div className="flex min-h-72 flex-col">{props.webViewerPanel ?? <Alert unstyled role="status">Web Viewer is unavailable.</Alert>}</div>
          </section>
          <section aria-label="Graph View" className="absolute inset-x-0 top-10 bottom-0 min-h-0 min-w-0 overflow-hidden" hidden={props.view !== 'graph'}>
            <div aria-label="Graph Toolbar" className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-md border border-[var(--tt-border)] bg-[color-mix(in_srgb,var(--tt-panel)_92%,transparent)] p-1 shadow-lg backdrop-blur-sm">
              <span aria-label="Graph Scope" className="flex gap-1" role="group">
                <Button unstyled aria-pressed={snapshot.graphMode === 'global'} className="rounded px-2 py-1 text-xs aria-pressed:bg-[var(--tt-selected)]" onClick={() => { props.onLoadGraph?.('global') }} type="button">Global</Button>
                <Button unstyled aria-pressed={snapshot.graphMode === 'local'} className="rounded px-2 py-1 text-xs aria-pressed:bg-[var(--tt-selected)]" disabled={snapshot.path === null} onClick={() => { props.onLoadGraph?.('local') }} type="button">Local</Button>
              </span>
              <details className="relative">
                <summary aria-label="Graph Settings" className="cursor-pointer list-none rounded px-2 py-1 text-xs hover:bg-[var(--tt-selected)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tt-accent)]">Settings</summary>
                <div aria-label="Graph Settings" className="absolute top-[calc(100%+6px)] right-0 z-20 grid w-64 gap-3 rounded-lg border border-[var(--tt-border)] bg-[var(--tt-panel)] p-3 text-xs shadow-xl">
                  <div className="grid grid-cols-2 gap-2">
                    <Label unstyled className="flex items-center gap-1">Orphans<Checkbox checked={snapshot.settings?.graphIncludeOrphans ?? true} onCheckedChange={checked => { props.onSettingsChange?.({ graphIncludeOrphans: checked === true }) }} /></Label>
                    <Label unstyled className="flex items-center gap-1">Tags<Checkbox checked={snapshot.settings?.graphIncludeTags ?? false} onCheckedChange={checked => { props.onSettingsChange?.({ graphIncludeTags: checked === true }) }} /></Label>
                    <Label unstyled className="flex items-center gap-1">Attachments<Checkbox checked={snapshot.settings?.graphIncludeAttachments ?? false} onCheckedChange={checked => { props.onSettingsChange?.({ graphIncludeAttachments: checked === true }) }} /></Label>
                    <Label unstyled className="flex items-center gap-1">Local Depth<NativeSelect unstyled value={String(snapshot.settings?.graphDepth ?? 2)} onChange={event => { const depth = Number(event.target.value); if (depth === 1 || depth === 2 || depth === 3) props.onSettingsChange?.({ graphDepth: depth }) }}><NativeSelectOption value="1">1</NativeSelectOption><NativeSelectOption value="2">2</NativeSelectOption><NativeSelectOption value="3">3</NativeSelectOption></NativeSelect></Label>
                    <Label unstyled className="col-span-2 grid gap-1">Filter Note Paths<Input unstyled aria-label="Filter Graph Note Paths" className="rounded border border-[var(--tt-border)] bg-transparent p-1" maxLength={1_000} onChange={event => { props.onSettingsChange?.({ graphQuery: event.target.value }) }} type="search" value={snapshot.settings?.graphQuery ?? ''} /></Label>
                    <Label unstyled className="grid gap-1">Group Nodes<NativeSelect unstyled aria-label="Group Graph Nodes" className="rounded border border-[var(--tt-border)] bg-transparent p-1" onChange={event => { props.onSettingsChange?.({ graphGroupBy: event.target.value === 'folder' ? 'folder' : 'none' }) }} value={snapshot.settings?.graphGroupBy ?? 'none'}><NativeSelectOption value="none">None</NativeSelectOption><NativeSelectOption value="folder">Folder</NativeSelectOption></NativeSelect></Label>
                    <Label unstyled className="grid gap-1">Color Nodes<NativeSelect unstyled aria-label="Color Graph Nodes" className="rounded border border-[var(--tt-border)] bg-transparent p-1" onChange={event => { props.onSettingsChange?.({ graphColorBy: event.target.value === 'folder' ? 'folder' : 'none' }) }} value={snapshot.settings?.graphColorBy ?? 'none'}><NativeSelectOption value="none">Default</NativeSelectOption><NativeSelectOption value="folder">Folder</NativeSelectOption></NativeSelect></Label>
                  </div>
                  <div aria-label="Graph Viewport Controls" className="flex flex-wrap gap-1" role="group">
                    <Button unstyled aria-label="Zoom Graph Out" className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" disabled={graphZoom <= 0.5} onClick={() => { setGraphZoom(value => Math.max(0.5, value - 0.25)) }} type="button">−</Button>
                    <Button unstyled aria-label="Reset Graph Viewport" className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { setGraphZoom(1); setGraphPan({ x: 0, y: 0 }) }} type="button">{String(Math.round(graphZoom * 100))}%</Button>
                    <Button unstyled aria-label="Zoom Graph In" className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" disabled={graphZoom >= 2} onClick={() => { setGraphZoom(value => Math.min(2, value + 0.25)) }} type="button">+</Button>
                    <Button unstyled aria-label="Pan Graph Left" className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { setGraphPan(value => ({ ...value, x: Math.max(-200, value.x - 20) })) }} type="button">←</Button>
                    <Button unstyled aria-label="Pan Graph Up" className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { setGraphPan(value => ({ ...value, y: Math.max(-200, value.y - 20) })) }} type="button">↑</Button>
                    <Button unstyled aria-label="Pan Graph Down" className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { setGraphPan(value => ({ ...value, y: Math.min(200, value.y + 20) })) }} type="button">↓</Button>
                    <Button unstyled aria-label="Pan Graph Right" className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { setGraphPan(value => ({ ...value, x: Math.min(200, value.x + 20) })) }} type="button">→</Button>
                  </div>
                </div>
              </details>
            </div>
            {graphNodes.length > 0 ? (
              <div aria-label={`${snapshot.graphMode === 'local' ? 'Local' : 'Global'} Graph Canvas`} className="tocktutor-graph-canvas absolute inset-0 overflow-hidden bg-[color-mix(in_srgb,var(--tt-text)_2%,var(--tt-panel))]" role="group">
                <div data-graph-layer="true" className="absolute inset-0" style={{ transform: `translate(${String(graphPan.x)}px, ${String(graphPan.y)}px) scale(${String(graphZoom)})`, transformOrigin: 'center' }}>
                  <svg aria-hidden="true" className="pointer-events-none absolute inset-0 !h-full !w-full overflow-visible text-[var(--tt-muted)]" preserveAspectRatio="none" viewBox="0 0 100 100">
                    {graphEdges.map(edge => {
                      const source = graphPoints.get(edge.sourcePath)
                      const target = graphPoints.get(edge.targetPath)
                      if (source === undefined || target === undefined) return null
                      return <line data-graph-edge="true" key={`${edge.sourcePath}:${edge.targetPath}:${String(edge.line)}`} stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.2" vectorEffect="non-scaling-stroke" x1={source.x} x2={target.x} y1={source.y} y2={target.y} />
                    })}
                  </svg>
                  {graphNodes.map(node => {
                    const point = graphPoints.get(node.path)
                    if (point === undefined) return null
                    const folder = graphFolder(node.path)
                    const active = node.path === snapshot.graph?.path
                    const color = active ? 'var(--tt-accent)' : snapshot.settings?.graphColorBy === 'folder' ? graphFolderColor(folder) : 'var(--tt-muted)'
                    return <Button unstyled aria-current={active ? 'true' : undefined} aria-label={`${node.path} Graph Node`} className="group absolute z-1 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tt-accent)]" data-active={active} data-graph-group={snapshot.settings?.graphGroupBy === 'folder' ? folder : undefined} key={node.path} onClick={() => { props.onOpenGraphNode?.(node.path, 'note') }} style={{ left: `${String(point.x)}%`, top: `${String(point.y)}%` }} title={`Open ${node.path}`} type="button"><span aria-hidden="true" className="absolute inset-[5px] rounded-full" style={{ backgroundColor: color }} /><span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-5 max-w-40 -translate-x-1/2 truncate whitespace-nowrap text-[10px] text-[var(--tt-muted)] opacity-80">{node.path}</span></Button>
                  })}
                  <span className="sr-only">{graphEdges.map(edge => `${edge.sourcePath} links to ${edge.targetPath}`).join('. ')}</span>
                </div>
              </div>
            ) : <span className="absolute inset-0 grid place-items-center text-xs text-[var(--tt-muted)]">{(snapshot.graphLayout?.length ?? 0) > 0 ? 'No graph nodes match this filter.' : 'Open Global or Local Graph.'}</span>}
            <details className="absolute bottom-3 left-3 z-10 max-w-[min(22rem,calc(100%-24px))] rounded-md border border-[var(--tt-border)] bg-[color-mix(in_srgb,var(--tt-panel)_92%,transparent)] shadow-lg backdrop-blur-sm">
              <summary className="cursor-pointer list-none px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tt-accent)]">Graph Nodes ({String(graphNodes.length)})</summary>
              <div className="max-h-48 min-w-56 overflow-auto border-t border-[var(--tt-border)] p-2">
                {graphGroups.map(([group, nodes]) => <section aria-label={`Graph Group ${group}`} key={group}><h3 className="m-0 text-xs">{group}</h3><div className="grid gap-1">{(nodes ?? []).map(node => <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-1" key={node.path}><span className="truncate text-xs">{node.path}</span><Button unstyled aria-label={`Open Note ${node.path}`} className="rounded border border-[var(--tt-border)] bg-transparent px-1 py-0.5 text-xs" onClick={() => { props.onOpenGraphNode?.(node.path, 'note') }} type="button">Open</Button><Button unstyled aria-label={`Open Local Graph ${node.path}`} className="rounded border border-[var(--tt-border)] bg-transparent px-1 py-0.5 text-xs" onClick={() => { props.onOpenGraphNode?.(node.path, 'local') }} type="button">Local</Button><Button unstyled aria-label={`Copy Graph Path ${node.path}`} className="rounded border border-[var(--tt-border)] bg-transparent px-1 py-0.5 text-xs" onClick={() => { props.onCopyGraphPath?.(node.path) }} type="button">Copy</Button></div>)}</div></section>)}
                {(graphNodes.length === 0) && <span className="text-xs text-[var(--tt-muted)]">No graph nodes.</span>}
              </div>
            </details>
          </section>
          <section aria-label="Bookmarks" className="p-3" hidden={props.view !== 'bookmarks'}>
            <div className="grid gap-1">
              {(snapshot.bookmarks ?? []).map(bookmark => (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1" key={bookmark.id}>
                  <Button unstyled className="truncate rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-xs hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)]" onClick={() => { props.onOpenBookmark?.(bookmark.id) }} type="button">{bookmark.title} · {bookmark.kind}{bookmark.missing === true ? ' · Missing' : ''}</Button>
                  <Button unstyled aria-label={`Remove Bookmark ${bookmark.title}`} className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { props.onRemoveBookmark?.(bookmark.id) }} type="button">Remove</Button>
                </div>
              ))}
              {(snapshot.bookmarks?.length ?? 0) === 0 && <span className="text-xs text-[var(--tt-muted)]">No bookmarks.</span>}
            </div>
          </section>
          <section aria-label="Tags" className="border-t border-[var(--tt-border)] p-3" hidden={props.view !== 'tags'}>
            <div aria-label="Vault Tags" className="grid gap-0.5" role="list">
              {vaultTags.map(tag => (
                <div className="min-w-0" key={tag.tag.toLocaleLowerCase()} role="listitem">
                  <Button unstyled className="w-full truncate rounded border-0 bg-transparent px-1 py-1 text-left text-xs hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)]" onClick={() => { props.onSearchChange?.(`tag:${tag.tag}`); props.onRunSearch?.() }} type="button">#{tag.tag} · {String(tag.count)}</Button>
                </div>
              ))}
              {vaultTags.length === 0 && <span className="text-xs text-[var(--tt-muted)]">No tags.</span>}
            </div>
          </section>
          <section aria-label="Properties" className="p-3" hidden={props.view !== 'properties'}>
            <table aria-label="Vault Properties" className="w-full table-fixed border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--tt-border)] text-left text-[var(--tt-muted)]">
                  <th className="w-[46%] px-1 py-1 font-medium" scope="col">Property</th>
                  <th className="w-[34%] px-1 py-1 font-medium" scope="col">Type</th>
                  <th className="w-[20%] px-1 py-1 text-right font-medium" scope="col">Count</th>
                </tr>
              </thead>
              <tbody>
                {vaultProperties.map(property => (
                  <tr className="border-b border-[color-mix(in_srgb,var(--tt-border)_60%,transparent)] last:border-0" key={property.key.toLocaleLowerCase()}>
                    <th className="truncate px-1 py-1 text-left font-medium" scope="row">
                      <Button unstyled aria-label={`Search Property ${property.key}`} className="max-w-full truncate rounded border-0 bg-transparent p-0 text-left text-xs hover:text-[var(--tt-accent)] focus-visible:text-[var(--tt-accent)]" onClick={() => { props.onSearchChange?.(`[${property.key}]`); props.onRunSearch?.() }} type="button">{property.key}</Button>
                    </th>
                    <td className="truncate px-1 py-1 text-[var(--tt-muted)]">{property.types.join(', ') || 'Unknown'}</td>
                    <td className="px-1 py-1 text-right tabular-nums">{String(property.count)}</td>
                  </tr>
                ))}
                {vaultProperties.length === 0 && <tr><td className="px-1 py-2 text-[var(--tt-muted)]" colSpan={3}>No properties.</td></tr>}
              </tbody>
            </table>
          </section>
          <section aria-label="Backlinks" className="border-t border-[var(--tt-border)] p-3" hidden={props.view !== 'backlinks'}>
            <details className="rounded border border-[var(--tt-border)]" open>
              <summary className="cursor-pointer list-none px-2 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tt-accent)]">Linked Mentions ({String(linkedMentions.length)})</summary>
              <div className="grid gap-1 border-t border-[var(--tt-border)] p-2">
                {linkedMentions.map((link, index) => (
                  <Button unstyled aria-label={`Open Linked Mention ${link.sourcePath}`} className="grid min-w-0 gap-0.5 rounded border-0 bg-transparent px-1 py-1 text-left text-xs hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)]" key={`${link.sourcePath}-${String(link.line)}-${String(index)}`} onClick={() => { props.onSelect(link.sourcePath) }} type="button">
                    <span className="truncate">{link.sourcePath} · line {String(link.line)}</span>
                    <span className="truncate text-[var(--tt-muted)]">{link.displayText || link.authoredTarget}</span>
                  </Button>
                ))}
                {linkedMentions.length === 0 && <span className="text-xs text-[var(--tt-muted)]">No linked mentions.</span>}
              </div>
            </details>
            <details className="mt-2 rounded border border-[var(--tt-border)]">
              <summary className="cursor-pointer list-none px-2 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tt-accent)]">Unlinked Mentions ({String(unlinkedMentions.length)})</summary>
              <div className="grid gap-2 border-t border-[var(--tt-border)] p-2">
                {unlinkedMentions.map((mention, index) => (
                  <Button unstyled aria-label={`Open Unlinked Mention ${mention.sourcePath}`} className="grid min-w-0 gap-0.5 rounded border-0 bg-transparent px-1 py-1 text-left text-xs hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)]" key={`${mention.sourcePath}-${String(mention.line)}-${String(index)}`} onClick={() => { props.onSelect(mention.sourcePath) }} type="button">
                    <span className="truncate">{mention.sourcePath} · line {String(mention.line)}</span>
                    <span className="text-[var(--tt-muted)]">{mention.snippet || mention.matchedText}</span>
                  </Button>
                ))}
                {unlinkedMentions.length === 0 && <span className="text-xs text-[var(--tt-muted)]">No unlinked mentions.</span>}
              </div>
            </details>
          </section>
          <section aria-label="Resolved Embeds" className="p-3" hidden={props.view !== 'attachments'}>
            <h2 className="m-0 text-sm">Resolved Embeds</h2>
            <div className="mt-2 grid gap-2">
              {(snapshot.embeds ?? []).map((embed, index) => (
                <article className="overflow-auto rounded border border-[var(--tt-border)] p-2" key={`${embed.target.path}-${String(index)}`}>
                  <strong className="block truncate text-xs">{embed.target.path}{embed.target.fragment === null ? '' : `#${embed.target.fragment}`}</strong>
                  {embed.target.kind === 'media' && embed.mimeType?.startsWith('image/') && <img alt={embed.target.display ?? embed.target.path} className="mt-1 max-h-48 max-w-full" src={`data:${embed.mimeType};base64,${embed.content}`} />}
                  {embed.target.kind === 'media' && embed.mimeType?.startsWith('audio/') && <audio className="mt-1 w-full" controls src={`data:${embed.mimeType};base64,${embed.content}`} />}
                  {embed.target.kind === 'media' && embed.mimeType?.startsWith('video/') && <video className="mt-1 max-h-48 max-w-full" controls src={`data:${embed.mimeType};base64,${embed.content}`} />}
                  {embed.target.kind === 'media' && embed.mimeType === 'application/pdf' && <iframe className="mt-1 h-48 w-full" sandbox="" src={`data:${embed.mimeType};base64,${embed.content}`} title={embed.target.path} />}
                  {embed.target.kind === 'note' && <div className="prose text-xs" dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(embed.content, { resolvedEmbeds: snapshot.embeds ?? [], resolvedEmbedParentPath: embed.target.path }) }} />}
                  {embed.target.kind === 'canvas' && <CanvasBoard disabled onChange={() => {}} revision="embedded" source={embed.content} />}
                  {embed.target.kind === 'base' && <ExecutableBaseView files={snapshot.baseFiles ?? []} source={embed.content} />}
                </article>
              ))}
              {(snapshot.embeds?.length ?? 0) === 0 && <span className="text-xs text-[var(--tt-muted)]">No resolved embeds.</span>}
            </div>
          </section>
          <section aria-label="Attachments" className="border-t border-[var(--tt-border)] p-3" hidden={props.view !== 'attachments'}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-sm">Attachments</h2>
              <Label unstyled className="cursor-pointer rounded border border-[var(--tt-border)] px-2 py-1 text-xs">Add Files
                <Input unstyled accept="image/*,audio/*,video/*,application/pdf" className="sr-only" multiple onChange={event => {
                  if (event.target.files !== null) props.onAttachFiles?.(event.target.files)
                  event.target.value = ''
                }} type="file" />
              </Label>
            </div>
            <div className="mt-2 grid gap-1">
              {snapshot.entries.filter(entry => entry.kind === 'attachment').map(entry => <Button unstyled className="truncate rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-xs hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)]" key={entry.path} onClick={() => { props.onPreviewAttachment?.(entry.path) }} type="button">{entry.path}</Button>)}
            </div>
            {snapshot.attachmentPreview !== null && snapshot.attachmentPreview !== undefined && (
              <div className="mt-2 rounded border border-[var(--tt-border)] p-2">
                <div className="flex justify-between gap-2"><strong className="truncate text-xs">{snapshot.attachmentPreview.path}</strong><Button unstyled aria-label="Close Attachment Preview" className="border-0 bg-transparent" onClick={props.onCloseAttachmentPreview} type="button"><WorkbenchGlyph kind="close" /></Button></div>
                {snapshot.attachmentPreview.mediaKind === 'image' && <img alt={snapshot.attachmentPreview.path} className="mt-2 max-h-48 max-w-full" src={`data:${snapshot.attachmentPreview.mimeType};base64,${snapshot.attachmentPreview.dataBase64}`} />}
                {snapshot.attachmentPreview.mediaKind === 'audio' && <audio className="mt-2 w-full" controls src={`data:${snapshot.attachmentPreview.mimeType};base64,${snapshot.attachmentPreview.dataBase64}`} />}
                {snapshot.attachmentPreview.mediaKind === 'video' && <video className="mt-2 max-h-48 max-w-full" controls src={`data:${snapshot.attachmentPreview.mimeType};base64,${snapshot.attachmentPreview.dataBase64}`} />}
                {snapshot.attachmentPreview.mediaKind === 'pdf' && <iframe className="mt-2 h-48 w-full" sandbox="" src={`data:${snapshot.attachmentPreview.mimeType};base64,${snapshot.attachmentPreview.dataBase64}`} title={snapshot.attachmentPreview.path} />}
              </div>
            )}
          </section>
          <section aria-label="Note Composer and Format Converter" className="p-3" hidden={props.view !== 'tools'}>
            <h2 className="m-0 text-sm">Note Composer and Format Converter</h2>
            <div className="mt-2 flex gap-1">
              <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" disabled={snapshot.documentKind !== 'markdown' || snapshot.mode === 'reading' || (snapshot.selectionEnd ?? 0) <= (snapshot.selectionStart ?? 0)} onClick={props.onExtractSelection} type="button">Extract Selection</Button>
              <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" disabled={snapshot.documentKind !== 'markdown' || snapshot.mode === 'reading'} onClick={props.onConvertActiveNote} type="button">Convert Formats</Button>
            </div>
          </section>
          <section aria-label="Templates and Journals" className="border-t border-[var(--tt-border)] p-3" hidden={props.view !== 'tools'}>
            <h2 className="m-0 text-sm">Templates and Journals</h2>
            <div className="mt-2 grid grid-cols-2 gap-1">
              {(Object.keys(BUILTIN_TEMPLATES) as Array<keyof typeof BUILTIN_TEMPLATES>).map(name => <Button unstyled className="rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-xs hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)]" key={name} onClick={() => { props.onCreateBuiltinTemplate?.(name) }} type="button">{name}</Button>)}
              <Button unstyled className="rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-xs hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)]" disabled={snapshot.documentKind !== 'markdown' || snapshot.mode === 'reading'} onClick={() => { props.onInsertCurrentDateTime?.('date') }} type="button">Insert Current Date</Button>
              <Button unstyled className="rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-xs hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)]" disabled={snapshot.documentKind !== 'markdown' || snapshot.mode === 'reading'} onClick={() => { props.onInsertCurrentDateTime?.('time') }} type="button">Insert Current Time</Button>
            </div>
          </section>
          <section aria-label="Capture Organization" className="border-t border-[var(--tt-border)] p-3" hidden={props.view !== 'tools'}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-sm">Capture Organization</h2>
              <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" disabled={snapshot.path === null || !/^Inbox\/.+\.md$/iu.test(snapshot.path)} onClick={props.onPrepareOrganization} type="button">Prepare Review</Button>
            </div>
            {snapshot.organizationProposal !== null && snapshot.organizationProposal !== undefined && (
              <div className="mt-2 rounded border border-[var(--tt-border)] p-2 text-xs">
                <strong className="block">{snapshot.organizationProposal.title}</strong>
                <span className="block truncate">{snapshot.organizationProposal.destination}</span>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap">{snapshot.organizationProposal.content}</pre>
                <div className="flex justify-end gap-1">
                  <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1" onClick={props.onCancelOrganization} type="button">Cancel</Button>
                  <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1" onClick={props.onApplyOrganization} type="button">Approve and Create</Button>
                </div>
              </div>
            )}
          </section>
          <section aria-label="TockTutor Settings" className="p-3" hidden={props.view !== 'workspace'}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-sm">Settings and Workspaces</h2>
              <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" disabled={snapshot.settings === undefined} onClick={props.onSaveWorkspace} type="button">Save Workspace</Button>
            </div>
            <div className="mt-2 grid gap-2 text-xs">
              <Label unstyled className="flex items-center justify-between gap-2">Page Preview<Checkbox checked={snapshot.settings?.pagePreview ?? true} disabled={snapshot.settings === undefined} onCheckedChange={checked => { props.onSettingsChange?.({ pagePreview: checked === true }) }} /></Label>
              <Label unstyled className="flex items-center justify-between gap-2">Backlinks in Document<Checkbox checked={snapshot.settings?.backlinksInDocument ?? false} disabled={snapshot.settings === undefined} onCheckedChange={checked => { props.onSettingsChange?.({ backlinksInDocument: checked === true }) }} /></Label>
              <Label unstyled className="grid gap-1">Default Editing Mode
                <NativeSelect unstyled className="rounded border border-[var(--tt-border)] bg-transparent p-1" disabled={snapshot.settings === undefined} onChange={event => { props.onSettingsChange?.({ defaultEditingMode: event.target.value === 'source' ? 'source' : 'live-preview' }) }} value={snapshot.settings?.defaultEditingMode ?? 'live-preview'}>
                  <NativeSelectOption value="live-preview">Live Preview</NativeSelectOption>
                  <NativeSelectOption value="source">Source</NativeSelectOption>
                </NativeSelect>
              </Label>
            </div>
            <div className="mt-2 grid gap-1">
              {(snapshot.workspaces ?? []).map(workspace => (
                <Button unstyled className="rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-xs hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)]" key={workspace.id} onClick={() => { props.onLoadWorkspace?.(workspace.id) }} type="button">Load {workspace.name}</Button>
              ))}
              {(snapshot.workspaces?.length ?? 0) === 0 && <span className="text-xs text-[var(--tt-muted)]">No saved workspaces.</span>}
            </div>
          </section>
          <section aria-label="Pane Groups" className="tocktutor-pane-groups border-t border-[var(--tt-border)] p-3" hidden={props.view !== 'workspace'}>
            <div className="tocktutor-pane-heading flex items-center justify-between">
              <h2 className="m-0 text-sm">Pane Groups</h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button unstyled aria-label="Add Pane" className="size-[26px] rounded border border-[var(--tt-border)] bg-transparent" disabled={snapshot.panes.length >= MAX_PANE_GROUPS} onClick={props.onAddPane} type="button"><WorkbenchGlyph kind="new" /></Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Add Pane</TooltipContent>
              </Tooltip>
            </div>
            <div className="tocktutor-pane-list mt-2 grid grid-cols-2 gap-1.5">
              {snapshot.panes.map((pane, index) => (
                <Button unstyled aria-pressed={pane.id === snapshot.focusedPaneId} className="overflow-hidden rounded-[5px] border border-[var(--tt-border)] bg-transparent p-1.5 text-left aria-pressed:border-[var(--tt-accent)] [&_small]:block [&_small]:truncate [&_small]:text-xs [&_small]:text-[var(--tt-muted)] [&_span]:block [&_span]:truncate" key={pane.id} onClick={() => { props.onFocusPane(pane.id) }} title={pane.activePath ?? `Pane ${String(index + 1)}`} type="button">
                  <span>Pane {String(index + 1)}</span><small>{pane.activePath ?? 'Empty'}</small>
                </Button>
              ))}
            </div>
          </section>
          <section aria-label="Shared Review Panel" className="tocktutor-review p-3" hidden={props.view !== 'extensions'}>
            <header><h2 className="m-0 text-sm">Reviews</h2></header>
            <div className="tocktutor-review-content min-h-0 overflow-auto text-xs text-[var(--tt-muted)]">{props.reviewPanel ?? <Alert unstyled role="status">No review workflow is active.</Alert>}</div>
          </section>
          <section aria-label="Native Actions" className="tocktutor-native-actions border-t border-[var(--tt-border)] p-3" hidden={props.view !== 'extensions'}>
            <header><h2 className="m-0 text-sm">Native Actions</h2></header>
            <div className="tocktutor-native-actions-content min-h-0 overflow-auto text-xs text-[var(--tt-muted)]">{props.nativeActions ?? <Alert unstyled role="status">No native actions are available.</Alert>}</div>
          </section>
        </aside>
  )
}
