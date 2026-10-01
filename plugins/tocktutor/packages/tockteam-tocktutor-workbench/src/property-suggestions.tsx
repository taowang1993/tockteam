import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@tockteam/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@tockteam/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@tockteam/ui/popover'

export interface PropertySuggestions {
  names: readonly string[]
  tags: readonly string[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  incomplete: boolean
  onRetry(): void
}

/** Suggestions are optional; the ordinary input always accepts free-form values. */
export function PropertySuggestionMenu(props: {
  label: string
  suggestions: PropertySuggestions
  items: readonly string[]
  value: string
  onSelect(value: string): boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  return <Popover onOpenChange={value => { setOpen(value); if (value) { setQuery(props.value); if (props.suggestions.status === 'idle') props.suggestions.onRetry() } }} open={open}>
    <PopoverTrigger asChild><Button aria-label={props.label} size="icon-xs" type="button" variant="ghost"><ChevronDown aria-hidden="true" /></Button></PopoverTrigger>
    <PopoverContent align="start" className="w-64 p-0" portalled={false} onEscapeKeyDown={event => { event.stopPropagation() }} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation() }}>
      <Command>
        <CommandInput aria-label={`Find ${props.label}`} onValueChange={setQuery} placeholder="Type to filter…" value={query} />
        <CommandList className="max-h-48">
          <CommandEmpty>No matching suggestions. You can enter your own value.</CommandEmpty>
          <CommandGroup heading="Suggestions">
            {[...new Set(props.items)].slice(0, 1_000).map(item => <CommandItem key={item} onSelect={() => { if (props.onSelect(item)) setOpen(false) }} value={item}>{item}</CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
      {props.suggestions.status === 'loading' && <p className="m-0 px-3 py-2 text-xs text-muted-foreground" role="status">Loading suggestions…</p>}
      {props.suggestions.status === 'error' && <div className="px-3 py-2 text-xs"><p className="m-0" role="status">Suggestions could not be loaded. Your input is unchanged.</p><Button onClick={props.suggestions.onRetry} size="xs" type="button" variant="ghost">Retry Suggestions</Button></div>}
      {props.suggestions.incomplete && <p className="m-0 px-3 py-2 text-xs text-muted-foreground" role="status">This is a partial list. You can enter any name or value.</p>}
    </PopoverContent>
  </Popover>
}
