import { fireEvent, render, waitFor } from '@testing-library/react'
import { undo, redo } from '@codemirror/commands'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LivePreviewEditor } from '../src/live-preview-editor.tsx'

describe('source-preserving Live Preview', () => {
  it('edits any note, echoes changes, and undoes without rewriting unrelated Markdown', async () => {
    const source = '---\r\ntags: [keep]\r\n---\r\n# Title\r\n\r\n> [!note]+ Custom\r\n> Keep **this**.\r\n\r\n%% hidden %%\r\n\r\n$$x + 1$$\r\n\r\n![[Photo.png]]\r\n\r\n<div>Keep HTML</div>\r\n\r\n```mermaid\r\ngraph TD; A-->B\r\n```\r\n\r\nEdit here\r\n'
    const onChange = vi.fn()
    const editorViewRef = { current: null as any }
    function Note() {
      const [content, setContent] = useState(source)
      return <LivePreviewEditor content={content} editorViewRef={editorViewRef} onMarkdownChange={next => { setContent(next); onChange(next) }} />
    }
    const { container } = render(<Note />)
    await waitFor(() => expect(container.querySelector('.cm-content[contenteditable="true"]')).toBeTruthy(), { timeout: 5_000 })
    const view = editorViewRef.current
    const from = view.state.doc.toString().indexOf('Edit here')
    view.dispatch({ changes: { from, insert: 'Now ' }, selection: { anchor: from + 4 } })
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(source.replace('Edit here', 'Now Edit here')))
    expect(undo(view)).toBe(true)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(source))
    expect(redo(view)).toBe(true)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(source.replace('Edit here', 'Now Edit here')))
    expect(container.textContent).not.toContain('Editing Is Limited')
  })

  it('preserves mixed line endings outside edits and restores deleted separators on undo', async () => {
    const source = 'First\r\nSecond\nThird\rFourth'
    const onChange = vi.fn()
    const onSelection = vi.fn()
    const editorViewRef = { current: null as any }
    const { container, rerender } = render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} onSelectionChange={onSelection} />)
    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy())
    const view = editorViewRef.current
    view.dispatch({ changes: { from: 5, insert: '\nNew' } })
    expect(onChange).toHaveBeenLastCalledWith('First\r\nNew\r\nSecond\nThird\rFourth')
    expect(undo(view)).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith(source)
    view.dispatch({ changes: { from: 5, to: 6 } })
    expect(onChange).toHaveBeenLastCalledWith('FirstSecond\nThird\rFourth')
    expect(undo(view)).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith(source)
    expect(redo(view)).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith('FirstSecond\nThird\rFourth')
    onChange.mockClear()
    onSelection.mockClear()
    rerender(<LivePreviewEditor content={'Peer\r\nreplacement'} editorViewRef={editorViewRef} onMarkdownChange={onChange} onSelectionChange={onSelection} />)
    await waitFor(() => expect(view.state.doc.toString()).toBe('Peer\nreplacement'))
    expect(onChange).not.toHaveBeenCalled()
    expect(onSelection).toHaveBeenLastCalledWith({ from: view.state.selection.main.from, to: view.state.selection.main.to })
    expect(undo(view)).toBe(false)
  })

  it('opens only credential-free public web links through the owning callback', async () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,payload', 'file:///etc/passwd', 'https://u:p@example.com', 'http://127.0.0.1', 'https://example.com/path']) {
      const open = vi.fn()
      const { container, unmount } = render(<LivePreviewEditor content={`[Link](${url})`} onMarkdownChange={() => {}} onOpenExternalUrl={open} />)
      await waitFor(() => expect(container.querySelector('[data-live-url]')).toBeTruthy())
      fireEvent.mouseDown(container.querySelector('[data-live-url]')!, { metaKey: true })
      if (url === 'https://example.com/path') expect(open).toHaveBeenCalledWith(url)
      else expect(open).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('renders formatting away from the cursor and reveals the exact active Markdown', async () => {
    const source = '# Heading\n\n**Bold** and *italic*\n\n> [!note]\n> Callout\n\nEnd'
    const editorViewRef = { current: null as any }
    const { container } = render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={() => {}} />)
    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy(), { timeout: 5_000 })
    const view = editorViewRef.current
    view.focus()
    view.dispatch({ selection: { anchor: source.length } })
    await waitFor(() => expect(container.querySelector('.cm-live-strong')?.textContent).toBe('Bold'))
    expect(container.querySelector('.callout')?.textContent).toContain('Callout')
    const from = source.indexOf('Callout')
    view.dispatch({ selection: { anchor: from } })
    await waitFor(() => expect(container.querySelector('.cm-content')?.textContent).toContain('> [!note]'))
    expect(view.state.doc.toString()).toBe(source)
  })
})
