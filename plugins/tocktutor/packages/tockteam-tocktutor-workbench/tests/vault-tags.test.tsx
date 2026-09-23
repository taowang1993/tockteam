import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { VaultTags } from '../src/vault-tags.tsx'

afterEach(cleanup)
const tags = [{ tag: 'zebra', count: 4 }, { tag: 'lesson/intro', count: 2 }, { tag: 'lesson/advanced', count: 3 }, { tag: 'lesson', count: 1 }]
const names = () => within(screen.getByRole('list', { name: 'Vault Tags' })).getAllByRole('button', { name: /^Search Tag / }).map(button => button.getAttribute('aria-label'))

it('sorts tag families and offers a flat view with exact per-tag counts', () => {
  render(<VaultTags tags={tags} onSearch={vi.fn()} />)
  expect(names()).toEqual(['Search Tag lesson', 'Search Tag lesson/advanced', 'Search Tag lesson/intro', 'Search Tag zebra'])
  expect(screen.getByRole('button', { name: 'Search Tag lesson', exact: true }).title).toContain('6 tag uses including nested tags')
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort Tags' }), { target: { value: 'name' } })
  fireEvent.click(screen.getByRole('button', { name: 'Show Nested Tags' }))
  expect(screen.getByRole('button', { name: 'Show Nested Tags' }).getAttribute('aria-pressed')).toBe('false')
  expect(screen.queryByRole('button', { name: 'Collapse Tag lesson' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Search Tag lesson', exact: true }).title).toBe('#lesson · 1 notes')
  expect(screen.getByText('lesson/intro')).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort Tags' }), { target: { value: 'count' } })
  expect(names()[0]).toBe('Search Tag zebra')
})

it('reveals filtered descendants of folded tags and restores folding after clear', () => {
  const onSearch = vi.fn()
  render(<VaultTags tags={tags} onSearch={onSearch} />)
  fireEvent.click(screen.getByRole('button', { name: 'Collapse All Tags' }))
  expect(names()).toEqual(['Search Tag lesson', 'Search Tag zebra'])
  const input = screen.getByRole('searchbox', { name: 'Filter Tags' })
  fireEvent.change(input, { target: { value: ' #INTRO ' } })
  expect(names()).toEqual(['Search Tag lesson', 'Search Tag lesson/intro'])
  expect(screen.getByRole('status').textContent).toBe('1 of 4 tags')
  expect(onSearch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Search Tag lesson/intro' }))
  expect(onSearch).toHaveBeenCalledWith('lesson/intro')
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(document.activeElement).toBe(input)
  expect(names()).toEqual(['Search Tag lesson', 'Search Tag zebra'])
  fireEvent.click(screen.getByRole('button', { name: 'Expand All Tags' }))
  expect(names()).toHaveLength(4)
  fireEvent.change(input, { target: { value: 'missing' } })
  expect(screen.getByText('No matching tags.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear Tag Filter' }))
  expect(document.activeElement).toBe(input)
  expect(names()).toHaveLength(4)
})

it('handles empty and refreshed facets without losing the filter', () => {
  const { rerender } = render(<VaultTags tags={[]} onSearch={vi.fn()} />)
  expect(screen.getByText('No tags.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Collapse All Tags' }).hasAttribute('disabled')).toBe(true)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'new' } })
  rerender(<VaultTags tags={tags} onSearch={vi.fn()} />)
  expect(screen.getByText('No matching tags.')).toBeTruthy()
  rerender(<VaultTags tags={[{ tag: 'new/child', count: 2 }]} onSearch={vi.fn()} />)
  expect(names()).toEqual(['Search Tag new', 'Search Tag new/child'])
  expect(screen.getByRole('status').textContent).toBe('1 of 1 tags')
})

it('merges shared parent casing, preserves full deep paths, and folds branches independently', () => {
  const onSearch = vi.fn()
  render(<VaultTags tags={[{ tag: 'Topic/Child/Long-name', count: 2 }, { tag: 'topic/Other', count: 3 }]} onSearch={onSearch} />)
  expect(screen.getByRole('button', { name: 'Search Tag Topic', exact: true }).title).toContain('5 tag uses')
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Tag Topic/Child' }))
  expect(screen.queryByRole('button', { name: 'Search Tag Topic/Child/Long-name' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Search Tag topic/Other' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Expand Tag Topic/Child' }))
  fireEvent.click(screen.getByRole('button', { name: 'Search Tag Topic/Child/Long-name' }))
  expect(onSearch).toHaveBeenCalledWith('Topic/Child/Long-name')
})
