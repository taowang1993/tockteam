import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MarkdownDocumentHeader } from '../src/live-preview-editor.tsx'

afterEach(cleanup)
function choose(key: string, label: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: `Property Type for ${key}` }), { key: 'Enter' })
  fireEvent.click(screen.getByRole('menuitemradio', { name: label, exact: true }))
}

it('offers all six types, previews conversion and preserves an explicit loss confirmation', async () => {
  const change = vi.fn(async () => true)
  render(<MarkdownDocumentHeader editableProperties onChangePropertyType={change} source={'---\naliases: [one, two]\n---\n'} />)
  choose('aliases', 'Text')
  expect(screen.getByRole('alertdialog')).toBeTruthy()
  expect(screen.getByText(/original value will be lost/u)).toBeTruthy()
  expect(change).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Change Type', exact: true }))
  await waitFor(() => expect(change).toHaveBeenCalledWith('aliases', 'text', true))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

it('keeps property menus in their owning workbench rather than behind its route', () => {
  render(<div data-tockteam-tocktutor-route="true"><MarkdownDocumentHeader editableProperties onChangePropertyType={async () => true} onRemoveProperty={() => true} source={'---\nstatus: active\n---\n'} /></div>)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Property Type for status' }), { key: 'Enter' })
  expect(screen.getByRole('menu').closest('[data-tockteam-tocktutor-route]')).toBeTruthy()
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for status' }), { key: 'Enter' })
  expect(screen.getByRole('menu').closest('[data-tockteam-tocktutor-route]')).toBeTruthy()
})

it('keeps confirmation content and its blocking overlay in the owning workbench', () => {
  render(<div data-tockteam-tocktutor-route="true"><MarkdownDocumentHeader editableProperties onChangePropertyType={async () => true} source={'---\naliases: [one, two]\n---\n'} /></div>)
  choose('aliases', 'Text')
  expect(screen.getByRole('alertdialog').closest('[data-tockteam-tocktutor-route]')).toBeTruthy()
  expect(document.querySelector('[data-slot="alert-dialog-overlay"]')?.closest('[data-tockteam-tocktutor-route]')).toBeTruthy()
})

it('keeps a failed conversion open, reports the cause, and supports retry or cancellation', async () => {
  const change = vi.fn().mockRejectedValueOnce(new Error('Settings changed; reload before retrying.')).mockResolvedValue(true)
  render(<MarkdownDocumentHeader editableProperties onChangePropertyType={change} source={'---\nstatus: "42"\n---\n'} />)
  choose('status', 'Number')
  fireEvent.click(screen.getByRole('button', { name: 'Change Type', exact: true }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Settings changed; reload before retrying.')
  expect(screen.getByRole('alertdialog')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Change Type', exact: true }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(change).toHaveBeenCalledTimes(2)
})

it('rejects invalid conversion and never offers coercion of zoned or structured values', () => {
  const change = vi.fn(async () => true)
  render(<MarkdownDocumentHeader editableProperties onChangePropertyType={change} source={'---\nstatus: word\nzoned: 2026-10-01T12:30:59Z\nnested: {keep: true}\n---\n'} />)
  choose('status', 'Number')
  expect(screen.getByRole('alert').textContent).toMatch(/cannot be converted safely/u)
  expect(change).not.toHaveBeenCalled()
  expect((screen.getByRole('button', { name: 'Property Type for zoned' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByRole('button', { name: 'Property Type for nested' }) as HTMLButtonElement).disabled).toBe(true)
})

it.each([
  { raw: 'null', declaredTypes: undefined },
  { raw: '~', declaredTypes: { field: 'number' as const } },
])('allows assigning a type to an empty $raw value without coercing its content', async ({ raw, declaredTypes }) => {
  const change = vi.fn(async () => true)
  render(<MarkdownDocumentHeader editableProperties onChangePropertyType={change} declaredTypes={declaredTypes} source={`---\nfield: ${raw}\n---\n`} />)
  expect((screen.getByRole('button', { name: 'Property Type for field' }) as HTMLButtonElement).disabled).toBe(false)
  choose('field', 'Text')
  if (raw === '~') {
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(change).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Change Type', exact: true }))
  } else expect(screen.queryByRole('alertdialog')).toBeNull()
  await waitFor(() => expect(change).toHaveBeenCalledWith('field', 'text', false))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})
