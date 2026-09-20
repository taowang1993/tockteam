import { Button } from '@tockteam/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@tockteam/ui/empty'
import { Field, FieldGroup } from '@tockteam/ui/field'
import { Input } from '@tockteam/ui/input'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { CalendarDays, CheckSquare, Hash, List, Tags, Text, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import type { VaultFacetsResult } from './types.ts'

type Property = VaultFacetsResult['properties'][number]

function propertyIcon(property: Property) {
  if (property.types.length !== 1) return List
  switch (property.types[0]) {
    case 'boolean': return CheckSquare
    case 'number': return Hash
    case 'date':
    case 'datetime': return CalendarDays
    case 'list': return property.key.toLocaleLowerCase() === 'tags' ? Tags : List
    default: return Text
  }
}

export function VaultProperties({ properties, onSearch }: {
  properties: Property[]
  onSearch(key: string): void
}): ReactNode {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('count')
  const inputRef = useRef<HTMLInputElement>(null)
  const filter = query.trim().toLocaleLowerCase()
  const visible = properties.filter(property => property.key.toLocaleLowerCase().includes(filter))
    .toSorted((a, b) => (sort === 'count' ? b.count - a.count : 0) || a.key.localeCompare(b.key))
  const clear = (): void => { setQuery(''); inputRef.current?.focus() }
  return (
    <div className="grid min-w-0 gap-2">
      <FieldGroup className="gap-2">
        <Field orientation="horizontal">
          <Input unstyled aria-label="Filter Properties" className="h-8 min-w-0 flex-1 rounded border border-[var(--tt-border)] bg-transparent px-2 text-xs outline-none focus-visible:border-[var(--tt-accent)]" onChange={event => { setQuery(event.target.value) }} onKeyDown={event => { if (event.key === 'Escape' && query !== '') { event.preventDefault(); event.stopPropagation(); clear() } }} placeholder="Filter properties…" ref={inputRef} type="search" value={query} />
          {query !== '' && <Button unstyled aria-label="Clear Property Filter" className="[&_svg]:size-4 flex size-8 shrink-0 items-center justify-center rounded border-0 bg-transparent text-[var(--tt-muted)] hover:bg-[var(--tt-selected)] focus-visible:outline focus-visible:outline-[var(--tt-accent)]" onClick={clear} type="button"><X aria-hidden="true" data-icon="inline-start" /></Button>}
        </Field>
        <Field orientation="horizontal" className="justify-between">
          <span aria-live="polite" className="text-xs text-[var(--tt-muted)]" role="status">{filter === '' ? `${String(properties.length)} properties` : `${String(visible.length)} of ${String(properties.length)} properties`}</span>
          <NativeSelect unstyled aria-label="Sort Properties" className="max-w-[60%] rounded border-0 bg-[var(--tt-panel)] py-1 text-xs text-[var(--tt-muted)] focus-visible:outline focus-visible:outline-[var(--tt-accent)]" onChange={event => { setSort(event.target.value) }} value={sort}>
            <NativeSelectOption value="count">Most used</NativeSelectOption>
            <NativeSelectOption value="name">Name A–Z</NativeSelectOption>
          </NativeSelect>
        </Field>
      </FieldGroup>
      <table aria-label="Vault Properties" className="w-full table-fixed border-collapse text-xs">
        <colgroup><col /><col className="w-10" /></colgroup>
        <thead className="sr-only"><tr><th scope="col">Property</th><th scope="col">Count</th></tr></thead>
        <tbody>
          {visible.map(property => {
            const Icon = propertyIcon(property)
            const type = property.types.join(', ') || 'Unknown'
            return (
              <tr className="group hover:bg-[var(--tt-selected)] focus-within:bg-[var(--tt-selected)]" key={property.key}>
                <th className="min-w-0 text-left font-normal" scope="row">
                  <Button unstyled aria-label={`Search Property ${property.key}`} className="[&_svg]:size-4 flex w-full min-w-0 items-center gap-2 rounded border-0 bg-transparent px-1 py-1.5 text-left text-xs focus-visible:outline focus-visible:outline-[var(--tt-accent)]" onClick={() => { onSearch(property.key) }} title={`${property.key} · ${type}`} type="button">
                    <Icon aria-hidden="true" className="shrink-0 text-[var(--tt-muted)]" data-icon="inline-start" />
                    <span className="truncate">{property.key}</span>
                  </Button>
                  <span className="sr-only">{type}</span>
                </th>
                <td className="w-10 px-1 text-right tabular-nums text-[var(--tt-muted)]" title={`${String(property.count)} notes`}>{String(property.count)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {visible.length === 0 && <Empty unstyled className="py-6 text-center"><EmptyHeader unstyled><EmptyTitle unstyled className="text-xs">{properties.length === 0 ? 'No properties.' : 'No matching properties.'}</EmptyTitle><EmptyDescription unstyled className="mt-1 text-xs text-[var(--tt-muted)]">{properties.length === 0 ? 'Add properties to a note to see them here.' : 'Try another property name or clear the filter.'}</EmptyDescription></EmptyHeader></Empty>}
    </div>
  )
}
