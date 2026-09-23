import { Button } from '@tockteam/ui/button'
import { Checkbox } from '@tockteam/ui/checkbox'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { useState, type ReactNode } from 'react'
import type { TockTutorRouteViewProps } from './route.tsx'

function graphFolder(path: string): string {
  return path.includes('/') ? path.split('/', 1)[0]! : 'Vault Root'
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

export function NoteGraphPanel(props: Pick<TockTutorRouteViewProps, 'snapshot' | 'onLoadGraph' | 'onOpenGraphNode' | 'onCopyGraphPath' | 'onSettingsChange'> & { localOnly?: boolean }): ReactNode {
  const { snapshot } = props
  const [graphZoom, setGraphZoom] = useState(1)
  const [graphPan, setGraphPan] = useState({ x: 0, y: 0 })
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
  return (
          <section aria-label="Graph View" className="relative h-full min-h-64 min-w-0 overflow-hidden">
            <div aria-label="Graph Toolbar" className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-md border border-[var(--tt-border)] bg-[color-mix(in_srgb,var(--tt-panel)_92%,transparent)] p-1 shadow-lg backdrop-blur-sm">
              <span hidden={props.localOnly} aria-label="Graph Scope" className="flex gap-1" role="group">
                <Button unstyled aria-pressed={snapshot.graphMode === 'global'} className="rounded px-2 py-1 text-xs aria-pressed:bg-[var(--tt-selected)]" onClick={() => { props.onLoadGraph?.('global') }} type="button">Global</Button>
                <Button unstyled aria-pressed={snapshot.graphMode === 'local'} className="rounded px-2 py-1 text-xs aria-pressed:bg-[var(--tt-selected)]" disabled={snapshot.path === null} onClick={() => { props.onLoadGraph?.('local') }} type="button">Local</Button>
              </span>
              <details className="relative">
                <summary aria-label="Graph Settings" className="cursor-pointer list-none rounded px-2 py-1 text-xs hover:bg-[var(--tt-selected)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tt-accent)]">Settings</summary>
                <div aria-label="Graph Settings" className="absolute top-[calc(100%+6px)] right-0 z-20 grid w-64 gap-3 rounded-lg border border-[var(--tt-border)] bg-[var(--tt-panel)] p-3 text-xs shadow-xl">
                  {props.onSettingsChange && (
                  <div className="grid grid-cols-2 gap-2">
                    <Label unstyled className="flex items-center gap-1">Orphans<Checkbox checked={snapshot.settings?.graphIncludeOrphans ?? true} onCheckedChange={checked => { props.onSettingsChange?.({ graphIncludeOrphans: checked === true }) }} /></Label>
                    <Label unstyled className="flex items-center gap-1">Tags<Checkbox checked={snapshot.settings?.graphIncludeTags ?? false} onCheckedChange={checked => { props.onSettingsChange?.({ graphIncludeTags: checked === true }) }} /></Label>
                    <Label unstyled className="flex items-center gap-1">Attachments<Checkbox checked={snapshot.settings?.graphIncludeAttachments ?? false} onCheckedChange={checked => { props.onSettingsChange?.({ graphIncludeAttachments: checked === true }) }} /></Label>
                    <Label unstyled className="flex items-center gap-1">Local Depth<NativeSelect unstyled value={String(snapshot.settings?.graphDepth ?? 2)} onChange={event => { const depth = Number(event.target.value); if (depth === 1 || depth === 2 || depth === 3) props.onSettingsChange?.({ graphDepth: depth }) }}><NativeSelectOption value="1">1</NativeSelectOption><NativeSelectOption value="2">2</NativeSelectOption><NativeSelectOption value="3">3</NativeSelectOption></NativeSelect></Label>
                    <Label unstyled className="col-span-2 grid gap-1">Filter Note Paths<Input unstyled aria-label="Filter Graph Note Paths" className="rounded border border-[var(--tt-border)] bg-transparent p-1" maxLength={1_000} onChange={event => { props.onSettingsChange?.({ graphQuery: event.target.value }) }} type="search" value={snapshot.settings?.graphQuery ?? ''} /></Label>
                    <Label unstyled className="grid gap-1">Group Nodes<NativeSelect unstyled aria-label="Group Graph Nodes" className="rounded border border-[var(--tt-border)] bg-transparent p-1" onChange={event => { props.onSettingsChange?.({ graphGroupBy: event.target.value === 'folder' ? 'folder' : 'none' }) }} value={snapshot.settings?.graphGroupBy ?? 'none'}><NativeSelectOption value="none">None</NativeSelectOption><NativeSelectOption value="folder">Folder</NativeSelectOption></NativeSelect></Label>
                    <Label unstyled className="grid gap-1">Color Nodes<NativeSelect unstyled aria-label="Color Graph Nodes" className="rounded border border-[var(--tt-border)] bg-transparent p-1" onChange={event => { props.onSettingsChange?.({ graphColorBy: event.target.value === 'folder' ? 'folder' : 'none' }) }} value={snapshot.settings?.graphColorBy ?? 'none'}><NativeSelectOption value="none">Default</NativeSelectOption><NativeSelectOption value="folder">Folder</NativeSelectOption></NativeSelect></Label>
                  </div>)}
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
            ) : <span className="absolute inset-0 grid place-items-center text-xs text-[var(--tt-muted)]">{(snapshot.graphLayout?.length ?? 0) > 0 ? 'No graph nodes match this filter.' : snapshot.graph ? 'No graph nodes.' : 'Open Global or Local Graph.'}</span>}
            <details className="absolute bottom-3 left-3 z-10 max-w-[min(22rem,calc(100%-24px))] rounded-md border border-[var(--tt-border)] bg-[color-mix(in_srgb,var(--tt-panel)_92%,transparent)] shadow-lg backdrop-blur-sm">
              <summary className="cursor-pointer list-none px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tt-accent)]">Graph Nodes ({String(graphNodes.length)})</summary>
              <div className="max-h-48 min-w-56 overflow-auto border-t border-[var(--tt-border)] p-2">
                {graphGroups.map(([group, nodes]) => <section aria-label={`Graph Group ${group}`} key={group}><h3 className="m-0 text-xs">{group}</h3><div className="grid gap-1">{(nodes ?? []).map(node => <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-1" key={node.path}><span className="truncate text-xs">{node.path}</span><Button unstyled aria-label={`Open Note ${node.path}`} className="rounded border border-[var(--tt-border)] bg-transparent px-1 py-0.5 text-xs" onClick={() => { props.onOpenGraphNode?.(node.path, 'note') }} type="button">Open</Button>{!props.localOnly && <Button unstyled aria-label={`Open Local Graph ${node.path}`} className="rounded border border-[var(--tt-border)] bg-transparent px-1 py-0.5 text-xs" onClick={() => { props.onOpenGraphNode?.(node.path, 'local') }} type="button">Local</Button>}{props.onCopyGraphPath && <Button unstyled aria-label={`Copy Graph Path ${node.path}`} className="rounded border border-[var(--tt-border)] bg-transparent px-1 py-0.5 text-xs" onClick={() => { props.onCopyGraphPath?.(node.path) }} type="button">Copy</Button>}</div>)}</div></section>)}
                {(graphNodes.length === 0) && <span className="text-xs text-[var(--tt-muted)]">No graph nodes.</span>}
              </div>
            </details>
          </section>
  )
}
