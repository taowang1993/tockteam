import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SourceEditor,
  preserveEditorLineEndings,
  shouldAddEditorSelectionRange,
  shouldStartEditorRectangularSelection,
} from '../src/source-editor.tsx'
import { LivePreviewEditor, splitLivePreviewSource } from '../src/live-preview-editor.tsx'
import { LivePreviewView, MarkdownSlidesView, RichReadingView } from '../src/editor-surface.tsx'
import { projectEditorStaticWidgets, projectEditorWidgets } from '../src/editor-widgets.ts'

afterEach(() => {
  document.body.replaceChildren()
})

describe('CodeMirror Source editor', () => {
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
    expect(sourceEditor.className).toContain('[&_.cm-tock-heading-mark]:!text-inherit')
    expect(sourceEditor.className).toContain('[&_.cm-tock-heading-mark_*]:!text-inherit')
    expect(sourceEditor.className).toContain('[&_.cm-tock-heading-mark]:[font-size:inherit]')
    expect(sourceEditor.className).not.toContain('[&_.cm-tock-heading-mark]:!text-[var(--tt-muted)]')
    expect(screen.getByLabelText('Markdown Source Editor').className).toContain('[&_.cm-scroller]:leading-6')
    const title = screen.getByRole('textbox', { name: 'Note title' }) as HTMLInputElement
    expect(title.value).toBe('Keep')
    expect(title.closest('.cm-editor')).toBeNull()
    expect(container.querySelector('.cm-content')?.getAttribute('data-inline-title')).toBeNull()
    expect([...container.querySelectorAll('.cm-line')].find(line => line.textContent === '# Keep')?.className).toContain('cm-tock-heading-1')
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

  it('does not style Markdown-like text inside fenced blocks as headings', async () => {
    const source = '```md\n# code\n```\n# Heading\n'
    const { container } = render(<SourceEditor content={source} onContentChange={() => {}} />)
    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy(), { timeout: 5_000 })
    const lines = [...container.querySelectorAll('.cm-line')]
    expect(lines.find(line => line.textContent === '# code')?.className).not.toContain('cm-tock-heading-1')
    expect(lines.find(line => line.textContent === '# Heading')?.className).toContain('cm-tock-heading-1')
  })

  it('keeps headings inside multiline comments safe and unstyled', async () => {
    const source = '%%\n  # Comment heading\n%%\n# Heading\n'
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
    expect(screen.getByText('one').className).toContain('var(--dsw-specific-markdown-accent)_10%')
    expect(screen.getByText('one').className).toContain('text-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_85%,var(--tt-text))]')
    fireEvent.click(screen.getByRole('button', { name: 'Remove one tag' }))
    expect(onSetProperty).toHaveBeenCalledWith('tags', ['two'])
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

  it('adds a property from Reading View without existing frontmatter', () => {
    const onAddProperty = vi.fn(() => true)
    render(<RichReadingView onAddProperty={onAddProperty} onToggleTask={() => {}} source="# Lesson\n" title="Lesson note" />)

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

  it('renders property controls for empty frontmatter', () => {
    render(<LivePreviewEditor content={'---\n---\n'} onAddProperty={() => true} onMarkdownChange={() => {}} title="Untitled" />)

    expect(screen.getByRole('button', { name: 'Add Property' })).toBeTruthy()
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

  it('renders resolved local media in Live Preview and Slides while routing external media through the viewer', async () => {
    const mediaSource = '![[../Attachments/pixel.png|16x16]]'
    const onOpenExternalUrl = vi.fn()
    const embeds = [{
      content: 'iVBORw0KGgo=',
      mimeType: 'image/png',
      target: { display: '16x16', fragment: null, kind: 'media' as const, path: 'Attachments/pixel.png', source: mediaSource },
    }]
    const { container, unmount } = render(
      <LivePreviewView
        documentKey="welcome"
        embeds={embeds}
        onEdit={() => {}}
        onOpenExternalUrl={onOpenExternalUrl}
        onToggleTask={() => {}}
        source={`Before ${mediaSource} after\n\n![Remote](https://example.com/image.png)\n`}
        title="Embeds"
      />,
    )
    const rendered = screen.getByLabelText('Live Preview Rendered Content')
    expect(rendered.querySelector('.tocktutor-local-embed img[alt="16x16"][height="16"][width="16"][src="data:image/png;base64,iVBORw0KGgo="]')).toBeTruthy()
    expect(rendered.textContent).not.toContain(mediaSource)
    expect(rendered.querySelector('img[src^="https://"]')).toBeNull()
    fireEvent.click(rendered.querySelector('button[data-external-url="https://example.com/image.png"]')!)
    expect(onOpenExternalUrl).toHaveBeenCalledWith('https://example.com/image.png')
    await waitFor(() => expect(container.querySelector('.ProseMirror')).toBeTruthy(), { timeout: 5_000 })
    unmount()

    render(<MarkdownSlidesView embeds={embeds} source={`Slide ${mediaSource}\n`} />)
    const slides = screen.getByLabelText('Slides Preview')
    expect(slides.querySelector('.tocktutor-local-embed img[height="16"][width="16"][src="data:image/png;base64,iVBORw0KGgo="]')).toBeTruthy()
    expect(slides.textContent).not.toContain(mediaSource)
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
