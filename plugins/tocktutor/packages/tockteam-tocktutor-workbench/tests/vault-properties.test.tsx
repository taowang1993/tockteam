import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { VaultProperties } from '../src/vault-properties.tsx'
import type { VaultFacetsResult } from '../src/types.ts'

afterEach(cleanup)

it('keeps full property names and every inferred type accessible in compact rows', () => {
  const properties: VaultFacetsResult['properties'] = [
    { key: 'a-very-long-property-name-that-needs-truncation', count: 4, types: ['string', 'number'] },
    { key: 'favorite', count: 2, types: ['boolean'] },
    { key: 'points', count: 1, types: ['number'] },
    { key: 'created', count: 1, types: ['date'] },
    { key: 'updated', count: 1, types: ['datetime'] },
    { key: 'tags', count: 2, types: ['list'] },
    { key: 'aliases', count: 2, types: ['list'] },
    { key: 'unset', count: 1, types: ['null'] },
    { key: 'unknown', count: 1, types: [] },
  ]
  const onSearch = vi.fn()
  render(<VaultProperties properties={properties} onSearch={onSearch} />)
  for (const property of properties) {
    const button = screen.getByRole('button', { name: `Search Property ${property.key}` })
    expect(button.title).toBe(`${property.key} · ${property.types.join(', ') || 'Unknown'}`)
    expect(within(button.closest('tr')!).getByText(property.types.join(', ') || 'Unknown')).toBeTruthy()
  }
  fireEvent.click(screen.getByRole('button', { name: `Search Property ${properties[0]!.key}` }))
  expect(onSearch).toHaveBeenCalledWith(properties[0]!.key)
})

it('distinguishes an empty vault from a filtered result and updates with fresh facets', () => {
  const { rerender } = render(<VaultProperties properties={[]} onSearch={() => {}} />)
  expect(screen.getByText('No properties.')).toBeTruthy()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'tags' } })
  rerender(<VaultProperties properties={[{ key: 'status', count: 1, types: ['string'] }]} onSearch={() => {}} />)
  expect(screen.getByText('No matching properties.')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toBe('0 of 1 properties')
  rerender(<VaultProperties properties={[{ key: 'tags', count: 2, types: ['list'] }]} onSearch={() => {}} />)
  expect(screen.getByRole('button', { name: 'Search Property tags' })).toBeTruthy()
  expect(screen.getByRole('status').textContent).toBe('1 of 1 properties')
})
