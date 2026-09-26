import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@tockteam/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@tockteam/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@tockteam/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@tockteam/ui/field'
import { Input } from '@tockteam/ui/input'
import { classifyExternalEmbed } from './external-embeds.ts'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { SlashWriteUncertainError, type SlashLinkContext, type SlashLinkResult } from './markdown-links.ts'

export interface PendingSlashLink {
  kind: 'link' | 'note-link' | 'new-note'
  context?: SlashLinkContext
  isCurrent(): boolean
  insert(href: string, label: string): boolean
  cancel(): void
  restoreFocus(): void
}

export function SlashLinkDialog({ action }: { action: PendingSlashLink }) {
  const id = useId()
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [query, setQuery] = useState('')
  const [path, setPath] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [folder, setFolder] = useState(action.context?.sourcePath.split('/').slice(0, -1).join('/') ?? '')
  const [uncertain, setUncertain] = useState(false)
  const written = useRef<SlashLinkResult | null>(null)
  const destination = `${folder ? `${folder}/` : ''}${name.trim().replace(/\.md$/iu, '')}.md`
  const abort = useRef(new AbortController())
  const submitting = useRef(false)
  useEffect(() => () => abort.current.abort(), [])
  const notes = action.context?.entries.filter(entry => entry.kind === 'document' && /\.(?:md|markdown)$/iu.test(entry.path) && entry.path.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? []
  return <Dialog open onOpenChange={open => { if (!open) action.cancel() }}>
    <DialogContent className="max-h-[calc(100vh-2rem)] overflow-auto" onCloseAutoFocus={event => { event.preventDefault(); action.restoreFocus() }} onEscapeKeyDown={event => event.stopPropagation()}>
      <DialogHeader><DialogTitle>{action.kind === 'link' ? 'Link' : action.kind === 'new-note' ? 'New Note' : 'Link to Note'}</DialogTitle><DialogDescription>Insert an ordinary Markdown link.</DialogDescription></DialogHeader>
      <form className="flex min-w-0 flex-col gap-4" onSubmit={event => {
        event.preventDefault()
        if (submitting.current || uncertain || !action.isCurrent()) return
        const insert = (result: SlashLinkResult) => {
          if (abort.current.signal.aborted || !action.isCurrent() || !action.insert(result.href, label.trim() || result.label)) {
            action.context?.reportUnlinked?.(result)
            if (!abort.current.signal.aborted) setError('The link could not be inserted. Check the note size and try again; any created file is retained.')
          }
        }
        if (action.kind === 'link') {
          const target = classifyExternalEmbed(url)
          if (!target) { setError('Enter a valid public HTTP or HTTPS URL.'); return }
          insert({ href: target.sourceUrl, label: target.sourceUrl })
        } else {
          if (written.current) { insert(written.current); return }
          if (!action.context || (action.kind === 'note-link' && !path)) { setError('Choose a note.'); return }
          if (action.kind === 'new-note' && (!name.trim() || /[\/\\\u0000-\u001f\u007f]/u.test(name))) { setError('Enter a filename without slashes or control characters.'); return }
          submitting.current = true; setBusy(true); setError('')
          void action.context.resolve(action.kind === 'new-note' ? { kind: 'new-note', path: destination } : { kind: 'note', path }, abort.current.signal).then(result => {
            if (result.writtenPath) written.current = result
            insert(result)
          }).catch(reason => {
            if (!abort.current.signal.aborted) { setUncertain(reason instanceof SlashWriteUncertainError); setError(reason instanceof Error ? reason.message : 'The note could not be linked.') }
          }).finally(() => {
            submitting.current = false
            if (!abort.current.signal.aborted) setBusy(false)
          })
        }
      }}>
        <FieldGroup>
          {action.kind === 'link' ? <Field data-invalid={!!error}><FieldLabel htmlFor={`${id}-url`}>URL</FieldLabel><Input id={`${id}-url`} value={url} maxLength={4096} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={event => { setUrl(event.target.value); setError('') }} /></Field>
            : action.kind === 'new-note' ? <>
              <Field><FieldLabel htmlFor={`${id}-name`}>Note Name</FieldLabel><Input id={`${id}-name`} value={name} maxLength={252} disabled={busy || !!written.current || uncertain} onChange={event => setName(event.target.value)} /></Field>
              <Field><FieldLabel htmlFor={`${id}-folder`}>Folder</FieldLabel><NativeSelect id={`${id}-folder`} value={folder} disabled={busy || !!written.current || uncertain} onChange={event => setFolder(event.target.value)}><NativeSelectOption value="">Vault Root</NativeSelectOption>{action.context?.entries.filter(entry => entry.kind === 'directory').map(entry => <NativeSelectOption key={entry.path} value={entry.path}>{entry.path}</NativeSelectOption>)}</NativeSelect></Field>
              <p className="m-0 break-all text-xs text-muted-foreground">{destination}</p>
              <p className="m-0 text-xs text-muted-foreground">Undo removes the link, not the created note.</p>
            </> : <Field><FieldLabel id={`${id}-search-label`}>Search Notes</FieldLabel>
              <Command shouldFilter={false} value={path} onValueChange={setPath}>
                <CommandInput aria-labelledby={`${id}-search-label`} aria-label="Search Notes" value={query} onValueChange={setQuery} disabled={busy} />
                <CommandList aria-label="Notes"><CommandEmpty>No Notes Found</CommandEmpty><CommandGroup>
                  {notes.slice(0, 100).map(entry => <CommandItem key={entry.path} value={entry.path} disabled={busy} onSelect={setPath}><span className="min-w-0 truncate">{entry.path}</span></CommandItem>)}
                </CommandGroup></CommandList>
              </Command>
              {notes.length > 100 && <p className="m-0 text-xs text-muted-foreground">Showing the first 100 notes. Refine your search.</p>}
            </Field>}
          <Field><FieldLabel htmlFor={`${id}-label`}>Display Text</FieldLabel><Input id={`${id}-label`} value={label} maxLength={1000} disabled={busy} onChange={event => setLabel(event.target.value)} /></Field>
        </FieldGroup>
        {busy && <p role="status" className="m-0 text-sm text-muted-foreground">{action.kind === 'new-note' ? 'Creating the note…' : 'Checking the note…'}</p>}
        {error && <p id={`${id}-error`} role="alert" className="m-0 text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={action.cancel}>Cancel</Button><Button type="submit" disabled={busy || uncertain}>{action.kind === 'new-note' && !written.current ? 'Create and Link' : 'Insert Link'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
