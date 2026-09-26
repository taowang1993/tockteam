import { useId, useState } from 'react'
import { Button } from '@tockteam/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@tockteam/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@tockteam/ui/field'
import { Input } from '@tockteam/ui/input'
import { classifyExternalEmbed } from './external-embeds.ts'

export interface PendingSlashLink {
  insert(href: string, label: string): boolean
  cancel(): void
  restoreFocus(): void
}

export function SlashLinkDialog({ action }: { action: PendingSlashLink }) {
  const id = useId()
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')
  return <Dialog open onOpenChange={open => { if (!open) action.cancel() }}>
    <DialogContent onCloseAutoFocus={event => { event.preventDefault(); action.restoreFocus() }} onEscapeKeyDown={event => event.stopPropagation()}>
      <DialogHeader><DialogTitle>Link</DialogTitle><DialogDescription>Insert an ordinary Markdown link.</DialogDescription></DialogHeader>
      <form className="flex min-w-0 flex-col gap-4" onSubmit={event => {
        event.preventDefault()
        const target = classifyExternalEmbed(url)
        if (!target) { setError('Enter a valid public HTTP or HTTPS URL.'); return }
        if (!action.insert(target.sourceUrl, label.trim() || target.sourceUrl)) setError('The link could not be inserted. Check the note size and try again.')
      }}>
        <FieldGroup>
          <Field data-invalid={!!error}><FieldLabel htmlFor={`${id}-url`}>URL</FieldLabel><Input id={`${id}-url`} value={url} maxLength={4096} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={event => { setUrl(event.target.value); setError('') }} /></Field>
          <Field><FieldLabel htmlFor={`${id}-label`}>Display Text</FieldLabel><Input id={`${id}-label`} value={label} maxLength={1000} onChange={event => setLabel(event.target.value)} /></Field>
        </FieldGroup>
        {error && <p id={`${id}-error`} role="alert" className="m-0 text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={action.cancel}>Cancel</Button><Button type="submit">Insert Link</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
