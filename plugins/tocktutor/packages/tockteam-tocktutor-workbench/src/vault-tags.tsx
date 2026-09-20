import { Button } from '@tockteam/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@tockteam/ui/empty'
import { Field, FieldGroup } from '@tockteam/ui/field'
import { Input } from '@tockteam/ui/input'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, ListTree, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import type { VaultFacetsResult } from './types.ts'

interface TagNode { path: string; label: string; count: number; children: TagNode[] }

function tagTree(tags: VaultFacetsResult['tags']): TagNode[] {
  const roots: TagNode[] = []
  const nodes = new Map<string, TagNode>()
  for (const tag of tags) {
    let siblings = roots
    let path = ''
    for (const label of tag.tag.split('/')) {
      path = path === '' ? label : `${path}/${label}`
      const key = path.toLocaleLowerCase()
      let node = nodes.get(key)
      if (node === undefined) {
        node = { path, label, count: 0, children: [] }
        nodes.set(key, node)
        siblings.push(node)
      }
      node.count += tag.count
      siblings = node.children
    }
  }
  return roots
}

const controlClass = '[&_svg]:size-4 flex size-7 shrink-0 items-center justify-center rounded border-0 bg-transparent text-[var(--tt-muted)] hover:bg-[var(--tt-selected)] focus-visible:outline focus-visible:outline-[var(--tt-accent)] disabled:opacity-40'

function TagRows({ nodes, collapsed, onToggle, onSearch, nested = false, filtering = false }: {
  nodes: TagNode[]
  collapsed: Set<string>
  onToggle(path: string): void
  onSearch(tag: string): void
  nested?: boolean
  filtering?: boolean
}): ReactNode {
  return <ul aria-label={nested ? undefined : 'Vault Tags'} className={nested ? 'm-0 ml-3 list-none border-l border-[var(--tt-border)] py-0 pl-2 pr-0' : 'm-0 list-none p-0'}>
    {nodes.map(node => {
      const branch = node.children.length > 0
      const folded = !filtering && collapsed.has(node.path)
      const countLabel = branch ? `${String(node.count)} tag uses including nested tags; notes may count more than once` : `${String(node.count)} notes`
      return <li key={node.path}>
        <div className="flex min-w-0 items-center rounded hover:bg-[var(--tt-selected)] focus-within:bg-[var(--tt-selected)]">
          {branch ? <Button unstyled aria-label={`${folded ? 'Expand' : 'Collapse'} Tag ${node.path}`} aria-expanded={!folded} className={controlClass} disabled={filtering} onClick={() => { onToggle(node.path) }} type="button"><ChevronRight aria-hidden="true" className={folded ? '' : 'rotate-90'} data-icon="inline-start" /></Button> : <span aria-hidden="true" className="w-7 shrink-0" />}
          <Button unstyled aria-label={`Search Tag ${node.path}`} className="flex min-h-7 min-w-0 flex-1 items-center gap-2 rounded border-0 bg-transparent py-1 pl-0 pr-1 text-left text-xs focus-visible:outline focus-visible:outline-[var(--tt-accent)]" onClick={() => { onSearch(node.path) }} title={`#${node.path} · ${countLabel}`} type="button">
            <span className="min-w-0 flex-1 truncate">{node.label}</span>
            <span className="shrink-0 text-right tabular-nums text-[var(--tt-muted)]" title={countLabel}>{node.count}</span>
          </Button>
        </div>
        {branch && !folded && <TagRows nodes={node.children} collapsed={collapsed} onToggle={onToggle} onSearch={onSearch} nested filtering={filtering} />}
      </li>
    })}
  </ul>
}

export function VaultTags({ tags, onSearch }: { tags: VaultFacetsResult['tags']; onSearch(tag: string): void }): ReactNode {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('count')
  const [nested, setNested] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const filter = query.trim().replace(/^#/, '').toLocaleLowerCase()
  const roots = nested ? tagTree(tags) : tags.map(tag => ({ path: tag.tag, label: tag.tag, count: tag.count, children: [] }))
  const branches: string[] = []
  const project = (nodes: TagNode[]): TagNode[] => nodes.flatMap(node => {
    if (node.children.length > 0) branches.push(node.path)
    const children = project(node.children)
    return node.path.toLocaleLowerCase().includes(filter) || children.length > 0 ? [{ ...node, children }] : []
  }).toSorted((a, b) => (sort === 'count' ? b.count - a.count : 0) || a.path.localeCompare(b.path))
  const visible = project(roots)
  const matches = tags.filter(tag => tag.tag.toLocaleLowerCase().includes(filter)).length
  const clear = (): void => { setQuery(''); inputRef.current?.focus() }
  const toggle = (path: string): void => { setCollapsed(current => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next }) }
  return <div className="grid min-w-0 gap-2">
    <FieldGroup className="gap-2">
      <Field orientation="horizontal">
        <Input unstyled aria-label="Filter Tags" className="h-8 min-w-0 flex-1 rounded border border-[var(--tt-border)] bg-transparent px-2 text-xs outline-none focus-visible:border-[var(--tt-accent)]" onChange={event => { setQuery(event.target.value) }} onKeyDown={event => { if (event.key === 'Escape' && query !== '') { event.preventDefault(); event.stopPropagation(); clear() } }} placeholder="Filter tags…" ref={inputRef} type="search" value={query} />
        {query !== '' && <Button unstyled aria-label="Clear Tag Filter" className={controlClass} onClick={clear} type="button"><X aria-hidden="true" data-icon="inline-start" /></Button>}
      </Field>
      <Field orientation="horizontal" className="justify-between">
        <NativeSelect unstyled aria-label="Sort Tags" className="min-w-0 max-w-[50%] rounded border-0 bg-[var(--tt-panel)] py-1 text-xs text-[var(--tt-muted)] focus-visible:outline focus-visible:outline-[var(--tt-accent)]" onChange={event => { setSort(event.target.value) }} value={sort}>
          <NativeSelectOption value="count">Most used</NativeSelectOption>
          <NativeSelectOption value="name">Name A–Z</NativeSelectOption>
        </NativeSelect>
        <div className="flex gap-1">
          <Button unstyled aria-label="Show Nested Tags" aria-pressed={nested} className={`${controlClass} aria-pressed:bg-[var(--tt-selected)] aria-pressed:text-[var(--tt-text)]`} onClick={() => { setNested(current => !current) }} title="Show nested tags" type="button"><ListTree aria-hidden="true" data-icon="inline-start" /></Button>
          <Button unstyled aria-label="Expand All Tags" className={controlClass} disabled={branches.length === 0 || filter !== ''} onClick={() => { setCollapsed(new Set()) }} title="Expand all tags" type="button"><ChevronsUpDown aria-hidden="true" data-icon="inline-start" /></Button>
          <Button unstyled aria-label="Collapse All Tags" className={controlClass} disabled={branches.length === 0 || filter !== ''} onClick={() => { setCollapsed(new Set(branches)) }} title="Collapse all tags" type="button"><ChevronsDownUp aria-hidden="true" data-icon="inline-start" /></Button>
        </div>
      </Field>
    </FieldGroup>
    <span className="text-xs text-[var(--tt-muted)]" role="status">{filter === '' ? `${String(tags.length)} tags` : `${String(matches)} of ${String(tags.length)} tags`}</span>
    <TagRows nodes={visible} collapsed={collapsed} onToggle={toggle} onSearch={onSearch} filtering={filter !== ''} />
    {visible.length === 0 && <Empty unstyled className="py-6 text-center"><EmptyHeader unstyled><EmptyTitle unstyled className="text-xs">{tags.length === 0 ? 'No tags.' : 'No matching tags.'}</EmptyTitle><EmptyDescription unstyled className="mt-1 text-xs text-[var(--tt-muted)]">{tags.length === 0 ? 'Add a tag to a note to see it here.' : 'Try another tag or clear the filter.'}</EmptyDescription></EmptyHeader></Empty>}
  </div>
}
