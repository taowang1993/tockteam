import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { undo, redo } from '@milkdown/prose/history'
import { Plugin, TextSelection } from '@milkdown/prose/state'
import { afterEach, expect, it, vi } from 'vitest'
import { LivePreviewEditor } from '../src/live-preview-editor.tsx'
import { SlashWriteUncertainError } from '../src/markdown-links.ts'

afterEach(cleanup)

async function editor(source = '# 健康 **Lesson**\n\nBody.\n', props = {}) {
  const editorViewRef = { current: null as any }
  const onChange = vi.fn()
  const commandRef = { current: null }
  const rendered = render(<LivePreviewEditor content={source} commandRef={commandRef} editorViewRef={editorViewRef} onMarkdownChange={onChange} {...props} />)
  await waitFor(() => expect(commandRef.current).toBeTruthy(), { timeout: 10_000 })
  return { ...rendered, view: editorViewRef.current, editorViewRef, onChange }
}

function type(view: any, text: string, position?: number) {
  act(() => {
    if (position !== undefined) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, position)))
    view.focus()
    for (const character of text) {
      const { from, to } = view.state.selection
      if (!view.someProp('handleTextInput', (handler: any) => handler(view, from, to, character))) view.dispatch(view.state.tr.insertText(character))
    }
  })
}

it('inserts a web link at the invocation with one-step undo and no surrounding loss', async () => {
  const { view, onChange } = await editor('# Before after\n')
  type(view, '/url', 7)
  fireEvent.click(await screen.findByRole('option', { name: 'Link', exact: true }))
  expect(view.state.doc.firstChild.textContent).toBe('Before/url after')
  fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://example.com/a?q=1&b=2' } })
  fireEvent.change(screen.getByLabelText('Display Text'), { target: { value: 'A [link]' } })
  fireEvent.click(screen.getByRole('button', { name: 'Insert Link' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(onChange.mock.lastCall?.[0]).toBe('# Before[A \\[link\\]](https://example.com/a?q=1\\&b=2) after\n')
  expect(document.activeElement).toBe(view.dom)
  act(() => { undo(view.state, view.dispatch) })
  expect(view.state.doc.firstChild.textContent).toBe('Before/url after')
  act(() => { redo(view.state, view.dispatch) })
  expect(view.state.doc.firstChild.textContent).toBe('BeforeA [link] after')
})

it('chooses an exact note path and inserts the resolved relative Markdown link', async () => {
  const resolve = vi.fn(async () => ({ href: '../Notes/A%20%231.md', label: 'A #1' }))
  const slashLinks = { sourcePath: 'Drafts/Source.md', entries: [{ kind: 'document', path: 'Notes/A #1.md' }, { kind: 'document', path: 'Other/A #1.md' }], isCurrent: () => true, resolve }
  const { view, onChange } = await editor('Before after\n', { slashLinks })
  type(view, '/link to note', 7)
  fireEvent.click(await screen.findByRole('option', { name: 'Link to Note', exact: true }))
  fireEvent.change(screen.getByLabelText('Search Notes'), { target: { value: 'A #1' } })
  fireEvent.click(screen.getByRole('option', { name: 'Notes/A #1.md', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Insert Link' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(resolve.mock.calls[0]?.[0]).toEqual({ kind: 'note', path: 'Notes/A #1.md' })
  expect(onChange.mock.lastCall?.[0]).toBe('Before[A #1](../Notes/A%20%231.md) after\n')
})

it('creates one note, retains a successful write for insertion retry, and never deletes it on undo', async () => {
  const resolve = vi.fn(async () => ({ href: './New.md', label: 'New', writtenPath: 'Folder/New.md' }))
  const reportUnlinked = vi.fn()
  const slashLinks = { sourcePath: 'Folder/Source.md', entries: [{ kind: 'directory', path: 'Folder' }], isCurrent: () => true, resolve, reportUnlinked }
  const { view, onChange } = await editor('Text\n', { slashLinks })
  type(view, '/new note', 5)
  fireEvent.click(await screen.findByRole('option', { name: 'New Note', exact: true }))
  fireEvent.change(screen.getByLabelText('Note Name'), { target: { value: 'New' } })
  const originalPlugins = view.state.plugins
  act(() => view.updateState(view.state.reconfigure({ plugins: [...originalPlugins, new Plugin({ filterTransaction: tr => !tr.docChanged })] })))
  fireEvent.click(screen.getByRole('button', { name: 'Create and Link' }))
  await screen.findByRole('alert')
  expect(reportUnlinked).toHaveBeenCalledTimes(1)
  expect(view.state.doc.firstChild.textContent).toBe('Text/new note')
  act(() => view.updateState(view.state.reconfigure({ plugins: originalPlugins })))
  fireEvent.click(screen.getByRole('button', { name: 'Insert Link' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(onChange.mock.lastCall?.[0]).toBe('Text[New](./New.md)\n')
  act(() => { undo(view.state, view.dispatch) })
  expect(view.state.doc.firstChild.textContent).toBe('Text/new note')
  expect(resolve).toHaveBeenCalledTimes(1)
})

it('reports a created file after cancellation instead of inserting it or sending another write', async () => {
  let finish: (result: any) => void = () => {}
  const resolve = vi.fn(() => new Promise<any>(next => { finish = next }))
  const reportUnlinked = vi.fn()
  const slashLinks = { sourcePath: 'Source.md', entries: [], isCurrent: () => true, resolve, reportUnlinked }
  const { view } = await editor('Text\n', { slashLinks })
  type(view, '/new note', 5)
  fireEvent.click(await screen.findByRole('option', { name: 'New Note', exact: true }))
  fireEvent.change(screen.getByLabelText('Note Name'), { target: { value: 'New' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create and Link' }))
  fireEvent.click(screen.getByRole('button', { name: 'Create and Link' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  const result = { href: './New.md', label: 'New', writtenPath: 'New.md' }
  await act(async () => { finish(result); await Promise.resolve() })
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(reportUnlinked).toHaveBeenCalledWith(result)
  expect(view.state.doc.firstChild.textContent).toBe('Text/new note')
})

it('uploads a file as an ordinary Markdown link and retains the original catalog in Media', async () => {
  const resolve = vi.fn(async () => ({ href: '../Attachments/Clip.mp4', label: 'Clip.mp4', writtenPath: 'Attachments/Clip.mp4' }))
  const slashLinks = { sourcePath: 'Folder/Source.md', entries: [], isCurrent: () => true, resolve }
  const { view, onChange } = await editor('Text\n', { slashLinks })
  type(view, '/', 5)
  await screen.findByRole('listbox')
  expect(screen.getAllByRole('option')).toHaveLength(20)
  expect(screen.getByRole('option', { name: 'Code Block' }).closest('[cmdk-group]')?.textContent).toContain('Media')
  fireEvent.click(screen.getByRole('option', { name: 'File Attachment', exact: true }))
  fireEvent.click(screen.getByRole('radio', { name: 'Upload File' }))
  const file = new File(['video'], 'Clip.mp4', { type: 'video/mp4' })
  fireEvent.change(screen.getByLabelText('File'), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Upload and Link' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(resolve.mock.calls[0]?.[0]).toEqual({ kind: 'upload', file })
  expect(onChange.mock.lastCall?.[0]).toBe('Text[Clip.mp4](../Attachments/Clip.mp4)\n')
  expect(view.dom.querySelector('video')).toBeNull()
})

it('does not resend an uncertain filesystem write from the same form', async () => {
  const resolve = vi.fn(async () => { throw new SlashWriteUncertainError('New.md') })
  const slashLinks = { sourcePath: 'Source.md', entries: [], isCurrent: () => true, resolve }
  const { view } = await editor('Text\n', { slashLinks })
  type(view, '/new note', 5)
  fireEvent.click(await screen.findByRole('option', { name: 'New Note', exact: true }))
  fireEvent.change(screen.getByLabelText('Note Name'), { target: { value: 'New' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create and Link' }))
  expect((await screen.findByRole('alert')).textContent).toContain('uncertain')
  expect((screen.getByRole('button', { name: 'Create and Link' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Create and Link' }))
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(view.state.doc.firstChild.textContent).toBe('Text/new note')
})

it('permanently dismisses a pending form when the editor becomes read-only', async () => {
  const { view } = await editor('Text\n')
  type(view, '/url', 5)
  fireEvent.click(await screen.findByRole('option', { name: 'Link', exact: true }))
  act(() => view.setProps({ editable: () => false }))
  expect(screen.queryByRole('dialog')).toBeNull()
  act(() => view.setProps({ editable: () => true }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(view.state.doc.firstChild.textContent).toBe('Text/url')
})

it('keeps invalid link drafts and cancels without changing the document', async () => {
  const { view } = await editor('Text\n')
  type(view, '/url', 5)
  fireEvent.click(await screen.findByRole('option', { name: 'Link', exact: true }))
  fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'javascript:alert(1)' } })
  fireEvent.click(screen.getByRole('button', { name: 'Insert Link' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Enter a valid public HTTP or HTTPS URL.')
  expect(view.state.doc.firstChild.textContent).toBe('Text/url')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(view.state.doc.firstChild.textContent).toBe('Text/url')
})

it('invalidates a pending link form on content edits and peer source replacement', async () => {
  const { view, rerender, editorViewRef } = await editor('Text\n')
  type(view, '/url', 5)
  fireEvent.click(await screen.findByRole('option', { name: 'Link', exact: true }))
  act(() => view.dispatch(view.state.tr.insertText('!', 1)))
  expect(screen.queryByRole('dialog')).toBeNull()
  type(view, '/url', 1)
  fireEvent.click(await screen.findByRole('option', { name: 'Link', exact: true }))
  rerender(<LivePreviewEditor content={'Other Note\n'} editorViewRef={editorViewRef} onMarkdownChange={() => {}} />)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(view.state.doc.firstChild.textContent).toBe('Other Note')
})

it.each([
  ['text', 'paragraph', undefined], ['h1', 'heading', 1], ['h3', 'heading', 3], ['h4', 'heading', 4], ['h5', 'heading', 5], ['h6', 'heading', 6],
  ['quote', 'blockquote', undefined], ['bullet', 'bullet_list', undefined], ['numbered', 'ordered_list', undefined],
  ['todo', 'bullet_list', undefined], ['code', 'code_block', undefined],
])('converts existing text with %s and preserves command undo', async (query, nodeType, level) => {
  const { view } = await editor('Before after\n')
  type(view, '/' + query, 7)
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1))
  fireEvent.keyDown(view.dom, { key: 'Enter' })
  expect(view.state.doc.firstChild.type.name).toBe(nodeType)
  expect(view.state.doc.firstChild.textContent).toBe('Before after')
  if (level) expect(view.state.doc.firstChild.attrs.level).toBe(level)
  if (query === 'todo') expect(view.state.doc.firstChild.firstChild.attrs.checked).toBe(false)
  act(() => { undo(view.state, view.dispatch) })
  expect(view.state.doc.firstChild.textContent).toBe('Before/' + query + ' after')
})

it.each([['divider', 'hr'], ['table', 'table'], ['image', 'image-block'], ['math', 'code_block']])('inserts %s after nonempty content without dropping its suffix', async (query, nodeType) => {
  const { view } = await editor('Before after\n')
  type(view, '/' + query, 7)
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1))
  fireEvent.keyDown(view.dom, { key: 'Enter' })
  expect(view.state.doc.firstChild.textContent).toBe('Before after')
  expect(view.state.doc.child(1).type.name).toBe(nodeType)
  act(() => { undo(view.state, view.dispatch) })
  expect(view.state.doc.firstChild.textContent).toBe('Before/' + query + ' after')
  expect(view.state.doc.childCount).toBe(1)
})

it.each([['divider', 'hr'], ['table', 'table'], ['image', 'image-block'], ['math', 'code_block']])('replaces an empty invocation block with %s', async (query, nodeType) => {
  const { view } = await editor('')
  type(view, '/' + query, 1)
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1))
  fireEvent.keyDown(view.dom, { key: 'Enter' })
  expect(view.state.doc.firstChild.type.name).toBe(nodeType)
  act(() => { undo(view.state, view.dispatch) })
  expect(view.state.doc.firstChild.textContent).toBe('/' + query)
})

it('never opens in a read-only editor or while replacing a selection', async () => {
  const { view } = await editor('Text\n')
  act(() => view.setProps({ editable: () => false }))
  expect(view.someProp('handleTextInput', (handler: any) => handler(view, 1, 1, '/'))).toBeFalsy()
  act(() => { view.setProps({ editable: () => true }); view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 3))) })
  expect(view.someProp('handleTextInput', (handler: any) => handler(view, 1, 3, '/'))).toBeFalsy()
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(view.state.doc.firstChild.textContent).toBe('Text')
})

it.each([['# Loaded /h2\n', 12], ['```\ncode\n```\n', 2], ['`code`\n', 2], ['https:\n', 7]])('does not trigger in excluded contexts: %s', async (source, pos) => {
  const { view } = await editor(source)
  expect(screen.queryByRole('listbox')).toBeNull()
  if (!source.startsWith('#')) type(view, '/', pos)
  expect(screen.queryByRole('listbox')).toBeNull()
})

it('dismisses without deleting text, suppresses reopening, and reports empty results', async () => {
  const { view } = await editor('Text\n')
  type(view, '/h2', 5)
  await screen.findByRole('option', { name: 'Heading 2' })
  fireEvent.keyDown(view.dom, { key: 'Escape' })
  expect(screen.queryByRole('listbox')).toBeNull()
  type(view, ' literal')
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(view.state.doc.firstChild.textContent).toBe('Text/h2 literal')
  type(view, '/nomatches')
  await screen.findByRole('listbox')
  expect(screen.queryByRole('option')).toBeNull()
  expect(screen.getByRole('status').textContent).toBe('No Results')
  fireEvent.keyDown(view.dom, { key: 'Enter' })
  expect(view.state.doc.textContent).toContain('/nomatches')
})

it('dismisses on Shift+Enter without consuming the query or the line break', async () => {
  const { view } = await editor('# Text\n')
  type(view, '/h2', 5)
  await screen.findByRole('option', { name: 'Heading 2' })
  fireEvent.keyDown(view.dom, { key: 'Enter', shiftKey: true })
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(view.state.doc.firstChild.textContent).toBe('Text/h2\n')
  expect(view.state.doc.firstChild.lastChild.type.name).toBe('hardbreak')
})

it('keeps keyboard selection visible while navigating beyond the menu viewport', async () => {
  const scrollIntoView = vi.fn()
  const original = HTMLElement.prototype.scrollIntoView
  HTMLElement.prototype.scrollIntoView = scrollIntoView
  try {
    const { view } = await editor('Text\n')
    type(view, '/', 5)
    await screen.findByRole('listbox', { name: 'Block Commands' })
    scrollIntoView.mockClear()
    const selected = screen.getByRole('option', { name: 'Task List' })
    const steps = screen.getAllByRole('option').indexOf(selected)
    for (let index = 0; index < steps; index++) fireEvent.keyDown(view.dom, { key: 'ArrowDown' })
    expect(selected.getAttribute('aria-selected')).toBe('true')
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    expect(scrollIntoView.mock.instances.at(-1)).toBe(selected)
    for (let index = 0; index < steps; index++) fireEvent.keyDown(view.dom, { key: 'ArrowUp' })
    expect(scrollIntoView.mock.instances).toContain(screen.getByText('Basic Blocks').closest('[cmdk-group-heading]'))
    expect(document.activeElement).toBe(view.dom)
  } finally {
    HTMLElement.prototype.scrollIntoView = original
  }
})

it('keeps keyboard and pointer selection accessible without moving focus to a search field', async () => {
  const { view } = await editor('Text\n')
  type(view, '/', 5)
  const list = await screen.findByRole('listbox', { name: 'Block Commands' })
  expect(view.dom.getAttribute('aria-controls')).toBe(list.id)
  fireEvent.keyDown(view.dom, { key: 'ArrowDown' })
  await waitFor(() => expect(document.getElementById(view.dom.getAttribute('aria-activedescendant'))?.textContent).toBe('Heading 1'))
  expect(document.activeElement).toBe(view.dom)
  fireEvent.click(screen.getByRole('option', { name: 'Heading 2' }))
  expect(view.state.doc.firstChild.attrs.level).toBe(2)
  expect(view.dom.hasAttribute('aria-controls')).toBe(false)
  expect(document.activeElement).toBe(view.dom)
})

it('closes during composition, paste, outside interaction, and trigger removal', async () => {
  const { view } = await editor('Text\n')
  for (const close of ['composition', 'paste', 'outside', 'backspace']) {
    type(view, '/', view.state.doc.firstChild.nodeSize - 1)
    await screen.findByRole('listbox')
    if (close === 'composition') fireEvent.compositionStart(view.dom)
    if (close === 'paste') act(() => { view.someProp('handleDOMEvents', (handlers: any) => { if (handlers.paste) { handlers.paste(view, new Event('paste')); return true } }) })
    if (close === 'outside') fireEvent.pointerDown(document.body)
    if (close === 'backspace') act(() => { const pos = view.state.selection.from; view.dispatch(view.state.tr.delete(pos - 1, pos)) })
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.compositionEnd(view.dom)
  }
})

it('refuses a filtered transaction without deleting the query and closes on peer replacement', async () => {
  const { view, rerender, editorViewRef } = await editor('Text\n')
  type(view, '/h2', 5)
  const stale = await screen.findByRole('option', { name: 'Heading 2' })
  act(() => view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, new Plugin({ filterTransaction: tr => !tr.docChanged })] })))
  fireEvent.keyDown(view.dom, { key: 'Enter' })
  expect(view.state.doc.firstChild.textContent).toBe('Text/h2')
  rerender(<LivePreviewEditor content={'Other Note\n'} editorViewRef={editorViewRef} onMarkdownChange={() => {}} />)
  await waitFor(() => expect(view.state.doc.firstChild.textContent).toBe('Other Note'))
  expect(screen.queryByRole('listbox')).toBeNull()
  fireEvent.click(stale)
  expect(view.state.doc.firstChild.textContent).toBe('Other Note')
})

it('does not publish an image upload into a changed document and permits a retry', async () => {
  let finish: (url: string) => void = () => {}
  const onUploadImage = vi.fn(() => new Promise<string>(resolve => { finish = resolve }))
  const { view, container } = await editor('Text\n', { onUploadImage })
  type(view, '/image', 5)
  await screen.findByRole('option', { name: 'Image' })
  fireEvent.keyDown(view.dom, { key: 'Enter' })
  const input = await waitFor(() => { const input = container.querySelector('input[type="file"]'); expect(input).toBeTruthy(); return input! })
  fireEvent.change(input, { target: { files: [new File(['image'], 'test.png', { type: 'image/png' })] } })
  expect(onUploadImage).toHaveBeenCalledTimes(1)
  type(view, '!', 1)
  await act(async () => { finish('attachments/old.png'); await Promise.resolve() })
  expect(view.state.doc.child(1).attrs.src).toBe('')
  fireEvent.change(input, { target: { files: [new File(['image'], 'test.png', { type: 'image/png' })] } })
  await act(async () => { finish('attachments/new.png'); await Promise.resolve() })
  expect(view.state.doc.child(1).attrs.src).toBe('attachments/new.png')
  expect(view.state.doc.firstChild.textContent).toBe('!Text')
})

it('removes overlays and their accessibility links when the editor is destroyed', async () => {
  const { view, unmount } = await editor('Text\n')
  type(view, '/', 5)
  await screen.findByRole('listbox')
  unmount()
  await waitFor(() => expect(document.querySelector('.tocktutor-slash-menu, .tocktutor-block-handle')).toBeNull())
  expect(view.dom.hasAttribute('aria-controls')).toBe(false)
})

it('converts an existing heading without losing its prefix, marked suffix, or command undo boundary', async () => {
  const { view, container, onChange } = await editor()
  type(view, '/h2', 3)
  await screen.findByRole('option', { name: 'Heading 2' })
  expect(document.activeElement).toBe(view.dom)
  fireEvent.keyDown(view.dom, { key: 'Enter' })
  expect(container.querySelector('.ProseMirror > h2')?.textContent).toBe('健康 Lesson')
  expect(container.querySelector('.ProseMirror > h2 strong')?.textContent).toBe('Lesson')
  expect(onChange.mock.lastCall?.[0]).toBe('## 健康 **Lesson**\n\nBody.\n')
  act(() => { expect(undo(view.state, view.dispatch)).toBe(true) })
  expect(view.state.doc.firstChild.type.name).toBe('heading')
  expect(view.state.doc.firstChild.attrs.level).toBe(1)
  expect(view.state.doc.firstChild.textContent).toBe('健康/h2 Lesson')
  act(() => { expect(redo(view.state, view.dispatch)).toBe(true) })
  expect(view.state.doc.firstChild.attrs.level).toBe(2)
  expect(view.state.doc.firstChild.textContent).toBe('健康 Lesson')
})
