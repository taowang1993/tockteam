import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
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

const frameStyle = {
  border: 0,
  display: 'flex',
  flex: 1,
  minHeight: 0,
  width: '100%',
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
  const activeId = useRef('tab-1')
  const navigateRef = useRef<(url: string, tabId?: string) => void>(() => {})
  const [viewer, setViewer] = useState(storedViewerState)
  const viewerRef = useRef(viewer)
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
  clipPreviewRef.current = clipPreview
  activeId.current = viewer.activeId
  viewerRef.current = viewer
  const active = viewer.tabs.find(tab => tab.id === viewer.activeId)

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
      setViewer(current => {
        const next = navigateViewerTab(current, tabId, page)
        viewerRef.current = next
        return next
      })
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
  }, [bridge, readerGuard])
  navigateRef.current = navigate

  useEffect(() => {
    const container = host.current
    if (!container || !bridge) return
    const element = document.createElement('webview') as unknown as WebClipWebview
    element.setAttribute('partition', `tockteam-web-clip-${crypto.randomUUID()}`)
    element.setAttribute('src', 'about:blank')
    Object.assign(element.style, frameStyle)
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
    element.addEventListener('dom-ready', ready)
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
    viewerRef.current = next
    setViewer(next)
    setDraft(tab.url ?? '')
    request.current?.abort()
    invalidateReader()
    if (tab.url) navigate(tab.url, tab.id)
  }
  const close = (id: string): void => {
    if (clipApplyingRef.current) return
    const next = closeViewerTab(viewer, id)
    viewerRef.current = next
    setViewer(next)
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
    setViewer(current => {
      const next = {
        ...current,
        readerPreferences: { ...current.readerPreferences, [key]: value },
      }
      viewerRef.current = next
      return next
    })
  }

  return (
    <section aria-label="Web Viewer" style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
      <div aria-label="Viewer Tabs" style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
        {viewer.tabs.map((tab, index) => (
          <span key={tab.id} style={{ display: 'inline-flex' }}>
            <button
              aria-pressed={tab.id === viewer.activeId}
              disabled={clipApplying}
              onClick={() => { activate(tab) }}
              type="button"
            >{tab.title}</button>
            <button
              aria-label={`Close ${tab.title}`}
              disabled={clipApplying}
              onClick={() => { close(tab.id) }}
              type="button"
            >×</button>
            <button
              aria-label={`Move ${tab.title} Left`}
              disabled={index === 0}
              onClick={() => { setViewer(current => moveViewerTab(current, tab.id, index - 1)) }}
              type="button"
            >←</button>
            <button
              aria-label={`Move ${tab.title} Right`}
              disabled={index === viewer.tabs.length - 1}
              onClick={() => { setViewer(current => moveViewerTab(current, tab.id, index + 1)) }}
              type="button"
            >→</button>
          </span>
        ))}
        <button
          disabled={clipApplying}
          onClick={() => {
            if (clipApplyingRef.current) return
            request.current?.abort()
            invalidateReader()
            setViewer(current => {
              const next = addViewerTab(current)
              viewerRef.current = next
              return next
            })
            setDraft('')
          }}
          type="button"
        >New Tab</button>
      </div>
      <form
        aria-label="Web Viewer Address"
        onSubmit={event => { event.preventDefault(); navigate(draft) }}
        style={{ display: 'flex', gap: 4 }}
      >
        <input
          aria-label="URL"
          disabled={clipApplying}
          onChange={event => { setDraft(event.currentTarget.value) }}
          placeholder="https://example.com"
          value={draft}
        />
        <button disabled={loading || clipApplying} type="submit">{loading ? 'Loading…' : 'Go'}</button>
        <button
          disabled={!active?.url}
          onClick={() => { setViewer(current => addViewerBookmark(current)) }}
          type="button"
        >Bookmark</button>
        <button
          disabled={!active?.url || readerLoading || clipApplying}
          onClick={() => { reader ? invalidateReader() : loadReader() }}
          type="button"
        >{reader ? 'Page View' : readerLoading ? 'Loading Reader…' : 'Reader View'}</button>
      </form>
      {viewer.bookmarks.length > 0 && (
        <details>
          <summary>Bookmarks</summary>
          {viewer.bookmarks.map(bookmark => (
            <span key={bookmark.id}>
              <button disabled={clipApplying} onClick={() => { navigate(bookmark.url) }} type="button">{bookmark.title}</button>
              <button
                aria-label={`Remove ${bookmark.title}`}
                onClick={() => { setViewer(current => removeViewerBookmark(current, bookmark.id)) }}
                type="button"
              >×</button>
            </span>
          ))}
        </details>
      )}
      {error && <div role="alert">{error}</div>}
      {reader && (
        <article
          aria-label="Reader View"
          style={{
            alignSelf: 'center',
            background: viewer.readerPreferences.appearance === 'dark' ? '#171717' : viewer.readerPreferences.appearance === 'light' ? '#fff' : undefined,
            color: viewer.readerPreferences.appearance === 'dark' ? '#f5f5f5' : viewer.readerPreferences.appearance === 'light' ? '#171717' : undefined,
            fontSize: viewer.readerPreferences.textSize === 'sm' ? 14 : viewer.readerPreferences.textSize === 'lg' ? 18 : 16,
            lineHeight: viewer.readerPreferences.spacing === 'compact' ? 1.4 : viewer.readerPreferences.spacing === 'relaxed' ? 1.9 : 1.65,
            maxWidth: viewer.readerPreferences.width === 'narrow' ? 640 : viewer.readerPreferences.width === 'wide' ? 1000 : 800,
            overflow: 'auto',
            padding: 24,
            width: '100%',
          }}
        >
          <div aria-label="Reader Settings">
            <label>Text Size <select
              onChange={event => { setReaderPreference('textSize', event.currentTarget.value as ReaderPreferences['textSize']) }}
              value={viewer.readerPreferences.textSize}
            ><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select></label>
            <label>Line Width <select
              onChange={event => { setReaderPreference('width', event.currentTarget.value as ReaderPreferences['width']) }}
              value={viewer.readerPreferences.width}
            ><option value="narrow">Narrow</option><option value="md">Medium</option><option value="wide">Wide</option></select></label>
            <label>Line Spacing <select
              onChange={event => { setReaderPreference('spacing', event.currentTarget.value as ReaderPreferences['spacing']) }}
              value={viewer.readerPreferences.spacing}
            ><option value="compact">Compact</option><option value="md">Default</option><option value="relaxed">Relaxed</option></select></label>
            <label>Appearance <select
              onChange={event => { setReaderPreference('appearance', event.currentTarget.value as ReaderPreferences['appearance']) }}
              value={viewer.readerPreferences.appearance}
            ><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
          </div>
          <h2>{reader.title}</h2>
          <section aria-label="Clip Web Page">
            <label>
              Clip Destination
              <input
                disabled={clipLoading || clipPreview !== null}
                onChange={event => { setClipDestination(event.currentTarget.value) }}
                placeholder="example.md"
                value={clipDestination}
              />
            </label>
            <button
              disabled={clipLoading || clipPreview !== null}
              onClick={createClipPreview}
              type="button"
            >{clipLoading && !clipPreview ? 'Generating Preview…' : 'Generate Clip Preview'}</button>
            {clipPreview && (
              <div>
                <p>Review the exact Markdown and destination before saving.</p>
                <p><strong>Destination:</strong> {clipPreview.destination}</p>
                <pre aria-label="Clip Markdown Preview" style={{ maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{clipPreview.markdown}</pre>
                <button disabled={clipLoading} onClick={applyClip} type="button">{clipLoading ? 'Saving…' : 'Save Clip'}</button>
                <button disabled={clipLoading} onClick={invalidateClip} type="button">Cancel</button>
              </div>
            )}
            {clipSavedPath && <p role="status">Saved clip to {clipSavedPath}.</p>}
          </section>
          {reader.warnings.map(warning => <p key={warning} role="status">{warning}</p>)}
          <pre style={{ font: 'inherit', whiteSpace: 'pre-wrap' }}>{reader.content}</pre>
        </article>
      )}
      <div ref={host} style={{ display: reader ? 'none' : 'flex', flex: 1, minHeight: 0 }} />
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
