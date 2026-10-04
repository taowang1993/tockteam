import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@tockteam/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@tockteam/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@tockteam/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@tockteam/ui/field'
import { Input } from '@tockteam/ui/input'
import { classifyExternalEmbed } from './external-embeds.ts'
import { ToggleGroup, ToggleGroupItem } from '@tockteam/ui/toggle-group'
import { ATTACHMENT_ACCEPT, isSupportedAttachment } from './attachments.ts'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { SlashWriteUncertainError, type SlashLinkContext, type SlashLinkResult } from './markdown-links.ts'

export interface PendingSlashLink {
  kind: 'link' | 'note-link' | 'new-note' | 'file'
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
  const [fileMode, setFileMode] = useState('existing')
  const [file, setFile] = useState<File | null>(null)
  const attachment = action.kind === 'file'
  const upload = attachment && fileMode === 'upload'
  const searchLabel = attachment ? 'Search Attachments' : 'Search Notes'
  const written = useRef<SlashLinkResult | null>(null)
  const destination = `${folder ? `${folder}/` : ''}${name.trim().replace(/\.md$/iu, '')}.md`
  const abort = useRef(new AbortController())
  const submitting = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    abort.current = controller
    return () => controller.abort()
  }, [])
  const notes = action.context?.entries.filter(entry => (attachment ? entry.kind === 'attachment' && isSupportedAttachment(entry.path) : entry.kind === 'document' && /\.(?:md|markdown)$/iu.test(entry.path)) && entry.path.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? []
  return <Dialog open onOpenChange={open => { if (!open) action.cancel() }}>
    <DialogContent className="tocktutor-slash-link-dialog tocktutor-icons z-[2147483647] max-h-[calc(100vh-2rem)] overflow-auto !bg-[var(--tockteam-shell-chrome,var(--dsw-alias-bg-layer-1))]" overlayClassName="z-[2147483646]" onCloseAutoFocus={event => { event.preventDefault(); action.restoreFocus() }} onEscapeKeyDown={event => event.stopPropagation()}>
      <DialogHeader><DialogTitle>{action.kind === 'link' ? 'Link' : action.kind === 'new-note' ? 'New Note' : attachment ? 'File Attachment' : 'Link to Note'}</DialogTitle><DialogDescription>Insert an ordinary Markdown link.</DialogDescription></DialogHeader>
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
          if (!action.context || ((action.kind === 'note-link' || attachment && !upload) && !path)) { setError('Choose a file from the list.'); return }
          if (upload && (!file || !isSupportedAttachment(file.name) || file.size > 25 * 1024 * 1024)) { setError('Choose a supported image, audio, video or PDF file no larger than 25 MiB.'); return }
          if (action.kind === 'new-note' && (!name.trim() || /[\/\\\u0000-\u001f\u007f]/u.test(name))) { setError('Enter a filename without slashes or control characters.'); return }
          submitting.current = true; setBusy(true); setError('')
          void action.context.resolve(action.kind === 'new-note' ? { kind: 'new-note', path: destination } : upload ? { kind: 'upload', file: file! } : { kind: attachment ? 'attachment' : 'note', path }, abort.current.signal).then(result => {
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
          {attachment && <>
            <ToggleGroup type="single" aria-label="Attachment Source" value={fileMode} onValueChange={value => { if (value) { setFileMode(value); setError(''); setPath('') } }} disabled={busy || !!written.current || uncertain} variant="outline"><ToggleGroupItem value="existing">Existing File</ToggleGroupItem><ToggleGroupItem value="upload">Upload File</ToggleGroupItem></ToggleGroup>
            <p className="m-0 text-xs text-muted-foreground">Images, audio, video and PDF, up to 25 MiB. Inserted as a link, never a player. Undo removes the link, not the stored file.</p>
          </>}
          {upload ? <Field><FieldLabel htmlFor={`${id}-file`}>File</FieldLabel><Input id={`${id}-file`} type="file" accept={ATTACHMENT_ACCEPT} disabled={busy || !!written.current || uncertain} onChange={event => { setFile(event.target.files?.[0] ?? null); setError('') }} /><p className="m-0 break-all text-xs text-muted-foreground">Supported extensions: {ATTACHMENT_ACCEPT.replaceAll(',', ', ')}</p></Field> : action.kind === 'link' ? <Field data-invalid={!!error}><FieldLabel htmlFor={`${id}-url`}>URL</FieldLabel><Input id={`${id}-url`} value={url} maxLength={4096} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={event => { setUrl(event.target.value); setError('') }} /></Field>
            : action.kind === 'new-note' ? <>
              <Field><FieldLabel htmlFor={`${id}-name`}>Note Name</FieldLabel><Input id={`${id}-name`} value={name} maxLength={252} disabled={busy || !!written.current || uncertain} onChange={event => setName(event.target.value)} /></Field>
              <Field><FieldLabel htmlFor={`${id}-folder`}>Folder</FieldLabel><NativeSelect id={`${id}-folder`} value={folder} disabled={busy || !!written.current || uncertain} onChange={event => setFolder(event.target.value)}><NativeSelectOption value="">Vault Root</NativeSelectOption>{action.context?.entries.filter(entry => entry.kind === 'directory').map(entry => <NativeSelectOption key={entry.path} value={entry.path}>{entry.path}</NativeSelectOption>)}</NativeSelect></Field>
              <p className="m-0 break-all text-xs text-muted-foreground">{destination}</p>
              <p className="m-0 text-xs text-muted-foreground">Undo removes the link, not the created note.</p>
            </> : <Field><FieldLabel id={`${id}-search-label`}>{searchLabel}</FieldLabel>
              <Command shouldFilter={false} value={path} onValueChange={setPath}>
                <CommandInput aria-labelledby={`${id}-search-label`} aria-label={searchLabel} value={query} onValueChange={setQuery} disabled={busy} />
                <CommandList aria-label={attachment ? 'Attachments' : 'Notes'}><CommandEmpty>No Files Found</CommandEmpty><CommandGroup>
                  {notes.slice(0, 100).map(entry => <CommandItem key={entry.path} value={entry.path} disabled={busy} onSelect={setPath}><span className="min-w-0 truncate">{entry.path}</span></CommandItem>)}
                </CommandGroup></CommandList>
              </Command>
              {notes.length > 100 && <p className="m-0 text-xs text-muted-foreground">Showing the first 100 files. Refine your search.</p>}
            </Field>}
          <Field><FieldLabel htmlFor={`${id}-label`}>Display Text</FieldLabel><Input id={`${id}-label`} value={label} maxLength={1000} disabled={busy} onChange={event => setLabel(event.target.value)} /></Field>
        </FieldGroup>
        {busy && <p role="status" className="m-0 text-sm text-muted-foreground">{action.kind === 'new-note' ? 'Creating the note…' : upload ? 'Storing the file…' : 'Checking the file…'}</p>}
        {error && <p id={`${id}-error`} role="alert" className="m-0 text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={action.cancel}>Cancel</Button><Button type="submit" disabled={busy || uncertain}>{written.current ? 'Insert Link' : action.kind === 'new-note' ? 'Create and Link' : upload ? 'Upload and Link' : 'Insert Link'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
