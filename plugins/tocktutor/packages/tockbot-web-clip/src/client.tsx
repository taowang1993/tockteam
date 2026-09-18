import type { Context as CordisContext } from '@deepseek-ai/cordis'
import { Alert } from '@tockteam/ui/alert'
import { Button } from '@tockteam/ui/button'
import { Card } from '@tockteam/ui/card'
import { Input } from '@tockteam/ui/input'
import { Label } from '@tockteam/ui/label'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'
import {
  defaultClipDestination,
  requestClipApply,
  requestClipCancel,
  requestClipPreview,
  requestReaderView,
  requestViewerPage,
  viewerInputUrl,
} from './client-api.ts'
import {
  addViewerBookmark,
  addViewerTab,
  closeViewerTab,
  moveViewerTab,
  navigateViewerTab,
  removeViewerBookmark,
  restoreViewerState,
  selectViewerTab,
  serializeViewerState,
  SUPPORTED_TOCKTEAM_DESKTOP_VERSION,
  ViewerResultGuard,
  type ReaderPreferences,
  type ViewerState,
  type ViewerTab,
} from './viewer.ts'
import type { ReaderViewResult } from './reader.ts'
import type { ClipPreview } from './review.ts'
import type {
  TockTutorSlots,
  TockTutorWebViewerOwnerProps,
} from '@tockteam/tocktutor-workbench/client'

const TOCKTUTOR_WEB_VIEWER_PANEL_SLOT = 'tockteam.tocktutor.workbench.web-viewer'

interface WebClipDesktopBridge {
  authorizeDocument(frameId: number, html: string): Promise<string>
}

interface WebClipWebview extends HTMLElement {
  getWebContentsId(): number
  loadURL(url: string): Promise<void>
}

interface PendingFrameNavigation {
  intent: number
  tabId: string | null
  url: string | null
}

interface DesktopSidebar {
  registerTab(descriptor: {
    id: string
    order?: number
    render(props: unknown): ReactNode
    single: boolean
    title: string
  }): () => void
}

declare global {
  interface Window {
    dshDesktop?: {
      getInfo(): Promise<{ version: string }>
      webClip?: WebClipDesktopBridge
    }
  }
}

const VIEWER_STORAGE_KEY = 'tocktutor.webViewer.v1'

function storedViewerState(): ViewerState {
  try {
    return restoreViewerState(window.localStorage.getItem(VIEWER_STORAGE_KEY))
  } catch {
    return restoreViewerState(null)
  }
}

function cancelClipPreview(preview: ClipPreview | null): void {
  if (preview) void requestClipCancel(preview.reviewId, AbortSignal.timeout(5_000)).catch(() => undefined)
}

function WebViewer(props: Partial<Pick<TockTutorWebViewerOwnerProps, 'addLinkBookmark' | 'externalUrl' | 'webClipFolder'>> = {}): ReactNode {
  const bridge = window.dshDesktop?.webClip
  const host = useRef<HTMLDivElement | null>(null)
  const webview = useRef<WebClipWebview | null>(null)
  const frameId = useRef<number | null>(null)
  const navigationIntent = useRef(0)
  const pendingNavigation = useRef<PendingFrameNavigation | null>(null)
  const request = useRef<AbortController | null>(null)
  const readerRequest = useRef<AbortController | null>(null)
  const clipRequest = useRef<AbortController | null>(null)
  const clipPreviewRef = useRef<ClipPreview | null>(null)
  const clipApplyingRef = useRef(false)
  const navigateRef = useRef<(url: string, tabId?: string) => void>(() => {})
  const [viewer, setViewer] = useState(storedViewerState)
  const viewerRef = useRef(viewer)
  const activeId = useRef(viewer.activeId)
  const [readerGuard] = useState(() => new ViewerResultGuard(crypto.randomUUID()))
  const [draft, setDraft] = useState(() => viewer.tabs.find(tab => tab.id === viewer.activeId)?.url ?? '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [reader, setReader] = useState<ReaderViewResult | null>(null)
  const [readerLoading, setReaderLoading] = useState(false)
  const [clipDestination, setClipDestination] = useState(() => defaultClipDestination(props.webClipFolder))
  const [clipPreview, setClipPreview] = useState<ClipPreview | null>(null)
  const [clipLoading, setClipLoading] = useState(false)
  const [clipApplying, setClipApplying] = useState(false)
  const [clipSavedPath, setClipSavedPath] = useState('')
  const active = viewer.tabs.find(tab => tab.id === viewer.activeId)
  const applyViewer = useCallback((next: ViewerState): void => {
    viewerRef.current = next
    activeId.current = next.activeId
    setViewer(next)
  }, [])

  const loadBlankFrame = useCallback((intent: number): void => {
    const element = webview.current
    if (!element || frameId.current === null) return
    void element.loadURL('about:blank').catch(nextError => {
      if (intent !== navigationIntent.current || webview.current !== element) return
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    })
  }, [])

  const startNavigation = useCallback((url: string, tabId: string, intent: number): void => {
    if (!bridge) return
    const element = webview.current
    const id = frameId.current
    if (!element || id === null) {
      pendingNavigation.current = { intent, tabId, url }
      return
    }
    pendingNavigation.current = null
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    void requestViewerPage(url, controller.signal).then(async page => {
      if (controller.signal.aborted || intent !== navigationIntent.current) return
      const currentElement = webview.current
      const currentFrameId = frameId.current
      if (!currentElement || currentFrameId === null) return
      const documentUrl = await bridge.authorizeDocument(currentFrameId, page.html)
      if (controller.signal.aborted || intent !== navigationIntent.current) return
      await currentElement.loadURL(documentUrl)
      if (controller.signal.aborted || intent !== navigationIntent.current) return
      applyViewer(navigateViewerTab(viewerRef.current, tabId, page))
      if (activeId.current === tabId) setDraft(page.url)
    }).catch(nextError => {
      if (!controller.signal.aborted && intent === navigationIntent.current) {
        setError(nextError instanceof Error ? nextError.message : String(nextError))
      }
    }).finally(() => {
      if (request.current === controller) {
        request.current = null
        setLoading(false)
      }
    })
  }, [applyViewer, bridge])

  const navigate = useCallback((raw: string, tabId = activeId.current): void => {
    if (clipApplyingRef.current) return
    if (!bridge) {
      setError('Web Viewer is available only in the TockTeam desktop app.')
      return
    }
    let url: string
    try {
      url = viewerInputUrl(raw)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
      return
    }
    const intent = ++navigationIntent.current
    pendingNavigation.current = { intent, tabId, url }
    request.current?.abort()
    readerRequest.current?.abort()
    clipRequest.current?.abort()
    const previousPreview = clipPreviewRef.current
    clipPreviewRef.current = null
    cancelClipPreview(previousPreview)
    readerGuard.invalidate()
    setReader(null)
    setClipPreview(null)
    setClipLoading(false)
    setClipSavedPath('')
    if (webview.current && frameId.current !== null) {
      startNavigation(url, tabId, intent)
    } else {
      setLoading(true)
      setError('')
    }
  }, [bridge, readerGuard, startNavigation])

  const clearFrame = useCallback((): void => {
    const intent = ++navigationIntent.current
    pendingNavigation.current = { intent, tabId: null, url: null }
    request.current?.abort()
    request.current = null
    setLoading(false)
    setError('')
    if (webview.current && frameId.current !== null) {
      pendingNavigation.current = null
      loadBlankFrame(intent)
    }
  }, [loadBlankFrame])

  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  useEffect(() => {
    if (props.externalUrl) navigate(props.externalUrl)
  }, [navigate, props.externalUrl])

  useEffect(() => {
    const container = host.current
    if (!container || !bridge) return
    const element = document.createElement('webview') as unknown as WebClipWebview
    element.setAttribute('partition', `tockteam-web-clip-${crypto.randomUUID()}`)
    element.setAttribute('src', 'about:blank')
    element.className = 'flex min-h-0 w-full flex-1 border-0'
    const ready = () => {
      try {
        frameId.current = element.getWebContentsId()
        const pending = pendingNavigation.current
        if (pending) {
          if (pending.intent !== navigationIntent.current) {
            pendingNavigation.current = null
            return
          }
          pendingNavigation.current = null
          if (pending.url && pending.tabId !== null) startNavigation(pending.url, pending.tabId, pending.intent)
          else loadBlankFrame(pending.intent)
          return
        }
        const current = viewerRef.current
        const restored = current.tabs.find(tab => tab.id === current.activeId)
        if (restored?.url) navigateRef.current(restored.url, restored.id)
      } catch {
        setError('The isolated page frame failed to start.')
      }
    }
    element.addEventListener('dom-ready', ready, { once: true })
    webview.current = element
    container.append(element)
    return () => {
      navigationIntent.current += 1
      pendingNavigation.current = null
      request.current?.abort()
      readerRequest.current?.abort()
      clipRequest.current?.abort()
      const previousPreview = clipPreviewRef.current
      cancelClipPreview(previousPreview)
      readerGuard.invalidate()
      request.current = null
      readerRequest.current = null
      clipRequest.current = null
      element.removeEventListener('dom-ready', ready)
      frameId.current = null
      webview.current = null
      element.remove()
    }
  }, [bridge, loadBlankFrame, readerGuard, startNavigation])

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEWER_STORAGE_KEY, serializeViewerState(viewer))
    } catch {
      // Viewer persistence is best-effort; the live bounded session remains usable.
    }
  }, [viewer])

  const invalidateClip = (): void => {
    if (clipApplyingRef.current) return
    clipRequest.current?.abort()
    clipRequest.current = null
    const previousPreview = clipPreviewRef.current
    clipPreviewRef.current = null
    cancelClipPreview(previousPreview)
    setClipPreview(null)
    setClipLoading(false)
    setClipSavedPath('')
  }
  const invalidateReader = (): void => {
    readerRequest.current?.abort()
    readerRequest.current = null
    readerGuard.invalidate()
    invalidateClip()
    setReader(null)
    setReaderLoading(false)
  }
  const activate = (tab: ViewerTab): void => {
    if (clipApplyingRef.current) return
    const next = selectViewerTab(viewerRef.current, tab.id)
    applyViewer(next)
    setDraft(tab.url ?? '')
    invalidateReader()
    if (tab.url) navigate(tab.url, tab.id)
    else clearFrame()
  }
  const close = (id: string): void => {
    if (clipApplyingRef.current) return
    const next = closeViewerTab(viewerRef.current, id)
    applyViewer(next)
    const nextActive = next.tabs.find(tab => tab.id === next.activeId)
    setDraft(nextActive?.url ?? '')
    invalidateReader()
    if (nextActive?.url) navigate(nextActive.url, nextActive.id)
    else clearFrame()
  }
  const loadReader = (): void => {
    if (clipApplyingRef.current) return
    const current = viewerRef.current
    const tab = current.tabs.find(item => item.id === current.activeId)
    if (!tab?.url) return
    readerRequest.current?.abort()
    const controller = new AbortController()
    readerRequest.current = controller
    const token = readerGuard.start(tab.id, tab.url)
    setReaderLoading(true)
    setError('')
    void requestReaderView(tab.url, controller.signal).then(result => {
      if (readerGuard.accepts(token, viewerRef.current)) setReader(result)
    }).catch(nextError => {
      if (readerGuard.accepts(token, viewerRef.current)) {
        setError(nextError instanceof Error ? nextError.message : String(nextError))
      }
    }).finally(() => {
      if (readerRequest.current === controller) {
        readerRequest.current = null
        setReaderLoading(false)
      }
    })
  }
  const createClipPreview = (): void => {
    const current = viewerRef.current
    const tab = current.tabs.find(item => item.id === current.activeId)
    if (!tab?.url) return
    invalidateClip()
    const controller = new AbortController()
    clipRequest.current = controller
    setClipLoading(true)
    setError('')
    void requestClipPreview(tab.url, clipDestination, controller.signal).then(result => {
      if (controller.signal.aborted || activeId.current !== tab.id) return
      clipPreviewRef.current = result
      setClipPreview(result)
      setClipDestination(result.destination)
    }).catch(nextError => {
      if (!controller.signal.aborted) setError(nextError instanceof Error ? nextError.message : String(nextError))
    }).finally(() => {
      if (clipRequest.current === controller) {
        clipRequest.current = null
        setClipLoading(false)
      }
    })
  }
  const applyClip = (): void => {
    const value = clipPreviewRef.current
    if (!value) return
    clipRequest.current?.abort()
    const controller = new AbortController()
    clipRequest.current = controller
    clipApplyingRef.current = true
    setClipApplying(true)
    setClipLoading(true)
    setError('')
    void requestClipApply({
      contentDigest: value.contentDigest,
      destination: value.destination,
      expiresAt: value.expiresAt,
      permission: 'user-approved',
      reviewId: value.reviewId,
      sourceUrl: value.sourceUrl,
      target: value.target,
      vault: value.vault,
    }, controller.signal).then(result => {
      if (controller.signal.aborted) return
      clipApplyingRef.current = false
      setClipApplying(false)
      clipPreviewRef.current = null
      setClipPreview(null)
      setClipSavedPath(result.path)
    }).catch(nextError => {
      if (!controller.signal.aborted) {
        clipApplyingRef.current = false
        setClipApplying(false)
        cancelClipPreview(value)
        clipPreviewRef.current = null
        setClipPreview(null)
        setError(nextError instanceof Error ? nextError.message : String(nextError))
      }
    }).finally(() => {
      if (clipRequest.current === controller) {
        clipRequest.current = null
        clipApplyingRef.current = false
        setClipApplying(false)
        setClipLoading(false)
      }
    })
  }
  useEffect(() => {
    if (clipPreviewRef.current === null) setClipDestination(defaultClipDestination(props.webClipFolder))
  }, [props.webClipFolder])

  const setReaderPreference = <K extends keyof ReaderPreferences>(key: K, value: ReaderPreferences[K]): void => {
    const current = viewerRef.current
    applyViewer({
      ...current,
      readerPreferences: { ...current.readerPreferences, [key]: value },
    })
  }

  return (
    <section aria-label="Web Viewer" className="flex min-h-0 flex-1 flex-col gap-2 text-xs">
      <div aria-label="Viewer Tabs" className="flex min-h-8 items-end gap-0.5 overflow-x-auto border-b border-[var(--tt-border)]">
        {viewer.tabs.map((tab, index) => (
          <span
            className="group inline-flex min-w-0 items-center rounded-t-md border border-b-0 border-transparent has-[button[aria-pressed=true]]:border-[var(--tt-border)] has-[button[aria-pressed=true]]:bg-[var(--tt-bg)]"
            draggable={!clipApplying}
            key={tab.id}
            onDragOver={event => { if (!clipApplying) event.preventDefault() }}
            onDragStart={event => { event.dataTransfer.setData('application/x-tocktutor-web-viewer-tab', tab.id); event.dataTransfer.effectAllowed = 'move' }}
            onDrop={event => {
              event.preventDefault()
              const movedId = event.dataTransfer.getData('application/x-tocktutor-web-viewer-tab')
              if (movedId !== '') applyViewer(moveViewerTab(viewerRef.current, movedId, index))
            }}
          >
            <Button unstyled
              aria-pressed={tab.id === viewer.activeId}
              disabled={clipApplying}
              onClick={() => { activate(tab) }}
              className="min-w-0 max-w-28 truncate border-0 bg-transparent px-2 py-1.5 text-left"
              onKeyDown={event => {
                if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
                event.preventDefault()
                const next = index + (event.key === 'ArrowLeft' ? -1 : 1)
                if (next >= 0 && next < viewerRef.current.tabs.length) applyViewer(moveViewerTab(viewerRef.current, tab.id, next))
              }}
              type="button"
            >{tab.title}</Button>
            <Button unstyled
              aria-label={`Close ${tab.title}`}
              className="grid size-6 shrink-0 place-items-center rounded border-0 bg-transparent text-[var(--tt-muted)] hover:bg-[var(--tt-selected)]"
              disabled={clipApplying}
              onClick={() => { close(tab.id) }}
              type="button"
            ><X aria-hidden="true" size={16} /></Button>
          </span>
        ))}
        <Button unstyled
          className="shrink-0 rounded px-2 py-1.5 text-[var(--tt-muted)] hover:bg-[var(--tt-selected)]"
          disabled={clipApplying}
          onClick={() => {
            if (clipApplyingRef.current) return
            const next = addViewerTab(viewerRef.current)
            if (next === viewerRef.current) return
            invalidateReader()
            applyViewer(next)
            setDraft('')
            clearFrame()
          }}
          type="button"
        >New Tab</Button>
      </div>
      <form
        aria-label="Web Viewer Address"
        onSubmit={event => { event.preventDefault(); navigate(draft) }}
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-1"
      >
        <Input unstyled
          aria-label="URL"
          className="min-w-0 rounded-md border border-[var(--tt-border)] bg-transparent px-2 py-1.5 outline-none focus-visible:border-[var(--tt-accent)]"
          disabled={clipApplying}
          onChange={event => { setDraft(event.currentTarget.value) }}
          placeholder="https://example.com"
          value={draft}
        />
        <Button unstyled className="rounded-md border border-[var(--tt-border)] bg-transparent px-2 py-1.5 hover:bg-[var(--tt-selected)]" disabled={loading || clipApplying} type="submit">{loading ? 'Loading…' : 'Go'}</Button>
        <Button unstyled
          className="rounded-md border border-[var(--tt-border)] bg-transparent px-2 py-1.5 hover:bg-[var(--tt-selected)]"
          disabled={!active?.url}
          onClick={() => {
            applyViewer(addViewerBookmark(viewerRef.current))
            if (active?.url != null) props.addLinkBookmark?.(active.title ?? active.url, active.url)
          }}
          type="button"
        >Bookmark</Button>
        <Button unstyled
          className="rounded-md border border-[var(--tt-border)] bg-transparent px-2 py-1.5 hover:bg-[var(--tt-selected)]"
          disabled={!active?.url || readerLoading || clipApplying}
          onClick={() => { reader ? invalidateReader() : loadReader() }}
          type="button"
        >{reader ? 'Page View' : readerLoading ? 'Loading Reader…' : 'Reader View'}</Button>
      </form>
      {viewer.bookmarks.length > 0 && (
        <details className="rounded-md border border-[var(--tt-border)] p-2">
          <summary className="cursor-pointer font-medium">Bookmarks</summary>
          {viewer.bookmarks.map(bookmark => (
            <span className="mt-1 flex items-center" key={bookmark.id}>
              <Button unstyled className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left hover:bg-[var(--tt-selected)]" disabled={clipApplying} onClick={() => { navigate(bookmark.url) }} type="button">{bookmark.title}</Button>
              <Button unstyled
                aria-label={`Remove ${bookmark.title}`}
                className="grid size-6 place-items-center rounded border-0 bg-transparent text-[var(--tt-muted)] hover:bg-[var(--tt-selected)]"
                onClick={() => { applyViewer(removeViewerBookmark(viewerRef.current, bookmark.id)) }}
                type="button"
              ><X aria-hidden="true" size={16} /></Button>
            </span>
          ))}
        </details>
      )}
      {error && <Alert unstyled className="rounded-md bg-[color-mix(in_srgb,var(--dsw-alias-state-error-primary)_10%,transparent)] p-2 text-[var(--dsw-alias-state-error-primary)]" role="alert">{error}</Alert>}
      {reader && (
        <article
          aria-label="Reader View"
          className="w-full self-center overflow-auto p-6"
          style={{
            background: viewer.readerPreferences.appearance === 'dark' ? '#171717' : viewer.readerPreferences.appearance === 'light' ? '#fff' : undefined,
            color: viewer.readerPreferences.appearance === 'dark' ? '#f5f5f5' : viewer.readerPreferences.appearance === 'light' ? '#171717' : undefined,
            fontSize: viewer.readerPreferences.textSize === 'sm' ? 14 : viewer.readerPreferences.textSize === 'lg' ? 18 : 16,
            lineHeight: viewer.readerPreferences.spacing === 'compact' ? 1.4 : viewer.readerPreferences.spacing === 'relaxed' ? 1.9 : 1.65,
            maxWidth: viewer.readerPreferences.width === 'narrow' ? 640 : viewer.readerPreferences.width === 'wide' ? 1000 : 800,
          }}
        >
          <div aria-label="Reader Settings" className="grid grid-cols-2 gap-2 border-b border-[var(--tt-border)] pb-3 [&_label]:grid [&_label]:gap-1 [&_select]:rounded-md [&_select]:border [&_select]:border-[var(--tt-border)] [&_select]:bg-transparent [&_select]:p-1.5">
            <Label unstyled>Text Size <NativeSelect unstyled
              onChange={event => { setReaderPreference('textSize', event.currentTarget.value as ReaderPreferences['textSize']) }}
              value={viewer.readerPreferences.textSize}
            ><NativeSelectOption value="sm">Small</NativeSelectOption><NativeSelectOption value="md">Medium</NativeSelectOption><NativeSelectOption value="lg">Large</NativeSelectOption></NativeSelect></Label>
            <Label unstyled>Line Width <NativeSelect unstyled
              onChange={event => { setReaderPreference('width', event.currentTarget.value as ReaderPreferences['width']) }}
              value={viewer.readerPreferences.width}
            ><NativeSelectOption value="narrow">Narrow</NativeSelectOption><NativeSelectOption value="md">Medium</NativeSelectOption><NativeSelectOption value="wide">Wide</NativeSelectOption></NativeSelect></Label>
            <Label unstyled>Line Spacing <NativeSelect unstyled
              onChange={event => { setReaderPreference('spacing', event.currentTarget.value as ReaderPreferences['spacing']) }}
              value={viewer.readerPreferences.spacing}
            ><NativeSelectOption value="compact">Compact</NativeSelectOption><NativeSelectOption value="md">Default</NativeSelectOption><NativeSelectOption value="relaxed">Relaxed</NativeSelectOption></NativeSelect></Label>
            <Label unstyled>Appearance <NativeSelect unstyled
              onChange={event => { setReaderPreference('appearance', event.currentTarget.value as ReaderPreferences['appearance']) }}
              value={viewer.readerPreferences.appearance}
            ><NativeSelectOption value="system">System</NativeSelectOption><NativeSelectOption value="light">Light</NativeSelectOption><NativeSelectOption value="dark">Dark</NativeSelectOption></NativeSelect></Label>
          </div>
          <h2>{reader.title}</h2>
          <section aria-label="Clip Web Page">
            <Label unstyled>
              Clip Destination
              <Input unstyled
                disabled={clipLoading || clipPreview !== null}
                onChange={event => { setClipDestination(event.currentTarget.value) }}
                placeholder="example.md"
                value={clipDestination}
              />
            </Label>
            <Button unstyled
              disabled={clipLoading || clipPreview !== null}
              onClick={createClipPreview}
              type="button"
            >{clipLoading && !clipPreview ? 'Generating Preview…' : 'Generate Clip Preview'}</Button>
            {clipPreview && (
              <Card unstyled>
                <p>Review the exact Markdown and destination before saving.</p>
                <p><strong>Destination:</strong> {clipPreview.destination}</p>
                <pre aria-label="Clip Markdown Preview" className="max-h-80 overflow-auto whitespace-pre-wrap">{clipPreview.markdown}</pre>
                <Button unstyled disabled={clipLoading} onClick={applyClip} type="button">{clipLoading ? 'Saving…' : 'Save Clip'}</Button>
                <Button unstyled disabled={clipLoading} onClick={invalidateClip} type="button">Cancel</Button>
              </Card>
            )}
            {clipSavedPath && <Alert unstyled role="status">Saved clip to {clipSavedPath}.</Alert>}
          </section>
          {reader.warnings.map(warning => <Alert unstyled key={warning} role="status">{warning}</Alert>)}
          <pre className="whitespace-pre-wrap font-[inherit]">{reader.content}</pre>
        </article>
      )}
      <div className={reader ? 'hidden' : 'flex min-h-0 flex-1'} ref={host} />
    </section>
  )
}

export const name = 'tockbot-web-clip'
type Context = CordisContext & { slots: TockTutorSlots }

export const inject = ['desktopSidebar', 'tockTeamSurface', 'slots']

export function apply(ctx: Context): void {
  const surface = ctx.get('tockTeamSurface') as { kind?: unknown } | undefined
  const sidebar = ctx.get('desktopSidebar') as DesktopSidebar | undefined
  const desktop = window.dshDesktop
  if (surface?.kind !== 'desktop' || !sidebar || !desktop?.webClip) return
  let disposed = false
  let removeSidebar: (() => void) | undefined
  let removePanel: (() => void) | undefined
  ctx.effect(() => () => {
    disposed = true
    removePanel?.()
    removeSidebar?.()
  }, 'tockbot-web-clip: Web Viewer')
  removePanel = ctx.slots.inject(
    TOCKTUTOR_WEB_VIEWER_PANEL_SLOT,
    () => ctx.slots.register({
      name: TOCKTUTOR_WEB_VIEWER_PANEL_SLOT,
      registrant: name,
    }, (owner: TockTutorWebViewerOwnerProps) => <WebViewer
      addLinkBookmark={owner.addLinkBookmark}
      externalUrl={owner.externalUrl}
      webClipFolder={owner.webClipFolder}
    />),
  )
  void desktop.getInfo().then(info => {
    if (disposed || info.version !== SUPPORTED_TOCKTEAM_DESKTOP_VERSION) return
    removeSidebar = sidebar.registerTab({
      id: 'web-clip',
      order: 31,
      render: () => <WebViewer />,
      single: true,
      title: 'Web Viewer',
    })
  }).catch(() => undefined)
}
