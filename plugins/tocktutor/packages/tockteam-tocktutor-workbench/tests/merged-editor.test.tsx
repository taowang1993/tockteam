import { act, cleanup, render, waitFor } from '@testing-library/react'
import { redo, undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { afterEach, expect, it, vi } from 'vitest'
import { LivePreviewEditor } from '../src/live-preview-editor.tsx'
import { SourceEditor } from '../src/source-editor.tsx'

it.each(['b', 'b\n'])('processes bounded bulk replacements without rescanning the source for every match: %j', async replacement => {
  const spacing = replacement === 'b' ? 200 : 199
  const source = ('a' + 'x'.repeat(spacing - 1)).repeat(10_000)
  const editorViewRef = { current: null as EditorView | null }
  render(<SourceEditor content={source} editorViewRef={editorViewRef} />)
  await waitFor(() => expect(editorViewRef.current).toBeTruthy())
  const changes = Array.from({ length: 10_000 }, (_, index) => ({ from: index * spacing, to: index * spacing + 1, insert: replacement }))
  // Count real regex input work, not wall time under parallel CI load.
  const matches = vi.spyOn(String.prototype, 'match')
  try {
    const edited = editorViewRef.current!.state.update({ changes }).state.doc.toString()
    const scannedCharacters = matches.mock.contexts.reduce((total, value) => total + String(value).length, 0)
    expect(edited).toBe((replacement + 'x'.repeat(spacing - 1)).repeat(10_000))
    expect(scannedCharacters).toBeLessThan(source.length * 100)
  } finally {
    matches.mockRestore()
  }
}, 30_000)

it('checks replacement size against authored CRLF bytes, not normalized editor bytes', async () => {
  const source = 'x'.repeat(1_999_993) + '\r\nalpha'
  expect(new TextEncoder().encode(source).length).toBe(2_000_000)
  const editorViewRef = { current: null as EditorView | null }
  const onContentChange = vi.fn()
  const onSearchState = vi.fn()
  const props = { content: source, editorViewRef, onContentChange, onSearchState, searchQuery: 'alpha' }
  const { rerender } = render(<SourceEditor {...props} />)
  await waitFor(() => expect(editorViewRef.current).toBeTruthy())
  rerender(<SourceEditor {...props} searchRequest={{ action: 'replace', id: 1, replacement: 'alphax' }} />)
  expect(onSearchState).toHaveBeenLastCalledWith(expect.objectContaining({ error: 'Replacement exceeds the editor size limit.' }))
  expect(onContentChange).not.toHaveBeenCalled()
  expect(undo(editorViewRef.current!)).toBe(false)
})

// Exercise the public editor adapter, not a rich-text serialization or mocked editor.
afterEach(cleanup)

it.each([SourceEditor, LivePreviewEditor])('keeps authored whitespace visible with native CodeMirror wrapping', async Editor => {
  const editorViewRef = { current: null as EditorView | null }
  render(<Editor content={'plain  text\nnext   line'} editorViewRef={editorViewRef} />)
  await waitFor(() => expect(editorViewRef.current).toBeTruthy())
  expect(getComputedStyle(editorViewRef.current!.contentDOM).whiteSpace).toBe('break-spaces')
})
it('keeps note-local replacement and exact undo/redo in lossless Live Preview', async () => {
  const source = '---\r\ntitle: Keep\r\n---\r\nalpha **alpha**\n> [!note]\r> Keep this.\r\n'
  const editorViewRef = { current: null as EditorView | null }
  const onMarkdownChange = vi.fn()
  const onSearchState = vi.fn()
  const props = { content: source, editorViewRef, onMarkdownChange, onSearchState, searchQuery: 'alpha' }
  const { rerender } = render(<LivePreviewEditor {...props} />)
  await waitFor(() => expect(editorViewRef.current).toBeTruthy())
  expect(onMarkdownChange).not.toHaveBeenCalled()
  expect(onSearchState).toHaveBeenLastCalledWith({ current: 0, query: 'alpha', total: 2 })
  rerender(<LivePreviewEditor {...props} searchRequest={{ action: 'replace-all', id: 1, replacement: 'omega' }} />)
  const edited = source.replaceAll('alpha', 'omega')
  expect(onMarkdownChange).toHaveBeenLastCalledWith(edited)
  act(() => { expect(undo(editorViewRef.current!)).toBe(true) })
  expect(onMarkdownChange).toHaveBeenLastCalledWith(source)
  act(() => { expect(redo(editorViewRef.current!)).toBe(true) })
  expect(onMarkdownChange).toHaveBeenLastCalledWith(edited)
})
