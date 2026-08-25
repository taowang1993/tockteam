import { Alert } from '@tockteam/ui/alert'
import { Button } from '@tockteam/ui/button'
import { Input } from '@tockteam/ui/input'
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  ChevronLeft,
  ClipboardPlus,
  File,
  FileSymlink,
  FileText,
  Folder,
  Globe,
  History,
  MessageSquare,
  Minus,
  RefreshCw,
  SquareTerminal,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { Translate } from '../../../shared/i18n.ts'
import type { WorkspaceFilesResponse, WorkspaceFileKind } from '../protocol.ts'
import {
  betterSidebarApi,
  mapBetterSidebarFile,
  mapBetterSidebarTree,
  type BetterSidebarScope,
} from './better-sidebar-api.ts'
import type {
  DesktopSidebar,
  DesktopSidebarRenderProps,
  DesktopSidebarTabDescriptor,
} from './sidebar-service.ts'
import type { WorkspaceMessage } from './i18n.ts'

interface ElectronWebviewElement extends HTMLElement {
  canGoBack(): boolean
  getURL(): string
  goBack(): void
  loadURL(url: string): Promise<void>
  reload(): void
}

interface SideToolsPanelProps {
  cwd: string | undefined
  maximized: boolean
  onClose(): void
  onResize(width: number): void
  open: boolean
  sidebar: DesktopSidebar
  t: Translate<WorkspaceMessage>
  width: number
}

type ToolIconKind =
  | 'browser'
  | 'chat'
  | 'file'
  | 'files'
  | 'review'
  | 'terminal'
  | 'trajectory'

const TOOL_ICONS: Record<ToolIconKind, LucideIcon> = {
  browser: Globe,
  chat: MessageSquare,
  file: File,
  files: Folder,
  review: ClipboardPlus,
  terminal: SquareTerminal,
  trajectory: History,
}

export function ToolIcon({ kind }: { kind: ToolIconKind }): JSX.Element {
  const Icon = TOOL_ICONS[kind]
  return <Icon aria-hidden="true" />
}

function defaultIcon(id: string): ToolIconKind {
  if (id === 'review' || id === 'terminal' || id === 'browser'
    || id === 'files' || id === 'trajectory') return id
  if (id === 'side-chat') return 'chat'
  return 'file'
}

function descriptorTitle(descriptor: DesktopSidebarTabDescriptor): string {
  return typeof descriptor.title === 'function'
    ? descriptor.title()
    : descriptor.title
}

function DescriptorIcon({ descriptor }: {
  descriptor: DesktopSidebarTabDescriptor
}): JSX.Element {
  const icon = typeof descriptor.icon === 'function'
    ? descriptor.icon(21)
    : descriptor.icon
  return <>{icon ?? <ToolIcon kind={defaultIcon(descriptor.id)} />}</>
}

function ToolRow(props: {
  descriptor: DesktopSidebarTabDescriptor
  disabled?: boolean
  onClick(): void
}): JSX.Element {
  return (
    <Button unstyled
      className="tockteam-side-tool-row grid min-h-12 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-3 text-left text-inherit hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_5%))] disabled:cursor-default disabled:opacity-40 [&>span]:text-sm [&_kbd]:rounded-full [&_kbd]:border-0 [&_kbd]:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] [&_kbd]:px-[7px] [&_kbd]:py-0.5 [&_kbd]:text-[11px] [&_kbd]:text-[var(--dsw-alias-label-tertiary,#8c959f)] [&_kbd]:[font:11px_system-ui] [&_svg]:size-[21px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.7] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]"
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <DescriptorIcon descriptor={props.descriptor} />
      <span>{descriptorTitle(props.descriptor)}</span>
      {props.descriptor.shortcut !== undefined && (
        <kbd>{props.descriptor.shortcut}</kbd>
      )}
    </Button>
  )
}

function SideMenu(props: SideToolsPanelProps): JSX.Element {
  const [error, setError] = useState('')
  const open = async (descriptor: DesktopSidebarTabDescriptor): Promise<void> => {
    try {
      setError('')
      if (descriptor.action !== undefined && descriptor.render === undefined) {
        await descriptor.action()
        return
      }
      const result = props.sidebar.openTab({ type: descriptor.id })
      if (result.kind === 'limit') throw new Error(props.t('side.tab-limit'))
      if (result.kind === 'disabled') throw new Error(props.t('side.tool-disabled'))
      if (result.kind === 'missing') throw new Error(props.t('side.tool-missing'))
      if (result.kind === 'not-ready') throw new Error(props.t('side.not-ready'))
    } catch (next) {
      setError(next instanceof Error ? next.message : String(next))
    }
  }
  const descriptors = props.sidebar.getTabs().filter(descriptor =>
    descriptor.hidden !== true && props.sidebar.isTabEnabled(descriptor.id),
  )
  return (
    <div className="tockteam-side-menu grid min-h-0 flex-1 content-center gap-[5px] p-6">
      {descriptors.map(descriptor => (
        <ToolRow
          key={descriptor.id}
          descriptor={descriptor}
          disabled={(descriptor.requiresWorkspace === true && props.cwd === undefined)
            || descriptor.available?.() === false}
          onClick={() => { void open(descriptor) }}
        />
      ))}
      {error !== '' && <Alert unstyled className="tockteam-side-error mx-3 my-2 rounded-[7px] bg-[color-mix(in_srgb,#cf222e_10%,transparent)] px-[9px] py-[7px] text-[11px] text-[#cf222e]">{error}</Alert>}
    </div>
  )
}

function normalizeBrowserUrl(
  raw: string,
  t: Translate<WorkspaceMessage>,
): string {
  const value = raw.trim()
  if (value === '') throw new Error(t('browser.enter-url'))
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value)
    ? value
    : `https://${value}`)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(t('browser.http-only'))
  }
  return url.href
}

export function BrowserView({
  patch,
  t,
  tab,
}: DesktopSidebarRenderProps & {
  t: Translate<WorkspaceMessage>
}): JSX.Element {
  const container = useRef<HTMLDivElement | null>(null)
  const webview = useRef<ElectronWebviewElement | null>(null)
  const [address, setAddress] = useState(tab.resource ?? '')
  const [error, setError] = useState('')
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    const host = container.current
    if (host === null) return
    const element = document.createElement('webview') as unknown as ElectronWebviewElement
    element.className = 'tockteam-browser-webview flex h-full w-full'
    element.setAttribute('partition', 'persist:tockteam-browser')
    element.setAttribute('src', tab.resource ?? 'about:blank')
    const update = (event: Event): void => {
      const next = 'url' in event && typeof event.url === 'string'
        ? event.url
        : element.getURL()
      if (next !== '' && next !== 'about:blank') {
        try {
          const safe = normalizeBrowserUrl(next, t)
          const url = new URL(safe)
          setAddress(safe)
          patch({ resource: safe, title: url.hostname || t('browser') })
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : String(nextError))
        }
      }
      setCanGoBack(element.canGoBack())
    }
    const guard = (event: Event): void => {
      if (!('url' in event) || typeof event.url !== 'string') return
      try {
        normalizeBrowserUrl(event.url, t)
      } catch (nextError) {
        event.preventDefault()
        setError(nextError instanceof Error ? nextError.message : String(nextError))
      }
    }
    const failed = (event: Event): void => {
      const description = 'errorDescription' in event
        ? String(event.errorDescription)
        : t('browser.page-failed')
      setError(description)
    }
    element.addEventListener('did-navigate', update)
    element.addEventListener('did-navigate-in-page', update)
    element.addEventListener('will-navigate', guard)
    element.addEventListener('did-fail-load', failed)
    host.append(element)
    webview.current = element
    return () => {
      webview.current = null
      element.remove()
    }
  }, [tab.id])

  const navigate = async (): Promise<void> => {
    try {
      const url = normalizeBrowserUrl(address, t)
      setAddress(url)
      setError('')
      await webview.current?.loadURL(url)
    } catch (next) {
      setError(next instanceof Error ? next.message : String(next))
    }
  }

  return (
    <div className="tockteam-browser-view flex min-h-0 flex-1 flex-col">
      <form
        className="tockteam-browser-bar flex min-h-10 flex-none items-center gap-[5px] border-b border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_8%))] px-2.5 py-1.5 [&_button]:h-[27px] [&_button]:min-w-[27px] [&_button]:cursor-pointer [&_button]:rounded-[7px] [&_button]:border-0 [&_button]:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_5%))] [&_button]:px-2 [&_button]:text-inherit [&_button:disabled]:cursor-default [&_button:disabled]:opacity-35 [&_button_svg]:mx-auto [&_button_svg]:block [&_button_svg]:size-[15px]"
        onSubmit={event => { event.preventDefault(); void navigate() }}
      >
        <Button unstyled
          type="button"
          disabled={!canGoBack}
          aria-label={t('browser.back')}
          onClick={() => { webview.current?.goBack() }}
        ><ChevronLeft aria-hidden="true" /></Button>
        <Button unstyled
          type="button"
          aria-label={t('browser.reload')}
          onClick={() => { webview.current?.reload() }}
        ><RefreshCw aria-hidden="true" /></Button>
        <Input unstyled
          value={address}
          className="h-7 min-w-0 flex-1 rounded-[7px] border border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_10%))] bg-[var(--dsw-alias-bg-base,#fff)] px-[9px] text-inherit outline-none"
          placeholder={t('browser.enter-url')}
          aria-label={t('browser.url')}
          onChange={event => { setAddress(event.currentTarget.value) }}
        />
        <Button unstyled type="submit">{t('browser.go')}</Button>
      </form>
      {error !== '' && <Alert unstyled className="tockteam-browser-error mx-3 my-2 rounded-[7px] bg-[color-mix(in_srgb,#cf222e_10%,transparent)] px-[9px] py-[7px] text-[11px] text-[#cf222e]">{error}</Alert>}
      <div ref={container} className="tockteam-browser-host min-h-0 flex-1" />
    </div>
  )
}

function formatSize(size: number | null): string {
  if (size === null) return ''
  if (size < 1024) return `${String(size)} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function FileGlyph({ kind }: { kind: WorkspaceFileKind }) {
  const Icon = kind === 'directory' ? Folder : kind === 'symlink' ? FileSymlink : FileText
  return <Icon aria-hidden="true" />
}

export function FilesView({
  patch,
  scope,
  sidebar,
  t,
  tab,
}: DesktopSidebarRenderProps & {
  scope: BetterSidebarScope | undefined
  sidebar: DesktopSidebar
  t: Translate<WorkspaceMessage>
}): JSX.Element {
  const cwd = scope?.cwd
  const [path, setPath] = useState(tab.resource ?? cwd)
  const [snapshot, setSnapshot] = useState<WorkspaceFilesResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const next = tab.resource ?? cwd
    setPath(next)
    setSnapshot(null)
  }, [cwd, tab.id, tab.resource])
  useEffect(() => {
    if (cwd === undefined || path === undefined || scope === undefined) return
    const controller = new AbortController()
    setLoading(true)
    void betterSidebarApi.fsTree(scope, path, controller.signal).then(
      listing => {
        setSnapshot(mapBetterSidebarTree(cwd, listing))
        setError('')
      },
    ).catch((next: unknown) => {
      if (!controller.signal.aborted) {
        setError(next instanceof Error ? next.message : String(next))
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => { controller.abort() }
  }, [cwd, path, refreshKey, scope?.sessionId])

  const browse = (next: string): void => {
    setPath(next)
    patch({ resource: next })
  }
  if (cwd === undefined) {
    return <div className="tockteam-side-empty p-[18px] text-[11px] text-[var(--dsw-alias-label-tertiary,#8c959f)]">{t('files.select-workspace')}</div>
  }
  return (
    <div className="tockteam-files-view flex min-h-0 flex-1 flex-col">
      <div className="tockteam-files-path flex min-h-10 flex-none items-center gap-[5px] border-b border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_8%))] px-2.5 py-1.5 [&_button]:h-[27px] [&_button]:min-w-[27px] [&_button]:cursor-pointer [&_button]:rounded-[7px] [&_button]:border-0 [&_button]:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_5%))] [&_button]:px-2 [&_button]:text-inherit [&_button:disabled]:cursor-default [&_button:disabled]:opacity-35 [&_button_svg]:mx-auto [&_button_svg]:block [&_button_svg]:size-[15px]" title={snapshot?.path ?? cwd}>
        <Button unstyled
          type="button"
          disabled={snapshot?.parent == null}
          onClick={() => {
            if (snapshot?.parent !== undefined && snapshot.parent !== null) {
              browse(snapshot.parent)
            }
          }}
        ><ChevronLeft aria-hidden="true" /></Button>
        <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--dsw-alias-label-secondary,#57606a)]">{(snapshot?.path ?? cwd).slice(cwd.length) || '/'}</span>
        <Button unstyled
          type="button"
          onClick={() => { setRefreshKey(value => value + 1) }}
        ><RefreshCw aria-hidden="true" /></Button>
      </div>
      {loading && <div className="tockteam-side-muted p-[18px] text-[11px] text-[var(--dsw-alias-label-tertiary,#8c959f)]">{t('files.loading')}</div>}
      {error !== '' && <Alert unstyled className="tockteam-side-error mx-3 my-2 rounded-[7px] bg-[color-mix(in_srgb,#cf222e_10%,transparent)] px-[9px] py-[7px] text-[11px] text-[#cf222e]">{error}</Alert>}
      {snapshot?.kind === 'directory' && (
        <div className="tockteam-file-list min-h-0 flex-1 overflow-auto px-[9px] pt-1.5 pb-5">
          {snapshot.entries.map(entry => (
            <Button unstyled
              className="grid min-h-8 w-full grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[7px] border-0 bg-transparent px-[7px] text-left text-inherit hover:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_5%))] [&>span:first-child]:grid [&>span:first-child]:place-items-center [&>span:first-child_svg]:size-4 [&>span:nth-child(2)]:truncate [&>span:nth-child(2)]:text-xs [&_small]:text-[10px] [&_small]:text-[var(--dsw-alias-label-tertiary,#8c959f)]"
              key={entry.path}
              type="button"
              onClick={() => {
                if (entry.kind === 'directory') browse(entry.path)
                else {
                  sidebar.openTab({
                    resource: entry.path,
                    title: entry.name,
                    type: 'file',
                  })
                }
              }}
            >
              <span><FileGlyph kind={entry.kind} /></span>
              <span title={entry.name}>{entry.name}</span>
              <small>{formatSize(entry.size)}</small>
            </Button>
          ))}
          {snapshot.entries.length === 0 && (
            <div className="tockteam-side-muted p-[18px] text-[11px] text-[var(--dsw-alias-label-tertiary,#8c959f)]">{t('files.empty-directory')}</div>
          )}
          {snapshot.truncated && (
            <div className="tockteam-side-muted p-[18px] text-[11px] text-[var(--dsw-alias-label-tertiary,#8c959f)]">{t('files.showing-first')}</div>
          )}
        </div>
      )}
    </div>
  )
}

export function FileView({
  onOpenPath,
  scope,
  sidebar,
  t,
  tab,
}: DesktopSidebarRenderProps & {
  scope: BetterSidebarScope | undefined
  onOpenPath(path: string): Promise<void>
  sidebar: DesktopSidebar
  t: Translate<WorkspaceMessage>
}): JSX.Element {
  const cwd = scope?.cwd
  const [snapshot, setSnapshot] = useState<WorkspaceFilesResponse | null>(null)
  const [error, setError] = useState('')
  const path = tab.resource

  useEffect(() => {
    if (cwd === undefined || path === undefined || scope === undefined) return
    const controller = new AbortController()
    void betterSidebarApi.fsRead(scope, path, controller.signal).then(
      result => {
        setSnapshot(mapBetterSidebarFile(cwd, path, result))
        setError('')
      },
    ).catch((next: unknown) => {
      if (!controller.signal.aborted) {
        setError(next instanceof Error ? next.message : String(next))
      }
    })
    return () => { controller.abort() }
  }, [cwd, path, scope?.sessionId])

  if (cwd === undefined || path === undefined) {
    return <div className="tockteam-side-empty p-[18px] text-[11px] text-[var(--dsw-alias-label-tertiary,#8c959f)]">{t('files.select-workspace')}</div>
  }
  if (error !== '') return <Alert unstyled className="tockteam-side-error mx-3 my-2 rounded-[7px] bg-[color-mix(in_srgb,#cf222e_10%,transparent)] px-[9px] py-[7px] text-[11px] text-[#cf222e]">{error}</Alert>
  if (snapshot === null) return <div className="tockteam-side-muted p-[18px] text-[11px] text-[var(--dsw-alias-label-tertiary,#8c959f)]">{t('files.loading')}</div>
  if (snapshot.kind !== 'file') {
    return <div className="tockteam-side-muted p-[18px] text-[11px] text-[var(--dsw-alias-label-tertiary,#8c959f)]">{t('files.not-file')}</div>
  }
  const head = snapshot.binary
    ? new Uint8Array([0])
    : new TextEncoder().encode((snapshot.content ?? '').slice(0, 512))
  const viewer = sidebar.matchViewer(path, head)
  if (viewer?.render !== undefined) {
    return <>{viewer.render({
      ...(snapshot.content !== null ? { content: snapshot.content } : {}),
      path,
      title: tab.title,
    })}</>
  }
  return (
    <div className="tockteam-file-preview min-h-0 flex-1 overflow-auto p-3 [&>div:first-child]:mb-2.5 [&>div:first-child]:flex [&>div:first-child]:items-center [&>div:first-child]:justify-between [&>div:first-child]:gap-2 [&_button]:h-[27px] [&_button]:min-w-[27px] [&_button]:cursor-pointer [&_button]:rounded-[7px] [&_button]:border-0 [&_button]:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_5%))] [&_button]:px-2 [&_button]:text-inherit [&_strong]:truncate [&_strong]:text-xs">
      <div>
        <strong>{tab.title}</strong>
        <Button unstyled type="button" onClick={() => { void onOpenPath(path) }}>
          {t('files.open')}
        </Button>
      </div>
      <div className="tockteam-side-muted p-[18px] text-[11px] text-[var(--dsw-alias-label-tertiary,#8c959f)]">
        {t('files.no-viewer', { size: formatSize(snapshot.size) })}
      </div>
    </div>
  )
}

function OrphanedTab({ title, t }: {
  t: Translate<WorkspaceMessage>
  title: string
}): JSX.Element {
  return (
    <div className="tockteam-side-empty p-[18px] text-[11px] text-[var(--dsw-alias-label-tertiary,#8c959f)]">
      <strong>{title}</strong>
      <p>{t('side.orphaned-tab')}</p>
    </div>
  )
}

function TabStrip({ sidebar, t }: {
  sidebar: DesktopSidebar
  t: Translate<WorkspaceMessage>
}): JSX.Element | null {
  const snapshot = useSyncExternalStore(sidebar.subscribe, sidebar.getSnapshot)
  if (snapshot.tabs.length < 2) return null
  return (
    <div className="tockteam-side-tabs flex min-h-[37px] flex-none gap-1 overflow-x-auto border-b border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_8%))] px-2 py-[5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>div]:flex [&>div]:flex-none [&>div]:items-center [&>div]:rounded-[7px] [&>div]:text-[var(--dsw-alias-label-secondary,#57606a)] [&>div[data-active='true']]:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] [&>div[data-active='true']]:text-[var(--dsw-alias-label-primary,#1f2328)] [&_button]:h-[27px] [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-[7px] [&_button]:text-[11px] [&_button]:text-inherit [&_button]:[font:11px_system-ui] [&>div>button:first-child]:max-w-[150px] [&>div>button:first-child]:truncate [&>div>button:last-child]:grid [&>div>button:last-child]:w-[23px] [&>div>button:last-child]:place-items-center [&>div>button:last-child]:p-0 [&>div>button:last-child]:opacity-55 [&>div>button:last-child_svg]:size-[13px]" role="tablist">
      {snapshot.tabs.map(tab => (
        <div key={tab.id} data-active={tab.id === snapshot.activeId || undefined}>
          <Button unstyled
            type="button"
            role="tab"
            aria-selected={tab.id === snapshot.activeId}
            title={tab.title}
            onClick={() => { sidebar.activateTab(tab.id) }}
          >{tab.title}</Button>
          <Button unstyled
            type="button"
            aria-label={t('side.close-named-tab', { title: tab.title })}
            onClick={() => { sidebar.closeTab(tab.id) }}
          ><X aria-hidden="true" /></Button>
        </div>
      ))}
    </div>
  )
}

export function SideToolsPanel(props: SideToolsPanelProps): JSX.Element {
  const snapshot = useSyncExternalStore(
    props.sidebar.subscribe,
    props.sidebar.getSnapshot,
  )
  const activeTab = snapshot.tabs.find(tab => tab.id === snapshot.activeId)
  const descriptor = activeTab === undefined
    ? undefined
    : props.sidebar.getTab(activeTab.type)
  const beginResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = props.width
    const move = (next: PointerEvent): void => {
      props.onResize(startWidth + startX - next.clientX)
    }
    const finish = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }
  const title = activeTab?.title ?? props.t('side.title')
  const renderProps: DesktopSidebarRenderProps | undefined = activeTab === undefined
    ? undefined
    : {
      active: props.open,
      close: () => { props.sidebar.closeTab(activeTab.id) },
      patch: patch => { props.sidebar.patchTab(activeTab.id, patch) },
      tab: activeTab,
    }
  const content: ReactNode = activeTab === undefined
    ? <SideMenu {...props} />
    : descriptor?.render === undefined || renderProps === undefined
      ? <OrphanedTab title={title} t={props.t} />
      : descriptor.render(renderProps)
  return (
    <aside
      className="tockteam-workspace-panel tockteam-side-panel absolute top-0 right-0 bottom-0 z-[9100] flex min-h-0 w-full box-border translate-x-[calc(100%+24px)] flex-col overflow-hidden border-y-0 border-r-0 border-l border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_9%))] bg-[var(--dsw-alias-bg-base,#fff)] text-[var(--dsw-alias-label-primary,#1f2328)] invisible opacity-0 shadow-none transition-[opacity,transform,visibility] [transition-duration:140ms,180ms,0s] [transition-timing-function:var(--ds-ease-in-out,ease),var(--ds-ease-in-out,ease),linear] [transition-delay:0s,0s,180ms] pointer-events-none [-webkit-app-region:no-drag] data-[open=true]:visible data-[open=true]:translate-x-0 data-[open=true]:opacity-100 data-[open=true]:[transition-delay:0s] data-[open=true]:pointer-events-auto motion-reduce:transition-none max-[900px]:fixed max-[900px]:top-[var(--tockteam-titlebar-height,40px)] max-[900px]:right-0 max-[900px]:bottom-0 max-[900px]:left-[var(--tockteam-rail-width)] max-[900px]:w-auto max-[900px]:shadow-[-20px_0_48px_rgb(0_0_0_/_14%)]"
      data-open={String(props.open)}
      data-maximized={String(props.maximized)}
      aria-hidden={!props.open}
      aria-label={title}
    >
      {!props.maximized && (
        <div
          className="tockteam-workspace-resize absolute top-0 bottom-0 left-[-4px] z-2 w-2 touch-none cursor-ew-resize"
          onPointerDown={beginResize}
          aria-hidden="true"
        />
      )}
      <TabStrip sidebar={props.sidebar} t={props.t} />
      {activeTab !== undefined && descriptor?.chrome !== 'custom' && (
        <header className="tockteam-workspace-header tockteam-side-header flex min-h-[58px] flex-none items-center justify-between border-b border-[var(--dsw-alias-border-l1,rgb(0_0_0_/_8%))] py-2.5 pr-3.5 pl-5 [&>div]:flex [&>div]:min-w-0 [&>div]:items-center [&>div]:gap-1 [&_button]:size-7 [&_button]:cursor-pointer [&_button]:rounded-[7px] [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0 [&_button]:text-[var(--dsw-alias-label-secondary,#57606a)] [&_button:hover]:bg-[var(--dsw-alias-interactive-bg-hover,rgb(0_0_0_/_6%))] [&_button:hover]:text-[var(--dsw-alias-label-primary,#1f2328)] [&_button_svg]:mx-auto [&_button_svg]:block [&_button_svg]:size-4 [&_strong]:truncate [&_strong]:text-[15px] [&_strong]:font-medium">
          <div>
            <Button unstyled
              type="button"
              aria-label={props.t('side.back')}
              onClick={() => { props.sidebar.activateTab(null) }}
            ><ChevronLeft aria-hidden="true" /></Button>
            <strong>{title}</strong>
          </div>
          <div>
            <Button unstyled
              type="button"
              aria-label={props.t('side.close-tab')}
              onClick={() => { props.sidebar.closeTab(activeTab.id) }}
            ><Minus aria-hidden="true" /></Button>
            <Button unstyled
              type="button"
              aria-label={props.t('side.close')}
              onClick={props.onClose}
            ><X aria-hidden="true" /></Button>
          </div>
        </header>
      )}
      {content}
    </aside>
  )
}
