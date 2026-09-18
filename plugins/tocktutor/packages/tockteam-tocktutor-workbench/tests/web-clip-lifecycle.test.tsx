import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { apply } from '../../tockbot-web-clip/src/client.tsx'
import { MAX_VIEWER_TABS } from '../../tockbot-web-clip/src/viewer.ts'

interface Owner {
  addLinkBookmark?: (title: string, url: string) => boolean
  externalUrl?: string | null
  webClipFolder?: string
}

interface FakeWebview extends HTMLElement {
  getWebContentsId(): number
  loadURL(url: string): Promise<void>
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(nextResolve => { resolve = nextResolve })
  return { promise, resolve }
}

function response(url: string, title: string): Response {
  return new Response(JSON.stringify({ contentType: 'text/html', html: `<h1>${title}</h1><p>${url}</p>`, title, url }), { status: 200 })
}

function mountViewer(owner: Owner, webview: FakeWebview, authorizeDocument = async (_frameId: number, html: string) => /https:\/\/example\.com\/[a-z0-9-]+/u.exec(html)?.[0] ?? 'about:blank') {
  let component: ((props: Owner) => ReactNode) | undefined
  let effectCleanup: (() => void) | undefined
  let panelCleanup: (() => void) | undefined
  const slots = {
    inject(_name: string, callback: () => () => void) {
      panelCleanup = callback()
      return () => panelCleanup?.()
    },
    register(_options: object, candidate: unknown) {
      component = candidate as (props: Owner) => ReactNode
      return () => {}
    },
  }
  const context = {
    get(name: string) {
      if (name === 'tockTeamSurface') return { kind: 'desktop' }
      if (name === 'desktopSidebar') return { registerTab: () => () => {} }
      if (name === 'slots') return slots
      throw new Error(`unexpected dependency: ${name}`)
    },
    effect(effect: () => () => void) {
      effectCleanup = effect()
    },
    slots,
  }
  window.dshDesktop = {
    getInfo: async () => ({ version: '0.1.6' }),
    webClip: { authorizeDocument },
  }
  apply(context as never)
  if (!component) throw new Error('Web Viewer panel was not registered')
  const view = render(component(owner))
  return {
    rerender(next: Owner) { view.rerender(component!(next)) },
    unmount() {
      view.unmount()
      panelCleanup?.()
      effectCleanup?.()
    },
  }
}

function installWebview(load?: (url: string) => Promise<void>) {
  const originalCreateElement = document.createElement.bind(document)
  const loads: string[] = []
  const element = originalCreateElement('webview') as FakeWebview
  Object.assign(element, {
    getWebContentsId: () => 42,
    loadURL: async (url: string) => {
      loads.push(url)
      await load?.(url)
    },
  })
  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => (
    tagName === 'webview' ? element : originalCreateElement(tagName, options)
  )) as typeof document.createElement)
  return { element, loads }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete window.dshDesktop
  window.localStorage.clear()
})

it('clears the native frame when closing the only active page', async () => {
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const { url } = JSON.parse(String(init?.body)) as { url: string }
    return response(url, 'Old Page')
  })
  vi.stubGlobal('fetch', fetch)
  const { element, loads } = installWebview()
  const mounted = mountViewer({ externalUrl: 'https://example.com/old' }, element)
  try {
    await act(async () => { element.dispatchEvent(new Event('dom-ready')) })
    await waitFor(() => expect(loads).toEqual(['https://example.com/old']))
    fireEvent.click(document.querySelector<HTMLButtonElement>('button[aria-label="Close Old Page"]')!)
    await waitFor(() => expect(loads.at(-1)).toBe('about:blank'))
  } finally {
    mounted.unmount()
  }
})

it('does not blank the active page when New Tab is at capacity', async () => {
  window.localStorage.setItem('tocktutor.webViewer.v1', JSON.stringify({
    activeIndex: MAX_VIEWER_TABS - 1,
    bookmarks: [],
    readerPreferences: { appearance: 'system', spacing: 'md', textSize: 'md', width: 'md' },
    tabs: Array.from({ length: MAX_VIEWER_TABS }, (_, index) => ({ title: `Page ${String(index)}`, url: `https://example.com/page-${String(index)}` })),
    version: 1,
  }))
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const { url } = JSON.parse(String(init?.body)) as { url: string }
    return response(url, 'Active Page')
  })
  vi.stubGlobal('fetch', fetch)
  const { element, loads } = installWebview()
  const mounted = mountViewer({}, element)
  try {
    await act(async () => { element.dispatchEvent(new Event('dom-ready')) })
    await waitFor(() => expect(loads).toEqual(['https://example.com/page-19']))
    fireEvent.click(screen.getByText('New Tab'))
    await act(async () => {})
    expect(loads).toEqual(['https://example.com/page-19'])
    expect(screen.getByDisplayValue('https://example.com/page-19')).toBeTruthy()
  } finally {
    mounted.unmount()
  }
})

it('queues an external URL before readiness and prevents stored restoration or later DOM-ready replacement', async () => {
  window.localStorage.setItem('tocktutor.webViewer.v1', JSON.stringify({
    activeIndex: 0,
    bookmarks: [],
    readerPreferences: { appearance: 'system', spacing: 'md', textSize: 'md', width: 'md' },
    tabs: [{ title: 'Stored Page', url: 'https://example.com/stored' }],
    version: 1,
  }))
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const { url } = JSON.parse(String(init?.body)) as { url: string }
    return response(url, 'External Page')
  })
  vi.stubGlobal('fetch', fetch)
  const { element, loads } = installWebview()
  const mounted = mountViewer({ externalUrl: 'https://example.com/external' }, element)
  try {
    expect(fetch).not.toHaveBeenCalled()
    await act(async () => { element.dispatchEvent(new Event('dom-ready')) })
    await waitFor(() => expect(loads).toEqual(['https://example.com/external']))
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => { element.dispatchEvent(new Event('dom-ready')) })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(loads).toEqual(['https://example.com/external'])
  } finally {
    mounted.unmount()
  }
})

it('does not load an authorized page after navigation is superseded or disposed', async () => {
  const firstAuthorization = deferred<string>()
  const disposedAuthorization = deferred<string>()
  const authorizeDocument = vi.fn(async (_frameId: number, html: string) => {
    const url = /https:\/\/example\.com\/[a-z]+/u.exec(html)?.[0] ?? ''
    if (url.endsWith('/first')) return firstAuthorization.promise
    if (url.endsWith('/disposed')) return disposedAuthorization.promise
    return url
  })
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const { url } = JSON.parse(String(init?.body)) as { url: string }
    return response(url, 'Page')
  })
  vi.stubGlobal('fetch', fetch)
  const { element, loads } = installWebview()
  const mounted = mountViewer({ externalUrl: 'https://example.com/first' }, element, authorizeDocument)
  try {
    await act(async () => { element.dispatchEvent(new Event('dom-ready')) })
    await waitFor(() => expect(authorizeDocument).toHaveBeenCalledTimes(1))

    mounted.rerender({ externalUrl: 'https://example.com/latest' })
    await waitFor(() => expect(loads).toEqual(['https://example.com/latest']))
    await act(async () => { firstAuthorization.resolve('https://example.com/first') })
    expect(loads).toEqual(['https://example.com/latest'])

    mounted.rerender({ externalUrl: 'https://example.com/disposed' })
    await waitFor(() => expect(authorizeDocument).toHaveBeenCalledTimes(3))
    mounted.unmount()
    await act(async () => { disposedAuthorization.resolve('https://example.com/disposed') })
    expect(loads).toEqual(['https://example.com/latest'])
  } finally {
    mounted.unmount()
  }
})

it('rejects stale fetch and navigation completions and invalidates pending work on dispose', async () => {
  window.localStorage.setItem('tocktutor.webViewer.v1', JSON.stringify({
    activeIndex: 0,
    bookmarks: [],
    readerPreferences: { appearance: 'system', spacing: 'md', textSize: 'md', width: 'md' },
    tabs: [{ title: 'Stored Page', url: 'https://example.com/stored' }],
    version: 1,
  }))
  const stored = deferred<Response>()
  const external = deferred<Response>()
  const latest = deferred<Response>()
  const disposed = deferred<Response>()
  const staleNavigation = deferred<void>()
  const responses = new Map([
    ['https://example.com/stored', stored],
    ['https://example.com/external', external],
    ['https://example.com/latest', latest],
    ['https://example.com/disposed', disposed],
  ])
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const { url } = JSON.parse(String(init?.body)) as { url: string }
    return responses.get(url)!.promise
  })
  vi.stubGlobal('fetch', fetch)
  const { element, loads } = installWebview(async url => {
    if (url === 'https://example.com/external') await staleNavigation.promise
  })
  const mounted = mountViewer({}, element)
  try {
    await act(async () => { element.dispatchEvent(new Event('dom-ready')) })
    mounted.rerender({ externalUrl: 'https://example.com/external' })
    stored.resolve(response('https://example.com/stored', 'Stored Page'))
    await act(async () => {})
    expect(loads).toEqual([])

    external.resolve(response('https://example.com/external', 'External Page'))
    await waitFor(() => expect(loads).toEqual(['https://example.com/external']))

    mounted.rerender({ externalUrl: 'https://example.com/latest' })
    latest.resolve(response('https://example.com/latest', 'Latest Page'))
    await waitFor(() => expect(loads).toEqual(['https://example.com/external', 'https://example.com/latest']))
    await waitFor(() => expect(document.querySelector<HTMLInputElement>('input[aria-label="URL"]')?.value).toBe('https://example.com/latest'))
    staleNavigation.resolve()
    await act(async () => {})
    expect(document.querySelector<HTMLInputElement>('input[aria-label="URL"]')?.value).toBe('https://example.com/latest')

    mounted.rerender({ externalUrl: 'https://example.com/disposed' })
    mounted.unmount()
    disposed.resolve(response('https://example.com/disposed', 'Disposed Page'))
    await act(async () => {})
    expect(loads).toEqual(['https://example.com/external', 'https://example.com/latest'])
  } finally {
    mounted.unmount()
  }
})
