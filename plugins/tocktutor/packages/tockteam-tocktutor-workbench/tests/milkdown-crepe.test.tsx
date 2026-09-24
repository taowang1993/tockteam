import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LivePreviewEditor } from '../src/live-preview-editor.tsx'
import { undo, redo } from '@milkdown/prose/history'
import { TextSelection } from '@milkdown/prose/state'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('offers the Crepe slash menu in an editable Live Preview', async () => {
  const editorViewRef = { current: null as any }
  const onChange = vi.fn()
  const { container } = render(<LivePreviewEditor content="" editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
  await waitFor(() => expect(container.querySelector('.ProseMirror[contenteditable="true"]')).toBeTruthy(), { timeout: 10_000 })
  await act(async () => {
    const view = editorViewRef.current
    view.focus()
    view.dispatch(view.state.tr.insertText('/'))
  })
  await waitFor(() => expect(container.querySelector('.milkdown-slash-menu')).toBeTruthy())
  expect(container.textContent).toContain('Table')
  expect(container.textContent).toContain('Task List')
})

it('keeps content editable and preserves Obsidian constructs through edit, undo, and reopen', async () => {
  const source = '---\nstatus: active\n---\nText\n\n> [!note]+ Important\n> Keep this callout.\n\n[[Target|Label]] ![[Photo.png]] ==highlight== %%comment%%\n\n```mermaid\ngraph TD; A-->B\n```\n\n<div>HTML content</div>\n\n- [ ] Task\n\n![Photo](https://example.com/photo.png)\n'
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline fixture')))
  const onChange = vi.fn(), ref = { current: null as any }
  const { container, unmount } = render(<LivePreviewEditor content={source} editorViewRef={ref} onMarkdownChange={onChange} />)
  await waitFor(() => expect(ref.current).toBeTruthy(), { timeout: 10_000 })
  expect(onChange).not.toHaveBeenCalled()
  act(() => ref.current.dispatch(ref.current.state.tr.insertText('Edited ', 1)))
  await waitFor(() => expect(onChange).toHaveBeenCalled())
  const saved = onChange.mock.lastCall![0]
  for (const content of ['status: active', 'Edited Text', '[!note]+', '[[Target|Label]]', '![[Photo.png]]', '==highlight==', '%%comment%%', 'graph TD; A-->B', '<div>HTML content</div>', '[ ] Task', 'https://example.com/photo.png']) expect(saved).toContain(content)
  expect(container.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('true')
  act(() => expect(undo(ref.current.state, ref.current.dispatch)).toBe(true))
  expect(onChange.mock.lastCall![0]).not.toContain('Edited Text')
  act(() => expect(redo(ref.current.state, ref.current.dispatch)).toBe(true))
  expect(onChange.mock.lastCall![0]).toContain('Edited Text')
  unmount()
  const reopened = { current: null as any }
  render(<LivePreviewEditor content={saved} editorViewRef={reopened} onMarkdownChange={() => {}} />)
  await waitFor(() => expect(reopened.current?.state.doc.textContent).toContain('Edited Text'), { timeout: 10_000 })
}, 20_000)

it('keeps footnote definitions out of earlier Live Preview paragraphs', async () => {
  const source = 'Use ==highlighting==, and `inline code` in one paragraph.\n\nOpen [[Welcome]], follow [[Study Guide|an aliased note]].\n\nLater.[^context]\n\n[^context]: Footnotes should remain readable without dominating the page.\n'
  const { container } = render(<LivePreviewEditor content={source} onMarkdownChange={() => {}} />)
  await waitFor(() => expect(container.querySelector('.ProseMirror')).toBeTruthy(), { timeout: 10_000 })
  const paragraphs = [...container.querySelectorAll('.ProseMirror > p')].map(node => node.textContent)
  expect(paragraphs[0]).toContain(', and inline code in one paragraph.')
  expect(paragraphs[0]).not.toContain('Footnotes should remain readable')
  expect(paragraphs[1]).not.toContain('Footnotes should remain readable')
  expect(container.querySelector('.tocktutor-inline-preview')?.textContent).toBe('highlighting')
  expect(container.querySelector('.ProseMirror dl')?.textContent).toContain('Footnotes should remain readable')
})

it('preserves block math, link references, and footnote definitions when editing adjacent text', async () => {
  const source = 'Before\n\n$$x + 1$$\n\nRead [Guide][reference] and footnote[^one].\n\n[reference]: Guide.md "Guide title"\n[^one]: Footnote content.\n'
  const ref = { current: null as any }, onChange = vi.fn()
  render(<LivePreviewEditor content={source} editorViewRef={ref} onMarkdownChange={onChange} />)
  await waitFor(() => expect(ref.current).toBeTruthy(), { timeout: 10_000 })
  act(() => ref.current.dispatch(ref.current.state.tr.insertText('New ', 1)))
  const saved = onChange.mock.lastCall![0] as string
  for (const content of ['New Before', '$$x + 1$$', '[Guide][reference]', 'footnote[^one]', '[reference]: Guide.md "Guide title"', '[^one]: Footnote content.']) expect(saved).toContain(content)
})

it('previews Obsidian links and Host-resolved nested embeds while keeping their source editable', async () => {
  const target = '![[Included.md]]', nested = '![[Attachments/nested.png|8x8]]'
  const { container } = render(<LivePreviewEditor content={`Review [[Guide|start here]]. ${target}`} onMarkdownChange={() => {}} resolvedEmbeds={[
    { content: `# Included\n\nNested ${nested}\n`, target: { display: null, fragment: null, kind: 'note', path: 'Included.md', source: target } },
    { content: 'iVBORw0KGgo=', mimeType: 'image/png', depth: 1, parentPath: 'Included.md', target: { display: '8x8', fragment: null, kind: 'media', path: 'Attachments/nested.png', source: nested } },
  ]} />)
  await waitFor(() => expect(container.querySelector('.ProseMirror')).toBeTruthy(), { timeout: 10_000 })
  expect(container.querySelector('.tocktutor-rich-inline a.internal-link')?.textContent).toBe('start here')
  expect(container.querySelector('.tocktutor-live-embed-widget')?.textContent).toContain('Included')
  expect(container.querySelector('.tocktutor-live-embed-widget img[src="data:image/png;base64,iVBORw0KGgo="]')).toBeTruthy()
})

it('never assigns a remote image URL to the renderer and routes public link clicks through the owner', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Host unavailable'))
  const onOpenExternalUrl = vi.fn(), onOpenInternalLink = vi.fn()
  const { container } = render(<LivePreviewEditor content={'![Photo](https://example.com/photo.png)\n\n[Safe](https://example.com/path) [Unsafe](https://u:p@example.com) [[Guide|Go]]'} onMarkdownChange={() => {}} onOpenExternalUrl={onOpenExternalUrl} onOpenInternalLink={onOpenInternalLink} />)
  await waitFor(() => expect(container.querySelector('.milkdown-image-block img')).toBeTruthy(), { timeout: 10_000 })
  expect(container.querySelector('img[src^="https:"]')).toBeNull()
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/web-clip/api/image', expect.objectContaining({ body: JSON.stringify({ url: 'https://example.com/photo.png' }) })))
  fireEvent.click(container.querySelector('.ProseMirror a[href="https://example.com/path"]')!)
  expect(onOpenExternalUrl).toHaveBeenCalledWith('https://example.com/path')
  fireEvent.click(container.querySelector('.ProseMirror a[href="https://u:p@example.com"]')!)
  expect(onOpenExternalUrl).toHaveBeenCalledTimes(1)
  fireEvent.click(container.querySelector('.tocktutor-rich-inline a.internal-link')!)
  expect(onOpenInternalLink).toHaveBeenCalledWith('Guide')
})

it('formats the selected rich text using the existing command palette contract', async () => {
  const ref = { current: null as any }, commandRef = { current: null as any }, onChange = vi.fn()
  render(<LivePreviewEditor content="hello world\n" editorViewRef={ref} commandRef={commandRef} onMarkdownChange={onChange} />)
  await waitFor(() => expect(commandRef.current).toBeTruthy(), { timeout: 10_000 })
  act(() => {
    ref.current.dispatch(ref.current.state.tr.setSelection(TextSelection.create(ref.current.state.doc, 1, 6)))
    expect(commandRef.current('bold')).toBe(true)
  })
  expect(onChange.mock.lastCall![0]).toMatch(/\*\*hello\*\* world/)
})

it('inserts utility text at the rich cursor rather than a Markdown source offset', async () => {
  const ref = { current: null as any }, insertTextRef = { current: null as null | ((text: string) => boolean) }, onChange = vi.fn()
  render(<LivePreviewEditor content="Alpha **beta**\n" editorViewRef={ref} insertTextRef={insertTextRef} onMarkdownChange={onChange} />)
  await waitFor(() => expect(insertTextRef.current).toBeTruthy(), { timeout: 10_000 })
  act(() => {
    ref.current.dispatch(ref.current.state.tr.setSelection(TextSelection.create(ref.current.state.doc, 8)))
    expect(insertTextRef.current?.('2026-08-26')).toBe(true)
  })
  expect(onChange.mock.lastCall?.[0]).toContain('Alpha **b2026-08-26eta**')
})

it('finds and replaces rendered text with native undo, without an exact-source mapping restriction', async () => {
  const ref = { current: null as any }, onChange = vi.fn(), onSearchState = vi.fn()
  const props = { content: 'alpha **alpha**\n', editorViewRef: ref, onMarkdownChange: onChange, onSearchState, searchQuery: 'alpha' }
  const { rerender } = render(<LivePreviewEditor {...props} />)
  await waitFor(() => expect(onSearchState).toHaveBeenLastCalledWith({ current: 0, query: 'alpha', total: 2 }), { timeout: 10_000 })
  rerender(<LivePreviewEditor {...props} searchRequest={{ id: 1, action: 'replace-all', replacement: 'omega' }} />)
  await waitFor(() => expect(onChange.mock.lastCall?.[0]).toContain('omega **omega**'))
  act(() => expect(undo(ref.current.state, ref.current.dispatch)).toBe(true))
  expect(onChange.mock.lastCall![0]).toContain('alpha **alpha**')
})

it('clears native undo history on authoritative reload but not parent echoes', async () => {
  const ref = { current: null as any }, onChange = vi.fn()
  const { rerender } = render(<LivePreviewEditor content="Original\n" editorViewRef={ref} onMarkdownChange={onChange} />)
  await waitFor(() => expect(ref.current).toBeTruthy(), { timeout: 10_000 })
  act(() => ref.current.dispatch(ref.current.state.tr.insertText('Edited ', 1)))
  rerender(<LivePreviewEditor content={onChange.mock.lastCall![0]} editorViewRef={ref} onMarkdownChange={onChange} />)
  act(() => expect(undo(ref.current.state, ref.current.dispatch)).toBe(true))
  rerender(<LivePreviewEditor content="Authoritative replacement\n" editorViewRef={ref} onMarkdownChange={onChange} />)
  await waitFor(() => expect(ref.current.state.doc.textContent).toContain('Authoritative replacement'))
  expect(undo(ref.current.state, ref.current.dispatch)).toBe(false)
})
