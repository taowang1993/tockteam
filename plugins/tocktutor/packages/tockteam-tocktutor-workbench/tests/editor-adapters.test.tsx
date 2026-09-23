import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { undo as undoCodeMirror, redo as redoCodeMirror } from '@codemirror/commands'
import { EditorSelection } from '@codemirror/state'
import { undo as undoMilkdown, redo as redoMilkdown, closeHistory, history as nativeHistory, undoDepth, redoDepth } from '@milkdown/prose/history'
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
import { EditorState as ProseEditorState } from '@milkdown/prose/state'
import { Schema } from '@milkdown/prose/model'
import { AuthoredSourceStep, authoredHistoryKey, buildAuthoredHistory } from '../src/live-preview-authored-history.ts'
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

describe('Milkdown Live Preview editor', () => {
  it('keeps frontmatter outside Milkdown serialization and presents Obsidian-style tag properties', async () => {
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

  it('mounts one editable ProseMirror surface and keeps source untouched until edited', { timeout: 20_000 }, async () => {
    const source = '# Lesson\r\n\r\n- [ ] Review\r\n'
    const onChange = vi.fn()
    const onSelection = vi.fn()
    const { container } = render(
      <LivePreviewEditor content={source} onMarkdownChange={onChange} onSelectionChange={onSelection} />,
    )

    await waitFor(() => expect(container.querySelector('.ProseMirror')).toBeTruthy(), { timeout: 15_000 })
    expect(container.querySelector('.ProseMirror')?.textContent).toContain('Lesson')
    expect(onChange).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLElement>('.ProseMirror')?.getAttribute('contenteditable')).toBe('true')
    await waitFor(() => expect(onSelection).toHaveBeenCalled())
  })

  it('finds formatted Live Preview text and replaces it with one native history step', async () => {
    const source = 'alpha **alpha**\r\n'
    const onChange = vi.fn()
    const onSearchState = vi.fn()
    const editorViewRef = { current: null }
    const { container, rerender } = render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} onSearchState={onSearchState} searchQuery="alpha" />)
    await waitFor(() => expect(container.querySelector('.tocktutor-find-match')).toBeTruthy(), { timeout: 15_000 })
    expect(container.querySelectorAll('.tocktutor-find-match')).toHaveLength(2)
    expect(onSearchState).toHaveBeenLastCalledWith({ current: 0, query: 'alpha', total: 2 })
    rerender(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} onSearchState={onSearchState} searchCurrentIndex={0} searchQuery="alpha" searchRequest={{ action: 'replace-all', id: 1, replacement: 'omega' }} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('omega **omega**\r\n'))
    expect((editorViewRef.current as { state: { doc: { textContent: string } } }).state.doc.textContent).toBe('omega omega')
    const liveView = editorViewRef.current as { dispatch: (transaction: unknown) => void; state: unknown }
    expect(undoMilkdown(liveView.state, liveView.dispatch)).toBe(true)
    expect((editorViewRef.current as { state: { doc: { textContent: string } } }).state.doc.textContent).toBe('alpha alpha')
    expect(redoMilkdown(liveView.state, liveView.dispatch)).toBe(true)
    expect((editorViewRef.current as { state: { doc: { textContent: string } } }).state.doc.textContent).toBe('omega omega')
  })

  it('publishes exact authored source around Live Preview replacements and history', async () => {
    const source = '---\r\ntags: [alpha]\r\n---\r\nalpha **alpha**\r\n\r\n[[Destination]] and [Sibling](Sibling.md).\r\n'
    const replacement = 'omega'
    const onChange = vi.fn()
    const onSearchState = vi.fn()
    const editorViewRef = { current: null }
    const { container, rerender } = render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} onSearchState={onSearchState} searchQuery="alpha" />)
    await waitFor(() => expect(container.querySelectorAll('.tocktutor-find-match')).toHaveLength(2), { timeout: 15_000 })
    rerender(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} onSearchState={onSearchState} searchCurrentIndex={0} searchQuery="alpha" searchRequest={{ action: 'replace-all', id: 1, replacement }} />)
    const edited = '---\r\ntags: [alpha]\r\n---\r\nomega **omega**\r\n\r\n[[Destination]] and [Sibling](Sibling.md).\r\n'
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(edited), { timeout: 15_000 })
    expect(onChange).not.toHaveBeenLastCalledWith(expect.stringContaining('\\[\\[Destination]]'))
    const liveView = editorViewRef.current as { dispatch: (transaction: unknown) => void; state: unknown }
    expect(undoMilkdown(liveView.state, liveView.dispatch)).toBe(true)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(source), { timeout: 5_000 })
    expect(redoMilkdown(liveView.state, liveView.dispatch)).toBe(true)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(edited), { timeout: 5_000 })
  })

  it('keeps a list folded across parent renders without changing authored Markdown', async () => {
    const source = '1. Parent\n   - Child\n'
    const onChange = vi.fn()
    const { rerender } = render(<LivePreviewEditor content={source} onMarkdownChange={onChange} />)
    const collapse = await screen.findByRole('button', { name: 'Collapse List' })
    collapse.focus()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Collapse List' }), { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Expand List' }).getAttribute('aria-expanded')).toBe('false')

    rerender(<LivePreviewEditor content={source} onMarkdownChange={onChange} title="Parent rendered again" />)
    expect(screen.getByRole('button', { name: 'Expand List' }).getAttribute('aria-expanded')).toBe('false')
    rerender(<LivePreviewEditor content={`---\nstatus: review\n---\n${source}`} onMarkdownChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Expand List' }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Expand List' }), { key: ' ' })
    expect(screen.getByRole('button', { name: 'Collapse List' }).getAttribute('aria-expanded')).toBe('true')
    expect(onChange).not.toHaveBeenCalled()

    rerender(<LivePreviewEditor content={'# Updated externally\n'} onMarkdownChange={onChange} />)
    await screen.findByRole('heading', { name: 'Updated externally' })
    expect(screen.queryByText('Child')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Collapse List' })).toBeNull()
  })

  it('accepts edited Markdown echoed by the parent and later external changes', async () => {
    const source = '---\r\nstatus: draft\r\n---\r\n1. Parent\r\n   - Child\r\n'
    const onChange = vi.fn()
    const editorViewRef = { current: null }
    const { rerender } = render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await screen.findByRole('button', { name: 'Collapse List' })
    const view = editorViewRef.current
    view.dispatch(view.state.tr.insertText('Edited ', 3))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const edited = onChange.mock.lastCall![0] as string
    expect(edited).toContain('Edited Parent')
    expect(edited.startsWith('---\r\nstatus: draft\r\n---\r\n')).toBe(true)
    rerender(<LivePreviewEditor content={edited} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Collapse List' }), { key: 'Enter' })
    rerender(<LivePreviewEditor content={edited} editorViewRef={editorViewRef} onMarkdownChange={onChange} title="Edited note" />)
    expect(screen.getByRole('button', { name: 'Expand List' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('Edited Parent')).toBeTruthy()
    rerender(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await screen.findByText('Parent')
    expect(screen.queryByText('Edited Parent')).toBeNull()
  })

  it('uses readable document typography and Obsidian-style blockquotes in both preview modes', async () => {
    const live = render(<LivePreviewEditor content={'> Quoted lesson\n'} onMarkdownChange={() => {}} />)

    await waitFor(() => expect(live.container.querySelector('blockquote')).toBeTruthy(), { timeout: 5_000 })
    const liveSurface = screen.getByLabelText('Live Preview Editor')
    expect(liveSurface.className).toContain('text-base')
    expect(liveSurface.className).toContain('[&_blockquote]:border-l-2')
    expect(liveSurface.className).toContain('[&_blockquote]:pl-6')
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

    await waitFor(() => expect(live.container.querySelectorAll('.tocktutor-live-internal-link')).toHaveLength(2), { timeout: 5_000 })
    expect([...live.container.querySelectorAll('.tocktutor-live-internal-link')].map(link => link.textContent)).toEqual(['Welcome', 'start here'])
    expect([...live.container.querySelectorAll('.tocktutor-live-link-markup')].map(markup => markup.textContent).join('')).toBe('[[]][[Guide|]]')
    const liveSurface = screen.getByLabelText('Live Preview Editor')
    expect(liveSurface.className).toContain('[&_.tocktutor-live-internal-link]:text-[var(--dsw-specific-markdown-accent)]')
    expect(liveSurface.className).toContain('[&_.tocktutor-live-internal-link]:underline')
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

    await waitFor(() => expect(container.querySelector('.tocktutor-live-highlight')?.textContent).toBe('carefully'), { timeout: 5_000 })
    expect([...container.querySelectorAll('.tocktutor-live-highlight-markup')].map(markup => markup.textContent).join('')).toBe('====')
    const editor = screen.getByLabelText('Live Preview Editor')
    expect(editor.className).toContain('[&_.tocktutor-live-highlight]:bg-[var(--dsw-specific-markdown-highlight)]')
    expect(editor.className).toContain('[&_li>p]:m-0')
    expect(editor.className).toContain('[&_ul]:list-disc')
    expect(editor.className).toContain('[&_code]:bg-[var(--dsw-specific-markdown-inline-code)]')
    expect(editor.className).toContain('[&_code]:rounded-sm')
    expect(editor.className).toContain('[&_code]:py-0.5')
    expect(editor.className).toContain('[&_pre_code]:p-0')
    expect(editor.className).toContain('[&_.tocktutor-live-fold]:absolute')
    expect(editor.className).toContain('[&_li>ul]:!pl-8')
  })

  it('renders compact Obsidian-style task rows in Live Preview', async () => {
    const { container } = render(<LivePreviewEditor content={'- [x] Done\n- [ ] Next\n'} onMarkdownChange={() => {}} />)

    await waitFor(() => expect(container.querySelector('li[data-item-type="task"]')).toBeTruthy(), { timeout: 5_000 })
    const editor = screen.getByLabelText('Live Preview Editor')
    expect(editor.className).toContain('[&_ul:has(li[data-item-type=task])]:list-none')
    expect(editor.className).toContain('[&_li[data-item-type=task]>p]:inline')
    expect(editor.className).toContain('[&_li[data-checked=true]>p]:line-through')
    expect(container.querySelector<HTMLInputElement>('.tocktutor-live-task')?.className).toContain('accent-[var(--dsw-specific-markdown-accent)]')
  })

  it('renders bordered tables without a persistent command strip', async () => {
    const { container } = render(<LivePreviewEditor content={'| Surface | Status |\n| --- | --- |\n| Editor | Ready |\n'} onMarkdownChange={() => {}} />)

    await waitFor(() => expect(container.querySelector('table')).toBeTruthy(), { timeout: 5_000 })
    expect(screen.queryByLabelText('Live Preview Table Commands')).toBeNull()
    const editor = screen.getByLabelText('Live Preview Editor')
    expect(editor.className).toContain('[&_th]:border')
    expect(editor.className).toContain('[&_td]:border')
    expect(editor.className).toContain('border-[var(--dsw-alias-border-l2,var(--tt-border))]')
    expect(editor.className).toContain('[&_table_p]:m-0')
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
    expect(widget.getAttribute('role')).toBe('button')
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
    rerender(<LivePreviewEditor editorViewRef={editorViewRef} content={source} onMarkdownChange={() => {}} onWidgetState={onWidgetState} resolvedEmbeds={resolvedEmbeds} />)
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
    rerender(<LivePreviewEditor editorViewRef={editorViewRef} content={nextSource} onMarkdownChange={() => {}} onWidgetState={onWidgetState} resolvedEmbeds={nextEmbeds} />)
    // Peer replacements retain this view's revealed-source selection. Move the
    // selection away before expecting the updated embed preview to reappear.
    const view = editorViewRef.current
    act(() => view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.create(view.state.doc, 1))))
    await waitFor(() => expect(container.querySelector('.tocktutor-live-embed-widget')?.textContent).toContain('Second'))
    expect(container.querySelector('.ProseMirror')).toBe(editor)
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

  it.each(['al**pha** [x](alpha.md)', 'alpha [alpha](alpha.md)\n\n[[Destination]]\n'])('rejects unverifiable authored ranges: %s', async source => {
    const onChange = vi.fn()
    const onSearchState = vi.fn()
    const editorViewRef = { current: null }
    const props = { content: source, editorViewRef, onMarkdownChange: onChange, onSearchState, searchQuery: 'alpha' }
    const { rerender } = render(<LivePreviewEditor {...props} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 15_000 })
    const view = editorViewRef.current as any
    const before = view.state.doc.toJSON()
    rerender(<LivePreviewEditor {...props} searchRequest={{ action: 'replace-all', id: 1, replacement: 'omega' }} />)
    await waitFor(() => expect(onSearchState).toHaveBeenLastCalledWith(expect.objectContaining({ error: expect.stringContaining('Source') })))
    expect(onChange).not.toHaveBeenCalled()
    expect(view.state.doc.toJSON()).toEqual(before)
    expect(undoMilkdown(view.state, view.dispatch)).toBe(false)
  })

  it('keeps exact authored source for two replacements, two undos and two redos', async () => {
    const source = '---\r\ntags: [alpha]\r\n---\r\nalpha **alpha**\r\n\r\n[[Destination]]\r\n'
    const first = source.replace('alpha **alpha**', 'omega **omega**')
    const second = first.replace('omega **omega**', 'delta **delta**')
    const onChange = vi.fn()
    const editorViewRef = { current: null }
    const props = { content: source, editorViewRef, onMarkdownChange: onChange }
    const { rerender } = render(<LivePreviewEditor {...props} searchQuery="alpha" />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 15_000 })
    const view = editorViewRef.current as any
    rerender(<LivePreviewEditor {...props} searchQuery="alpha" searchRequest={{ action: 'replace-all', id: 1, replacement: 'omega' }} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(first))
    rerender(<LivePreviewEditor {...props} searchQuery="omega" searchRequest={{ action: 'replace-all', id: 2, replacement: 'delta' }} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(second))
    for (const expected of [first, source]) {
      expect(undoMilkdown(view.state, view.dispatch)).toBe(true)
      await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expected))
    }
    for (const expected of [first, second]) {
      expect(redoMilkdown(view.state, view.dispatch)).toBe(true)
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


describe('authored native history ownership', () => {
  it('restores replacement boundaries around interleaved typing without duplicate callbacks', async () => {
    const source = 'alpha\r\n\r\n[[Destination]]\r\n'
    const first = source.replace('alpha', 'omega')
    const onChange = vi.fn()
    const editorViewRef = { current: null }
    const props = { content: source, editorViewRef, onMarkdownChange: onChange }
    const { rerender } = render(<LivePreviewEditor {...props} searchQuery="alpha" />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 15_000 })
    const view = editorViewRef.current as any
    rerender(<LivePreviewEditor {...props} searchQuery="alpha" searchRequest={{ action: 'replace', id: 1, replacement: 'omega' }} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(first))
    expect(onChange).toHaveBeenCalledTimes(1)
    view.dispatch(view.state.tr.insertText('!', 6))
    const typed = onChange.mock.lastCall![0] as string
    expect(typed).toContain('omega!')
    expect(onChange).toHaveBeenCalledTimes(2)
    rerender(<LivePreviewEditor {...props} searchQuery="omega" searchRequest={{ action: 'replace', id: 2, replacement: 'delta' }} />)
    const second = typed.replace('omega', 'delta')
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(second))
    let callbacks = 3
    for (const expected of [typed, first, source]) {
      expect(undoMilkdown(view.state, view.dispatch)).toBe(true)
      expect(onChange).toHaveBeenLastCalledWith(expected)
      expect(onChange).toHaveBeenCalledTimes(++callbacks)
    }
    for (const expected of [first, typed, second]) {
      expect(redoMilkdown(view.state, view.dispatch)).toBe(true)
      expect(onChange).toHaveBeenLastCalledWith(expected)
      expect(onChange).toHaveBeenCalledTimes(++callbacks)
    }
  })

  it('clears native and authored history for an authoritative replacement, including equivalent Markdown', async () => {
    const source = 'alpha\n\n[[Destination]]\n'
    const onChange = vi.fn()
    const editorViewRef = { current: null }
    const props = { content: source, editorViewRef, onMarkdownChange: onChange }
    const { rerender } = render(<LivePreviewEditor {...props} searchQuery="alpha" />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 15_000 })
    const view = editorViewRef.current as any
    rerender(<LivePreviewEditor {...props} searchQuery="alpha" searchRequest={{ action: 'replace', id: 1, replacement: 'omega' }} />)
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    const echo = source.replace('alpha', 'omega')
    rerender(<LivePreviewEditor {...props} content={echo} />)
    expect(undoMilkdown(view.state, view.dispatch)).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith(source)
    rerender(<LivePreviewEditor {...props} content={source + '\n'} />)
    expect(undoMilkdown(view.state, view.dispatch)).toBe(false)
    expect(redoMilkdown(view.state, view.dispatch)).toBe(false)
    rerender(<LivePreviewEditor {...props} content={'External note\n'} />)
    expect(view.state.doc.textContent.trim()).toBe('External note')
    expect(undoMilkdown(view.state, view.dispatch)).toBe(false)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('groups ordinary typing natively and retains compact deltas on a large note', async () => {
    const source = 'x'.repeat(100_000) + '\n'
    const onChange = vi.fn()
    const editorViewRef = { current: null }
    render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 15_000 })
    const view = editorViewRef.current as any
    const deltas: AuthoredSourceStep[] = []
    // Observe the public applied-transaction result, not private history storage.
    // Each appended step is precisely the object handed to native history.
    for (let index = 0; index < 40; index += 1) {
      const result = view.state.applyTransaction(view.state.tr.insertText('a', 1 + index).setTime(1000 + index))
      for (const transaction of result.transactions) for (const step of transaction.steps) if (step instanceof AuthoredSourceStep) deltas.push(step)
      view.updateState(result.state)
    }
    expect(deltas).toHaveLength(40)
    expect(deltas.reduce((bytes, delta) => bytes + delta.removed.length + delta.inserted.length, 0)).toBe(40)
    expect(onChange).toHaveBeenCalledTimes(40)
    expect(undoMilkdown(view.state, view.dispatch)).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith(source)
    expect(undoMilkdown(view.state, view.dispatch)).toBe(false)
    expect(redoMilkdown(view.state, view.dispatch)).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith('a'.repeat(40) + source)
  })
})


it('prunes authored deltas with the installed native history event depth', () => {
  const schema = new Schema({ nodes: { doc: { content: 'text*' }, text: {} } })
  let state = ProseEditorState.create({ doc: schema.node('doc', null, [schema.text('seed')]), plugins: [nativeHistory({ depth: 2 }), buildAuthoredHistory(() => 'seed', doc => doc.textContent)] })
  const dispatch = transaction => { state = state.applyTransaction(transaction).state }
  for (let index = 0; index < 30; index += 1) dispatch(closeHistory(state.tr).insertText('x', state.doc.content.size))
  let undos = 0
  while (undoMilkdown(state, dispatch)) {
    undos += 1
    expect(authoredHistoryKey.getState(state)).toBe(state.doc.textContent)
  }
  // Installed native history permits up to 20 overflow events before pruning.
  expect(undos).toBeGreaterThanOrEqual(2)
  expect(undos).toBeLessThanOrEqual(22)
  expect(undos).toBeLessThan(30)
  let redos = 0
  while (redoMilkdown(state, dispatch)) {
    redos += 1
    expect(authoredHistoryKey.getState(state)).toBe(state.doc.textContent)
  }
  expect(redos).toBe(undos)
  expect(authoredHistoryKey.getState(state)).toBe('seed' + 'x'.repeat(30))
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
  expect(undoMilkdown(view.state, view.dispatch)).toBe(true)
  expect(onChange).toHaveBeenLastCalledWith('bravo')
  expect(undoMilkdown(view.state, view.dispatch)).toBe(false)
})


describe('Desktop generated heading IDs', () => {
  it.each(['ids only', 'heading level', 'link URL', 'strong marker'] as const)('compares all authored attributes except heading IDs: %s', async difference => {
    const source = '---\r\ntags: [alpha]\r\n---\r\n# Search Proof\r\n\r\nalpha **alpha** ALPHA\r\n\r\nEmoji 🙂 and 中文 alpha.\r\n\r\n## Second Heading\r\n\r\n[Sibling](Sibling.md) and [[Destination]].\r\n'
    const edited = source.replace('alpha **alpha**', 'omega **omega**').replace('中文 alpha.', '中文 omega.')
    const onChange = vi.fn()
    const onSearchState = vi.fn()
    const editorViewRef = { current: null }
    const props = { content: source, editorViewRef, onMarkdownChange: onChange, onSearchState, searchQuery: 'alpha' }
    const { rerender } = render(<LivePreviewEditor {...props} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 15_000 })
    const view = editorViewRef.current as any
    const json = view.state.doc.toJSON()
    // Emulate the native document after browser parseDOM adopts generated IDs,
    // without editing the authored Markdown or manufacturing a serialization.
    const seed = node => {
      if (node.type === 'heading') node.attrs.id = node.content[0].text.toLowerCase().replaceAll(' ', '-')
      if (difference === 'heading level' && node.type === 'heading') node.attrs.level = 3
      for (const mark of node.marks ?? []) {
        if (difference === 'link URL' && mark.type === 'link') mark.attrs.href = 'Other.md'
        if (difference === 'strong marker' && mark.type === 'strong') mark.attrs.marker = '_'
      }
      for (const child of node.content ?? []) seed(child)
    }
    seed(json)
    view.updateState(ProseEditorState.create({ doc: view.state.schema.nodeFromJSON(json), plugins: view.state.plugins }))
    expect(view.state.doc.firstChild.attrs.id).toBe('search-proof')
    expect(onChange).not.toHaveBeenCalled()
    const before = view.state.doc.toJSON()
    rerender(<LivePreviewEditor {...props} searchRequest={{ action: 'replace-all', id: 1, replacement: 'omega' }} />)
    if (difference !== 'ids only') {
      await waitFor(() => expect(onSearchState).toHaveBeenLastCalledWith(expect.objectContaining({ error: expect.stringContaining('Source') })))
      expect(onChange).not.toHaveBeenCalled()
      expect(view.state.doc.toJSON()).toEqual(before)
      expect(undoMilkdown(view.state, view.dispatch)).toBe(false)
      return
    }
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(edited))
    expect(view.state.doc.firstChild.attrs.id).toBe('search-proof')
    expect(undoMilkdown(view.state, view.dispatch)).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith(source)
    expect(redoMilkdown(view.state, view.dispatch)).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith(edited)
  })
})


describe('native DOM heading history', () => {
  const source = '---\r\ntitle: Retained Title\r\ntags: [keep]\r\n---\r\n\r\n# Search Proof\r\n\r\nalpha **alpha** ALPHA\r\n\r\nEmoji 🙂 and 中文 alpha.\r\n\r\n## Second Heading\r\n\r\n[Sibling](Sibling.md) and [[Destination]].\r\n'

  it.each(['native sync only', 'before replacements', 'between replacements', 'after second undo'] as const)('preserves exact saves and both history branches with ID adoption %s', async phase => {
    const editorViewRef = { current: null }
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
    const view = editorViewRef.current as any
    const adoptIds = () => {
      const beforeUndo = undoDepth(view.state)
      const beforeRedo = redoDepth(view.state)
      const calls = onChange.mock.calls.length
      const ids: string[] = []
      let transaction = view.state.tr
      view.state.doc.descendants((node, position) => {
        if (node.type.name !== 'heading') return
        ids.push(node.textContent.toLowerCase().replaceAll(' ', '-'))
        // Undo can restore empty IDs. The installed commonmark view plugin
        // immediately adopts its generated IDs again via a nested transaction.
        transaction = transaction.setNodeMarkup(position, undefined, { ...node.attrs, id: '' })
      })
      act(() => view.dispatch(transaction))
      const actual: string[] = []
      view.state.doc.descendants(node => { if (node.type.name === 'heading') actual.push(node.attrs.id) })
      expect(onChange).toHaveBeenCalledTimes(calls)
      expect(actual).toEqual(ids)
      expect(undoDepth(view.state)).toBe(beforeUndo)
      expect(redoDepth(view.state)).toBe(beforeRedo)
    }
    const save = (expected: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Fixture' }))
      expect(saved.at(-1)).toBe(expected)
    }
    if (phase === 'before replacements') { adoptIds(); save(source) }
    const first = source.replaceAll('alpha', 'omega')
    const second = first.replaceAll('omega', 'sigma')
    rerender(<Harness query="alpha" request={{ action: 'replace-all', id: 1, replacement: 'omega' }} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(first))
    save(first)
    if (phase === 'between replacements') { adoptIds(); save(first) }
    act(() => view.dispatch(closeHistory(view.state.tr)))
    rerender(<Harness query="omega" request={{ action: 'replace-all', id: 2, replacement: 'sigma' }} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(second))
    save(second)
    for (const expected of [first, source]) {
      act(() => expect(undoMilkdown(view.state, view.dispatch)).toBe(true))
      if (phase !== 'native sync only' && (phase !== 'after second undo' || expected === source)) adoptIds()
      save(expected)
    }
    expect(undoDepth(view.state)).toBe(0)
    for (const expected of [first, second]) {
      act(() => expect(redoMilkdown(view.state, view.dispatch)).toBe(true))
      if (phase !== 'native sync only') adoptIds()
      save(expected)
    }
    expect(redoDepth(view.state)).toBe(0)
    expect(onChange).toHaveBeenCalledTimes(6)
  })

  it.each(['heading level', 'link URL', 'text'] as const)('still records real %s edits and their undo/redo', async change => {
    const editorViewRef = { current: null }
    const onChange = vi.fn()
    render(<LivePreviewEditor content={source} editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
    await waitFor(() => expect(editorViewRef.current).toBeTruthy(), { timeout: 15_000 })
    const view = editorViewRef.current as any
    let transaction = view.state.tr.setNodeMarkup(0, undefined, { ...view.state.doc.firstChild.attrs, id: 'search-proof', ...(change === 'heading level' ? { level: 3 } : {}) })
    if (change === 'text') transaction = transaction.insertText('!', 1)
    if (change === 'link URL') view.state.doc.descendants((node, position) => {
      const link = node.marks.find(mark => mark.type.name === 'link')
      if (link) transaction = transaction.addMark(position, position + node.nodeSize, link.type.create({ ...link.attrs, href: 'Other.md' }))
    })
    act(() => view.dispatch(transaction))
    expect(onChange).toHaveBeenCalledTimes(1)
    const changed = onChange.mock.lastCall![0]
    expect(changed).not.toBe(source)
    expect(changed).toContain(change === 'heading level' ? '### Search Proof' : change === 'link URL' ? '(Other.md)' : '!Search Proof')
    act(() => expect(undoMilkdown(view.state, view.dispatch)).toBe(true))
    expect(onChange).toHaveBeenLastCalledWith(source)
    act(() => expect(redoMilkdown(view.state, view.dispatch)).toBe(true))
    expect(onChange).toHaveBeenLastCalledWith(changed)
    act(() => expect(undoMilkdown(view.state, view.dispatch)).toBe(true))
    act(() => view.dispatch(view.state.tr.insertText('Real edit', 1)))
    expect(redoDepth(view.state)).toBe(0)
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

it('Live Preview peer replacement preserves local selection while resetting both histories', async () => {
  const editorViewRef = { current: null }
  const onChange = vi.fn()
  const { rerender } = render(<LivePreviewEditor content="alpha beta" editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
  await waitFor(() => expect(editorViewRef.current).toBeTruthy())
  const view = editorViewRef.current
  act(() => { const transaction = view.state.tr.insertText('x', 2); view.dispatch(transaction.setSelection(view.state.selection.constructor.create(transaction.doc, 3))) })
  const calls = onChange.mock.calls.length
  rerender(<LivePreviewEditor content="omega beta" editorViewRef={editorViewRef} onMarkdownChange={onChange} />)
  await waitFor(() => expect(view.state.doc.textContent).toBe('omega beta'))
  expect(view.state.selection.from).toBe(3)
  expect(undoDepth(view.state)).toBe(0)
  expect(redoDepth(view.state)).toBe(0)
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
