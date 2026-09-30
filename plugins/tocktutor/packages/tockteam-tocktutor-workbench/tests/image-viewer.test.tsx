import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RichReadingView } from '../src/editor-surface.tsx'
import { LivePreviewEditor } from '../src/live-preview-editor.tsx'
import { SourceEditor } from '../src/source-editor.tsx'
import { ImageViewerDialog, safeRasterImageDataUrl } from '../src/image-viewer.tsx'

const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
const externalUrl = 'https://example.com/photo.png'
const localEmbed = {
  content: 'iVBORw0KGgo=',
  mimeType: 'image/png',
  target: { display: 'Photo', fragment: null, kind: 'media' as const, path: 'photo.png', source: '![[photo.png]]' },
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('TockTutor image viewer', () => {
  it('opens a local Reading image and supports fit, bounded zoom, pan, reset, and Escape focus return', async () => {
    const { unmount } = render(<RichReadingView embeds={[localEmbed]} onToggleTask={() => {}} source="![[photo.png]]" title="Note" />)
    const image = await screen.findByRole('button', { name: 'View Image: Photo' })
    image.focus()
    fireEvent.click(image)

    const dialog = await screen.findByRole('dialog', { name: 'Photo' })
    // The Workbench is a fixed layer (z-1001); the portal must sit above it.
    expect(dialog.className).toContain('z-[2147483647]')
    expect(document.querySelector('[data-slot="dialog-overlay"]')?.className).toContain('z-[2147483646]')
    expect(within(dialog).getByText(/Use plus and minus keys/u).className).toContain('sr-only')
    const viewerImage = within(dialog).getByRole('img', { name: 'Photo' })
    expect(viewerImage.getAttribute('src')).toBe(dataUrl)
    expect(within(dialog).queryByRole('button', { name: 'Fit Image' })).toBeNull()

    fireEvent.keyDown(dialog, { key: '+' })
    expect(viewerImage.getAttribute('data-zoom')).toBe('1.25')
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(viewerImage.getAttribute('data-offset-x')).toBe('80')
    fireEvent.keyDown(dialog, { key: '-' })
    expect(viewerImage.getAttribute('data-zoom')).toBe('1')
    fireEvent.keyDown(dialog, { key: '0' })
    expect(viewerImage.getAttribute('data-offset-x')).toBe('0')
    fireEvent.keyDown(dialog, { key: '+' })
    expect(viewerImage.getAttribute('data-zoom')).toBe('1.25')
    fireEvent.keyDown(dialog, { key: '0' })
    expect(viewerImage.getAttribute('data-zoom')).toBe('1')
    for (let index = 0; index < 32; index += 1) fireEvent.keyDown(dialog, { key: '+' })
    expect(viewerImage.getAttribute('data-zoom')).toBe('8')
    for (let index = 0; index < 32; index += 1) fireEvent.keyDown(dialog, { key: '-' })
    expect(viewerImage.getAttribute('data-zoom')).toBe('0.2')
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
    fireEvent.keyDown(dialog, { key: 'ArrowUp' })
    expect(viewerImage.getAttribute('data-offset-x')).toBe('-80')
    expect(viewerImage.getAttribute('data-offset-y')).toBe('-80')
    fireEvent.keyDown(dialog, { key: 'ArrowDown' })
    expect(viewerImage.getAttribute('data-offset-y')).toBe('0')
    fireEvent.wheel(dialog, { deltaY: -1 })
    expect(Number(viewerImage.getAttribute('data-zoom'))).toBeCloseTo(0.22)
    fireEvent.wheel(dialog, { deltaY: 1 })
    expect(Number(viewerImage.getAttribute('data-zoom'))).toBeCloseTo(0.2)

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(image)
    fireEvent.click(image)
    await screen.findByRole('dialog', { name: 'Photo' })
    const overlay = document.querySelector('[data-slot="dialog-overlay"]')!
    fireEvent.pointerDown(overlay, { button: 0 })
    fireEvent.click(overlay)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(image)
    unmount()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('floats the image over the app with an accessible icon-only circular close control outside the image viewport', async () => {
    const close = vi.fn()
    const { unmount } = render(<ImageViewerDialog image={{ alt: 'Photo', src: dataUrl }} onClose={close} />)
    const dialog = await screen.findByRole('dialog', { name: 'Photo' })
    expect(document.activeElement).toBe(dialog)
    expect(dialog.className).not.toMatch(/rounded|bg-popover|border-border|shadow-xl/u)
    expect(within(dialog).queryByRole('group', { name: 'Image Controls' })).toBeNull()
    expect(within(dialog).getByRole('heading', { name: 'Photo' })).toBeTruthy()
    const closeButton = within(dialog).getByRole('button', { name: 'Close' })
    expect(closeButton.textContent?.trim()).toBe('')
    expect(closeButton.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(closeButton.getAttribute('data-size')).toBe('icon-lg')
    expect(closeButton.classList.contains('!rounded-full')).toBe(true)
    expect(closeButton.getAttribute('data-variant')).toBe('outline')
    expect(closeButton.parentElement?.contains(within(dialog).getByRole('heading', { name: 'Photo' }))).toBe(true)
    expect(within(dialog).getByLabelText('Image Viewport').contains(closeButton)).toBe(false)
    expect(dialog.hasAttribute('data-tocktutor-image-viewer')).toBe(true)
    expect(within(dialog).getByText(/plus and minus keys/u).classList.contains('sr-only')).toBe(true)
    fireEvent.keyDown(dialog, { key: '+', ctrlKey: true })
    expect(within(dialog).getByRole('img').getAttribute('data-zoom')).toBe('1')
    fireEvent.keyDown(dialog, { key: 'ArrowRight', altKey: true })
    expect(within(dialog).getByRole('img').getAttribute('data-offset-x')).toBe('0')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(close).toHaveBeenCalledOnce()
    unmount()
  })

  it('dismisses on the image gutter but not after dragging to pan', async () => {
    class PointerEvent extends MouseEvent { readonly pointerId = 1 }
    vi.stubGlobal('PointerEvent', PointerEvent)
    const close = vi.fn()
    const { unmount } = render(<ImageViewerDialog image={{ alt: 'Photo', src: dataUrl }} onClose={close} />)
    const dialog = await screen.findByRole('dialog', { name: 'Photo' })
    const viewport = within(dialog).getByLabelText('Image Viewport')
    fireEvent.pointerDown(viewport, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(viewport, { clientX: 90, clientY: 50 })
    fireEvent.pointerUp(viewport)
    fireEvent.click(viewport)
    expect(close).not.toHaveBeenCalled()
    const image = within(dialog).getByRole('img')
    expect(image.getAttribute('data-offset-x')).toBe('80')
    expect(image.getAttribute('data-offset-y')).toBe('40')
    fireEvent.pointerDown(viewport, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(viewport)
    fireEvent.click(viewport)
    expect(close).toHaveBeenCalledOnce()
    fireEvent.pointerDown(dialog, { button: 0, clientX: 1, clientY: 1 })
    fireEvent.click(dialog)
    expect(close).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('closes the Reading viewer when the note content changes', async () => {
    const { rerender } = render(<RichReadingView embeds={[localEmbed]} onToggleTask={() => {}} source="![[photo.png]]" title="Note" />)
    fireEvent.click(await screen.findByRole('button', { name: 'View Image: Photo' }))
    await screen.findByRole('dialog', { name: 'Photo' })
    rerender(<RichReadingView onToggleTask={() => {}} source="A different note" title="Other Note" />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('offers a View Image action from a Source embed without revealing its authored token', async () => {
    const { container, unmount } = render(<SourceEditor content="See ![[photo.png]]" onContentChange={() => {}} resolvedEmbeds={[localEmbed]} selectionRequest={{ from: 0, id: 1, to: 0 }} />)
    const action = await screen.findByRole('button', { name: 'View Image' })
    fireEvent.click(action)

    const dialog = await screen.findByRole('dialog', { name: 'Photo' })
    expect(within(dialog).getByRole('img', { name: 'Photo' }).getAttribute('src')).toBe(dataUrl)
    expect(container.querySelector('.tocktutor-source-embed-widget')).toBeTruthy()
    expect(dialog.textContent).not.toContain('![[photo.png]]')
    unmount()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('offers a Live Preview action only for the safely proxied raster bytes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ mimeType: 'image/png', dataBase64: 'iVBORw0KGgo=' })))
    const props = { onMarkdownChange: () => {} }
    const { container, rerender } = render(<LivePreviewEditor content={`![Photo](${externalUrl} "Photo Credit")`} {...props} />)
    await waitFor(() => expect(container.querySelector(`img[src="${dataUrl}"]`)).toBeTruthy(), { timeout: 10_000 })
    const action = await screen.findByRole('button', { name: 'View Image' })
    fireEvent.click(action)

    const dialog = await screen.findByRole('dialog', { name: 'Photo' })
    expect(within(dialog).getByRole('img', { name: 'Photo' }).getAttribute('src')).toBe(dataUrl)
    expect(within(dialog).getByRole('heading', { name: 'Photo' }).textContent).not.toContain('Photo Credit')
    expect(dialog.textContent).not.toContain(externalUrl)
    rerender(<LivePreviewEditor content="Changed note" {...props} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  }, 15_000)

  it('rejects authored URLs, SVG, malformed data, and proxy placeholders', () => {
    expect(safeRasterImageDataUrl(externalUrl)).toBeNull()
    expect(safeRasterImageDataUrl('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull()
    expect(safeRasterImageDataUrl('data:image/png;base64,AAAA==')).toBeNull()
    expect(safeRasterImageDataUrl('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')).toBeNull()
    expect(safeRasterImageDataUrl(dataUrl)).toBe(dataUrl)
  })

  it('shows a safe fallback when already-resolved raster bytes cannot be decoded', async () => {
    const { unmount } = render(<ImageViewerDialog image={{ alt: 'Photo', src: dataUrl }} onClose={() => {}} />)
    const dialog = await screen.findByRole('dialog', { name: 'Photo' })
    fireEvent.error(within(dialog).getByRole('img', { name: 'Photo' }))
    expect(await within(dialog).findByText('Image Preview Is Unavailable')).toBeTruthy()
    unmount()
  })

  it('offers a Live Preview action for a local embed', async () => {
    const { container, unmount } = render(<LivePreviewEditor content="Before ![[photo.png]] after" onMarkdownChange={() => {}} resolvedEmbeds={[localEmbed]} />)
    const action = await screen.findByRole('button', { name: 'View Image' }, { timeout: 10_000 })
    expect(container.querySelector('img[src^="https://"]')).toBeNull()
    fireEvent.click(action)
    const dialog = await screen.findByRole('dialog', { name: 'Photo' })
    expect(within(dialog).getByRole('img', { name: 'Photo' }).getAttribute('src')).toBe(dataUrl)
    unmount()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  }, 15_000)
})
