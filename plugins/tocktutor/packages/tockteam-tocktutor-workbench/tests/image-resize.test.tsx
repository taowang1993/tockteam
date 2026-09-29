import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { redo, undo } from '@milkdown/prose/history'
import { afterEach, expect, it, vi } from 'vitest'
import { LivePreviewEditor } from '../src/live-preview-editor.tsx'
import { renderMarkdownHtml } from '../src/rich-markdown.ts'
import { collectEmbedTargets } from '../src/embeds.ts'

const imageBytes = 'iVBORw0KGgo='
const resolved = (source: string, display: string | null) => ({
  content: imageBytes,
  mimeType: 'image/png',
  target: { display, fragment: null, kind: 'media' as const, path: 'photo.png', source },
})

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('resizes only one Host-resolved wikilink with a keyboard width control, retaining its neighbour and undo history', async () => {
  const token = '![[photo.png|320x200]]'
  const source = `Before\n\n${token} and ${token}\n\nAfter\n`
  const ref = { current: null as any }, onChange = vi.fn()
  const { container, unmount } = render(<LivePreviewEditor content={source} resolvedEmbeds={[resolved(token, '320x200'), resolved(token, '320x200')]} editorViewRef={ref} onMarkdownChange={onChange} />)
  await waitFor(() => expect(container.querySelectorAll('img[src="data:image/png;base64,iVBORw0KGgo="]').length).toBe(2), { timeout: 10_000 })
  const controls = await screen.findAllByRole('spinbutton', { name: 'Image Width' })
  expect(controls).toHaveLength(2)
  const actions = controls[0]!.closest('[aria-label="Image Actions"]')
  expect(actions?.className).toContain('flex')
  expect(actions?.previousElementSibling?.tagName).toBe('IMG')
  controls[0]!.focus()
  fireEvent.mouseDown(controls[0]!)
  expect(document.activeElement).toBe(controls[0])
  fireEvent.input(controls[0]!, { target: { value: '420' } })
  expect(onChange).not.toHaveBeenCalled() // Previewing a size never writes a draft.
  fireEvent.keyDown(controls[0]!, { key: 'Enter' })
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
  const saved = onChange.mock.lastCall![0] as string
  expect(saved).toContain('![[photo.png|420]] and ![[photo.png|320x200]]')
  expect(saved).toContain('Before')
  expect(saved).toContain('After')
  act(() => expect(undo(ref.current.state, ref.current.dispatch)).toBe(true))
  expect(onChange.mock.lastCall![0]).toContain(`${token} and ${token}`)
  act(() => expect(redo(ref.current.state, ref.current.dispatch)).toBe(true))
  expect(onChange.mock.lastCall![0]).toContain('![[photo.png|420]] and ![[photo.png|320x200]]')
  unmount()
  const reopened = render(<LivePreviewEditor content={saved} resolvedEmbeds={[resolved('![[photo.png|420]]', '420'), resolved(token, '320x200')]} onMarkdownChange={() => {}} />)
  await waitFor(() => expect(reopened.container.querySelectorAll('img[src="data:image/png;base64,iVBORw0KGgo="]').length).toBe(2), { timeout: 10_000 })
  expect((within(reopened.container).getAllByRole('spinbutton', { name: 'Image Width' })[0] as HTMLInputElement).value).toBe('420')
}, 20_000)

it('cancels a pointer drag without writing and commits one width-only image edit on release', async () => {
  const token = '![[photo.png|320x200]]'
  const onChange = vi.fn()
  render(<LivePreviewEditor content={token} resolvedEmbeds={[resolved(token, '320x200')]} onMarkdownChange={onChange} />)
  const handle = await screen.findByRole('button', { name: 'Drag to Resize Image' }, { timeout: 10_000 })
  fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 })
  fireEvent.pointerMove(window, { clientX: 150, pointerId: 1 })
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.pointerCancel(window, { pointerId: 1 })
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.pointerDown(handle, { clientX: 100, pointerId: 2 })
  fireEvent.pointerMove(window, { clientX: 150, pointerId: 2 })
  fireEvent.pointerUp(window, { clientX: 150, pointerId: 2 })
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
  expect(onChange.mock.lastCall![0]).toContain('![[photo.png|370]]')
}, 15_000)

it('preserves Markdown image alt text and caption; unavailable or unsafe images have no resize controls', async () => {
  const token = '![Meaningful Alt|320x200](photo.png "Caption")'
  const onChange = vi.fn()
  const { rerender, container } = render(<LivePreviewEditor content={token} resolvedEmbeds={[resolved(token, 'Meaningful Alt|320x200')]} onMarkdownChange={onChange} />)
  const width = await screen.findByRole('spinbutton', { name: 'Image Width' }, { timeout: 10_000 })
  expect(width.closest('[aria-label="Image Actions"]')?.previousElementSibling?.classList.contains('image-wrapper')).toBe(true)
  fireEvent.input(width, { target: { value: '500' } })
  fireEvent.keyDown(width, { key: 'Escape' })
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.input(width, { target: { value: '500' } })
  fireEvent.keyDown(width, { key: 'Enter' })
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
  expect(onChange.mock.lastCall![0]).toContain('![Meaningful Alt|500](photo.png "Caption")')
  fireEvent.input(width, { target: { value: '9999' } })
  fireEvent.keyDown(width, { key: 'Enter' })
  expect(onChange).toHaveBeenCalledTimes(1)
  rerender(<LivePreviewEditor content="![Unsafe](https://example.invalid/pic.png)" resolvedEmbeds={[]} onMarkdownChange={onChange} />)
  await waitFor(() => expect(container.querySelector('img[src="data:image/png;base64,iVBORw0KGgo="]')).toBeNull())
  expect(screen.queryByRole('spinbutton', { name: 'Image Width' })).toBeNull()
}, 20_000)

it('preserves a wikilink image caption when assigning a size', async () => {
  const token = '![[photo.png|A caption]]', onChange = vi.fn()
  const { container } = render(<LivePreviewEditor content={token} resolvedEmbeds={[resolved(token, 'A caption')]} onMarkdownChange={onChange} />)
  await waitFor(() => expect(container.querySelector('img[src="data:image/png;base64,iVBORw0KGgo="]')).toBeTruthy(), { timeout: 10_000 })
  const width = await screen.findByRole('spinbutton', { name: 'Image Width' })
  fireEvent.input(width, { target: { value: '400' } })
  fireEvent.keyDown(width, { key: 'Enter' })
  await waitFor(() => expect(onChange.mock.lastCall?.[0]).toContain('![[photo.png|A caption|400]]'))
  const persisted = '![[photo.png|A caption|400]]'
  expect(collectEmbedTargets(persisted)[0]?.display).toBe('A caption|400')
  const html = renderMarkdownHtml(persisted, { resolvedEmbeds: [resolved(persisted, 'A caption|400')] })
  expect(html).toContain('alt="A caption"')
  expect(html).toContain('width="400"')
})

it('reads width-only and authored WxH sizes in Reading without changing the Markdown', () => {
  const one = '![[photo.png|320]]', two = '![Alt|480x240](photo.png)'
  const html = renderMarkdownHtml(`${one}\n\n${two}`, { resolvedEmbeds: [resolved(one, '320'), resolved(two, 'Alt|480x240')] })
  expect(html).toContain('width="320"')
  expect(html).toContain('height="240" width="480"')
  expect(html).toContain('alt="Alt"')
})
