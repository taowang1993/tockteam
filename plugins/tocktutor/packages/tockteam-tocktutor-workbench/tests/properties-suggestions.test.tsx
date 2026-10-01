import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MarkdownDocumentHeader } from '../src/live-preview-editor.tsx'

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
HTMLElement.prototype.scrollIntoView = vi.fn()
afterEach(cleanup)
const suggestions = { names: ['status', 'course name', '课程'], tags: ['#indexed/tag', 'already'], status: 'ready' as const, incomplete: false, onRetry: vi.fn() }

it('offers indexed and imported names without duplicate fields and accepts free-form names', async () => {
  const add = vi.fn(() => true)
  render(<MarkdownDocumentHeader editableProperties onAddProperty={add} source={'---\nstatus: active\n---\n'} suggestions={suggestions} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add Property' }))
  fireEvent.click(screen.getByRole('button', { name: 'Property Name Suggestions' }))
  expect(await screen.findByRole('option', { name: 'course name' })).toBeTruthy()
  expect(screen.queryByRole('option', { name: 'status' })).toBeNull()
  fireEvent.click(screen.getByRole('option', { name: 'course name' }))
  expect(add).toHaveBeenCalledWith('course name')
  fireEvent.click(screen.getByRole('button', { name: 'Add Property' }))
  fireEvent.change(screen.getByLabelText('Property Name'), { target: { value: 'my own field' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Add Property' }))
  expect(add).toHaveBeenLastCalledWith('my own field')
})

it('keeps suggestion controls within the owning workbench overlay layer', async () => {
  render(<div data-tockteam-tocktutor-route="true"><MarkdownDocumentHeader editableProperties onAddProperty={() => true} source="" suggestions={suggestions} /></div>)
  fireEvent.click(screen.getByRole('button', { name: 'Add Property' }))
  fireEvent.click(screen.getByRole('button', { name: 'Property Name Suggestions' }))
  expect((await screen.findByRole('option', { name: 'course name' })).closest('[data-tockteam-tocktutor-route]')).toBeTruthy()
})

it('shows recoverable error and incomplete states without losing free-form input', async () => {
  render(<MarkdownDocumentHeader editableProperties onAddProperty={() => true} source="" suggestions={{ ...suggestions, incomplete: true, status: 'error' }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add Property' }))
  fireEvent.change(screen.getByLabelText('Property Name'), { target: { value: 'unfinished' } })
  fireEvent.click(screen.getByRole('button', { name: 'Property Name Suggestions' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Retry Suggestions' }))
  expect(suggestions.onRetry).toHaveBeenCalledOnce()
  expect(screen.getByText(/partial list/u)).toBeTruthy()
  expect((screen.getByLabelText('Property Name') as HTMLInputElement).value).toBe('unfinished')
})

it('supports arrow/Enter selection and dismisses without cancelling the unfinished name', async () => {
  const add = vi.fn(() => true)
  render(<MarkdownDocumentHeader editableProperties onAddProperty={add} source="" suggestions={suggestions} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add Property' }))
  fireEvent.change(screen.getByLabelText('Property Name'), { target: { value: 'unfinished' } })
  fireEvent.click(screen.getByRole('button', { name: 'Property Name Suggestions' }))
  const filter = await screen.findByLabelText('Find Property Name Suggestions')
  fireEvent.keyDown(filter, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByLabelText('Find Property Name Suggestions')).toBeNull())
  expect((screen.getByLabelText('Property Name') as HTMLInputElement).value).toBe('unfinished')
  fireEvent.click(screen.getByRole('button', { name: 'Property Name Suggestions' }))
  const command = await screen.findByLabelText('Find Property Name Suggestions')
  fireEvent.change(command, { target: { value: 'course' } })
  fireEvent.keyDown(command, { key: 'ArrowDown' })
  fireEvent.keyDown(command, { key: 'Enter' })
  await waitFor(() => expect(add).toHaveBeenCalledWith('course name'))
})

it('offers indexed tags, normalizes a selected tag and keeps rejected input', async () => {
  const set = vi.fn(() => false)
  render(<MarkdownDocumentHeader editableProperties onSetProperty={set} source={'---\ntags: [already]\n---\n'} suggestions={suggestions} />)
  fireEvent.change(screen.getByLabelText('New tags Value'), { target: { value: 'unfinished' } })
  fireEvent.click(screen.getByRole('button', { name: 'tags Value Suggestions' }))
  fireEvent.change(await screen.findByLabelText('Find tags Value Suggestions'), { target: { value: 'indexed' } })
  fireEvent.click(await screen.findByRole('option', { name: '#indexed/tag' }))
  await waitFor(() => { expect(set).toHaveBeenCalledWith('tags', ['already', 'indexed/tag']) })
  expect((screen.getByLabelText('New tags Value') as HTMLInputElement).value).toBe('unfinished')
})
