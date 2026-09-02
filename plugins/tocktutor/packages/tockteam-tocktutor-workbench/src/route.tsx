import { Alert } from '@tockteam/ui/alert'
import { Button } from '@tockteam/ui/button'
import { Checkbox } from '@tockteam/ui/checkbox'
import { Dialog, DialogContent, DialogTitle } from '@tockteam/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@tockteam/ui/empty'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@tockteam/ui/popover'
import { Textarea } from '@tockteam/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@tockteam/ui/tooltip'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FileText,
  Folder,
  MessageSquare,
  Music,
  PanelLeft,
  PanelRight,
  PanelTop,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { TockTutorRouteOwnerProps } from '@tockteam/desktop/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

import { TOCKTUTOR_ASSISTANT_PANEL_SLOT } from './assistant-panel.ts'
import { ExecutableBaseView, type ExecutableBaseCopyRequest, type ExecutableBaseExportRequest } from './base-executable-view.tsx'
import { executableBasePropertyIdentity, type ExecutableBaseFrontmatterEditRequest } from './base-edit.ts'
import type { BaseHydratedFile } from './base-query.ts'
import { CanvasBoard } from './canvas-board.tsx'
import type { CanvasChange } from './canvas-change.ts'
import {
  TOCKTUTOR_NATIVE_ACTIONS_SLOT,
  type TockTutorNativeActionsDispatchEvent,
  type TockTutorNativeActionsDispatchResult,
  type TockTutorNativeActionsOwnerProps,
} from './native-actions.ts'
import { TOCKTUTOR_REVIEW_PANEL_SLOT } from './review-panel.ts'
import { TOCKTUTOR_WEB_VIEWER_PANEL_SLOT } from './web-viewer-panel.ts'
import { LivePreviewView, RichReadingView } from './editor-surface.tsx'
import { SourceEditor } from './source-editor.tsx'
import { WorkbenchUtilities } from './utility-panel.tsx'
import { WorkbenchGlyph } from './workbench-glyph.tsx'
import {
  parseCanvasDocument,
  updateCanvasNodePosition,
} from './canvas.ts'
import {
  projectLivePreview,
  replaceLivePreviewLine,
} from './live-preview.ts'
import { renderMarkdownHtml } from './rich-markdown.ts'
import { parseFrontmatterProperties, setFrontmatterProperty, type PropertyValue } from './properties.ts'
import { addBookmark, loadBookmarks, saveBookmarks, type Bookmark as TockTutorBookmark } from './bookmarks.ts'
import { layoutGraph, projectGraph, type GraphPosition } from './graph.ts'
import { BUILTIN_TEMPLATES, buildCaptureNote, buildJournalNote, expandTemplate, uniqueNotePath } from './capture.ts'
import { buildOrganizationProposal, type OrganizationProposal } from './organize.ts'
import { convertMarkdownFormats, extractSelectionToNote } from './composer.ts'
import { appendAttachmentMarkdown, attachmentTargetPath } from './attachments.ts'
import { collectEmbedTargets, resolveEmbedGraph, type EmbedTarget } from './embeds.ts'
import {
  createNamedWorkspace,
  loadTockTutorSettings,
  loadWorkbenchState,
  saveTockTutorSettings,
  saveWorkbenchState,
  type KeyValueStorage,
  type NamedWorkspace,
  type TockTutorSettings,
} from './settings.ts'
import {
  applyEditorCommand,
  resolvePlatformEditorCommand,
  type EditorCommandId,
} from './editor-commands.ts'
import {
  editorStatusLabel,
  resolveEditorShortcut,
  toggleMarkdownTask,
  type EditorStatus,
} from './markdown.ts'
import {
  addPaneGroup,
  closeNoteTab,
  createWorkbenchSession,
  focusPaneGroup,
  isSafeVaultRelativePath,
  markTabDirty,
  MAX_NOTE_TABS,
  MAX_PANE_GROUPS,
  moveNoteTab,
  openNoteTab,
  setActiveNoteTab,
  setNoteTabMode,
  setTabPinned,
  hydrateWorkbenchSession,
  type WorkbenchSession,
} from './session.ts'
import { isNoteVaultChangeEvent, type NoteVaultEventRemote } from './vault-events.ts'
import type {
  ActiveVaultResult,
  AttachmentPreviewResult,
  CreateDocumentRequest,
  CreateManagedVaultRequest,
  CaptureSnapshotRequest,
  DraftMutationResult,
  DraftRequest,
  DraftResult,
  ListSnapshotsRequest,
  ListTrashRequest,
  ListTreeRequest,
  NoteVaultChangeEvent,
  OpenDocumentResult,
  RecentVaultInfo,
  RecentVaultListResult,
  ReadSnapshotRequest,
  RecentVaultRequest,
  RestoreSnapshotOverwriteRequest,
  RestoreSnapshotRequest,
  RestoreTrashRequest,
  SaveDocumentRequest,
  SaveDraftRequest,
  SnapshotContentResult,
  SnapshotInfo,
  SnapshotMutationResult,
  StoreAttachmentRequest,
  StoreAttachmentResult,
  TrashEntryInfo,
  TrashEntryRequest,
  VaultFacetsRequest,
  VaultFacetsResult,
  VaultGenerationRequest,
  VaultGraphRequest,
  VaultGraphResult,
  VaultHeading,
  VaultLinksRequest,
  VaultLinksResult,
  VaultOutlineRequest,
  VaultOutlineResult,
  VaultReference,
  VaultSearchMatch,
  VaultSearchRequest,
  VaultSearchResult,
  VaultTreeEntry,
  VaultTreePage,
  WriteDocumentResult,
} from './types.ts'

const ROUTE_PREFIX = '/tocktutor'
const TREE_LIMIT = 200
const DEFAULT_SIDEBAR_WIDTH = 280
const COLLAPSED_TITLEBAR_SIDEBAR_WIDTH = 84
const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 480
const DEFAULT_ASSISTANT_PANEL_WIDTH = 300
const MIN_ASSISTANT_PANEL_WIDTH = 240
const MAX_ASSISTANT_PANEL_WIDTH = 720
const clampAssistantPanelWidth = (width: number): number => Math.min(
  MAX_ASSISTANT_PANEL_WIDTH,
  Math.max(MIN_ASSISTANT_PANEL_WIDTH, width),
)
export const MAX_ROUTE_SOURCE_BYTES = 2_000_000

export interface WorkbenchRouteRemote extends NoteVaultEventRemote {
  tocktutorWorkbench: {
    currentVault(signal?: AbortSignal): Promise<RemoteResult<ActiveVaultResult>>
    createManagedVault(request: CreateManagedVaultRequest, signal?: AbortSignal): Promise<RemoteResult<VaultReference>>
    listRecentVaults(signal?: AbortSignal): Promise<RemoteResult<RecentVaultListResult>>
    activateRecentVault(request: RecentVaultRequest, signal?: AbortSignal): Promise<RemoteResult<VaultReference>>
    removeRecentVault(request: RecentVaultRequest, signal?: AbortSignal): Promise<RemoteResult<RecentVaultListResult>>
    openSandboxVault(request: VaultGenerationRequest, signal?: AbortSignal): Promise<RemoteResult<VaultReference>>
    listTree(request: ListTreeRequest, signal?: AbortSignal): Promise<RemoteResult<VaultTreePage>>
    createDocument(
      request: CreateDocumentRequest,
      signal?: AbortSignal,
    ): Promise<RemoteResult<WriteDocumentResult>>
    openDocument(
      path: string,
      expectedVault: VaultReference,
      signal?: AbortSignal,
    ): Promise<RemoteResult<OpenDocumentResult>>
    saveDocument(
      request: SaveDocumentRequest,
      signal?: AbortSignal,
    ): Promise<RemoteResult<WriteDocumentResult>>
    readDraft(request: DraftRequest, signal?: AbortSignal): Promise<RemoteResult<DraftResult>>
    saveDraft(request: SaveDraftRequest, signal?: AbortSignal): Promise<RemoteResult<DraftMutationResult>>
    clearDraft(request: DraftRequest, signal?: AbortSignal): Promise<RemoteResult<DraftMutationResult>>
    captureSnapshot(request: CaptureSnapshotRequest, signal?: AbortSignal): Promise<RemoteResult<SnapshotMutationResult>>
    clearSnapshots(request: ListSnapshotsRequest, signal?: AbortSignal): Promise<RemoteResult<SnapshotMutationResult>>
    listSnapshots(request: ListSnapshotsRequest, signal?: AbortSignal): Promise<RemoteResult<{ generation: number; snapshots: SnapshotInfo[] }>>
    readSnapshot(request: ReadSnapshotRequest, signal?: AbortSignal): Promise<RemoteResult<SnapshotContentResult>>
    restoreSnapshot(request: RestoreSnapshotOverwriteRequest, signal?: AbortSignal): Promise<RemoteResult<WriteDocumentResult>>
    restoreSnapshotAsNew(request: RestoreSnapshotRequest, signal?: AbortSignal): Promise<RemoteResult<WriteDocumentResult>>
    trashEntry(request: TrashEntryRequest, signal?: AbortSignal): Promise<RemoteResult<unknown>>
    listTrash(request: ListTrashRequest, signal?: AbortSignal): Promise<RemoteResult<{ entries: TrashEntryInfo[]; generation: number }>>
    restoreTrash(request: RestoreTrashRequest, signal?: AbortSignal): Promise<RemoteResult<unknown>>
    search(request: VaultSearchRequest, signal?: AbortSignal): Promise<RemoteResult<VaultSearchResult>>
    outline(request: VaultOutlineRequest, signal?: AbortSignal): Promise<RemoteResult<VaultOutlineResult>>
    links(request: VaultLinksRequest, signal?: AbortSignal): Promise<RemoteResult<VaultLinksResult>>
    facets(request: VaultFacetsRequest, signal?: AbortSignal): Promise<RemoteResult<VaultFacetsResult>>
    previewAttachment(path: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<AttachmentPreviewResult>>
    storeAttachment(request: StoreAttachmentRequest, signal?: AbortSignal): Promise<RemoteResult<StoreAttachmentResult>>
    graph(request: VaultGraphRequest, signal?: AbortSignal): Promise<RemoteResult<VaultGraphResult>>
  }
}

export type RoutePhase = 'loading' | 'inactive' | 'ready' | 'error'
export type RouteEditorMode = 'source' | 'live-preview' | 'reading'
export type RouteDocumentKind = 'markdown' | 'canvas' | 'base'

export interface RouteTabSummary {
  dirty: boolean
  mode?: RouteEditorMode
  path: string
  pinned?: boolean
}

export interface RoutePaneSummary {
  activePath: string | null
  id: string
  tabs: readonly RouteTabSummary[]
}

export interface ResolvedEmbed {
  content: string
  depth?: number
  mimeType?: string
  parentPath?: string
  target: EmbedTarget
}

export interface WorkbenchRouteSnapshot {
  attachmentPreview?: AttachmentPreviewResult | null
  baseFiles?: readonly BaseHydratedFile[]
  bookmarks?: readonly TockTutorBookmark[]
  canGoBack?: boolean
  canGoForward?: boolean
  commandPaletteOpen?: boolean
  dispatchDialog: 'capture' | 'new' | null
  documentKind: RouteDocumentKind | null
  draftRecovered?: boolean
  embeds?: readonly ResolvedEmbed[]
  entries: readonly VaultTreeEntry[]
  facets?: VaultFacetsResult | null
  focusedPaneId: string
  focusMode?: boolean
  graph?: VaultGraphResult | null
  graphLayout?: readonly GraphPosition[]
  graphMode?: 'global' | 'local'
  links?: VaultLinksResult | null
  message: string
  mode: RouteEditorMode
  organizationProposal?: OrganizationProposal | null
  outline?: VaultOutlineResult | null
  path: string | null
  phase: RoutePhase
  recentVaults?: readonly RecentVaultInfo[]
  recentlyClosed?: readonly RouteTabSummary[]
  recoveryOpen?: boolean
  revision: string | null
  saveStatus: EditorStatus
  searchLoading?: boolean
  searchMatches?: readonly VaultSearchMatch[]
  searchMode?: 'query' | 'related'
  searchOpen: boolean
  searchQuery: string
  selectedSnapshot?: SnapshotContentResult | null
  selectionEnd?: number
  selectionStart?: number
  settings?: TockTutorSettings
  snapshots?: readonly SnapshotInfo[]
  source: string
  trash?: readonly TrashEntryInfo[]
  panes: readonly RoutePaneSummary[]
  vault: VaultReference | null
  warnings: readonly string[]
  workspaces?: readonly NamedWorkspace[]
}

interface PendingNativeDispatch {
  kind: 'capture' | 'new'
  operationId: string
  resolve(result: TockTutorNativeActionsDispatchResult): void
  revision: number
  submitting: boolean
  vault: VaultReference
}

export interface NativeDispatchDraft {
  path?: string
  text?: string
  title?: string
}

class RemoteCallError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

function remoteValue<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw new RemoteCallError(result.error.code, result.error.message)
}

const ROUTE_FLUSH_TIMEOUT_MS = 1_000
const FINAL_DRAFT_ATTEMPTS = 3

type TrackedRouteFlushOutcome =
  | { kind: 'fulfilled' }
  | { error: unknown; kind: 'rejected' }

interface TrackedRouteFlush {
  outcome: TrackedRouteFlushOutcome | null
  promise: Promise<void>
}

const pendingTockTutorRouteFlushes = new Set<TrackedRouteFlush>()

export class TockTutorRouteFlushTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`TockTutor route cleanup timed out after ${timeoutMs}ms.`)
    this.name = 'TockTutorRouteFlushTimeoutError'
  }
}

/** Track async route cleanup until its owning client observes the outcome. */
export function trackTockTutorRouteFlush(flush: PromiseLike<void> | void): void {
  const tracked: TrackedRouteFlush = { outcome: null, promise: Promise.resolve(flush) }
  pendingTockTutorRouteFlushes.add(tracked)
  void tracked.promise.then(
    () => { tracked.outcome = { kind: 'fulfilled' } },
    error => { tracked.outcome = { error, kind: 'rejected' } },
  )
}

/** Await route cleanup without allowing a stuck transport to block unload forever. */
export async function waitForTockTutorRouteFlushes(timeoutMs = ROUTE_FLUSH_TIMEOUT_MS): Promise<void> {
  const boundedTimeout = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : ROUTE_FLUSH_TIMEOUT_MS
  const deadline = Date.now() + boundedTimeout
  while (pendingTockTutorRouteFlushes.size > 0) {
    const pending = [...pendingTockTutorRouteFlushes]
    const settled = pending.every(flush => flush.outcome !== null)
    if (settled) {
      const failure = pending.find(flush => flush.outcome?.kind === 'rejected')?.outcome
      for (const flush of pending) pendingTockTutorRouteFlushes.delete(flush)
      if (failure?.kind === 'rejected') throw failure.error
      continue
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new TockTutorRouteFlushTimeoutError(boundedTimeout)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        Promise.all(pending.map(flush => flush.promise.then(
          () => ({ kind: 'fulfilled' as const }),
          error => ({ error, kind: 'rejected' as const }),
        ))).then(outcomes => ({ kind: 'settled' as const, outcomes })),
        new Promise<{ kind: 'timeout' }>(resolve => {
          timer = setTimeout(() => { resolve({ kind: 'timeout' }) }, remaining)
        }),
      ])
      if (result.kind === 'timeout') throw new TockTutorRouteFlushTimeoutError(boundedTimeout)
      const failure = result.outcomes.find(outcome => outcome.kind === 'rejected')
      for (const flush of pending) pendingTockTutorRouteFlushes.delete(flush)
      if (failure?.kind === 'rejected') throw failure.error
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }
}

function sameVault(left: VaultReference | null, right: VaultReference): boolean {
  return left !== null && left.id === right.id && left.generation === right.generation
}

function protocolFileTarget(file: string): { path: string; fragment?: string } | null {
  const marker = file.indexOf('#')
  const path = marker < 0 ? file : file.slice(0, marker)
  const fragment = marker < 0 ? undefined : file.slice(marker)
  if (!isSafeVaultRelativePath(path) || (fragment !== undefined && (fragment.length < 2 || fragment.length > 512))) return null
  return fragment === undefined ? { path } : { fragment, path }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function targetLine(source: string, fragment: string): number | null {
  const block = fragment.startsWith('#^') ? fragment.slice(2) : ''
  const heading = fragment.startsWith('#') && !fragment.startsWith('#^') ? fragment.slice(1).trim() : ''
  const lines = source.split(/\n/u)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.replace(/\r$/u, '')
    if (block !== '' && new RegExp(`(?:^|\\s)\\^${escapeRegex(block)}(?:$|\\s)`, 'u').test(line)) return index + 1
    if (heading !== '' && new RegExp(`^#{1,6}\\s+${escapeRegex(heading)}\\s*$`, 'iu').test(line)) return index + 1
  }
  return null
}

function validRecentVaults(value: RecentVaultListResult): boolean {
  return Number.isSafeInteger(value?.generation)
    && value.generation >= 0
    && Array.isArray(value.vaults)
    && value.vaults.length <= 20
    && value.vaults.every(vault => /^vault:[0-9a-f]{64}$/u.test(vault.id)
      && Number.isFinite(vault.lastOpenedAt)
      && vault.lastOpenedAt >= 0)
}

function validSearchResult(value: VaultSearchResult, vault: VaultReference): boolean {
  return value?.generation === vault.generation
    && typeof value.query === 'string'
    && Array.isArray(value.matches)
    && value.matches.length <= 100
    && value.matches.every(match => isSafeVaultRelativePath(match.path)
      && typeof match.preview === 'string'
      && match.preview.length <= 4_096
      && (match.line === null || Number.isSafeInteger(match.line)))
}

function documentKind(path: string): RouteDocumentKind | null {
  if (!isSafeVaultRelativePath(path)) return null
  if (/\.(?:markdown|md)$/iu.test(path)) return 'markdown'
  if (/\.canvas$/iu.test(path)) return 'canvas'
  if (/\.base$/iu.test(path)) return 'base'
  return null
}

function supportedDocument(path: string): boolean {
  return documentKind(path) !== null
}

function routeModeFromSession(mode: 'reading' | 'source' | 'wysiwyg'): RouteEditorMode {
  return mode === 'wysiwyg' ? 'live-preview' : mode
}

function sessionModeFromRoute(mode: RouteEditorMode): 'reading' | 'source' | 'wysiwyg' {
  return mode === 'live-preview' ? 'wysiwyg' : mode
}

function boundedSource(source: string): boolean {
  return new TextEncoder().encode(source).byteLength <= MAX_ROUTE_SOURCE_BYTES
}

function embedTargetSources(source: string): readonly string[] {
  try { return Object.freeze(collectEmbedTargets(source).map(target => target.source)) } catch { return Object.freeze([]) }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function defaultWorkbenchStorage(): KeyValueStorage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
  } catch {
    return null
  }
}

export function pathFromTockTutorLocation(pathname: string): string | null {
  if (pathname === ROUTE_PREFIX || pathname === `${ROUTE_PREFIX}/`) return null
  if (!pathname.startsWith(`${ROUTE_PREFIX}/`)) return null
  try {
    const path = pathname.slice(ROUTE_PREFIX.length + 1)
      .split('/')
      .map(segment => decodeURIComponent(segment))
      .join('/')
    return supportedDocument(path) ? path : null
  } catch {
    return null
  }
}

function routeForPath(path: string): string {
  return `${ROUTE_PREFIX}/${path.split('/').map(segment => encodeURIComponent(segment)).join('/')}`
}

function initialSnapshot(): WorkbenchRouteSnapshot {
  return Object.freeze({
    attachmentPreview: null,
    baseFiles: Object.freeze([]),
    bookmarks: Object.freeze([]),
    canGoBack: false,
    canGoForward: false,
    commandPaletteOpen: false,
    dispatchDialog: null,
    documentKind: null,
    draftRecovered: false,
    embeds: Object.freeze([]),
    entries: Object.freeze([]),
    facets: null,
    focusedPaneId: 'pane-1',
    focusMode: false,
    graph: null,
    graphLayout: Object.freeze([]),
    graphMode: 'global',
    links: null,
    message: 'Loading the active vault.',
    outline: null,
    mode: 'source',
    organizationProposal: null,
    path: null,
    phase: 'loading',
    recentVaults: Object.freeze([]),
    recentlyClosed: Object.freeze([]),
    recoveryOpen: false,
    revision: null,
    saveStatus: 'saved',
    searchLoading: false,
    searchMatches: Object.freeze([]),
    searchMode: 'query',
    searchOpen: false,
    searchQuery: '',
    selectedSnapshot: null,
    selectionEnd: 0,
    selectionStart: 0,
    snapshots: Object.freeze([]),
    source: '',
    trash: Object.freeze([]),
    panes: Object.freeze([Object.freeze({
      activePath: null,
      id: 'pane-1',
      tabs: Object.freeze([]),
    })]),
    vault: null,
    warnings: Object.freeze([]),
    workspaces: Object.freeze([]),
  })
}

/** Bounded route state machine shared by the React contribution and focused tests. */
export class WorkbenchRouteController {
  private snapshot = initialSnapshot()
  private readonly listeners = new Set<() => void>()
  private disposal: Promise<void> | null = null
  private vaultGeneration = 0
  private shellSession: WorkbenchSession = createWorkbenchSession(ROUTE_PREFIX, null, 'pane-1')
  private readonly recentlyClosed: RouteTabSummary[] = []
  private readonly historyBack: string[] = []
  private readonly historyForward: string[] = []
  private bookmarks: TockTutorBookmark[] = []
  private workspaces: NamedWorkspace[] = []
  private operation = 0
  private embedOperation = 0
  private embedTargets: readonly string[] = Object.freeze([])
  private dispatchRevision = 0
  private operationAbort: AbortController | null = null
  private embedAbort: AbortController | null = null
  private saveAbort: AbortController | null = null
  private saving: Promise<boolean> | null = null
  private draftAbort: AbortController | null = null
  private draftFlush: Promise<void> | null = null
  private draftTimer: ReturnType<typeof setTimeout> | null = null
  private eventDispose: (() => void) | null = null
  private pendingDispatch: PendingNativeDispatch | null = null
  private pathname = ROUTE_PREFIX
  private started = false
  private disposed = false

  constructor(
    private readonly remote: WorkbenchRouteRemote,
    private readonly navigate: TockTutorRouteOwnerProps['navigate'],
    private readonly now: () => Date = () => new Date(),
    private readonly storage: KeyValueStorage | null = defaultWorkbenchStorage(),
  ) {}

  getSnapshot = (): WorkbenchRouteSnapshot => this.snapshot

  async handleDispatch(
    event: TockTutorNativeActionsDispatchEvent,
  ): Promise<TockTutorNativeActionsDispatchResult> {
    const vault = this.snapshot.vault
    if (this.disposed || this.snapshot.phase !== 'ready' || vault === null) return 'stale'
    const revision = this.dispatchRevision
    if (event.operationId.length === 0 || event.operationId.length > 256
      || /[\u0000-\u001f\u007f]/u.test(event.operationId)) return 'failed'
    if (event.kind === 'quick-action') {
      if (event.action === 'new' || event.action === 'capture') {
        return await this.openDispatchDialog(event.action, event.operationId, revision, vault)
      }
      if (event.action === 'search') {
        this.openSearch('')
        return 'handled'
      }
    }
    const request = event.kind === 'protocol'
      ? event.request
      : event.action === 'daily' ? { action: 'daily' as const } : undefined
    if (request === undefined) return 'failed'
    if (request.action === 'choose-vault' || request.vault !== undefined || request.clipboard === true || request.paneType === 'window') return 'failed'
    if (request.vaultId !== undefined
      && (!/^vault:[0-9a-f]{64}$/u.test(request.vaultId)
        || request.vaultGeneration !== vault.generation
        || request.vaultId !== vault.id)) return 'stale'
    if (request.action === 'search') {
      if (request.query !== undefined && request.query.length > 1_000) return 'failed'
      this.openSearch(request.query ?? '')
      return 'handled'
    }
    if (request.paneType === 'split' && !await this.prepareDispatchPane()) return 'failed'
    if (request.action === 'open') {
      if (request.file === undefined) {
        if (this.snapshot.saveStatus !== 'saved' && !await this.save()) return 'failed'
        if (!this.dispatchCurrent(revision, vault)) return 'stale'
        this.navigate(ROUTE_PREFIX)
        return 'handled'
      }
      const target = protocolFileTarget(request.file)
      if (target === null) return 'failed'
      const opened = await this.select(target.path, true, revision)
      if (!this.dispatchCurrent(revision, vault)) return 'stale'
      if (!opened) return 'failed'
      if (target.fragment !== undefined) {
        const line = targetLine(this.snapshot.source, target.fragment)
        if (line !== null) this.jumpToLine(line)
      }
      return 'handled'
    }
    if (request.action === 'daily') {
      const journal = buildJournalNote({
        folder: this.snapshot.settings?.journalFolder ?? 'Journals',
        now: this.now(),
      })
      const path = journal.path
      const exists = this.snapshot.path === path || this.snapshot.entries.some(entry => entry.path === path)
      if (exists && request.ifExists === undefined) {
        if (request.content !== undefined) return 'failed'
        if (request.silent === true) return 'handled'
        const opened = await this.select(path, true, revision)
        if (!this.dispatchCurrent(revision, vault)) return 'stale'
        return opened ? 'handled' : 'failed'
      }
      return await this.createDispatchedDocument(
        path,
        request.content ?? journal.content,
        request.silent === true,
        revision,
        vault,
        request.ifExists,
      )
    }
    if (request.action === 'unique') {
      const existing = new Set(this.snapshot.entries.filter(entry => entry.kind === 'document').map(entry => entry.path))
      if (this.snapshot.path !== null) existing.add(this.snapshot.path)
      return await this.createDispatchedDocument(
        uniqueNotePath(this.now(), existing),
        request.content ?? '',
        request.silent === true,
        revision,
        vault,
      )
    }
    if (request.action !== 'new') return 'failed'
    const path = request.file ?? (request.name === undefined
      ? undefined
      : /\.md$/iu.test(request.name) ? request.name : `${request.name}.md`)
    if (path === undefined || !isSafeVaultRelativePath(path) || !/\.md$/iu.test(path)) return 'failed'
    return await this.createDispatchedDocument(
      path,
      request.content ?? '',
      request.silent === true,
      revision,
      vault,
      request.ifExists,
    )
  }

  private async prepareDispatchPane(): Promise<boolean> {
    if (this.snapshot.panes.length >= MAX_PANE_GROUPS) return false
    if (this.snapshot.saveStatus !== 'saved' && !await this.save()) return false
    const used = new Set(this.snapshot.panes.map(pane => pane.id))
    const id = Array.from({ length: MAX_PANE_GROUPS }, (_, index) => `pane-${String(index + 1)}`)
      .find(candidate => !used.has(candidate))
    if (id === undefined) return false
    this.shellSession = addPaneGroup(this.shellSession, id).session
    this.syncShell()
    return true
  }

  private async createDispatchedDocument(
    path: string,
    content: string,
    silent: boolean,
    revision: number,
    vault: VaultReference,
    ifExists?: 'prepend' | 'append' | 'overwrite',
  ): Promise<TockTutorNativeActionsDispatchResult> {
    if (!isSafeVaultRelativePath(path) || !/\.md$/iu.test(path) || !boundedSource(content)) return 'failed'
    const previousPath = this.snapshot.path
    if (this.snapshot.saveStatus !== 'saved' && !await this.save()) return 'failed'
    if (!this.dispatchCurrent(revision, vault)) return 'stale'
    try {
      let result: WriteDocumentResult
      let operation = 'created'
      if (ifExists !== undefined) {
        const existingResult = await this.remote.tocktutorWorkbench.openDocument(path, vault)
        let existing: OpenDocumentResult | null = null
        try { existing = remoteValue(existingResult) } catch (error) {
          if (!(error instanceof RemoteCallError) || error.code !== 'not-found') throw error
        }
        if (existing !== null) {
          if (existing.generation !== vault.generation || existing.path !== path) return 'stale'
          const merged = ifExists === 'overwrite' ? content
            : content === '' ? existing.content
              : ifExists === 'prepend' ? `${content}${content.endsWith('\n') || existing.content.startsWith('\n') ? '' : '\n'}${existing.content}`
                : `${existing.content}${existing.content.endsWith('\n') || content.startsWith('\n') ? '' : '\n'}${content}`
          if (!boundedSource(merged)) return 'failed'
          result = remoteValue(await this.remote.tocktutorWorkbench.saveDocument({
            content: merged,
            expectedRevision: existing.revision,
            expectedVault: vault,
            path,
          }))
          operation = 'updated'
          content = merged
        } else {
          result = remoteValue(await this.remote.tocktutorWorkbench.createDocument({ content, expectedVault: vault, path }))
        }
      } else {
        result = remoteValue(await this.remote.tocktutorWorkbench.createDocument({ content, expectedVault: vault, path }))
      }
      if (!this.dispatchCurrent(revision, vault)) return 'stale'
      if (result.generation !== vault.generation || result.path !== path
        || (operation === 'created' ? result.status !== 'created' : result.status !== 'saved')) return 'failed'
      if (silent) return 'handled'
      this.update({
        documentKind: 'markdown',
        message: `${path} ${operation}.`,
        mode: 'source',
        path,
        revision: result.revision,
        saveStatus: 'saved',
        source: content,
      })
      this.recordOpen(path, true, previousPath)
      this.navigate(routeForPath(path))
      return 'handled'
    } catch {
      return this.dispatchCurrent(revision, vault) ? 'failed' : 'stale'
    }
  }

  private openDispatchDialog(
    kind: 'capture' | 'new',
    operationId: string,
    revision: number,
    vault: VaultReference,
  ): Promise<TockTutorNativeActionsDispatchResult> {
    this.settlePendingDispatch('stale')
    this.update({ dispatchDialog: kind })
    return new Promise(resolve => {
      this.pendingDispatch = { kind, operationId, resolve, revision, submitting: false, vault }
    })
  }

  async submitDispatchDialog(draft: NativeDispatchDraft): Promise<void> {
    const pending = this.pendingDispatch
    if (pending === null || pending.submitting) return
    pending.submitting = true
    let path: string
    let content: string
    if (pending.kind === 'new') {
      path = draft.path?.trim() ?? ''
      content = ''
    } else {
      const title = draft.title?.trim() ?? ''
      const text = draft.text ?? ''
      if (title.length === 0 || title.length > 200 || text.length > 100_000) {
        this.settlePendingDispatch('failed')
        return
      }
      try {
        const capture = buildCaptureNote({
          body: text,
          existing: new Set(this.snapshot.entries.filter(entry => entry.kind === 'document').map(entry => entry.path)),
          now: this.now(),
          title,
        })
        path = capture.path
        content = capture.content
      } catch {
        this.settlePendingDispatch('failed')
        return
      }
    }
    const result = await this.createDispatchedDocument(
      path,
      content,
      false,
      pending.revision,
      pending.vault,
    )
    if (this.pendingDispatch === pending) this.settlePendingDispatch(result)
  }

  cancelDispatchDialog(): void {
    this.settlePendingDispatch('failed')
  }

  setSearchQuery(query: string): void {
    if (query.length <= 1_000) this.update({ searchQuery: query })
  }

  closeSearch(): void {
    this.update({ searchLoading: false, searchMatches: Object.freeze([]), searchOpen: false, searchQuery: '' })
  }

  openSearch(query: string): void {
    this.update({ searchMatches: Object.freeze([]), searchOpen: true, searchQuery: query })
  }

  setSearchMode(mode: 'query' | 'related'): void {
    this.update({ searchMode: mode })
  }

  async runSearch(): Promise<boolean> {
    const vault = this.snapshot.vault
    const query = this.snapshot.searchQuery.trim()
    if (vault === null || query.length === 0 || query.length > 1_000) {
      this.update({ searchMatches: Object.freeze([]) })
      return false
    }
    const mode = this.snapshot.searchMode ?? 'query'
    const operation = this.nextOperation()
    this.update({ searchLoading: true })
    try {
      const result = remoteValue(await this.remote.tocktutorWorkbench.search({
        expectedVault: vault,
        limit: 100,
        mode,
        query,
      }, operation.signal))
      if (!this.current(operation.id, vault) || !validSearchResult(result, vault)) return false
      this.update({
        message: result.truncated ? 'Search returned a bounded partial result.' : `${String(result.matches.length)} search results.`,
        searchLoading: false,
        searchMatches: Object.freeze(result.matches.map(match => Object.freeze({ ...match }))),
      })
      return true
    } catch {
      if (this.current(operation.id, vault) && !operation.signal.aborted) {
        this.update({ message: 'Search could not be completed.', searchLoading: false })
      }
      return false
    }
  }

  async loadFacets(): Promise<boolean> {
    const vault = this.snapshot.vault
    if (vault === null) return false
    const operation = this.nextOperation()
    try {
      const facets = remoteValue(await this.remote.tocktutorWorkbench.facets({ expectedVault: vault, limit: 1_000 }, operation.signal))
      if (!this.current(operation.id, vault)
        || facets.generation !== vault.generation
        || !Array.isArray(facets.tags)
        || !Array.isArray(facets.properties)
        || facets.tags.length > 1_000
        || facets.properties.length > 1_000) return false
      this.update({ facets })
      return true
    } catch {
      return false
    }
  }

  async loadGraph(mode: 'global' | 'local'): Promise<boolean> {
    const vault = this.snapshot.vault
    if (vault === null || (mode === 'local' && this.snapshot.path === null)) return false
    const operation = this.nextOperation()
    try {
      const graph = remoteValue(await this.remote.tocktutorWorkbench.graph({
        ...(mode === 'local' ? { depth: this.snapshot.settings?.graphDepth ?? 2 } : {}),
        direction: 'both',
        expectedVault: vault,
        includeAttachments: this.snapshot.settings?.graphIncludeAttachments ?? false,
        includeTags: this.snapshot.settings?.graphIncludeTags ?? false,
        limit: 180,
        ...(mode === 'local' && this.snapshot.path !== null ? { path: this.snapshot.path } : {}),
        scope: mode,
      }, operation.signal))
      if (!this.current(operation.id, vault)
        || graph.generation !== vault.generation
        || !Array.isArray(graph.nodes)
        || !Array.isArray(graph.edges)) return false
      const projected = projectGraph(graph, { includeOrphans: this.snapshot.settings?.graphIncludeOrphans ?? true, query: '' })
      const graphLayout = layoutGraph(projected, {
        centerForce: 0.1,
        iterations: 32,
        linkDistance: 120,
        linkForce: 0.08,
        repelForce: 1_800,
      })
      this.update({ graph, graphLayout: Object.freeze(graphLayout.map(node => Object.freeze(node))), graphMode: mode })
      return true
    } catch {
      return false
    }
  }

  async openGraphNode(path: string, mode: 'local' | 'note'): Promise<boolean> {
    if (!await this.select(path)) return false
    return mode === 'note' ? true : await this.loadGraph('local')
  }

  async openSmartView(kind: 'recent' | 'tasks' | 'journals' | 'favorites' | 'collections' | 'tags'): Promise<boolean> {
    this.openSearch('')
    if (kind === 'recent') {
      const matches: VaultSearchMatch[] = this.snapshot.entries
        .filter((entry): entry is Extract<VaultTreeEntry, { kind: 'document' }> => entry.kind === 'document' && /\.(?:markdown|md)$/iu.test(entry.path))
        .toSorted((left, right) => right.modifiedAt - left.modifiedAt || left.path.localeCompare(right.path))
        .slice(0, 100)
        .map(entry => ({ kind: 'path', line: null, path: entry.path, preview: 'Recently modified note.' }))
      this.update({ searchMatches: Object.freeze(matches) })
      return true
    }
    if (kind === 'tags') return await this.loadFacets()
    const query = kind === 'tasks' ? 'task:todo'
      : kind === 'journals' ? 'path:Journals'
        : kind === 'favorites' ? '[favorite:true]'
          : '[kind:collection]'
    this.setSearchQuery(query)
    this.setSearchMode('query')
    return await this.runSearch()
  }

  async loadRelationships(): Promise<boolean> {
    const vault = this.snapshot.vault
    const path = this.snapshot.path
    if (vault === null || path === null || this.snapshot.documentKind !== 'markdown') return false
    const operation = this.nextOperation()
    try {
      const [outlineResult, linksResult] = await Promise.all([
        this.remote.tocktutorWorkbench.outline({ expectedVault: vault, includeFootnotes: true, path }, operation.signal),
        this.remote.tocktutorWorkbench.links({ expectedVault: vault, includeUnlinked: true, path }, operation.signal),
      ])
      const outline = remoteValue(outlineResult)
      const links = remoteValue(linksResult)
      if (!this.current(operation.id, vault)
        || this.snapshot.path !== path
        || outline.generation !== vault.generation
        || links.generation !== vault.generation
        || outline.path !== path
        || links.path !== path
        || !Array.isArray(outline.headings)
        || !Array.isArray(links.backlinkDetails)
        || !Array.isArray(links.outgoingDetails)) return false
      this.update({ links, outline })
      return true
    } catch {
      return false
    }
  }

  jumpToLine(line: number): boolean {
    if (!Number.isSafeInteger(line) || line < 1 || this.snapshot.path === null) return false
    let offset = 0
    for (let current = 1; current < line; current += 1) {
      const next = this.snapshot.source.indexOf('\n', offset)
      if (next < 0) return false
      offset = next + 1
    }
    this.setMode('source')
    this.setSelection(offset, offset)
    return true
  }

  private settlePendingDispatch(result: TockTutorNativeActionsDispatchResult): void {
    const pending = this.pendingDispatch
    if (pending === null) return
    this.pendingDispatch = null
    this.update({ dispatchDialog: null })
    pending.resolve(result)
  }

  private dispatchCurrent(revision: number, vault: VaultReference): boolean {
    return !this.disposed && revision === this.dispatchRevision && sameVault(this.snapshot.vault, vault)
  }

  private invalidateDispatch(): void {
    this.dispatchRevision += 1
    this.settlePendingDispatch('stale')
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private update(change: Partial<WorkbenchRouteSnapshot>): void {
    if (this.disposed) return
    this.snapshot = Object.freeze({ ...this.snapshot, ...change })
    for (const listener of this.listeners) listener()
  }

  private shellPanes(): readonly RoutePaneSummary[] {
    return Object.freeze(this.shellSession.groups.map(group => Object.freeze({
      activePath: group.tabs.find(tab => tab.id === group.activeTabId)?.path ?? null,
      id: group.id,
      tabs: Object.freeze(group.tabs.map(tab => Object.freeze({
        dirty: tab.dirty,
        mode: routeModeFromSession(tab.mode),
        path: tab.path,
        pinned: tab.pinned,
      }))),
    })))
  }

  private syncShell(change: Partial<WorkbenchRouteSnapshot> = {}): void {
    this.update({
      canGoBack: this.historyBack.length > 0,
      canGoForward: this.historyForward.length > 0,
      focusedPaneId: this.shellSession.focusedGroupId,
      panes: this.shellPanes(),
      recentlyClosed: Object.freeze(this.recentlyClosed.map(tab => Object.freeze({ ...tab }))),
      workspaces: Object.freeze(this.workspaces.map(workspace => Object.freeze({ ...workspace }))),
      ...change,
    })
    const vaultId = this.shellSession.vault?.id
    if (this.storage !== null && vaultId !== undefined) {
      saveWorkbenchState(this.storage, vaultId, {
        focusMode: this.snapshot.focusMode === true,
        session: this.shellSession,
        workspaces: this.workspaces,
      })
    }
  }

  private pane(id = this.snapshot.focusedPaneId): RoutePaneSummary | undefined {
    return this.snapshot.panes.find(candidate => candidate.id === id)
  }

  private recordOpen(
    path: string,
    recordHistory = true,
    previous = this.snapshot.path,
  ): void {
    if (recordHistory && previous !== null && previous !== path) {
      this.historyBack.push(previous)
      if (this.historyBack.length > MAX_NOTE_TABS * MAX_PANE_GROUPS) this.historyBack.shift()
      this.historyForward.length = 0
    }
    this.shellSession = openNoteTab(
      this.shellSession,
      this.shellSession.focusedGroupId,
      path,
      { mode: sessionModeFromRoute(this.snapshot.mode) },
    )
    this.shellSession = markTabDirty(this.shellSession, this.shellSession.focusedGroupId, path, false)
    this.syncShell()
  }

  private recordDirty(dirty: boolean): void {
    const path = this.snapshot.path
    if (path === null) return
    this.shellSession = markTabDirty(
      this.shellSession,
      this.shellSession.focusedGroupId,
      path,
      dirty,
    )
    this.syncShell()
  }

  private persistDraft(
    request: SaveDraftRequest,
    abort: AbortController,
    final = false,
  ): Promise<void> {
    const flush = final
      ? this.persistFinalDraft(request, abort)
      : Promise.resolve()
        .then(() => this.remote.tocktutorWorkbench.saveDraft(request, abort.signal))
        .then(result => { remoteValue(result) })
        .catch(() => undefined)
    this.draftFlush = flush
    void flush.then(
      () => {
        if (this.draftFlush === flush) this.draftFlush = null
        if (this.draftAbort === abort) this.draftAbort = null
      },
      () => {
        if (this.draftFlush === flush) this.draftFlush = null
        if (this.draftAbort === abort) this.draftAbort = null
      },
    )
    return flush
  }

  private async persistFinalDraft(
    request: SaveDraftRequest,
    abort: AbortController,
  ): Promise<void> {
    let lastError: unknown
    for (let attempt = 0; attempt < FINAL_DRAFT_ATTEMPTS; attempt += 1) {
      try {
        const result = await this.remote.tocktutorWorkbench.saveDraft(request, abort.signal)
        remoteValue(result)
        return
      } catch (error) {
        lastError = error
        if (abort.signal.aborted) break
      }
    }
    throw lastError instanceof Error ? lastError : new Error('The latest TockTutor draft could not be saved.')
  }

  private scheduleDraft(): void {
    if (this.draftTimer !== null) clearTimeout(this.draftTimer)
    this.draftAbort?.abort()
    const vault = this.snapshot.vault
    const path = this.snapshot.path
    const revision = this.snapshot.revision
    const content = this.snapshot.source
    if (vault === null || path === null) return
    const abort = new AbortController()
    this.draftAbort = abort
    this.draftTimer = setTimeout(() => {
      this.draftTimer = null
      this.persistDraft({
        content,
        expectedVault: vault,
        path,
        ...(revision === null ? {} : { revision }),
      }, abort)
    }, 400)
  }

  private flushPendingDraft(): Promise<void> | null {
    if (this.draftTimer !== null) {
      clearTimeout(this.draftTimer)
      this.draftTimer = null
    }
    const vault = this.snapshot.vault
    const path = this.snapshot.path
    if (vault === null || path === null || this.snapshot.saveStatus === 'saved') return null
    this.draftAbort?.abort()
    const abort = new AbortController()
    this.draftAbort = abort
    return this.persistDraft({
      content: this.snapshot.source,
      expectedVault: vault,
      path,
      ...(this.snapshot.revision === null ? {} : { revision: this.snapshot.revision }),
    }, abort, true)
  }

  private clearDocument(): void {
    this.invalidateDispatch()
    this.nextOperation()
    this.cancelEmbedOperation()
    this.embedTargets = Object.freeze([])
    this.update({
      baseFiles: Object.freeze([]),
      documentKind: null,
      draftRecovered: false,
      embeds: Object.freeze([]),
      links: null,
      message: 'Select a note from the vault.',
      organizationProposal: null,
      outline: null,
      path: null,
      revision: null,
      saveStatus: 'saved',
      source: '',
    })
  }

  private nextOperation(): { id: number; signal: AbortSignal } {
    this.operationAbort?.abort()
    this.operationAbort = new AbortController()
    this.operation += 1
    return { id: this.operation, signal: this.operationAbort.signal }
  }

  private cancelEmbedOperation(): void {
    this.embedAbort?.abort()
    this.embedAbort = null
    this.embedOperation += 1
  }

  private nextEmbedOperation(): { id: number; signal: AbortSignal } {
    this.cancelEmbedOperation()
    this.embedAbort = new AbortController()
    return { id: this.embedOperation, signal: this.embedAbort.signal }
  }

  private currentEmbed(id: number, vault: VaultReference, path: string): boolean {
    return !this.disposed && id === this.embedOperation && sameVault(this.snapshot.vault, vault) && this.snapshot.path === path
  }

  private current(id: number, vault?: VaultReference): boolean {
    return !this.disposed
      && id === this.operation
      && (vault === undefined || sameVault(this.snapshot.vault, vault))
  }

  async syncLocation(pathname: string): Promise<void> {
    this.pathname = pathname
    if (!this.started) {
      this.started = true
      await this.reload()
      return
    }
    const path = pathFromTockTutorLocation(pathname)
    if (this.snapshot.phase !== 'ready' || path === this.snapshot.path) return
    if (path !== null) {
      await this.select(path, false)
      return
    }
    if (this.snapshot.saveStatus !== 'saved' && !await this.save()) {
      if (this.snapshot.path !== null) this.navigate(routeForPath(this.snapshot.path), 'replace')
      return
    }
    this.shellSession = setActiveNoteTab(
      this.shellSession,
      this.shellSession.focusedGroupId,
      null,
    )
    this.syncShell()
    this.clearDocument()
  }

  async reload(): Promise<void> {
    this.invalidateDispatch()
    const operation = this.nextOperation()
    this.shellSession = createWorkbenchSession(ROUTE_PREFIX, null, 'pane-1')
    this.bookmarks = []
    this.vaultGeneration = 0
    this.recentlyClosed.length = 0
    this.historyBack.length = 0
    this.historyForward.length = 0
    this.eventDispose?.()
    this.eventDispose = null
    this.update({
      baseFiles: Object.freeze([]),
      bookmarks: Object.freeze([]),
      canGoBack: false,
      canGoForward: false,
      dispatchDialog: null,
      documentKind: null,
      draftRecovered: false,
      embeds: Object.freeze([]),
      entries: Object.freeze([]),
      facets: null,
      focusedPaneId: 'pane-1',
      graph: null,
      graphLayout: Object.freeze([]),
      graphMode: 'global',
      links: null,
      message: 'Loading the active vault.',
      organizationProposal: null,
      outline: null,
      path: null,
      phase: 'loading',
      recentVaults: Object.freeze([]),
      recentlyClosed: Object.freeze([]),
      revision: null,
      saveStatus: 'saved',
      searchLoading: false,
      searchMatches: Object.freeze([]),
      searchMode: 'query',
      searchOpen: false,
      searchQuery: '',
      selectionEnd: 0,
      selectionStart: 0,
      source: '',
      panes: this.shellPanes(),
      vault: null,
      warnings: Object.freeze([]),
    })
    try {
      const recent = remoteValue(await this.remote.tocktutorWorkbench.listRecentVaults(operation.signal))
      if (!this.current(operation.id) || !validRecentVaults(recent)) return
      this.vaultGeneration = recent.generation
      const recentVaults = Object.freeze(recent.vaults.map(vault => Object.freeze({ ...vault })))
      const vault = remoteValue(await this.remote.tocktutorWorkbench.currentVault(operation.signal))
      if (!this.current(operation.id)) return
      if (vault === null) {
        this.update({ message: 'No active TockTutor vault is available.', phase: 'inactive', recentVaults })
        return
      }
      if (vault.generation !== recent.generation) return await this.reload()
      const page = remoteValue(await this.remote.tocktutorWorkbench.listTree({
        expectedVault: vault,
        limit: TREE_LIMIT,
      }, operation.signal))
      if (!this.current(operation.id) || page.generation !== vault.generation) return
      const openable = new Set(page.entries.filter(entry => entry.kind === 'document' && supportedDocument(entry.path)).map(entry => entry.path))
      let settings: TockTutorSettings | undefined
      let restoredFocusMode = false
      if (this.storage === null) {
        this.shellSession = createWorkbenchSession(ROUTE_PREFIX, vault, 'pane-1')
        this.bookmarks = []
        this.workspaces = []
      } else {
        const restored = loadWorkbenchState(this.storage, vault.id)
        this.shellSession = hydrateWorkbenchSession({
          ...restored.session,
          vault,
          groups: restored.session.groups.map(group => ({
            ...group,
            tabs: group.tabs.filter(tab => openable.has(tab.path)),
          })),
        })
        this.bookmarks = loadBookmarks(this.storage, vault.id)
        this.workspaces = restored.workspaces
        restoredFocusMode = restored.focusMode
        settings = loadTockTutorSettings(this.storage, vault.id)
      }
      this.update({
        bookmarks: Object.freeze(this.bookmarks.map(bookmark => Object.freeze({ ...bookmark }))),
        entries: Object.freeze(page.entries.toSorted((left, right) => left.path.localeCompare(right.path))),
        focusedPaneId: this.shellSession.focusedGroupId,
        focusMode: restoredFocusMode,
        message: page.truncated ? 'The vault tree is truncated to a bounded result.' : 'Vault ready.',
        panes: this.shellPanes(),
        phase: 'ready',
        recentVaults,
        ...(settings === undefined ? {} : { settings }),
        vault,
        warnings: Object.freeze(page.warnings),
        workspaces: Object.freeze(this.workspaces.map(workspace => Object.freeze({ ...workspace }))),
      })
      this.eventDispose = this.remote.$on('note-vault/change', event => { this.onVaultChange(event) })
      const path = pathFromTockTutorLocation(this.pathname) ?? this.pane()?.activePath ?? null
      if (path !== null) await this.select(path, false)
    } catch (error) {
      if (!this.current(operation.id) || operation.signal.aborted) return
      this.update({ message: this.failureMessage(error, 'The vault could not be loaded.'), phase: 'error' })
    }
  }

  private onVaultChange(value: NoteVaultChangeEvent): void {
    if (!isNoteVaultChangeEvent(value)) return
    if (value.action === 'activated') {
      if (!sameVault(this.snapshot.vault, value.vault)) void this.reload()
      return
    }
    if (!sameVault(this.snapshot.vault, value.vault)) return
    if (value.kind === 'tree') {
      void this.refreshTree(value.vault)
      return
    }
    const selected = this.snapshot.path
    if (selected !== null
      && this.snapshot.saveStatus !== 'saved'
      && (value.path === selected || ('fromPath' in value && value.fromPath === selected))) {
      this.update({ message: 'External Change: The active file changed on disk. Your local draft remains unsaved.' })
      void this.refreshTree(value.vault)
      return
    }
    if (selected !== null
      && this.snapshot.saveStatus === 'saved'
      && (value.path === selected || ('fromPath' in value && value.fromPath === selected))) {
      const nextPath = value.path === selected ? selected : value.path
      if (supportedDocument(nextPath)) {
        void this.select(nextPath, false)
      } else {
        const closed = closeNoteTab(this.shellSession, this.shellSession.focusedGroupId, selected)
        this.shellSession = closed.session
        this.syncShell()
        this.clearDocument()
        this.navigate(ROUTE_PREFIX, 'replace')
        void this.refreshTree(value.vault)
      }
    } else {
      void this.refreshTree(value.vault)
    }
  }

  private async refreshTree(vault: VaultReference): Promise<void> {
    const operation = this.nextOperation()
    try {
      const page = remoteValue(await this.remote.tocktutorWorkbench.listTree({
        expectedVault: vault,
        limit: TREE_LIMIT,
      }, operation.signal))
      if (!this.current(operation.id, vault) || page.generation !== vault.generation) return
      this.update({
        entries: Object.freeze(page.entries.toSorted((left, right) => left.path.localeCompare(right.path))),
        warnings: Object.freeze(page.warnings),
      })
    } catch (error) {
      if (this.current(operation.id, vault) && !operation.signal.aborted) {
        this.update({ message: this.failureMessage(error, 'The vault tree could not be refreshed.') })
      }
    }
  }

  async activateRecentVault(id: string): Promise<boolean> {
    if (!/^vault:[0-9a-f]{64}$/u.test(id) || this.snapshot.recentVaults?.some(vault => vault.id === id) !== true) return false
    if (this.snapshot.saveStatus !== 'saved' && !await this.save()) return false
    const operation = this.nextOperation()
    const expectedGeneration = this.vaultGeneration
    try {
      const vault = remoteValue(await this.remote.tocktutorWorkbench.activateRecentVault({
        expectedGeneration,
        id,
      }, operation.signal))
      if (!this.current(operation.id) || vault.generation < expectedGeneration || vault.id !== id) return false
      await this.reload()
      return sameVault(this.snapshot.vault, vault)
    } catch {
      return false
    }
  }

  async removeRecentVault(id: string): Promise<boolean> {
    if (!/^vault:[0-9a-f]{64}$/u.test(id) || this.snapshot.recentVaults?.some(vault => vault.id === id) !== true) return false
    const operation = this.nextOperation()
    try {
      const result = remoteValue(await this.remote.tocktutorWorkbench.removeRecentVault({
        expectedGeneration: this.vaultGeneration,
        id,
      }, operation.signal))
      if (!this.current(operation.id) || !validRecentVaults(result) || result.generation !== this.vaultGeneration) return false
      this.update({ recentVaults: Object.freeze(result.vaults.map(vault => Object.freeze({ ...vault }))) })
      return true
    } catch {
      return false
    }
  }

  async createManagedVault(name: string): Promise<boolean> {
    if (this.snapshot.saveStatus !== 'saved' && !await this.save()) return false
    const operation = this.nextOperation()
    const expectedGeneration = this.vaultGeneration
    try {
      const vault = remoteValue(await this.remote.tocktutorWorkbench.createManagedVault({ expectedGeneration, name }, operation.signal))
      if (!this.current(operation.id) || vault.generation < expectedGeneration) return false
      await this.reload()
      return sameVault(this.snapshot.vault, vault)
    } catch {
      return false
    }
  }

  async openSandboxVault(): Promise<boolean> {
    if (this.snapshot.saveStatus !== 'saved' && !await this.save()) return false
    const operation = this.nextOperation()
    const expectedGeneration = this.vaultGeneration
    try {
      const vault = remoteValue(await this.remote.tocktutorWorkbench.openSandboxVault({ expectedGeneration }, operation.signal))
      if (!this.current(operation.id) || vault.generation < expectedGeneration) return false
      await this.reload()
      return sameVault(this.snapshot.vault, vault)
    } catch {
      return false
    }
  }

  async setRecoveryOpen(open: boolean): Promise<void> {
    this.update({ recoveryOpen: open, selectedSnapshot: open ? this.snapshot.selectedSnapshot ?? null : null })
    if (!open) return
    const vault = this.snapshot.vault
    if (vault === null) return
    const path = this.snapshot.path
    const operation = this.nextOperation()
    try {
      const trash = remoteValue(await this.remote.tocktutorWorkbench.listTrash({ expectedVault: vault }, operation.signal))
      if (!this.current(operation.id, vault) || trash.generation !== vault.generation || !Array.isArray(trash.entries)) return
      let snapshots: SnapshotInfo[] = []
      if (path !== null) {
        const result = remoteValue(await this.remote.tocktutorWorkbench.listSnapshots({ expectedVault: vault, path }, operation.signal))
        if (!this.current(operation.id, vault) || result.generation !== vault.generation || !Array.isArray(result.snapshots)) return
        snapshots = result.snapshots
      }
      this.update({
        snapshots: Object.freeze(snapshots.map(snapshot => Object.freeze({ ...snapshot }))),
        trash: Object.freeze(trash.entries.map(entry => Object.freeze({ ...entry }))),
      })
    } catch {
      if (this.current(operation.id, vault) && !operation.signal.aborted) this.update({ message: 'Recovery data could not be loaded.' })
    }
  }

  async readRecoverySnapshot(snapshotId: string): Promise<boolean> {
    const vault = this.snapshot.vault
    const path = this.snapshot.path
    if (vault === null || path === null || this.snapshot.snapshots?.some(snapshot => snapshot.id === snapshotId) !== true) return false
    const operation = this.nextOperation()
    try {
      const snapshot = remoteValue(await this.remote.tocktutorWorkbench.readSnapshot({ expectedVault: vault, path, snapshotId }, operation.signal))
      if (!this.current(operation.id, vault) || snapshot.generation !== vault.generation || snapshot.snapshot.id !== snapshotId) return false
      this.update({ selectedSnapshot: snapshot })
      return true
    } catch {
      return false
    }
  }

  async captureRecoverySnapshot(): Promise<boolean> {
    const vault = this.snapshot.vault
    const path = this.snapshot.path
    if (vault === null || path === null) return false
    try {
      const result = remoteValue(await this.remote.tocktutorWorkbench.captureSnapshot({
        content: this.snapshot.source,
        expectedVault: vault,
        path,
        reason: 'manual',
      }))
      if (result.generation !== vault.generation || result.snapshot?.path !== path) return false
      await this.setRecoveryOpen(true)
      return true
    } catch {
      return false
    }
  }

  async clearRecoverySnapshots(): Promise<boolean> {
    const vault = this.snapshot.vault
    const path = this.snapshot.path
    if (vault === null || path === null) return false
    try {
      const result = remoteValue(await this.remote.tocktutorWorkbench.clearSnapshots({ expectedVault: vault, path }))
      if (result.generation !== vault.generation) return false
      this.update({ selectedSnapshot: null, snapshots: Object.freeze([]) })
      return true
    } catch {
      return false
    }
  }

  async restoreRecoverySnapshotOverwrite(snapshotId: string): Promise<boolean> {
    const vault = this.snapshot.vault
    const path = this.snapshot.path
    const revision = this.snapshot.revision
    if (vault === null || path === null || revision === null || this.snapshot.snapshots?.some(snapshot => snapshot.id === snapshotId) !== true) return false
    try {
      const restored = remoteValue(await this.remote.tocktutorWorkbench.restoreSnapshot({
        expectedRevision: revision,
        expectedVault: vault,
        path,
        snapshotId,
      }))
      if (restored.status !== 'saved' || restored.generation !== vault.generation || restored.path !== path) return false
      this.clearDocument()
      return await this.select(path, false)
    } catch {
      return false
    }
  }

  async restoreRecoverySnapshot(snapshotId: string): Promise<boolean> {
    const vault = this.snapshot.vault
    const path = this.snapshot.path
    if (vault === null || path === null || this.snapshot.snapshots?.some(snapshot => snapshot.id === snapshotId) !== true) return false
    const basename = path.split('/').at(-1) ?? 'Recovered.md'
    const stem = basename.replace(/\.(?:base|canvas|markdown|md)$/iu, '')
    const extension = basename.slice(stem.length) || '.md'
    const toPath = `Recovered/${stem} Recovery${extension}`
    try {
      const restored = remoteValue(await this.remote.tocktutorWorkbench.restoreSnapshotAsNew({
        expectedVault: vault,
        path,
        snapshotId,
        toPath,
      }))
      if (restored.status !== 'created' || restored.generation !== vault.generation || restored.path !== toPath) return false
      this.update({ message: `${toPath} restored.` })
      await this.refreshTree(vault)
      return true
    } catch {
      return false
    }
  }

  async trashCurrent(): Promise<boolean> {
    const vault = this.snapshot.vault
    const path = this.snapshot.path
    const revision = this.snapshot.revision
    if (vault === null || path === null || revision === null) return false
    if (this.snapshot.saveStatus !== 'saved' && !await this.save()) return false
    try {
      remoteValue(await this.remote.tocktutorWorkbench.trashEntry({ expectedRevision: revision, expectedVault: vault, path }))
      const closed = closeNoteTab(this.shellSession, this.shellSession.focusedGroupId, path)
      this.shellSession = closed.session
      this.syncShell()
      this.clearDocument()
      this.navigate(ROUTE_PREFIX)
      await this.setRecoveryOpen(true)
      return true
    } catch {
      return false
    }
  }

  async restoreTrashEntry(id: string): Promise<boolean> {
    const vault = this.snapshot.vault
    if (vault === null || this.snapshot.trash?.some(entry => entry.id === id) !== true) return false
    try {
      remoteValue(await this.remote.tocktutorWorkbench.restoreTrash({ expectedVault: vault, id }))
      await this.setRecoveryOpen(true)
      await this.refreshTree(vault)
      return true
    } catch {
      return false
    }
  }

  async addPane(): Promise<boolean> {
    if (this.snapshot.phase !== 'ready' || this.snapshot.panes.length >= MAX_PANE_GROUPS) return false
    if (this.snapshot.saveStatus !== 'saved' && !await this.save()) return false
    const used = new Set(this.snapshot.panes.map(pane => pane.id))
    let id = ''
    for (let index = 1; index <= MAX_PANE_GROUPS; index += 1) {
      const candidate = `pane-${String(index)}`
      if (!used.has(candidate)) {
        id = candidate
        break
      }
    }
    if (id === '') return false
    const added = addPaneGroup(this.shellSession, id)
    this.shellSession = added.session
    this.syncShell()
    this.clearDocument()
    this.navigate(ROUTE_PREFIX)
    return true
  }

  async focusPane(id: string, pathOverride?: string): Promise<boolean> {
    const target = this.pane(id)
    if (target === undefined || this.snapshot.phase !== 'ready') return false
    const path = pathOverride ?? target.activePath
    if (id === this.snapshot.focusedPaneId && path === this.snapshot.path) return true
    if (this.snapshot.saveStatus !== 'saved' && !await this.save()) return false
    this.shellSession = focusPaneGroup(this.shellSession, id)
    if (path === null) this.shellSession = setActiveNoteTab(this.shellSession, id, null)
    this.syncShell()
    this.clearDocument()
    if (path === null) {
      this.navigate(ROUTE_PREFIX)
      return true
    }
    return this.select(path)
  }

  async activateTab(paneId: string, path: string): Promise<boolean> {
    const pane = this.pane(paneId)
    if (pane === undefined || !pane.tabs.some(tab => tab.path === path)) return false
    return this.focusPane(paneId, path)
  }

  togglePinTab(paneId: string, path: string): void {
    if (this.pane(paneId)?.tabs.some(tab => tab.path === path) !== true) return
    this.shellSession = setTabPinned(this.shellSession, paneId, path)
    this.syncShell()
  }

  moveTab(paneId: string, path: string, direction: -1 | 1): void {
    this.shellSession = moveNoteTab(this.shellSession, paneId, path, direction)
    this.syncShell()
  }

  async closeTab(paneId: string, path: string): Promise<boolean> {
    const pane = this.pane(paneId)
    const tab = pane?.tabs.find(candidate => candidate.path === path)
    if (tab === undefined) return false
    const active = paneId === this.snapshot.focusedPaneId && path === this.snapshot.path
    if (active && this.snapshot.saveStatus !== 'saved' && !await this.save()) return false
    const result = closeNoteTab(this.shellSession, paneId, path)
    if (result.closed === null) return false
    this.shellSession = result.session
    this.recentlyClosed.splice(
      0,
      this.recentlyClosed.length,
      {
        dirty: false,
        mode: routeModeFromSession(result.closed.mode),
        path: result.closed.path,
        pinned: result.closed.pinned,
      },
      ...this.recentlyClosed.filter(candidate => candidate.path !== result.closed?.path),
    )
    this.recentlyClosed.length = Math.min(this.recentlyClosed.length, MAX_NOTE_TABS)
    this.syncShell()
    if (!active) return true
    this.clearDocument()
    if (result.nextPath === null) {
      this.navigate(ROUTE_PREFIX)
      return true
    }
    return await this.select(result.nextPath)
  }

  async reopenClosedTab(): Promise<boolean> {
    const candidate = this.recentlyClosed.shift()
    if (candidate === undefined) return false
    this.shellSession = openNoteTab(
      this.shellSession,
      this.shellSession.focusedGroupId,
      candidate.path,
      {
        ...(candidate.mode === undefined ? {} : { mode: sessionModeFromRoute(candidate.mode) }),
        ...(candidate.pinned === undefined ? {} : { pinned: candidate.pinned }),
      },
    )
    this.syncShell()
    if (await this.select(candidate.path)) return true
    const closed = closeNoteTab(this.shellSession, this.shellSession.focusedGroupId, candidate.path)
    this.shellSession = closed.session
    this.recentlyClosed.unshift(candidate)
    this.syncShell()
    return false
  }

  async goBack(): Promise<boolean> {
    const target = this.historyBack.at(-1)
    const current = this.snapshot.path
    if (target === undefined || current === null) return false
    if (!await this.select(target, true, undefined, false)) return false
    this.historyBack.pop()
    this.historyForward.push(current)
    this.syncShell()
    return true
  }

  async goForward(): Promise<boolean> {
    const target = this.historyForward.at(-1)
    const current = this.snapshot.path
    if (target === undefined || current === null) return false
    if (!await this.select(target, true, undefined, false)) return false
    this.historyForward.pop()
    this.historyBack.push(current)
    this.syncShell()
    return true
  }

  setCommandPaletteOpen(open: boolean): void {
    this.update({ commandPaletteOpen: open })
  }

  toggleFocusMode(): void {
    this.syncShell({ focusMode: this.snapshot.focusMode !== true })
  }

  updateSettings(change: Partial<TockTutorSettings>): boolean {
    const vault = this.snapshot.vault
    if (vault === null || this.storage === null) return false
    const settings = saveTockTutorSettings(this.storage, vault.id, change)
    this.update({ settings })
    return true
  }

  saveCurrentWorkspace(name?: string): boolean {
    if (this.snapshot.vault === null || this.storage === null) return false
    const next = createNamedWorkspace(
      this.workspaces,
      name ?? `Workspace ${String(this.workspaces.length + 1)}`,
      this.shellSession,
      this.now().getTime(),
      this.snapshot.focusMode === true,
    )
    if (next.length === this.workspaces.length) return false
    this.workspaces = next
    this.syncShell()
    return true
  }

  addActiveBookmark(): boolean {
    const vault = this.snapshot.vault
    const path = this.snapshot.path
    if (vault === null || path === null || this.storage === null) return false
    try {
      this.bookmarks = addBookmark(this.bookmarks, {
        id: `note-${this.now().getTime().toString(36)}`,
        kind: 'note',
        path,
        title: noteTitle(path),
      })
      if (!saveBookmarks(this.storage, vault.id, this.bookmarks)) return false
      this.update({ bookmarks: Object.freeze(this.bookmarks.map(bookmark => Object.freeze({ ...bookmark }))) })
      return true
    } catch {
      return false
    }
  }

  addLinkBookmark(title: string, url: string): boolean {
    const vault = this.snapshot.vault
    if (vault === null || this.storage === null) return false
    try {
      this.bookmarks = addBookmark(this.bookmarks, {
        id: `link-${this.now().getTime().toString(36)}`,
        kind: 'link',
        title: title.trim().slice(0, 200) || 'Web Link',
        url,
      })
      if (!saveBookmarks(this.storage, vault.id, this.bookmarks)) return false
      this.update({ bookmarks: Object.freeze(this.bookmarks.map(bookmark => Object.freeze({ ...bookmark }))) })
      return true
    } catch {
      return false
    }
  }

  removeBookmark(id: string): boolean {
    const vault = this.snapshot.vault
    if (vault === null || this.storage === null) return false
    const next = this.bookmarks.filter(bookmark => bookmark.id !== id)
    if (next.length === this.bookmarks.length || !saveBookmarks(this.storage, vault.id, next)) return false
    this.bookmarks = next
    this.update({ bookmarks: Object.freeze(next.map(bookmark => Object.freeze({ ...bookmark }))) })
    return true
  }

  async openBookmark(id: string): Promise<boolean> {
    const bookmark = this.bookmarks.find(candidate => candidate.id === id)
    if (bookmark === undefined) return false
    if (bookmark.kind === 'note' || bookmark.kind === 'heading' || bookmark.kind === 'block') {
      if (!await this.select(bookmark.path)) return false
      if (bookmark.kind === 'heading') this.jumpToLine(bookmark.line)
      return true
    }
    if (bookmark.kind === 'folder') {
      this.openSearch(`path:${bookmark.path}`)
      return await this.runSearch()
    }
    if (bookmark.kind === 'search') {
      this.openSearch(bookmark.query)
      return await this.runSearch()
    }
    if (bookmark.kind === 'graph') return false
    if (bookmark.kind === 'link') return false
    return false
  }

  async loadWorkspace(id: string): Promise<boolean> {
    const workspace = this.workspaces.find(candidate => candidate.id === id)
    const vault = this.snapshot.vault
    if (workspace === undefined || vault === null) return false
    if (this.snapshot.saveStatus !== 'saved' && !await this.save()) return false
    const openable = new Set(this.snapshot.entries.filter(entry => entry.kind === 'document' && supportedDocument(entry.path)).map(entry => entry.path))
    this.shellSession = hydrateWorkbenchSession({
      ...workspace.session,
      vault,
      groups: workspace.session.groups.map(group => ({ ...group, tabs: group.tabs.filter(tab => openable.has(tab.path)) })),
    })
    this.syncShell({ focusMode: workspace.focusMode })
    const path = this.pane()?.activePath ?? null
    this.clearDocument()
    if (path === null) {
      this.navigate(ROUTE_PREFIX)
      return true
    }
    return await this.select(path)
  }

  async select(
    path: string,
    navigate = true,
    dispatchRevision?: number,
    recordHistory = true,
  ): Promise<boolean> {
    const activeVault = this.snapshot.vault
    if (!supportedDocument(path) || activeVault === null || this.snapshot.phase !== 'ready') return false
    const previousPath = this.snapshot.path
    if (dispatchRevision === undefined) this.invalidateDispatch()
    else if (!this.dispatchCurrent(dispatchRevision, activeVault)) return false
    if (path === this.snapshot.path) return true
    const pane = this.pane()
    if (pane === undefined
      || (!pane.tabs.some(tab => tab.path === path) && pane.tabs.length >= MAX_NOTE_TABS)) {
      this.update({ message: `This pane is limited to ${String(MAX_NOTE_TABS)} note tabs.` })
      return false
    }
    if (this.snapshot.saveStatus !== 'saved' && !await this.save()) {
      if (this.snapshot.path !== null) this.navigate(routeForPath(this.snapshot.path), 'replace')
      return false
    }
    const vault = activeVault
    const operation = this.nextOperation()
    this.update({ message: `Opening ${path}.` })
    try {
      const opened = remoteValue(await this.remote.tocktutorWorkbench.openDocument(path, vault, operation.signal))
      if (!this.current(operation.id, vault)
        || opened.generation !== vault.generation
        || opened.path !== path) return false
      if (!boundedSource(opened.content)) {
        this.update({ message: `${path} exceeds the editor size limit.` })
        return false
      }
      let content = opened.content
      let draftRecovered = false
      if (documentKind(path) === 'markdown') {
        try {
          const draft = remoteValue(await this.remote.tocktutorWorkbench.readDraft({ expectedVault: vault, path }, operation.signal))
          if (!this.current(operation.id, vault) || draft.generation !== vault.generation) return false
          if (draft.draft !== null
            && (draft.draft.revision === undefined || draft.draft.revision === opened.revision)
            && boundedSource(draft.draft.content)) {
            content = draft.draft.content
            draftRecovered = content !== opened.content
          }
        } catch {
          if (!this.current(operation.id, vault) || operation.signal.aborted) return false
        }
      }
      const mode = pane.tabs.find(tab => tab.path === path)?.mode ?? this.snapshot.mode
      this.cancelEmbedOperation()
      this.embedTargets = embedTargetSources(content)
      this.update({
        documentKind: documentKind(path),
        embeds: Object.freeze([]),
        draftRecovered,
        message: draftRecovered ? `${path} opened with its recovered draft.` : `${path} opened.`,
        mode,
        path,
        revision: opened.revision,
        saveStatus: draftRecovered ? 'unsaved' : 'saved',
        selectionEnd: 0,
        selectionStart: 0,
        source: content,
      })
      this.recordOpen(path, recordHistory, previousPath)
      if (draftRecovered) this.recordDirty(true)
      if (navigate) this.navigate(routeForPath(path))
      if (documentKind(path) === 'markdown') {
        void (async () => {
          if (await this.loadRelationships() && this.snapshot.path === path && this.snapshot.source === content) await this.loadEmbeds()
        })()
      } else if (documentKind(path) === 'base') void this.hydrateBaseRows(path)
      return true
    } catch (error) {
      if (this.current(operation.id, vault) && !operation.signal.aborted) {
        this.update({ message: this.failureMessage(error, `${path} could not be opened.`) })
      }
      return false
    }
  }

  edit(source: string): void {
    if (this.snapshot.path === null || this.snapshot.phase !== 'ready') return
    if (!boundedSource(source)) {
      this.update({ message: 'The edit exceeds the bounded source limit.' })
      return
    }
    if (source === this.snapshot.source) return
    this.invalidateDispatch()
    const nextEmbedTargets = embedTargetSources(source)
    const embedsChanged = !sameStrings(this.embedTargets, nextEmbedTargets)
    this.embedTargets = nextEmbedTargets
    if (embedsChanged) this.cancelEmbedOperation()
    this.update({
      ...(embedsChanged ? { embeds: Object.freeze([]) } : {}),
      message: 'Unsaved changes.',
      saveStatus: 'unsaved',
      source,
    })
    this.recordDirty(true)
    this.scheduleDraft()
    if (embedsChanged && nextEmbedTargets.length > 0) void this.loadEmbeds()
  }

  setSelection(start: number, end: number): void {
    if (this.snapshot.path === null) return
    const selectionStart = Number.isSafeInteger(start) ? Math.max(0, Math.min(start, this.snapshot.source.length)) : 0
    const selectionEnd = Number.isSafeInteger(end) ? Math.max(selectionStart, Math.min(end, this.snapshot.source.length)) : selectionStart
    this.update({ selectionEnd, selectionStart })
  }

  setProperty(key: string, value: PropertyValue): boolean {
    if (this.snapshot.documentKind !== 'markdown' || this.snapshot.path === null || this.snapshot.mode === 'reading') return false
    try {
      const source = setFrontmatterProperty(this.snapshot.source, key, value)
      if (source === this.snapshot.source) return false
      this.edit(source)
      return true
    } catch {
      return false
    }
  }

  runEditorCommand(command: EditorCommandId): void {
    if (this.snapshot.path === null || this.snapshot.documentKind !== 'markdown' || this.snapshot.mode === 'reading') return
    const result = applyEditorCommand(
      this.snapshot.source,
      command,
      this.snapshot.selectionStart ?? this.snapshot.source.length,
      this.snapshot.selectionEnd ?? this.snapshot.source.length,
    )
    if (result.source === this.snapshot.source) return
    this.edit(result.source)
    this.update({ selectionEnd: result.selectionEnd, selectionStart: result.selectionStart })
  }

  setMode(mode: RouteEditorMode): void {
    if (this.snapshot.path === null) return
    if (mode === 'live-preview' && this.snapshot.documentKind !== 'markdown') return
    this.shellSession = setNoteTabMode(
      this.shellSession,
      this.shellSession.focusedGroupId,
      this.snapshot.path,
      sessionModeFromRoute(mode),
    )
    this.syncShell({ mode })
  }

  toggleTask(index: number): void {
    if (this.snapshot.documentKind !== 'markdown') return
    const source = toggleMarkdownTask(this.snapshot.source, index)
    if (source !== this.snapshot.source) this.edit(source)
  }

  moveCanvasNode(nodeId: string, deltaX: number, deltaY: number): void {
    if (this.snapshot.documentKind !== 'canvas') return
    const parsed = parseCanvasDocument(this.snapshot.source)
    if (parsed.status !== 'ready') return
    const node = parsed.document.nodes.find(candidate => candidate.id === nodeId)
    if (node === undefined) return
    try {
      this.edit(updateCanvasNodePosition(this.snapshot.source, nodeId, node.x + deltaX, node.y + deltaY))
    } catch {
      this.update({ message: 'The Canvas node could not be moved within the bounded workspace.' })
    }
  }

  convertActiveNote(): boolean {
    if (this.snapshot.documentKind !== 'markdown' || this.snapshot.path === null || this.snapshot.mode === 'reading') return false
    try {
      const source = convertMarkdownFormats(this.snapshot.source, { deprecatedProperties: true, roamBear: true })
      if (source === this.snapshot.source) return false
      this.edit(source)
      return true
    } catch {
      return false
    }
  }

  async extractActiveSelection(): Promise<boolean> {
    const vault = this.snapshot.vault
    const path = this.snapshot.path
    const start = this.snapshot.selectionStart ?? 0
    const end = this.snapshot.selectionEnd ?? 0
    if (vault === null || path === null || this.snapshot.documentKind !== 'markdown' || end <= start) return false
    const destinationPath = `Extracted/${noteTitle(path)} Extract.md`
    try {
      const extraction = extractSelectionToNote({
        destinationPath,
        destinationTitle: `${noteTitle(path)} Extract`,
        end,
        leftover: 'link',
        source: this.snapshot.source,
        sourceTitle: noteTitle(path),
        start,
      })
      const created = remoteValue(await this.remote.tocktutorWorkbench.createDocument({
        content: extraction.destinationContent,
        expectedVault: vault,
        path: destinationPath,
      }))
      if (created.status !== 'created' || created.generation !== vault.generation || created.path !== destinationPath) return false
      this.edit(extraction.sourceContent)
      this.update({ message: `${destinationPath} created; save the source note to finish extraction.` })
      return true
    } catch {
      return false
    }
  }

  async createBuiltinTemplateNote(name: keyof typeof BUILTIN_TEMPLATES): Promise<boolean> {
    const vault = this.snapshot.vault
    if (vault === null) return false
    const path = `${this.snapshot.settings?.templateFolder ?? 'Templates'}/${name}.md`
    try {
      const content = expandTemplate(BUILTIN_TEMPLATES[name], { now: this.now(), title: name })
      const created = remoteValue(await this.remote.tocktutorWorkbench.createDocument({ content, expectedVault: vault, path }))
      if (created.status !== 'created' || created.path !== path || created.generation !== vault.generation) return false
      await this.refreshTree(vault)
      return await this.select(path)
    } catch {
      return false
    }
  }

  insertCurrentDateTime(kind: 'date' | 'time'): boolean {
    if (this.snapshot.path === null || this.snapshot.documentKind !== 'markdown' || this.snapshot.mode === 'reading') return false
    const start = this.snapshot.selectionStart ?? this.snapshot.source.length
    const end = this.snapshot.selectionEnd ?? start
    const value = expandTemplate(kind === 'date' ? '{{date}}' : '{{time}}', { now: this.now(), title: noteTitle(this.snapshot.path) })
    this.edit(`${this.snapshot.source.slice(0, start)}${value}${this.snapshot.source.slice(end)}`)
    this.setSelection(start + value.length, start + value.length)
    return true
  }

  async prepareOrganization(): Promise<boolean> {
    const path = this.snapshot.path
    if (path === null || !/^Inbox\/.+\.md$/iu.test(path)) return false
    if (this.snapshot.saveStatus !== 'saved' && !await this.save()) return false
    try {
      const title = noteTitle(path)
      const proposal = buildOrganizationProposal({
        captures: [{ content: this.snapshot.source, path }],
        now: this.now(),
        title: `${title} Review`,
      })
      this.update({ organizationProposal: proposal })
      return true
    } catch {
      return false
    }
  }

  cancelOrganization(): void {
    this.update({ organizationProposal: null })
  }

  async applyOrganization(): Promise<boolean> {
    const proposal = this.snapshot.organizationProposal
    const vault = this.snapshot.vault
    const path = this.snapshot.path
    if (proposal === null || proposal === undefined || vault === null || path === null || proposal.captures[0] !== path) return false
    let current: OrganizationProposal
    try {
      current = buildOrganizationProposal({
        captures: [{ content: this.snapshot.source, path }],
        now: this.now(),
        title: proposal.title,
      })
    } catch {
      return false
    }
    if (current.id !== proposal.id || current.destination !== proposal.destination) return false
    try {
      const created = remoteValue(await this.remote.tocktutorWorkbench.createDocument({
        content: proposal.content,
        expectedVault: vault,
        path: proposal.destination,
      }))
      if (created.status !== 'created' || created.generation !== vault.generation || created.path !== proposal.destination) return false
      this.update({ message: `${proposal.destination} created.`, organizationProposal: null })
      await this.refreshTree(vault)
      return true
    } catch {
      return false
    }
  }

  async loadEmbeds(): Promise<boolean> {
    const vault = this.snapshot.vault
    const sourcePath = this.snapshot.path
    if (vault === null || sourcePath === null || this.snapshot.documentKind !== 'markdown') return false
    const source = this.snapshot.source
    let targets: EmbedTarget[]
    try { targets = collectEmbedTargets(source) } catch {
      this.cancelEmbedOperation()
      this.update({ embeds: Object.freeze([]) })
      return false
    }
    this.embedTargets = Object.freeze(targets.map(target => target.source))
    if (targets.length === 0) {
      this.cancelEmbedOperation()
      this.update({ embeds: Object.freeze([]) })
      return true
    }
    const operation = this.nextEmbedOperation()
    try {
      const result = await resolveEmbedGraph({
        entries: this.snapshot.entries,
        isCurrent: () => this.currentEmbed(operation.id, vault, sourcePath),
        readAttachment: async path => {
          const preview = remoteValue(await this.remote.tocktutorWorkbench.previewAttachment(path, vault, operation.signal))
          if (preview.path !== path || preview.generation !== vault.generation) throw new Error('Embed attachment identity changed.')
          return preview
        },
        readDocument: async path => {
          const opened = remoteValue(await this.remote.tocktutorWorkbench.openDocument(path, vault, operation.signal))
          if (opened.path !== path || opened.generation !== vault.generation) throw new Error('Embed document identity changed.')
          return opened
        },
        signal: operation.signal,
        source,
      })
      if (result.status !== 'ready' || !this.currentEmbed(operation.id, vault, sourcePath)) return false
      this.update({
        embeds: Object.freeze(result.embeds.map(embed => Object.freeze({
          content: embed.content,
          ...(embed.depth === 0 ? {} : { depth: embed.depth }),
          ...(embed.mimeType === undefined ? {} : { mimeType: embed.mimeType }),
          ...(embed.parentPath === undefined ? {} : { parentPath: embed.parentPath }),
          target: Object.freeze({ ...embed.target }),
        }))),
        warnings: Object.freeze([...this.snapshot.warnings, ...result.warnings].slice(-32)),
      })
      return true
    } catch {
      return false
    }
  }

  async hydrateBaseRows(basePath: string): Promise<boolean> {
    const vault = this.snapshot.vault
    if (vault === null || this.snapshot.path !== basePath || this.snapshot.documentKind !== 'base') return false
    const entries = this.snapshot.entries.filter((entry): entry is Extract<VaultTreeEntry, { kind: 'document' }> => entry.kind === 'document' && /\.(?:markdown|md)$/iu.test(entry.path)).slice(0, 2_000)
    const operation = this.nextOperation()
    const files: BaseHydratedFile[] = []
    try {
      for (let index = 0; index < entries.length; index += 8) {
        const batch = entries.slice(index, index + 8)
        const opened = await Promise.all(batch.map(entry => this.remote.tocktutorWorkbench.openDocument(entry.path, vault, operation.signal).then(remoteValue)))
        if (!this.current(operation.id, vault) || this.snapshot.path !== basePath) return false
        for (let offset = 0; offset < opened.length; offset += 1) {
          const document = opened[offset]!
          const entry = batch[offset]!
          if (document.generation !== vault.generation || document.path !== entry.path || !boundedSource(document.content)) return false
          files.push({ createdAt: entry.createdAt, modifiedAt: entry.modifiedAt, path: entry.path, revision: document.revision, sizeBytes: entry.size, source: document.content })
        }
      }
      this.update({ baseFiles: Object.freeze(files.map(file => Object.freeze({ ...file }))) })
      return true
    } catch {
      return false
    }
  }

  async applyBaseEdit(request: ExecutableBaseFrontmatterEditRequest): Promise<boolean> {
    const vault = this.snapshot.vault
    const basePath = this.snapshot.path
    if (vault === null || basePath === null || this.snapshot.documentKind !== 'base') return false
    const operation = this.operation
    try {
      const current = remoteValue(await this.remote.tocktutorWorkbench.openDocument(request.path, vault))
      if (current.generation !== vault.generation || current.path !== request.path || current.revision !== request.expectedRevision || current.content !== request.previousSource) return false
      const property = parseFrontmatterProperties(current.content).find(entry => entry.key === request.property)
      if (property === undefined || executableBasePropertyIdentity(property.key, property.value) !== request.expectedPropertyIdentity) return false
      const saved = remoteValue(await this.remote.tocktutorWorkbench.saveDocument({ content: request.source, expectedRevision: request.expectedRevision, expectedVault: vault, path: request.path }))
      if (saved.status !== 'saved' || saved.generation !== vault.generation || saved.path !== request.path) return false
      if (this.operation !== operation || !sameVault(this.snapshot.vault, vault) || this.snapshot.path !== basePath) return true
      this.update({ baseFiles: Object.freeze((this.snapshot.baseFiles ?? []).map(file => file.path === request.path ? Object.freeze({ ...file, revision: saved.revision, source: request.source }) : file)) })
      return true
    } catch {
      return false
    }
  }

  async attachFiles(files: readonly File[]): Promise<boolean> {
    if (files.length === 0 || files.length > 16 || this.snapshot.path === null || this.snapshot.vault === null
      || this.snapshot.revision === null || this.snapshot.documentKind !== 'markdown') return false
    const path = this.snapshot.path
    const vault = this.snapshot.vault
    let expectedRevision = this.snapshot.revision
    let expectedSource = this.snapshot.source
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024 || this.snapshot.path !== path || !sameVault(this.snapshot.vault, vault)
        || this.snapshot.revision !== expectedRevision || this.snapshot.source !== expectedSource) return false
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (bytes.byteLength !== file.size || this.snapshot.path !== path || !sameVault(this.snapshot.vault, vault)
        || this.snapshot.revision !== expectedRevision || this.snapshot.source !== expectedSource) return false
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += 32_768) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
      }
      if (!await this.storeActiveAttachment(file.name, btoa(binary))) return false
      expectedRevision = this.snapshot.revision!
      expectedSource = this.snapshot.source
    }
    return true
  }

  async storeActiveAttachment(fileName: string, dataBase64: string): Promise<boolean> {
    const vault = this.snapshot.vault
    const notePath = this.snapshot.path
    const source = this.snapshot.source
    const revision = this.snapshot.revision
    if (vault === null || notePath === null || revision === null || this.snapshot.documentKind !== 'markdown' || dataBase64.length > 35_000_000) return false
    let path: string
    try {
      path = attachmentTargetPath(
        this.snapshot.settings?.attachmentFolder ?? 'Attachments',
        fileName,
        new Set(this.snapshot.entries.filter(entry => entry.kind === 'attachment').map(entry => entry.path)),
      )
    } catch {
      return false
    }
    const operation = this.operation
    try {
      const stored = remoteValue(await this.remote.tocktutorWorkbench.storeAttachment({ dataBase64, expectedVault: vault, path }))
      if (stored.status !== 'stored' || stored.generation !== vault.generation || stored.path !== path) return false
      if (this.operation !== operation || !sameVault(this.snapshot.vault, vault) || this.snapshot.path !== notePath || this.snapshot.source !== source || this.snapshot.revision !== revision) return false
      this.edit(appendAttachmentMarkdown(source, `![[${path}]]`))
      const saved = await this.save()
      if (saved) await this.refreshTree(vault)
      return saved
    } catch {
      return false
    }
  }

  async previewAttachment(path: string): Promise<boolean> {
    const vault = this.snapshot.vault
    if (vault === null || this.snapshot.entries.some(entry => entry.kind === 'attachment' && entry.path === path) !== true) return false
    const operation = this.nextOperation()
    try {
      const preview = remoteValue(await this.remote.tocktutorWorkbench.previewAttachment(path, vault, operation.signal))
      if (!this.current(operation.id, vault) || preview.generation !== vault.generation || preview.path !== path || preview.dataBase64.length > 35_000_000) return false
      this.update({ attachmentPreview: preview })
      return true
    } catch {
      return false
    }
  }

  closeAttachmentPreview(): void {
    this.update({ attachmentPreview: null })
  }

  async applyCanvasChange(change: CanvasChange): Promise<boolean> {
    const vault = this.snapshot.vault
    const path = this.snapshot.path
    if (vault === null
      || path === null
      || this.snapshot.documentKind !== 'canvas'
      || this.snapshot.revision !== change.expectedRevision
      || this.snapshot.source !== change.previousSource) return false
    const operation = this.operation
    this.edit(change.source)
    const saved = await this.save()
    if (saved) return true
    if (this.operation !== operation
      || !sameVault(this.snapshot.vault, vault)
      || this.snapshot.path !== path
      || this.snapshot.source !== change.source) return false
    this.update({
      message: 'The Canvas change failed and its previous preview was restored.',
      saveStatus: 'save-failed',
      source: change.previousSource,
    })
    this.recordDirty(false)
    return false
  }

  save(): Promise<boolean> {
    if (this.saving !== null) return this.saving
    if (this.snapshot.saveStatus === 'saved') return Promise.resolve(true)
    const vault = this.snapshot.vault
    const path = this.snapshot.path
    const revision = this.snapshot.revision
    if (vault === null || path === null || revision === null) return Promise.resolve(false)
    const source = this.snapshot.source
    const abort = new AbortController()
    this.saveAbort?.abort()
    this.saveAbort = abort
    this.update({ message: `Saving ${path}.`, saveStatus: 'saving' })
    const request: SaveDocumentRequest = {
      content: source,
      expectedRevision: revision,
      expectedVault: vault,
      path,
    }
    this.saving = this.remote.tocktutorWorkbench.saveDocument(request, abort.signal)
      .then(result => {
        const saved = remoteValue(result)
        if (this.disposed || !sameVault(this.snapshot.vault, vault) || this.snapshot.path !== path) return false
        if (saved.status !== 'saved' || saved.generation !== vault.generation || saved.path !== path) {
          throw new RemoteCallError('invalid-result', 'The save response did not match the active note.')
        }
        const unchanged = this.snapshot.source === source
        this.update({
          draftRecovered: unchanged ? false : this.snapshot.draftRecovered === true,
          message: unchanged ? `${path} saved.` : 'Newer changes remain unsaved.',
          revision: saved.revision,
          saveStatus: unchanged ? 'saved' : 'unsaved',
        })
        this.recordDirty(!unchanged)
        if (unchanged) {
          if (this.draftTimer !== null) clearTimeout(this.draftTimer)
          this.draftTimer = null
          this.draftAbort?.abort()
          this.draftAbort = null
          void this.remote.tocktutorWorkbench.clearDraft({ expectedVault: vault, path }).catch(() => undefined)
        }
        return unchanged
      })
      .catch(error => {
        if (!this.disposed && !abort.signal.aborted && sameVault(this.snapshot.vault, vault) && this.snapshot.path === path) {
          this.update({
            message: this.failureMessage(error, `${path} could not be saved.`),
            saveStatus: 'save-failed',
          })
        }
        return false
      })
      .finally(() => {
        if (this.saveAbort === abort) this.saveAbort = null
        this.saving = null
      })
    return this.saving
  }

  private failureMessage(error: unknown, fallback: string): string {
    if (error instanceof RemoteCallError) {
      if (error.code === 'conflict' || error.code === 'changed') {
        return 'Save Conflict: The note changed outside this editor. Your source remains unsaved.'
      }
      return error.message || fallback
    }
    return error instanceof Error && error.message !== '' ? error.message : fallback
  }

  dispose(): Promise<void> {
    if (this.disposal !== null) return this.disposal
    const flush = this.flushPendingDraft()
    this.settlePendingDispatch('stale')
    this.disposed = true
    this.dispatchRevision += 1
    this.operation += 1
    this.operationAbort?.abort()
    this.cancelEmbedOperation()
    this.saveAbort?.abort()
    if (this.draftAbort === null) this.draftTimer = null
    this.eventDispose?.()
    this.listeners.clear()
    this.disposal = flush ?? Promise.resolve()
    void this.disposal.catch(() => undefined)
    return this.disposal
  }
}

export interface TockTutorRouteViewProps {
  assistantPanel?: ReactNode
  nativeActions?: ReactNode
  onActivateRecentVault?(id: string): void
  onAddBookmark?(): void
  onAttachFiles?(files: FileList): void
  onActivateTab(paneId: string, path: string): void
  onApplyOrganization?(): void
  onBack?(): void
  onBaseCopy?(request: ExecutableBaseCopyRequest): void
  onBaseEdit?(request: ExecutableBaseFrontmatterEditRequest): void
  onBaseExport?(request: ExecutableBaseExportRequest): void
  onCancelDispatch?(): void
  onCancelOrganization?(): void
  onCanvasChange?(change: CanvasChange): void
  onCaptureSnapshot?(): void
  onClearSnapshots?(): void
  onCloseAttachmentPreview?(): void
  onCloseCommandPalette?(): void
  onCloseSearch?(): void
  onCloseTab?(paneId: string, path: string): void
  onConvertActiveNote?(): void
  onCopyGraphPath?(path: string): void
  onCreateBuiltinTemplate?(name: keyof typeof BUILTIN_TEMPLATES): void
  onCreateManagedVault?(name: string): void
  onAddPane(): void
  onEdit(source: string): void
  onEditorCommand?(command: EditorCommandId): void
  onExtractSelection?(): void
  onFocusPane(paneId: string): void
  onForward?(): void
  onInsertCurrentDateTime?(kind: 'date' | 'time'): void
  onJumpToLine?(line: number): void
  onLoadGraph?(mode: 'global' | 'local'): void
  onLoadWorkspace?(id: string): void
  onMoveCanvas(nodeId: string, deltaX: number, deltaY: number): void
  onMoveTab?(paneId: string, path: string, direction: -1 | 1): void
  onMode(mode: RouteEditorMode): void
  onNewNote?(): void
  onOpenBookmark?(id: string): void
  onOpenCommandPalette?(): void
  onOpenGraphNode?(path: string, mode: 'local' | 'note'): void
  onOpenRecovery?(): void
  onOpenSandboxVault?(): void
  onOpenSmartView?(kind: 'recent' | 'tasks' | 'journals' | 'favorites' | 'collections' | 'tags'): void
  onOpenExternalUrl?(url: string): void
  onOpenSearch?(): void
  onPrepareOrganization?(): void
  onPreviewAttachment?(path: string): void
  onReadSnapshot?(id: string): void
  onRemoveBookmark?(id: string): void
  onRemoveRecentVault?(id: string): void
  onReopenClosedTab?(): void
  onRestoreSnapshot?(id: string): void
  onRestoreSnapshotOverwrite?(id: string): void
  onRestoreTrash?(id: string): void
  onSave(): void
  onRunSearch?(): void
  onSaveWorkspace?(): void
  onSearchChange?(query: string): void
  onSearchMode?(mode: 'query' | 'related'): void
  onSettingsChange?(change: Partial<TockTutorSettings>): void
  onSelectionChange?(start: number, end: number): void
  onStoreAttachment?(fileName: string, dataBase64: string): void
  onSetProperty?(key: string, value: PropertyValue): void
  onSelect(path: string): void
  onSubmitDispatch?(draft: NativeDispatchDraft): void
  onToggleFocusMode?(): void
  onTogglePinTab?(paneId: string, path: string): void
  onTrashCurrent?(): void
  onToggleTask(index: number): void
  active?: boolean
  reviewPanel?: ReactNode
  snapshot: WorkbenchRouteSnapshot
  webViewerPanel?: ReactNode
  titlebarTarget?: Element
}

function NativeDispatchDialog(props: {
  kind: 'capture' | 'new'
  onCancel(): void
  onSubmit(draft: NativeDispatchDraft): void
}): ReactNode {
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    props.onSubmit(props.kind === 'new'
      ? { path: String(form.get('path') ?? '') }
      : {
          text: String(form.get('text') ?? ''),
          title: String(form.get('title') ?? ''),
        })
  }
  const label = props.kind === 'new' ? 'New Note' : 'Quick Capture'
  return (
    <Dialog open onOpenChange={open => { if (!open) props.onCancel() }}>
      <DialogContent
        unstyled
        className="tocktutor-dispatch-dialog fixed top-1/2 left-1/2 z-[2147483647] w-[calc(100%-48px)] max-w-[480px] -translate-1/2"
        overlayClassName="z-[2147483646]"
        showCloseButton={false}
      >
        <form className="grid w-full gap-3.5 rounded-lg border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5 [&_input]:rounded-[5px] [&_input]:border [&_input]:border-[var(--tt-border)] [&_input]:p-2 [&_input]:[font:inherit] [&_label]:grid [&_label]:gap-[5px] [&_label]:font-[650] [&_textarea]:rounded-[5px] [&_textarea]:border [&_textarea]:border-[var(--tt-border)] [&_textarea]:p-2 [&_textarea]:[font:inherit]" onSubmit={submit}>
          <header><DialogTitle className="m-0 text-[17px]">{label}</DialogTitle></header>
          {props.kind === 'new' ? (
            <Label unstyled>
              Note Path
              <Input unstyled aria-label="New Note Path" autoFocus maxLength={1_000} name="path" required />
            </Label>
          ) : (
            <>
              <Label unstyled>
                Title
                <Input unstyled aria-label="Capture Title" autoFocus maxLength={200} name="title" required />
              </Label>
              <Label unstyled>
                Text
                <Textarea unstyled aria-label="Capture Text" maxLength={100_000} name="text" />
              </Label>
            </>
          )}
          <div className="tocktutor-dialog-actions flex justify-end gap-2 [&_button]:cursor-pointer [&_button]:rounded-[5px] [&_button]:border [&_button]:border-[var(--tt-border)] [&_button]:bg-[var(--tt-panel)] [&_button]:px-2.5 [&_button]:py-[7px] [&_button]:text-inherit">
            <Button unstyled onClick={props.onCancel} type="button">Cancel</Button>
            <Button unstyled type="submit">Create</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const SEARCH_OPTIONS = [
  { description: 'match path of the file', label: 'path:', value: 'path:' },
  { description: 'match file name', label: 'file:', value: 'file:' },
  { description: 'search for tags', label: 'tag:', value: 'tag:' },
  { description: 'search keywords on same line', label: 'line:', value: 'line:' },
  { description: 'search keywords under same heading', label: 'section:', value: 'section:' },
  { description: 'match property', label: '[property]', value: '[]' },
] as const

function WorkbenchNoteSearchPalette(props: {
  notePaths: readonly string[]
  onClose(): void
  onCommands(): void
  onRunSearch: (() => void) | undefined
  onSearchChange: ((query: string) => void) | undefined
  onSearchMode: ((mode: 'query' | 'related') => void) | undefined
  onSelect(path: string): void
  snapshot: WorkbenchRouteSnapshot
}): ReactNode {
  const { snapshot } = props
  const matches = snapshot.searchMatches ?? []
  const pathResults = snapshot.searchQuery.trim() === '' || matches.length > 0 ? [] : props.notePaths.slice(0, 100)
  const searchInputContainer = useRef<HTMLDivElement>(null)
  const searchCaret = useRef<number | null>(null)
  const [searchOptionsOpen, setSearchOptionsOpen] = useState(false)
  const insertSearchOption = (value: string): void => {
    const input = searchInputContainer.current?.querySelector('input')
    const start = input?.selectionStart ?? snapshot.searchQuery.length
    const end = input?.selectionEnd ?? start
    const before = snapshot.searchQuery.slice(0, start)
    const after = snapshot.searchQuery.slice(end)
    const leadingSpace = before !== '' && !/\s$/u.test(before) ? ' ' : ''
    const trailingSpace = after !== '' && !/^\s/u.test(after) ? ' ' : ''
    const nextQuery = `${before}${leadingSpace}${value}${trailingSpace}${after}`
    searchCaret.current = start + leadingSpace.length + (value === '[]' ? 1 : value.length)
    props.onSearchChange?.(nextQuery)
    setSearchOptionsOpen(false)
  }
  return (
    <Dialog open onOpenChange={open => { if (!open) props.onClose() }}>
      <DialogContent
        unstyled
        className="fixed top-1/2 left-1/2 z-[2147483647] grid h-[600px] max-h-[calc(100vh-48px)] w-[calc(100%-32px)] max-w-[900px] -translate-1/2 grid-rows-[60px_minmax(0,1fr)_44px] overflow-hidden rounded-[14px] border border-border bg-[var(--tt-panel)] text-[var(--tt-text)] shadow-xl outline-none [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-muted:var(--dsw-alias-label-secondary,#71717a)] [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [--tt-selected:color-mix(in_srgb,var(--tt-accent)_14%,var(--tt-panel))] [--tt-text:var(--dsw-alias-label-primary,#27272a)]"
        overlayClassName="z-[2147483646] !bg-transparent"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Search Notes</DialogTitle>
        <div ref={searchInputContainer} className="flex min-w-0 items-center gap-3 border-b border-[var(--tt-border)] px-4 text-[var(--tt-muted)] [&>svg]:size-[18px]">
          <Search aria-hidden="true" />
          <Input
            unstyled
            aria-label="Search Notes Query"
            autoFocus
            className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] font-medium text-[var(--tt-text)] outline-none placeholder:text-[var(--tt-muted)]"
            maxLength={1_000}
            onChange={event => { props.onSearchChange?.(event.target.value) }}
            onKeyDown={event => {
              if (event.key !== 'Enter' || snapshot.searchQuery.trim() === '') return
              event.preventDefault()
              props.onRunSearch?.()
            }}
            placeholder="Search notes..."
            type="search"
            value={snapshot.searchQuery}
          />
          {(snapshot.searchMode ?? 'query') === 'query' && (
            <Popover open={searchOptionsOpen} onOpenChange={setSearchOptionsOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button unstyled aria-label="Search Options" className="flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-[var(--tt-muted)] hover:bg-[var(--tt-selected)] hover:text-[var(--tt-text)] data-[state=open]:bg-[var(--tt-selected)] data-[state=open]:text-[var(--tt-text)] [&_svg]:size-[15px]" type="button"><SlidersHorizontal aria-hidden="true" strokeWidth={1.75} /></Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Search Options</TooltipContent>
              </Tooltip>
              <PopoverContent
                unstyled
                align="end"
                aria-label="Search Options"
                className="z-[2147483647] box-border flex w-[300px] flex-col gap-2 rounded-xl border border-[var(--dsw-alias-border-l1,#e1e3e7)] bg-[var(--dsw-alias-bg-layer-1,#fff)] p-2.5 text-sm text-[var(--dsw-alias-label-primary,#27272a)] shadow-xl outline-none"
                onCloseAutoFocus={event => {
                  if (searchCaret.current === null) return
                  event.preventDefault()
                  const caret = searchCaret.current
                  searchCaret.current = null
                  queueMicrotask(() => {
                    const input = searchInputContainer.current?.querySelector('input')
                    input?.focus()
                    input?.setSelectionRange(caret, caret)
                  })
                }}
                role="dialog"
                sideOffset={8}
              >
                <PopoverHeader className="gap-0.5 px-1.5 pt-0.5">
                  <PopoverTitle className="text-xs font-semibold">Search syntax</PopoverTitle>
                  <PopoverDescription className="m-0 text-xs text-[var(--dsw-alias-label-secondary,#71717a)]">Insert an operator at the cursor.</PopoverDescription>
                </PopoverHeader>
                <ul className="m-0 grid list-none gap-1 p-0">
                  {SEARCH_OPTIONS.map(option => (
                    <li key={option.label}>
                      <Button unstyled className="grid w-full cursor-pointer grid-cols-[76px_1fr] items-start gap-2 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left hover:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.05))] focus-visible:bg-[var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,0.05))] focus-visible:outline-none" onClick={() => { insertSearchOption(option.value) }} type="button">
                        <code className="font-mono text-xs font-semibold leading-4 text-[var(--dsw-alias-brand-primary,#533afd)]">{option.label}</code>
                        <span className="text-xs leading-4 text-[var(--dsw-alias-label-secondary,#71717a)]">{option.description}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <section className="grid min-h-0 grid-rows-[52px_minmax(0,1fr)] px-4 pb-4" aria-label="Note Search Results">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--tt-border)] text-xs font-medium text-[var(--tt-muted)]">
            <div className="flex gap-1">
              <Button unstyled aria-pressed={(snapshot.searchMode ?? 'query') === 'query'} className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 aria-pressed:border-[var(--tt-accent)]" onClick={() => { props.onSearchMode?.('query') }} type="button">Keyword</Button>
              <Button unstyled aria-pressed={snapshot.searchMode === 'related'} className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 aria-pressed:border-[var(--tt-accent)]" onClick={() => { props.onSearchMode?.('related') }} type="button">Related</Button>
              <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1" disabled={snapshot.searchLoading === true || snapshot.searchQuery.trim() === ''} onClick={props.onRunSearch} type="button">{snapshot.searchLoading === true ? 'Searching…' : 'Search'}</Button>
            </div>
            <Alert unstyled aria-live="polite" className="text-xs text-[var(--tt-muted)]" role="status">{matches.length > 0 ? `${String(matches.length)} vault results.` : `${String(pathResults.length)} matching note paths.`}</Alert>
          </header>
          <div className="min-h-0 overflow-auto py-2">
            {matches.length > 0 ? (
              <ul className="m-0 grid list-none gap-1 p-0" aria-label="Vault Search Results">
                {matches.map(match => (
                  <li key={`${match.kind}:${match.path}:${String(match.line ?? 0)}:${match.preview}`}>
                    <Button unstyled className="w-full rounded-md border-0 bg-transparent px-2.5 py-2 text-left hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)]" onClick={() => { props.onSelect(match.path); props.onClose() }} type="button">
                      <strong className="block truncate text-sm">{match.path}{match.line === null ? '' : `:${String(match.line)}`}</strong>
                      <span className="block truncate text-xs text-[var(--tt-muted)]">{match.preview}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : pathResults.length > 0 ? (
              <ul className="m-0 grid list-none gap-1 p-0" aria-label="Matching Note Paths">
                {pathResults.map(path => (
                  <li key={path}>
                    <Button unstyled className="w-full rounded-md border-0 bg-transparent px-2.5 py-2 text-left text-sm hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)]" onClick={() => { props.onSelect(path); props.onClose() }} type="button">{path}</Button>
                  </li>
                ))}
              </ul>
            ) : <Alert unstyled className="px-2.5 py-2 text-sm text-[var(--tt-muted)]" role="status">{snapshot.searchQuery.trim() === '' ? 'Type to search notes.' : 'No matching notes.'}</Alert>}
          </div>
        </section>
        <footer className="flex items-center gap-5 border-t border-[var(--tt-border)] px-4 text-xs text-[var(--tt-muted)]">
          <Button unstyled className="rounded border border-[var(--tt-border)] bg-transparent px-2 py-1 text-[var(--tt-text)]" onClick={props.onCommands} type="button">Commands</Button>
          <span className="ml-auto flex items-center gap-1.5"><kbd className="rounded border border-[var(--tt-border)] bg-[var(--tt-panel)] px-1.5 py-0.5 font-[inherit] text-[var(--tt-text)] shadow-sm">Enter</kbd> Search</span>
          <span className="flex items-center gap-1.5"><kbd className="rounded border border-[var(--tt-border)] bg-[var(--tt-panel)] px-1.5 py-0.5 font-[inherit] text-[var(--tt-text)] shadow-sm">Esc</kbd> Dismiss</span>
        </footer>
      </DialogContent>
    </Dialog>
  )
}

function WorkbenchCommandPalette(props: {
  canGoBack: boolean
  canGoForward: boolean
  canReopen: boolean
  editorEnabled: boolean
  onBack: (() => void) | undefined
  onClose(): void
  onEditorCommand: ((command: EditorCommandId) => void) | undefined
  onForward: (() => void) | undefined
  onNewNote: (() => void) | undefined
  onReopen: (() => void) | undefined
  onSearch: (() => void) | undefined
  onToggleFocus: (() => void) | undefined
}): ReactNode {
  const [query, setQuery] = useState('')
  const editor = (command: EditorCommandId): (() => void) | undefined => props.onEditorCommand === undefined
    ? undefined
    : () => { props.onEditorCommand?.(command) }
  const commands: Array<{ close?: boolean; disabled?: boolean; label: string; run: (() => void) | undefined }> = [
    { label: 'New Note', run: props.onNewNote },
    { close: false, label: 'Search Notes', run: props.onSearch },
    { label: 'Toggle Focus Mode', run: props.onToggleFocus },
    { disabled: !props.canGoBack, label: 'Go Back', run: props.onBack },
    { disabled: !props.canGoForward, label: 'Go Forward', run: props.onForward },
    { disabled: !props.canReopen, label: 'Reopen Closed Note', run: props.onReopen },
    { disabled: !props.editorEnabled, label: 'Bold Text', run: editor('bold') },
    { disabled: !props.editorEnabled, label: 'Italic Text', run: editor('italic') },
    { disabled: !props.editorEnabled, label: 'Strikethrough Text', run: editor('strikethrough') },
    { disabled: !props.editorEnabled, label: 'Highlight Text', run: editor('highlight') },
    { disabled: !props.editorEnabled, label: 'Add Internal Link', run: editor('link') },
    { disabled: !props.editorEnabled, label: 'Insert Table', run: editor('insert-table') },
    { disabled: !props.editorEnabled, label: 'Insert Tip Callout', run: editor('callout-tip') },
    { disabled: !props.editorEnabled, label: 'Delete Current Line', run: editor('delete-line') },
  ].filter(command => command.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return (
    <Dialog open onOpenChange={open => { if (!open) props.onClose() }}>
      <DialogContent
        unstyled
        className="fixed top-1/2 left-1/2 z-[2147483647] grid h-[600px] max-h-[calc(100vh-48px)] w-[calc(100%-32px)] max-w-[900px] -translate-1/2 grid-rows-[60px_minmax(0,1fr)_44px] overflow-hidden rounded-[14px] border border-border bg-[var(--tt-panel)] text-[var(--tt-text)] shadow-xl outline-none [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-muted:var(--dsw-alias-label-secondary,#71717a)] [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [--tt-selected:color-mix(in_srgb,var(--tt-accent)_14%,var(--tt-panel))] [--tt-text:var(--dsw-alias-label-primary,#27272a)]"
        overlayClassName="z-[2147483646] !bg-transparent"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <Label unstyled className="flex min-w-0 items-center gap-3 border-b border-[var(--tt-border)] px-4 text-[var(--tt-muted)] [&>svg]:size-[18px]">
          <Search aria-hidden="true" />
          <Input
            unstyled
            aria-label="Search Commands"
            autoFocus
            className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] font-medium text-[var(--tt-text)] outline-none placeholder:text-[var(--tt-muted)]"
            maxLength={200}
            onChange={event => { setQuery(event.target.value) }}
            placeholder="Search"
            value={query}
          />
        </Label>
        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(240px,32%)] gap-6 px-4 pb-4 max-sm:grid-cols-1">
          <section className="grid min-h-0 grid-rows-[52px_minmax(0,1fr)]" aria-label="Command Results">
            <header className="flex items-center justify-between gap-3 text-xs font-medium text-[var(--tt-muted)]">
              <span>Search Results</span>
              <span>Best Matches</span>
            </header>
            <div className="grid auto-rows-max gap-1 overflow-auto" role="listbox" aria-label="Command Search Results">
              {commands.map(command => (
                <Button
                  unstyled
                  className="min-h-9 rounded-md border-0 bg-transparent px-2.5 py-2 text-left text-sm text-[var(--tt-text)] outline-none hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)] disabled:opacity-40"
                  disabled={command.disabled === true || command.run === undefined}
                  key={command.label}
                  onClick={() => {
                    command.run?.()
                    if (command.close !== false) props.onClose()
                  }}
                  role="option"
                  type="button"
                >{command.label}</Button>
              ))}
              {commands.length === 0 && <Alert unstyled className="px-2.5 py-2 text-sm text-[var(--tt-muted)]" role="status">No matching commands.</Alert>}
            </div>
          </section>
          <section className="mt-[52px] min-h-0 rounded-xl border border-[var(--tt-border)] p-5 max-sm:hidden" aria-label="Command Preview">
            <div className="flex h-full flex-col justify-center gap-2">
              <strong className="text-sm font-semibold">Command Preview</strong>
              <p className="m-0 text-sm leading-5 text-[var(--tt-muted)]">Choose a command to run it in TockTutor.</p>
            </div>
          </section>
        </div>
        <footer className="flex items-center gap-5 border-t border-[var(--tt-border)] px-4 text-xs text-[var(--tt-muted)]">
          <span className="flex items-center gap-1.5"><kbd className="rounded border border-[var(--tt-border)] bg-[var(--tt-panel)] px-1.5 py-0.5 font-[inherit] text-[var(--tt-text)] shadow-sm">Enter</kbd> Run</span>
          <span className="flex items-center gap-1.5"><kbd className="rounded border border-[var(--tt-border)] bg-[var(--tt-panel)] px-1.5 py-0.5 font-[inherit] text-[var(--tt-text)] shadow-sm">Esc</kbd> Dismiss</span>
        </footer>
      </DialogContent>
    </Dialog>
  )
}

function fileName(path: string): string {
  return path.split('/').at(-1) ?? path
}

function noteTitle(path: string | null): string {
  return path === null ? 'TockTutor' : fileName(path).replace(/\.(?:base|canvas|markdown|md)$/iu, '')
}

function TreeEntries(props: {
  entries: readonly VaultTreeEntry[]
  onSelect(path: string): void
  path: string | null
  prefix?: string
}): ReactNode {
  const prefix = props.prefix ?? ''
  const children = props.entries
    .filter(entry => entry.path.startsWith(prefix)
      && !entry.path.slice(prefix.length).includes('/')
      && (entry.kind === 'directory' || entry.kind === 'document'))
    .toSorted((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
      return left.path.localeCompare(right.path, undefined, { sensitivity: 'base' })
    })
  return children.map(entry => entry.kind === 'directory' ? (
    <li className="tocktutor-tree-directory" key={entry.path} role="treeitem" aria-expanded="true">
      <div className="tocktutor-tree-row grid min-h-8 w-full grid-cols-[12px_16px_minmax(0,1fr)_16px] items-center gap-[7px] overflow-hidden rounded bg-transparent px-[5px] py-1 text-left font-medium text-inherit hover:bg-[color-mix(in_srgb,var(--tt-text)_5%,transparent)] [&>span:not(.tocktutor-tree-indent)]:truncate [&>svg:first-child]:size-3 [&>svg:last-child]:ml-auto [&>svg:last-child]:size-3.5 [&>svg:last-child]:text-[var(--tt-muted)] [&>svg:last-child]:opacity-80" title={entry.path}>
        <WorkbenchGlyph kind="collapse" />
        <WorkbenchGlyph kind="folder" />
        <span>{fileName(entry.path)}</span>
        <WorkbenchGlyph kind="more" />
      </div>
      <ul className="m-0 list-none p-0 pl-4" role="group">
        <TreeEntries entries={props.entries} onSelect={props.onSelect} path={props.path} prefix={`${entry.path}/`} />
      </ul>
    </li>
  ) : (
    <li key={entry.path} role="treeitem" aria-selected={entry.path === props.path}>
      <Button unstyled
        aria-current={entry.path === props.path ? 'page' : undefined}
        className="tocktutor-tree-row grid min-h-8 w-full grid-cols-[12px_16px_minmax(0,1fr)_16px] items-center gap-[7px] overflow-hidden rounded border-0 bg-transparent px-[5px] py-1 text-left font-medium text-inherit hover:bg-[color-mix(in_srgb,var(--tt-text)_5%,transparent)] aria-current:bg-[var(--tt-selected)] aria-current:[&>svg:last-child]:text-[var(--tt-text)] [&>span:not(.tocktutor-tree-indent)]:truncate [&>svg:first-child]:size-3 [&>svg:last-child]:ml-auto [&>svg:last-child]:size-3.5 [&>svg:last-child]:text-[var(--tt-muted)] [&>svg:last-child]:opacity-80"
        onClick={() => { props.onSelect(entry.path) }}
        title={entry.path}
        type="button"
      >
        <span className="tocktutor-tree-indent w-3" />
        <WorkbenchGlyph kind="document" />
        <span>{fileName(entry.path)}</span>
        <WorkbenchGlyph kind="more" />
      </Button>
    </li>
  ))
}

/** Semantic, authority-free view for the route state machine. */
export function TockTutorRouteView(props: TockTutorRouteViewProps): ReactNode {
  const { snapshot } = props
  const active = props.active !== false
  const previewLabel = snapshot.documentKind === 'canvas'
    ? 'Canvas'
    : snapshot.documentKind === 'base' ? 'Base' : 'Reading'
  const sourceLabel = snapshot.documentKind === 'canvas'
    ? 'Canvas Source'
    : snapshot.documentKind === 'base' ? 'Base Source' : 'Markdown Source'
  const query = snapshot.searchQuery.trim().toLocaleLowerCase()
  const activeProperties = snapshot.documentKind === 'markdown' ? parseFrontmatterProperties(snapshot.source) : []
  const documents = snapshot.entries.filter(entry => entry.kind === 'document'
    && supportedDocument(entry.path)
    && (query === '' || entry.path.toLocaleLowerCase().includes(query)))
  const focusedPane = snapshot.panes.find(pane => pane.id === snapshot.focusedPaneId)
  const visibleTreeEntries = query === ''
    ? snapshot.entries.filter(entry => entry.kind === 'directory'
      || (entry.kind === 'document' && supportedDocument(entry.path)))
    : snapshot.entries.filter(entry => entry.kind === 'directory'
      ? documents.some(document => document.path.startsWith(`${entry.path}/`))
      : documents.includes(entry))
  const [panel, setPanel] = useState<'assistant' | 'utilities' | null>(null)
  const [paletteView, setPaletteView] = useState<'commands' | 'notes' | null>(null)
  const visiblePalette = paletteView ?? (snapshot.searchOpen ? 'notes' : snapshot.commandPaletteOpen === true ? 'commands' : null)
  const [assistantPanelWidth, setAssistantPanelWidth] = useState(DEFAULT_ASSISTANT_PANEL_WIDTH)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const effectiveSidebarOpen = sidebarOpen && snapshot.focusMode !== true
  const previousSidebarOpen = useRef(effectiveSidebarOpen)
  const shouldAnimateSidebarColumns = previousSidebarOpen.current !== effectiveSidebarOpen
  const contentColumns = `${String(effectiveSidebarOpen ? sidebarWidth : 0)}px minmax(0, 1fr) auto auto`
  const titlebarColumns = `${String(effectiveSidebarOpen ? sidebarWidth : COLLAPSED_TITLEBAR_SIDEBAR_WIDTH)}px minmax(0, 1fr)`
  useEffect(() => {
    previousSidebarOpen.current = effectiveSidebarOpen
  }, [effectiveSidebarOpen])
  const resizeSidebar = (width: number): void => {
    setSidebarWidth(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width)))
  }
  const beginSidebarResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth
    const move = (next: PointerEvent): void => { resizeSidebar(startWidth + next.clientX - startX) }
    const finish = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }
  const resizeSidebarWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    resizeSidebar(sidebarWidth + (event.key === 'ArrowLeft' ? -10 : 10))
  }
  const resizeAssistantPanel = (width: number): void => {
    setAssistantPanelWidth(clampAssistantPanelWidth(width))
  }
  const beginAssistantPanelResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    const handle = event.currentTarget
    const panelElement = handle.parentElement
    if (panelElement === null) return
    const startX = event.clientX
    const startWidth = assistantPanelWidth
    let frame = 0
    let width = startWidth
    panelElement.style.transitionDuration = '0ms'
    const render = (): void => {
      frame = 0
      panelElement.style.width = `${String(width)}px`
      handle.setAttribute('aria-valuenow', String(width))
    }
    const move = (next: PointerEvent): void => {
      width = clampAssistantPanelWidth(startWidth + startX - next.clientX)
      if (frame === 0) frame = requestAnimationFrame(render)
    }
    const finish = (): void => {
      if (frame !== 0) cancelAnimationFrame(frame)
      render()
      resizeAssistantPanel(width)
      panelElement.style.removeProperty('transition-duration')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }
  const resizeAssistantPanelWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    resizeAssistantPanel(assistantPanelWidth + (event.key === 'ArrowLeft' ? 10 : -10))
  }
  const words = snapshot.source.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0
  const characters = snapshot.source.length
  const titlebar = active ? (
    <section
      aria-label="TockTutor Title Bar"
      className="tocktutor-titlebar absolute top-0 right-0 left-0 z-[2147483647] grid h-[var(--tockteam-titlebar-height,40px)] grid-cols-[var(--tockteam-primary-sidebar-width,280px)_minmax(0,1fr)] border-b border-[var(--tt-border)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] text-[var(--tt-text)] transition-[grid-template-columns] duration-300 ease-out [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-muted:var(--dsw-alias-label-secondary,#71717a)] [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [--tt-tab-border:#d1d5db] [--tt-text:var(--dsw-alias-label-primary,#27272a)] [-webkit-app-region:drag] [font:14px/1.45_ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] [&_*]:box-border [&_*::after]:box-border [&_*::before]:box-border [&_button]:text-inherit [&_button]:[font:inherit] [&_button]:[-webkit-app-region:no-drag] [&_svg]:block [&_svg]:size-[18px]"
      style={{
        gridTemplateColumns: titlebarColumns,
        transitionDuration: shouldAnimateSidebarColumns ? undefined : '0ms',
      }}
    >
      <div className="tocktutor-titlebar-sidebar flex min-w-0 items-center justify-start gap-2 border-r border-[var(--tt-border)] pr-1 pl-[46px] [&>button]:inline-flex [&>button]:items-center [&>button]:justify-center [&>button]:border-0 [&>button]:bg-transparent [&>button]:p-0 [&>button]:text-[var(--tt-muted)] [&>span]:inline-flex [&>span]:h-7 [&>span]:w-[22px] [&>span]:items-center [&>span]:justify-center [&>span]:border-0 [&>span]:bg-transparent [&>span]:p-0 [&>span]:text-[var(--tt-muted)]">
        {effectiveSidebarOpen && (
          <>
            <span className="tocktutor-titlebar-document rounded-[5px] bg-[color-mix(in_srgb,var(--tt-text)_8%,transparent)] text-[var(--tt-text)]"><WorkbenchGlyph kind="document" /></span>
            <span><WorkbenchGlyph kind="document" /></span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button unstyled aria-label="Search Notes" className="border-0 bg-transparent p-0" disabled={props.onOpenSearch === undefined} onClick={props.onOpenSearch} type="button"><Search aria-hidden="true" /></Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Search Notes</TooltipContent>
            </Tooltip>
            <Button unstyled aria-label="Bookmark Active Note" className="h-7 w-[22px] border-0 bg-transparent p-0" disabled={snapshot.path === null || props.onAddBookmark === undefined} onClick={props.onAddBookmark} type="button"><WorkbenchGlyph kind="bookmark" /></Button>
          </>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button unstyled
              aria-expanded={effectiveSidebarOpen}
              aria-label="Toggle Files Sidebar"
              className="tocktutor-panel-icon ml-auto size-9 border-0 bg-transparent p-1.5 text-[var(--tt-muted)]"
              onClick={() => { setSidebarOpen(open => !open) }}
              type="button"
            ><WorkbenchGlyph kind="panel" /></Button>
          </TooltipTrigger>
          <TooltipContent>Toggle Files Sidebar</TooltipContent>
        </Tooltip>
      </div>
      <div className="tocktutor-titlebar-main flex min-w-0 items-center gap-1 pl-2 pr-3.5">
        <span className="tocktutor-history mr-[18px] flex gap-[5px] px-1.5">
          <Button unstyled aria-label="Go Back" className="border-0 bg-transparent p-1 text-[var(--tt-muted)] disabled:opacity-35" disabled={snapshot.canGoBack !== true} onClick={props.onBack} type="button"><WorkbenchGlyph kind="back" /></Button>
          <Button unstyled aria-label="Go Forward" className="border-0 bg-transparent p-1 text-[var(--tt-muted)] disabled:opacity-35" disabled={snapshot.canGoForward !== true} onClick={props.onForward} type="button"><WorkbenchGlyph kind="forward" /></Button>
        </span>
        <div className="tocktutor-tabs -mx-[calc(var(--tt-tab-curve)*2)] -mb-px flex min-w-0 self-stretch items-end gap-1 overflow-visible px-[calc(var(--tt-tab-curve)*2)] [--tt-tab-curve:10px]" {...(focusedPane?.tabs.length ? { 'aria-label': 'Note Tabs', role: 'tablist' } : {})}>
          {focusedPane?.tabs.map((tab, index) => (
            <div className="relative" key={tab.path} role="presentation">
            <Button unstyled
              aria-selected={tab.path === focusedPane.activePath}
              className="relative z-1 -mb-px flex h-[30px] min-w-[118px] max-w-[220px] items-center gap-3 rounded-t-[10px] border border-b-0 border-[var(--tt-tab-border)] bg-[var(--tt-panel)] px-2.5 shadow-[inset_0_1px_0_rgb(255_255_255_/_18%)] aria-[selected=false]:mb-0.5 aria-[selected=false]:border-b aria-[selected=false]:bg-[color-mix(in_srgb,var(--tt-panel)_70%,transparent)] aria-[selected=false]:text-[var(--tt-muted)] aria-[selected=false]:shadow-none aria-selected:before:pointer-events-none aria-selected:before:absolute aria-selected:before:bottom-[-1px] aria-selected:before:left-[calc(var(--tt-tab-curve)*-2)] aria-selected:before:h-[calc(var(--tt-tab-curve)*2)] aria-selected:before:w-[calc(var(--tt-tab-curve)*2)] aria-selected:before:rounded-full aria-selected:before:content-[''] aria-selected:before:[clip-path:inset(50%_calc(var(--tt-tab-curve)*-1)_0_50%)] aria-selected:before:[box-shadow:inset_0_0_0_1px_var(--tt-tab-border),0_0_0_calc(var(--tt-tab-curve)*4)_var(--tt-panel)] aria-selected:after:pointer-events-none aria-selected:after:absolute aria-selected:after:right-[calc(var(--tt-tab-curve)*-2)] aria-selected:after:bottom-[-1px] aria-selected:after:h-[calc(var(--tt-tab-curve)*2)] aria-selected:after:w-[calc(var(--tt-tab-curve)*2)] aria-selected:after:rounded-full aria-selected:after:content-[''] aria-selected:after:[clip-path:inset(50%_50%_0_calc(var(--tt-tab-curve)*-1))] aria-selected:after:[box-shadow:inset_0_0_0_1px_var(--tt-tab-border),0_0_0_calc(var(--tt-tab-curve)*4)_var(--tt-panel)] [&>span]:truncate [&_svg]:ml-auto [&_svg]:size-3.5"
              onClick={() => { props.onActivateTab(focusedPane.id, tab.path) }}
              onKeyDown={event => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                event.preventDefault()
                const offset = event.key === 'ArrowLeft' ? -1 : 1
                if (event.altKey) {
                  props.onMoveTab?.(focusedPane.id, tab.path, offset)
                  return
                }
                const next = focusedPane.tabs[(index + offset + focusedPane.tabs.length) % focusedPane.tabs.length]
                if (next !== undefined) props.onActivateTab(focusedPane.id, next.path)
              }}
              aria-controls="tocktutor-note-editor"
              role="tab"
              tabIndex={tab.path === focusedPane.activePath ? 0 : -1}
              title={tab.path}
              type="button"
            >
              <span>{tab.dirty && <span aria-label="Unsaved">•</span>}{fileName(tab.path)}</span>
            </Button>
            <span className="absolute top-1/2 right-1 z-2 flex -translate-y-1/2 gap-0.5">
              <Button unstyled aria-label={`${tab.pinned === true ? 'Unpin' : 'Pin'} ${fileName(tab.path)}`} className="rounded border-0 bg-transparent p-0.5 text-[var(--tt-muted)]" onClick={() => { props.onTogglePinTab?.(focusedPane.id, tab.path) }} type="button"><Bookmark aria-hidden="true" /></Button>
              <Button unstyled aria-label={`Close ${fileName(tab.path)}`} className="rounded border-0 bg-transparent p-0.5 text-[var(--tt-muted)]" onClick={() => { props.onCloseTab?.(focusedPane.id, tab.path) }} type="button"><WorkbenchGlyph kind="close" /></Button>
            </span>
            </div>
          ))}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button unstyled aria-label="New Note" className="tocktutor-new-tab border-0 bg-transparent p-1.5 text-[var(--tt-muted)]" disabled={props.onNewNote === undefined} onClick={props.onNewNote} type="button"><WorkbenchGlyph kind="new" /></Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>New Note</TooltipContent>
        </Tooltip>
        <span className="tocktutor-titlebar-spacer flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button unstyled
              aria-expanded={panel === 'assistant'}
              aria-label="Toggle Assistant Panel"
              className="tocktutor-panel-icon border-0 bg-transparent p-1.5 text-[var(--tt-muted)]"
              onClick={() => { setPanel(current => current === 'assistant' ? null : 'assistant') }}
              type="button"
            ><WorkbenchGlyph kind="panel-right" /></Button>
          </TooltipTrigger>
          <TooltipContent>Toggle Assistant Panel</TooltipContent>
        </Tooltip>
      </div>
    </section>
  ) : null
  return (
    <TooltipProvider>
      <main
        aria-label="TockTutor Workbench"
      className="tocktutor-workbench h-full min-h-0 box-border bg-[var(--tt-bg)] pt-0 text-[var(--tt-text)] [--tt-accent:var(--dsw-alias-brand-primary,#533afd)] [--tt-bg:var(--dsw-alias-bg-base,#fff)] [--tt-border:var(--dsw-alias-border-l1,var(--dsw-alias-border-subtle,#e1e3e7))] [--tt-footer-height:28px] [--tt-muted:var(--dsw-alias-label-secondary,#71717a)] [--tt-panel:var(--dsw-alias-bg-layer-1,#fff)] [--tt-selected:color-mix(in_srgb,var(--tt-accent)_14%,var(--tt-panel))] [--tt-text:var(--dsw-alias-label-primary,#27272a)] [font:14px/1.45_ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] [&_*]:box-border [&_*::after]:box-border [&_*::before]:box-border [&_[hidden]]:!hidden [&_button]:text-inherit [&_button]:[font:inherit] [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[var(--tt-accent)] [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-[var(--tt-accent)] [&_svg]:block [&_svg]:size-4 [&_textarea:focus-visible]:outline-2 [&_textarea:focus-visible]:outline-offset-2 [&_textarea:focus-visible]:outline-[var(--tt-accent)] motion-reduce:[&_*]:!scroll-auto motion-reduce:[&_*]:!delay-0 motion-reduce:[&_*]:!duration-0 motion-reduce:[&_*::after]:!delay-0 motion-reduce:[&_*::after]:!duration-0 motion-reduce:[&_*::before]:!delay-0 motion-reduce:[&_*::before]:!duration-0"
      data-focus-mode={snapshot.focusMode === true}
      data-phase={snapshot.phase}
      tabIndex={-1}
    >
      {titlebar !== null && (props.titlebarTarget === undefined ? titlebar : createPortal(titlebar, props.titlebarTarget))}
      {snapshot.dispatchDialog !== null && (
        <NativeDispatchDialog
          kind={snapshot.dispatchDialog}
          onCancel={() => { props.onCancelDispatch?.() }}
          onSubmit={draft => { props.onSubmitDispatch?.(draft) }}
        />
      )}
      {visiblePalette === 'commands' && (
        <WorkbenchCommandPalette
          canGoBack={snapshot.canGoBack === true}
          canGoForward={snapshot.canGoForward === true}
          canReopen={(snapshot.recentlyClosed?.length ?? 0) > 0}
          editorEnabled={snapshot.documentKind === 'markdown' && snapshot.mode !== 'reading'}
          onBack={props.onBack}
          onClose={() => { setPaletteView(null); props.onCloseCommandPalette?.() }}
          onEditorCommand={props.onEditorCommand}
          onForward={props.onForward}
          onNewNote={props.onNewNote}
          onReopen={props.onReopenClosedTab}
          onSearch={() => { setPaletteView('notes'); props.onOpenSearch?.() }}
          onToggleFocus={props.onToggleFocusMode}
        />
      )}
      {visiblePalette === 'notes' && (
        <WorkbenchNoteSearchPalette
          notePaths={documents.map(document => document.path)}
          onClose={() => { setPaletteView(null); props.onCloseCommandPalette?.(); props.onCloseSearch?.() }}
          onCommands={() => { setPaletteView('commands'); props.onOpenCommandPalette?.(); props.onCloseSearch?.() }}
          onRunSearch={props.onRunSearch}
          onSearchChange={props.onSearchChange}
          onSearchMode={props.onSearchMode}
          onSelect={props.onSelect}
          snapshot={snapshot}
        />
      )}
      <div
        className="tocktutor-grid relative grid h-full min-h-0 grid-cols-[var(--tockteam-primary-sidebar-width,280px)_minmax(0,1fr)_auto_auto] transition-[grid-template-columns] duration-300 ease-out"
        style={{
          gridTemplateColumns: contentColumns,
          transitionDuration: shouldAnimateSidebarColumns ? undefined : '0ms',
        }}
      >
        <aside
          aria-hidden={!effectiveSidebarOpen}
          aria-label="Files"
          className="tocktutor-sidebar grid min-h-0 grid-rows-[40px_minmax(0,1fr)_var(--tt-footer-height)] overflow-hidden border-r border-[var(--tt-border)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] data-[open=false]:invisible data-[open=false]:[transition:visibility_0s_linear_300ms]"
          data-open={effectiveSidebarOpen}
          {...(effectiveSidebarOpen ? {} : { inert: '' })}
        >
          <header className="tocktutor-sidebar-header flex items-center gap-2.5 border-b border-[var(--tt-border)] px-2.5 [&_svg]:size-3.5">
            <h1 className="mr-auto my-0 text-sm font-semibold">Files</h1>
            <span className="inline-flex items-center justify-center text-sm text-[var(--tt-muted)]"><WorkbenchGlyph kind="more" /></span>
            <span className="inline-flex items-center justify-center text-sm text-[var(--tt-muted)]"><Upload aria-hidden="true" /></span>
            <span className="inline-flex items-center justify-center text-sm text-[var(--tt-muted)]"><WorkbenchGlyph kind="folder" /></span>
            <span className="inline-flex items-center justify-center text-sm text-[var(--tt-muted)]"><PanelTop aria-hidden="true" /></span>
          </header>
          <div className="tocktutor-sidebar-content min-h-0 overflow-auto px-[5px] py-[3px]">
            <nav aria-label="Vault Notes">
              {snapshot.phase === 'loading' && <p className="mx-1 my-[7px] text-xs text-[var(--tt-muted)]">Loading notes…</p>}
              {snapshot.phase === 'inactive' && <Alert unstyled className="mx-1 my-[7px] text-xs text-[color-mix(in_srgb,var(--tt-muted)_90%,var(--tt-text))]">No Active Vault</Alert>}
              {snapshot.phase === 'error' && <Alert unstyled className="mx-1 my-[7px] text-xs text-[color-mix(in_srgb,var(--tt-muted)_90%,var(--tt-text))]">{snapshot.message}</Alert>}
              {snapshot.phase === 'ready' && documents.length === 0 && <p className="mx-1 my-[7px] text-xs text-[var(--tt-muted)]">No supported notes found.</p>}
              <ul className="tocktutor-tree m-0 list-none p-0" role={visibleTreeEntries.length > 0 ? 'tree' : undefined}>
                <TreeEntries entries={visibleTreeEntries} onSelect={props.onSelect} path={snapshot.path} />
              </ul>
            </nav>
          </div>
          <Button unstyled
            aria-expanded={panel === 'utilities'}
            className="tocktutor-vault-switcher grid grid-cols-[14px_minmax(0,1fr)_16px] items-center gap-1.5 border-0 border-t border-[var(--tt-border)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] px-2.5 text-left [&>span]:truncate [&_svg]:size-[13px]"
            onClick={() => { setPanel(current => current === 'utilities' ? null : 'utilities') }}
            type="button"
          >
            <WorkbenchGlyph kind="collapse" />
            <span>{snapshot.vault === null ? 'Choose Vault' : 'TockTutor Vault'}</span>
            <WorkbenchGlyph kind="more" />
          </Button>
        </aside>
        <Button unstyled
          aria-label={`Resize Files Sidebar, ${String(sidebarWidth)} Pixels`}
          className="tocktutor-sidebar-resize absolute top-0 bottom-0 z-5 m-0 w-2 touch-none cursor-ew-resize border-0 bg-transparent p-0 outline-none after:absolute after:top-0 after:bottom-0 after:left-[3px] after:w-0.5 after:bg-transparent after:content-[''] focus-visible:after:bg-[var(--tt-accent)]"
          hidden={!effectiveSidebarOpen}
          onKeyDown={resizeSidebarWithKeyboard}
          onPointerDown={beginSidebarResize}
          style={{ left: sidebarWidth - 4 }}
          title="Drag or Use Left and Right Arrow Keys"
          type="button"
        />
        <section aria-label="Note Editor" className="tocktutor-editor grid min-h-0 grid-rows-[40px_minmax(0,1fr)_var(--tt-footer-height)] overflow-hidden bg-[var(--tt-panel)]" id="tocktutor-note-editor" role="tabpanel">
          <header className="tocktutor-editor-header relative flex min-w-0 items-center justify-center border-b border-[var(--tt-border)] px-2.5">
            <h2 className="m-0 truncate text-[13px] font-medium text-[var(--tt-muted)]">{noteTitle(snapshot.path)}</h2>
            <div className="tocktutor-editor-actions absolute right-2.5 flex items-center gap-1 [&_button]:inline-flex [&_button]:h-7 [&_button]:w-[26px] [&_button]:items-center [&_button]:justify-center [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0 [&_button]:text-[var(--tt-muted)] [&_span]:inline-flex [&_span]:h-7 [&_span]:w-[26px] [&_span]:items-center [&_span]:justify-center [&_span]:border-0 [&_span]:bg-transparent [&_span]:p-0 [&_span]:text-[var(--tt-muted)]">
              {snapshot.documentKind === 'markdown' ? (
                <span aria-label="Editor Mode" className="flex" role="group">
                  {(['reading', 'live-preview', 'source'] as const).map(mode => (
                    <Button
                      unstyled
                      aria-label={mode === 'reading' ? 'Reading' : mode === 'live-preview' ? 'Live Preview' : 'Source'}
                      aria-pressed={snapshot.mode === mode}
                      className="w-auto! px-1.5! aria-pressed:text-[var(--tt-accent)]"
                      key={mode}
                      onClick={() => { props.onMode(mode) }}
                      type="button"
                    >{mode === 'reading' ? <FileText aria-hidden="true" /> : mode === 'live-preview' ? <Pencil aria-hidden="true" /> : <WorkbenchGlyph kind="document" />}</Button>
                  ))}
                </span>
              ) : (
                <Button unstyled
                  aria-label={snapshot.mode === 'source' ? previewLabel : sourceLabel}
                  onClick={() => { props.onMode(snapshot.mode === 'source' ? 'reading' : 'source') }}
                  type="button"
                ><WorkbenchGlyph kind="pencil" /></Button>
              )}
              <span><Music aria-hidden="true" /></span>
              <span><Folder aria-hidden="true" /></span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button unstyled
                    aria-label="More Note Actions"
                    aria-expanded={panel === 'utilities'}
                    onClick={() => { setPanel(current => current === 'utilities' ? null : 'utilities') }}
                    type="button"
                  ><WorkbenchGlyph kind="more" /></Button>
                </TooltipTrigger>
                <TooltipContent>More Note Actions</TooltipContent>
              </Tooltip>
            </div>
          </header>
          <div
            aria-label="Editor Attachment Drop Zone"
            className="tocktutor-editor-body relative min-h-0 overflow-auto"
            onDrop={event => {
              if (event.dataTransfer.files.length === 0) return
              event.preventDefault()
              props.onAttachFiles?.(event.dataTransfer.files)
            }}
            onPaste={event => {
              if (event.clipboardData.files.length === 0) return
              props.onAttachFiles?.(event.clipboardData.files)
            }}
          >
            {snapshot.path === null ? (
              <Empty unstyled className="tocktutor-empty absolute top-[45%] left-1/2 w-full max-w-[420px] -translate-1/2 p-8 text-center">
                <EmptyHeader unstyled>
                  <p className="tocktutor-kicker mb-0.5 text-[11px] font-[650] tracking-[.08em] text-[var(--tt-muted)] uppercase">Ready When You Are</p>
                  <EmptyTitle unstyled aria-level={2} className="text-xl font-bold" role="heading">Select a Note</EmptyTitle>
                  <EmptyDescription unstyled className="text-[var(--tt-muted)]">Choose a Markdown note from the vault to read or edit its exact source.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : snapshot.mode === 'source' ? (
              <div className="flex h-full min-h-0 flex-col">
                <SourceEditor
                  ariaLabel={sourceLabel}
                  className="h-full"
                  content={snapshot.source}
                  key={snapshot.path}
                  onContentChange={props.onEdit}
                  onSelectionChange={selection => { props.onSelectionChange?.(selection.main.from, selection.main.to) }}
                  {...(snapshot.embeds === undefined ? {} : { resolvedEmbeds: snapshot.embeds })}
                  spellCheck
                />
              </div>
            ) : snapshot.mode === 'live-preview' && snapshot.documentKind === 'markdown' ? (
              <LivePreviewView
                documentKey={snapshot.path}
                embeds={snapshot.embeds}
                onEdit={props.onEdit}
                onOpenExternalUrl={props.onOpenExternalUrl}
                onSelectionChange={selection => { props.onSelectionChange?.(selection.from, selection.to) }}
                onToggleTask={props.onToggleTask}
                source={snapshot.source}
              />
            ) : snapshot.documentKind === 'canvas' ? (
              <CanvasBoard
                disabled={snapshot.revision === null || props.onCanvasChange === undefined}
                onChange={change => { props.onCanvasChange?.(change) }}
                revision={snapshot.revision ?? 'unavailable'}
                source={snapshot.source}
              />
            ) : snapshot.documentKind === 'base' ? (
              <ExecutableBaseView
                files={snapshot.baseFiles ?? []}
                {...(props.onBaseCopy === undefined ? {} : { onCopy: props.onBaseCopy })}
                {...(props.onBaseEdit === undefined ? {} : { onEdit: props.onBaseEdit })}
                {...(props.onBaseExport === undefined ? {} : { onExport: props.onBaseExport })}
                source={snapshot.source}
              />
            ) : snapshot.documentKind === 'markdown' ? (
              <RichReadingView embeds={snapshot.embeds} onOpenExternalUrl={props.onOpenExternalUrl} onToggleTask={props.onToggleTask} source={snapshot.source} />
            ) : (
              <Alert unstyled>Reading view is unavailable.</Alert>
            )}
          </div>
          <footer aria-label="TockTutor Status Bar" className="tocktutor-statusbar flex min-w-0 items-center border-t border-[var(--tt-border)] px-2 text-xs text-[var(--tt-muted)]" role="group">
            <output aria-live="polite" className="tocktutor-message absolute size-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)] [clip-path:inset(50%)]">{snapshot.message}</output>
            {snapshot.path !== null && (
              <div className="ml-auto flex items-center gap-[18px] whitespace-nowrap max-[760px]:gap-2">
                <span>0 Backlinks</span>
                <span>{snapshot.mode === 'reading' ? 'Reading' : snapshot.mode === 'live-preview' ? 'Live Preview' : 'Source'}</span>
                <span>{String(words)} Words</span>
                <span>{String(characters)} Characters</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button unstyled
                      aria-label="Open Assistant"
                      aria-expanded={panel === 'assistant'}
                      onClick={() => { setPanel(current => current === 'assistant' ? null : 'assistant') }}
                      type="button"
                      className="border-0 bg-transparent px-0 py-0.5 text-[var(--tt-muted)] [&_svg]:size-[17px]"
                    ><WorkbenchGlyph kind="chat" /></Button>
                  </TooltipTrigger>
                  <TooltipContent>Open Assistant</TooltipContent>
                </Tooltip>
              </div>
            )}
          </footer>
        </section>
        <aside
          aria-hidden={panel !== 'assistant'}
          aria-label="Assistant Panel"
          className="tocktutor-right-panel tocktutor-right-panel-assistant relative invisible grid min-w-0 w-0 translate-x-6 grid-rows-[minmax(0,1fr)] overflow-hidden border-l-0 bg-[var(--tt-panel)] opacity-0 shadow-none transition-[width,opacity,transform,visibility] [transition-duration:420ms,300ms,460ms,0s] [transition-timing-function:cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),cubic-bezier(.16,1,.3,1),linear] [transition-delay:0s,0s,0s,420ms] pointer-events-none data-[open=true]:visible data-[open=true]:translate-x-0 data-[open=true]:overflow-visible data-[open=true]:opacity-100 data-[open=true]:[transition-delay:0s] data-[open=true]:pointer-events-auto [&>:not(.tocktutor-assistant-resize)]:min-w-[min(240px,calc(100vw-262px))]"
          data-open={panel === 'assistant'}
          style={{ width: panel === 'assistant' ? `${String(assistantPanelWidth)}px` : '0px' }}
          {...(panel === 'assistant' ? {} : { inert: '' })}
        >
          {panel === 'assistant' && (
            <Button unstyled
              aria-label="Resize Assistant Panel"
              aria-orientation="vertical"
              aria-valuemax={MAX_ASSISTANT_PANEL_WIDTH}
              aria-valuemin={MIN_ASSISTANT_PANEL_WIDTH}
              aria-valuenow={assistantPanelWidth}
              className="tocktutor-assistant-resize absolute top-0 bottom-0 left-0 z-3 w-4 -translate-x-1/2 touch-none cursor-col-resize border-0 bg-transparent p-0 outline-none before:absolute before:top-1/2 before:left-1/2 before:h-10 before:w-2 before:-translate-1/2 before:rounded-full before:border before:border-[color-mix(in_srgb,var(--tt-text)_32%,var(--tt-border)_68%)] before:bg-[color-mix(in_srgb,var(--tt-text)_8%,var(--tt-panel))] before:shadow-[0_4px_12px_-7px_color-mix(in_srgb,var(--tt-text)_42%,transparent),0_0_0_1px_color-mix(in_srgb,var(--tt-panel)_82%,transparent)] before:transition-colors before:duration-140 before:ease-[cubic-bezier(.16,1,.3,1)] before:content-[''] hover:before:border-[color-mix(in_srgb,var(--tt-accent)_58%,var(--tt-border)_42%)] active:before:border-[color-mix(in_srgb,var(--tt-accent)_58%,var(--tt-border)_42%)] focus-visible:before:border-[color-mix(in_srgb,var(--tt-accent)_58%,var(--tt-border)_42%)] hover:[&+.tocktutor-assistant-content]:border-l-[var(--tt-accent)] active:[&+.tocktutor-assistant-content]:border-l-[var(--tt-accent)] focus-visible:[&+.tocktutor-assistant-content]:border-l-[var(--tt-accent)]"
              onKeyDown={resizeAssistantPanelWithKeyboard}
              onPointerDown={beginAssistantPanelResize}
              role="separator"
              title="Drag or Use Left and Right Arrow Keys"
              type="button"
            />
          )}
          <div className="tocktutor-assistant-content min-h-0 min-w-[min(240px,calc(100vw-262px))] overflow-hidden border-l border-[color-mix(in_srgb,var(--tt-text)_8%,var(--tt-border)_92%)] transition-colors duration-140 ease-[cubic-bezier(.16,1,.3,1)]">{props.assistantPanel}</div>
        </aside>
        <WorkbenchUtilities {...props} activeProperties={activeProperties} onClose={() => { setPanel(null) }} open={panel === 'utilities'} />
        </div>
      </main>
    </TooltipProvider>
  )
}

export type TockTutorRouteProps = TockTutorRouteOwnerProps &
  PropsRenderSlots<
    | typeof TOCKTUTOR_ASSISTANT_PANEL_SLOT
    | typeof TOCKTUTOR_NATIVE_ACTIONS_SLOT
    | typeof TOCKTUTOR_REVIEW_PANEL_SLOT
    | typeof TOCKTUTOR_WEB_VIEWER_PANEL_SLOT
  > & {
    active?: boolean
    remote: WorkbenchRouteRemote
  }

function TockTutorAssistantPanelOutlet(props: {
  activePath: string | null
  renderSlot: TockTutorRouteProps['renderSlot']
  selectedText?: string
  vault: VaultReference | null
}): ReactNode {
  return props.renderSlot(TOCKTUTOR_ASSISTANT_PANEL_SLOT, {
    activePath: props.activePath,
    ...(props.selectedText === undefined ? {} : { selectedText: props.selectedText }),
    vault: props.vault,
  })
}

function TockTutorReviewPanelOutlet(props: {
  activePath: string | null
  renderSlot: TockTutorRouteProps['renderSlot']
  vault: VaultReference | null
}): ReactNode {
  return props.renderSlot(TOCKTUTOR_REVIEW_PANEL_SLOT, {
    activePath: props.activePath,
    vault: props.vault,
  }, {
    fallback: <Alert unstyled role="status">No review workflow is active.</Alert>,
  })
}

function TockTutorWebViewerOutlet(props: {
  activePath: string | null
  addLinkBookmark(title: string, url: string): boolean
  externalUrl?: string | null
  renderSlot: TockTutorRouteProps['renderSlot']
  vault: VaultReference | null
  webClipFolder: string
}): ReactNode {
  return props.renderSlot(TOCKTUTOR_WEB_VIEWER_PANEL_SLOT, {
    activePath: props.activePath,
    addLinkBookmark: props.addLinkBookmark,
    externalUrl: props.externalUrl,
    vault: props.vault,
    webClipFolder: props.webClipFolder,
  }, {
    fallback: <Alert unstyled role="status">Web Viewer is unavailable.</Alert>,
  })
}

function TockTutorNativeActionsOutlet(props: {
  activePath: string | null
  handleDispatch: TockTutorNativeActionsOwnerProps['handleDispatch']
  renderSlot: TockTutorRouteProps['renderSlot']
  saveCurrent(): Promise<boolean>
  storeAudio(fileName: string, dataBase64: string): Promise<boolean>
  vault: VaultReference | null
}): ReactNode {
  return props.renderSlot(TOCKTUTOR_NATIVE_ACTIONS_SLOT, {
    activePath: props.activePath,
    handleDispatch: props.handleDispatch,
    saveCurrent: props.saveCurrent,
    storeAudio: props.storeAudio,
    vault: props.vault,
  }, {
    fallback: <Alert unstyled role="status">No native actions are available.</Alert>,
  })
}

/** Root-scoped component contributed to TockTeam's exact Desktop route seat. */
export function TockTutorRoute(props: TockTutorRouteProps): ReactNode {
  const active = props.active !== false
  const controller = useMemo(
    () => new WorkbenchRouteController(props.remote, props.navigate),
    [props.navigate, props.remote],
  )
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const root = useRef<HTMLDivElement>(null)
  const [externalUrl, setExternalUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!active) return
    void controller.syncLocation(props.location.pathname)
  }, [active, controller, props.location.pathname])
  useEffect(() => () => {
    trackTockTutorRouteFlush(controller.dispose())
  }, [controller])
  useEffect(() => {
    if (!active || snapshot.path === null) return
    root.current?.querySelector<HTMLElement>(snapshot.mode === 'source' ? '.cm-content' : snapshot.mode === 'live-preview' ? '.ProseMirror' : '[aria-label$="View"]')?.focus()
  }, [active, snapshot.mode, snapshot.path])
  useEffect(() => {
    if (!active || snapshot.documentKind !== 'markdown' || snapshot.path === null || snapshot.settings === undefined) return
    const timer = setInterval(() => { void controller.captureRecoverySnapshot() }, snapshot.settings.recoveryIntervalMinutes * 60_000)
    return () => { clearInterval(timer) }
  }, [controller, snapshot.documentKind, snapshot.path, snapshot.settings])
  useEffect(() => {
    const node = root.current
    if (node === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      const isMac = /Mac|iPhone|iPad/u.test(globalThis.navigator?.platform ?? '')
      const primary = isMac ? event.metaKey : event.ctrlKey
      if (primary && !event.altKey && event.key.toLocaleLowerCase() === 'p') {
        event.preventDefault()
        controller.setCommandPaletteOpen(true)
        return
      }
      if (primary && event.shiftKey && !event.altKey && event.key.toLocaleLowerCase() === 't') {
        event.preventDefault()
        void controller.reopenClosedTab()
        return
      }
      const editorCommand = resolvePlatformEditorCommand(event, isMac)
      if (editorCommand !== null) {
        event.preventDefault()
        controller.runEditorCommand(editorCommand)
        return
      }
      const shortcut = resolveEditorShortcut(event, isMac)
      if (shortcut !== 'save') return
      event.preventDefault()
      void controller.save()
    }
    node.addEventListener('keydown', onKeyDown)
    return () => { node.removeEventListener('keydown', onKeyDown) }
  }, [controller])
  return (
    <div className="tocktutor-root h-full min-h-0" ref={root}>
      <TockTutorRouteView
        assistantPanel={(
          <TockTutorAssistantPanelOutlet
            activePath={snapshot.path}
            renderSlot={props.renderSlot}
            {...((snapshot.selectionEnd ?? 0) > (snapshot.selectionStart ?? 0)
              ? { selectedText: snapshot.source.slice(snapshot.selectionStart, Math.min(snapshot.selectionEnd ?? 0, (snapshot.selectionStart ?? 0) + 10_000)) }
              : {})}
            vault={snapshot.vault}
          />
        )}
        nativeActions={(
          <TockTutorNativeActionsOutlet
            activePath={snapshot.path}
            handleDispatch={event => controller.handleDispatch(event)}
            renderSlot={props.renderSlot}
            saveCurrent={() => controller.save()}
            storeAudio={(fileName, dataBase64) => controller.storeActiveAttachment(fileName, dataBase64)}
            vault={snapshot.vault}
          />
        )}
        onActivateRecentVault={id => { void controller.activateRecentVault(id) }}
        onActivateTab={(paneId, path) => { void controller.activateTab(paneId, path) }}
        onAddBookmark={() => { controller.addActiveBookmark() }}
        onAttachFiles={files => { void controller.attachFiles(Array.from(files).slice(0, 16)) }}
        onApplyOrganization={() => { void controller.applyOrganization() }}
        onAddPane={() => { void controller.addPane() }}
        onBack={() => { void controller.goBack() }}
        onBaseCopy={request => { void globalThis.navigator?.clipboard?.writeText(request.text) }}
        onBaseEdit={request => { void controller.applyBaseEdit(request) }}
        onBaseExport={request => {
          const url = URL.createObjectURL(new Blob([request.text], { type: 'text/csv;charset=utf-8' }))
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = request.filename
          anchor.click()
          URL.revokeObjectURL(url)
        }}
        onCancelDispatch={() => { controller.cancelDispatchDialog() }}
        onCancelOrganization={() => { controller.cancelOrganization() }}
        onCanvasChange={change => { void controller.applyCanvasChange(change) }}
        onCaptureSnapshot={() => { void controller.captureRecoverySnapshot() }}
        onClearSnapshots={() => { void controller.clearRecoverySnapshots() }}
        onCloseAttachmentPreview={() => { controller.closeAttachmentPreview() }}
        onCloseCommandPalette={() => { controller.setCommandPaletteOpen(false) }}
        onCloseSearch={() => { controller.closeSearch() }}
        onCloseTab={(paneId, path) => { void controller.closeTab(paneId, path) }}
        onConvertActiveNote={() => { controller.convertActiveNote() }}
        onCopyGraphPath={path => { void globalThis.navigator?.clipboard?.writeText(path) }}
        onCreateBuiltinTemplate={name => { void controller.createBuiltinTemplateNote(name) }}
        onCreateManagedVault={name => { void controller.createManagedVault(name) }}
        onEdit={source => { controller.edit(source) }}
        onEditorCommand={command => { controller.runEditorCommand(command) }}
        onExtractSelection={() => { void controller.extractActiveSelection() }}
        onFocusPane={paneId => { void controller.focusPane(paneId) }}
        onForward={() => { void controller.goForward() }}
        onInsertCurrentDateTime={kind => { controller.insertCurrentDateTime(kind) }}
        onJumpToLine={line => { controller.jumpToLine(line) }}
        onLoadGraph={mode => { void controller.loadGraph(mode) }}
        onLoadWorkspace={id => { void controller.loadWorkspace(id) }}
        onMode={mode => { controller.setMode(mode) }}
        onMoveCanvas={(nodeId, deltaX, deltaY) => { controller.moveCanvasNode(nodeId, deltaX, deltaY) }}
        onMoveTab={(paneId, path, direction) => { controller.moveTab(paneId, path, direction) }}
        onNewNote={() => { void controller.handleDispatch({ action: 'new', kind: 'quick-action', operationId: crypto.randomUUID() }) }}
        onOpenBookmark={id => { void controller.openBookmark(id) }}
        onOpenCommandPalette={() => { controller.setCommandPaletteOpen(true) }}
        onOpenExternalUrl={url => { setExternalUrl(url) }}
        onOpenGraphNode={(path, mode) => { void controller.openGraphNode(path, mode) }}
        onOpenRecovery={() => { void controller.setRecoveryOpen(true) }}
        onOpenSandboxVault={() => { void controller.openSandboxVault() }}
        onOpenSearch={() => { controller.openSearch('') }}
        onOpenSmartView={kind => { void controller.openSmartView(kind) }}
        onPrepareOrganization={() => { void controller.prepareOrganization() }}
        onPreviewAttachment={path => { void controller.previewAttachment(path) }}
        onReadSnapshot={id => { void controller.readRecoverySnapshot(id) }}
        onRemoveBookmark={id => { controller.removeBookmark(id) }}
        onRemoveRecentVault={id => { void controller.removeRecentVault(id) }}
        onReopenClosedTab={() => { void controller.reopenClosedTab() }}
        onRestoreSnapshot={id => { void controller.restoreRecoverySnapshot(id) }}
        onRestoreSnapshotOverwrite={id => { void controller.restoreRecoverySnapshotOverwrite(id) }}
        onRestoreTrash={id => { void controller.restoreTrashEntry(id) }}
        onRunSearch={() => { void controller.runSearch() }}
        onSave={() => { void controller.save() }}
        onSaveWorkspace={() => { controller.saveCurrentWorkspace() }}
        onSearchChange={query => { controller.setSearchQuery(query) }}
        onSearchMode={mode => { controller.setSearchMode(mode) }}
        onSettingsChange={change => { controller.updateSettings(change) }}
        onSelect={path => { void controller.select(path) }}
        onSelectionChange={(start, end) => { controller.setSelection(start, end) }}
        onSetProperty={(key, value) => { controller.setProperty(key, value) }}
        onStoreAttachment={(fileName, dataBase64) => { void controller.storeActiveAttachment(fileName, dataBase64) }}
        onSubmitDispatch={draft => { void controller.submitDispatchDialog(draft) }}
        onToggleFocusMode={() => { controller.toggleFocusMode() }}
        onTogglePinTab={(paneId, path) => { controller.togglePinTab(paneId, path) }}
        onToggleTask={index => { controller.toggleTask(index) }}
        onTrashCurrent={() => { void controller.trashCurrent() }}
        reviewPanel={(
          <TockTutorReviewPanelOutlet
            activePath={snapshot.path}
            renderSlot={props.renderSlot}
            vault={snapshot.vault}
          />
        )}
        active={active}
        snapshot={snapshot}
        webViewerPanel={(
          <TockTutorWebViewerOutlet
            activePath={snapshot.path}
            addLinkBookmark={(title, url) => controller.addLinkBookmark(title, url)}
            externalUrl={externalUrl}
            renderSlot={props.renderSlot}
            vault={snapshot.vault}
            webClipFolder={snapshot.settings?.webClipFolder ?? 'Clips'}
          />
        )}
        {...(active && typeof document !== 'undefined'
          ? { titlebarTarget: document.getElementById('tockteam-window-titlebar-slot') ?? document.body }
          : {})}
      />
    </div>
  )
}
