import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NoteOutline, scrollOutlineHeading } from '../src/note-outline.tsx'
import type { VaultHeading } from '../src/types.ts'

afterEach(cleanup)
const headings: VaultHeading[] = [
  { level: 1, line: 1, selector: 'Guide', text: 'Guide' },
  { level: 3, line: 3, selector: 'Child', text: 'Child' },
  { level: 4, line: 5, selector: 'Detail', text: 'Detail' },
  { level: 2, line: 7, selector: 'Sibling', text: 'Sibling' },
]
it('folds skipped heading levels, expands all, and navigates without folding', () => {
  const onNavigate = vi.fn(() => true)
  render(<NoteOutline headings={headings} onNavigate={onNavigate} />)
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Child' }))
  expect(screen.queryByRole('button', { name: 'Go to Detail' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Go to Sibling' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Collapse All Headings' }))
  expect(screen.queryByRole('button', { name: 'Go to Child' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Expand All Headings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Go to Detail' }))
  expect(onNavigate).toHaveBeenCalledWith(2)
  expect(screen.getByRole('button', { name: 'Go to Detail' }).getAttribute('aria-current')).toBe('location')
  expect(screen.getByRole('button', { name: 'Collapse Child' }).getAttribute('aria-expanded')).toBe('true')
})
it('explains empty and unavailable headings', () => {
  const onNavigate = vi.fn(() => false)
  const { rerender } = render(<NoteOutline headings={[]} onNavigate={onNavigate} />)
  expect(screen.getByText('No headings in this note.')).toBeTruthy()
  rerender(<NoteOutline headings={headings} onNavigate={onNavigate} />)
  fireEvent.click(screen.getByRole('button', { name: 'Go to Child' }))
  expect(screen.getByRole('status').textContent).toContain('not displayed')
})
it('matches formatted duplicate headings and ignores embedded headings', () => {
  const root = document.createElement('div')
  root.innerHTML = '<h2><strong>Repeat</strong></h2><article data-embed-kind="note"><h2>Repeat</h2></article><h2>Repeat</h2>'
  const first = vi.fn(), second = vi.fn()
  const elements = root.querySelectorAll('h2')
  elements[0]!.scrollIntoView = first
  elements[2]!.scrollIntoView = second
  const duplicates = [0, 1].map(index => ({ level: 2, line: index * 2 + 1, selector: `Repeat::${index}`, text: '**Repeat**' }))
  expect(scrollOutlineHeading(root, duplicates, 1)).toBe(true)
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledWith({ block: 'start' })
  expect(scrollOutlineHeading(root, headings, 0)).toBe(false)
  expect(scrollOutlineHeading(null, headings, 0)).toBe(false)
})
