import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownDocumentHeader } from '../src/live-preview-editor.tsx'

afterEach(cleanup)

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const basicSource = '---\nstatus: active\n---\n'
type HeaderProps = Parameters<typeof MarkdownDocumentHeader>[0]

function renderEditableHeader(props: Partial<HeaderProps> = {}) {
  return render(<MarkdownDocumentHeader editableProperties source={basicSource} {...props} />)
}

function openActions(key: string): HTMLElement {
  const trigger = screen.getByRole('button', { name: `Actions for ${key}` })
  fireEvent.keyDown(trigger, { key: 'Enter' })
  return screen.getByRole('menu')
}

function setClipboard(writeText: (value: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
}

describe('editable document properties', () => {
  it('exposes rename, copy, and remove actions for ordinary property names', () => {
    renderEditableHeader({ onRenameProperty: vi.fn(() => true), onRemoveProperty: vi.fn(() => true) })

    expect(screen.getByRole('button', { name: 'Rename Property status' })).toBeTruthy()
    const menu = openActions('status')
    for (const action of ['Rename Property', 'Copy Value', 'Remove Property']) {
      expect(within(menu).getByRole('menuitem', { name: action })).toBeTruthy()
    }
  })

  it('renames from the property name control on Enter and blur', () => {
    const rename = vi.fn(() => true)
    renderEditableHeader({ onRenameProperty: rename })

    fireEvent.click(screen.getByRole('button', { name: 'Rename Property status' }))
    const input = screen.getByRole('textbox', { name: 'Rename Property status' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'lesson-status' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(rename).toHaveBeenCalledExactlyOnceWith('status', 'lesson-status')

    fireEvent.click(screen.getByRole('button', { name: 'Rename Property status' }))
    const blurInput = screen.getByRole('textbox', { name: 'Rename Property status' })
    fireEvent.change(blurInput, { target: { value: 'lesson-state' } })
    fireEvent.blur(blurInput)
    expect(rename).toHaveBeenLastCalledWith('status', 'lesson-state')
  })

  it('retains colliding and rejected rename drafts until Escape cancels them', async () => {
    const rename = vi.fn(() => false)
    renderEditableHeader({
      onRenameProperty: rename,
      source: '---\nstatus: active\nStage: review\n---\n',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Rename Property status' }))
    const input = screen.getByRole('textbox', { name: 'Rename Property status' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'stage' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('alert').textContent).toContain('already exists')
    expect(rename).not.toHaveBeenCalled()
    expect(input.value).toBe('stage')

    fireEvent.change(input, { target: { value: 'attempted-name' } })
    fireEvent.blur(input)
    expect(rename).toHaveBeenCalledExactlyOnceWith('status', 'attempted-name')
    expect(screen.getByRole('alert').textContent).toContain('could not be renamed')
    expect(input.value).toBe('attempted-name')
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rename Property status' })))
    expect(rename).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('textbox', { name: 'Rename Property status' })).toBeNull()
  })

  it('starts an inline rename from the row Actions menu', async () => {
    const rename = vi.fn(() => true)
    renderEditableHeader({ onRenameProperty: rename })
    const menu = openActions('status')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Rename Property' }))
    expect(await screen.findByRole('textbox', { name: 'Rename Property status' })).toBeTruthy()
  })

  it('copies list values as comma-separated text and shows clipboard refusal', async () => {
    const writeText = vi.fn(async () => {})
    setClipboard(writeText)
    renderEditableHeader({ source: '---\ntags: [one, two]\n---\n' })
    fireEvent.click(within(openActions('tags')).getByRole('menuitem', { name: 'Copy Value' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith('one, two'))

    cleanup()
    setClipboard(vi.fn(async () => { throw new Error('denied') }))
    renderEditableHeader()
    fireEvent.click(within(openActions('status')).getByRole('menuitem', { name: 'Copy Value' }))
    expect((await screen.findByRole('alert')).textContent).toContain('could not be copied')
  })

  it('shows clipboard failure when access is missing and copies null as empty text', async () => {
    Reflect.deleteProperty(navigator, 'clipboard')
    renderEditableHeader({ source: '---\nempty: null\n---\n' })
    fireEvent.click(within(openActions('empty')).getByRole('menuitem', { name: 'Copy Value' }))
    expect((await screen.findByRole('alert')).textContent).toContain('could not be copied')

    cleanup()
    const writeText = vi.fn(async () => {})
    setClipboard(writeText)
    renderEditableHeader({ source: '---\nempty: null\n---\n' })
    fireEvent.click(within(openActions('empty')).getByRole('menuitem', { name: 'Copy Value' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith(''))
  })

  it('confirms removal, cancels without writing, and keeps a failed removal open for retry', async () => {
    const remove = vi.fn().mockReturnValueOnce(false).mockReturnValue(true)
    renderEditableHeader({ onRemoveProperty: remove })
    fireEvent.click(within(openActions('status')).getByRole('menuitem', { name: 'Remove Property' }))
    let dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('heading', { name: 'Remove Property “status”?' })).toBeTruthy()
    expect(within(dialog).getByText('This removes the property from this document.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(remove).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()

    fireEvent.click(within(openActions('status')).getByRole('menuitem', { name: 'Remove Property' }))
    dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Property' }))
    expect(remove).toHaveBeenCalledExactlyOnceWith('status')
    expect(within(dialog).getByRole('alert').textContent).toContain('could not be removed')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Property' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(remove).toHaveBeenCalledTimes(2)
  })

  it('dismisses Actions on Escape and outside click, and cancels a pending removal on Escape', async () => {
    const remove = vi.fn(() => true)
    renderEditableHeader({ onRemoveProperty: remove })
    const trigger = screen.getByRole('button', { name: 'Actions for status' })

    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))

    fireEvent.keyDown(trigger, { key: 'Enter' })
    await new Promise(resolve => setTimeout(resolve, 0))
    fireEvent.pointerDown(document.body, { button: 0, ctrlKey: false })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Remove Property' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(remove).not.toHaveBeenCalled()
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('disables rename and removal without callbacks or for mixed properties while keeping copy available', () => {
    renderEditableHeader({ source: '---\nstatus: active\nstructured:\n  nested: true\n---\n' })

    expect((screen.getByRole('button', { name: 'Rename Property status' }) as HTMLButtonElement).disabled).toBe(true)
    const menu = openActions('structured')
    expect(within(menu).getByRole('menuitem', { name: 'Rename Property' }).getAttribute('aria-disabled')).toBe('true')
    expect(within(menu).getByRole('menuitem', { name: 'Remove Property' }).getAttribute('aria-disabled')).toBe('true')
    expect(within(menu).getByRole('menuitem', { name: 'Copy Value' }).getAttribute('aria-disabled')).not.toBe('true')
  })

  it('edits tags, normalizes tags and cssclasses, and keeps ordinary list text exact', () => {
    const set = vi.fn(() => true)
    renderEditableHeader({
      onSetProperty: set,
      source: '---\ntags: [one, two]\ncssclasses: [old-class]\naliases: [Alias]\n---\n',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Edit one in tags' }))
    const tagInput = screen.getByRole('textbox', { name: 'Edit one in tags' })
    fireEvent.change(tagInput, { target: { value: '#New Tag' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })
    expect(set).toHaveBeenCalledWith('tags', ['New-Tag', 'two'])

    const cssInput = screen.getByRole('textbox', { name: 'New cssclasses Value' })
    fireEvent.change(cssInput, { target: { value: '#New CSS Class' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add cssclasses Value' }))
    expect(set).toHaveBeenCalledWith('cssclasses', ['old-class', 'New-CSS-Class'])

    const aliasInput = screen.getByRole('textbox', { name: 'New aliases Value' })
    fireEvent.change(aliasInput, { target: { value: '  Raw Alias  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add aliases Value' }))
    expect(set).toHaveBeenCalledWith('aliases', ['Alias', '  Raw Alias  '])
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alias from aliases' }))
    expect(set).toHaveBeenCalledWith('aliases', [])
  })

  it('retains an unsuccessful chip edit and rejects an empty list item without losing input', () => {
    const set = vi.fn(() => false)
    renderEditableHeader({ onSetProperty: set, source: '---\ntags: [one]\naliases: [Alias]\n---\n' })

    fireEvent.click(screen.getByRole('button', { name: 'Edit one in tags' }))
    const edit = screen.getByRole('textbox', { name: 'Edit one in tags' }) as HTMLInputElement
    fireEvent.change(edit, { target: { value: 'edited' } })
    fireEvent.keyDown(edit, { key: 'Enter' })
    expect(edit.value).toBe('edited')
    expect(screen.getByText(/could not be changed/u)).toBeTruthy()
    expect(set).toHaveBeenCalledWith('tags', ['edited'])

    const add = screen.getByRole('textbox', { name: 'New aliases Value' }) as HTMLInputElement
    fireEvent.change(add, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add aliases Value' }))
    expect(add.value).toBe('   ')
    expect(screen.getByText('Enter a value.')).toBeTruthy()
    expect(set).toHaveBeenCalledTimes(1)
  })

  it('retains a failed scalar value and the draft in the provided map', () => {
    const propertyDrafts = new Map<string, string>()
    const set = vi.fn(() => false)
    renderEditableHeader({ onSetProperty: set, propertyDrafts })
    const scalar = screen.getByRole('textbox', { name: 'Property status' }) as HTMLInputElement
    fireEvent.change(scalar, { target: { value: 'rejected scalar' } })
    fireEvent.blur(scalar)

    expect(screen.getByRole('alert').textContent).toContain('could not be changed')
    expect(scalar.value).toBe('rejected scalar')
    expect([...propertyDrafts.values()]).toContain('rejected scalar')
  })

  it('retains a rejected Add Property name for correction', () => {
    const propertyDrafts = new Map<string, string>()
    const add = vi.fn(() => false)
    renderEditableHeader({ onAddProperty: add, propertyDrafts })
    fireEvent.click(screen.getByRole('button', { name: 'Add Property' }))
    const input = screen.getByRole('textbox', { name: 'Property Name' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'newProperty' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Add Property' }))

    expect(add).toHaveBeenCalledExactlyOnceWith('newProperty')
    expect(input.value).toBe('newProperty')
    expect(screen.getByRole('alert').textContent).toContain('could not be added')
    expect(propertyDrafts.get('tocktutor:properties:add-property')).toBe('newProperty')
  })

  it('keeps unfinished scalar and list input through Properties collapse and expansion', () => {
    renderEditableHeader({ source: '---\nstatus: active\naliases: [Alias]\n---\n' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Property status' }), { target: { value: 'scalar draft' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'New aliases Value' }), { target: { value: 'list draft' } })

    fireEvent.click(screen.getByRole('button', { name: 'Properties', exact: true }))
    expect(screen.queryByRole('textbox', { name: 'Property status' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Properties', exact: true }))
    expect((screen.getByRole('textbox', { name: 'Property status' }) as HTMLInputElement).value).toBe('scalar draft')
    expect((screen.getByRole('textbox', { name: 'New aliases Value' }) as HTMLInputElement).value).toBe('list draft')
  })

  it('preserves scalar and list drafts when another property action runs', async () => {
    Reflect.deleteProperty(navigator, 'clipboard')
    renderEditableHeader({ source: '---\nstatus: active\naliases: [Alias]\nother: value\n---\n' })
    const scalar = screen.getByRole('textbox', { name: 'Property status' }) as HTMLInputElement
    const list = screen.getByRole('textbox', { name: 'New aliases Value' }) as HTMLInputElement
    fireEvent.change(scalar, { target: { value: 'unsaved scalar' } })
    fireEvent.change(list, { target: { value: 'unsaved list' } })

    fireEvent.click(within(openActions('other')).getByRole('menuitem', { name: 'Copy Value' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(scalar.value).toBe('unsaved scalar')
    expect(list.value).toBe('unsaved list')
  })

  it('restores unfinished add, rename, scalar, and chip drafts from the provided map after remount', () => {
    const propertyDrafts = new Map<string, string>()
    const props: Partial<HeaderProps> = {
      onAddProperty: vi.fn(() => false),
      onRenameProperty: vi.fn(() => false),
      onSetProperty: vi.fn(() => false),
      propertyDrafts,
      source: '---\nstatus: active\ntags: [one]\n---\n',
    }
    const view = renderEditableHeader(props)
    fireEvent.change(screen.getByRole('textbox', { name: 'Property status' }), { target: { value: 'scalar draft' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'New tags Value' }), { target: { value: 'list draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Edit one in tags' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit one in tags' }), { target: { value: 'chip draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rename Property status' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Rename Property status' }), { target: { value: 'rename draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Property' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Property Name' }), { target: { value: 'add draft' } })

    view.unmount()
    renderEditableHeader(props)
    expect((screen.getByRole('textbox', { name: 'Property status' }) as HTMLInputElement).value).toBe('scalar draft')
    expect((screen.getByRole('textbox', { name: 'New tags Value' }) as HTMLInputElement).value).toBe('list draft')
    expect((screen.getByRole('textbox', { name: 'Edit one in tags' }) as HTMLInputElement).value).toBe('chip draft')
    expect((screen.getByRole('textbox', { name: 'Rename Property status' }) as HTMLInputElement).value).toBe('rename draft')
    expect((screen.getByRole('textbox', { name: 'Property Name' }) as HTMLInputElement).value).toBe('add draft')
  })

  it('keeps the default read-only header free of new property editing controls', () => {
    render(<MarkdownDocumentHeader
      onRenameProperty={vi.fn(() => true)}
      onRemoveProperty={vi.fn(() => true)}
      onSetProperty={vi.fn(() => true)}
      source={'---\nstatus: active\ntags: [one]\n---\n'}
    />)

    expect(screen.queryByRole('button', { name: 'Actions for status' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rename Property status' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit one in tags' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove one tag' })).toBeTruthy()
  })
})

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
})
