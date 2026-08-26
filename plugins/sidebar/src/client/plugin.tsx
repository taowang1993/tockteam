import { Alert } from '@tockteam/ui/alert'
import { Badge } from '@tockteam/ui/badge'
import { Button } from '@tockteam/ui/button'
import { Empty } from '@tockteam/ui/empty'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { Switch } from '@tockteam/ui/switch'
import { Textarea } from '@tockteam/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@tockteam/ui/tooltip'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  Blocks,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  History,
  ListFilter,
  Maximize2,
  Monitor,
  Notebook,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Plus,
  RefreshCw,
  Settings,
  SquareTerminal,
  X,
  type LucideIcon,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import type { DesktopBridge } from '../../../../src/contracts.ts'
import type { DesktopPanels } from '../../../panel-controls/src/client.ts'
import type { PinnedSummary } from '../../../pinned-summary/src/client.ts'
import type {
  WorkspaceFacts,
  WorkspaceHostMutationResponse,
  WorkspaceMutation,
  WorkspaceSnapshot,
} from '../protocol.ts'
import { WORKSPACE_API_PATH } from '../protocol.ts'
import {
  DEFAULT_SIDEBAR_PREFERENCES,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from '../sidebar-preferences.ts'
import {
  BrowserView,
  FilesView,
  FileView,
  SideToolsPanel,
  ToolIcon,
} from './SideToolsPanel.tsx'
import type { LocaleService, Translate } from '../../../shared/i18n.ts'
import { useTranslate } from '../../../shared/use-i18n.ts'
import { WORKSPACE_MESSAGES, type WorkspaceMessage } from './i18n.ts'
import {
  TOCKTEAM_SURFACE_VIEW_SERVICE,
  type TockTeamSurfaceView,
} from '../../../shared/surface.ts'
import {
  DesktopSidebarService,
  type DesktopSidebar,
  type DesktopSidebarSnapshot,
} from './sidebar-service.ts'
import { HttpSidebarPreferencesStorage } from './sidebar-storage.ts'
import {
  betterSidebarApi,
  type BetterSidebarGitLogEntry,
  type BetterSidebarScope,
  workspaceChangesFromBetterSidebar,
} from './better-sidebar-api.ts'
import {
  nextReviewCommentId,
  ReviewCommentsService,
  type ReviewCommentSide,
  type ReviewSessionsService,
  type ReviewInputTriggersService,
} from './review-comments.ts'
import { reviewCommitFromBetterSidebar } from './review-diff.ts'
import type { GitReviewCommit } from './review-types.ts'
import {
  SidebarRuntimeSettingsService,
  type SidebarRuntimePreferences,
} from './runtime-settings.ts'
import {
  canonicalTockTeamPath,
  isTockCoderPath,
  isTockTutorPath,
  readTockTutorRouteLocation,
  resolveTockTutorNavigation,
  TOCKCODER_ROUTE_PREFIX,
  TOCKTUTOR_ROUTE_PREFIX,
  TOCKTUTOR_ROUTE_SLOT,
  type TockTutorRouteLocation,
  type TockTutorRouteOwnerProps,
} from './tocktutor-route.ts'

interface ObservableSnapshot<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

interface SessionSummary {
  blank?: boolean
  cwd?: string
}

interface SessionListState {
  current?: string
  byId: Record<string, SessionSummary>
}

interface RunningToolCall {
  callId: string
  name: string
  argsRaw: string
  subCalls?: readonly RunningToolCall[]
}

interface ConversationSnapshot {
  runningCalls?: readonly RunningToolCall[]
}

interface SessionBinding {
  session: ObservableSnapshot<ConversationSnapshot>
}

interface SessionsService extends ReviewSessionsService {
  list: ObservableSnapshot<SessionListState>
  binding(id: string): SessionBinding | undefined
  fork(options: { sessionId: string; increaseTitle?: boolean }): Promise<string>
  open(id: string): void
}

interface WorkspaceView {
  workspaceId: string
}

interface WorkspacesService {
  create(input: { path: string }): Promise<WorkspaceView>
  openPath(path: string): Promise<void>
  startSession(workspaceId?: string): void
}

interface ClientContext {
  effect(effect: () => (() => void) | void, label?: string): void
  get(name: string): unknown
  reflect: {
    provide(name: string, value: unknown, options?: unknown): (() => Promise<void> | void) | void
  }
}

interface SidebarSettingsState {
  openByDefault: boolean
  revision: number
  tabsEnabled: Record<string, boolean>
  viewersEnabled: Record<string, boolean>
  width: number
}

interface BoundSidebarSettingsActions {
  sync(
    openByDefault: boolean,
    revision: number,
    tabsEnabled: Record<string, boolean>,
    viewersEnabled: Record<string, boolean>,
    width: number,
  ): void
}

interface SidebarSettingsProps {
  reset(): void
  setOpenByDefault(open: boolean): void
  setTabEnabled(id: string, enabled: boolean): void
  setViewerEnabled(id: string, enabled: boolean): void
  setWidth(width: number): void
  runtime: SidebarRuntimeSettingsService
  sidebar: DesktopSidebar
  t: Translate<WorkspaceMessage>
  useStore<T>(selector: (state: SidebarSettingsState) => T): T
}

interface SlotsService {
  inject(name: string, register: () => unknown): void
  register(options: {
    id: string
    inject(actions: BoundSidebarSettingsActions): Omit<
      SidebarSettingsProps,
      't' | 'useStore'
    >
    locale: string
    label: () => string
    name: string
    order: number
    store: unknown
  }, component: (props: SidebarSettingsProps) => JSX.Element): unknown
}

interface RouteState {
  location: TockTutorRouteLocation
}

interface RouteActions {
  setLocation(location: TockTutorRouteLocation): void
}

interface RouteHostProps {
  actions: RouteActions
  renderSlot(name: string, owner: TockTutorRouteOwnerProps): ReactNode
  useStore<T>(selector: (state: RouteState) => T): T
}

interface RouteSlotsService {
  entries(name: string): readonly unknown[]
  inject(name: string, register: () => unknown): unknown
  register(options: {
    children: Record<string, { kind: 'single'; scope: 'root' }>
    id: string
    name: string
    order: number
    store: unknown
  }, component: (props: RouteHostProps) => ReactNode): unknown
  subscribe(name: string, listener: () => void): () => void
}

interface WorkspaceToolsState {
  maximized: boolean
  open: boolean
  view: string
  width: number
}

export interface WorkspaceTools {
  getSnapshot(): WorkspaceToolsState
  subscribe(listener: () => void): () => void
  isOpen(): boolean
  openBrowser(): void
  openBrowserUrl(url: string): void
  openFile(path: string): void
  openFiles(): void
  openMenu(): void
  openReview(): void
  openSideChat(): Promise<void>
  openTrajectory(): void
  setOpen(open: boolean): void
  toggle(): void
  togglePanelMaximized(): void
  toggleSidePanel(): void
}

declare global {
  interface Window {
    dshDesktop?: DesktopBridge
  }
}

export const inject = [
  'desktopPanels',
  'locale',
  'pinnedSummary',
  'sessions',
  'inputTriggers',
  'slots',
  TOCKTEAM_SURFACE_VIEW_SERVICE,
  'workspaces',
]

const EMPTY_CONVERSATION: ConversationSnapshot = { runningCalls: [] }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function responseJson<T>(
  response: Response,
  t: Translate<WorkspaceMessage>,
): Promise<T> {
  const payload = await response.json() as T & { error?: string }
  if (!response.ok) {
    throw new Error(payload.error ?? t('workspace.request-failed', {
      status: response.status,
    }))
  }
  return payload
}

function workspaceUrl(cwd: string, sessionId: string): string {
  const url = new URL(WORKSPACE_API_PATH, window.location.origin)
  url.searchParams.set('cwd', cwd)
  url.searchParams.set('sessionId', sessionId)
  return url.href
}

function statusLabel(status: WorkspaceSnapshot['changes'][number]['status']): string {
  return {
    added: 'A',
    modified: 'M',
    deleted: 'D',
    renamed: 'R',
    copied: 'C',
    untracked: 'U',
    conflicted: '!',
  }[status]
}

type ReviewCommentTarget = {
  kind: 'commit'
} | {
  kind: 'line'
  filePath: string
  line: number
  side: Exclude<ReviewCommentSide, null>
}

function reviewLineNumber(
  oldLine: number | null,
  newLine: number | null,
): number | null {
  return newLine ?? oldLine
}

function processTitle(call: RunningToolCall): string {
  try {
    const args = JSON.parse(call.argsRaw) as Record<string, unknown>
    const value = args.command ?? args.cmd ?? args.script ?? args.description
    if (Array.isArray(value)) return value.map(String).join(' ')
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  } catch {
    // Fall back to the raw tool name for non-JSON arguments.
  }
  return call.name
}

function flattenRunningCalls(calls: readonly RunningToolCall[]): RunningToolCall[] {
  const result: RunningToolCall[] = []
  for (const call of calls) {
    result.push(call)
    result.push(...flattenRunningCalls(call.subCalls ?? []))
  }
  return result
}

const TOCKTEAM_PRIMARY_SIDEBAR_MIN_WIDTH = 200
const DSH_PRIMARY_SIDEBAR_MIN_WIDTH = 264

function installPrimarySidebarAdapter(): () => void {
  let overriddenWidth: number | undefined
  const publishWidth = (width: number): void => {
    document.documentElement.style.setProperty(
      '--tockteam-primary-sidebar-width',
      `${String(width)}px`,
    )
  }
  const collapse = (): void => {
    const collapsedFrame = document.querySelector<HTMLElement>('#root [data-sidebar-collapsed]')
    const handle = document.querySelector<HTMLElement>('#root [data-side="sidebar"]')
    const frame = collapsedFrame ?? handle?.parentElement
    if (!(frame instanceof HTMLElement)) return
    if (collapsedFrame !== null) {
      const tracks = frame.style.gridTemplateColumns
      const collapsed = tracks.replace(/^[\d.]+px/u, '0px')
      if (collapsed !== tracks) frame.style.gridTemplateColumns = collapsed
      return
    }
    const width = Number.parseFloat(frame.style.gridTemplateColumns)
    if (width <= 0) return
    if (overriddenWidth === undefined) {
      publishWidth(Math.round(width))
      return
    }
    const pixelWidth = `${String(overriddenWidth)}px`
    const tracks = frame.style.gridTemplateColumns
    const overriddenTracks = tracks.replace(/^[\d.]+px/u, pixelWidth)
    if (overriddenTracks !== tracks) frame.style.gridTemplateColumns = overriddenTracks
    if (handle !== null && handle.style.left !== pixelWidth) handle.style.left = pixelWidth
    const sidebarContent = frame.children.item(0)?.firstElementChild
    if (sidebarContent instanceof HTMLElement && sidebarContent.style.width !== pixelWidth) {
      sidebarContent.style.width = pixelWidth
    }
    publishWidth(overriddenWidth)
  }
  const observer = new MutationObserver(collapse)
  observer.observe(document.getElementById('root') ?? document.body, {
    attributeFilter: ['data-sidebar-collapsed', 'style'],
    attributes: true,
    childList: true,
    subtree: true,
  })
  collapse()

  let stopActiveResize = (): void => {}
  const beginResize = (event: PointerEvent): void => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-side="sidebar"]')
      : null
    const frame = target?.parentElement
    if (target === null || !(frame instanceof HTMLElement)
      || frame.closest('#root') === null) return
    const pointerId = event.pointerId
    const startX = event.clientX
    const sidebarColumn = frame.children.item(0)
    const detailsColumn = frame.children.item(2)
    const sidebarContent = sidebarColumn?.firstElementChild
    const startWidth = sidebarColumn?.getBoundingClientRect().width ?? 0
    const detailsWidth = detailsColumn?.getBoundingClientRect().width ?? 0
    const frameWidth = frame.getBoundingClientRect().width
    if (startWidth === 0 || frameWidth === 0) return
    let width = startWidth
    let latestX = startX
    let animationFrame = 0
    frame.style.transitionDuration = '0ms'
    target.style.transitionDuration = '0ms'
    const render = (): void => {
      animationFrame = 0
      // Keep DSH's upper and center-column limits while allowing TockTeam's denser minimum.
      width = Math.min(420, Math.max(TOCKTEAM_PRIMARY_SIDEBAR_MIN_WIDTH, Math.round(startWidth + latestX - startX)))
      overriddenWidth = width < DSH_PRIMARY_SIDEBAR_MIN_WIDTH ? width : undefined
      let details = detailsWidth
      if (details > 0 && width + details + 640 > frameWidth) {
        details = Math.max(300, frameWidth - width - 640)
        if (width + details + 640 > frameWidth) details = 0
      }
      frame.style.gridTemplateColumns = `${String(width)}px minmax(0, 1fr) ${String(details)}px`
      target.style.left = `${String(width)}px`
      publishWidth(width)
      if (sidebarContent instanceof HTMLElement) {
        sidebarContent.style.width = `${String(width)}px`
      }
    }
    const move = (next: PointerEvent): void => {
      if (next.pointerId !== pointerId) return
      next.preventDefault()
      next.stopImmediatePropagation()
      latestX = next.clientX
      if (animationFrame === 0) animationFrame = requestAnimationFrame(render)
    }
    const cleanup = (): void => {
      if (animationFrame !== 0) cancelAnimationFrame(animationFrame)
      animationFrame = 0
      frame.style.removeProperty('transition-duration')
      target.style.removeProperty('transition-duration')
      document.removeEventListener('pointermove', move, true)
      document.removeEventListener('pointerup', finish, true)
      document.removeEventListener('pointercancel', finish, true)
      stopActiveResize = (): void => {}
    }
    const finish = (next: PointerEvent): void => {
      if (next.pointerId !== pointerId) return
      if (animationFrame !== 0) cancelAnimationFrame(animationFrame)
      render()
      cleanup()
      next.stopImmediatePropagation()
      const upstreamX = startX + width - Math.max(DSH_PRIMARY_SIDEBAR_MIN_WIDTH, startWidth)
      target.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        buttons: 1,
        clientX: upstreamX,
        isPrimary: true,
        pointerId,
        pointerType: 'mouse',
      }))
      target.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        clientX: upstreamX,
        isPrimary: true,
        pointerId,
        pointerType: 'mouse',
      }))
    }
    stopActiveResize()
    stopActiveResize = cleanup
    document.addEventListener('pointermove', move, true)
    document.addEventListener('pointerup', finish, true)
    document.addEventListener('pointercancel', finish, true)
  }
  document.addEventListener('pointerdown', beginResize, true)
  return () => {
    observer.disconnect()
    stopActiveResize()
    document.removeEventListener('pointerdown', beginResize, true)
    document.documentElement.style.removeProperty('--tockteam-primary-sidebar-width')
  }
}

class WorkspaceToolsService implements WorkspaceTools {
  private state: WorkspaceToolsState
  private readonly listeners = new Set<() => void>()
  private element: HTMLDivElement | undefined
  private layout: HTMLDivElement | undefined
  private appRoot: HTMLElement | undefined
  private root: Root | undefined
  private stopSidebar: (() => void) | undefined
  private stopPrimarySidebarAdapter: (() => void) | undefined
  private readonly narrowViewport = window.matchMedia('(max-width: 900px)')
  private readonly handleViewportChange = (): void => { this.applyLayout() }
  private readonly handleShortcut = (event: KeyboardEvent): void => {
    if (document.documentElement.dataset.tockteamTocktutorActive === 'true') return
    const key = event.key.toLowerCase()
    const primary = event.metaKey || event.ctrlKey
    if (event.key === 'Escape' && this.state.maximized) {
      event.preventDefault()
      this.togglePanelMaximized()
    } else if (event.ctrlKey && event.shiftKey && key === 'g') {
      event.preventDefault()
      this.openReview()
    } else if (primary && !event.altKey && key === 't') {
      event.preventDefault()
      this.openBrowser()
    } else if (primary && !event.altKey && key === 'p') {
      event.preventDefault()
      this.openFiles()
    } else if (primary && event.altKey && key === 's') {
      event.preventDefault()
      void this.openSideChat()
    } else if (primary && event.altKey && key === 'b') {
      event.preventDefault()
      this.toggleSidePanel()
    }
  }

  constructor(
    private readonly sidebar: DesktopSidebar,
    private readonly panels: DesktopPanels,
    private readonly locale: LocaleService,
    private readonly t: Translate<WorkspaceMessage>,
    private readonly pinnedSummary: PinnedSummary,
    private readonly sessions: SessionsService,
    private readonly workspaces: WorkspacesService,
    private readonly showDesktopChrome: boolean,
  ) {
    this.state = this.project(sidebar.getSnapshot())
  }

  getSnapshot = (): WorkspaceToolsState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  isOpen(): boolean { return this.state.open }

  setOpen(open: boolean): void {
    if (open) this.pinnedSummary.setOpen(false)
    this.sidebar.setOpen(open)
    if (!open) delete document.documentElement.dataset.tockteamPanelMaximized
  }

  toggle(): void {
    if (this.state.open && this.state.view === 'review') this.setOpen(false)
    else this.openReview()
  }

  openReview(): void { this.openView('review') }

  openBrowser(): void { this.openView('browser') }

  openBrowserUrl(url: string): void {
    let title = url
    try { title = new URL(url).hostname || url } catch {}
    this.pinnedSummary.setOpen(false)
    this.sidebar.openTab({ resource: url, title, type: 'browser' })
    this.sidebar.setOpen(true)
  }

  openFile(path: string): void {
    const title = path.split(/[\\/]/).filter(Boolean).pop() ?? path
    this.pinnedSummary.setOpen(false)
    this.sidebar.openTab({ resource: path, title, type: 'file' })
    this.sidebar.setOpen(true)
  }

  openFiles(): void {
    const list = this.sessions.list.getSnapshot()
    const cwd = list.current === undefined ? undefined : list.byId[list.current]?.cwd
    if (cwd === undefined) return
    this.openView('files', cwd)
  }

  openMenu(): void {
    this.pinnedSummary.setOpen(false)
    this.sidebar.activateTab(null)
    this.sidebar.setOpen(true)
  }

  toggleSidePanel(): void {
    if (this.state.open) this.setOpen(false)
    else this.openMenu()
  }

  async openSideChat(): Promise<void> {
    const current = this.sessions.list.getSnapshot().current
    if (current === undefined) this.workspaces.startSession()
    else {
      const child = await this.sessions.fork({ sessionId: current, increaseTitle: true })
      this.sessions.open(child)
    }
    this.setOpen(false)
  }

  openTrajectory(): void {
    const translated = this.t('trajectory').toLowerCase()
    const tab = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .find(element => {
        const label = element.textContent?.trim().toLowerCase()
        return label === translated || label === 'trajectory' || label === '轨迹'
      })
    if (tab === undefined) return
    tab.click()
    this.setOpen(false)
  }

  togglePanelMaximized(): void {
    if (!this.state.open) return
    const maximized = !this.state.maximized
    this.sidebar.setMaximized(maximized)
    if (maximized) document.documentElement.dataset.tockteamPanelMaximized = 'true'
    else delete document.documentElement.dataset.tockteamPanelMaximized
  }

  setWidth(width: number): void {
    this.sidebar.setWidth(width)
  }

  mount(): void {
    if (this.state.open) this.pinnedSummary.setOpen(false)
    this.stopSidebar = this.sidebar.subscribe(() => { this.syncSidebar() })
    document.documentElement.classList.add('tockteam-sidebar-styles')
    this.element = document.createElement('div')
    this.element.id = 'tockteam-sidebar-root'
    this.element.className = "relative z-1 h-full w-full min-w-0 overflow-hidden [html[data-tockteam-desktop-sidebar-open='true']_&]:overflow-visible"
    const rail = document.createElement('div')
    rail.id = 'tockteam-rail-root'
    rail.className = 'relative z-[1002] h-full min-h-0 w-[var(--tockteam-rail-width)] box-border border-r border-[var(--tockteam-shell-divider)] bg-[var(--tockteam-shell-chrome)] pt-0'
    const appRoot = document.getElementById('root')
    if (appRoot === null) throw new Error('sidebar: app root is unavailable')
    const layout = document.createElement('div')
    layout.id = 'tockteam-embedded-layout'
    layout.className = 'grid h-full min-h-0 w-full grid-cols-[var(--tockteam-rail-width)_minmax(0,1fr)_0] grid-rows-[minmax(0,1fr)] overflow-hidden transition-[grid-template-columns] duration-180 ease-[var(--ds-ease-in-out,ease)] motion-reduce:transition-none'
    appRoot.before(layout)
    layout.append(rail, appRoot, this.element)
    this.appRoot = appRoot
    this.layout = layout
    this.root = createRoot(this.element)
    this.root.render(
      <WorkspaceToolsSurface
        locale={this.locale}
        t={this.t}
        service={this}
        panels={this.panels}
        pinnedSummary={this.pinnedSummary}
        sessions={this.sessions}
        workspaces={this.workspaces}
        sidebar={this.sidebar}
        showDesktopChrome={this.showDesktopChrome}
      />,
    )
    this.narrowViewport.addEventListener('change', this.handleViewportChange)
    window.addEventListener('keydown', this.handleShortcut, true)
    if (this.showDesktopChrome) {
      this.stopPrimarySidebarAdapter = installPrimarySidebarAdapter()
    }
    this.applyLayout()
  }

  dispose(): void {
    this.stopSidebar?.()
    this.stopPrimarySidebarAdapter?.()
    window.removeEventListener('keydown', this.handleShortcut, true)
    this.narrowViewport.removeEventListener('change', this.handleViewportChange)
    this.root?.unmount()
    this.element?.remove()
    if (this.layout !== undefined && this.appRoot !== undefined) {
      this.layout.before(this.appRoot)
      this.layout.remove()
    }
    document.documentElement.classList.remove('tockteam-sidebar-styles')
    delete document.documentElement.dataset.tockteamDesktopSidebarOpen
    delete document.documentElement.dataset.tockteamPanelMaximized
    document.documentElement.style.removeProperty('--tockteam-sidebar-width')
    if (document.documentElement.dataset.tockteamRightPanelOwner === 'sidebar') {
      delete document.documentElement.dataset.tockteamRightPanelOwner
      document.getElementById('root')?.style.removeProperty('padding-right')
    }
  }

  private publish(next: WorkspaceToolsState): void {
    this.state = next
    for (const listener of this.listeners) listener()
  }

  private openView(view: string, resource?: string): void {
    this.pinnedSummary.setOpen(false)
    this.sidebar.openTab({
      type: view,
      ...(resource !== undefined ? { resource } : {}),
    })
    this.sidebar.setOpen(true)
  }

  private project(snapshot: DesktopSidebarSnapshot): WorkspaceToolsState {
    const active = snapshot.tabs.find(tab => tab.id === snapshot.activeId)
    return {
      maximized: snapshot.maximized,
      open: snapshot.open,
      view: active?.type ?? 'menu',
      width: snapshot.width,
    }
  }

  private syncSidebar(): void {
    const next = this.project(this.sidebar.getSnapshot())
    if (next.open) this.pinnedSummary.setOpen(false)
    this.publish(next)
    if (next.maximized) {
      document.documentElement.dataset.tockteamPanelMaximized = 'true'
    } else {
      delete document.documentElement.dataset.tockteamPanelMaximized
    }
    this.applyLayout()
  }

  private applyLayout(): void {
    document.documentElement.style.setProperty('--tockteam-sidebar-width', `${String(this.state.width)}px`)
    const html = document.documentElement
    const appRoot = document.getElementById('root')
    if (this.state.open) {
      html.dataset.tockteamDesktopSidebarOpen = 'true'
      html.dataset.tockteamRightPanelOwner = 'sidebar'
      appRoot?.style.removeProperty('padding-right')
    } else {
      delete html.dataset.tockteamDesktopSidebarOpen
      if (html.dataset.tockteamRightPanelOwner === 'sidebar') {
        delete html.dataset.tockteamRightPanelOwner
        appRoot?.style.removeProperty('padding-right')
      }
    }
    if (this.layout !== undefined) {
      if (this.state.open && this.state.maximized) {
        this.layout.style.gridTemplateColumns = 'var(--tockteam-rail-width) 0 minmax(0, 1fr)'
      } else {
        const track = this.state.open && !this.narrowViewport.matches ? this.state.width : 0
        this.layout.style.gridTemplateColumns = `var(--tockteam-rail-width) minmax(0, 1fr) ${String(track)}px`
      }
    }
  }
}

type PanelIconKind = 'expand' | 'sidebar' | 'summary' | 'terminal' | 'side'

const PANEL_ICONS: Record<PanelIconKind, LucideIcon> = {
  expand: Maximize2,
  sidebar: PanelLeft,
  side: PanelRight,
  summary: ListFilter,
  terminal: PanelBottom,
}

function PanelIcon({ kind }: { kind: PanelIconKind }) {
  const Icon = PANEL_ICONS[kind]
  return <Icon aria-hidden="true" />
}

function DesktopPanelToolbar({
  service,
  panels,
  pinnedSummary,
  t,
}: {
  service: WorkspaceToolsService
  panels: DesktopPanels
  pinnedSummary: PinnedSummary
  t: Translate<WorkspaceMessage>
}): JSX.Element {
  const workspaceState = useSyncExternalStore(service.subscribe, service.getSnapshot)
  const terminalOpen = useSyncExternalStore(panels.subscribe, () => panels.isBottomPanelOpen())
  const summaryOpen = useSyncExternalStore(pinnedSummary.subscribe, () => pinnedSummary.isOpen())
  const sideOpen = workspaceState.open
  return (
    <TooltipProvider>
      <nav className="tockteam-panel-toolbar fixed top-[5px] right-3.5 z-[2147483647] flex items-center gap-[3px] border-0 bg-transparent p-0 shadow-none [-webkit-app-region:no-drag] [html[data-tockteam-tocktutor-active='true']_&]:hidden [&_button]:grid [&_button]:size-[30px] [&_button]:cursor-pointer [&_button]:place-items-center [&_button]:rounded-lg [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0 [&_button]:text-[var(--dsw-alias-label-secondary,#57606a)] [&_button]:[-webkit-app-region:no-drag] [&_button:hover]:text-[var(--dsw-alias-label-primary,#1f2328)] [&_button[aria-pressed='true']]:text-[var(--dsw-alias-label-primary,#1f2328)] [&_svg]:size-[18px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.7] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]" aria-label={t('panels.label')}>
        {sideOpen
          ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button unstyled
                  type="button"
                  aria-label={t('side.expand')}
                  aria-pressed={workspaceState.maximized}
                  onClick={() => { service.togglePanelMaximized() }}
                ><PanelIcon kind="expand" /></Button>
              </TooltipTrigger>
              <TooltipContent>{workspaceState.maximized ? t('side.restore') : t('side.expand')}</TooltipContent>
            </Tooltip>
          )
          : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button unstyled
                  type="button"
                  aria-label={t('summary.toggle')}
                  aria-pressed={summaryOpen}
                  onClick={() => { service.setOpen(false); pinnedSummary.toggle() }}
                ><PanelIcon kind="summary" /></Button>
              </TooltipTrigger>
              <TooltipContent>{t('summary.title')}</TooltipContent>
            </Tooltip>
          )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button unstyled
              type="button"
              aria-label={t('terminal.toggle')}
              aria-pressed={terminalOpen}
              onClick={() => { panels.toggleBottomPanel() }}
            ><PanelIcon kind="terminal" /></Button>
          </TooltipTrigger>
          <TooltipContent>{t('terminal.title')} (⌘J)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button unstyled
              type="button"
              aria-label={t('side.toggle')}
              aria-pressed={sideOpen}
              onClick={() => { service.toggleSidePanel() }}
            ><PanelIcon kind="side" /></Button>
          </TooltipTrigger>
          <TooltipContent>{t('side.title')} (⌥⌘B)</TooltipContent>
        </Tooltip>
      </nav>
    </TooltipProvider>
  )
}

function DesktopWindowTitlebar({
  panels,
  t,
}: {
  panels: DesktopPanels
  t: Translate<WorkspaceMessage>
}): ReactNode {
  return (
    <header className="tockteam-window-titlebar fixed top-0 right-0 left-0 z-[2147483647] grid h-[var(--tockteam-titlebar-height,40px)] grid-cols-[minmax(120px,1fr)_minmax(0,auto)_minmax(120px,1fr)] items-center border-b border-[var(--tockteam-shell-divider)] bg-[var(--tockteam-shell-chrome)] shadow-[0_1px_0_rgb(0_0_0_/_2%)] select-none [-webkit-app-region:drag]">
      <TooltipProvider>
        <div className="tockteam-titlebar-leading ml-[var(--tockteam-rail-width)] flex h-full w-[var(--tockteam-primary-sidebar-width)] box-border items-center justify-end border-r border-[var(--tockteam-shell-divider)] pr-1 [body:has([data-sidebar-collapsed])_&]:w-[84px] [body:has([data-sidebar-collapsed])_&]:border-r-0 [html[data-tockteam-tocktutor-active='true']_&]:invisible [&_button]:grid [&_button]:size-9 [&_button]:cursor-pointer [&_button]:place-items-center [&_button]:rounded-lg [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0 [&_button]:text-[var(--dsw-alias-label-secondary,#57606a)] [&_button]:[-webkit-app-region:no-drag] [&_button:hover]:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] [&_button:hover]:text-[var(--dsw-alias-label-primary,#1f2328)] [&_svg]:size-[18px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.7] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button unstyled
                type="button"
                aria-label={t('sidebar.toggle')}
                onClick={() => { panels.toggleSidebar() }}
              ><PanelIcon kind="sidebar" /></Button>
            </TooltipTrigger>
            <TooltipContent>{t('sidebar.toggle')}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      <span className="tockteam-window-title min-w-0 truncate text-center text-sm leading-none font-normal text-[color-mix(in_srgb,var(--dsw-alias-label-primary,#1f2328)_90%,var(--tockteam-shell-chrome,#fff)_10%)] [html[data-tockteam-tocktutor-active='true']_&]:invisible">TockCoder</span>
      <div className="hidden [html[data-tockteam-tocktutor-active='true']_&]:absolute [html[data-tockteam-tocktutor-active='true']_&]:inset-[0_0_0_var(--tockteam-rail-width)] [html[data-tockteam-tocktutor-active='true']_&]:z-1 [html[data-tockteam-tocktutor-active='true']_&]:block" id="tockteam-window-titlebar-slot" />
    </header>
  )
}

function useActiveConversation(sessions: SessionsService, sessionId: string | undefined): ConversationSnapshot {
  const binding = sessionId === undefined ? undefined : sessions.binding(sessionId)
  const subscribe = useCallback(
    (listener: () => void) => binding?.session.subscribe(listener) ?? (() => {}),
    [binding],
  )
  const getSnapshot = useCallback(
    () => binding?.session.getSnapshot() ?? EMPTY_CONVERSATION,
    [binding],
  )
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
  )
}

function WorkspacePanel({
  reviewComments,
  service,
  sessions,
  workspaces,
  t,
}: {
  reviewComments: ReviewCommentsService
  service: WorkspaceToolsService
  sessions: SessionsService
  workspaces: WorkspacesService
  t: Translate<WorkspaceMessage>
}): JSX.Element {
  const panelState = useSyncExternalStore(service.subscribe, service.getSnapshot)
  const sessionList = useSyncExternalStore(sessions.list.subscribe, sessions.list.getSnapshot)
  const sessionId = sessionList.current
  const cwd = sessionId === undefined ? undefined : sessionList.byId[sessionId]?.cwd
  const conversation = useActiveConversation(sessions, sessionId)
  const processes = useMemo(
    () => flattenRunningCalls(conversation.runningCalls ?? []),
    [conversation.runningCalls],
  )
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [diff, setDiff] = useState('')
  const [commitOpen, setCommitOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [history, setHistory] = useState<BetterSidebarGitLogEntry[]>([])
  const [selectedCommit, setSelectedCommit] = useState<GitReviewCommit | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [commentTarget, setCommentTarget] = useState<ReviewCommentTarget | null>(null)
  const [commentBody, setCommentBody] = useState('')
  const [commentNotice, setCommentNotice] = useState('')
  const comments = useSyncExternalStore(
    reviewComments.subscribe,
    reviewComments.getSnapshot,
  )
  const visibleChanges = snapshot?.changes.slice(0, 200) ?? []
  const scope = useMemo<BetterSidebarScope | undefined>(
    () => sessionId === undefined || cwd === undefined
      ? undefined
      : { sessionId, cwd },
    [cwd, sessionId],
  )
  const branch = snapshot?.branch ?? null
  const selectedComments = useMemo(() => comments.filter(comment =>
    selectedCommit !== null
    && comment.commitId === selectedCommit.id
    && comment.sessionId === (sessionId ?? null)
    && comment.workspacePath === cwd
    && comment.branch === branch), [
    branch,
    comments,
    cwd,
    selectedCommit,
    sessionId,
  ])

  const refresh = useCallback(async (): Promise<void> => {
    if (cwd === undefined || sessionId === undefined) {
      setSnapshot(null)
      return
    }
    try {
      const nextScope = { sessionId, cwd }
      const [facts, status] = await Promise.all([
        responseJson<WorkspaceFacts>(await fetch(workspaceUrl(cwd, sessionId)), t),
        betterSidebarApi.gitStatus(nextScope),
      ])
      if (!status.isRepo) {
        setHistory([])
        setSelectedCommit(null)
        setSnapshot({
          ...facts,
          kind: 'directory',
          branch: null,
          branches: [],
          changes: [],
        })
      } else {
        const [nextBranch, nextHistory] = await Promise.all([
          betterSidebarApi.gitBranch(nextScope),
          betterSidebarApi.gitLog(nextScope).catch(() => []),
        ])
        setHistory(nextHistory)
        setSnapshot({
          ...facts,
          kind: 'repository',
          branch: status.branch ?? nextBranch.current,
          branches: nextBranch.names,
          changes: workspaceChangesFromBetterSidebar(status.entries),
        })
      }
      setError('')
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }, [cwd, sessionId, t])

  useEffect(() => {
    if (!panelState.open || panelState.view !== 'review' || cwd === undefined) return
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 4_000)
    const onFocus = (): void => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [cwd, panelState.open, panelState.view, refresh])

  useEffect(() => {
    setSelectedPath(null)
    setDiff('')
    setHistory([])
    setSelectedCommit(null)
    setCommentTarget(null)
    setCommentBody('')
    setCommentNotice('')
  }, [cwd])

  useEffect(() => {
    if (cwd === undefined || branch === null) return
    reviewComments.activate(sessionId ?? null, cwd, branch)
  }, [branch, cwd, reviewComments, sessionId])

  const mutate = async (mutation: WorkspaceMutation): Promise<void> => {
    if (cwd === undefined || scope === undefined || busy) return
    setBusy(true)
    try {
      if (mutation.action === 'checkout') {
        await betterSidebarApi.gitCheckout(scope, mutation.branch)
      } else if (mutation.action === 'commit') {
        await betterSidebarApi.gitStage(scope)
        await betterSidebarApi.gitCommit(scope, mutation.message)
        setCommitMessage('')
      } else {
        const response = await fetch(workspaceUrl(cwd, scope.sessionId), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(mutation),
        })
        await responseJson<WorkspaceHostMutationResponse>(response, t)
      }
      await refresh()
      setError('')
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setBusy(false)
    }
  }

  const showDiff = async (
    change: WorkspaceSnapshot['changes'][number],
  ): Promise<void> => {
    if (scope === undefined) return
    if (selectedPath === change.path) {
      setSelectedPath(null)
      setDiff('')
      return
    }
    setSelectedPath(change.path)
    setDiff(t('workspace.loading-diff'))
    try {
      const response = await betterSidebarApi.gitDiff(
        scope,
        change.path,
        change.staged,
      )
      setDiff(response.diff || t('workspace.no-text-diff'))
    } catch (nextError) {
      setDiff(errorMessage(nextError))
    }
  }

  const showCommit = async (entry: BetterSidebarGitLogEntry): Promise<void> => {
    if (scope === undefined || reviewLoading) return
    if (selectedCommit?.id === entry.hashFull) {
      setSelectedCommit(null)
      setCommentTarget(null)
      return
    }
    setReviewLoading(true)
    setCommentTarget(null)
    setCommentBody('')
    setCommentNotice('')
    try {
      const result = await betterSidebarApi.gitCommitDiff(
        scope,
        entry.hashFull,
      )
      setSelectedCommit(reviewCommitFromBetterSidebar(entry, result.diff))
      setError('')
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setReviewLoading(false)
    }
  }

  const addReviewComment = (): void => {
    if (selectedCommit === null || cwd === undefined || branch === null
      || commentTarget === null || commentBody.trim() === '') return
    const lineTarget = commentTarget.kind === 'line' ? commentTarget : null
    const result = reviewComments.add(selectedCommit, {
      id: nextReviewCommentId(),
      sessionId: sessionId ?? null,
      workspacePath: cwd,
      branch,
      commitId: selectedCommit.id,
      filePath: lineTarget?.filePath ?? null,
      line: lineTarget?.line ?? null,
      side: lineTarget?.side ?? null,
      body: commentBody.trim(),
      createdAt: new Date().toISOString(),
    })
    setCommentBody('')
    setCommentTarget(null)
    setCommentNotice(result === 'inserted'
      ? t('workspace.comment-added')
      : t('workspace.comment-saved'))
  }

  const chooseWorkspace = async (): Promise<void> => {
    if (window.dshDesktop?.chooseWorkspace === undefined) return
    const paths = await window.dshDesktop?.chooseWorkspace() ?? []
    for (const path of paths) {
      const workspace = await workspaces.create({ path })
      workspaces.startSession(workspace.workspaceId)
    }
  }

  return (
    <div className="tockteam-review-view flex min-h-0 flex-1 flex-col overflow-hidden" aria-label={t('workspace.changes')}>
      <header className="tockteam-workspace-header flex min-h-[58px] flex-none items-center justify-between border-b border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_8%))] py-2.5 pr-3.5 pl-5 [&>div]:flex [&>div]:flex-none [&>div]:gap-0.5 [&_button]:size-7 [&_button]:cursor-pointer [&_button]:rounded-[7px] [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0 [&_button]:text-[var(--dsw-alias-label-secondary,#57606a)] [&_button:hover]:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] [&_button:hover]:text-[var(--dsw-alias-label-primary,#1f2328)] [&_button_svg]:mx-auto [&_button_svg]:block [&_button_svg]:size-4 [&_strong]:min-w-0 [&_strong]:truncate [&_strong]:text-[15px] [&_strong]:font-medium">
        <div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button unstyled type="button" aria-label={t('side.back')} onClick={() => { service.openMenu() }}><ChevronLeft aria-hidden="true" /></Button>
            </TooltipTrigger>
            <TooltipContent>{t('side.back')}</TooltipContent>
          </Tooltip>
          <strong>{snapshot?.name ?? (cwd?.split(/[\\/]/).filter(Boolean).pop() || t('workspace.title'))}</strong>
        </div>
        <div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button unstyled type="button" onClick={() => { void refresh() }} aria-label={t('workspace.refresh')}><RefreshCw aria-hidden="true" /></Button>
            </TooltipTrigger>
            <TooltipContent>{t('workspace.refresh')}</TooltipContent>
          </Tooltip>
          {window.dshDesktop?.chooseWorkspace !== undefined && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button unstyled type="button" onClick={() => { void chooseWorkspace() }} aria-label={t('workspace.add')}><Plus aria-hidden="true" /></Button>
              </TooltipTrigger>
              <TooltipContent>{t('workspace.add')}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button unstyled type="button" onClick={() => { service.setOpen(false) }} aria-label={t('workspace.close-review')}><X aria-hidden="true" /></Button>
            </TooltipTrigger>
            <TooltipContent>{t('workspace.close-review')}</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {cwd === undefined
        ? <Empty unstyled className="tockteam-workspace-empty m-auto max-w-[220px] p-[18px] text-center text-xs leading-normal text-[var(--dsw-alias-label-dimmed,#8c959f)]">{t('workspace.select')}</Empty>
        : (
          <div className="tockteam-workspace-content min-h-0 flex-1 overflow-auto px-4 pt-2 pb-6 [&>section]:border-b [&>section]:border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_8%))] [&>section]:py-2">
            {error !== '' && <Alert unstyled className="tockteam-workspace-error mt-1 mb-2 rounded-[7px] bg-[color-mix(in_srgb,#cf222e_10%,transparent)] px-2.5 py-2 text-[10px] leading-[1.45] text-[#cf222e] [overflow-wrap:anywhere]">{error}</Alert>}
            <section>
              <div className="tockteam-workspace-section-title grid min-h-[38px] grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2 px-1.5 text-[13px] [&_strong]:font-[550]">
                <span className="tockteam-workspace-section-icon grid place-items-center text-[var(--dsw-alias-label-secondary,#57606a)] [&_svg]:size-4"><FileDiff aria-hidden="true" /></span>
                <strong>{t('workspace.changes')}</strong>
                <Badge unstyled className="tockteam-workspace-count min-w-5 rounded-full bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] px-1.5 py-0.5 text-center text-[10px] text-[var(--dsw-alias-label-secondary,#57606a)]">{snapshot?.changes.length ?? 0}</Badge>
              </div>
              <div className="tockteam-change-list pt-0 pr-0.5 pb-[5px] pl-[30px]">
                {visibleChanges.map(change => (
                  <div key={`${change.path}:${change.oldPath ?? ''}`}>
                    <Button unstyled
                      type="button"
                      className="tockteam-change-row grid min-h-[30px] w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md border-0 bg-transparent px-1.5 py-[3px] text-left text-[11px] leading-[1.35] text-[var(--dsw-alias-label-primary,#1f2328)] hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] data-[selected]:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] [font-family:var(--ds-font-family-code,ui-monospace,monospace)] [&>span:nth-child(2)]:truncate [&_small]:text-[9px] [&_small]:leading-none [&_small]:text-[var(--dsw-alias-label-dimmed,#8c959f)]"
                      data-selected={selectedPath === change.path || undefined}
                      onClick={() => { void showDiff(change) }}
                    >
                      <span className={`tockteam-change-status font-bold ${change.status === 'added' || change.status === 'untracked' ? 'text-[#2da44e]' : change.status === 'deleted' || change.status === 'conflicted' ? 'text-[#cf222e]' : 'text-[#9a6700]'}`}>{statusLabel(change.status)}</span>
                      <span title={change.path}>{change.path}</span>
                      {change.staged && <small>{t('workspace.staged')}</small>}
                    </Button>
                    {selectedPath === change.path && <pre className="tockteam-change-diff mt-[3px] mb-[7px] max-h-60 overflow-auto whitespace-pre rounded-md bg-[var(--dsw-alias-bg-layer-1,#f6f8fa)] p-[9px] text-[10px] leading-[1.45] text-[var(--dsw-alias-label-secondary,#57606a)] [font-family:var(--ds-font-family-code,ui-monospace,monospace)]">{diff}</pre>}
                  </div>
                ))}
                {(snapshot?.changes.length ?? 0) > visibleChanges.length && (
                  <Empty unstyled className="tockteam-workspace-muted p-[18px] text-center text-[11px] text-[var(--dsw-alias-label-dimmed,#8c959f)]">
                    {t('workspace.more-changes', {
                      count: (snapshot?.changes.length ?? 0) - visibleChanges.length,
                    })}
                  </Empty>
                )}
                {snapshot?.kind === 'repository' && snapshot.changes.length === 0 && (
                  <Empty unstyled className="tockteam-workspace-muted p-[18px] text-center text-[11px] text-[var(--dsw-alias-label-dimmed,#8c959f)]">{t('workspace.clean')}</Empty>
                )}
                {snapshot?.kind === 'directory' && (
                  <Empty unstyled className="tockteam-workspace-muted p-[18px] text-center text-[11px] text-[var(--dsw-alias-label-dimmed,#8c959f)]">{t('workspace.not-git')}</Empty>
                )}
              </div>
            </section>

            {snapshot?.kind === 'repository' && (
              <section className="tockteam-review-history">
                <div className="tockteam-workspace-section-title grid min-h-[38px] grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2 px-1.5 text-[13px] [&_strong]:font-[550]">
                  <span className="tockteam-workspace-section-icon grid place-items-center text-[var(--dsw-alias-label-secondary,#57606a)] [&_svg]:size-4"><History aria-hidden="true" /></span>
                  <strong>{t('workspace.review-history')}</strong>
                  <Badge unstyled className="tockteam-workspace-count min-w-5 rounded-full bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] px-1.5 py-0.5 text-center text-[10px] text-[var(--dsw-alias-label-secondary,#57606a)]">{history.length}</Badge>
                </div>
                <div className="tockteam-review-commit-list grid gap-0.5 pr-0.5 pb-2 pl-[30px]">
                  {history.map(entry => (
                    <Button unstyled
                      type="button"
                      key={entry.hashFull}
                      className="tockteam-review-commit-row grid min-h-8 grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-[7px] rounded-md border-0 bg-transparent px-[7px] py-1 text-left text-inherit hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] data-[selected]:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] disabled:cursor-default disabled:opacity-65 [&>span]:truncate [&>span]:text-[11px] [&_code]:text-[9px] [&_code]:leading-[1.3] [&_code]:text-[var(--dsw-alias-label-secondary,#57606a)] [&_code]:[font-family:var(--ds-font-family-code,ui-monospace,monospace)] [&_small]:max-w-[72px] [&_small]:truncate [&_small]:text-[9px] [&_small]:text-[var(--dsw-alias-label-dimmed,#8c959f)]"
                      data-selected={selectedCommit?.id === entry.hashFull || undefined}
                      disabled={reviewLoading}
                      onClick={() => { void showCommit(entry) }}
                    >
                      <code>{entry.hash}</code>
                      <span title={entry.subject}>{entry.subject}</span>
                      <small>{entry.author}</small>
                    </Button>
                  ))}
                  {history.length === 0 && (
                    <Empty unstyled className="tockteam-workspace-muted p-[18px] text-center text-[11px] text-[var(--dsw-alias-label-dimmed,#8c959f)]">
                      {t('workspace.no-commits')}
                    </Empty>
                  )}
                </div>

                {selectedCommit !== null && (
                  <div className="tockteam-review-commit-detail mt-0.5 mr-0.5 mb-2.5 ml-[30px] overflow-hidden rounded-lg border border-[var(--dsw-alias-border-l2,rgb(0_0_0_/_13%))] bg-[var(--dsw-alias-bg-layer-1,#fff)] [&>header]:flex [&>header]:items-start [&>header]:justify-between [&>header]:gap-2 [&>header]:border-b [&>header]:border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_8%))] [&>header]:p-[9px] [&>header>div]:grid [&>header>div]:min-w-0 [&>header>div]:gap-[3px] [&>header_code]:text-[9px] [&>header_code]:text-[var(--dsw-alias-label-dimmed,#8c959f)] [&>header_small]:text-[9px] [&>header_small]:text-[var(--dsw-alias-label-dimmed,#8c959f)] [&>header_strong]:text-[11px] [&>header>button]:flex-none [&>header>button]:rounded-md [&>header>button]:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] [&>header>button]:px-[7px] [&>header>button]:py-[5px] [&>header>button]:text-[9px] [&_button]:cursor-pointer [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-inherit [&_button]:[font:inherit] [&>details]:border-b [&>details]:border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_8%))] [&>details:last-of-type]:border-b-0 [&_summary]:flex [&_summary]:cursor-pointer [&_summary]:items-center [&_summary]:justify-between [&_summary]:gap-2 [&_summary]:px-[9px] [&_summary]:py-[7px] [&_summary]:text-[10px] [&_summary]:leading-[1.35] [&_summary]:[font-family:var(--ds-font-family-code,ui-monospace,monospace)] [&_summary>span]:truncate [&_summary_small]:text-[#cf222e] [&_summary_b]:font-medium [&_summary_b]:text-[#2da44e]">
                    <header>
                      <div>
                        <code>{selectedCommit.shortId}</code>
                        <strong>{selectedCommit.subject}</strong>
                        <small>
                          {selectedCommit.author} · {selectedCommit.authoredAt}
                        </small>
                      </div>
                      <Button unstyled
                        type="button"
                        onClick={() => {
                          setCommentTarget({ kind: 'commit' })
                          setCommentNotice('')
                        }}
                      >{t('workspace.comment-commit')}</Button>
                    </header>

                    {selectedComments.length > 0 && (
                      <div className="tockteam-review-comments grid gap-[5px] border-b border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_8%))] px-[9px] py-2 [&>strong]:text-[10px] [&>div]:relative [&>div]:rounded-md [&>div]:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] [&>div]:pt-[7px] [&>div]:pr-7 [&>div]:pb-[7px] [&>div]:pl-2 [&_span]:text-[9px] [&_span]:leading-[1.3] [&_span]:text-[var(--dsw-alias-label-dimmed,#8c959f)] [&_span]:[font-family:var(--ds-font-family-code,ui-monospace,monospace)] [&_p]:mt-[3px] [&_p]:mb-0 [&_p]:text-[10px] [&_p]:leading-[1.45] [&_button]:absolute [&_button]:top-1 [&_button]:right-1">
                        <strong>{t('workspace.pending-comments')}</strong>
                        {selectedComments.map(comment => (
                          <div key={comment.id}>
                            <span>
                              {comment.filePath === null
                                ? t('workspace.review-commit')
                                : `${comment.filePath}:${String(comment.line)}`}
                            </span>
                            <p>{comment.body}</p>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button unstyled
                                  type="button"
                                  aria-label={t('workspace.remove-comment')}
                                  onClick={() => { reviewComments.remove(comment.id) }}
                                ><X aria-hidden="true" /></Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('workspace.remove-comment')}</TooltipContent>
                            </Tooltip>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedCommit.files.map(file => (
                      <details key={`${file.oldPath ?? ''}:${file.path}`} open>
                        <summary>
                          <span title={file.path}>{file.path}</span>
                          <small>
                            <b>+{file.additions}</b> −{file.deletions}
                          </small>
                        </summary>
                        <div className="tockteam-review-diff-lines max-h-[420px] overflow-auto border-t border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_8%))] [&>button]:grid [&>button]:min-w-max [&>button]:w-full [&>button]:grid-cols-[30px_30px_minmax(max-content,1fr)] [&>button]:p-0 [&>button]:text-left [&>button]:text-[9px] [&>button]:leading-[1.55] [&>button]:[font-family:var(--ds-font-family-code,ui-monospace,monospace)] [&>button:hover]:shadow-[inset_2px_0_var(--dsw-alias-accent,#0969da)] [&>button[data-type='addition']]:bg-[color-mix(in_srgb,#2da44e_10%,transparent)] [&>button[data-type='deletion']]:bg-[color-mix(in_srgb,#cf222e_9%,transparent)] [&>button>span]:px-[5px] [&>button>span]:py-px [&>button>span]:text-right [&>button>span]:text-[var(--dsw-alias-label-dimmed,#8c959f)] [&>button>span]:select-none [&>button>code]:whitespace-pre [&>button>code]:px-2 [&>button>code]:py-px [&>button>code]:text-[var(--dsw-alias-label-primary,#1f2328)]">
                          {file.lines.slice(0, 400).map(line => {
                            const lineNumber = reviewLineNumber(
                              line.oldLine,
                              line.newLine,
                            )
                            return (
                              <Button unstyled
                                type="button"
                                key={line.key}
                                data-type={line.type}
                                disabled={lineNumber === null}
                                title={t('workspace.comment-line')}
                                onClick={() => {
                                  if (lineNumber === null) return
                                  setCommentTarget({
                                    kind: 'line',
                                    filePath: file.path,
                                    line: lineNumber,
                                    side: line.type === 'deletion' ? 'old' : 'new',
                                  })
                                  setCommentNotice('')
                                }}
                              >
                                <span>{line.oldLine ?? ''}</span>
                                <span>{line.newLine ?? ''}</span>
                                <code>{line.content || ' '}</code>
                              </Button>
                            )
                          })}
                          {file.lines.length > 400 && (
                            <Empty unstyled className="tockteam-workspace-muted p-[18px] text-center text-[11px] text-[var(--dsw-alias-label-dimmed,#8c959f)]">
                              {t('workspace.diff-truncated', {
                                count: file.lines.length - 400,
                              })}
                            </Empty>
                          )}
                        </div>
                      </details>
                    ))}

                    {commentTarget !== null && (
                      <div className="tockteam-review-comment-form grid gap-1.5 border-t border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_8%))] p-[9px] [&>strong]:truncate [&>strong]:text-[10px] [&>div]:flex [&>div]:justify-end [&>div]:gap-1.5 [&_textarea]:min-h-[68px] [&_textarea]:resize-y [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-[var(--dsw-alias-border-l2,rgb(0_0_0_/_13%))] [&_textarea]:bg-[var(--dsw-alias-bg-layer-1,#fff)] [&_textarea]:p-[7px] [&_textarea]:text-inherit [&_textarea]:outline-0 [&_textarea]:focus:border-[var(--dsw-alias-accent,#0969da)] [&_textarea]:[font:10px/1.45_inherit] [&_button]:rounded-md [&_button]:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] [&_button]:px-2 [&_button]:py-[5px] [&_button]:text-[9px] [&_button:disabled]:cursor-default [&_button:disabled]:opacity-45">
                        <strong>
                          {commentTarget.kind === 'commit'
                            ? t('workspace.comment-commit')
                            : `${commentTarget.filePath}:${String(commentTarget.line)}`}
                        </strong>
                        <Textarea unstyled
                          autoFocus
                          value={commentBody}
                          placeholder={t('workspace.comment-placeholder')}
                          onChange={event => { setCommentBody(event.currentTarget.value) }}
                        />
                        <div>
                          <Button unstyled
                            type="button"
                            onClick={() => {
                              setCommentTarget(null)
                              setCommentBody('')
                            }}
                          >{t('workspace.cancel')}</Button>
                          <Button unstyled
                            type="button"
                            disabled={commentBody.trim() === ''}
                            onClick={addReviewComment}
                          >{t('workspace.add-comment')}</Button>
                        </div>
                      </div>
                    )}
                    {commentNotice !== '' && (
                      <p className="tockteam-review-comment-notice mt-0 px-[9px] pt-0 pb-[9px] text-[9px] text-[var(--dsw-alias-label-secondary,#57606a)]">
                        {commentNotice}
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            <section className="tockteam-workspace-facts grid gap-px">
              <Label unstyled className="tockteam-workspace-fact grid min-h-[38px] grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2 px-1.5 text-[13px] [&_select]:w-full [&_select]:min-w-0 [&_select]:cursor-pointer [&_select]:appearance-none [&_select]:border-0 [&_select]:bg-transparent [&_select]:p-0 [&_select]:text-inherit [&_select]:outline-0 [&_select]:[font:inherit]">
                <span className="tockteam-workspace-fact-icon grid place-items-center text-[var(--dsw-alias-label-secondary,#57606a)] [&_svg]:size-4"><Monitor aria-hidden="true" /></span>
                <NativeSelect unstyled aria-label={t('workspace.execution-environment')} value="local" onChange={() => {}}>
                  <NativeSelectOption value="local">{t('workspace.local')}</NativeSelectOption>
                </NativeSelect>
                <span className="tockteam-workspace-chevron text-[var(--dsw-alias-label-dimmed,#8c959f)] [&_svg]:block [&_svg]:size-3.5"><ChevronDown aria-hidden="true" /></span>
              </Label>
              <Label unstyled className="tockteam-workspace-fact grid min-h-[38px] grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2 px-1.5 text-[13px] [&_select]:w-full [&_select]:min-w-0 [&_select]:cursor-pointer [&_select]:appearance-none [&_select]:border-0 [&_select]:bg-transparent [&_select]:p-0 [&_select]:text-inherit [&_select]:outline-0 [&_select]:[font:inherit]">
                <span className="tockteam-workspace-fact-icon grid place-items-center text-[var(--dsw-alias-label-secondary,#57606a)] [&_svg]:size-4"><GitBranch aria-hidden="true" /></span>
                <NativeSelect unstyled
                  value={snapshot?.branch ?? ''}
                  disabled={snapshot?.kind !== 'repository' || busy}
                  aria-label={t('workspace.current-branch')}
                  onChange={event => { void mutate({ action: 'checkout', branch: event.currentTarget.value }) }}
                >
                  {(snapshot?.branches ?? []).map(branch => <NativeSelectOption key={branch} value={branch}>{branch}</NativeSelectOption>)}
                </NativeSelect>
                <span className="tockteam-workspace-chevron text-[var(--dsw-alias-label-dimmed,#8c959f)] [&_svg]:block [&_svg]:size-3.5"><ChevronDown aria-hidden="true" /></span>
              </Label>
              {snapshot?.kind === 'repository' && (
                <div className="tockteam-new-branch flex gap-1.5 pt-[3px] pr-1.5 pb-[5px] pl-10 [&_input]:h-7 [&_input]:min-w-0 [&_input]:flex-1 [&_input]:rounded-md [&_input]:border [&_input]:border-[var(--dsw-alias-border-l2,rgb(0_0_0_/_13%))] [&_input]:bg-[var(--dsw-alias-bg-layer-1,#fff)] [&_input]:px-[7px] [&_input]:text-[11px] [&_input]:text-inherit [&_button]:cursor-pointer [&_button]:rounded-md [&_button]:border [&_button]:border-[var(--dsw-alias-border-l2,rgb(0_0_0_/_13%))] [&_button]:bg-transparent [&_button]:px-[9px] [&_button]:py-1 [&_button]:text-[11px] [&_button]:leading-tight [&_button]:text-inherit [&_button:disabled]:cursor-default [&_button:disabled]:opacity-45">
                  <Input unstyled
                    value={newBranch}
                    placeholder={t('workspace.new-branch')}
                    aria-label={t('workspace.new-branch-name')}
                    onChange={event => { setNewBranch(event.currentTarget.value) }}
                  />
                  <Button unstyled
                    type="button"
                    disabled={busy || newBranch.trim() === ''}
                    onClick={() => { void mutate({ action: 'create-branch', branch: newBranch }).then(() => { setNewBranch('') }) }}
                  >{t('workspace.create')}</Button>
                </div>
              )}
              <Button unstyled
                type="button"
                className="tockteam-workspace-fact tockteam-commit-toggle grid min-h-[38px] w-full grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2 rounded-[7px] border-0 bg-transparent px-1.5 text-left text-[13px] text-inherit hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_5%))]"
                onClick={() => { setCommitOpen(open => !open) }}
                aria-expanded={commitOpen}
              >
                <span className="tockteam-workspace-fact-icon grid place-items-center text-[var(--dsw-alias-label-secondary,#57606a)] [&_svg]:size-4"><GitCommitHorizontal aria-hidden="true" /></span>
                <span>{t('workspace.commit-or-push')}</span>
                <span className="tockteam-workspace-chevron text-[var(--dsw-alias-label-dimmed,#8c959f)] [&_svg]:block [&_svg]:size-3.5">
                  {commitOpen ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                </span>
              </Button>
              {commitOpen && snapshot?.kind === 'repository' && (
                <div className="tockteam-commit-box grid gap-[7px] pt-[5px] pr-1.5 pb-2.5 pl-10 [&_textarea]:min-h-16 [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-[var(--dsw-alias-border-l2,rgb(0_0_0_/_13%))] [&_textarea]:bg-[var(--dsw-alias-bg-layer-1,#fff)] [&_textarea]:p-[7px] [&_textarea]:text-[11px] [&_textarea]:text-inherit [&>div]:flex [&>div]:gap-1.5 [&_button]:cursor-pointer [&_button]:rounded-md [&_button]:border [&_button]:border-[var(--dsw-alias-border-l2,rgb(0_0_0_/_13%))] [&_button]:bg-transparent [&_button]:px-[9px] [&_button]:py-1 [&_button]:text-[11px] [&_button]:leading-tight [&_button]:text-inherit [&_button:disabled]:cursor-default [&_button:disabled]:opacity-45 [&_small]:text-[10px] [&_small]:text-[var(--dsw-alias-label-dimmed,#8c959f)]">
                  <Textarea unstyled
                    value={commitMessage}
                    placeholder={t('workspace.commit-message')}
                    aria-label={t('workspace.commit-message')}
                    onChange={event => { setCommitMessage(event.currentTarget.value) }}
                  />
                  <div>
                    <Button unstyled
                      type="button"
                      disabled={busy || snapshot.changes.length === 0 || commitMessage.trim() === ''}
                      onClick={() => { void mutate({ action: 'commit', message: commitMessage }) }}
                    >{t('workspace.commit-all')}</Button>
                    <Button unstyled
                      type="button"
                      disabled={busy || !snapshot.hasRemote}
                      onClick={() => { void mutate({ action: 'push' }) }}
                    >{t('workspace.push')}{snapshot.ahead > 0 ? ` (${String(snapshot.ahead)})` : ''}</Button>
                  </div>
                  {snapshot.behind > 0 && (
                    <small>{t('workspace.behind', { count: snapshot.behind })}</small>
                  )}
                </div>
              )}
            </section>

            <section className="tockteam-workspace-directory relative grid min-h-[62px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-[3px] pt-[9px]! pr-10! pb-[9px]! pl-1.5! [&>span]:text-[13px] [&>small]:col-start-1 [&>small]:truncate [&>small]:text-[9px] [&>small]:text-[var(--dsw-alias-label-dimmed,#8c959f)] [&>button]:absolute [&>button]:right-[5px] [&>button]:size-7 [&>button]:cursor-pointer [&>button]:rounded-[7px] [&>button]:border-0 [&>button]:bg-transparent [&>button]:p-0 [&>button]:text-[var(--dsw-alias-label-secondary,#57606a)]">
              <span>{snapshot?.name ?? cwd.split(/[\\/]/).filter(Boolean).pop()}</span>
              <small title={cwd}>{cwd}</small>
              {window.dshDesktop?.chooseWorkspace !== undefined && (
                <Button unstyled type="button" onClick={() => { void chooseWorkspace() }} aria-label={t('workspace.add')}><Plus aria-hidden="true" /></Button>
              )}
            </section>

            <section className="tockteam-processes">
              <h3 className="mx-1.5 mt-2 mb-2.5 text-xs font-medium text-[var(--dsw-alias-label-secondary,#57606a)]">{t('workspace.background-processes')}</h3>
              {processes.map(process => (
                <div key={process.callId} className="tockteam-process-row grid min-h-[34px] grid-cols-[26px_minmax(0,1fr)] items-center gap-2 px-1.5">
                  <span className="grid size-5 place-items-center text-[var(--dsw-alias-label-secondary,#57606a)] [&_svg]:size-[17px]"><SquareTerminal aria-hidden="true" /></span>
                  <code className="truncate text-[11px] leading-[1.35] text-[var(--dsw-alias-label-primary,#1f2328)] [font-family:var(--ds-font-family-code,ui-monospace,monospace)]" title={processTitle(process)}>{processTitle(process)}</code>
                </div>
              ))}
              {processes.length === 0 && (
                <Empty unstyled className="tockteam-workspace-muted p-[18px] text-center text-[11px] text-[var(--dsw-alias-label-dimmed,#8c959f)]">{t('workspace.no-background-processes')}</Empty>
              )}
            </section>
          </div>
        )}
    </div>
  )
}

function WorkspaceToolsSurface(props: {
  locale: LocaleService
  t: Translate<WorkspaceMessage>
  service: WorkspaceToolsService
  sidebar: DesktopSidebar
  panels: DesktopPanels
  pinnedSummary: PinnedSummary
  sessions: SessionsService
  workspaces: WorkspacesService
  showDesktopChrome: boolean
}): ReactNode {
  const t = useTranslate(props.locale, props.t)
  const panelState = useSyncExternalStore(props.service.subscribe, props.service.getSnapshot)
  const sessionList = useSyncExternalStore(props.sessions.list.subscribe, props.sessions.list.getSnapshot)
  const cwd = sessionList.current === undefined
    ? undefined
    : sessionList.byId[sessionList.current]?.cwd
  return (
    <>
      {props.showDesktopChrome && createPortal(
        <>
          <DesktopWindowTitlebar
            panels={props.panels}
            t={t}
          />
          <DesktopPanelToolbar
            service={props.service}
            panels={props.panels}
            pinnedSummary={props.pinnedSummary}
            t={t}
          />
        </>,
        document.body,
      )}
      <SideToolsPanel
        cwd={cwd}
        open={panelState.open}
        width={panelState.width}
        maximized={panelState.maximized}
        sidebar={props.sidebar}
        t={t}
        onClose={() => { props.service.setOpen(false) }}
        onResize={width => { props.service.setWidth(width) }}
      />
    </>
  )
}

function TextFileViewer({
  content,
  path,
  title,
}: {
  content: string
  path: string
  title: string
}): JSX.Element {
  return (
    <div className="tockteam-file-preview min-h-0 flex-1 overflow-auto p-3 [&>div:first-child]:mb-2.5 [&>div:first-child]:flex [&>div:first-child]:items-center [&>div:first-child]:justify-between [&>div:first-child]:gap-2 [&_strong]:truncate [&_strong]:text-xs">
      <div><strong title={path}>{title}</strong></div>
      <pre className="m-0 whitespace-pre-wrap text-[11px] leading-[1.55] [overflow-wrap:anywhere] [font-family:ui-monospace,SFMono-Regular,Menlo,monospace]">{content}</pre>
    </div>
  )
}

function BinaryFileViewer({
  onOpen,
  path,
  title,
  t,
}: {
  onOpen(): Promise<void>
  path: string
  title: string
  t: Translate<WorkspaceMessage>
}): JSX.Element {
  return (
    <div className="tockteam-file-preview min-h-0 flex-1 overflow-auto p-3 [&>div:first-child]:mb-2.5 [&>div:first-child]:flex [&>div:first-child]:items-center [&>div:first-child]:justify-between [&>div:first-child]:gap-2 [&_button]:h-[27px] [&_button]:min-w-[27px] [&_button]:cursor-pointer [&_button]:rounded-[7px] [&_button]:border-0 [&_button]:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_5%))] [&_button]:px-2 [&_button]:text-inherit [&_strong]:truncate [&_strong]:text-xs">
      <div>
        <strong title={path}>{title}</strong>
        <Button unstyled type="button" onClick={() => { void onOpen() }}>
          {t('files.open')}
        </Button>
      </div>
      <div className="tockteam-side-muted p-[18px] text-[11px] text-[var(--dsw-alias-label-tertiary,#8c959f)]">{t('files.viewer.binary')}</div>
    </div>
  )
}

function HtmlFileViewer({
  content,
  path,
  title,
}: {
  content: string
  path: string
  title: string
}): JSX.Element {
  return (
    <div className="tockteam-file-preview tockteam-html-preview flex min-h-0 flex-1 flex-col overflow-auto p-3 [&>div:first-child]:mb-2.5 [&>div:first-child]:flex [&>div:first-child]:items-center [&>div:first-child]:justify-between [&>div:first-child]:gap-2 [&_strong]:truncate [&_strong]:text-xs">
      <div><strong title={path}>{title}</strong></div>
      <iframe className="min-h-[280px] flex-1 rounded-lg border border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_8%))] bg-white" title={title} sandbox="" srcDoc={content} />
    </div>
  )
}

function activeWorkspace(sessions: SessionsService): string | undefined {
  const snapshot = sessions.list.getSnapshot()
  return snapshot.current === undefined
    ? undefined
    : snapshot.byId[snapshot.current]?.cwd
}

function activeSidebarScope(sessions: SessionsService): {
  sessionId: string
  cwd: string
} | undefined {
  const snapshot = sessions.list.getSnapshot()
  if (snapshot.current === undefined) return undefined
  const cwd = snapshot.byId[snapshot.current]?.cwd
  return cwd === undefined ? undefined : { sessionId: snapshot.current, cwd }
}

function registerBuiltinSidebarTools(options: {
  openExternalPath(path: string): Promise<void>
  panels: DesktopPanels
  reviewComments: ReviewCommentsService
  service: WorkspaceToolsService
  sessions: SessionsService
  sidebar: DesktopSidebar
  t: Translate<WorkspaceMessage>
  workspaces: WorkspacesService
}): () => void {
  const {
    openExternalPath,
    panels,
    reviewComments,
    service,
    sessions,
    sidebar,
    t,
    workspaces,
  } = options
  const disposers = [
    sidebar.registerTab({
      chrome: 'custom',
      icon: <ToolIcon kind="review" />,
      id: 'review',
      order: 10,
      render: () => (
        <WorkspacePanel
          reviewComments={reviewComments}
          service={service}
          sessions={sessions}
          workspaces={workspaces}
          t={t}
        />
      ),
      requiresWorkspace: true,
      shortcut: '⌃⇧G',
      single: true,
      title: () => t('review'),
    }),
    sidebar.registerTab({
      action: () => { panels.toggleBottomPanel() },
      icon: <ToolIcon kind="terminal" />,
      id: 'terminal',
      order: 20,
      shortcut: '⌘J',
      title: () => t('terminal'),
    }),
    ...(window.dshDesktop === undefined
      ? []
      : [sidebar.registerTab({
          icon: <ToolIcon kind="browser" />,
          id: 'browser',
          order: 30,
          render: props => <BrowserView {...props} t={t} />,
          shortcut: '⌘T',
          title: () => t('browser'),
        })]),
    sidebar.registerTab({
      dedupeKey: tab => tab.resource,
      icon: <ToolIcon kind="files" />,
      id: 'files',
      order: 40,
      render: props => (
        <FilesView
          {...props}
          scope={activeSidebarScope(sessions)}
          sidebar={sidebar}
          t={t}
        />
      ),
      requiresWorkspace: true,
      shortcut: '⌘P',
      title: () => t('files'),
    }),
    sidebar.registerTab({
      dedupeKey: tab => tab.resource,
      hidden: true,
      icon: <ToolIcon kind="file" />,
      id: 'file',
      render: props => (
        <FileView
          {...props}
          scope={activeSidebarScope(sessions)}
          onOpenPath={openExternalPath}
          sidebar={sidebar}
          t={t}
        />
      ),
      requiresWorkspace: true,
      title: () => t('files'),
    }),
    sidebar.registerTab({
      action: async () => { await service.openSideChat() },
      icon: <ToolIcon kind="chat" />,
      id: 'side-chat',
      order: 50,
      shortcut: '⌥⌘S',
      title: () => t('side-chat'),
    }),
    sidebar.registerTab({
      action: () => { service.openTrajectory() },
      icon: <ToolIcon kind="trajectory" />,
      id: 'trajectory',
      order: 60,
      requiresWorkspace: true,
      title: () => t('trajectory'),
    }),
    sidebar.registerViewer({
      detect: (_path, head) => head.includes(0),
      extensions: [],
      fetchStrategy: 'binary-download',
      id: 'binary',
      order: 100,
      render: input => (
        <BinaryFileViewer
          onOpen={async () => { await openExternalPath(input.path) }}
          path={input.path}
          title={input.title}
          t={t}
        />
      ),
      title: () => t('files.viewer.binary'),
    }),
    sidebar.registerViewer({
      extensions: ['html', 'htm'],
      fetchStrategy: 'text',
      id: 'html',
      order: 30,
      render: input => (
        <HtmlFileViewer
          content={input.content ?? ''}
          path={input.path}
          title={input.title}
        />
      ),
      title: () => t('files.viewer.html'),
    }),
    sidebar.registerViewer({
      extensions: ['md', 'markdown', 'mdx'],
      fetchStrategy: 'text',
      id: 'markdown',
      order: 20,
      render: input => (
        <TextFileViewer
          content={input.content ?? ''}
          path={input.path}
          title={input.title}
        />
      ),
      title: () => t('files.viewer.markdown'),
    }),
    sidebar.registerViewer({
      extensions: [],
      fetchStrategy: 'text',
      id: 'text',
      order: -100,
      render: input => (
        <TextFileViewer
          content={input.content ?? ''}
          path={input.path}
          title={input.title}
        />
      ),
      title: () => t('files.viewer.text'),
    }),
  ]
  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}

function sidebarLabel(value: string | (() => string)): string {
  return typeof value === 'function' ? value() : value
}

function SidebarSettingsRow({
  reset,
  runtime,
  setOpenByDefault,
  setTabEnabled,
  setViewerEnabled,
  setWidth,
  sidebar,
  t,
  useStore,
}: SidebarSettingsProps): JSX.Element {
  const state = useStore(snapshot => snapshot)
  const runtimeState = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
  )
  const tabs = sidebar.getTabs().filter(descriptor => descriptor.hidden !== true)
  const viewers = sidebar.getViewers()
  const updateRuntime = (
    key: keyof SidebarRuntimePreferences,
    enabled: boolean,
  ): void => {
    void runtime.update({ [key]: enabled })
  }
  return (
    <div className="tockteam-sidebar-settings grid w-full gap-[18px] px-0 pt-1 pb-3 text-[var(--dsw-alias-label-primary,#1f2328)] [&_.tockteam-sidebar-settings-heading]:flex [&_.tockteam-sidebar-settings-heading]:items-center [&_.tockteam-sidebar-settings-heading]:justify-between [&_.tockteam-sidebar-settings-heading]:gap-5 [&_.tockteam-sidebar-settings-heading>div]:grid [&_.tockteam-sidebar-settings-heading>div]:gap-1 [&_.tockteam-sidebar-settings-heading>button]:cursor-pointer [&_.tockteam-sidebar-settings-heading>button]:rounded-lg [&_.tockteam-sidebar-settings-heading>button]:border [&_.tockteam-sidebar-settings-heading>button]:border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_9%))] [&_.tockteam-sidebar-settings-heading>button]:bg-transparent [&_.tockteam-sidebar-settings-heading>button]:px-2.5 [&_.tockteam-sidebar-settings-heading>button]:py-1.5 [&_.tockteam-sidebar-settings-row]:flex [&_.tockteam-sidebar-settings-row]:items-center [&_.tockteam-sidebar-settings-row]:justify-between [&_.tockteam-sidebar-settings-row]:gap-5 [&_.tockteam-sidebar-settings-row>span]:grid [&_.tockteam-sidebar-settings-row>span]:gap-1 [&_.tockteam-sidebar-settings-size]:flex [&_.tockteam-sidebar-settings-size]:items-center [&_.tockteam-sidebar-settings-size]:justify-between [&_.tockteam-sidebar-settings-size]:gap-5 max-[760px]:[&_.tockteam-sidebar-settings-size]:flex-col max-[760px]:[&_.tockteam-sidebar-settings-size]:items-start [&_.tockteam-sidebar-settings-size>span]:grid [&_.tockteam-sidebar-settings-size>span]:gap-1 [&_strong]:text-[13px] [&_p]:m-0 [&_p]:text-[11px] [&_p]:leading-[1.45] [&_p]:text-[var(--dsw-alias-label-secondary,#656d76)] [&_small]:m-0 [&_small]:text-[11px] [&_small]:leading-[1.45] [&_small]:text-[var(--dsw-alias-label-secondary,#656d76)] [&>section]:grid [&>section]:gap-2 [&>section>h4]:m-0 [&>section>h4]:text-xs [&_input[type='range']]:w-[min(210px,40%)] [&_input[type='range']]:accent-[var(--dsw-alias-interactive-primary,#4f7de8)] max-[760px]:[&_input[type='range']]:w-full">
      <div className="tockteam-sidebar-settings-heading">
        <div>
          <strong>{t('settings.title')}</strong>
          <p>{t('settings.description')}</p>
        </div>
        <Button unstyled type="button" onClick={reset}>{t('settings.reset')}</Button>
      </div>
      <Label unstyled className="tockteam-sidebar-settings-row">
        <span>
          <strong>{t('settings.open-by-default')}</strong>
          <small>{t('settings.open-by-default-description')}</small>
        </span>
        <Switch
          checked={state.openByDefault}
          onCheckedChange={setOpenByDefault}
        />
      </Label>
      <Label unstyled className="tockteam-sidebar-settings-size">
        <span>
          <strong>{t('settings.width')}</strong>
          <small>{t('settings.width-value', { width: state.width })}</small>
        </span>
        <Input unstyled
          type="range"
          min={SIDEBAR_MIN_WIDTH}
          max={SIDEBAR_MAX_WIDTH}
          step="10"
          value={state.width}
          onChange={event => { setWidth(Number(event.currentTarget.value)) }}
        />
      </Label>
      <section>
        <h4>{t('settings.runtime')}</h4>
        <p>{t('settings.runtime-description')}</p>
        <Label unstyled className="tockteam-sidebar-settings-row">
          <span>
            <strong>{t('settings.agent-terminal-tools')}</strong>
            <small>{t('settings.agent-terminal-tools-description')}</small>
          </span>
          <Switch
            checked={runtimeState.preferences.agentTerminalTools}
            disabled={runtimeState.busy}
            onCheckedChange={enabled => {
              updateRuntime('agentTerminalTools', enabled)
            }}
          />
        </Label>
        <Label unstyled className="tockteam-sidebar-settings-row">
          <span>
            <strong>{t('settings.bottom-terminal')}</strong>
            <small>{t('settings.bottom-terminal-description')}</small>
          </span>
          <Switch
            checked={runtimeState.preferences.bottomPanelAutoTerminal}
            disabled={runtimeState.busy}
            onCheckedChange={enabled => {
              updateRuntime(
                'bottomPanelAutoTerminal',
                enabled,
              )
            }}
          />
        </Label>
        <Label unstyled className="tockteam-sidebar-settings-row">
          <span>
            <strong>{t('settings.open-files')}</strong>
            <small>{t('settings.open-files-description')}</small>
          </span>
          <Switch
            checked={runtimeState.preferences.interceptOpenPath}
            disabled={runtimeState.busy}
            onCheckedChange={enabled => {
              updateRuntime('interceptOpenPath', enabled)
            }}
          />
        </Label>
        <Label unstyled className="tockteam-sidebar-settings-row">
          <span>
            <strong>{t('settings.open-links')}</strong>
            <small>{t('settings.open-links-description')}</small>
          </span>
          <Switch
            checked={runtimeState.preferences.browserInterceptLinks}
            disabled={runtimeState.busy}
            onCheckedChange={enabled => {
              updateRuntime(
                'browserInterceptLinks',
                enabled,
              )
            }}
          />
        </Label>
        {runtimeState.error !== null && (
          <Alert unstyled className="tockteam-sidebar-settings-error text-[#cf222e]!">
            {t(runtimeState.error === 'load'
              ? 'settings.runtime-load-failed'
              : 'settings.runtime-save-failed')}
          </Alert>
        )}
      </section>
      <section>
        <h4>{t('settings.tools')}</h4>
        <p>{t('settings.tools-description')}</p>
        <div className="tockteam-sidebar-settings-list grid grid-cols-2 gap-1.5 max-[760px]:grid-cols-1 [&_label]:flex [&_label]:min-h-9 [&_label]:items-center [&_label]:justify-between [&_label]:gap-2.5 [&_label]:rounded-[9px] [&_label]:border [&_label]:border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_8%))] [&_label]:bg-[var(--dsw-alias-bg-base,transparent)] [&_label]:px-2.5 [&_label]:text-xs">
          {tabs.map(descriptor => (
            <Label unstyled key={descriptor.id}>
              <span>{sidebarLabel(descriptor.title)}</span>
              <Switch
                checked={state.tabsEnabled[descriptor.id] !== false}
                onCheckedChange={enabled => {
                  setTabEnabled(descriptor.id, enabled)
                }}
              />
            </Label>
          ))}
        </div>
      </section>
      <section>
        <h4>{t('settings.viewers')}</h4>
        <p>{t('settings.viewers-description')}</p>
        <div className="tockteam-sidebar-settings-list grid grid-cols-2 gap-1.5 max-[760px]:grid-cols-1 [&_label]:flex [&_label]:min-h-9 [&_label]:items-center [&_label]:justify-between [&_label]:gap-2.5 [&_label]:rounded-[9px] [&_label]:border [&_label]:border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_8%))] [&_label]:bg-[var(--dsw-alias-bg-base,transparent)] [&_label]:px-2.5 [&_label]:text-xs">
          {viewers.map(descriptor => (
            <Label unstyled key={descriptor.id}>
              <span>{sidebarLabel(descriptor.title)}</span>
              <Switch
                checked={state.viewersEnabled[descriptor.id] !== false}
                onCheckedChange={enabled => {
                  setViewerEnabled(descriptor.id, enabled)
                }}
              />
            </Label>
          ))}
        </div>
      </section>
    </div>
  )
}

function syncSidebarSettings(
  actions: BoundSidebarSettingsActions | undefined,
  snapshot: DesktopSidebarSnapshot,
): void {
  actions?.sync(
    snapshot.openByDefault,
    snapshot.revision,
    { ...snapshot.tabsEnabled },
    { ...snapshot.viewersEnabled },
    snapshot.width,
  )
}

function pathBelongsToActiveWorkspace(
  sessions: SessionsService,
  path: string,
): boolean {
  const cwd = activeWorkspace(sessions)
  if (cwd === undefined) return false
  const normalizedRoot = cwd.replaceAll('\\', '/').replace(/\/+$/, '')
  const normalizedPath = path.replaceAll('\\', '/').replace(/\/+$/, '')
  return normalizedPath === normalizedRoot
    || normalizedPath.startsWith(`${normalizedRoot}/`)
}

function AppRailIcon({ kind }: { kind: 'agent' | 'notebook' }): ReactNode {
  if (kind === 'agent') {
    // TockbotLogoMark, matching tockbot apps/web/src/components/brand/TockbotLogoMark.tsx
    return (
      <svg aria-hidden="true" data-tockteam-product-mark="true" fill="none" viewBox="0 0 20 20">
        <path clipRule="evenodd" d="M10 5.5C6.96243 5.5 4.5 7.96243 4.5 11C4.5 14.0376 6.96243 16.5 10 16.5C13.0376 16.5 15.5 14.0376 15.5 11C15.5 7.96243 13.0376 5.5 10 5.5ZM2.5 11C2.5 6.85786 5.85786 3.5 10 3.5C14.1421 3.5 17.5 6.85786 17.5 11C17.5 15.1421 14.1421 18.5 10 18.5C5.85786 18.5 2.5 15.1421 2.5 11Z" fill="currentColor" fillRule="evenodd" />
        <path clipRule="evenodd" d="M2.79289 18.2071C3.18342 18.5976 3.81658 18.5976 4.20711 18.2071L5.70711 16.7071C6.09763 16.3166 6.09763 15.6834 5.70711 15.2929C5.31658 14.9023 4.68342 14.9023 4.29289 15.2929L2.79289 16.7929C2.40237 17.1834 2.40237 17.8166 2.79289 18.2071Z" fill="currentColor" fillRule="evenodd" />
        <path clipRule="evenodd" d="M14.2929 15.2929C14.6834 14.9024 15.3166 14.9024 15.70711 15.2929L17.2071 16.7929C17.5976 17.1834 17.5976 17.8166 17.2071 18.2071C16.8166 18.5977 16.1834 18.5977 15.7929 18.2071L14.2929 16.7071C13.9024 16.3166 13.9024 15.6834 14.2929 15.2929Z" fill="currentColor" fillRule="evenodd" />
        <path d="M7.5 10.5 L9.5 13 L13 8.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        <path clipRule="evenodd" d="M6.33196 3.17163L2.57422 6.76042C2.57422 6.76042 2.49689 6.6895 2.38431 6.56157C2.12745 6.26968 1.68708 5.68098 1.56299 4.9606C1.45034 4.30659 1.59837 3.54403 2.3811 2.79649C3.16383 2.04896 3.93239 1.93613 4.58053 2.07874C5.29445 2.23581 5.86228 2.70277 6.14205 2.97278C6.26467 3.09112 6.33196 3.17163 6.33196 3.17163Z" fill="currentColor" fillRule="evenodd" />
        <path clipRule="evenodd" d="M13.668 3.17163L17.4258 6.76042C17.4258 6.76042 17.5031 6.6895 17.6157 6.56157C17.8726 6.26968 18.3129 5.68098 18.437 4.9606C18.5497 4.30659 18.4016 3.54403 17.6189 2.79649C16.8362 2.04896 16.0676 1.93613 15.4195 2.07874C14.7055 2.23581 14.1377 2.70277 13.8579 2.97278C13.7353 3.09112 13.668 3.17163 13.668 3.17163Z" fill="currentColor" fillRule="evenodd" />
      </svg>
    )
  }
  return <Notebook aria-hidden="true" />
}

function DesktopAppRail({
  location,
  navigate,
}: {
  location: TockTutorRouteLocation
  navigate: (path: string) => void
}): ReactNode {
  const tockCoderActive = isTockCoderPath(location.pathname)
  const tockTutorActive = isTockTutorPath(location.pathname)
  const [pluginsAvailable, setPluginsAvailable] = useState(false)
  useEffect(() => {
    const sync = (): void => {
      setPluginsAvailable(document.querySelector('[data-tockteam-marketplace-nav]') !== null)
    }
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })
    sync()
    return () => { observer.disconnect() }
  }, [])
  return (
    <TooltipProvider>
      <nav className="tockteam-app-rail flex h-full box-border flex-col items-center gap-1 px-1 py-2 [&_button]:grid [&_button]:size-8 [&_button]:flex-none [&_button]:cursor-pointer [&_button]:place-items-center [&_button]:rounded-[7px] [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0 [&_button]:text-[color-mix(in_srgb,var(--dsw-alias-label-primary,#1f2328)_62%,transparent)] [&_button:hover]:bg-[color-mix(in_srgb,var(--dsw-alias-label-primary,#1f2328)_7%,transparent)] [&_button:hover]:text-[var(--dsw-alias-label-primary,#1f2328)] [&_button[aria-current='page']]:bg-[color-mix(in_srgb,var(--dsw-alias-label-primary,#1f2328)_11%,transparent)] [&_button[aria-current='page']]:text-[var(--dsw-alias-label-primary,#1f2328)] [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-1 [&_button:focus-visible]:outline-[var(--dsw-alias-border-focus,#315efb)] [&_svg]:size-[18px]" aria-label="App Navigation">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button unstyled
              type="button"
              aria-label="TockCoder"
              aria-current={tockCoderActive ? 'page' : undefined}
              onClick={() => { navigate(TOCKCODER_ROUTE_PREFIX) }}
            ><AppRailIcon kind="agent" /></Button>
          </TooltipTrigger>
          <TooltipContent side="right">TockCoder</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button unstyled
              type="button"
              aria-label="TockTutor"
              aria-current={tockTutorActive ? 'page' : undefined}
              onClick={() => { navigate(TOCKTUTOR_ROUTE_PREFIX) }}
            ><AppRailIcon kind="notebook" /></Button>
          </TooltipTrigger>
          <TooltipContent side="right">TockTutor</TooltipContent>
        </Tooltip>
        {tockCoderActive && (
          <div className="mt-auto flex flex-col gap-1 pb-1">
            {pluginsAvailable && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button unstyled
                    type="button"
                    aria-label="Plugins"
                    onClick={() => {
                      const target = document.querySelector('[data-tockteam-marketplace-nav]')
                      if (target instanceof HTMLButtonElement) target.click()
                    }}
                  ><Blocks aria-hidden="true" /></Button>
                </TooltipTrigger>
                <TooltipContent side="right">Plugins</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button unstyled
                  type="button"
                  aria-label="Settings"
                  onClick={() => {
                    document.querySelector('[data-slot="settings.trigger"]')
                      ?.closest<HTMLButtonElement>('button')?.click()
                  }}
                ><Settings aria-hidden="true" /></Button>
              </TooltipTrigger>
              <TooltipContent side="right">Settings</TooltipContent>
            </Tooltip>
          </div>
        )}
      </nav>
    </TooltipProvider>
  )
}

function registerTockTutorRoute(slots: RouteSlotsService): void {
  const routeStore = defineStore<RouteState>({
    init: () => ({ location: readTockTutorRouteLocation() }),
    actions: {
      setLocation: (draft, location: TockTutorRouteLocation) => {
        draft.location = location
      },
    },
  })
  slots.inject('shell.overlay', () => slots.register({
    children: {
      [TOCKTUTOR_ROUTE_SLOT]: { kind: 'single', scope: 'root' },
    },
    id: 'tockteam-tocktutor-route',
    name: 'shell.overlay',
    order: -1000,
    store: routeStore,
  }, (props: RouteHostProps): ReactNode => TockTutorRouteHost(props, slots)))
}

function TockTutorRouteHost(props: RouteHostProps, routeSlots: RouteSlotsService): ReactNode {
  const routeEntries = useSyncExternalStore(
    listener => routeSlots.subscribe(TOCKTUTOR_ROUTE_SLOT, listener),
    () => routeSlots.entries(TOCKTUTOR_ROUTE_SLOT).length,
    () => 0,
  )
  const location = props.useStore(state => state.location)
  const navigate = useCallback((path: string, mode: 'push' | 'replace' = 'push'): void => {
    const target = resolveTockTutorNavigation(path)
    if (target === undefined) return
    const current = readTockTutorRouteLocation()
    if (target.pathname === current.pathname
      && target.search === current.search
      && target.hash === current.hash) return
    window.history[mode === 'replace' ? 'replaceState' : 'pushState'](
      window.history.state,
      '',
      target.href,
    )
    props.actions.setLocation(readTockTutorRouteLocation())
  }, [props.actions])
  useEffect(() => {
    const canonicalPath = canonicalTockTeamPath(location.pathname)
    if (canonicalPath !== location.pathname) {
      navigate(`${canonicalPath}${location.search}${location.hash}`, 'replace')
    }
  }, [location.hash, location.pathname, location.search, navigate])
  useEffect(() => {
    const onPopState = (): void => { props.actions.setLocation(readTockTutorRouteLocation()) }
    window.addEventListener('popstate', onPopState)
    return () => { window.removeEventListener('popstate', onPopState) }
  }, [props.actions])
  const active = routeEntries > 0 && isTockTutorPath(location.pathname)
  useEffect(() => {
    const bridge = window.dshDesktop
    void bridge?.setTockTutorActive(active).catch(() => undefined)
    return () => {
      if (active) void bridge?.setTockTutorActive(false).catch(() => undefined)
    }
  }, [active])
  useEffect(() => {
    const appRoot = document.getElementById('root')
    const sidebarRoot = document.getElementById('tockteam-sidebar-root')
    if (!active || appRoot === null) return
    const appRootWasInert = appRoot.inert
    const sidebarRootWasInert = sidebarRoot?.inert
    const routeState = document.documentElement.dataset.tockteamTocktutorActive
    appRoot.inert = true
    if (sidebarRoot !== null) sidebarRoot.inert = true
    document.documentElement.dataset.tockteamTocktutorActive = 'true'
    return () => {
      appRoot.inert = appRootWasInert
      if (sidebarRoot !== null && sidebarRootWasInert !== undefined) {
        sidebarRoot.inert = sidebarRootWasInert
      }
      if (routeState === undefined) {
        delete document.documentElement.dataset.tockteamTocktutorActive
      } else {
        document.documentElement.dataset.tockteamTocktutorActive = routeState
      }
    }
  }, [active])
  const rail = document.getElementById('tockteam-rail-root')
  const navigation = routeEntries > 0 && rail !== null
    ? createPortal(<DesktopAppRail location={location} navigate={navigate} />, rail)
    : null
  const workbench = active
    ? createPortal(
        <div className="tockteam-tocktutor-route pointer-events-auto fixed z-[1001] bg-[var(--dsw-alias-bg-base,#fff)] [inset:var(--tockteam-titlebar-height,0)_0_0_var(--tockteam-rail-width)]" data-tockteam-tocktutor-route="true">
          {props.renderSlot(TOCKTUTOR_ROUTE_SLOT, { location, navigate })}
        </div>,
        document.body,
      )
    : null
  return <>{navigation}{workbench}</>
}

export function apply(ctx: ClientContext): void {
  const locale = ctx.get('locale') as LocaleService
  const slots = ctx.get('slots') as SlotsService
  const surface = ctx.get(TOCKTEAM_SURFACE_VIEW_SERVICE) as TockTeamSurfaceView
  if (surface.kind === 'desktop') registerTockTutorRoute(slots as unknown as RouteSlotsService)
  const t: Translate<WorkspaceMessage> = locale.bind('tockteam.sidebar')
  ctx.effect(
    () => locale.register('tockteam.sidebar', WORKSPACE_MESSAGES),
    'tockteam-sidebar: workspace tools dictionaries',
  )
  const panels = ctx.get('desktopPanels') as DesktopPanels
  const pinnedSummary = ctx.get('pinnedSummary') as PinnedSummary
  const sessions = ctx.get('sessions') as SessionsService
  const inputTriggers = ctx.get('inputTriggers') as ReviewInputTriggersService
  const workspaces = ctx.get('workspaces') as WorkspacesService
  const originalOpenPath = workspaces.openPath
  const openExternalPath = async (path: string): Promise<void> => {
    await originalOpenPath.call(workspaces, path)
  }
  const reviewComments = new ReviewCommentsService(
    sessions,
    inputTriggers,
    window.localStorage,
  )
  const desktopSidebar = new DesktopSidebarService(
    new HttpSidebarPreferencesStorage(fetch.bind(globalThis)),
  )
  const runtimeSettings = new SidebarRuntimeSettingsService()
  const service = new WorkspaceToolsService(
    desktopSidebar,
    panels,
    locale,
    t,
    pinnedSummary,
    sessions,
    workspaces,
    surface.kind === 'desktop',
  )
  const unregisterBuiltins = registerBuiltinSidebarTools({
    openExternalPath,
    panels,
    reviewComments,
    service,
    sessions,
    sidebar: desktopSidebar,
    t,
    workspaces,
  })
  const settingsStore = defineStore<SidebarSettingsState>({
    init: () => ({
      openByDefault: false,
      revision: -1,
      tabsEnabled: {},
      viewersEnabled: {},
      width: DEFAULT_SIDEBAR_PREFERENCES.defaultWidth,
    }),
    actions: {
      sync: (
        draft,
        openByDefault: boolean,
        revision: number,
        tabsEnabled: Record<string, boolean>,
        viewersEnabled: Record<string, boolean>,
        width: number,
      ) => {
        if (revision < draft.revision) return
        draft.openByDefault = openByDefault
        draft.revision = revision
        draft.tabsEnabled = tabsEnabled
        draft.viewersEnabled = viewersEnabled
        draft.width = width
      },
    },
  })
  let settingsActions: BoundSidebarSettingsActions | undefined
  ctx.effect(() => {
    const syncSession = (): void => {
      desktopSidebar.setSession(sessions.list.getSnapshot().current ?? null)
    }
    syncSession()
    const stopSessions = sessions.list.subscribe(syncSession)
    const stopSettings = desktopSidebar.subscribe(() => {
      syncSidebarSettings(settingsActions, desktopSidebar.getSnapshot())
    })
    const syncRuntime = (): void => {
      panels.setAutoOpenTerminal(
        runtimeSettings.getSnapshot().preferences.bottomPanelAutoTerminal,
      )
    }
    const stopRuntime = runtimeSettings.subscribe(syncRuntime)
    const interceptOpenPath = async (path: string): Promise<void> => {
      const runtime = runtimeSettings.getSnapshot().preferences
      const snapshot = desktopSidebar.getSnapshot()
      if (runtime.interceptOpenPath
        && snapshot.ready
        && desktopSidebar.isTabEnabled('file')
        && pathBelongsToActiveWorkspace(sessions, path)) {
        service.openFile(path)
        return
      }
      await openExternalPath(path)
    }
    const interceptExternalLink = (event: MouseEvent): void => {
      if (event.defaultPrevented || event.button !== 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }
      const target = event.target
      const anchor = target instanceof Element
        ? target.closest<HTMLAnchorElement>('a[href]')
        : null
      if (anchor === null || anchor.hasAttribute('download')) return
      let url: URL
      try { url = new URL(anchor.href, window.location.href) } catch { return }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return
      if (url.origin === window.location.origin) return
      const runtime = runtimeSettings.getSnapshot().preferences
      const snapshot = desktopSidebar.getSnapshot()
      if (window.dshDesktop === undefined
        || !runtime.browserInterceptLinks
        || !snapshot.ready
        || !desktopSidebar.isTabEnabled('browser')) return
      event.preventDefault()
      service.openBrowserUrl(url.href)
    }
    workspaces.openPath = interceptOpenPath
    document.addEventListener('click', interceptExternalLink, true)
    syncRuntime()
    void runtimeSettings.start()
    void desktopSidebar.start()
    service.mount()
    const removeSidebar = ctx.reflect.provide(
      'desktopSidebar',
      desktopSidebar,
      undefined,
    )
    const removeService = ctx.reflect.provide('workspaceTools', service, undefined)
    return () => {
      stopSessions()
      stopSettings()
      stopRuntime()
      document.removeEventListener('click', interceptExternalLink, true)
      if (workspaces.openPath === interceptOpenPath) {
        workspaces.openPath = originalOpenPath
      }
      service.dispose()
      unregisterBuiltins()
      reviewComments.dispose()
      desktopSidebar.dispose()
      runtimeSettings.dispose()
      void removeSidebar?.()
      void removeService?.()
    }
  }, 'tockteam-sidebar: workspace tools and panel toolbar')

  slots.inject('settings.section', () => slots.register({
    id: 'tockteam-sidebar',
    inject: actions => {
      settingsActions = actions
      syncSidebarSettings(settingsActions, desktopSidebar.getSnapshot())
      return {
        reset: () => {
          desktopSidebar.setOpenByDefault(
            DEFAULT_SIDEBAR_PREFERENCES.openByDefault,
          )
          desktopSidebar.setWidth(DEFAULT_SIDEBAR_PREFERENCES.defaultWidth)
          for (const descriptor of desktopSidebar.getTabs()) {
            desktopSidebar.setTabEnabled(descriptor.id, true)
          }
          for (const descriptor of desktopSidebar.getViewers()) {
            desktopSidebar.setViewerEnabled(descriptor.id, true)
          }
          void runtimeSettings.reset()
        },
        setOpenByDefault: open => { desktopSidebar.setOpenByDefault(open) },
        setTabEnabled: (id, enabled) => {
          desktopSidebar.setTabEnabled(id, enabled)
        },
        setViewerEnabled: (id, enabled) => {
          desktopSidebar.setViewerEnabled(id, enabled)
        },
        setWidth: width => { desktopSidebar.setWidth(width) },
        runtime: runtimeSettings,
        sidebar: desktopSidebar,
      }
    },
    label: () => t('settings.title'),
    locale: 'tockteam.sidebar',
    name: 'settings.section',
    order: 40,
    store: settingsStore,
  }, SidebarSettingsRow))
}
