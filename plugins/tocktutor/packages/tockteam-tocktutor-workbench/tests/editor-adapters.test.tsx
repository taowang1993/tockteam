import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SourceEditor,
  preserveEditorLineEndings,
  shouldAddEditorSelectionRange,
  shouldStartEditorRectangularSelection,
} from '../src/source-editor.tsx'
import { LivePreviewEditor } from '../src/live-preview-editor.tsx'

afterEach(() => {
  document.body.replaceChildren()
})

describe('CodeMirror Source editor', () => {
  it('preserves exact source, reports selections, and accepts a real edit', async () => {
    const source = '---\r\nstatus: active\r\n---\r\n# Keep\r\n'
    const onChange = vi.fn()
    const onSelection = vi.fn()
    const editorViewRef = { current: null }
    const { container } = render(
      <SourceEditor content={source} editorViewRef={editorViewRef} onContentChange={onChange} onSelectionChange={onSelection} />,
    )

    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy())
    expect(editorViewRef.current?.state.doc.toString()).toBe(source.replace(/\r\n?/gu, '\n'))
    expect(preserveEditorLineEndings(source, `${source.replace(/\r\n?/gu, '\n')}Tail`)).toBe(`${source}Tail`)
    editorViewRef.current?.dispatch({ changes: { from: editorViewRef.current.state.doc.length, insert: 'Tail' } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(`${source}Tail`))
    expect(onSelection).toHaveBeenCalled()
  })

  it('enables Tockbot-compatible additive and rectangular selections', () => {
    expect(shouldAddEditorSelectionRange({ altKey: true, shiftKey: false })).toBe(true)
    expect(shouldAddEditorSelectionRange({ altKey: true, shiftKey: true })).toBe(false)
    expect(shouldStartEditorRectangularSelection({ altKey: true, shiftKey: true, button: 0 })).toBe(true)
    expect(shouldStartEditorRectangularSelection({ altKey: false, shiftKey: false, button: 1 })).toBe(true)
    expect(shouldStartEditorRectangularSelection({ altKey: true, shiftKey: false, button: 0 })).toBe(false)
  })
})

describe('Milkdown Live Preview editor', () => {
  it('mounts one editable ProseMirror surface and keeps source untouched until edited', async () => {
    const source = '# Lesson\r\n\r\n- [ ] Review\r\n'
    const onChange = vi.fn()
    const onSelection = vi.fn()
    const { container } = render(
      <LivePreviewEditor content={source} onMarkdownChange={onChange} onSelectionChange={onSelection} />,
    )

    await waitFor(() => expect(container.querySelector('.ProseMirror')).toBeTruthy())
    expect(container.querySelector('.ProseMirror')?.textContent).toContain('Lesson')
    expect(onChange).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLElement>('.ProseMirror')?.getAttribute('contenteditable')).toBe('true')
    await waitFor(() => expect(onSelection).toHaveBeenCalled())
  })

  it('exposes a stable selection-aware widget hook without recreating the editor', async () => {
    const source = 'Before ![[Target.md]] after'
    const onWidgetState = vi.fn()
    const { container, rerender } = render(
      <LivePreviewEditor content={source} onMarkdownChange={() => {}} onWidgetState={onWidgetState} />,
    )
    await waitFor(() => expect(container.querySelector('.ProseMirror')).toBeTruthy())
    const editor = container.querySelector('.ProseMirror')
    rerender(<LivePreviewEditor content={source} onMarkdownChange={() => {}} onWidgetState={onWidgetState} />)
    expect(container.querySelector('.ProseMirror')).toBe(editor)
    expect(onWidgetState).toHaveBeenCalled()
    expect(screen.getByLabelText('Live Preview Editor')).toBeTruthy()
  })
})
