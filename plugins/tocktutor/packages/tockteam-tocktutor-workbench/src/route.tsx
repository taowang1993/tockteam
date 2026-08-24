import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FileText,
  Folder,
  MessageSquare,
  Music,
  PanelLeft,
  PanelTop,
  Pencil,
  Plus,
  Search,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { TockTutorRouteOwnerProps } from '@tockteam/desktop/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { TOCKTUTOR_ASSISTANT_PANEL_SLOT } from './assistant-panel.ts'
import { projectBase } from './base.ts'
import {
  TOCKTUTOR_NATIVE_ACTIONS_SLOT,
  type TockTutorNativeActionsDispatchEvent,
  type TockTutorNativeActionsDispatchResult,
  type TockTutorNativeActionsOwnerProps,
} from './native-actions.ts'
import { TOCKTUTOR_REVIEW_PANEL_SLOT } from './review-panel.ts'
import {
  parseCanvasDocument,
  projectCanvas,
  updateCanvasNodePosition,
} from './canvas.ts'
import {
  editorStatusLabel,
  projectReading,
  resolveEditorShortcut,
  toggleMarkdownTask,
  type EditorStatus,
  type ReadingBlock,
} from './markdown.ts'
import {
  isSafeVaultRelativePath,
  MAX_NOTE_TABS,
  MAX_PANE_GROUPS,
} from './session.ts'
import { isNoteVaultChangeEvent, type NoteVaultEventRemote } from './vault-events.ts'
import type {
  ActiveVaultResult,
  CreateDocumentRequest,
  ListTreeRequest,
  NoteVaultChangeEvent,
  OpenDocumentResult,
  SaveDocumentRequest,
  VaultReference,
  VaultTreeEntry,
  VaultTreePage,
  WriteDocumentResult,
} from './types.ts'

const ROUTE_PREFIX = '/tocktutor'
const TREE_LIMIT = 200
const DEFAULT_SIDEBAR_WIDTH = 280
const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 480
export const MAX_ROUTE_SOURCE_BYTES = 2_000_000

export interface WorkbenchRouteRemote extends NoteVaultEventRemote {
  tocktutorWorkbench: {
    currentVault(signal?: AbortSignal): Promise<RemoteResult<ActiveVaultResult>>
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
  }
}

export type RoutePhase = 'loading' | 'inactive' | 'ready' | 'error'
export type RouteEditorMode = 'source' | 'reading'
export type RouteDocumentKind = 'markdown' | 'canvas' | 'base'

export interface RouteTabSummary {
  dirty: boolean
  path: string
}

export interface RoutePaneSummary {
  activePath: string | null
  id: string
  tabs: readonly RouteTabSummary[]
}

export interface WorkbenchRouteSnapshot {
  dispatchDialog: 'capture' | 'new' | null
  documentKind: RouteDocumentKind | null
  entries: readonly VaultTreeEntry[]
  focusedPaneId: string
  message: string
  mode: RouteEditorMode
  path: string | null
  phase: RoutePhase
  revision: string | null
  saveStatus: EditorStatus
  searchOpen: boolean
  searchQuery: string
  source: string
  panes: readonly RoutePaneSummary[]
  vault: VaultReference | null
  warnings: readonly string[]
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

function sameVault(left: VaultReference | null, right: VaultReference): boolean {
  return left !== null && left.id === right.id && left.generation === right.generation
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

function boundedSource(source: string): boolean {
  return new TextEncoder().encode(source).byteLength <= MAX_ROUTE_SOURCE_BYTES
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

function padded(value: number): string {
  return String(value).padStart(2, '0')
}

function dateStamp(value: Date): string {
  return `${String(value.getFullYear())}-${padded(value.getMonth() + 1)}-${padded(value.getDate())}`
}

function minuteStamp(value: Date): string {
  return `${dateStamp(value).replaceAll('-', '')}${padded(value.getHours())}${padded(value.getMinutes())}`
}

function initialSnapshot(): WorkbenchRouteSnapshot {
  return Object.freeze({
    dispatchDialog: null,
    documentKind: null,
    entries: Object.freeze([]),
    focusedPaneId: 'pane-1',
    message: 'Loading the active vault.',
    mode: 'source',
    path: null,
    phase: 'loading',
    revision: null,
    saveStatus: 'saved',
    searchOpen: false,
    searchQuery: '',
    source: '',
    panes: Object.freeze([Object.freeze({
      activePath: null,
      id: 'pane-1',
      tabs: Object.freeze([]),
    })]),
    vault: null,
    warnings: Object.freeze([]),
  })
}

/** Bounded route state machine shared by the React contribution and focused tests. */
export class WorkbenchRouteController {
  private snapshot = initialSnapshot()
  private readonly listeners = new Set<() => void>()
  private operation = 0
  private dispatchRevision = 0
  private operationAbort: AbortController | null = null
  private saveAbort: AbortController | null = null
  private saving: Promise<boolean> | null = null
  private eventDispose: (() => void) | null = null
  private pendingDispatch: PendingNativeDispatch | null = null
  private pathname = ROUTE_PREFIX
  private started = false
  private disposed = false

  constructor(
    private readonly remote: WorkbenchRouteRemote,
    private readonly navigate: TockTutorRouteOwnerProps['navigate'],
    private readonly now: () => Date = () => new Date(),
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
    if (request.action === 'choose-vault' || request.paneType === 'window') return 'failed'
    if (request.action === 'search') {
      if (request.query !== undefined && request.query.length > 1_000) return 'failed'
      this.openSearch(request.query ?? '')
      return 'handled'
    }
    if (request.action === 'open') {
      if (request.file === undefined) {
        if (this.snapshot.saveStatus !== 'saved' && !await this.save()) return 'failed'
        if (!this.dispatchCurrent(revision, vault)) return 'stale'
        this.navigate(ROUTE_PREFIX)
        return 'handled'
      }
      const opened = await this.select(request.file)
      if (!this.dispatchCurrent(revision, vault)) return 'stale'
      return opened ? 'handled' : 'failed'
    }
    if (request.action === 'daily') {
      const day = dateStamp(this.now())
      const path = `Journals/${day}.md`
      const exists = this.snapshot.path === path || this.snapshot.entries.some(entry => entry.path === path)
      if (exists) {
        if (request.content !== undefined || request.ifExists !== undefined) return 'failed'
        if (request.silent === true) return 'handled'
        const opened = await this.select(path)
        if (!this.dispatchCurrent(revision, vault)) return 'stale'
        return opened ? 'handled' : 'failed'
      }
      return await this.createDispatchedDocument(
        path,
        request.content ?? `---\njournal-date: ${day}\n---\n# ${day}\n`,
        request.silent === true,
        revision,
        vault,
      )
    }
    if (request.action === 'unique') {
      return await this.createDispatchedDocument(
        `${minuteStamp(this.now())}.md`,
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
    )
  }

  private async createDispatchedDocument(
    path: string,
    content: string,
    silent: boolean,
    revision: number,
    vault: VaultReference,
  ): Promise<TockTutorNativeActionsDispatchResult> {
    if (!isSafeVaultRelativePath(path) || !/\.md$/iu.test(path) || !boundedSource(content)) return 'failed'
    if (this.snapshot.saveStatus !== 'saved' && !await this.save()) return 'failed'
    if (!this.dispatchCurrent(revision, vault)) return 'stale'
    try {
      const created = remoteValue(await this.remote.tocktutorWorkbench.createDocument({
        content,
        expectedVault: vault,
        path,
      }))
      if (!this.dispatchCurrent(revision, vault)) return 'stale'
      if (created.generation !== vault.generation || created.path !== path || created.status !== 'created') return 'failed'
      if (silent) return 'handled'
      this.update({
        documentKind: 'markdown',
        message: `${path} created.`,
        mode: 'source',
        path,
        revision: created.revision,
        saveStatus: 'saved',
        source: content,
      })
      this.recordOpen(path)
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
      const text = draft.text?.trim() ?? ''
      const slug = title.normalize('NFKD')
        .replace(/[\u0300-\u036f]/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '')
        .slice(0, 80)
      if (title.length === 0 || title.length > 200 || text.length > 100_000 || slug.length === 0) {
        this.settlePendingDispatch('failed')
        return
      }
      path = `Inbox/${dateStamp(this.now())}-${slug}.md`
      content = `# ${title}\n\n${text}`
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
    this.update({ searchOpen: false, searchQuery: '' })
  }

  openSearch(query: string): void {
    this.update({ searchOpen: true, searchQuery: query })
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

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private update(change: Partial<WorkbenchRouteSnapshot>): void {
    if (this.disposed) return
    this.snapshot = Object.freeze({ ...this.snapshot, ...change })
    for (const listener of this.listeners) listener()
  }

  private pane(id = this.snapshot.focusedPaneId): RoutePaneSummary | undefined {
    return this.snapshot.panes.find(candidate => candidate.id === id)
  }

  private replacePane(id: string, replace: (pane: RoutePaneSummary) => RoutePaneSummary): void {
    this.update({
      panes: Object.freeze(this.snapshot.panes.map(pane => pane.id === id
        ? Object.freeze(replace(pane))
        : pane)),
    })
  }

  private recordOpen(path: string): void {
    const pane = this.pane()
    if (pane === undefined) return
    const existing = pane.tabs.find(tab => tab.path === path)
    const tabs = existing === undefined
      ? [...pane.tabs, Object.freeze({ dirty: false, path })]
      : pane.tabs.map(tab => tab.path === path ? Object.freeze({ ...tab, dirty: false }) : tab)
    this.replacePane(pane.id, current => ({
      ...current,
      activePath: path,
      tabs: Object.freeze(tabs),
    }))
  }

  private recordDirty(dirty: boolean): void {
    const pane = this.pane()
    const path = this.snapshot.path
    if (pane === undefined || path === null) return
    this.replacePane(pane.id, current => ({
      ...current,
      tabs: Object.freeze(current.tabs.map(tab => tab.path === path
        ? Object.freeze({ ...tab, dirty })
        : tab)),
    }))
  }

  private clearDocument(): void {
    this.nextOperation()
    this.update({
      documentKind: null,
      message: 'Select a note from the vault.',
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
    const pane = this.pane()
    if (pane !== undefined) {
      this.replacePane(pane.id, current => ({ ...current, activePath: null }))
    }
    this.clearDocument()
  }

  async reload(): Promise<void> {
    this.dispatchRevision += 1
    this.settlePendingDispatch('stale')
    const operation = this.nextOperation()
    this.eventDispose?.()
    this.eventDispose = null
    this.update({
      dispatchDialog: null,
      documentKind: null,
      entries: Object.freeze([]),
      focusedPaneId: 'pane-1',
      message: 'Loading the active vault.',
      path: null,
      phase: 'loading',
      revision: null,
      saveStatus: 'saved',
      searchOpen: false,
      searchQuery: '',
      source: '',
      panes: Object.freeze([Object.freeze({
        activePath: null,
        id: 'pane-1',
        tabs: Object.freeze([]),
      })]),
      vault: null,
      warnings: Object.freeze([]),
    })
    try {
      const vault = remoteValue(await this.remote.tocktutorWorkbench.currentVault(operation.signal))
      if (!this.current(operation.id)) return
      if (vault === null) {
        this.update({ message: 'No active TockTutor vault is available.', phase: 'inactive' })
        return
      }
      const page = remoteValue(await this.remote.tocktutorWorkbench.listTree({
        expectedVault: vault,
        limit: TREE_LIMIT,
      }, operation.signal))
      if (!this.current(operation.id) || page.generation !== vault.generation) return
      this.update({
        entries: Object.freeze(page.entries.toSorted((left, right) => left.path.localeCompare(right.path))),
        message: page.truncated ? 'The vault tree is truncated to a bounded result.' : 'Vault ready.',
        phase: 'ready',
        vault,
        warnings: Object.freeze(page.warnings),
      })
      this.eventDispose = this.remote.$on('note-vault/change', event => { this.onVaultChange(event) })
      const path = pathFromTockTutorLocation(this.pathname)
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
      && this.snapshot.saveStatus === 'saved'
      && (value.path === selected || ('fromPath' in value && value.fromPath === selected))) {
      void this.select(value.path === selected ? selected : value.path, false)
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
    this.update({
      focusedPaneId: id,
      panes: Object.freeze([...this.snapshot.panes, Object.freeze({
        activePath: null,
        id,
        tabs: Object.freeze([]),
      })]),
    })
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
    this.update({ focusedPaneId: id })
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

  async select(path: string, navigate = true): Promise<boolean> {
    if (!supportedDocument(path) || this.snapshot.vault === null || this.snapshot.phase !== 'ready') return false
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
    const vault = this.snapshot.vault
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
      this.update({
        documentKind: documentKind(path),
        message: `${path} opened.`,
        path,
        revision: opened.revision,
        saveStatus: 'saved',
        source: opened.content,
      })
      this.recordOpen(path)
      if (navigate) this.navigate(routeForPath(path))
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
    this.update({
      message: source === this.snapshot.source ? this.snapshot.message : 'Unsaved changes.',
      saveStatus: 'unsaved',
      source,
    })
    this.recordDirty(true)
  }

  setMode(mode: RouteEditorMode): void {
    if (this.snapshot.path !== null) this.update({ mode })
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
          message: unchanged ? `${path} saved.` : 'Newer changes remain unsaved.',
          revision: saved.revision,
          saveStatus: unchanged ? 'saved' : 'unsaved',
        })
        this.recordDirty(!unchanged)
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

  dispose(): void {
    if (this.disposed) return
    this.settlePendingDispatch('stale')
    this.disposed = true
    this.dispatchRevision += 1
    this.operation += 1
    this.operationAbort?.abort()
    this.saveAbort?.abort()
    this.eventDispose?.()
    this.listeners.clear()
  }
}

function ReadingBlockView(props: {
  block: ReadingBlock
  onToggleTask(index: number): void
}): ReactNode {
  const { block } = props
  switch (block.kind) {
    case 'heading': {
      const Tag = `h${String(block.level)}` as keyof JSX.IntrinsicElements
      return <Tag>{block.level === 1 && <ChevronDown aria-hidden="true" />}{block.text}</Tag>
    }
    case 'paragraph': return <p>{block.text}</p>
    case 'code': return <pre><code>{block.text}</code></pre>
    case 'task': return (
      <label className="tocktutor-task">
        <input
          aria-label={`Mark ${block.text} as ${block.checked ? 'incomplete' : 'complete'}`}
          checked={block.checked}
          onChange={() => { props.onToggleTask(block.index) }}
          type="checkbox"
        />
        <span>{block.text}</span>
      </label>
    )
  }
}

function CanvasView(props: {
  onMove(nodeId: string, deltaX: number, deltaY: number): void
  source: string
}): ReactNode {
  const projection = projectCanvas(parseCanvasDocument(props.source))
  if (projection.status !== 'ready') return <p role="alert">{projection.reason}</p>
  return (
    <section aria-label="Canvas View" className="tocktutor-projection" tabIndex={-1}>
      <header>
        <p className="tocktutor-kicker">Canvas</p>
        <h3>{projection.nodes.length} Nodes · {projection.edges.length} Edges</h3>
      </header>
      <div className="tocktutor-canvas-grid">
        {projection.nodes.map(node => {
          const label = node.text ?? node.file ?? `${node.type} node`
          return (
            <article className="tocktutor-canvas-node" key={node.id}>
              <p className="tocktutor-kicker">{node.type}</p>
              <h4>{label}</h4>
              <p>Position {String(node.x)}, {String(node.y)}</p>
              {!node.supported && <p role="note">Unsupported node fields remain inert.</p>}
              <fieldset className="tocktutor-node-actions">
                <legend className="tocktutor-visually-hidden">Move {label}</legend>
                <button aria-label={`Move ${label} left`} onClick={() => { props.onMove(node.id, -20, 0) }} type="button"><ArrowLeft aria-hidden="true" /></button>
                <button aria-label={`Move ${label} up`} onClick={() => { props.onMove(node.id, 0, -20) }} type="button"><ArrowUp aria-hidden="true" /></button>
                <button aria-label={`Move ${label} down`} onClick={() => { props.onMove(node.id, 0, 20) }} type="button"><ArrowDown aria-hidden="true" /></button>
                <button aria-label={`Move ${label} right`} onClick={() => { props.onMove(node.id, 20, 0) }} type="button"><ArrowRight aria-hidden="true" /></button>
              </fieldset>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function BaseView(props: { source: string }): ReactNode {
  const projection = projectBase(props.source)
  if (projection.status !== 'ready') return <p role="alert">{projection.reason}</p>
  return (
    <section aria-label="Base View" className="tocktutor-projection" tabIndex={-1}>
      <header>
        <p className="tocktutor-kicker">Base</p>
        <h3>{projection.views.length} Views</h3>
      </header>
      <div className="tocktutor-base-grid">
        {projection.views.map((view, index) => (
          <article className="tocktutor-base-view" key={`${view.name}-${String(index)}`}>
            <p className="tocktutor-kicker">{view.type || 'Unknown Type'}</p>
            <h4>{view.name}</h4>
            <dl>
              {Object.entries(view.fields).map(([field, value]) => (
                <div key={field}><dt>{field}</dt><dd>{value || '—'}</dd></div>
              ))}
            </dl>
            {view.warnings.map(warning => <p key={warning} role="note">{warning}</p>)}
          </article>
        ))}
      </div>
    </section>
  )
}

export interface TockTutorRouteViewProps {
  assistantPanel?: ReactNode
  nativeActions?: ReactNode
  onActivateTab(paneId: string, path: string): void
  onCancelDispatch?(): void
  onCloseSearch?(): void
  onAddPane(): void
  onEdit(source: string): void
  onFocusPane(paneId: string): void
  onMoveCanvas(nodeId: string, deltaX: number, deltaY: number): void
  onMode(mode: RouteEditorMode): void
  onNewNote?(): void
  onOpenSearch?(): void
  onSave(): void
  onSearchChange?(query: string): void
  onSelect(path: string): void
  onSubmitDispatch?(draft: NativeDispatchDraft): void
  onToggleTask(index: number): void
  reviewPanel?: ReactNode
  snapshot: WorkbenchRouteSnapshot
  titlebarTarget?: Element
}

function NativeDispatchDialog(props: {
  kind: 'capture' | 'new'
  onCancel(): void
  onSubmit(draft: NativeDispatchDraft): void
}): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    if (node === null) return
    node.showModal()
    return () => { if (node.open) node.close() }
  }, [])
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
    <dialog
      aria-label={label}
      aria-modal="true"
      className="tocktutor-dispatch-dialog"
      onCancel={event => { event.preventDefault(); props.onCancel() }}
      ref={dialog}
    >
      <form onSubmit={submit}>
        <header><h2>{label}</h2></header>
        {props.kind === 'new' ? (
          <label>
            Note Path
            <input aria-label="New Note Path" autoFocus maxLength={1_000} name="path" required />
          </label>
        ) : (
          <>
            <label>
              Title
              <input aria-label="Capture Title" autoFocus maxLength={200} name="title" required />
            </label>
            <label>
              Text
              <textarea aria-label="Capture Text" maxLength={100_000} name="text" />
            </label>
          </>
        )}
        <div className="tocktutor-dialog-actions">
          <button onClick={props.onCancel} type="button">Cancel</button>
          <button type="submit">Create</button>
        </div>
      </form>
    </dialog>
  )
}

type WorkbenchGlyphKind =
  | 'back'
  | 'bookmark'
  | 'chat'
  | 'close'
  | 'collapse'
  | 'document'
  | 'folder'
  | 'forward'
  | 'more'
  | 'new'
  | 'panel'
  | 'pencil'
  | 'search'

const WORKBENCH_GLYPHS: Record<WorkbenchGlyphKind, LucideIcon> = {
  back: ChevronLeft,
  bookmark: Bookmark,
  chat: MessageSquare,
  close: X,
  collapse: ChevronRight,
  document: FileText,
  folder: Folder,
  forward: ChevronRight,
  more: Ellipsis,
  new: Plus,
  panel: PanelLeft,
  pencil: Pencil,
  search: Search,
}

function WorkbenchGlyph({ kind }: { kind: WorkbenchGlyphKind }): ReactNode {
  const Glyph = WORKBENCH_GLYPHS[kind]
  return <Glyph aria-hidden="true" />
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
      <div className="tocktutor-tree-row" title={entry.path}>
        <WorkbenchGlyph kind="collapse" />
        <WorkbenchGlyph kind="folder" />
        <span>{fileName(entry.path)}</span>
        <WorkbenchGlyph kind="more" />
      </div>
      <ul role="group">
        <TreeEntries entries={props.entries} onSelect={props.onSelect} path={props.path} prefix={`${entry.path}/`} />
      </ul>
    </li>
  ) : (
    <li key={entry.path} role="treeitem" aria-selected={entry.path === props.path}>
      <button
        aria-current={entry.path === props.path ? 'page' : undefined}
        className="tocktutor-tree-row"
        onClick={() => { props.onSelect(entry.path) }}
        title={entry.path}
        type="button"
      >
        <span className="tocktutor-tree-indent" />
        <WorkbenchGlyph kind="document" />
        <span>{fileName(entry.path)}</span>
        <WorkbenchGlyph kind="more" />
      </button>
    </li>
  ))
}

/** Semantic, authority-free view for the route state machine. */
export function TockTutorRouteView(props: TockTutorRouteViewProps): ReactNode {
  const { snapshot } = props
  const reading = snapshot.path === null
    || snapshot.mode !== 'reading'
    || snapshot.documentKind !== 'markdown'
    ? null
    : projectReading(snapshot.source)
  const previewLabel = snapshot.documentKind === 'canvas'
    ? 'Canvas'
    : snapshot.documentKind === 'base' ? 'Base' : 'Reading'
  const sourceLabel = snapshot.documentKind === 'canvas'
    ? 'Canvas Source'
    : snapshot.documentKind === 'base' ? 'Base Source' : 'Markdown Source'
  const query = snapshot.searchQuery.trim().toLocaleLowerCase()
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
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const sidebarColumns = `${String(sidebarWidth)}px minmax(0, 1fr)`
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
  const words = snapshot.source.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0
  const characters = snapshot.source.length
  const titlebar = (
    <section aria-label="TockTutor Title Bar" className="tocktutor-titlebar" style={{ gridTemplateColumns: sidebarColumns }}>
      <div className="tocktutor-titlebar-sidebar">
        <span className="tocktutor-titlebar-document"><WorkbenchGlyph kind="document" /></span>
        <span><WorkbenchGlyph kind="document" /></span>
        <button aria-label="Search Notes" disabled={props.onOpenSearch === undefined} onClick={props.onOpenSearch} type="button"><WorkbenchGlyph kind="search" /></button>
        <span><WorkbenchGlyph kind="bookmark" /></span>
        <span><WorkbenchGlyph kind="panel" /></span>
      </div>
      <div className="tocktutor-titlebar-main">
        <span className="tocktutor-history"><WorkbenchGlyph kind="back" /><WorkbenchGlyph kind="forward" /></span>
        <div aria-label="Note Tabs" className="tocktutor-tabs" role="tablist">
          {focusedPane?.tabs.map((tab, index) => (
            <button
              aria-selected={tab.path === focusedPane.activePath}
              key={tab.path}
              onClick={() => { props.onActivateTab(focusedPane.id, tab.path) }}
              onKeyDown={event => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                event.preventDefault()
                const offset = event.key === 'ArrowLeft' ? -1 : 1
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
              {tab.path === focusedPane.activePath && <WorkbenchGlyph kind="close" />}
            </button>
          ))}
        </div>
        <button aria-label="New Note" className="tocktutor-new-tab" disabled={props.onNewNote === undefined} onClick={props.onNewNote} type="button"><WorkbenchGlyph kind="new" /></button>
        <span className="tocktutor-titlebar-spacer" />
        <span className="tocktutor-panel-icon"><WorkbenchGlyph kind="panel" /></span>
      </div>
    </section>
  )
  return (
    <main
      aria-label="TockTutor Workbench"
      className="tocktutor-workbench"
      data-phase={snapshot.phase}
      tabIndex={-1}
    >
      <style>{ROUTE_CSS}</style>
      {props.titlebarTarget === undefined ? titlebar : createPortal(titlebar, props.titlebarTarget)}
      {snapshot.dispatchDialog !== null && (
        <NativeDispatchDialog
          kind={snapshot.dispatchDialog}
          onCancel={() => { props.onCancelDispatch?.() }}
          onSubmit={draft => { props.onSubmitDispatch?.(draft) }}
        />
      )}
      <div className="tocktutor-grid" style={{ gridTemplateColumns: sidebarColumns }}>
        <aside aria-label="Files" className="tocktutor-sidebar">
          <header className="tocktutor-sidebar-header">
            <h1>Files</h1>
            <span><WorkbenchGlyph kind="more" /></span>
            <span><Upload aria-hidden="true" /></span>
            <span><WorkbenchGlyph kind="folder" /></span>
            <span><PanelTop aria-hidden="true" /></span>
          </header>
          <div className="tocktutor-sidebar-content">
            {snapshot.searchOpen && (
              <section aria-label="Search Notes" className="tocktutor-search">
                <label htmlFor="tocktutor-search-query">Search Notes</label>
                <div>
                  <input
                    aria-label="Search Notes Query"
                    autoFocus
                    id="tocktutor-search-query"
                    maxLength={1_000}
                    onChange={event => { props.onSearchChange?.(event.target.value) }}
                    type="search"
                    value={snapshot.searchQuery}
                  />
                  <button aria-label="Close Search" onClick={() => { props.onCloseSearch?.() }} type="button"><WorkbenchGlyph kind="close" /></button>
                </div>
                <p aria-live="polite" role="status">{documents.length} matching notes.</p>
              </section>
            )}
            <nav aria-label="Vault Notes">
              {snapshot.phase === 'loading' && <p>Loading notes…</p>}
              {snapshot.phase === 'inactive' && <p role="alert">No Active Vault</p>}
              {snapshot.phase === 'error' && <p role="alert">{snapshot.message}</p>}
              {snapshot.phase === 'ready' && documents.length === 0 && <p>No supported notes found.</p>}
              <ul className="tocktutor-tree" role="tree">
                <TreeEntries entries={visibleTreeEntries} onSelect={props.onSelect} path={snapshot.path} />
              </ul>
            </nav>
          </div>
          <button
            aria-expanded={panel === 'utilities'}
            className="tocktutor-vault-switcher"
            onClick={() => { setPanel(current => current === 'utilities' ? null : 'utilities') }}
            type="button"
          >
            <WorkbenchGlyph kind="collapse" />
            <span>{snapshot.vault === null ? 'Choose Vault' : 'TockTutor Vault'}</span>
            <WorkbenchGlyph kind="more" />
          </button>
        </aside>
        <button
          aria-label={`Resize Files Sidebar, ${String(sidebarWidth)} Pixels`}
          className="tocktutor-sidebar-resize"
          onKeyDown={resizeSidebarWithKeyboard}
          onPointerDown={beginSidebarResize}
          style={{ left: sidebarWidth - 4 }}
          title="Drag or Use Left and Right Arrow Keys"
          type="button"
        />
        <section aria-label="Note Editor" className="tocktutor-editor" id="tocktutor-note-editor" role="tabpanel">
          <header className="tocktutor-editor-header">
            <h2>{noteTitle(snapshot.path)}</h2>
            <div className="tocktutor-editor-actions">
              <button
                aria-label={snapshot.mode === 'source' ? previewLabel : sourceLabel}
                onClick={() => { props.onMode(snapshot.mode === 'source' ? 'reading' : 'source') }}
                type="button"
              ><WorkbenchGlyph kind="pencil" /></button>
              <span><Music aria-hidden="true" /></span>
              <span><Folder aria-hidden="true" /></span>
              <button
                aria-label="More Note Actions"
                aria-expanded={panel === 'utilities'}
                onClick={() => { setPanel(current => current === 'utilities' ? null : 'utilities') }}
                type="button"
              ><WorkbenchGlyph kind="more" /></button>
            </div>
          </header>
          <div className="tocktutor-editor-body">
            {snapshot.path === null ? (
              <div className="tocktutor-empty">
                <p className="tocktutor-kicker">Ready When You Are</p>
                <h2>Select a Note</h2>
                <p>Choose a Markdown note from the vault to read or edit its exact source.</p>
              </div>
            ) : snapshot.mode === 'source' ? (
              <textarea
                aria-label={sourceLabel}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => { props.onEdit(event.target.value) }}
                spellCheck="true"
                value={snapshot.source}
              />
            ) : snapshot.documentKind === 'canvas' ? (
              <CanvasView onMove={props.onMoveCanvas} source={snapshot.source} />
            ) : snapshot.documentKind === 'base' ? (
              <BaseView source={snapshot.source} />
            ) : reading?.status === 'ready' ? (
              <article aria-label="Reading View" className="tocktutor-reading" tabIndex={-1}>
                {reading.warnings.map(warning => <p className="tocktutor-warning" key={warning} role="note">{warning}</p>)}
                {reading.blocks.map((block, index) => (
                  <ReadingBlockView
                    block={block}
                    key={`${block.kind}-${String(index)}`}
                    onToggleTask={props.onToggleTask}
                  />
                ))}
              </article>
            ) : (
              <p role="alert">{reading?.reason ?? 'Reading view is unavailable.'}</p>
            )}
          </div>
          <footer aria-label="TockTutor Status Bar" className="tocktutor-statusbar">
            <output aria-live="polite" className="tocktutor-message">{snapshot.message}</output>
            {snapshot.path !== null && (
              <div>
                <span>0 Backlinks</span>
                <span>{snapshot.mode === 'reading' ? 'Live Preview' : 'Source'}</span>
                <span>{String(words)} Words</span>
                <span>{String(characters)} Characters</span>
                <button
                  aria-label="Open Assistant"
                  aria-expanded={panel === 'assistant'}
                  onClick={() => { setPanel(current => current === 'assistant' ? null : 'assistant') }}
                  type="button"
                ><WorkbenchGlyph kind="chat" /></button>
              </div>
            )}
          </footer>
        </section>
        <aside aria-label="Assistant Panel" className="tocktutor-right-panel" hidden={panel !== 'assistant'}>
          <header><h2>Assistant</h2><button aria-label="Close Assistant" onClick={() => { setPanel(null) }} type="button"><WorkbenchGlyph kind="close" /></button></header>
          <div className="tocktutor-assistant-content">{props.assistantPanel}</div>
        </aside>
        <aside aria-label="Workbench Utilities" className="tocktutor-right-panel" hidden={panel !== 'utilities'}>
          <header><h2>More Options</h2><button aria-label="Close More Options" onClick={() => { setPanel(null) }} type="button"><WorkbenchGlyph kind="close" /></button></header>
          <section aria-label="Pane Groups" className="tocktutor-pane-groups">
            <div className="tocktutor-pane-heading">
              <h2>Pane Groups</h2>
              <button aria-label="Add Pane" disabled={snapshot.panes.length >= MAX_PANE_GROUPS} onClick={props.onAddPane} type="button"><WorkbenchGlyph kind="new" /></button>
            </div>
            <div className="tocktutor-pane-list">
              {snapshot.panes.map((pane, index) => (
                <button aria-pressed={pane.id === snapshot.focusedPaneId} key={pane.id} onClick={() => { props.onFocusPane(pane.id) }} title={pane.activePath ?? `Pane ${String(index + 1)}`} type="button">
                  <span>Pane {String(index + 1)}</span><small>{pane.activePath ?? 'Empty'}</small>
                </button>
              ))}
            </div>
          </section>
          <section aria-label="Shared Review Panel" className="tocktutor-review">
            <header><h2>Reviews</h2></header>
            <div className="tocktutor-review-content">{props.reviewPanel ?? <p role="status">No review workflow is active.</p>}</div>
          </section>
          <section aria-label="Native Actions" className="tocktutor-native-actions">
            <header><h2>Native Actions</h2></header>
            <div className="tocktutor-native-actions-content">{props.nativeActions ?? <p role="status">No native actions are available.</p>}</div>
          </section>
        </aside>
      </div>
    </main>
  )
}

export type TockTutorRouteProps = TockTutorRouteOwnerProps &
  PropsRenderSlots<
    | typeof TOCKTUTOR_ASSISTANT_PANEL_SLOT
    | typeof TOCKTUTOR_NATIVE_ACTIONS_SLOT
    | typeof TOCKTUTOR_REVIEW_PANEL_SLOT
  > & {
    remote: WorkbenchRouteRemote
  }

function TockTutorAssistantPanelOutlet(props: {
  activePath: string | null
  renderSlot: TockTutorRouteProps['renderSlot']
  vault: VaultReference | null
}): ReactNode {
  return props.renderSlot(TOCKTUTOR_ASSISTANT_PANEL_SLOT, {
    activePath: props.activePath,
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
    fallback: <p role="status">No review workflow is active.</p>,
  })
}

function TockTutorNativeActionsOutlet(props: {
  activePath: string | null
  handleDispatch: TockTutorNativeActionsOwnerProps['handleDispatch']
  renderSlot: TockTutorRouteProps['renderSlot']
  vault: VaultReference | null
}): ReactNode {
  return props.renderSlot(TOCKTUTOR_NATIVE_ACTIONS_SLOT, {
    activePath: props.activePath,
    handleDispatch: props.handleDispatch,
    vault: props.vault,
  }, {
    fallback: <p role="status">No native actions are available.</p>,
  })
}

/** Root-scoped component contributed to TockTeam's exact Desktop route seat. */
export function TockTutorRoute(props: TockTutorRouteProps): ReactNode {
  const controller = useMemo(
    () => new WorkbenchRouteController(props.remote, props.navigate),
    [props.navigate, props.remote],
  )
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void controller.syncLocation(props.location.pathname)
  }, [controller, props.location.pathname])
  useEffect(() => () => { controller.dispose() }, [controller])
  useEffect(() => {
    if (snapshot.path === null) return
    root.current?.querySelector<HTMLElement>(snapshot.mode === 'source' ? 'textarea' : '[aria-label$="View"]')?.focus()
  }, [snapshot.mode, snapshot.path])
  useEffect(() => {
    if (snapshot.searchOpen) root.current?.querySelector<HTMLInputElement>('[aria-label="Search Notes Query"]')?.focus()
  }, [snapshot.searchOpen])
  useEffect(() => {
    const node = root.current
    if (node === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      const shortcut = resolveEditorShortcut(event, /Mac|iPhone|iPad/u.test(globalThis.navigator?.platform ?? ''))
      if (shortcut !== 'save') return
      event.preventDefault()
      void controller.save()
    }
    node.addEventListener('keydown', onKeyDown)
    return () => { node.removeEventListener('keydown', onKeyDown) }
  }, [controller])
  return (
    <div className="tocktutor-root" ref={root}>
      <TockTutorRouteView
        assistantPanel={(
          <TockTutorAssistantPanelOutlet
            activePath={snapshot.path}
            renderSlot={props.renderSlot}
            vault={snapshot.vault}
          />
        )}
        nativeActions={(
          <TockTutorNativeActionsOutlet
            activePath={snapshot.path}
            handleDispatch={event => controller.handleDispatch(event)}
            renderSlot={props.renderSlot}
            vault={snapshot.vault}
          />
        )}
        onActivateTab={(paneId, path) => { void controller.activateTab(paneId, path) }}
        onAddPane={() => { void controller.addPane() }}
        onCancelDispatch={() => { controller.cancelDispatchDialog() }}
        onCloseSearch={() => { controller.closeSearch() }}
        onEdit={source => { controller.edit(source) }}
        onFocusPane={paneId => { void controller.focusPane(paneId) }}
        onMode={mode => { controller.setMode(mode) }}
        onMoveCanvas={(nodeId, deltaX, deltaY) => { controller.moveCanvasNode(nodeId, deltaX, deltaY) }}
        onNewNote={() => { void controller.handleDispatch({ action: 'new', kind: 'quick-action', operationId: crypto.randomUUID() }) }}
        onOpenSearch={() => { controller.openSearch('') }}
        onSave={() => { void controller.save() }}
        onSearchChange={query => { controller.setSearchQuery(query) }}
        onSelect={path => { void controller.select(path) }}
        onSubmitDispatch={draft => { void controller.submitDispatchDialog(draft) }}
        onToggleTask={index => { controller.toggleTask(index) }}
        reviewPanel={(
          <TockTutorReviewPanelOutlet
            activePath={snapshot.path}
            renderSlot={props.renderSlot}
            vault={snapshot.vault}
          />
        )}
        snapshot={snapshot}
        {...(typeof document === 'undefined'
          ? {}
          : { titlebarTarget: document.getElementById('tockteam-window-titlebar-slot') ?? document.body })}
      />
    </div>
  )
}

const ROUTE_CSS = `
.tocktutor-root { height: 100%; min-height: 0; }
.tocktutor-workbench {
  --tt-accent: var(--dsw-alias-accent-primary, #533afd);
  --tt-bg: var(--dsw-alias-bg-base, #fff);
  --tt-border: var(--dsw-alias-border-l1, var(--dsw-alias-border-subtle, #e1e3e7));
  --tt-muted: var(--dsw-alias-fg-muted, #71717a);
  --tt-footer-height: 28px;
  --tt-panel: var(--dsw-alias-bg-elevated, #fff);
  --tt-selected: color-mix(in srgb, var(--tt-accent) 14%, var(--tt-panel));
  --tt-text: var(--dsw-alias-fg-primary, #27272a);
  background: var(--tt-bg);
  box-sizing: border-box;
  color: var(--tt-text);
  font: 14px/1.45 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  height: 100%;
  min-height: 0;
  padding-top: 0;
}
.tocktutor-workbench *, .tocktutor-workbench *::before, .tocktutor-workbench *::after { box-sizing: border-box; }
.tocktutor-workbench svg { display: block; height: 16px; width: 16px; }
.tocktutor-workbench button { color: inherit; font: inherit; }
.tocktutor-workbench [hidden] { display: none !important; }
.tocktutor-titlebar {
  --tt-accent: var(--dsw-alias-accent-primary, #533afd);
  --tt-border: var(--dsw-alias-border-l1, var(--dsw-alias-border-subtle, #e1e3e7));
  --tt-muted: var(--dsw-alias-fg-muted, #71717a);
  --tt-panel: var(--dsw-alias-bg-elevated, #fff);
  --tt-tab-border: #d1d5db;
  --tt-text: var(--dsw-alias-fg-primary, #27272a);
  -webkit-app-region: drag;
  background: var(--tockteam-shell-chrome, var(--tt-panel));
  box-sizing: border-box;
  color: var(--tt-text);
  font: 14px/1.45 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  border-bottom: 1px solid var(--tt-tab-border);
  display: grid;
  grid-template-columns: var(--tockteam-primary-sidebar-width, 280px) minmax(0, 1fr);
  height: var(--tockteam-titlebar-height, 40px);
  left: 0;
  position: absolute;
  right: 0;
  top: 0;
  z-index: 2147483647;
}
.tocktutor-titlebar *, .tocktutor-titlebar *::before, .tocktutor-titlebar *::after { box-sizing: border-box; }
.tocktutor-titlebar svg { display: block; height: 20px; width: 20px; }
.tocktutor-titlebar button { -webkit-app-region: no-drag; color: inherit; font: inherit; }
.tocktutor-titlebar-sidebar, .tocktutor-titlebar-main { align-items: center; display: flex; min-width: 0; }
.tocktutor-titlebar-sidebar { border-right: 1px solid var(--tt-border); gap: 8px; justify-content: flex-start; padding: 0 8px 0 46px; }
.tocktutor-titlebar-sidebar > span, .tocktutor-titlebar-sidebar > button { align-items: center; background: transparent; border: 0; color: var(--tt-muted); display: inline-flex; height: 28px; justify-content: center; padding: 0; width: 22px; }
.tocktutor-titlebar-sidebar > span:last-child { margin-left: auto; }
.tocktutor-titlebar-sidebar .tocktutor-titlebar-document { background: color-mix(in srgb, var(--tt-text) 8%, transparent); border-radius: 5px; color: var(--tt-text); }
.tocktutor-titlebar-main { gap: 4px; padding: 0 8px; }
.tocktutor-history { color: color-mix(in srgb, var(--tt-muted) 45%, transparent); display: flex; gap: 5px; margin-right: 18px; padding: 0 6px; }
.tocktutor-tabs { --tt-tab-curve: 10px; align-items: flex-end; align-self: stretch; display: flex; gap: 4px; margin-bottom: -1px; margin-inline: calc(var(--tt-tab-curve) * -2); min-width: 0; overflow: visible; padding-inline: calc(var(--tt-tab-curve) * 2); }
.tocktutor-tabs button { align-items: center; background: var(--tt-panel); border: 1px solid var(--tt-tab-border); border-bottom: 0; border-radius: 10px 10px 0 0; box-shadow: inset 0 1px 0 rgb(255 255 255 / 18%); display: flex; gap: 12px; height: 30px; margin-bottom: -1px; max-width: 220px; min-width: 118px; padding: 0 10px; position: relative; z-index: 1; }
.tocktutor-tabs button[aria-selected="false"] { background: color-mix(in srgb, var(--tt-panel) 70%, transparent); border-bottom: 1px solid var(--tt-tab-border); box-shadow: none; color: var(--tt-muted); margin-bottom: 2px; }
.tocktutor-tabs button[aria-selected="true"]::before, .tocktutor-tabs button[aria-selected="true"]::after { border-radius: 9999px; bottom: -1px; box-shadow: inset 0 0 0 1px var(--tt-tab-border), 0 0 0 calc(var(--tt-tab-curve) * 4) var(--tt-panel); content: ''; height: calc(var(--tt-tab-curve) * 2); pointer-events: none; position: absolute; width: calc(var(--tt-tab-curve) * 2); }
.tocktutor-tabs button[aria-selected="true"]::before { clip-path: inset(50% calc(var(--tt-tab-curve) * -1) 0 50%); left: calc(var(--tt-tab-curve) * -2); }
.tocktutor-tabs button[aria-selected="true"]::after { clip-path: inset(50% 50% 0 calc(var(--tt-tab-curve) * -1)); right: calc(var(--tt-tab-curve) * -2); }
.tocktutor-tabs button > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tocktutor-tabs button svg { height: 14px; margin-left: auto; width: 14px; }
.tocktutor-new-tab, .tocktutor-panel-icon { background: transparent; border: 0; color: var(--tt-muted); padding: 6px; }
.tocktutor-titlebar-spacer { flex: 1; }
.tocktutor-grid { display: grid; grid-template-columns: var(--tockteam-primary-sidebar-width, 280px) minmax(0, 1fr); height: 100%; min-height: 0; position: relative; }
.tocktutor-sidebar { background: var(--tockteam-shell-chrome, var(--tt-panel)); border-right: 1px solid var(--tt-border); display: grid; grid-template-rows: 40px minmax(0, 1fr) var(--tt-footer-height); min-height: 0; overflow: hidden; }
.tocktutor-sidebar-resize { background: transparent; border: 0; bottom: 0; cursor: ew-resize; margin: 0; padding: 0; position: absolute; top: 0; touch-action: none; width: 8px; z-index: 5; }
.tocktutor-sidebar-resize::after { background: transparent; bottom: 0; content: ''; left: 3px; position: absolute; top: 0; width: 2px; }
.tocktutor-sidebar-resize:focus-visible::after { background: var(--tt-accent); }
.tocktutor-sidebar-resize:focus-visible { outline: none; }
.tocktutor-sidebar-header { align-items: center; border-bottom: 1px solid var(--tt-border); display: flex; gap: 10px; padding: 0 10px; }
.tocktutor-sidebar-header h1 { font-size: 14px; font-weight: 600; margin: 0 auto 0 0; }
.tocktutor-sidebar-header span { align-items: center; color: var(--tt-muted); display: inline-flex; font-size: 14px; justify-content: center; }
.tocktutor-sidebar-header svg { height: 14px; width: 14px; }
.tocktutor-sidebar-content { min-height: 0; overflow: auto; padding: 3px 5px; }
.tocktutor-search { border-bottom: 1px solid var(--tt-border); margin: 0 0 8px; padding: 0 3px 8px; }
.tocktutor-search > label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px; }
.tocktutor-search > div { display: flex; gap: 4px; }
.tocktutor-search input { border: 1px solid var(--tt-border); border-radius: 5px; font: inherit; min-width: 0; padding: 5px 7px; width: 100%; }
.tocktutor-search button { background: transparent; border: 1px solid var(--tt-border); border-radius: 5px; width: 28px; }
.tocktutor-search p, .tocktutor-sidebar nav > p { color: var(--tt-muted); font-size: 12px; margin: 7px 4px; }
.tocktutor-tree, .tocktutor-tree ul { list-style: none; margin: 0; padding: 0; }
.tocktutor-tree ul { padding-left: 16px; }
.tocktutor-tree-row { align-items: center; background: transparent; border: 0; border-radius: 4px; color: inherit; display: grid; font-weight: 500; gap: 7px; grid-template-columns: 12px 16px minmax(0, 1fr) 16px; min-height: 32px; overflow: hidden; padding: 4px 5px; text-align: left; width: 100%; }
.tocktutor-tree-row > span:not(.tocktutor-tree-indent) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tocktutor-tree-row > svg:first-child { height: 12px; width: 12px; }
.tocktutor-tree-row > svg:last-child { color: var(--tt-muted); height: 14px; margin-left: auto; opacity: .8; width: 14px; }
.tocktutor-tree-row:hover { background: color-mix(in srgb, var(--tt-text) 5%, transparent); }
.tocktutor-tree-row[aria-current="page"] { background: var(--tt-selected); }
.tocktutor-tree-row[aria-current="page"] > svg:last-child { color: var(--tt-text); }
.tocktutor-tree-indent { width: 12px; }
.tocktutor-vault-switcher { align-items: center; background: var(--tockteam-shell-chrome, var(--tt-panel)); border: 0; border-top: 1px solid var(--tt-border); display: grid; gap: 6px; grid-template-columns: 14px minmax(0, 1fr) 16px; padding: 0 10px; text-align: left; }
.tocktutor-vault-switcher > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tocktutor-vault-switcher svg { height: 13px; width: 13px; }
.tocktutor-editor { background: var(--tt-panel); display: grid; grid-template-rows: 40px minmax(0, 1fr) var(--tt-footer-height); min-height: 0; overflow: hidden; }
.tocktutor-editor-header { align-items: center; border-bottom: 1px solid var(--tt-border); display: flex; justify-content: center; min-width: 0; padding: 0 10px; position: relative; }
.tocktutor-editor-header h2 { color: var(--tt-muted); font-size: 13px; font-weight: 500; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tocktutor-editor-actions { align-items: center; display: flex; gap: 4px; position: absolute; right: 10px; }
.tocktutor-editor-actions button, .tocktutor-editor-actions span { align-items: center; background: transparent; border: 0; color: var(--tt-muted); display: inline-flex; height: 28px; justify-content: center; padding: 0; width: 26px; }
.tocktutor-editor-body { min-height: 0; overflow: auto; position: relative; }
.tocktutor-editor textarea { background: var(--tt-panel); border: 0; color: var(--tt-text); font: 14px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; height: 100%; min-height: 0; outline: none; padding: 36px max(28px, calc((100% - 768px) / 2)); resize: none; tab-size: 2; width: 100%; }
.tocktutor-reading { margin: 0 auto; max-width: 768px; min-height: 100%; padding: 18px 0 72px; width: calc(100% - 48px); }
.tocktutor-reading h1, .tocktutor-reading h2, .tocktutor-reading h3 { font-weight: 650; line-height: 1.25; margin: 0 0 16px; }
.tocktutor-reading h1 { font-size: 30px; }
.tocktutor-reading h1 > svg { color: color-mix(in srgb, var(--tt-muted) 45%, transparent); display: inline-block; height: 14px; margin-left: -20px; margin-right: 6px; transform: translateY(-3px); width: 14px; }
.tocktutor-reading h2 { font-size: 24px; }
.tocktutor-reading h3 { font-size: 20px; }
.tocktutor-reading p { font-size: 18px; margin: 0 0 16px; }
.tocktutor-reading pre { background: color-mix(in srgb, var(--tt-text) 4%, var(--tt-panel)); border: 1px solid var(--tt-border); border-radius: 6px; overflow: auto; padding: 12px; }
.tocktutor-statusbar { align-items: center; border-top: 1px solid var(--tt-border); color: var(--tt-muted); display: flex; font-size: 12px; min-width: 0; padding: 0 8px; }
.tocktutor-statusbar > div { align-items: center; display: flex; gap: 18px; margin-left: auto; white-space: nowrap; }
.tocktutor-statusbar button { background: transparent; border: 0; color: var(--tt-muted); padding: 2px 0; }
.tocktutor-statusbar button svg { height: 17px; width: 17px; }
.tocktutor-message, .tocktutor-visually-hidden { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
.tocktutor-kicker { color: var(--tt-muted); font-size: 11px; font-weight: 650; letter-spacing: .08em; margin: 0 0 2px; text-transform: uppercase; }
.tocktutor-empty { left: 50%; max-width: 420px; padding: 32px; position: absolute; text-align: center; top: 45%; transform: translate(-50%, -50%); width: 100%; }
.tocktutor-empty h2 { font-size: 20px; margin: 0; }
.tocktutor-empty > p:last-child { color: var(--tt-muted); }
.tocktutor-right-panel { background: var(--tt-panel); border-left: 1px solid var(--tt-border); bottom: 0; box-shadow: -8px 0 24px rgb(0 0 0 / 6%); display: grid; grid-template-rows: 40px minmax(0, 1fr); overflow: auto; position: fixed; right: 0; top: var(--tockteam-titlebar-height, 40px); width: min(360px, calc(100vw - 262px)); z-index: 20; }
.tocktutor-right-panel > header { align-items: center; border-bottom: 1px solid var(--tt-border); display: flex; justify-content: space-between; padding: 0 12px; }
.tocktutor-right-panel > header h2, .tocktutor-review h2, .tocktutor-native-actions h2, .tocktutor-pane-groups h2 { font-size: 14px; margin: 0; }
.tocktutor-right-panel > header button { background: transparent; border: 0; padding: 5px; }
.tocktutor-assistant-content, .tocktutor-review-content, .tocktutor-native-actions-content { min-height: 0; overflow: auto; }
.tocktutor-pane-groups, .tocktutor-review, .tocktutor-native-actions { border-top: 1px solid var(--tt-border); padding: 12px; }
.tocktutor-pane-heading { align-items: center; display: flex; justify-content: space-between; }
.tocktutor-pane-heading button { background: transparent; border: 1px solid var(--tt-border); border-radius: 4px; height: 26px; width: 26px; }
.tocktutor-pane-list { display: grid; gap: 6px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 8px; }
.tocktutor-pane-list button { background: transparent; border: 1px solid var(--tt-border); border-radius: 5px; overflow: hidden; padding: 6px; text-align: left; }
.tocktutor-pane-list button[aria-pressed="true"] { border-color: var(--tt-accent); }
.tocktutor-pane-list span, .tocktutor-pane-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tocktutor-pane-list small, .tocktutor-review-content, .tocktutor-native-actions-content { color: var(--tt-muted); font-size: 12px; }
.tocktutor-projection { min-height: 0; overflow: auto; padding: 24px; }
.tocktutor-projection > header h3 { font-size: 17px; margin: 0 0 18px; }
.tocktutor-canvas-grid, .tocktutor-base-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.tocktutor-canvas-node, .tocktutor-base-view { background: var(--tt-bg); border: 1px solid var(--tt-border); border-radius: 8px; min-width: 0; padding: 14px; }
.tocktutor-canvas-node h4, .tocktutor-base-view h4 { font-size: 14px; margin: 0 0 8px; overflow-wrap: anywhere; }
.tocktutor-canvas-node > p:not(.tocktutor-kicker), .tocktutor-base-view > p:not(.tocktutor-kicker) { color: var(--tt-muted); font-size: 12px; }
.tocktutor-node-actions { border: 0; display: flex; gap: 4px; margin: 10px 0 0; padding: 0; }
.tocktutor-node-actions button, .tocktutor-dialog-actions button { background: var(--tt-panel); border: 1px solid var(--tt-border); border-radius: 5px; color: inherit; cursor: pointer; padding: 7px 10px; }
.tocktutor-base-view dl { margin: 0; }
.tocktutor-base-view dl > div { border-top: 1px solid var(--tt-border); display: grid; gap: 8px; grid-template-columns: minmax(72px, .35fr) minmax(0, 1fr); padding: 7px 0; }
.tocktutor-base-view dt { color: var(--tt-muted); }
.tocktutor-base-view dd { margin: 0; overflow-wrap: anywhere; }
.tocktutor-task { align-items: flex-start; display: flex; gap: 8px; margin: 8px 0; }
.tocktutor-warning { border-left: 3px solid #b7791f; color: var(--tt-muted); padding-left: 10px; }
.tocktutor-dispatch-dialog { align-items: center; background: transparent; border: 0; height: 100%; inset: 0; justify-content: center; max-height: none; max-width: none; padding: 24px; position: fixed; width: 100%; }
.tocktutor-dispatch-dialog::backdrop { background: rgb(0 0 0 / 35%); }
.tocktutor-dispatch-dialog[open] { display: flex; }
.tocktutor-dispatch-dialog form { background: var(--tt-panel); border: 1px solid var(--tt-border); border-radius: 8px; display: grid; gap: 14px; max-width: 480px; padding: 20px; width: 100%; }
.tocktutor-dispatch-dialog h2 { font-size: 17px; margin: 0; }
.tocktutor-dispatch-dialog label { display: grid; font-weight: 650; gap: 5px; }
.tocktutor-dispatch-dialog input, .tocktutor-dispatch-dialog textarea { border: 1px solid var(--tt-border); border-radius: 5px; font: inherit; padding: 8px; }
.tocktutor-dialog-actions { display: flex; gap: 8px; justify-content: flex-end; }
.tocktutor-workbench button:focus-visible, .tocktutor-workbench input:focus-visible, .tocktutor-workbench textarea:focus-visible { outline: 2px solid var(--tt-accent); outline-offset: 2px; }
@media (max-width: 760px) {
  .tocktutor-statusbar > div { gap: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .tocktutor-workbench *, .tocktutor-workbench *::before, .tocktutor-workbench *::after { scroll-behavior: auto !important; transition-duration: 0s !important; }
}
`
