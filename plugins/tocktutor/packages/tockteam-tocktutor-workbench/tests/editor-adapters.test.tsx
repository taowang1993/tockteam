import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { undo as undoCodeMirror, redo as redoCodeMirror } from '@codemirror/commands'
import { EditorSelection } from '@codemirror/state'
import { undo as undoProseMirror, redo as redoProseMirror } from '@milkdown/prose/history'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SourceEditor,
  preserveEditorLineEndings,
  shouldAddEditorSelectionRange,
  shouldStartEditorRectangularSelection,
} from '../src/source-editor.tsx'
import { LivePreviewEditor, splitLivePreviewSource } from '../src/live-preview-editor.tsx'
import { MarkdownSlidesView, RichReadingView } from '../src/editor-surface.tsx'
import { projectEditorStaticWidgets, projectEditorWidgets } from '../src/editor-widgets.ts'
import { MAX_EDITOR_SEARCH_MATCHES } from '../src/editor-search.ts'

afterEach(() => {
  document.body.replaceChildren()
})

describe('CodeMirror Source editor', () => {
  it('uses the note text color for drawn cursors instead of the light-theme default', async () => {
    const editorViewRef = { current: null }
    const { container } = render(<SourceEditor content="Caret contrast" editorViewRef={editorViewRef} onContentChange={() => {}} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 5_000 })
    // jsdom has no cursor geometry and preserves CSS variables. Probe the real
    // editor's stylesheet; browser verification checks the drawn cursor and contrast.
    for (const className of ['cm-cursor', 'cm-dropCursor']) {
      const cursor = document.createElement('div')
      cursor.className = className
      container.querySelector('.cm-editor')!.append(cursor)
      expect(getComputedStyle(cursor).borderLeftColor).toBe('var(--tt-text)')
      cursor.remove()
    }
  })

  it('preserves exact source, reports selections, and accepts a real edit', async () => {
    const source = '---\r\nstatus: active\r\n---\r\n# Keep\r\n'
    const onChange = vi.fn()
    const onSelection = vi.fn()
    const onRenameTitle = vi.fn(async () => true)
    const editorViewRef = { current: null }
    const { container } = render(
      <SourceEditor content={source} editorViewRef={editorViewRef} onContentChange={onChange} onRenameTitle={onRenameTitle} onSelectionChange={onSelection} title="Keep" />,
    )

    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy(), { timeout: 5_000 })
    const sourceEditor = screen.getByLabelText('Markdown Source Editor')
    expect(sourceEditor.className).toContain("[&_.cm-editor]:[font:16px/1.5_'Fira_Code_VF','Fira_Code',ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation_Mono','Courier_New',monospace]")
    expect(sourceEditor.className).not.toContain('ui-sans-serif')
    expect(sourceEditor.className).toContain('[&_.cm-content]:max-w-3xl')
    expect(sourceEditor.className).toContain('[&_.cm-gutters]:hidden')
    expect(sourceEditor.className).toContain('[&_.cm-activeLine]:bg-transparent')
    expect(sourceEditor.className).toContain('[&_.cm-tock-heading-mark]:[color:light-dark(var(--tt-text),#fff)]')
    expect(sourceEditor.className).toContain('[&_.cm-tock-heading-mark_*]:!text-inherit')
    expect(sourceEditor.className).toContain('[&_.cm-tock-heading-mark]:[font-size:inherit]')
    expect(sourceEditor.className).toContain('[&_.cm-tock-heading-line_*]:no-underline')
    expect(sourceEditor.className).not.toContain('[&_.cm-tock-heading-mark]:!text-[var(--tt-muted)]')
    expect(screen.getByLabelText('Markdown Source Editor').className).toContain('[&_.cm-scroller]:leading-6')
    const title = screen.getByRole('textbox', { name: 'Note title' }) as HTMLInputElement
    expect(title.value).toBe('Keep')
    expect(title.closest('.cm-editor')).toBeNull()
    expect(container.querySelector('.cm-content')?.getAttribute('data-inline-title')).toBeNull()
    const heading = [...container.querySelectorAll('.cm-line')].find(line => line.textContent === '# Keep')
    expect(heading?.className).toContain('cm-tock-heading-line')
    expect(heading?.className).toContain('cm-tock-heading-1')
    fireEvent.change(title, { target: { value: 'Renamed' } })
    fireEvent.keyDown(title, { key: 'Enter' })
    await waitFor(() => expect(onRenameTitle).toHaveBeenCalledWith('Renamed'))
    const firstLine = source.replace(/\r\n?/gu, '\n').indexOf('status')
    editorViewRef.current?.dispatch({ selection: { anchor: firstLine, head: firstLine + 6 } })
    await waitFor(() => expect(onSelection).toHaveBeenCalledWith(expect.objectContaining({ main: { from: firstLine, to: firstLine + 6 } })))
    expect(editorViewRef.current?.state.doc.toString()).toBe(source.replace(/\r\n?/gu, '\n'))
    expect(preserveEditorLineEndings(source, `${source.replace(/\r\n?/gu, '\n')}Tail`)).toBe(`${source}Tail`)
    editorViewRef.current?.dispatch({ changes: { from: editorViewRef.current.state.doc.length, insert: 'Tail' } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(`${source}Tail`))
    expect(onSelection).toHaveBeenCalled()
  })

  it('finds, navigates, and replaces Source matches in one native undo step', async () => {
    const source = 'alpha **alpha**\r\n😀 alpha\r\n'
    const onChange = vi.fn()
    const onSearchState = vi.fn()
    const editorViewRef = { current: null }
    const { container, rerender } = render(<SourceEditor content={source} editorViewRef={editorViewRef} onContentChange={onChange} onSearchState={onSearchState} searchQuery="alpha" />)
    await waitFor(() => expect(container.querySelector('.cm-tock-find-match')).toBeTruthy(), { timeout: 5_000 })
    expect(container.querySelectorAll('.cm-tock-find-match')).toHaveLength(3)
    expect(onSearchState).toHaveBeenLastCalledWith({ current: 0, query: 'alpha', total: 3 })

    rerender(<SourceEditor content={source} editorViewRef={editorViewRef} onContentChange={onChange} onSearchState={onSearchState} searchCurrentIndex={0} searchQuery="alpha" searchRequest={{ action: 'next', id: 1 }} />)
    await waitFor(() => expect((editorViewRef.current as { state: { selection: { main: { from: number } } } }).state.selection.main.from).toBe(8))
    rerender(<SourceEditor content={source} editorViewRef={editorViewRef} onContentChange={onChange} onSearchState={onSearchState} searchCurrentIndex={1} searchQuery="alpha" searchRequest={{ action: 'replace-all', id: 2, replacement: 'omega' }} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('omega **omega**\r\n😀 omega\r\n'))
    expect((editorViewRef.current as { state: { doc: { toString(): string } } }).state.doc.toString()).toBe('omega **omega**\n😀 omega\n')
    undoCodeMirror(editorViewRef.current as never)
    expect((editorViewRef.current as { state: { doc: { toString(): string } } }).state.doc.toString()).toBe(source.replace(/\r\n/gu, '\n'))
    redoCodeMirror(editorViewRef.current as never)
    expect((editorViewRef.current as { state: { doc: { toString(): string } } }).state.doc.toString()).toBe('omega **omega**\n😀 omega\n')
  })

  it('does not partially replace a capped Replace All search', async () => {
    const source = 'x'.repeat(MAX_EDITOR_SEARCH_MATCHES + 1)
    const onChange = vi.fn()
    const onSearchState = vi.fn()
    const editorViewRef = { current: null }
    const { container, rerender } = render(<SourceEditor content={source} editorViewRef={editorViewRef} onContentChange={onChange} onSearchState={onSearchState} searchQuery="x" />)
    await waitFor(() => expect(onSearchState).toHaveBeenLastCalledWith({ current: 0, query: 'x', total: MAX_EDITOR_SEARCH_MATCHES, truncated: true }), { timeout: 15_000 })
    rerender(<SourceEditor content={source} editorViewRef={editorViewRef} onContentChange={onChange} onSearchState={onSearchState} searchCurrentIndex={0} searchQuery="x" searchRequest={{ action: 'replace-all', id: 1, replacement: 'y' }} />)
    await waitFor(() => expect(onSearchState).toHaveBeenLastCalledWith({ current: 0, error: 'Too many matches to replace all at once; narrow the query.', query: 'x', total: MAX_EDITOR_SEARCH_MATCHES, truncated: true }), { timeout: 15_000 })
    expect(onChange).not.toHaveBeenCalled()
    expect((editorViewRef.current as { state: { doc: { toString(): string } } }).state.doc.toString()).toBe(source)
    expect(container.querySelector('.cm-content')?.textContent).toBe(source)
  }, 35_000)

  it('reports an overlong search query instead of treating it as no matches', async () => {
    const onSearchState = vi.fn()
    const editorViewRef = { current: null }
    const query = 'x'.repeat(100_001)
    const { rerender } = render(<SourceEditor content="x" editorViewRef={editorViewRef} onContentChange={() => {}} onSearchState={onSearchState} searchQuery="x" />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 5_000 })
    rerender(<SourceEditor content="x" editorViewRef={editorViewRef} onContentChange={() => {}} onSearchState={onSearchState} searchQuery={query} />)
    await waitFor(() => expect(onSearchState).toHaveBeenLastCalledWith({ current: null, error: 'Search query is too long.', query, total: 0 }), { timeout: 5_000 })
  })

  it('applies an incoming selection after initial editor readiness and repeats navigation without stale requests', async () => {
    const source = '# First\n\n# Second\n\n# Third\n'
    const editorViewRef = { current: null }
    const start = source.indexOf('# Second')
    const { container, rerender } = render(
      <SourceEditor
        content={source}
        editorViewRef={editorViewRef}
        onContentChange={() => {}}
        selectionRequest={{ from: start, id: 1, to: start + '# Second'.length }}
      />,
    )
    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy(), { timeout: 5_000 })
    await waitFor(() => {
      const view = editorViewRef.current as { state: { selection: { main: { anchor: number; head: number } } } } | null
      expect(view?.state.selection.main).toMatchObject({ anchor: start, head: start + '# Second'.length })
    })

    const third = source.indexOf('# Third')
    rerender(<SourceEditor content={source} editorViewRef={editorViewRef} onContentChange={() => {}} selectionRequest={{ from: third, id: 2, to: third + '# Third'.length }} />)
    await waitFor(() => {
      const view = editorViewRef.current as { state: { selection: { main: { anchor: number; head: number } } } } | null
      expect(view?.state.selection.main).toMatchObject({ anchor: third, head: third + '# Third'.length })
    })
    rerender(<SourceEditor content={source} editorViewRef={editorViewRef} onContentChange={() => {}} selectionRequest={{ from: start, id: 1, to: start + '# Second'.length }} />)
    await new Promise(resolve => setTimeout(resolve, 0))
    const view = editorViewRef.current as { state: { selection: { main: { anchor: number; head: number } } } } | null
    expect(view?.state.selection.main).toMatchObject({ anchor: third, head: third + '# Third'.length })
  })

  it('keeps CodeMirror multicursor selections intact while reporting navigation', async () => {
    const onSelection = vi.fn()
    const editorViewRef = { current: null }
    const { container } = render(<SourceEditor content={'first\nsecond\nthird\n'} editorViewRef={editorViewRef} onContentChange={() => {}} onSelectionChange={onSelection} />)
    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy(), { timeout: 5_000 })
    const view = editorViewRef.current as { dispatch: (transaction: { selection: unknown }) => void } | null
    view?.dispatch({ selection: EditorSelection.create([EditorSelection.range(0, 5), EditorSelection.cursor(13)], 1) })
    await waitFor(() => expect(onSelection).toHaveBeenLastCalledWith({
      main: { from: 13, to: 13 },
      ranges: [{ from: 0, to: 5 }, { from: 13, to: 13 }],
    }))
  })

  it('cancels a title edit on Escape even when the resulting blur fires immediately', async () => {
    const onRenameTitle = vi.fn(async () => true)
    render(<SourceEditor content={'# Keep\n'} onRenameTitle={onRenameTitle} title="Keep" />)
    const title = await screen.findByRole('textbox', { name: 'Note title' }) as HTMLInputElement

    fireEvent.change(title, { target: { value: 'Renamed' } })
    title.focus()
    fireEvent.keyDown(title, { key: 'Escape' })
    fireEvent.blur(title)

    expect(onRenameTitle).not.toHaveBeenCalled()
    expect(title.value).toBe('Keep')
  })

  it('rejects invalid titles and restores the authoritative title after a failed rename', async () => {
    const onRenameTitle = vi.fn(async () => false)
    render(<SourceEditor content={'# Keep\n'} onRenameTitle={onRenameTitle} title="Keep" />)
    const title = await screen.findByRole('textbox', { name: 'Note title' }) as HTMLInputElement

    fireEvent.change(title, { target: { value: 'Folder/Bad' } })
    fireEvent.keyDown(title, { key: 'Enter' })
    expect(onRenameTitle).not.toHaveBeenCalled()
    expect((await screen.findByRole('alert')).textContent).toContain('path separator')
    expect(title.value).toBe('Folder/Bad')

    fireEvent.change(title, { target: { value: 'Renamed' } })
    fireEvent.blur(title)
    await waitFor(() => expect(onRenameTitle).toHaveBeenCalledWith('Renamed'))
    expect((await screen.findByRole('alert')).textContent).toContain('could not be renamed')
    expect(title.value).toBe('Keep')
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

  it('keeps Source task markers literal and editable rather than replacing them with checkboxes', async () => {
    const onChange = vi.fn()
    const source = '- [ ] Review\n- [x] Done\n'
    const editorViewRef = { current: null }
    const { container } = render(<SourceEditor content={source} editorViewRef={editorViewRef} onContentChange={onChange} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy())
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
    expect(container.querySelector('.cm-content')?.textContent).toContain('- [ ] Review')
    expect(container.querySelector('.cm-content')?.textContent).toContain('- [x] Done')
    expect(onChange).not.toHaveBeenCalled()
    editorViewRef.current?.dispatch({ changes: { from: 3, to: 4, insert: 'x' } })
    expect(onChange).toHaveBeenCalledWith('- [x] Review\n- [x] Done\n')
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

  it('does not style Markdown-like text inside fenced blocks as headings', async () => {
    const source = '```md\n# code\n```\n# Heading\n'
    const { container } = render(<SourceEditor content={source} onContentChange={() => {}} />)
    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy(), { timeout: 5_000 })
    const lines = [...container.querySelectorAll('.cm-line')]
    expect(lines.find(line => line.textContent === '# code')?.className).not.toContain('cm-tock-heading-1')
    expect(lines.find(line => line.textContent === '# Heading')?.className).toContain('cm-tock-heading-1')
  })

  it('keeps headings inside multiline comments safe and unstyled', async () => {
    const source = '%%\n\n  # Comment heading\n%%\n# Heading\n%%\n'
    const { container } = render(<SourceEditor content={source} onContentChange={() => {}} />)
    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy(), { timeout: 5_000 })
    const lines = [...container.querySelectorAll('.cm-line')]
    expect(lines.find(line => line.textContent === '  # Comment heading')?.className).not.toContain('cm-tock-heading-1')
    expect(lines.find(line => line.textContent === '# Heading')?.className).toContain('cm-tock-heading-1')
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

describe('Live Preview editor', () => {
  it('uses the native caret and preserves the editing position across focus changes', { timeout: 15_000 }, async () => {
    const onMarkdownChange = vi.fn()
    const editorViewRef = { current: null as any }
    const { container } = render(<><button>Outside the Editor</button><LivePreviewEditor content="Plain text and `code`." onMarkdownChange={onMarkdownChange} editorViewRef={editorViewRef} /></>)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 10_000 })
    const editor = container.querySelector<HTMLElement>('.ProseMirror')!
    editor.focus()
    expect(editor.classList.contains('virtual-cursor-enabled')).toBe(false)
    const selection = editorViewRef.current.state.selection.toJSON()
    screen.getByRole('button', { name: 'Outside the Editor' }).focus()
    expect(document.activeElement).not.toBe(editor)
    expect(container.querySelector('.prosemirror-virtual-cursor')).toBeNull()
    editor.focus()
    expect(document.activeElement).toBe(editor)
    expect(editorViewRef.current.state.selection.toJSON()).toEqual(selection)
    expect(onMarkdownChange).not.toHaveBeenCalled()
  })

  it('validates, cancels and recovers an inline Live Preview note rename without changing Markdown', async () => {
    const onRenameTitle = vi.fn(async () => false)
    const onMarkdownChange = vi.fn()
    render(<LivePreviewEditor content={'# Markdown Rendering Lab\n'} onMarkdownChange={onMarkdownChange} onRenameTitle={onRenameTitle} title="Welcome" />)
    const title = await screen.findByRole('textbox', { name: 'Note title' }) as HTMLInputElement
    fireEvent.change(title, { target: { value: 'Folder/Bad' } })
    fireEvent.keyDown(title, { key: 'Enter' })
    expect(screen.getByRole('alert').textContent).toContain('path separator')
    expect(onRenameTitle).not.toHaveBeenCalled()
    fireEvent.change(title, { target: { value: 'Canceled' } })
    title.focus()
    fireEvent.keyDown(title, { key: 'Escape' })
    expect(title.value).toBe('Welcome')
    fireEvent.change(title, { target: { value: 'New Lesson' } })
    fireEvent.blur(title)
    // Capture the current note before the click that caused blur can navigate away.
    expect(onRenameTitle).toHaveBeenCalledExactlyOnceWith('New Lesson')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be renamed'))
    expect(title.value).toBe('Welcome')
    expect(onMarkdownChange).not.toHaveBeenCalled()
  })

  it('keeps filename renaming available when the body starts with the same heading', async () => {
    const onMarkdownChange = vi.fn()
    render(<LivePreviewEditor content={'# Welcome\n'} onMarkdownChange={onMarkdownChange} onRenameTitle={async () => true} title="Welcome" />)
    expect((await screen.findByRole('textbox', { name: 'Note title' }) as HTMLInputElement).value).toBe('Welcome')
    expect(onMarkdownChange).not.toHaveBeenCalled()
  })

  it.each(['reading', 'live'])('shows a repeated article title only once without changing Markdown in %s mode', { timeout: 15_000 }, async mode => {
    const title = '关于DeepSeek最新V4模型，普通人可以知道的6件事'
    const heading = '关于 DeepSeek 最新 V4 模型，普通人可以知道的6件事'
    const source = `---\r\nstatus: active\r\n---\r\n\r\n# ${heading} ###\r\n\r\nArticle text.\r\n`
    const onMarkdownChange = vi.fn()
    const { container } = render(mode === 'reading'
      ? <RichReadingView source={source} onToggleTask={() => {}} title={title} />
      : <LivePreviewEditor content={source} onMarkdownChange={onMarkdownChange} title={title} />)
    await waitFor(() => expect(container.querySelector(mode === 'reading' ? 'article h1' : '.ProseMirror h1')?.textContent).toBe(heading), { timeout: 10_000 })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByLabelText('Document Properties').textContent).toContain('statusactive')
    expect(onMarkdownChange).not.toHaveBeenCalled()
  })

  it.each(['Body text.', '# Different Heading\n', '```md\n# Article\n```', '    # Article', 'Introduction.\n\n# Article'])('keeps the filename title when the opening body does not repeat it: %s', source => {
    render(<RichReadingView source={source} onToggleTask={() => {}} title="Article" />)
    expect(screen.getAllByRole('heading', { level: 1, name: 'Article' })[0]?.closest('header')).not.toBeNull()
  })

  it('preserves frontmatter and presents Obsidian-style tag properties', async () => {
    const source = '---\r\nstatus: active\r\ntags: [one, two]\r\n---\r\n# Lesson\r\n'
    const onSetProperty = vi.fn(() => true)
    expect(splitLivePreviewSource(source)).toEqual({
      body: '# Lesson\n',
      prefix: '---\nstatus: active\ntags: [one, two]\n---\n',
    })
    render(<LivePreviewEditor content={source} onMarkdownChange={() => {}} onSetProperty={onSetProperty} title="Lesson note" />)
    const title = screen.getByRole('heading', { level: 1, name: 'Lesson note' })
    const propertiesHeading = screen.getByRole('heading', { level: 2, name: 'Properties' })
    expect(title.compareDocumentPosition(propertiesHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect((screen.getByLabelText('Property status') as HTMLInputElement).value).toBe('active')
    const tagsTerm = screen.getByText('tags').closest('dt')!
    expect(tagsTerm.querySelector('.lucide-tags')).toBeTruthy()
    expect(tagsTerm.parentElement?.querySelector('dd')?.textContent).toContain('onetwo')
    expect(screen.getByText('one').parentElement?.className).toContain('var(--dsw-specific-markdown-accent)_10%')
    expect(screen.getByText('one').parentElement?.className).toContain('text-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_85%,var(--tt-text))]')
    fireEvent.click(screen.getByRole('button', { name: 'Remove one from tags' }))
    expect(onSetProperty).toHaveBeenCalledWith('tags', ['two'])
  })

  it.each(['reading', 'live'])('folds document properties without changing note content in %s mode', mode => {
    const source = '---\nstatus: active\ntags: [one, two]\n---\n# Lesson\n'
    const onSetProperty = vi.fn(() => true)
    const onAddProperty = vi.fn(() => true)
    const onMarkdownChange = vi.fn()
    const view = (content: string) => mode === 'reading'
      ? <RichReadingView source={content} onAddProperty={onAddProperty} onSetProperty={onSetProperty} onToggleTask={() => {}} title="Lesson note" />
      : <LivePreviewEditor content={content} onAddProperty={onAddProperty} onSetProperty={onSetProperty} onMarkdownChange={onMarkdownChange} title="Lesson note" />
    const { rerender } = render(view(source))
    const disclosure = screen.getByRole('button', { name: 'Properties', exact: true })
    const content = document.getElementById(disclosure.getAttribute('aria-controls')!)!
    expect(disclosure.getAttribute('aria-expanded')).toBe('true')
    expect(content.hidden).toBe(false)
    fireEvent.click(disclosure)
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    expect(content.hidden).toBe(true)
    expect(screen.queryByRole('button', { name: 'Add Property' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove one tag' })).toBeNull()
    rerender(view(source.replace('active', 'review')))
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(disclosure)
    expect(content.hidden).toBe(false)
    if (mode === 'reading') expect(screen.getByLabelText('Document Properties').textContent).toContain('statusreview')
    else expect((screen.getByLabelText('Property status') as HTMLInputElement).value).toBe('review')
    expect(screen.getByRole('button', { name: mode === 'reading' ? 'Remove one tag' : 'Remove one from tags' })).toBeTruthy()
    expect(onSetProperty).not.toHaveBeenCalled()
    expect(onAddProperty).not.toHaveBeenCalled()
    expect(onMarkdownChange).not.toHaveBeenCalled()
  })

  it('preserves an unfinished property name while its section is folded', () => {
    const onAddProperty = vi.fn(() => true)
    render(<RichReadingView source={'---\nstatus: active\n---\n# Lesson\n'} onAddProperty={onAddProperty} onToggleTask={() => {}} title="Lesson note" />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Property' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Property Name' }), { target: { value: 'effort' } })
    fireEvent.click(screen.getByRole('button', { name: 'Properties', exact: true }))
    expect(screen.queryByRole('textbox', { name: 'Property Name' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Properties', exact: true }))
    expect((screen.getByRole('textbox', { name: 'Property Name' }) as HTMLInputElement).value).toBe('effort')
    fireEvent.submit(screen.getByRole('form', { name: 'Add Property' }))
    expect(onAddProperty).toHaveBeenCalledExactlyOnceWith('effort')
  })

  it('adds a validated property from Live Preview without overwriting an existing key', () => {
    const onAddProperty = vi.fn(() => true)
    render(<LivePreviewEditor content={'---\nstatus: active\n---\n# Lesson\n'} onAddProperty={onAddProperty} onMarkdownChange={() => {}} title="Lesson note" />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Property' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Property Name' }), { target: { value: 'effort' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Add Property' }))
    expect(onAddProperty).toHaveBeenCalledWith('effort')
    expect(screen.queryByRole('form', { name: 'Add Property' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Add Property' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Property Name' }), { target: { value: 'STATUS' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Add Property' }))
    expect(screen.getByRole('alert').textContent).toContain('already exists')
    expect(onAddProperty).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByRole('form', { name: 'Add Property' }), { key: 'Escape' })
    expect(screen.queryByRole('form', { name: 'Add Property' })).toBeNull()
  })

  it('adds a property from Reading View with existing frontmatter', () => {
    const onAddProperty = vi.fn(() => true)
    render(<RichReadingView onAddProperty={onAddProperty} onToggleTask={() => {}} source={'---\nstatus: active\n---\n# Lesson\n'} title="Lesson note" />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Property' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Property Name' }), { target: { value: 'area' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Add Property' }))
    expect(onAddProperty).toHaveBeenCalledWith('area')
  })

  it('does not render property controls for an empty note without frontmatter', () => {
    const onAddProperty = vi.fn(() => true)
    render(<LivePreviewEditor content="" onAddProperty={onAddProperty} onMarkdownChange={() => {}} title="Untitled" />)

    expect(screen.queryByRole('heading', { level: 2, name: 'Properties' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Property' })).toBeNull()
  })

  it.each(['# Lesson\n', '---\n---\n', '---\n# Metadata later\n---\n# Lesson\n'])('keeps plain notes free of empty property controls: %s', source => {
    render(<LivePreviewEditor content={source} onAddProperty={() => true} onMarkdownChange={() => {}} title="Untitled" />)

    expect(screen.queryByRole('heading', { name: 'Properties' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Property' })).toBeNull()
  })

  it('renders boolean properties as checkboxes and brackets footnote references in Reading View', () => {
    render(<RichReadingView onToggleTask={() => {}} source={'---\nfavorite: true\n---\nInline footnote.[^proof]\n\n[^proof]: Footnote text.\n'} title="Welcome" />)

    const favorite = screen.getByRole('checkbox', { name: 'favorite' })
    expect(favorite.getAttribute('data-state')).toBe('checked')
    expect(favorite.getAttribute('aria-checked')).toBe('true')
    expect(favorite.hasAttribute('disabled')).toBe(true)
    expect(favorite.className).toContain('data-[state=checked]:!bg-[var(--dsw-specific-markdown-accent)]')
    expect(favorite.className).toContain('data-[state=checked]:!text-[#000]')
    expect(screen.getByRole('link', { name: '[1]' }).textContent).toBe('[1]')
  })

  it('mounts one editable Markdown surface and keeps source untouched until edited', { timeout: 20_000 }, async () => {
    const source = '# Lesson\r\n\r\n- [ ] Review\r\n'
    const onChange = vi.fn()
    const { container } = render(<LivePreviewEditor content={source} onMarkdownChange={onChange} />)
    await waitFor(() => expect(container.querySelector('.ProseMirror[contenteditable="true"]')).toBeTruthy(), { timeout: 15_000 })
    expect(container.querySelector('.ProseMirror')?.textContent).toContain('Lesson')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps focused body headings free of decorative hashes without changing Markdown or the filename', async () => {
    const source = '# First\n\n## Second\n\n### Third\n\n#### Fourth\n\n##### Fifth\n\n###### Sixth\n\nBody text.\n'
    const onChange = vi.fn()
    const editorViewRef = { current: null as any }
    const { container } = render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} onRenameTitle={async () => true} title="Comparison" />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 10_000 })
    const view = editorViewRef.current
    const original = view.state.doc.toJSON()
    const headings: number[] = []
    view.state.doc.descendants((node: any, pos: number) => { if (node.type.name === 'heading') headings.push(pos) })
    for (const [index, pos] of headings.entries()) {
      act(() => {
        view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.create(view.state.doc, pos + 1)))
        view.focus()
      })
      expect(container.querySelectorAll('[data-heading-mark]')).toHaveLength(0)
      expect(container.querySelector(`.ProseMirror h${index + 1}`)?.textContent).toBe(view.state.selection.$head.parent.textContent)
      expect(view.state.doc.toJSON()).toEqual(original)
    }
    const title = screen.getByRole('textbox', { name: 'Note title' }) as HTMLInputElement
    act(() => title.focus())
    expect(container.querySelector('.ProseMirror-focused [data-heading-mark]')).toBeNull()
    expect(title.closest('[data-heading-mark]')).toBeNull()
    expect(title.value).toBe('Comparison')
    expect(onChange).not.toHaveBeenCalled()
    act(() => {
      view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.create(view.state.doc, headings[0]! + 1)))
      view.focus()
      view.dispatch(view.state.tr.insertText('Edited '))
    })
    await waitFor(() => expect(onChange.mock.lastCall?.[0]).toContain('# Edited First'))
    expect(onChange.mock.lastCall?.[0]).not.toContain('# #')
    act(() => view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.atEnd(view.state.doc))))
    expect(container.querySelector('[data-heading-mark]')).toBeNull()
  })

  it.each([[1, 2], [3, 1], [2, 2], [1, 3], [2, 4], [3, 5], [0, 6]])('sets heading level %s to %s with leading hashes and Space', async (originalLevel, level) => {
    const prefix = '---\nstatus: active\n---\n'
    const source = `${prefix}${originalLevel ? '#'.repeat(originalLevel) + ' ' : ''}健康 **Lesson**\n\nBody.\n`
    const onChange = vi.fn()
    const editorViewRef = { current: null as any }
    const { container } = render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 10_000 })
    const view = editorViewRef.current
    const count = view.state.doc.childCount
    act(() => {
      view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.create(view.state.doc, 1)))
      view.dispatch(view.state.tr.insertText('#'.repeat(level)))
    })
    expect(view.state.doc.firstChild.type.name).toBe(originalLevel ? 'heading' : 'paragraph')
    expect(view.state.doc.firstChild.textContent).toBe(`${'#'.repeat(level)}健康 Lesson`)
    act(() => {
      const { from, to } = view.state.selection
      expect(view.someProp('handleTextInput', (handler: any) => handler(view, from, to, ' '))).toBe(true)
    })
    expect(container.querySelector(`.ProseMirror > h${level}`)?.textContent).toBe('健康 Lesson')
    expect(container.querySelector(`.ProseMirror > h${level} strong`)?.textContent).toBe('Lesson')
    expect(view.state.doc.childCount).toBe(count)
    expect(view.state.selection.$from.parentOffset).toBe(0)
    const converted = `${prefix}${'#'.repeat(level)} 健康 **Lesson**\n\nBody.\n`
    expect(onChange.mock.lastCall?.[0]).toBe(converted)
    act(() => { expect(undoProseMirror(view.state, view.dispatch)).toBe(true) })
    expect(onChange.mock.lastCall?.[0]).toBe(source)
    act(() => { expect(redoProseMirror(view.state, view.dispatch)).toBe(true) })
    expect(onChange.mock.lastCall?.[0]).toBe(converted)
  })

  it('Enter keeps literal hashes in the heading and splits following text into a paragraph', async () => {
    const onChange = vi.fn()
    const editorViewRef = { current: null as any }
    const { container } = render(<LivePreviewEditor content={'# 健康\n\nBody.\n'} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 10_000 })
    const view = editorViewRef.current
    act(() => {
      view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.create(view.state.doc, 1)))
      view.dispatch(view.state.tr.insertText('##'))
      view.focus()
    })
    fireEvent.keyDown(view.dom, { key: 'Enter', code: 'Enter' })
    expect(container.querySelector('.ProseMirror > h1')?.textContent).toBe('##')
    expect(container.querySelector('.ProseMirror > h1 + p')?.textContent).toBe('健康')
    expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
    expect(view.state.selection.$from.parentOffset).toBe(0)
    expect(onChange.mock.lastCall?.[0]).toBe('# #\\#\n\n健康\n\nBody.\n')
  })

  it.each([
    ['# Lesson\n\nBody.\n', 1, '#######'],
    ['# Lesson\n\nBody.\n', 4, '##'],
    ['```text\nLesson\n```\n', 1, '##'],
  ])('leaves non-shortcut hashes literal in %s at %s', async (source, position, hashes) => {
    const editorViewRef = { current: null as any }
    render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={() => {}} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 10_000 })
    const view = editorViewRef.current
    act(() => {
      view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.create(view.state.doc, position)))
      view.dispatch(view.state.tr.insertText(hashes))
    })
    const before = view.state.doc.toJSON()
    const { from, to } = view.state.selection
    expect(view.someProp('handleTextInput', (handler: any) => handler(view, from, to, ' '))).toBeFalsy()
    expect(view.state.doc.toJSON()).toEqual(before)
  })

  it('Shift+Enter keeps a line break inside the heading', async () => {
    const editorViewRef = { current: null as any }
    const { container } = render(<LivePreviewEditor content={'# Lesson\n\nBody.\n'} editorViewRef={editorViewRef} onMarkdownChange={() => {}} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 10_000 })
    const view = editorViewRef.current
    act(() => {
      view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.create(view.state.doc, 4)))
      view.focus()
    })
    fireEvent.keyDown(view.dom, { key: 'Enter', code: 'Enter', shiftKey: true })
    expect(container.querySelector('.ProseMirror > h1 br')).toBeTruthy()
    expect(container.querySelector('.ProseMirror > h1')?.textContent).toBe('Lesson')
    expect(view.state.selection.$from.parent.type.name).toBe('heading')
  })

  it('finds formatted Live Preview text and replaces it with one native undo step', async () => {
    const source = 'alpha **alpha**\r\n'
    const onChange = vi.fn()
    const onSearchState = vi.fn()
    const editorViewRef = { current: null as any }
    const { container, rerender } = render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} onSearchState={onSearchState} searchQuery="alpha" />)
    await waitFor(() => expect(container.querySelectorAll('.tocktutor-find-match')).toHaveLength(2), { timeout: 15_000 })
    expect(onSearchState).toHaveBeenLastCalledWith({ current: 0, query: 'alpha', total: 2 })
    rerender(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} onSearchState={onSearchState} searchCurrentIndex={0} searchQuery="alpha" searchRequest={{ action: 'replace-all', id: 1, replacement: 'omega' }} />)
    await waitFor(() => expect(onChange.mock.lastCall?.[0]).toContain('omega **omega**'))
  })

  it('uses readable document typography and Obsidian-style blockquotes in both preview modes', async () => {
    const live = render(<LivePreviewEditor content={'> Quoted lesson\n'} onMarkdownChange={() => {}} />)

    await waitFor(() => expect(live.container.querySelector('blockquote')).toBeTruthy(), { timeout: 5_000 })
    const liveSurface = screen.getByLabelText('Live Preview Editor')
    expect(liveSurface.className).toContain('tocktutor-crepe-editor')
    live.unmount()

    render(<RichReadingView source={'> Quoted lesson\n'} onToggleTask={() => {}} title="Quote" />)
    const readingSurface = screen.getByLabelText('Reading View').querySelector<HTMLElement>('.tocktutor-reading')!
    expect(readingSurface.querySelector('blockquote')?.textContent).toBe('Quoted lesson')
    expect(readingSurface.className).toContain('text-base')
    expect(readingSurface.className).toContain('[&_blockquote]:border-l-2')
    expect(readingSurface.className).toContain('[&_blockquote]:pl-6')
    expect(readingSurface.className).toContain('[&_ul:not(.task-list)]:list-disc')
    expect(readingSurface.className).toContain('[&_code]:bg-[var(--dsw-specific-markdown-inline-code)]')
    expect(readingSurface.className).toContain('[&_code]:rounded-sm')
    expect(readingSurface.className).toContain('[&_code]:py-0.5')
    expect(readingSurface.className).toContain('[&_pre_code]:p-0')
  })

  it('styles tinted callouts and isolates browser Mermaid in Reading View', () => {
    render(<RichReadingView source={'> [!tip] Study tip\n> Keep this nearby.\n\n```mermaid\ngraph TD; A[Start]-->B[Finish]\n```\n'} onToggleTask={() => {}} title="Reading" />)
    const readingSurface = screen.getByLabelText('Reading View').querySelector<HTMLElement>('.tocktutor-reading')!
    expect(readingSurface.querySelector('.callout')?.getAttribute('data-callout')).toBe('tip')
    expect(readingSurface.className).toContain('[&_.callout]:border')
    expect(readingSurface.className).toContain('[&_.callout]:bg-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_10%,var(--tt-panel))]')
    expect(readingSurface.querySelector('figure.mermaid pre')?.textContent).toContain('A[Start]-->B[Finish]')
    expect(readingSurface.querySelector('svg')).toBeNull()
    expect(document.querySelector('iframe[sandbox="allow-scripts"]')?.parentElement).toBe(document.body)
    expect(readingSurface.className).toContain('[&_.mermaid-edge-path]:stroke-[var(--dsw-specific-markdown-accent)]')
    expect(readingSurface.className).toContain('[&_.mermaid-node-shape]:fill-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_12%,var(--tt-panel))]')
  })

  it('renders resolved local media and note embeds without raw source markers in Reading View', () => {
    const mediaSource = '![[../Attachments/pixel.png|16x16]]'
    render(
      <RichReadingView
        embeds={[
          {
            content: 'iVBORw0KGgo=',
            mimeType: 'image/png',
            target: { display: '16x16', fragment: null, kind: 'media', path: 'Attachments/pixel.png', source: mediaSource },
          },
          {
            content: '# Included note\n\nRendered from the Host.\n',
            target: { display: null, fragment: null, kind: 'note', path: 'Notes/Included.md', source: '![[Included.md]]' },
          },
        ]}
        onToggleTask={() => {}}
        source={`Before\n\n${mediaSource}\n\n![[Included.md]]\n\nAfter\n`}
        title="Embeds"
      />,
    )

    const reading = screen.getByLabelText('Reading View')
    expect(reading.textContent).not.toContain(mediaSource)
    expect(reading.textContent).not.toContain('![[Included.md]]')
    expect(reading.querySelector('.tocktutor-reading img[alt="16x16"][height="16"][width="16"][src="data:image/png;base64,iVBORw0KGgo="]')).toBeTruthy()
    expect(reading.querySelector('.tocktutor-reading [data-embed-kind="note"]')).toBeTruthy()
    expect(reading.querySelector('[aria-label="Resolved Embeds"]')).toBeNull()
    expect(reading.textContent).toContain('Rendered from the Host.')
  })

  it('presents wikilinks without source brackets and shares Reading View link styling', async () => {
    const live = render(<LivePreviewEditor content={'Review [[Welcome]] and [[Guide|start here]].\n'} onMarkdownChange={() => {}} />)

    await waitFor(() => expect(live.container.querySelectorAll('.tocktutor-inline-preview a.internal-link')).toHaveLength(2), { timeout: 10_000 })
    expect([...live.container.querySelectorAll('.tocktutor-inline-preview a.internal-link')].map(link => link.textContent)).toEqual(['Welcome', 'start here'])
    live.unmount()

    render(<RichReadingView source={'Review [[Welcome]].\n'} onToggleTask={() => {}} title="Links" />)
    const readingSurface = screen.getByLabelText('Reading View').querySelector<HTMLElement>('.tocktutor-reading')!
    expect(readingSurface.querySelector('a.internal-link')?.textContent).toBe('Welcome')
    expect(readingSurface.className).toContain('[&_a]:underline')
    expect(readingSurface.className).not.toContain('[&_a.internal-link]:no-underline')
    expect(readingSurface.className).toContain('[&_a]:text-[var(--dsw-specific-markdown-accent)]')
    expect(readingSurface.className).toContain('[&_mark]:text-inherit')
  })

  it('opens a Reading View wikilink through its resolved-target callback', () => {
    const onOpenInternalLink = vi.fn()
    render(<RichReadingView onOpenInternalLink={onOpenInternalLink} onToggleTask={() => {}} source={'Review [[Alias Target#Details|the alias note]].\n'} title="Links" />)

    fireEvent.click(screen.getByRole('link', { name: 'the alias note' }))
    expect(onOpenInternalLink).toHaveBeenCalledWith('Alias Target#Details')
  })

  it('renders highlights and nested lists with compact Live Preview flow', async () => {
    const { container } = render(<LivePreviewEditor content={'Read ==carefully==.\n\n1. First\n2. Second\n   - Nested\n'} onMarkdownChange={() => {}} />)

    await waitFor(() => expect(container.querySelector('.tocktutor-inline-preview mark')?.textContent).toBe('carefully'), { timeout: 10_000 })
    expect(container.querySelector('.ProseMirror')?.textContent).toContain('Nested')
    expect(screen.getByLabelText('Live Preview Editor').className).toContain('tocktutor-crepe-editor')
  })

  it('renders compact Obsidian-style task rows in Live Preview', { timeout: 15_000 }, async () => {
    const onChange = vi.fn()
    const { container } = render(<LivePreviewEditor content={'- [x] Done\n- [ ] Next\n'} onMarkdownChange={onChange} />)

    await waitFor(() => expect(container.querySelectorAll('.ProseMirror [role="checkbox"]')).toHaveLength(2), { timeout: 10_000 })
    const tasks = container.querySelectorAll<HTMLElement>('.ProseMirror [role="checkbox"]')
    expect(tasks[0]?.getAttribute('aria-checked')).toBe('true')
    expect(tasks[1]?.getAttribute('aria-checked')).toBe('false')
    expect(tasks[1]?.tabIndex).toBe(0)
    fireEvent.keyDown(tasks[1]!, { key: ' ' })
    await waitFor(() => expect(onChange.mock.lastCall?.[0]).toContain('[x] Next'))
  })

  it('keeps consecutive authored lines separate in Live Preview without changing the note', async () => {
    const source = 'A soft line ends here.\nThis sentence follows without a blank line.\n'
    const onChange = vi.fn()
    const editorViewRef = { current: null as any }
    const { container } = render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await waitFor(() => expect(container.querySelector('.ProseMirror p')?.textContent).toContain('This sentence follows'), { timeout: 10_000 })
    expect(container.querySelector('.ProseMirror p br')).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
    const view = editorViewRef.current
    act(() => view.dispatch(view.state.tr.insertText('!', 1 + 'A soft line ends here.'.length)))
    await waitFor(() => expect(onChange.mock.lastCall?.[0]).toContain('A soft line ends here.!\nThis sentence follows'))
  })

  it('keeps an authored divider between its paragraphs and heading in Live Preview', async () => {
    const source = 'This sentence follows without a blank line.\n\n---\n\n#### Small Heading\n'
    const onChange = vi.fn()
    const { container } = render(<LivePreviewEditor content={source} onMarkdownChange={onChange} />)
    await waitFor(() => expect(container.querySelector('.ProseMirror hr')?.previousElementSibling?.textContent).toContain('This sentence follows'), { timeout: 10_000 })
    expect(container.querySelector('.ProseMirror hr')?.nextElementSibling?.textContent).toBe('Small Heading')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows Mermaid in Live Preview without changing the authored fence, and exposes source on activation', async () => {
    const source = '```mermaid\nsequenceDiagram\n  Alice->>Bob: Hello\n```\n\nAfter\n'
    const onChange = vi.fn()
    const { container } = render(<LivePreviewEditor content={source} onMarkdownChange={onChange} />)
    const figure = await waitFor(() => {
      const value = container.querySelector<HTMLElement>('.milkdown-code-block figure.mermaid')
      expect(value?.dataset.mermaidSource).toContain('Alice->>Bob')
      return value!
    }, { timeout: 10_000 })
    const block = figure.closest<HTMLElement>('.milkdown-code-block')!
    await waitFor(() => expect(document.querySelector('iframe[sandbox="allow-scripts"]')).toBeTruthy())
    figure.parentElement!.remove() // Crepe may replace the Vue-owned code-block children after mounting.
    const restored = await waitFor(() => {
      const current = block.querySelector('figure.mermaid')
      expect(current).toBeTruthy()
      expect(current).not.toBe(figure)
      return current!
    })
    const root = container.querySelector<HTMLElement>('.tocktutor-crepe-editor')!
    root.style.setProperty('--tt-panel', '#151517')
    root.style.setProperty('--tt-text', '#f9fafb')
    root.style.setProperty('--dsw-specific-markdown-accent', '#a68af9')
    const frame = document.querySelector<HTMLIFrameElement>('iframe[sandbox="allow-scripts"]')!
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    const send = (data: object) => window.dispatchEvent(new MessageEvent('message', { data, origin: 'null', source: frame.contentWindow }))
    act(() => { send({ channel: 'tocktutor-mermaid', ready: true }) })
    const request = post.mock.calls.filter(([value]) => (value as { source?: string }).source?.includes('Alice->>Bob')).at(-1)?.[0] as { id: number } | undefined
    expect(request?.id).toBeTypeOf('number')
    act(() => { send({ channel: 'tocktutor-mermaid', id: request!.id, svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 30"><rect x="0" y="0" width="80" height="30"/><text x="10" y="20">Hello</text></svg>' }) })
    await waitFor(() => expect(block.dataset.mermaidPreview).toBe('true'))
    expect(block.querySelector<HTMLElement>('.cm-editor')?.hidden).toBe(true)
    expect(restored.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml,/u)
    fireEvent.keyDown(restored.parentElement!, { key: 'Enter' })
    expect(block.dataset.mermaidPreview).toBe('false')
    expect(block.querySelector<HTMLElement>('.cm-editor')?.hidden).toBe(false)
    expect(block.querySelector('.cm-content')?.textContent).toContain('Alice->>Bob')
    expect(onChange).not.toHaveBeenCalled()
    post.mockRestore()
  }, 15_000)

  it('changes only the authored Mermaid fence when editing its code in Live Preview', async () => {
    const source = '# Diagrams\n\n## Sequence\n```mermaid\nsequenceDiagram\n  Alice->>Bob: Hello\n```\n\n## Pie\n```mermaid\npie\n  "Cats" : 40\n```\n'
    const onChange = vi.fn()
    const editorViewRef = { current: null as any }
    render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 10_000 })
    const view = editorViewRef.current
    let end = -1
    view.state.doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'code_block' && node.textContent.includes('Alice->>Bob')) end = pos + node.nodeSize - 1
    })
    expect(end).toBeGreaterThan(0)
    act(() => { view.dispatch(view.state.tr.insertText(' Safe', end)) })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.lastCall?.[0]).toBe(source.replace('Alice->>Bob: Hello', 'Alice->>Bob: Hello Safe'))
  }, 15_000)

  it('keeps delimiter-looking code inside its Mermaid fence on save and reopen', async () => {
    const source = '# Diagram\n```mermaid\nflowchart LR\n  A --> B\n```\n\nAfter\n'
    const onChange = vi.fn(), editorViewRef = { current: null as any }
    const mounted = render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 10_000 })
    const view = editorViewRef.current
    let end = -1
    view.state.doc.descendants((node: any, pos: number) => { if (node.type.name === 'code_block') end = pos + node.nodeSize - 1 })
    act(() => { view.dispatch(view.state.tr.insertText('\n```\nStill code', end)) })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const saved = onChange.mock.lastCall![0]
    mounted.unmount()
    render(<LivePreviewEditor content={saved} editorViewRef={editorViewRef} onMarkdownChange={() => {}} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 10_000 })
    const blocks: string[] = []
    editorViewRef.current.state.doc.descendants((node: any) => { if (node.type.name === 'code_block') blocks.push(node.textContent) })
    expect(blocks).toEqual(['flowchart LR\n  A --> B\n```\nStill code'])
  }, 20_000)

  it('does not redirect an edit from an uppercase Mermaid fence to an identical lowercase fence', async () => {
    const source = '# First\n```Mermaid\nflowchart LR\n  A --> B\n```\n\n# Second\n```mermaid\nflowchart LR\n  A --> B\n```\n'
    const onChange = vi.fn(), editorViewRef = { current: null as any }
    render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 10_000 })
    const view = editorViewRef.current
    let end = -1
    view.state.doc.descendants((node: any, pos: number) => { if (node.type.name === 'code_block' && end < 0) end = pos + node.nodeSize - 1 })
    act(() => { view.dispatch(view.state.tr.insertText(' Safe', end)) })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.lastCall![0]).toBe(source.replace('A --> B', 'A --> B Safe'))
  }, 15_000)

  it('preserves CRLF line endings when editing a Mermaid fence', async () => {
    const source = '# Diagram\r\n```mermaid\r\nsequenceDiagram\r\n  A->>B: Hello\r\n```\r\n'
    const onChange = vi.fn()
    const editorViewRef = { current: null as any }
    render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 10_000 })
    const view = editorViewRef.current
    let end = -1
    view.state.doc.descendants((node: any, pos: number) => { if (node.type.name === 'code_block') end = pos + node.nodeSize - 1 })
    act(() => { view.dispatch(view.state.tr.insertText(' Safe', end)) })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.lastCall?.[0]).toBe(source.replace('A->>B: Hello', 'A->>B: Hello Safe'))
  }, 15_000)

  it('edits the selected Mermaid fence when another fence has identical text', async () => {
    const one = '```mermaid\nflowchart LR\n  A --> B\n```'
    const source = `# First\n${one}\n\n# Second\n${one}\n`
    const onChange = vi.fn()
    const editorViewRef = { current: null as any }
    render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 10_000 })
    const view = editorViewRef.current
    const positions: number[] = []
    view.state.doc.descendants((node: any, pos: number) => { if (node.type.name === 'code_block') positions.push(pos) })
    act(() => { view.dispatch(view.state.tr.insertText(' Safe', positions[1]! + view.state.doc.nodeAt(positions[1]!)!.nodeSize - 1)) })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.lastCall?.[0]).toBe(source.replace(`# Second\n${one}`, `# Second\n${one.replace('A --> B', 'A --> B Safe')}`))
  }, 15_000)

  it('never edits a Mermaid-looking example inside a longer code fence', async () => {
    const source = '# Example\n````text\n```mermaid\nflowchart LR\n  A --> B\n```\n````\n\n# Diagram\n```mermaid\nflowchart LR\n  A --> B\n```\n'
    const onChange = vi.fn()
    const editorViewRef = { current: null as any }
    render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 10_000 })
    const view = editorViewRef.current
    let last = -1
    view.state.doc.descendants((node: any, pos: number) => { if (node.type.name === 'code_block' && node.attrs.language === 'mermaid') last = pos + node.nodeSize - 1 })
    expect(last).toBeGreaterThan(0)
    act(() => { view.dispatch(view.state.tr.insertText(' Safe', last)) })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.lastCall?.[0]).toBe(source.replace('# Diagram\n```mermaid\nflowchart LR\n  A --> B', '# Diagram\n```mermaid\nflowchart LR\n  A --> B Safe'))
  }, 15_000)

  it('disposes an in-flight Mermaid frame when Live Preview switches notes', async () => {
    const onChange = vi.fn()
    const { container, rerender } = render(<LivePreviewEditor content={'```mermaid\nsequenceDiagram\n  A->>B: Old\n```\n'} key="old" onMarkdownChange={onChange} />)
    const frame = await waitFor(() => {
      const value = document.querySelector<HTMLIFrameElement>('iframe[sandbox="allow-scripts"]')
      expect(value).toBeTruthy()
      return value!
    }, { timeout: 10_000 })
    const oldWindow = frame.contentWindow
    rerender(<LivePreviewEditor content={'# New Note\n'} key="new" onMarkdownChange={onChange} />)
    await waitFor(() => expect(document.querySelector('iframe[sandbox="allow-scripts"]')).toBeNull())
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { channel: 'tocktutor-mermaid', id: 1, svg: '<svg/>' }, origin: 'null', source: oldWindow })) })
    expect(container.querySelector('figure.mermaid')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  }, 15_000)

  it('keeps offscreen Mermaid source available when CodeMirror has not mounted it', async () => {
    const source = Array.from({ length: 7 }, (_, index) => `\`\`\`mermaid\nsequenceDiagram\n  Alice->>Bob: Diagram ${index}\n\`\`\``).join('\n\n')
    const { container } = render(<LivePreviewEditor content={source} onMarkdownChange={() => {}} />)
    await waitFor(() => expect(container.querySelectorAll('.milkdown-code-block figure.mermaid')).toHaveLength(7), { timeout: 10_000 })
    expect([...container.querySelectorAll<HTMLElement>('.milkdown-code-block figure.mermaid')].map(figure => figure.dataset.mermaidSource)).toEqual(
      Array.from({ length: 7 }, (_, index) => `sequenceDiagram\n  Alice->>Bob: Diagram ${index}`),
    )
  }, 15_000)

  it('colors TypeScript tokens in a fenced Live Preview code block', async () => {
    const { container } = render(<LivePreviewEditor content={'```ts\nconst lesson = "markdown"\nconsole.log(lesson)\n```\n'} onMarkdownChange={() => {}} />)
    await waitFor(() => expect(container.querySelector('.milkdown-code-block .cm-line')).toBeTruthy(), { timeout: 10_000 })
    const keyword = [...container.querySelectorAll('.milkdown-code-block .cm-line span')].find(node => node.textContent === 'const')
    expect(keyword).toBeTruthy()
    expect(keyword?.getAttribute('class')).toBeTruthy()
  })

  it('highlights other authored fence languages and shows their full names without changing Markdown', async () => {
    for (const [fence, name, keyword] of [['python', 'Python', 'def'], ['py', 'Python', 'def'], ['rust', 'Rust', 'fn'], ['sql', 'SQL', 'SELECT']]) {
      const source = `\`\`\`${fence}\n${keyword} lesson(): pass\n\`\`\`\n`
      const onChange = vi.fn()
      const { container, unmount } = render(<LivePreviewEditor content={source} onMarkdownChange={onChange} />)
      const block = await waitFor(() => {
        const found = container.querySelector<HTMLElement>('.milkdown-code-block')
        expect(found?.querySelector('.cm-line')).toBeTruthy()
        return found!
      }, { timeout: 10_000 })
      await waitFor(() => expect(block.querySelector<HTMLElement>('.tools')?.dataset.displayLanguage).toBe(name))
      await waitFor(() => expect([...block.querySelectorAll('.cm-line span')].some(span => span.textContent === keyword && span.className)).toBe(true), { timeout: 10_000 })
      expect(block.dataset.codeLanguage).toBe(fence)
      expect(onChange).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('shows the code language and a separate Copy control, then confirms a successful copy without changing source', async () => {
    const source = '```ts\nconst lesson = "markdown"\n```\n'
    const onChange = vi.fn()
    const writeText = vi.fn().mockRejectedValueOnce(new Error('clipboard denied')).mockResolvedValue(undefined)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    try {
      const { container } = render(<LivePreviewEditor content={source} onMarkdownChange={onChange} />)
      await waitFor(() => expect(container.querySelector('.milkdown-code-block .copy-button')).toBeTruthy(), { timeout: 10_000 })
      const block = container.querySelector<HTMLElement>('.milkdown-code-block')!
      expect(block.dataset.codeLanguage).toBe('ts')
      const language = block.querySelector<HTMLButtonElement>('.language-button')!
      const copy = block.querySelector<HTMLButtonElement>('.copy-button')!
      const tools = block.querySelector<HTMLElement>('.tools')!
      await waitFor(() => expect(tools.dataset.displayLanguage).toBe('TypeScript'))
      expect(tools.getAttribute('aria-label')).toBe('TypeScript')
      expect(language.hidden).toBe(true)
      expect(copy).not.toBe(language)
      expect(copy.textContent).toContain('Copy Code')
      expect(copy.querySelector('.lucide-copy')).toBeTruthy()
      expect(copy.querySelector('.lucide-copy-check')).toBeTruthy()
      fireEvent.click(tools)
      expect(block.querySelector('.language-list')).toBeNull()
      expect(writeText).not.toHaveBeenCalled()
      copy.focus()
      fireEvent.click(copy)
      await waitFor(() => expect(consoleError).toHaveBeenCalled())
      expect(copy.dataset.copied).toBeUndefined()
      fireEvent.click(copy)
      await waitFor(() => expect(copy.dataset.copied).toBe('true'))
      expect(copy.getAttribute('aria-label')).toBe('Copied Code')
      expect(writeText).toHaveBeenCalledWith('const lesson = "markdown"')
      expect(onChange).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
      else delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard
    }
  })

  it('shows Text for an unlabelled fence instead of guessing a language', async () => {
    const source = '```\nlet lesson = "markdown"\n```\n'
    const onChange = vi.fn()
    const { container } = render(<LivePreviewEditor content={source} onMarkdownChange={onChange} />)
    await waitFor(() => expect(container.querySelector<HTMLElement>('.milkdown-code-block .tools')?.dataset.displayLanguage).toBe('Text'), { timeout: 10_000 })
    expect(container.querySelector<HTMLButtonElement>('.milkdown-code-block .language-button')?.hidden).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('places a footnote definition label immediately before its content without rewriting Markdown', async () => {
    const source = 'Text with context.[^context]\n\n[^context]: Footnotes should remain readable.\n'
    const onChange = vi.fn()
    const { container } = render(<LivePreviewEditor content={source} onMarkdownChange={onChange} />)
    await waitFor(() => expect(container.querySelector('.ProseMirror')?.textContent).toContain('Footnotes should remain readable.'), { timeout: 10_000 })
    const reference = container.querySelector<HTMLElement>('.ProseMirror sup[data-type="footnote_reference"]')!
    expect(reference.dataset.label).toBe('context')
    expect(reference.textContent).toBe('[^context]')
    const definition = container.querySelector<HTMLElement>('.ProseMirror dl[data-type="footnote_definition"]')!
    expect(definition.querySelector('dt')?.textContent).toBe('context')
    expect(definition.querySelector('dd')?.textContent).toBe('Footnotes should remain readable.')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders bordered tables without a persistent command strip', async () => {
    const { container } = render(<LivePreviewEditor content={'| Surface | Status |\n| --- | --- |\n| Editor | Ready |\n'} onMarkdownChange={() => {}} />)

    await waitFor(() => expect(container.querySelector('table')).toBeTruthy(), { timeout: 5_000 })
    expect(screen.queryByLabelText('Live Preview Table Commands')).toBeNull()
    expect(container.querySelector('th')?.textContent).toBe('Surface')
    expect(container.querySelector('td')?.textContent).toBe('Editor')
    expect(screen.getByLabelText('Live Preview Editor').className).toContain('tocktutor-crepe-editor')
  })

  it('keeps Reading tables compact and uses the same visible borders', () => {
    render(<RichReadingView source={'| Surface | Status |\n| --- | --- |\n| Editor | Ready |\n'} onToggleTask={() => {}} title="Table note" />)

    const reading = screen.getByLabelText('Reading View')
    const readingSurface = reading.querySelector<HTMLElement>('.tocktutor-reading')!
    expect(screen.getByRole('heading', { level: 1, name: 'Table note' })).toBeTruthy()
    expect(reading.querySelector('table')).toBeTruthy()
    expect(readingSurface.className).not.toContain('[&_table]:w-full')
    expect(readingSurface.className).toContain('border-[var(--dsw-alias-border-l2,var(--tt-border))]')
  })

  it('renders compact completed tasks in Reading View', () => {
    render(<RichReadingView source={'- [x] Done\n- [ ] Next\n'} onToggleTask={() => {}} title="Tasks" />)

    const reading = screen.getByLabelText('Reading View')
    expect(reading.querySelectorAll('.task-list')).toHaveLength(1)
    expect(reading.querySelector('.tocktutor-reading')?.className).toContain('[&_.task-list]:m-0')
    expect(reading.querySelector('.tocktutor-reading')?.className).toContain('[&_.task-list_li:has(input:checked)]:line-through')
  })

  it('keeps Reading View content measure and nested-list guides aligned', () => {
    render(<RichReadingView source={'1. First\n   - Nested\n'} onToggleTask={() => {}} title="Lists" />)

    const readingSurface = screen.getByLabelText('Reading View').querySelector<HTMLElement>('.tocktutor-reading')!
    expect(readingSurface.className).toContain('max-w-[700px]')
    expect(readingSurface.className).toContain('[&_h1]:text-[26px]')
    expect(readingSurface.className).toContain('[&_li>ul]:border-l')
    expect(readingSurface.className).toContain('[&_li>ol]:border-l')
  })

  it('loads external Live Preview images through the Host, never a renderer network resource', async () => {
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ mimeType: 'image/png', dataBase64: 'iVBORw0KGgo=' })))
    try {
      const editorViewRef = { current: null as any }
      const { container, unmount } = render(<LivePreviewEditor content="![Remote](https://example.com/image.png)\n" editorViewRef={editorViewRef} onMarkdownChange={() => {}} />)
      await waitFor(() => expect(container.querySelector('.ProseMirror img[src^="data:"]')).toBeTruthy())
      expect(container.querySelector('img[src^="http"]')).toBeNull()
      expect(request).toHaveBeenCalledWith('/web-clip/api/image', expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: 'https://example.com/image.png' }) }))
      expect(screen.queryByRole('button', { name: /External Image/u })).toBeNull()
      expect(container.querySelector('.ProseMirror img')?.getAttribute('src')).toMatch(/^data:/u)
      expect(request).toHaveBeenCalledTimes(1)
      const signal = request.mock.calls[0]?.[1]?.signal
      unmount()
      expect(signal?.aborted).toBe(true)
    } finally { request.mockRestore() }
  })

  it('keeps failed images local without a banner, unsafe resource, or changed source link', { timeout: 15_000 }, async () => {
    for (const response of [
      new Response(JSON.stringify({ mimeType: 'image/svg+xml', dataBase64: 'PHN2Zz4=' })),
      new Response(JSON.stringify({ mimeType: 'image/png', dataBase64: 'invalid value' })),
      new Response(null, { status: 400 }),
    ]) {
      const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
      const editorViewRef = { current: null as any }
      const { container, unmount } = render(<LivePreviewEditor content="![Remote](https://example.com/a.png)" editorViewRef={editorViewRef} onMarkdownChange={() => {}} />)
      try {
        await waitFor(() => expect(container.querySelector('.ProseMirror img')?.getAttribute('src')).toBe('data:image/png;base64,'), { timeout: 10_000 })
        expect(container.querySelector('[role="alert"]')).toBeNull()
        expect(container.querySelector('img[src^="http"], img[src^="data:image/svg"]')).toBeNull()
        const sources: string[] = []
        editorViewRef.current.state.doc.descendants(node => { if (node.attrs.src) sources.push(node.attrs.src) })
        expect(sources).toEqual(['https://example.com/a.png'])
        expect(request).toHaveBeenCalledTimes(1)
      } finally { unmount(); request.mockRestore() }
    }
  })

  it('keeps video embeds on the isolated viewer path rather than requesting image bytes', async () => {
    const onOpenExternalUrl = vi.fn()
    render(<LivePreviewEditor content="![Video](https://www.youtube.com/watch?v=NnTvZWp5Q7o)" onMarkdownChange={() => {}} onOpenExternalUrl={onOpenExternalUrl} />)
    const button = await waitFor(() => screen.getByRole('button', { name: /YouTube/u }), { timeout: 10_000 })
    fireEvent.click(button)
    expect(onOpenExternalUrl).toHaveBeenCalledExactlyOnceWith('https://www.youtube-nocookie.com/embed/NnTvZWp5Q7o')
  })

  it('opens external embeds from Slides through the isolated viewer callback', () => {
    const onOpenExternalUrl = vi.fn()
    render(<MarkdownSlidesView onOpenExternalUrl={onOpenExternalUrl} source="![Video](https://www.youtube.com/watch?v=NnTvZWp5Q7o)" />)
    fireEvent.click(screen.getByRole('button', { name: /YouTube/u }))
    expect(onOpenExternalUrl).toHaveBeenCalledWith('https://www.youtube-nocookie.com/embed/NnTvZWp5Q7o')
  })

  it('renders nested local embeds inside the Live Preview note widget', async () => {
    const noteSource = '![[Included.md]]'
    const nestedSource = '![[Attachments/nested.png|8x8]]'
    const { container } = render(
      <LivePreviewEditor
        content={`Before ${noteSource} after`}
        onMarkdownChange={() => {}}
        resolvedEmbeds={[
          { content: `# Included\n\nNested ${nestedSource}\n`, depth: 0, target: { display: null, fragment: null, kind: 'note', path: 'Included.md', source: noteSource } },
          { content: 'iVBORw0KGgo=', depth: 1, mimeType: 'image/png', parentPath: 'Included.md', target: { display: '8x8', fragment: null, kind: 'media', path: 'Attachments/nested.png', source: nestedSource } },
        ]}
      />,
    )
    const widget = await waitFor(() => {
      const value = container.querySelector<HTMLElement>('.tocktutor-live-embed-widget')
      expect(value).toBeTruthy()
      return value!
    }, { timeout: 5_000 })
    expect(widget.querySelector('img[alt="8x8"][height="8"][width="8"][src="data:image/png;base64,iVBORw0KGgo="]')).toBeTruthy()
    expect(widget.textContent).not.toContain(nestedSource)
  })
})


describe('search integrity regressions', () => {
  it('synchronizes incoming Source content before replacement and isolates adjacent history', async () => {
    const editorViewRef = { current: null }
    const onContentChange = vi.fn()
    const props = { content: 'alpha', editorViewRef, onContentChange, searchQuery: 'alpha' }
    const { rerender } = render(<SourceEditor {...props} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy())
    rerender(<SourceEditor {...props} content="alpha peer" searchRequest={{ id: 1, action: 'replace', replacement: 'omega' }} />)
    expect(onContentChange).toHaveBeenLastCalledWith('omega peer')
    const view = editorViewRef.current as any
    act(() => view.dispatch({ changes: { from: 5, insert: '!' } }))
    rerender(<SourceEditor {...props} content="alpha peer" searchQuery="omega" searchRequest={{ id: 2, action: 'replace', replacement: 'delta' }} />)
    for (const expected of ['omega! peer', 'omega peer', 'alpha peer']) {
      act(() => { expect(undoCodeMirror(view)).toBe(true) })
      expect(onContentChange).toHaveBeenLastCalledWith(expected)
    }
  })

  it('finds Reading phrases across formatting and refreshes highlights after embed-only updates', () => {
    const onSearchState = vi.fn()
    const props = { source: 'one **two**\n\n![[Other.md]]', title: 'Note', searchQuery: 'one two', onToggleTask() {}, onSearchState }
    const { container, rerender } = render(<RichReadingView {...props} />)
    expect(onSearchState).toHaveBeenLastCalledWith({ current: 0, query: 'one two', total: 1 })
    expect([...container.querySelectorAll('mark')].map(mark => mark.textContent).join('')).toBe('one two')
    rerender(<RichReadingView {...props} embeds={[{ content: 'Embedded', target: { path: 'Other.md', fragment: null, display: null, kind: 'note', source: '![[Other.md]]' } }]} />)
    expect([...container.querySelectorAll('mark')].map(mark => mark.textContent).join('')).toBe('one two')
    expect(container.querySelector('strong')?.textContent).toBe('two')
  })

  it('extends Reading queries after clearing earlier marks', () => {
    const onSearchState = vi.fn()
    const props = { source: 'alpha', title: 'Note', onToggleTask: () => {}, onSearchState }
    const { rerender, container } = render(<RichReadingView {...props} searchQuery="a" />)
    expect(onSearchState).toHaveBeenLastCalledWith({ current: 0, query: 'a', total: 2 })
    for (const query of ['al', 'alpha']) {
      rerender(<RichReadingView {...props} searchQuery={query} />)
      expect(onSearchState).toHaveBeenLastCalledWith({ current: 0, query, total: 1 })
      expect(container.querySelector('mark')?.textContent).toBe(query)
    }
  })
})


it('Source peer replacements reset native undo without emitting edits or losing selection', async () => {
  const editorViewRef = { current: null }
  const onChange = vi.fn()
  const { rerender, container } = render(<SourceEditor content="alpha" editorViewRef={editorViewRef} onContentChange={onChange} />)
  await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy())
  act(() => editorViewRef.current.dispatch({ changes: { from: 0, to: 5, insert: 'own' }, selection: { anchor: 2 } }))
  rerender(<SourceEditor content="peer" editorViewRef={editorViewRef} onContentChange={onChange} />)
  await waitFor(() => expect(editorViewRef.current.state.doc.toString()).toBe('peer'))
  expect(onChange).toHaveBeenCalledTimes(1)
  expect(undoCodeMirror(editorViewRef.current)).toBe(false)
  expect(editorViewRef.current.state.selection.main.head).toBe(2)
})

it('Source peer replacement restores active Find decorations without count or query changes', async () => {
  const editorViewRef = { current: null }
  const onChange = vi.fn()
  const props = { editorViewRef, onContentChange: onChange, searchQuery: 'alpha', searchCurrentIndex: 0 }
  const { rerender, container } = render(<SourceEditor {...props} content="alpha text" />)
  await waitFor(() => expect(container.querySelector('.cm-tock-find-current')).toBeTruthy())
  rerender(<SourceEditor {...props} content="alpha peer" />)
  await waitFor(() => expect(editorViewRef.current.state.doc.toString()).toBe('alpha peer'))
  expect(container.querySelector('.cm-tock-find-current')?.textContent).toBe('alpha')
  expect(undoCodeMirror(editorViewRef.current)).toBe(false)
  expect(onChange).not.toHaveBeenCalled()
})
