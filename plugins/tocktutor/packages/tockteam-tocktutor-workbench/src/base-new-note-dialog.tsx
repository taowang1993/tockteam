import { useId, useState, type FormEvent } from 'react'
import { Button } from '@tockteam/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@tockteam/ui/dialog'
import { Field, FieldLabel } from '@tockteam/ui/field'
import { Input } from '@tockteam/ui/input'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { newBaseNotePath } from './base-note.ts'
import type { TockTutorSettings } from './settings.ts'

export interface BaseNewNoteRequest {
  basePath: string
  name: string
  location: TockTutorSettings['newNoteLocation']
  folder: string
}

export function BaseNewNoteDialog(props: {
  basePath: string
  defaultFolder: string
  defaultLocation: TockTutorSettings['newNoteLocation']
  folders: readonly string[]
  onClose(): void
  onCreate(request: BaseNewNoteRequest): Promise<boolean>
}) {
  const id = useId()
  const [name, setName] = useState('')
  const [location, setLocation] = useState(props.defaultLocation)
  const [folder, setFolder] = useState(props.folders.includes(props.defaultFolder) ? props.defaultFolder : props.folders[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState('')
  const path = newBaseNotePath(props.basePath, name, location, folder, props.folders)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || uncertain || !path) { setError('Enter a note name and choose an available folder.'); return }
    setBusy(true); setError('')
    void props.onCreate({ basePath: props.basePath, name, location, folder }).then(created => {
      if (created) props.onClose()
      else { setUncertain(true); setError('Check Files before trying again; the note may have been created.') }
    }).catch(() => { setUncertain(true); setError('Could not confirm whether the note was created. Refresh Files before retrying.') }).finally(() => setBusy(false))
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) props.onClose() }}>
    <DialogContent className="tocktutor-icons z-[2147483647] max-h-[calc(100vh-2rem)] overflow-auto !bg-[var(--tockteam-shell-chrome,var(--dsw-alias-bg-layer-1))]" overlayClassName="z-[2147483646]">
      <DialogHeader><DialogTitle>New Note</DialogTitle><DialogDescription>Create a Markdown note in the current Base view.</DialogDescription></DialogHeader>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field><FieldLabel htmlFor={`${id}-name`}>Note Name</FieldLabel><Input id={`${id}-name`} autoFocus maxLength={240} value={name} disabled={busy} onChange={event => { setName(event.currentTarget.value); setError('') }} /></Field>
        <Field><FieldLabel htmlFor={`${id}-location`}>Note Location</FieldLabel><NativeSelect id={`${id}-location`} value={location} disabled={busy} onChange={event => { setLocation(event.currentTarget.value as typeof location); setError('') }}>
          <NativeSelectOption value="vault">Vault Folder</NativeSelectOption><NativeSelectOption value="current">Same Folder as Base</NativeSelectOption><NativeSelectOption value="folder">Chosen Folder</NativeSelectOption>
        </NativeSelect></Field>
        {location === 'folder' && <Field><FieldLabel htmlFor={`${id}-folder`}>Destination Folder</FieldLabel><NativeSelect id={`${id}-folder`} value={folder} disabled={busy || props.folders.length === 0} onChange={event => setFolder(event.currentTarget.value)}>
          {props.folders.map(candidate => <NativeSelectOption key={candidate} value={candidate}>{candidate}</NativeSelectOption>)}
        </NativeSelect></Field>}
        {path && <p className="m-0 break-all text-sm text-muted-foreground">{path}</p>}
        {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={props.onClose}>Cancel</Button><Button type="submit" disabled={busy || uncertain || path === null}>Create Note</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
