import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BaseNewNoteDialog } from '../src/base-new-note-dialog.tsx'

afterEach(cleanup)

it('does not retry a potentially successful write without inspecting Files', async () => {
  const create = vi.fn(async () => false)
  render(<BaseNewNoteDialog basePath="Projects/Books.base" defaultFolder="Notes" defaultLocation="vault" folders={['Projects', 'Notes']} onCreate={create} onClose={() => {}} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Note Name' }), { target: { value: 'Review' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create Note' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Check Files'))
  expect(screen.getByRole('button', { name: 'Create Note' }).hasAttribute('disabled')).toBe(true)
  expect(create).toHaveBeenCalledTimes(1)
})

it('previews the Obsidian-style note destination and creates it only on confirmation', async () => {
  const create = vi.fn(async () => true), close = vi.fn()
  render(<BaseNewNoteDialog basePath="Projects/Books.base" defaultFolder="Notes" defaultLocation="vault" folders={['Projects', 'Notes']} onCreate={create} onClose={close} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Note Name' }), { target: { value: 'Review' } })
  expect(screen.getByText('Review.md')).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox', { name: 'Note Location' }), { target: { value: 'current' } })
  expect(screen.getByText('Projects/Review.md')).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox', { name: 'Note Location' }), { target: { value: 'folder' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Destination Folder' }), { target: { value: 'Notes' } })
  expect(screen.getByText('Notes/Review.md')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Create Note' }))
  await waitFor(() => expect(create).toHaveBeenCalledWith({ basePath: 'Projects/Books.base', name: 'Review', location: 'folder', folder: 'Notes' }))
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
})
