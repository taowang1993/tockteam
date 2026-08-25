import { Alert, Button, Card, Input, NativeSelect, NativeSelectOption } from '@tockteam/ui'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import {
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

interface WebClipDesktopBridge {
  authorizeDocument(frameId: number, html: string): Promise<string>
}

interface WebClipWebview extends HTMLElement {
  getWebContentsId(): number
  loadURL(url: string): Promise<void>
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

interface ClientContext {
  effect(effect: () => (() => void) | void, label?: string): void
  get(name: string): unknown
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

function WebViewer(): ReactNode {
  const bridge = window.dshDesktop?.webClip
  const host = useRef<HTMLDivElement | null>(null)
  const webview = useRef<WebClipWebview | null>(null)
  const frameId = useRef<number | null>(null)
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
  const [clipDestination, setClipDestination] = useState('')
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

  const navigate = useCallback((raw: string, tabId = activeId.current): void => {
    if (clipApplyingRef.current) return
    if (!bridge) {
      setError('Web Viewer is available only in TockTeam Desktop.')
      return
    }
    let url: string
    try {
      url = viewerInputUrl(raw)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
      return
    }
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
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    void requestViewerPage(url, controller.signal).then(async page => {
      if (controller.signal.aborted) return
      const element = webview.current
      const id = frameId.current
      if (!element || id === null) throw new Error('The isolated page frame is not ready.')
      const documentUrl = await bridge.authorizeDocument(id, page.html)
      if (controller.signal.aborted) return
      await element.loadURL(documentUrl)
      if (controller.signal.aborted) return
      applyViewer(navigateViewerTab(viewerRef.current, tabId, page))
      if (activeId.current === tabId) setDraft(page.url)
    }).catch(nextError => {
      if (!controller.signal.aborted) {
        setError(nextError instanceof Error ? nextError.message : String(nextError))
      }
    }).finally(() => {
      if (request.current === controller) {
        request.current = null
        setLoading(false)
      }
    })
  }, [applyViewer, bridge, readerGuard])

  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

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
        const current = viewerRef.current
        const restored = current.tabs.find(tab => tab.id === current.activeId)
        if (restored?.url) navigateRef.current(restored.url, restored.id)
      } catch {
        setError('The isolated page frame failed to start.')
      }
    }
    element.addEventListener('dom-ready', ready, { once: true })
    container.append(element)
    webview.current = element
    return () => {
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
  }, [bridge, readerGuard])

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
    const next = selectViewerTab(viewer, tab.id)
    applyViewer(next)
    setDraft(tab.url ?? '')
    request.current?.abort()
    invalidateReader()
    if (tab.url) navigate(tab.url, tab.id)
  }
  const close = (id: string): void => {
    if (clipApplyingRef.current) return
    const next = closeViewerTab(viewer, id)
    applyViewer(next)
    const nextActive = next.tabs.find(tab => tab.id === next.activeId)
    setDraft(nextActive?.url ?? '')
    request.current?.abort()
    invalidateReader()
    if (nextActive?.url) navigate(nextActive.url, nextActive.id)
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
  const setReaderPreference = <K extends keyof ReaderPreferences>(key: K, value: ReaderPreferences[K]): void => {
    const current = viewerRef.current
    applyViewer({
      ...current,
      readerPreferences: { ...current.readerPreferences, [key]: value },
    })
  }

  return (
    <section aria-label="Web Viewer" className="flex min-h-0 flex-1 flex-col">
      <div aria-label="Viewer Tabs" className="flex gap-1 overflow-x-auto">
        {viewer.tabs.map((tab, index) => (
          <span className="inline-flex" key={tab.id}>
            <Button unstyled
              aria-pressed={tab.id === viewer.activeId}
              disabled={clipApplying}
              onClick={() => { activate(tab) }}
              type="button"
            >{tab.title}</Button>
            <Button unstyled
              aria-label={`Close ${tab.title}`}
              disabled={clipApplying}
              onClick={() => { close(tab.id) }}
              type="button"
            ><X aria-hidden="true" size={16} /></Button>
            <Button unstyled
              aria-label={`Move ${tab.title} Left`}
              disabled={index === 0}
              onClick={() => { applyViewer(moveViewerTab(viewerRef.current, tab.id, index - 1)) }}
              type="button"
            ><ArrowLeft aria-hidden="true" size={16} /></Button>
            <Button unstyled
              aria-label={`Move ${tab.title} Right`}
              disabled={index === viewer.tabs.length - 1}
              onClick={() => { applyViewer(moveViewerTab(viewerRef.current, tab.id, index + 1)) }}
              type="button"
            ><ArrowRight aria-hidden="true" size={16} /></Button>
          </span>
        ))}
        <Button unstyled
          disabled={clipApplying}
          onClick={() => {
            if (clipApplyingRef.current) return
            request.current?.abort()
            invalidateReader()
            applyViewer(addViewerTab(viewerRef.current))
            setDraft('')
          }}
          type="button"
        >New Tab</Button>
      </div>
      <form
        aria-label="Web Viewer Address"
        onSubmit={event => { event.preventDefault(); navigate(draft) }}
        className="flex gap-1"
      >
        <Input unstyled
          aria-label="URL"
          disabled={clipApplying}
          onChange={event => { setDraft(event.currentTarget.value) }}
          placeholder="https://example.com"
          value={draft}
        />
        <Button unstyled disabled={loading || clipApplying} type="submit">{loading ? 'Loading…' : 'Go'}</Button>
        <Button unstyled
          disabled={!active?.url}
          onClick={() => { applyViewer(addViewerBookmark(viewerRef.current)) }}
          type="button"
        >Bookmark</Button>
        <Button unstyled
          disabled={!active?.url || readerLoading || clipApplying}
          onClick={() => { reader ? invalidateReader() : loadReader() }}
          type="button"
        >{reader ? 'Page View' : readerLoading ? 'Loading Reader…' : 'Reader View'}</Button>
      </form>
      {viewer.bookmarks.length > 0 && (
        <details>
          <summary>Bookmarks</summary>
          {viewer.bookmarks.map(bookmark => (
            <span key={bookmark.id}>
              <Button unstyled disabled={clipApplying} onClick={() => { navigate(bookmark.url) }} type="button">{bookmark.title}</Button>
              <Button unstyled
                aria-label={`Remove ${bookmark.title}`}
                onClick={() => { applyViewer(removeViewerBookmark(viewerRef.current, bookmark.id)) }}
                type="button"
              ><X aria-hidden="true" size={16} /></Button>
            </span>
          ))}
        </details>
      )}
      {error && <Alert unstyled>{error}</Alert>}
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
          <div aria-label="Reader Settings">
            <label>Text Size <NativeSelect unstyled
              onChange={event => { setReaderPreference('textSize', event.currentTarget.value as ReaderPreferences['textSize']) }}
              value={viewer.readerPreferences.textSize}
            ><NativeSelectOption value="sm">Small</NativeSelectOption><NativeSelectOption value="md">Medium</NativeSelectOption><NativeSelectOption value="lg">Large</NativeSelectOption></NativeSelect></label>
            <label>Line Width <NativeSelect unstyled
              onChange={event => { setReaderPreference('width', event.currentTarget.value as ReaderPreferences['width']) }}
              value={viewer.readerPreferences.width}
            ><NativeSelectOption value="narrow">Narrow</NativeSelectOption><NativeSelectOption value="md">Medium</NativeSelectOption><NativeSelectOption value="wide">Wide</NativeSelectOption></NativeSelect></label>
            <label>Line Spacing <NativeSelect unstyled
              onChange={event => { setReaderPreference('spacing', event.currentTarget.value as ReaderPreferences['spacing']) }}
              value={viewer.readerPreferences.spacing}
            ><NativeSelectOption value="compact">Compact</NativeSelectOption><NativeSelectOption value="md">Default</NativeSelectOption><NativeSelectOption value="relaxed">Relaxed</NativeSelectOption></NativeSelect></label>
            <label>Appearance <NativeSelect unstyled
              onChange={event => { setReaderPreference('appearance', event.currentTarget.value as ReaderPreferences['appearance']) }}
              value={viewer.readerPreferences.appearance}
            ><NativeSelectOption value="system">System</NativeSelectOption><NativeSelectOption value="light">Light</NativeSelectOption><NativeSelectOption value="dark">Dark</NativeSelectOption></NativeSelect></label>
          </div>
          <h2>{reader.title}</h2>
          <section aria-label="Clip Web Page">
            <label>
              Clip Destination
              <Input unstyled
                disabled={clipLoading || clipPreview !== null}
                onChange={event => { setClipDestination(event.currentTarget.value) }}
                placeholder="example.md"
                value={clipDestination}
              />
            </label>
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
            {clipSavedPath && <p role="status">Saved clip to {clipSavedPath}.</p>}
          </section>
          {reader.warnings.map(warning => <p key={warning} role="status">{warning}</p>)}
          <pre className="whitespace-pre-wrap font-[inherit]">{reader.content}</pre>
        </article>
      )}
      <div className={reader ? 'hidden' : 'flex min-h-0 flex-1'} ref={host} />
    </section>
  )
}

export const inject = ['desktopSidebar', 'tockTeamSurface']

export function apply(ctx: ClientContext): void {
  const surface = ctx.get('tockTeamSurface') as { kind?: unknown } | undefined
  const sidebar = ctx.get('desktopSidebar') as DesktopSidebar | undefined
  const desktop = window.dshDesktop
  if (surface?.kind !== 'desktop' || !sidebar || !desktop?.webClip) return
  let disposed = false
  let remove: (() => void) | undefined
  ctx.effect(() => () => {
    disposed = true
    remove?.()
  }, 'tockbot-web-clip: Web Viewer')
  void desktop.getInfo().then(info => {
    if (disposed || info.version !== SUPPORTED_TOCKTEAM_DESKTOP_VERSION) return
    remove = sidebar.registerTab({
      id: 'web-clip',
      order: 31,
      render: () => <WebViewer />,
      single: true,
      title: 'Web Viewer',
    })
  }).catch(() => undefined)
}
