import { describe, expect, it } from 'vitest'
import { mermaidFrameDocument, passiveMermaidImageUrl } from '../src/mermaid-browser.ts'

const colors = { background: '#151517', foreground: '#f4f4f5', accent: '#a78bfa' }
const svg = (contents: string): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">${contents}</svg>`

describe('isolated Mermaid image boundary', () => {
  it('projects only inert SVG elements into a passive image with readable colors', () => {
    const url = passiveMermaidImageUrl(svg('<g><path d="M0 0L10 10"/><rect x="10" y="10" width="30" height="20"/><text x="20" y="30">A &amp; B</text></g>'), colors)
    expect(url?.startsWith('data:image/svg+xml,')).toBe(true)
    const safe = decodeURIComponent(url!.split(',')[1]!)
    expect(safe).toContain('A &amp; B')
    expect(safe).toContain('fill="#f4f4f5"')
    expect(safe).toContain('stroke="#a78bfa"')
  })

  it('replaces hardcoded light shape fills to keep labels readable in the active theme', () => {
    const safe = decodeURIComponent(passiveMermaidImageUrl(svg('<rect x="0" y="0" width="20" height="20" fill="#ffffff"/><text x="10" y="10">Alice</text>'), colors)!.split(',')[1]!)
    expect(safe).not.toContain('fill="#ffffff"')
    expect(safe).toContain('fill="#151517"')
    expect(safe).toContain('Alice')
    expect(safe).toContain('paint-order="stroke fill"')
  })

  it('converts HTML label boxes into SVG text, never HTML or an active node', () => {
    const url = passiveMermaidImageUrl(svg('<foreignObject x="10" y="20" width="100" height="40"><div xmlns="http://www.w3.org/1999/xhtml"><b>Safe label</b></div></foreignObject>'), colors)
    const safe = decodeURIComponent(url!.split(',')[1]!)
    expect(safe).toContain('Safe label')
    expect(safe).not.toMatch(/foreignObject|<div|<b>/u)
  })

  it.each([
    svg('<script>alert(1)</script>'),
    svg('<a href="https://example.com"><text>bad</text></a>'),
    svg('<image href="data:image/svg+xml,%3Csvg%3E"/>'),
    svg('<path d="M0 0" onload="alert(1)"/>'),
    svg('<style>@import url(https://example.com/evil.css)</style>'),
    svg('<rect fill="url(https://example.com/x)"/>'),
    svg('<animate attributeName="opacity" from="0" to="1"/>'),
    '<!DOCTYPE svg SYSTEM "https://example.com/evil.dtd">' + svg(''),
    svg('x'.repeat(300_000)),
  ])('rejects active markup, remote resources, and excessive output', hostile => {
    expect(passiveMermaidImageUrl(hostile, colors)).toBeNull()
  })

  it('frames untrusted rendering in a script-only opaque origin with no remote capabilities', () => {
    const html = mermaidFrameDocument('http://127.0.0.1:55555')
    expect(html).toContain("default-src 'none'")
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain("font-src 'none'")
    expect(html).toContain("img-src 'none'")
    expect(html).toContain('http://127.0.0.1:55555/tocktutor/mermaid-frame.js')
    expect(html).not.toContain('allow-same-origin')
  })
})
