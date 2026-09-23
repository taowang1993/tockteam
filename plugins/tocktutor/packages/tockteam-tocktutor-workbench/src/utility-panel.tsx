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
import { NoteGraphPanel } from './note-graph.tsx'
import { NoteOutlinePanel } from './note-outline.tsx'
import { NoteBacklinks } from './note-backlinks.tsx'
import { VaultProperties } from './vault-properties.tsx'
import { VaultTags } from './vault-tags.tsx'
import { WorkbenchGlyph } from './workbench-glyph.tsx'

export type WorkbenchUtilityView = 'attachments' | 'backlinks' | 'bookmarks' | 'extensions' | 'graph' | 'outline' | 'properties' | 'recovery' | 'tags' | 'tools' | 'web' | 'workspace'

const UTILITY_TITLES: Record<WorkbenchUtilityView, string> = {
  attachments: 'Attachments and Embeds',
  extensions: 'Reviews and Actions',
  graph: 'Graph View',
  backlinks: 'Backlinks',
  bookmarks: 'Bookmarks',
  outline: 'Outline',
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

function snapshotDateLabel(createdAt: number): string {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString(undefined, { day: 'numeric', hour: 'numeric', minute: '2-digit', month: 'short' })
}

function snapshotRevisionLabel(digest: string): string {
  return digest.startsWith('sha256:') ? digest.slice(7, 15) : digest.slice(0, 8)
}

export function WorkbenchUtilities(props: WorkbenchUtilitiesProps): ReactNode {
  const { snapshot } = props
  const open = props.view !== null
  const [rovingSnapshotId, setRovingSnapshotId] = useState<string | null>(null)
  const recoverySnapshots = (snapshot.snapshots ?? []).filter(entry => snapshot.path !== null && entry.path === snapshot.path)
  const selectedSnapshot = snapshot.path !== null
    && snapshot.selectedSnapshot?.snapshot.path === snapshot.path
    ? snapshot.selectedSnapshot
    : null
  const rovingId = recoverySnapshots.some(entry => entry.id === rovingSnapshotId)
    ? rovingSnapshotId
    : selectedSnapshot?.snapshot.id ?? recoverySnapshots[0]?.id ?? null
  const vaultProperties = snapshot.facets?.properties ?? []
  const vaultTags = snapshot.facets?.tags ?? []

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
          <section aria-label="Outline" className="p-3" hidden={props.view !== 'outline'}>
            {props.view === 'outline' && <NoteOutlinePanel snapshot={snapshot} onJumpToLine={props.onJumpToLine} />}
          </section>
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
          <div className="absolute inset-x-0 top-10 bottom-0" hidden={props.view !== 'graph'}>
            <NoteGraphPanel {...props} />
          </div>
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
          <section aria-label="Tags" className="p-3" hidden={props.view !== 'tags'}>
            <VaultTags key={snapshot.vault?.id ?? 'inactive'} tags={vaultTags} onSearch={tag => { props.onOpenSearch?.(); props.onSearchChange?.(`tag:${tag}`); props.onSearchMode?.('query'); props.onRunSearch?.() }} />
          </section>
          <section aria-label="Properties" className="p-3" hidden={props.view !== 'properties'}>
            <VaultProperties key={snapshot.vault?.id ?? 'inactive'} properties={vaultProperties} onSearch={key => { props.onOpenSearch?.(); props.onSearchChange?.(`[${key}]`); props.onRunSearch?.() }} />
          </section>
          <section aria-label="Backlinks" className="border-t border-[var(--tt-border)] p-3" hidden={props.view !== 'backlinks'}>
            <NoteBacklinks links={snapshot.links?.path === snapshot.path ? snapshot.links : null} loading={snapshot.linksLoading === true} onRetry={props.onLoadRelationships} onSelect={props.onSelect} />
          </section>
          <section aria-label="Resolved Embeds" className="p-3" hidden={props.view !== 'attachments'}>
            <h2 className="m-0 text-sm">Resolved Embeds</h2>
            <div className="mt-2 grid gap-2">
              {(snapshot.embeds ?? []).map((embed, index) => (
                <article className="overflow-auto rounded border border-[var(--tt-border)] p-2" key={`${embed.target.path}-${String(index)}`}>
                  <strong className="block truncate text-xs">{embed.target.path}{embed.target.fragment === null ? '' : `#${embed.target.fragment}`}</strong>
                  {embed.target.kind === 'media' && embed.mimeType?.startsWith('image/') && <img alt={embed.target.display ?? embed.target.path} className="mt-1 max-h-48 max-w-full" src={`data:${embed.mimeType};base64,${embed.content}`} />}
                  {embed.target.kind === 'media' && embed.mimeType?.startsWith('audio/') && <audio aria-label={embed.target.display ?? embed.target.path} className="mt-1 w-full" controls src={`data:${embed.mimeType};base64,${embed.content}`} />}
                  {embed.target.kind === 'media' && embed.mimeType?.startsWith('video/') && <video aria-label={embed.target.display ?? embed.target.path} className="mt-1 max-h-48 max-w-full" controls src={`data:${embed.mimeType};base64,${embed.content}`} />}
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
                {snapshot.attachmentPreview.mediaKind === 'audio' && <audio aria-label={snapshot.attachmentPreview.path} className="mt-2 w-full" controls src={`data:${snapshot.attachmentPreview.mimeType};base64,${snapshot.attachmentPreview.dataBase64}`} />}
                {snapshot.attachmentPreview.mediaKind === 'video' && <video aria-label={snapshot.attachmentPreview.path} className="mt-2 max-h-48 max-w-full" controls src={`data:${snapshot.attachmentPreview.mimeType};base64,${snapshot.attachmentPreview.dataBase64}`} />}
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
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-[5px] border border-[var(--tt-border)]" key={pane.id}>
                  <Button
                    unstyled
                    aria-label={`Pane ${String(index + 1)}${pane.activePath === null ? '' : ` ${pane.activePath}`}`}
                    aria-pressed={pane.id === snapshot.focusedPaneId}
                    className="min-w-0 overflow-hidden rounded-l-[4px] border-0 bg-transparent p-1.5 text-left aria-pressed:bg-[var(--tt-selected)] aria-pressed:text-[var(--tt-text)] [&_small]:block [&_small]:truncate [&_small]:text-xs [&_small]:text-[var(--tt-muted)] [&_span]:block [&_span]:truncate"
                    onClick={() => { props.onFocusPane(pane.id) }}
                    title={pane.activePath ?? `Pane ${String(index + 1)}`}
                    type="button"
                  >
                    <span>Pane {String(index + 1)}</span><small>{pane.activePath ?? 'Empty'}</small>
                  </Button>
                  <Button
                    unstyled
                    aria-label={`Close Pane ${String(index + 1)}`}
                    className="flex size-7 items-center justify-center self-start rounded border-0 bg-transparent p-1 text-[var(--tt-muted)] hover:bg-[var(--tt-selected)] hover:text-[var(--tt-text)] disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={snapshot.panes.length <= 1}
                    onClick={() => { props.onClosePane?.(pane.id) }}
                    title={snapshot.panes.length <= 1 ? 'Keep at least one pane' : 'Close Pane'}
                    type="button"
                  ><WorkbenchGlyph kind="close" /></Button>
                </div>
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
