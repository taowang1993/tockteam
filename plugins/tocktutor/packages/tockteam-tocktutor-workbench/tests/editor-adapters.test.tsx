import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByLabelText('Markdown Source Editor').className).toContain('[&_.cm-editor]:[font:16px/1.5_ui-monospace,SFMono-Regular,Consolas,monospace]')
    expect(screen.getByLabelText('Markdown Source Editor').className).toContain('[&_.cm-scroller]:leading-6')
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
    render(<LivePreviewEditor content={source} onMarkdownChange={() => {}} title="Lesson note" />)
    const title = screen.getByRole('heading', { level: 1, name: 'Lesson note' })
    const propertiesHeading = screen.getByRole('heading', { level: 2, name: 'Properties' })
    expect(title.compareDocumentPosition(propertiesHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByLabelText('Document Properties').textContent).toContain('statusactive')
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

  it('adds a property from Reading View', () => {
    const onAddProperty = vi.fn(() => true)
    render(<RichReadingView onAddProperty={onAddProperty} onToggleTask={() => {}} source="# Lesson\n" title="Lesson note" />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Property' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Property Name' }), { target: { value: 'area' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Add Property' }))
    expect(onAddProperty).toHaveBeenCalledWith('area')
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

  it('uses readable document typography and Obsidian-style blockquotes in both preview modes', async () => {
    const live = render(<LivePreviewEditor content={'> Quoted lesson\n'} onMarkdownChange={() => {}} />)

    await waitFor(() => expect(live.container.querySelector('blockquote')).toBeTruthy(), { timeout: 5_000 })
    const liveSurface = screen.getByLabelText('Live Preview Editor')
    expect(liveSurface.className).toContain('text-base')
    expect(liveSurface.className).toContain('[&_blockquote]:border-l-2')
    expect(liveSurface.className).toContain('[&_blockquote]:pl-3')
    live.unmount()

    render(<RichReadingView source={'> Quoted lesson\n'} onToggleTask={() => {}} title="Quote" />)
    const readingSurface = screen.getByLabelText('Reading View').querySelector<HTMLElement>('.tocktutor-reading')!
    expect(readingSurface.querySelector('blockquote')?.textContent).toBe('Quoted lesson')
    expect(readingSurface.className).toContain('text-base')
    expect(readingSurface.className).toContain('[&_blockquote]:border-l-2')
    expect(readingSurface.className).toContain('[&_blockquote]:pl-3')
  })

  it('presents wikilinks without source brackets and shares Reading View link styling', async () => {
    const live = render(<LivePreviewEditor content={'Review [[Welcome]] and [[Guide|start here]].\n'} onMarkdownChange={() => {}} />)

    await waitFor(() => expect(live.container.querySelectorAll('.tocktutor-live-internal-link')).toHaveLength(2), { timeout: 5_000 })
    expect([...live.container.querySelectorAll('.tocktutor-live-internal-link')].map(link => link.textContent)).toEqual(['Welcome', 'start here'])
    expect([...live.container.querySelectorAll('.tocktutor-live-link-markup')].map(markup => markup.textContent).join('')).toBe('[[]][[Guide|]]')
    const liveSurface = screen.getByLabelText('Live Preview Editor')
    expect(liveSurface.className).toContain('[&_.tocktutor-live-internal-link]:text-[var(--dsw-specific-markdown-accent)]')
    expect(liveSurface.className).not.toContain('[&_.tocktutor-live-internal-link]:underline')
    live.unmount()

    render(<RichReadingView source={'Review [[Welcome]].\n'} onToggleTask={() => {}} title="Links" />)
    const readingSurface = screen.getByLabelText('Reading View').querySelector<HTMLElement>('.tocktutor-reading')!
    expect(readingSurface.querySelector('a.internal-link')?.textContent).toBe('Welcome')
    expect(readingSurface.className).not.toContain('[&_a]:underline')
    expect(readingSurface.className).toContain('[&_a.internal-link]:no-underline')
    expect(readingSurface.className).toContain('[&_a]:text-[var(--dsw-specific-markdown-accent)]')
    expect(readingSurface.className).toContain('[&_mark]:text-inherit')
  })

  it('renders highlights and nested lists with compact Live Preview flow', async () => {
    const { container } = render(<LivePreviewEditor content={'Read ==carefully==.\n\n1. First\n2. Second\n   - Nested\n'} onMarkdownChange={() => {}} />)

    await waitFor(() => expect(container.querySelector('.tocktutor-live-highlight')?.textContent).toBe('carefully'), { timeout: 5_000 })
    expect([...container.querySelectorAll('.tocktutor-live-highlight-markup')].map(markup => markup.textContent).join('')).toBe('====')
    const editor = screen.getByLabelText('Live Preview Editor')
    expect(editor.className).toContain('[&_.tocktutor-live-highlight]:bg-[var(--dsw-specific-markdown-highlight)]')
    expect(editor.className).toContain('[&_li>p]:m-0')
    expect(editor.className).toContain('[&_.tocktutor-live-fold]:absolute')
    expect(editor.className).toContain('[&_li>ul]:!pl-4')
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
