import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SourceEditor,
  preserveEditorLineEndings,
  shouldAddEditorSelectionRange,
  shouldStartEditorRectangularSelection,
} from '../src/source-editor.tsx'
import { LivePreviewEditor, splitLivePreviewSource } from '../src/live-preview-editor.tsx'
import { MarkdownSlidesView } from '../src/editor-surface.tsx'
import { projectEditorStaticWidgets, projectEditorWidgets } from '../src/editor-widgets.ts'

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

    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy(), { timeout: 5_000 })
    expect(editorViewRef.current?.state.doc.toString()).toBe(source.replace(/\r\n?/gu, '\n'))
    expect(preserveEditorLineEndings(source, `${source.replace(/\r\n?/gu, '\n')}Tail`)).toBe(`${source}Tail`)
    editorViewRef.current?.dispatch({ changes: { from: editorViewRef.current.state.doc.length, insert: 'Tail' } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(`${source}Tail`))
    expect(onSelection).toHaveBeenCalled()
  })

  it('recreates from the current source instead of the initial source', async () => {
    const editorViewRef = { current: null }
    const onChange = vi.fn()
    const { rerender } = render(<SourceEditor content="Initial" editorViewRef={editorViewRef} onContentChange={onChange} spellCheck />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 5_000 })
    editorViewRef.current?.dispatch({ changes: { from: 7, insert: ' edited' } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Initial edited'))
    rerender(<SourceEditor content="Initial edited" editorViewRef={editorViewRef} onContentChange={onChange} spellCheck={false} />)
    await waitFor(() => expect(editorViewRef.current?.state.doc.toString()).toBe('Initial edited'))
  })

  it('enables Tockbot-compatible additive and rectangular selections', () => {
    expect(shouldAddEditorSelectionRange({ altKey: true, shiftKey: false })).toBe(true)
    expect(shouldAddEditorSelectionRange({ altKey: true, shiftKey: true })).toBe(false)
    expect(shouldStartEditorRectangularSelection({ altKey: true, shiftKey: true, button: 0 })).toBe(true)
    expect(shouldStartEditorRectangularSelection({ altKey: false, shiftKey: false, button: 1 })).toBe(true)
    expect(shouldStartEditorRectangularSelection({ altKey: true, shiftKey: false, button: 0 })).toBe(false)
  })

  it('toggles a Source task through one CodeMirror transaction', async () => {
    const onChange = vi.fn()
    render(<SourceEditor content={'- [ ] Review\n'} onContentChange={onChange} />)
    const task = await screen.findByRole('checkbox', { name: 'Mark Source Task as Complete' }, { timeout: 5_000 })
    expect(task.tabIndex).toBe(0)
    fireEvent.keyDown(task, { key: ' ' })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('- [x] Review\n'))
  })

  it('renders fenced Source previews without invalid block decorations', async () => {
    const source = '```mermaid\ngraph TD; A-->B\n```\nAfter\n'
    const editorViewRef = { current: null }
    const { container } = render(<SourceEditor content={source} editorViewRef={editorViewRef} onContentChange={() => {}} />)
    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy(), { timeout: 5_000 })
    const view = editorViewRef.current as unknown as { dispatch(spec: unknown): void }
    view.dispatch({ selection: { anchor: source.length } })
    await waitFor(() => expect(container.querySelector('[aria-label="Mermaid Diagram Preview"]')).toBeTruthy())
    expect(container.querySelector('.cm-content')?.textContent).toContain('Mermaid Diagram')
  })

  it('renders resolved embed widgets without replacing their selected source', async () => {
    const source = 'Before ![[Target.md]] after'
    const { container } = render(<SourceEditor content={source} onContentChange={() => {}} resolvedEmbeds={[{
      content: '# Target\nBody\n',
      target: { display: null, fragment: null, kind: 'note', path: 'Target.md', source: '![[Target.md]]' },
    }]} />)
    const widget = await waitFor(() => {
      const value = container.querySelector<HTMLElement>('.tocktutor-source-embed-widget')
      expect(value).toBeTruthy()
      return value!
    }, { timeout: 5_000 })
    expect(widget.textContent).toContain('Target')
    fireEvent.mouseDown(widget)
    await waitFor(() => expect(container.querySelector('.cm-content')?.textContent).toContain('![[Target.md]]'))
  })
})

describe('selection-aware editor widgets', () => {
  it('hides an embed widget while its exact source range is selected', () => {
    const source = 'Before ![[Target.md]] after'
    const targetStart = source.indexOf('![[Target.md]]')
    expect(projectEditorWidgets(source)[0]).toMatchObject({ path: 'Target.md', visible: true, selected: false })
    expect(projectEditorWidgets(source, { from: targetStart, to: targetStart + 14 })[0]).toMatchObject({ visible: false, selected: true })
    expect(projectEditorWidgets('```md\n![[Target.md]]\n```')).toHaveLength(0)
    expect(projectEditorStaticWidgets('```base\nviews:\n  - type: table\n```\n$$x + 1$$\n').map(widget => widget.kind)).toEqual(['base', 'math'])
  })
})

describe('Milkdown Live Preview editor', () => {
  it('keeps frontmatter outside Milkdown serialization and presents its properties', async () => {
    const source = '---\r\nstatus: active\r\ntags: [one, two]\r\n---\r\n# Lesson\r\n'
    expect(splitLivePreviewSource(source)).toEqual({
      body: '# Lesson\n',
      prefix: '---\nstatus: active\ntags: [one, two]\n---\n',
    })
    render(<LivePreviewEditor content={source} onMarkdownChange={() => {}} />)
    expect(screen.getByLabelText('Live Preview Properties').textContent).toContain('statusactive')
  })

  it('mounts one editable ProseMirror surface and keeps source untouched until edited', async () => {
    const source = '# Lesson\r\n\r\n- [ ] Review\r\n'
    const onChange = vi.fn()
    const onSelection = vi.fn()
    const { container } = render(
      <LivePreviewEditor content={source} onMarkdownChange={onChange} onSelectionChange={onSelection} />,
    )

    await waitFor(() => expect(container.querySelector('.ProseMirror')).toBeTruthy(), { timeout: 5_000 })
    expect(container.querySelector('.ProseMirror')?.textContent).toContain('Lesson')
    expect(onChange).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLElement>('.ProseMirror')?.getAttribute('contenteditable')).toBe('true')
    await waitFor(() => expect(onSelection).toHaveBeenCalled())
  })

  it('routes external Live Preview images through the isolated viewer callback', async () => {
    const onOpenExternalUrl = vi.fn()
    const { container } = render(<LivePreviewEditor content="![Remote](https://example.com/image.png)\n" onMarkdownChange={() => {}} onOpenExternalUrl={onOpenExternalUrl} />)
    const button = await screen.findByRole('button', { name: 'External Image: Remote' }, { timeout: 5_000 })
    expect(container.querySelector('img[src^="http"]')).toBeNull()
    fireEvent.click(button)
    expect(onOpenExternalUrl).toHaveBeenCalledWith('https://example.com/image.png')
  })

  it('opens external embeds from Slides through the isolated viewer callback', () => {
    const onOpenExternalUrl = vi.fn()
    render(<MarkdownSlidesView onOpenExternalUrl={onOpenExternalUrl} source="![Video](https://www.youtube.com/watch?v=NnTvZWp5Q7o)" />)
    fireEvent.click(screen.getByRole('button', { name: /YouTube/u }))
    expect(onOpenExternalUrl).toHaveBeenCalledWith('https://www.youtube-nocookie.com/embed/NnTvZWp5Q7o')
  })

  it('exposes a stable selection-aware widget hook without recreating the editor', async () => {
    const source = 'Before ![[Target.md]] after'
    const onWidgetState = vi.fn()
    const resolvedEmbeds = [{
      content: '# Target\nBody\n',
      target: { display: null, fragment: null, kind: 'note' as const, path: 'Target.md', source: '![[Target.md]]' },
    }]
    const { container, rerender } = render(
      <LivePreviewEditor content={source} onMarkdownChange={() => {}} onWidgetState={onWidgetState} resolvedEmbeds={resolvedEmbeds} />,
    )
    await waitFor(() => expect(container.querySelector('.ProseMirror')).toBeTruthy(), { timeout: 5_000 })
    const editor = container.querySelector('.ProseMirror')
    const widget = await waitFor(() => {
      const value = container.querySelector<HTMLElement>('.tocktutor-live-embed-widget')
      expect(value).toBeTruthy()
      return value!
    })
    expect(widget.textContent).toContain('Target')
    const audio = document.createElement('audio')
    widget.append(audio)
    fireEvent.mouseDown(audio)
    expect(container.querySelector('.tocktutor-live-embed-widget')).toBe(widget)
    rerender(<LivePreviewEditor content={source} onMarkdownChange={() => {}} onWidgetState={onWidgetState} resolvedEmbeds={resolvedEmbeds} />)
    expect(container.querySelector('.ProseMirror')).toBe(editor)
    expect(onWidgetState).toHaveBeenCalled()
    fireEvent.mouseDown(widget)
    await waitFor(() => expect(container.querySelector('.tocktutor-live-embed-widget')).toBeNull())
    expect(container.querySelector('.ProseMirror')?.textContent).toContain('![[Target.md]]')
    const nextSource = 'Before ![[Second.md]] after'
    const nextEmbeds = [{
      content: '# Second\nBody\n',
      target: { display: null, fragment: null, kind: 'note' as const, path: 'Second.md', source: '![[Second.md]]' },
    }]
    rerender(<LivePreviewEditor content={nextSource} onMarkdownChange={() => {}} onWidgetState={onWidgetState} resolvedEmbeds={nextEmbeds} />)
    await waitFor(() => expect(container.querySelector('.tocktutor-live-embed-widget')?.textContent).toContain('Second'))
    expect(container.querySelector('.ProseMirror')).toBe(editor)
    expect(screen.getByLabelText('Live Preview Editor')).toBeTruthy()
  })
})
