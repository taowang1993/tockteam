import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachBrowserMermaid } from '../src/mermaid-renderer.ts'

const simpleSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text x="20" y="30">Safe</text></svg>'
const frameMessage = (frame: HTMLIFrameElement, data: object): void => {
  window.dispatchEvent(new MessageEvent('message', { data, origin: 'null', source: frame.contentWindow }))
}
const rootWithFence = (code: string): HTMLElement => {
  const root = document.createElement('div')
  root.style.setProperty('--tt-panel', '#151517')
  root.style.setProperty('--tt-text', '#f4f4f5')
  root.style.setProperty('--dsw-specific-markdown-accent', '#a78bfa')
  const figure = document.createElement('figure')
  figure.className = 'mermaid'
  figure.dataset.language = 'mermaid'
  const pre = document.createElement('pre')
  pre.textContent = code
  figure.append(pre)
  root.append(figure)
  document.body.append(root)
  return root
}

afterEach(() => { document.body.replaceChildren() })

describe('Mermaid Reading frame lifecycle', () => {
  it('accepts only a matching opaque-frame response and restores the fence on appearance change', async () => {
    const root = rootWithFence('sequenceDiagram\nAlice->>Bob: Hello')
    const dispose = attachBrowserMermaid(root)
    try {
      const frame = root.querySelector('iframe')!
      expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
      expect(frame.getAttribute('aria-hidden')).toBe('true')
      const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
      frameMessage(frame, { channel: 'tocktutor-mermaid', ready: true })
      expect(post).toHaveBeenCalledWith(expect.objectContaining({ id: 1, source: 'sequenceDiagram\nAlice->>Bob: Hello' }), '*')
      window.dispatchEvent(new MessageEvent('message', { data: { channel: 'tocktutor-mermaid', id: 1, svg: simpleSvg }, origin: 'https://external.example' }))
      expect(root.querySelector('img')).toBeNull()
      frameMessage(frame, { channel: 'tocktutor-mermaid', id: 1, svg: simpleSvg })
      expect(root.querySelector('img')?.getAttribute('src')?.startsWith('data:image/svg+xml,')).toBe(true)
      root.style.setProperty('--tt-panel', '#ffffff')
      document.documentElement.setAttribute('data-theme', 'light')
      await vi.waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), '*'))
      expect(root.querySelector('img')).toBeNull()
      expect(root.querySelector('pre')?.textContent).toContain('Alice->>Bob')
      frameMessage(frame, { channel: 'tocktutor-mermaid', id: 1, svg: simpleSvg })
      expect(root.querySelector('img')).toBeNull()
      frameMessage(frame, { channel: 'tocktutor-mermaid', id: 2, svg: simpleSvg })
      expect(root.querySelector('img')).toBeTruthy()
    } finally { dispose() }
    expect(root.querySelector('iframe')).toBeNull()
  })

  it('keeps escaped source when malformed, oversized or unloaded', () => {
    const root = rootWithFence('pie\n"Cats": 40')
    const dispose = attachBrowserMermaid(root)
    const frame = root.querySelector('iframe')!
    frameMessage(frame, { channel: 'tocktutor-mermaid', ready: true })
    frameMessage(frame, { channel: 'tocktutor-mermaid', id: 1, svg: '<svg onload="bad()"/>' })
    expect(root.querySelector('pre')?.textContent).toContain('Cats')
    dispose()
    const oversized = rootWithFence('x'.repeat(4097))
    expect(oversized.querySelector('iframe')).toBeNull()
    attachBrowserMermaid(oversized)()
    expect(oversized.querySelector('pre')?.textContent).toHaveLength(4097)
  })
})
