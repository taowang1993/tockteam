import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { undo as undoCodeMirror, redo as redoCodeMirror } from '@codemirror/commands'
import { EditorSelection } from '@codemirror/state'
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
  })

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
    expect(screen.getByLabelText('Document Properties').textContent).toContain('statusactive')
    const tagsTerm = screen.getByText('tags').closest('dt')!
    expect(tagsTerm.querySelector('.lucide-tags')).toBeTruthy()
    expect(tagsTerm.parentElement?.querySelector('dd')?.textContent).toContain('onetwo')
    expect(screen.getByText('one').parentElement?.className).toContain('var(--dsw-specific-markdown-accent)_10%')
    expect(screen.getByText('one').parentElement?.className).toContain('text-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_85%,var(--tt-text))]')
    fireEvent.click(screen.getByRole('button', { name: 'Remove one tag' }))
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
    expect(screen.getByLabelText('Document Properties').textContent).toContain('statusreview')
    expect(screen.getByRole('button', { name: 'Remove one tag' })).toBeTruthy()
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
    const onSelection = vi.fn()
    const { container } = render(
      <LivePreviewEditor content={source} onMarkdownChange={onChange} onSelectionChange={onSelection} />,
    )

    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy(), { timeout: 15_000 })
    expect(container.querySelector('.cm-content')?.textContent).toContain('Lesson')
    expect(onChange).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLElement>('.cm-content')?.getAttribute('contenteditable')).toBe('true')
    await waitFor(() => expect(onSelection).toHaveBeenCalled())
  })

  it('finds formatted Live Preview text and replaces it with one native undo step', async () => {
    const source = 'alpha **alpha**\r\n'
    const onChange = vi.fn()
    const onSearchState = vi.fn()
    const editorViewRef = { current: null as any }
    const { container, rerender } = render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} onSearchState={onSearchState} searchQuery="alpha" />)
    await waitFor(() => expect(container.querySelector('.cm-tock-find-match')).toBeTruthy(), { timeout: 15_000 })
    expect(container.querySelectorAll('.cm-tock-find-match')).toHaveLength(2)
    expect(onSearchState).toHaveBeenLastCalledWith({ current: 0, query: 'alpha', total: 2 })
    rerender(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} onSearchState={onSearchState} searchCurrentIndex={0} searchQuery="alpha" searchRequest={{ action: 'replace-all', id: 1, replacement: 'omega' }} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('omega **omega**\r\n'))
    const view = editorViewRef.current
    expect(view.state.doc.toString()).toBe('omega **omega**\n')
    expect(undoCodeMirror(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('alpha **alpha**\n')
    expect(redoCodeMirror(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('omega **omega**\n')
  })

  it('publishes exact authored source around frontmatter and raw-link replacements', async () => {
    const source = '---\r\ntags: [alpha]\r\n---\r\nalpha **alpha**\r\n\r\n[[Destination]] and [Sibling](Sibling.md).\r\n'
    const onChange = vi.fn()
    const onSearchState = vi.fn()
    const editorViewRef = { current: null as any }
    const { container, rerender } = render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} onSearchState={onSearchState} searchQuery="alpha" />)
    await waitFor(() => expect(container.querySelectorAll('.cm-tock-find-match')).toHaveLength(2), { timeout: 15_000 })
    const first = source.replaceAll('alpha', 'omega')
    rerender(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} onSearchState={onSearchState} searchCurrentIndex={0} searchQuery="alpha" searchRequest={{ action: 'replace-all', id: 1, replacement: 'omega' }} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(first), { timeout: 15_000 })
    expect(onChange).not.toHaveBeenLastCalledWith(expect.stringContaining('\\[\\[Destination]]'))
    const second = first.replace('Destination', 'Renamed')
    rerender(<LivePreviewEditor content={first} editorViewRef={editorViewRef} onMarkdownChange={onChange} onSearchState={onSearchState} searchCurrentIndex={0} searchQuery="Destination" searchRequest={{ action: 'replace-all', id: 2, replacement: 'Renamed' }} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(second), { timeout: 15_000 })
    const view = editorViewRef.current
    expect(undoCodeMirror(view)).toBe(true)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(first))
    expect(undoCodeMirror(view)).toBe(true)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(source))
    expect(redoCodeMirror(view)).toBe(true)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(first))
    expect(redoCodeMirror(view)).toBe(true)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(second))
  })

  it('keeps a list folded across parent renders without changing authored Markdown', async () => {
    const source = '1. Parent\n   - Child\n'
    const onChange = vi.fn()
    const { container, rerender } = render(<LivePreviewEditor content={source} onMarkdownChange={onChange} />)
    const list = () => container.querySelector<HTMLDetailsElement>('details')
    await waitFor(() => expect(list()).toBeTruthy())
    expect(list()!.open).toBe(true)
    fireEvent.click(list()!.querySelector('summary')!)
    await waitFor(() => expect(list()!.open).toBe(false))

    rerender(<LivePreviewEditor content={source} onMarkdownChange={onChange} title="Parent rendered again" />)
    await waitFor(() => expect(list()!.open).toBe(false))
    rerender(<LivePreviewEditor content={`---\nstatus: review\n---\n${source}`} onMarkdownChange={onChange} />)
    await waitFor(() => expect(list()!.open).toBe(true))
    expect(onChange).not.toHaveBeenCalled()

    rerender(<LivePreviewEditor content={'# Updated externally\n'} onMarkdownChange={onChange} />)
    await waitFor(() => expect(container.querySelector('.cm-content')?.textContent).toContain('Updated externally'))
    expect(container.querySelector('.cm-content')?.textContent).not.toContain('Child')
    expect(container.querySelector('details')).toBeNull()
  })

  it('accepts edited Markdown echoed by the parent and later external changes', async () => {
    const source = '---\r\nstatus: draft\r\n---\r\n1. Parent\r\n   - Child\r\n'
    const onChange = vi.fn()
    const editorViewRef = { current: null as any }
    const { container, rerender } = render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await waitFor(() => expect(container.querySelector('details')).toBeTruthy())
    const view = editorViewRef.current
    const parent = source.replace(/\r\n?/gu, '\n').indexOf('Parent')
    view.dispatch({ changes: { from: parent, insert: 'Edited ' } })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const edited = onChange.mock.lastCall![0] as string
    expect(edited).toContain('Edited Parent')
    expect(edited.startsWith('---\r\nstatus: draft\r\n---\r\n')).toBe(true)
    rerender(<LivePreviewEditor content={edited} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await waitFor(() => expect(container.querySelector('details')).toBeTruthy())
    fireEvent.click(container.querySelector<HTMLDetailsElement>('details')!.querySelector('summary')!)
    await waitFor(() => expect(container.querySelector<HTMLDetailsElement>('details')!.open).toBe(false))
    rerender(<LivePreviewEditor content={edited} editorViewRef={editorViewRef} onMarkdownChange={onChange} title="Edited note" />)
    await waitFor(() => expect(container.querySelector<HTMLDetailsElement>('details')!.open).toBe(false))
    expect(screen.getByText('Edited Parent')).toBeTruthy()
    rerender(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await screen.findByText('Parent')
    expect(screen.queryByText('Edited Parent')).toBeNull()
  })

  it('uses readable document typography and Obsidian-style blockquotes in both preview modes', async () => {
    const live = render(<LivePreviewEditor content={'> Quoted lesson\n'} onMarkdownChange={() => {}} />)

    await waitFor(() => expect(live.container.querySelector('blockquote')).toBeTruthy(), { timeout: 5_000 })
    const liveSurface = screen.getByLabelText('Live Preview Editor')
    expect(liveSurface.className).toContain('tocktutor-live-preview-styles')
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

  it('styles tinted callouts and readable Mermaid SVGs in Reading View', () => {
    render(<RichReadingView source={'> [!tip] Study tip\n> Keep this nearby.\n\n```mermaid\ngraph TD; A[Start]-->B[Finish]\n```\n'} onToggleTask={() => {}} title="Reading" />)
    const readingSurface = screen.getByLabelText('Reading View').querySelector<HTMLElement>('.tocktutor-reading')!
    expect(readingSurface.querySelector('.callout')?.getAttribute('data-callout')).toBe('tip')
    expect(readingSurface.className).toContain('[&_.callout]:border')
    expect(readingSurface.className).toContain('[&_.callout]:bg-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_10%,var(--tt-panel))]')
    expect(readingSurface.querySelector('svg.mermaid-svg')).toBeTruthy()
    expect(readingSurface.querySelector('.mermaid-node-label')?.textContent).toBe('Start')
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

    await waitFor(() => expect(live.container.querySelectorAll('.cm-live-internal-link')).toHaveLength(2), { timeout: 5_000 })
    expect([...live.container.querySelectorAll('.cm-live-internal-link')].map(link => link.textContent)).toEqual(['Welcome', 'start here'])
    expect(live.container.querySelector('.cm-content')?.textContent).not.toContain('[[')
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

    await waitFor(() => expect(container.querySelector('.cm-live-highlight')?.textContent).toBe('carefully'), { timeout: 5_000 })
    expect(container.querySelector('.cm-content')?.textContent).not.toContain('==')
    expect(container.querySelector('.cm-content')?.textContent).toContain('Nested')
    expect(screen.getByLabelText('Live Preview Editor').className).toContain('tocktutor-live-preview-styles')
  })

  it('renders compact Obsidian-style task rows in Live Preview', async () => {
    const onChange = vi.fn()
    const { container } = render(<LivePreviewEditor content={'- [x] Done\n- [ ] Next\n'} onMarkdownChange={onChange} />)

    await waitFor(() => expect(container.querySelectorAll('input[data-live-task-from]')).toHaveLength(2), { timeout: 5_000 })
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Mark Task as Incomplete' }).checked).toBe(true)
    const next = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Mark Task as Complete' })
    expect(next.checked).toBe(false)
    fireEvent.mouseDown(next)
    fireEvent.click(next)
    expect(onChange).toHaveBeenCalledExactlyOnceWith('- [x] Done\n- [x] Next\n')
  })

  it('renders bordered tables without a persistent command strip', async () => {
    const { container } = render(<LivePreviewEditor content={'| Surface | Status |\n| --- | --- |\n| Editor | Ready |\n'} onMarkdownChange={() => {}} />)

    await waitFor(() => expect(container.querySelector('table')).toBeTruthy(), { timeout: 5_000 })
    expect(screen.queryByLabelText('Live Preview Table Commands')).toBeNull()
    expect(container.querySelector('th')?.textContent).toBe('Surface')
    expect(container.querySelector('td')?.textContent).toBe('Editor')
    expect(screen.getByLabelText('Live Preview Editor').className).toContain('tocktutor-live-preview-styles')
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
      await waitFor(() => expect(container.querySelector('img[src="data:image/png;base64,iVBORw0KGgo="]')).toBeTruthy())
      expect(container.querySelector('img[src^="http"]')).toBeNull()
      expect(request).toHaveBeenCalledWith('/web-clip/api/image', expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: 'https://example.com/image.png' }) }))
      expect(screen.queryByRole('button', { name: /External Image/u })).toBeNull()
      const image = container.querySelector<HTMLImageElement>('img.tocktutor-inline-image')!
      editorViewRef.current.dispatch({ changes: { from: 0, insert: 'Before\n\n' } })
      await waitFor(() => expect(container.querySelector('img.tocktutor-inline-image')).toBe(image))
      expect(request).toHaveBeenCalledTimes(1)
      expect(image.closest('[data-preview-from]')?.getAttribute('data-preview-from')).toBe('8')
      fireEvent.error(image)
      expect(image.dataset.loadError).toBe('true')
      expect(image.alt).toBe('Image Unavailable: Remote')
      const signal = request.mock.calls[0]?.[1]?.signal
      unmount()
      expect(signal?.aborted).toBe(true)
    } finally { request.mockRestore() }
  })

  it('rejects active and malformed image payloads without assigning an image URL', async () => {
    for (const payload of [{ mimeType: 'image/svg+xml', dataBase64: 'PHN2Zz4=' }, { mimeType: 'image/png', dataBase64: 'invalid value' }]) {
      const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload)))
      try {
        const { container, unmount } = render(<LivePreviewEditor content="![Remote](https://example.com/a.png)" onMarkdownChange={() => {}} />)
        await waitFor(() => expect(container.querySelector<HTMLImageElement>('img.tocktutor-inline-image')?.dataset.loadError).toBe('true'))
        expect(container.querySelector('img.tocktutor-inline-image')?.getAttribute('src')).toBeNull()
        unmount()
      } finally { request.mockRestore() }
    }
  })

  it('keeps video embeds on the isolated viewer path rather than requesting image bytes', async () => {
    const onOpenExternalUrl = vi.fn()
    render(<LivePreviewEditor content="![Video](https://www.youtube.com/watch?v=NnTvZWp5Q7o)" onMarkdownChange={() => {}} onOpenExternalUrl={onOpenExternalUrl} />)
    const button = await screen.findByRole('button', { name: /YouTube/u })
    fireEvent.mouseDown(button)
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
    expect(widget.getAttribute('aria-label')).toBe('Edit Preview')
    expect(widget.querySelector('img[alt="8x8"][height="8"][width="8"][src="data:image/png;base64,iVBORw0KGgo="]')).toBeTruthy()
    expect(widget.textContent).not.toContain(nestedSource)
  })

  it('exposes a stable selection-aware widget hook without recreating the editor', async () => {
    const editorViewRef = { current: null }
    const source = 'Before ![[Target.md]] after'
    const onWidgetState = vi.fn()
    const resolvedEmbeds = [{
      content: '# Target\nBody\n',
      target: { display: null, fragment: null, kind: 'note' as const, path: 'Target.md', source: '![[Target.md]]' },
    }]
    const { container, rerender } = render(
      <LivePreviewEditor editorViewRef={editorViewRef} content={source} onMarkdownChange={() => {}} onWidgetState={onWidgetState} resolvedEmbeds={resolvedEmbeds} />,
    )
    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy(), { timeout: 5_000 })
    const editor = container.querySelector('.cm-content')
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
    rerender(<LivePreviewEditor editorViewRef={editorViewRef} content={source} onMarkdownChange={() => {}} onWidgetState={onWidgetState} resolvedEmbeds={resolvedEmbeds} />)
    expect(container.querySelector('.cm-content')).toBe(editor)
    expect(onWidgetState).toHaveBeenCalled()
    fireEvent.mouseDown(widget)
    await waitFor(() => expect(container.querySelector('.tocktutor-live-embed-widget')).toBeNull())
    expect(container.querySelector('.cm-content')?.textContent).toContain('![[Target.md]]')
    const nextSource = 'Before ![[Second.md]] after'
    const nextEmbeds = [{
      content: '# Second\nBody\n',
      target: { display: null, fragment: null, kind: 'note' as const, path: 'Second.md', source: '![[Second.md]]' },
    }]
    rerender(<LivePreviewEditor editorViewRef={editorViewRef} content={nextSource} onMarkdownChange={() => {}} onWidgetState={onWidgetState} resolvedEmbeds={nextEmbeds} />)
    // Peer replacements retain this view's revealed-source selection. Move the
    // selection away before expecting the updated embed preview to reappear.
    const view = editorViewRef.current
    act(() => view.dispatch({ selection: { anchor: 1 } }))
    await waitFor(() => expect(container.querySelector('.tocktutor-live-embed-widget')?.textContent).toContain('Second'))
    expect(container.querySelector('.cm-content')).toBe(editor)
    expect(screen.getByLabelText('Live Preview Editor')).toBeTruthy()
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

  it.each(['al**pha** [x](alpha.md)', 'alpha [alpha](alpha.md)\n\n[[Destination]]\n'])('replaces only literal authored matches: %s', async source => {
    const onChange = vi.fn()
    const onSearchState = vi.fn()
    const editorViewRef = { current: null as any }
    const props = { content: source, editorViewRef, onMarkdownChange: onChange, onSearchState, searchQuery: 'alpha' }
    const { rerender } = render(<LivePreviewEditor {...props} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 15_000 })
    rerender(<LivePreviewEditor {...props} searchRequest={{ action: 'replace-all', id: 1, replacement: 'omega' }} />)
    const expected = source.replaceAll('alpha', 'omega')
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expected))
    expect(editorViewRef.current.state.doc.toString()).toBe(expected.replace(/\r\n?/gu, '\n'))
    expect(onSearchState).toHaveBeenLastCalledWith(expect.objectContaining({ current: null, query: 'alpha', total: 0 }))
  })

  it('keeps exact authored source for two replacements, two undos and two redos', async () => {
    const source = '---\r\ntags: [alpha]\r\n---\r\nalpha **alpha**\r\n\r\n[[Destination]]\r\n'
    const first = source.replaceAll('alpha', 'omega')
    const second = first.replaceAll('omega', 'delta')
    const onChange = vi.fn()
    const editorViewRef = { current: null as any }
    const props = { content: source, editorViewRef, onMarkdownChange: onChange }
    const { rerender } = render(<LivePreviewEditor {...props} searchQuery="alpha" />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 15_000 })
    const view = editorViewRef.current
    rerender(<LivePreviewEditor {...props} searchQuery="alpha" searchRequest={{ action: 'replace-all', id: 1, replacement: 'omega' }} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(first))
    rerender(<LivePreviewEditor {...props} searchQuery="omega" searchRequest={{ action: 'replace-all', id: 2, replacement: 'delta' }} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(second))
    for (const expected of [first, source]) {
      expect(undoCodeMirror(view)).toBe(true)
      await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expected))
    }
    for (const expected of [first, second]) {
      expect(redoCodeMirror(view)).toBe(true)
      await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expected))
    }
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


describe('CodeMirror history ownership', () => {
  it('restores replacement boundaries around interleaved typing without duplicate callbacks', async () => {
    const source = 'alpha\r\n\r\n[[Destination]]\r\n'
    const first = source.replace('alpha', 'omega')
    const onChange = vi.fn()
    const editorViewRef = { current: null as any }
    const props = { content: source, editorViewRef, onMarkdownChange: onChange }
    const { rerender } = render(<LivePreviewEditor {...props} searchQuery="alpha" />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 15_000 })
    const view = editorViewRef.current
    rerender(<LivePreviewEditor {...props} searchQuery="alpha" searchRequest={{ action: 'replace', id: 1, replacement: 'omega' }} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(first))
    expect(onChange).toHaveBeenCalledTimes(1)
    view.dispatch({ changes: { from: 5, insert: '!' } })
    const typed = onChange.mock.lastCall![0] as string
    expect(typed).toContain('omega!')
    expect(onChange).toHaveBeenCalledTimes(2)
    rerender(<LivePreviewEditor {...props} searchQuery="omega" searchRequest={{ action: 'replace', id: 2, replacement: 'delta' }} />)
    const second = typed.replace('omega', 'delta')
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(second))
    let callbacks = 3
    for (const expected of [typed, first, source]) {
      expect(undoCodeMirror(view)).toBe(true)
      expect(onChange).toHaveBeenLastCalledWith(expected)
      expect(onChange).toHaveBeenCalledTimes(++callbacks)
    }
    for (const expected of [first, typed, second]) {
      expect(redoCodeMirror(view)).toBe(true)
      expect(onChange).toHaveBeenLastCalledWith(expected)
      expect(onChange).toHaveBeenCalledTimes(++callbacks)
    }
  })

  it('clears native history for an authoritative replacement while preserving an equivalent echo', async () => {
    const source = 'alpha\n\n[[Destination]]\n'
    const onChange = vi.fn()
    const editorViewRef = { current: null as any }
    const props = { content: source, editorViewRef, onMarkdownChange: onChange }
    const { rerender } = render(<LivePreviewEditor {...props} searchQuery="alpha" />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 15_000 })
    const view = editorViewRef.current
    rerender(<LivePreviewEditor {...props} searchQuery="alpha" searchRequest={{ action: 'replace', id: 1, replacement: 'omega' }} />)
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    const echo = source.replace('alpha', 'omega')
    rerender(<LivePreviewEditor {...props} content={echo} />)
    expect(undoCodeMirror(view)).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith(source)
    rerender(<LivePreviewEditor {...props} content={source + '\n'} />)
    expect(undoCodeMirror(view)).toBe(false)
    expect(redoCodeMirror(view)).toBe(false)
    rerender(<LivePreviewEditor {...props} content={'External note\n'} />)
    expect(view.state.doc.toString().trim()).toBe('External note')
    expect(undoCodeMirror(view)).toBe(false)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('groups ordinary typing natively on a large note', async () => {
    const source = 'x'.repeat(100_000) + '\n'
    const onChange = vi.fn()
    const editorViewRef = { current: null as any }
    render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 15_000 })
    const view = editorViewRef.current
    for (let index = 0; index < 40; index += 1) view.dispatch({ changes: { from: 0, insert: 'a' } })
    expect(onChange).toHaveBeenCalledTimes(40)
    expect(view.state.doc.toString()).toBe('a'.repeat(40) + source)
    expect(undoCodeMirror(view)).toBe(true)
    expect(view.state.doc.toString()).toBe(source)
    expect(redoCodeMirror(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('a'.repeat(40) + source)
  })
})

it('runs a replacement against the current external document, not the previous editor state', async () => {
  const onChange = vi.fn()
  const editorViewRef = { current: null }
  const props = { editorViewRef, onMarkdownChange: onChange }
  const { rerender } = render(<LivePreviewEditor {...props} content="alpha" searchQuery="alpha" />)
  await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 15_000 })
  rerender(<LivePreviewEditor {...props} content="bravo" searchQuery="bravo" searchRequest={{ action: 'replace', id: 1, replacement: 'gamma' }} />)
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('gamma'))
  const view = editorViewRef.current as any
  expect(undoCodeMirror(view)).toBe(true)
  expect(onChange).toHaveBeenLastCalledWith('bravo')
  expect(undoCodeMirror(view)).toBe(false)
})


describe('source-preserving Live Preview search', () => {
  it('does not rewrite Markdown structure while replacing authored text', async () => {
    const source = '---\r\ntags: [alpha]\r\n---\r\n# Search Proof\r\n\r\nalpha **alpha** ALPHA\r\n\r\nEmoji 🙂 and 中文 alpha.\r\n\r\n## Second Heading\r\n\r\n[Sibling](Sibling.md) and [[Destination]].\r\n'
    const edited = source.replaceAll('alpha', 'omega')
    const onChange = vi.fn()
    const editorViewRef = { current: null as any }
    const { rerender } = render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} searchQuery="alpha" />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 15_000 })
    rerender(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} searchQuery="alpha" searchRequest={{ action: 'replace-all', id: 1, replacement: 'omega' }} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(edited))
    expect(editorViewRef.current.state.doc.toString()).toBe(edited.replace(/\r\n?/gu, '\n'))
    expect(editorViewRef.current.state.doc.toString()).toContain('# Search Proof')
    expect(editorViewRef.current.state.doc.toString()).toContain('[Sibling](Sibling.md) and [[Destination]]')
    expect(undoCodeMirror(editorViewRef.current)).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith(source)
    expect(redoCodeMirror(editorViewRef.current)).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith(edited)
  })
})


describe('CodeMirror source history', () => {
  const source = '---\r\ntitle: Retained Title\r\ntags: [keep]\r\n---\r\n\r\n# Search Proof\r\n\r\nalpha **alpha** ALPHA\r\n\r\nEmoji 🙂 and 中文 alpha.\r\n\r\n## Second Heading\r\n\r\n[Sibling](Sibling.md) and [[Destination]].\r\n'

  it('preserves exact saves and both replacement history branches', async () => {
    const editorViewRef = { current: null as any }
    const onChange = vi.fn()
    const saved: string[] = []
    function Harness({ query, request }: { query: string; request?: any }) {
      const [content, setContent] = useState(source)
      const [revision, setRevision] = useState(0)
      return <><button onClick={() => { saved.push(content); setRevision(value => value + 1) }}>Save Fixture</button>
        <LivePreviewEditor content={content} editorViewRef={editorViewRef} onMarkdownChange={value => { onChange(value); setContent(value) }} searchQuery={query} searchRequest={request} title={`Saved ${revision}`} /></>
    }
    const { rerender } = render(<Harness query="alpha" />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 15_000 })
    const view = editorViewRef.current
    const first = source.replaceAll('alpha', 'omega')
    const second = first.replaceAll('omega', 'sigma')
    const save = (expected: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Fixture' }))
      expect(saved.at(-1)).toBe(expected)
    }
    rerender(<Harness query="alpha" request={{ action: 'replace-all', id: 1, replacement: 'omega' }} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(first))
    save(first)
    rerender(<Harness query="omega" request={{ action: 'replace-all', id: 2, replacement: 'sigma' }} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(second))
    save(second)
    for (const expected of [first, source]) {
      act(() => expect(undoCodeMirror(view)).toBe(true))
      expect(onChange).toHaveBeenLastCalledWith(expected)
      save(expected)
    }
    expect(undoCodeMirror(view)).toBe(false)
    for (const expected of [first, second]) {
      act(() => expect(redoCodeMirror(view)).toBe(true))
      expect(onChange).toHaveBeenLastCalledWith(expected)
      save(expected)
    }
    expect(redoCodeMirror(view)).toBe(false)
    expect(onChange).toHaveBeenCalledTimes(6)
  })

  it.each(['heading level', 'link URL', 'text'] as const)('still records real %s edits and their undo/redo', async change => {
    const editorViewRef = { current: null as any }
    const onChange = vi.fn()
    render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 15_000 })
    const view = editorViewRef.current
    const normalizedSource = source.replace(/\r\n?/gu, '\n')
    const heading = normalizedSource.indexOf('# Search Proof')
    const changes = change === 'heading level'
      ? { from: heading, to: heading + 1, insert: '###' }
      : change === 'link URL'
        ? { from: normalizedSource.indexOf('Sibling.md'), to: normalizedSource.indexOf('Sibling.md') + 'Sibling.md'.length, insert: 'Other.md' }
        : { from: heading + 2, insert: '!' }
    act(() => view.dispatch({ changes }))
    expect(onChange).toHaveBeenCalledTimes(1)
    const changed = onChange.mock.lastCall![0]
    expect(changed).not.toBe(source)
    expect(changed).toContain(change === 'heading level' ? '### Search Proof' : change === 'link URL' ? '(Other.md)' : '# !Search Proof')
    act(() => expect(undoCodeMirror(view)).toBe(true))
    expect(onChange).toHaveBeenLastCalledWith(source)
    act(() => expect(redoCodeMirror(view)).toBe(true))
    expect(onChange).toHaveBeenLastCalledWith(changed)
    act(() => expect(undoCodeMirror(view)).toBe(true))
    act(() => view.dispatch({ changes: { from: 0, insert: 'Real edit' } }))
    expect(redoCodeMirror(view)).toBe(false)
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

it('Live Preview peer replacement preserves local selection while resetting history', async () => {
  const editorViewRef = { current: null as any }
  const onChange = vi.fn()
  const { rerender } = render(<LivePreviewEditor content="alpha beta" editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
  await waitFor(() => expect(editorViewRef.current).toBeTruthy())
  const view = editorViewRef.current
  act(() => view.dispatch({ changes: { from: 2, insert: 'x' }, selection: { anchor: 3 } }))
  const calls = onChange.mock.calls.length
  rerender(<LivePreviewEditor content="omega beta" editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
  await waitFor(() => expect(view.state.doc.toString()).toBe('omega beta'))
  expect(view.state.selection.main.from).toBe(3)
  expect(undoCodeMirror(view)).toBe(false)
  expect(redoCodeMirror(view)).toBe(false)
  expect(onChange).toHaveBeenCalledTimes(calls)
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
