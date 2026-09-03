import { Alert } from '@tockteam/ui/alert'
import { Button } from '@tockteam/ui/button'
import { Checkbox } from '@tockteam/ui/checkbox'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@tockteam/ui/tooltip'
import { useState, type ReactNode } from 'react'
import { ExecutableBaseView } from './base-executable-view.tsx'
import { CanvasBoard } from './canvas-board.tsx'
import { BUILTIN_TEMPLATES } from './capture.ts'
import { parseFrontmatterProperties } from './properties.ts'
import { renderMarkdownHtml } from './rich-markdown.ts'
import type { TockTutorRouteViewProps } from './route.tsx'
import { MAX_PANE_GROUPS } from './session.ts'
import type { VaultHeading } from './types.ts'
import { WorkbenchGlyph } from './workbench-glyph.tsx'

export type WorkbenchUtilityView = 'attachments' | 'extensions' | 'graph' | 'library' | 'note-info' | 'recovery' | 'tools' | 'web' | 'workspace'

const UTILITY_TITLES: Record<WorkbenchUtilityView, string> = {
  attachments: 'Attachments and Embeds',
  extensions: 'Reviews and Actions',
  graph: 'Graph View',
  library: 'Bookmarks and Tags',
  'note-info': 'Properties and Links',
  recovery: 'File Recovery',
  tools: 'Note Tools',
  web: 'Web Viewer',
  workspace: 'Workspaces and Panes',
}

export type WorkbenchUtilitiesProps = TockTutorRouteViewProps & {
  activeProperties: ReturnType<typeof parseFrontmatterProperties>
  onClose(): void
  view: WorkbenchUtilityView | null
}

function graphFolder(path: string): string {
  return path.includes('/') ? path.split('/', 1)[0]! : 'Vault Root'
}

function graphFolderColor(folder: string): string {
  let hash = 0
  for (const character of folder) hash = (Math.imul(hash, 31) + character.codePointAt(0)!) >>> 0
  return `hsl(${String(hash % 360)} 62% 48%)`
}

export function WorkbenchUtilities(props: WorkbenchUtilitiesProps): ReactNode {
  const { activeProperties, snapshot } = props
  const [graphZoom, setGraphZoom] = useState(1)
  const open = props.view !== null
  const [graphPan, setGraphPan] = useState({ x: 0, y: 0 })
  const graphQuery = (snapshot.settings?.graphQuery ?? '').trim().toLocaleLowerCase()
  const graphNodes = (snapshot.graphLayout ?? []).filter(node => graphQuery === '' || node.path.toLocaleLowerCase().includes(graphQuery))
  const graphPaths = new Set(graphNodes.map(node => node.path))
  const graphGroups = Object.entries(Object.groupBy(graphNodes, node => snapshot.settings?.graphGroupBy === 'folder' ? graphFolder(node.path) : 'All Notes'))
    .toSorted(([left], [right]) => left.localeCompare(right))
  return (
        <aside
          aria-hidden={!open}
          aria-label="Workbench Utilities"
          className="tocktutor-right-panel invisible grid min-w-0 w-0 translate-x-6 auto-rows-max grid-rows-[40px] overflow-auto border-l border-[var(--tt-border)] bg-[var(--tt-panel)] opacity-0 shadow-none transition-[width,opacity,transform,visibility] [transition-duration:420ms,300ms,460ms,0s] [transition-timing-function:cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),linear] [transition-delay:0s,0s,0s,420ms] pointer-events-none data-[open=true]:visible data-[open=true]:w-[min(360px,calc(100vw-262px))] data-[open=true]:translate-x-0 data-[open=true]:opacity-100 data-[open=true]:[transition-delay:0s] data-[open=true]:pointer-events-auto [&>:not(.tocktutor-assistant-resize)]:min-w-[min(360px,calc(100vw-262px))]"
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
                <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" disabled={(snapshot.snapshots?.length ?? 0) === 0} onClick={props.onClearSnapshots} type="button">Clear</Button>
                <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={props.onOpenRecovery} type="button">Refresh</Button>
              </span>
            </div>
            {snapshot.draftRecovered === true && <Alert unstyled className="mt-2" role="status">A local draft was recovered for this note.</Alert>}
            <div className="mt-2 flex gap-2">
              <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" disabled={snapshot.path === null} onClick={props.onTrashCurrent} type="button">Move Current File to Trash</Button>
            </div>
            <h3 className="mt-3 mb-1 text-xs">Snapshots</h3>
            <div className="grid gap-1">
              {(snapshot.snapshots ?? []).map((snapshotEntry, index) => (
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-1" key={snapshotEntry.id}>
                  <span className="truncate text-xs">Snapshot {String(index + 1)} · {snapshotEntry.reason}</span>
                  <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { props.onReadSnapshot?.(snapshotEntry.id) }} type="button">Preview</Button>
                  <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { props.onRestoreSnapshotOverwrite?.(snapshotEntry.id) }} type="button">Restore Original</Button>
                  <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { props.onRestoreSnapshot?.(snapshotEntry.id) }} type="button">Restore as New</Button>
                </div>
              ))}
              {(snapshot.snapshots?.length ?? 0) === 0 && <span className="text-xs text-[var(--tt-muted)]">No snapshots for the active file.</span>}
            </div>
            {snapshot.selectedSnapshot !== null && snapshot.selectedSnapshot !== undefined && (
              <pre aria-label="Snapshot Preview" className="mt-2 max-h-32 overflow-auto rounded border border-[var(--tt-border)] p-2 text-xs">{snapshot.selectedSnapshot.content}</pre>
            )}
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
          <section aria-label="Graph View" className="p-3" hidden={props.view !== 'graph'}>
            <div className="flex items-center justify-end gap-2">
              <span className="flex gap-1">
                <Button unstyled aria-pressed={snapshot.graphMode === 'global'} className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { props.onLoadGraph?.('global') }} type="button">Global</Button>
                <Button unstyled aria-pressed={snapshot.graphMode === 'local'} className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" disabled={snapshot.path === null} onClick={() => { props.onLoadGraph?.('local') }} type="button">Local</Button>
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
              <Label unstyled className="flex items-center gap-1">Orphans<Checkbox checked={snapshot.settings?.graphIncludeOrphans ?? true} onCheckedChange={checked => { props.onSettingsChange?.({ graphIncludeOrphans: checked === true }) }} /></Label>
              <Label unstyled className="flex items-center gap-1">Tags<Checkbox checked={snapshot.settings?.graphIncludeTags ?? false} onCheckedChange={checked => { props.onSettingsChange?.({ graphIncludeTags: checked === true }) }} /></Label>
              <Label unstyled className="flex items-center gap-1">Attachments<Checkbox checked={snapshot.settings?.graphIncludeAttachments ?? false} onCheckedChange={checked => { props.onSettingsChange?.({ graphIncludeAttachments: checked === true }) }} /></Label>
              <Label unstyled className="flex items-center gap-1">Local Depth<NativeSelect unstyled value={String(snapshot.settings?.graphDepth ?? 2)} onChange={event => { const depth = Number(event.target.value); if (depth === 1 || depth === 2 || depth === 3) props.onSettingsChange?.({ graphDepth: depth }) }}><NativeSelectOption value="1">1</NativeSelectOption><NativeSelectOption value="2">2</NativeSelectOption><NativeSelectOption value="3">3</NativeSelectOption></NativeSelect></Label>
              <Label unstyled className="col-span-2 grid gap-1">Filter Note Paths<Input unstyled aria-label="Filter Graph Note Paths" className="rounded border border-[var(--tt-border)] bg-transparent p-1" maxLength={1_000} onChange={event => { props.onSettingsChange?.({ graphQuery: event.target.value }) }} type="search" value={snapshot.settings?.graphQuery ?? ''} /></Label>
              <Label unstyled className="grid gap-1">Group Nodes<NativeSelect unstyled aria-label="Group Graph Nodes" className="rounded border border-[var(--tt-border)] bg-transparent p-1" onChange={event => { props.onSettingsChange?.({ graphGroupBy: event.target.value === 'folder' ? 'folder' : 'none' }) }} value={snapshot.settings?.graphGroupBy ?? 'none'}><NativeSelectOption value="none">None</NativeSelectOption><NativeSelectOption value="folder">Folder</NativeSelectOption></NativeSelect></Label>
              <Label unstyled className="grid gap-1">Color Nodes<NativeSelect unstyled aria-label="Color Graph Nodes" className="rounded border border-[var(--tt-border)] bg-transparent p-1" onChange={event => { props.onSettingsChange?.({ graphColorBy: event.target.value === 'folder' ? 'folder' : 'none' }) }} value={snapshot.settings?.graphColorBy ?? 'none'}><NativeSelectOption value="none">Default</NativeSelectOption><NativeSelectOption value="folder">Folder</NativeSelectOption></NativeSelect></Label>
            </div>
            <div aria-label="Graph Viewport Controls" className="mt-2 flex gap-1" role="group">
              <Button unstyled aria-label="Zoom Graph Out" className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" disabled={graphZoom <= 0.5} onClick={() => { setGraphZoom(value => Math.max(0.5, value - 0.25)) }} type="button">−</Button>
              <Button unstyled aria-label="Reset Graph Viewport" className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { setGraphZoom(1); setGraphPan({ x: 0, y: 0 }) }} type="button">{String(Math.round(graphZoom * 100))}%</Button>
              <Button unstyled aria-label="Zoom Graph In" className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" disabled={graphZoom >= 2} onClick={() => { setGraphZoom(value => Math.min(2, value + 0.25)) }} type="button">+</Button>
              <Button unstyled aria-label="Pan Graph Left" className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { setGraphPan(value => ({ ...value, x: Math.max(-200, value.x - 20) })) }} type="button">←</Button>
              <Button unstyled aria-label="Pan Graph Up" className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { setGraphPan(value => ({ ...value, y: Math.max(-200, value.y - 20) })) }} type="button">↑</Button>
              <Button unstyled aria-label="Pan Graph Down" className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { setGraphPan(value => ({ ...value, y: Math.min(200, value.y + 20) })) }} type="button">↓</Button>
              <Button unstyled aria-label="Pan Graph Right" className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { setGraphPan(value => ({ ...value, x: Math.min(200, value.x + 20) })) }} type="button">→</Button>
            </div>
            {graphNodes.length > 0 ? (
              <>
                <div aria-label={`${snapshot.graphMode === 'local' ? 'Local' : 'Global'} Graph Canvas`} className="relative mt-2 h-48 w-full overflow-hidden rounded border border-[var(--tt-border)]" role="img">
                  {graphNodes.map(node => {
                    const folder = graphFolder(node.path)
                    return <span aria-label={`${node.path} Graph Node`} className="absolute size-2 rounded-full bg-[var(--tt-muted)] data-[active=true]:bg-[var(--tt-accent)]" data-active={node.path === snapshot.graph?.path} data-graph-group={snapshot.settings?.graphGroupBy === 'folder' ? folder : undefined} key={node.path} style={{ backgroundColor: snapshot.settings?.graphColorBy === 'folder' ? graphFolderColor(folder) : undefined, left: `calc(50% + ${String(node.x / 5 * graphZoom + graphPan.x)}px)`, top: `calc(50% + ${String(node.y / 5 * graphZoom + graphPan.y)}px)` }} title={node.path} />
                  })}
                  <span className="sr-only">{(snapshot.graph?.edges ?? []).filter(edge => graphPaths.has(edge.sourcePath) && graphPaths.has(edge.targetPath)).map(edge => `${edge.sourcePath} links to ${edge.targetPath}`).join('. ')}</span>
                </div>
                <div className="mt-1 grid max-h-48 gap-2 overflow-auto">
                  {graphGroups.map(([group, nodes]) => <section aria-label={`Graph Group ${group}`} key={group}><h3 className="m-0 text-xs">{group}</h3><div className="grid gap-1">{(nodes ?? []).map(node => <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-1" key={node.path}><span className="truncate text-xs">{node.path}</span><Button unstyled aria-label={`Open Note ${node.path}`} className="rounded border border-[var(--tt-border)] bg-transparent px-1 py-0.5 text-xs" onClick={() => { props.onOpenGraphNode?.(node.path, 'note') }} type="button">Open</Button><Button unstyled aria-label={`Open Local Graph ${node.path}`} className="rounded border border-[var(--tt-border)] bg-transparent px-1 py-0.5 text-xs" onClick={() => { props.onOpenGraphNode?.(node.path, 'local') }} type="button">Local</Button><Button unstyled aria-label={`Copy Graph Path ${node.path}`} className="rounded border border-[var(--tt-border)] bg-transparent px-1 py-0.5 text-xs" onClick={() => { props.onCopyGraphPath?.(node.path) }} type="button">Copy</Button></div>)}</div></section>)}
                </div>
              </>
            ) : <span className="mt-2 block text-xs text-[var(--tt-muted)]">{(snapshot.graphLayout?.length ?? 0) > 0 ? 'No graph nodes match this filter.' : 'Open Global or Local Graph.'}</span>}
          </section>
          <section aria-label="Bookmarks" className="p-3" hidden={props.view !== 'library'}>
            <h2 className="m-0 text-sm">Bookmarks</h2>
            <div className="mt-2 grid gap-1">
              {(snapshot.bookmarks ?? []).map(bookmark => (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1" key={bookmark.id}>
                  <Button unstyled className="truncate rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-left text-xs" onClick={() => { props.onOpenBookmark?.(bookmark.id) }} type="button">{bookmark.title} · {bookmark.kind}{bookmark.missing === true ? ' · Missing' : ''}</Button>
                  <Button unstyled aria-label={`Remove Bookmark ${bookmark.title}`} className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-xs" onClick={() => { props.onRemoveBookmark?.(bookmark.id) }} type="button">Remove</Button>
                </div>
              ))}
              {(snapshot.bookmarks?.length ?? 0) === 0 && <span className="text-xs text-[var(--tt-muted)]">No bookmarks.</span>}
            </div>
          </section>
          <section aria-label="Smart Views and Tags" className="border-t border-[var(--tt-border)] p-3" hidden={props.view !== 'library'}>
            <h2 className="m-0 text-sm">Smart Views and Tags</h2>
            <div className="mt-2 grid grid-cols-2 gap-1">
              {(['recent', 'tasks', 'journals', 'favorites', 'collections', 'tags'] as const).map(kind => (
                <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-left text-xs" key={kind} onClick={() => { props.onOpenSmartView?.(kind) }} type="button">{kind[0]!.toLocaleUpperCase() + kind.slice(1)}</Button>
              ))}
            </div>
            {(snapshot.facets?.tags.length ?? 0) > 0 && (
              <div className="mt-2 grid gap-1" aria-label="Tags">
                {snapshot.facets?.tags.map(tag => (
                  <Button unstyled className="rounded border-0 bg-transparent px-1 py-0.5 text-left text-xs" key={tag.tag.toLocaleLowerCase()} onClick={() => { props.onSearchChange?.(`tag:${tag.tag}`); props.onRunSearch?.() }} type="button">#{tag.tag} · {String(tag.count)}</Button>
                ))}
              </div>
            )}
          </section>
          <section aria-label="Properties" className="p-3" hidden={props.view !== 'note-info'}>
            <h2 className="m-0 text-sm">Properties</h2>
            <h3 className="mt-2 mb-1 text-xs">File</h3>
            <div className="grid gap-1">
              {activeProperties.map(property => (
                <Label unstyled className="grid grid-cols-[minmax(80px,.4fr)_minmax(0,1fr)] items-center gap-2 text-xs" key={property.key}>
                  <span className="truncate">{property.key} · {property.type}</span>
                  {property.type === 'checkbox' ? (
                    <Checkbox aria-label={`${property.key} Property`} checked={property.value === true} onCheckedChange={checked => { props.onSetProperty?.(property.key, checked === true) }} />
                  ) : (
                    <Input unstyled aria-label={`${property.key} Property`} className="min-w-0 rounded border border-[var(--tt-border)] bg-transparent p-1" defaultValue={Array.isArray(property.value) ? property.value.join(', ') : String(property.value ?? '')} onBlur={event => { props.onSetProperty?.(property.key, property.type === 'list' ? event.target.value.split(',').map(value => value.trim()).filter(Boolean) : property.type === 'number' && Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : event.target.value) }} />
                  )}
                </Label>
              ))}
              {activeProperties.length === 0 && <span className="text-xs text-[var(--tt-muted)]">No file properties.</span>}
            </div>
            <h3 className="mt-2 mb-1 text-xs">All</h3>
            <div className="grid gap-1">
              {(snapshot.facets?.properties ?? []).map(property => <Button unstyled className="rounded border-0 bg-transparent px-1 py-0.5 text-left text-xs" key={property.key.toLocaleLowerCase()} onClick={() => { props.onSearchChange?.(`[${property.key}]`); props.onRunSearch?.() }} type="button">{property.key} · {String(property.count)} · {property.types.join(', ')}</Button>)}
            </div>
          </section>
          <section aria-label="Note Relationships" className="border-t border-[var(--tt-border)] p-3" hidden={props.view !== 'note-info'}>
            <h2 className="m-0 text-sm">Outline and Relationships</h2>
            <h3 className="mt-2 mb-1 text-xs">Outline</h3>
            <div className="grid gap-1">
              {(snapshot.outline?.headings ?? []).map((heading: VaultHeading) => (
                <Button unstyled className="rounded border-0 bg-transparent px-1 py-0.5 text-left text-xs" key={`${heading.line}-${heading.selector}`} onClick={() => { props.onJumpToLine?.(heading.line) }} type="button">{'·'.repeat(Math.max(1, heading.level))} {heading.text}</Button>
              ))}
              {(snapshot.outline?.headings.length ?? 0) === 0 && <span className="text-xs text-[var(--tt-muted)]">No headings.</span>}
            </div>
            <h3 className="mt-2 mb-1 text-xs">Footnotes</h3>
            {(snapshot.outline?.footnotes ?? []).map(footnote => <Button unstyled className="block w-full rounded border-0 bg-transparent px-1 py-0.5 text-left text-xs" key={`${footnote.line}-${footnote.ordinal}`} onClick={() => { props.onJumpToLine?.(footnote.line) }} type="button">{footnote.content}</Button>)}
            <h3 className="mt-2 mb-1 text-xs">Backlinks</h3>
            {(snapshot.links?.backlinkDetails ?? []).map((link, index) => <Button unstyled className="block w-full rounded border-0 bg-transparent px-1 py-0.5 text-left text-xs" key={`${link.sourcePath}-${String(link.line)}-${String(index)}`} onClick={() => { props.onSelect(link.sourcePath) }} type="button">{link.sourcePath}:{String(link.line)}</Button>)}
            <h3 className="mt-2 mb-1 text-xs">Outgoing Links</h3>
            {(snapshot.links?.outgoingDetails ?? []).map((link, index) => <Button unstyled className="block w-full rounded border-0 bg-transparent px-1 py-0.5 text-left text-xs" disabled={link.resolvedPath === null} key={`${link.authoredTarget}-${String(link.line)}-${String(index)}`} onClick={() => { if (link.resolvedPath !== null) props.onSelect(link.resolvedPath) }} type="button">{link.displayText || link.authoredTarget}</Button>)}
            {(snapshot.links?.unlinkedMentions ?? []).map((mention, index) => <span className="block text-xs text-[var(--tt-muted)]" key={`${mention.sourcePath}-${String(mention.line)}-${String(index)}`}>Mention: {mention.matchedText}</span>)}
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
                  {embed.target.kind === 'note' && <div className="prose text-xs" dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(embed.content) }} />}
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
              {snapshot.entries.filter(entry => entry.kind === 'attachment').map(entry => <Button unstyled className="truncate rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-left text-xs" key={entry.path} onClick={() => { props.onPreviewAttachment?.(entry.path) }} type="button">{entry.path}</Button>)}
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
              {(Object.keys(BUILTIN_TEMPLATES) as Array<keyof typeof BUILTIN_TEMPLATES>).map(name => <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-left text-xs" key={name} onClick={() => { props.onCreateBuiltinTemplate?.(name) }} type="button">{name}</Button>)}
              <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-left text-xs" disabled={snapshot.documentKind !== 'markdown' || snapshot.mode === 'reading'} onClick={() => { props.onInsertCurrentDateTime?.('date') }} type="button">Insert Current Date</Button>
              <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-left text-xs" disabled={snapshot.documentKind !== 'markdown' || snapshot.mode === 'reading'} onClick={() => { props.onInsertCurrentDateTime?.('time') }} type="button">Insert Current Time</Button>
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
                <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-left text-xs" key={workspace.id} onClick={() => { props.onLoadWorkspace?.(workspace.id) }} type="button">Load {workspace.name}</Button>
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
