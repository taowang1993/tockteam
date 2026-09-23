import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '@tockteam/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@tockteam/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@tockteam/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@tockteam/ui/field'
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select'
import { mergePropertyConflicts, type ComposerPropertyConflict } from './composer.ts'
import type { MergeSourceDisposition, NoteMergePreview, PreparedNoteMerge } from './merge-preview.ts'
import { isSafeVaultRelativePath } from './session.ts'

export interface NoteMergeReviewProps {
  sourcePath: string
  paths: readonly string[]
  onPrepare(path: string, signal: AbortSignal): Promise<PreparedNoteMerge>
  onClose(): void
}

/** Review stays non-mutating; only explicit confirmation invokes the optional Host-owned apply. */
export function NoteMergeReview(props: NoteMergeReviewProps): ReactNode {
  return <MergeReviewContent key={props.sourcePath} {...props} />
}

function MergeReviewContent(props: NoteMergeReviewProps): ReactNode {
  const id = useId()
  const returnFocus = useRef(typeof document === 'undefined' ? null : document.activeElement)
  const [query, setQuery] = useState('')
  const [prepared, setPrepared] = useState<PreparedNoteMerge | null>(null)
  const [conflicts, setConflicts] = useState<ComposerPropertyConflict[]>([])
  const [choices, setChoices] = useState<Record<string, 'source' | 'destination'>>({})
  const [placement, setPlacement] = useState<'append' | 'prepend'>('append')
  const [disposition, setDisposition] = useState<MergeSourceDisposition>('trash')
  const [preview, setPreview] = useState<NoteMergePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const preparation = useRef<AbortController | null>(null)
  const request = useRef<AbortController | null>(null)
  const applying = useRef(false)
  const [applied, setApplied] = useState(false)
  useEffect(() => () => { preparation.current?.abort(); request.current?.abort() }, [])
  useEffect(() => {
    if (!prepared) return
    const invalidate = (): void => {
      if (applying.current) return
      request.current?.abort()
      setPreview(null)
      setPrepared(null)
      setPending(false)
      setError('The notes or their view changed. Select a destination again.')
    }
    if (prepared.signal.aborted) invalidate()
    else prepared.signal.addEventListener('abort', invalidate, { once: true })
    return () => { prepared.signal.removeEventListener('abort', invalidate) }
  }, [prepared])
  const invalidatePreview = (): void => {
    request.current?.abort()
    setPreview(null)
    setError(null)
    setPending(false)
  }
  const close = (): void => { preparation.current?.abort(); request.current?.abort(); props.onClose() }
  const select = async (path: string, prepend = false): Promise<void> => {
    preparation.current?.abort()
    const abort = new AbortController()
    preparation.current = abort
    invalidatePreview()
    setPrepared(null)
    setChoices({})
    setPlacement(prepend ? 'prepend' : 'append')
    setPending(true)
    try {
      const result = await props.onPrepare(path, abort.signal)
      abort.signal.throwIfAborted()
      result.signal.throwIfAborted()
      if (result.source.path !== props.sourcePath || result.destination.path !== path) throw new Error('The selected notes changed. Select a destination again.')
      const nextConflicts = mergePropertyConflicts(result.source.content, result.destination.content)
      setConflicts(nextConflicts)
      setPrepared(result)
    } catch (cause) {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'The notes could not be read.')
    } finally {
      if (!abort.signal.aborted) setPending(false)
    }
  }
  const review = async (): Promise<void> => {
    if (!prepared || prepared.signal.aborted || pending || conflicts.some(({ key }) => !Object.hasOwn(choices, key))) return
    invalidatePreview()
    const abort = new AbortController()
    request.current = abort
    const signal = AbortSignal.any([abort.signal, prepared.signal])
    setPending(true)
    try {
      const result = await prepared.preview({ placement, sourceDisposition: disposition, propertyChoices: choices }, signal)
      signal.throwIfAborted()
      setPreview(result)
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'The merge could not be previewed.')
    } finally {
      if (!signal.aborted) setPending(false)
    }
  }
  const confirm = async (): Promise<void> => {
    if (!preview || !prepared?.apply || pending || applied || applying.current || (preview.plan.requiresKeepSource && disposition !== 'keep')) return
    const abort = new AbortController(); request.current = abort; applying.current = true
    setPending(true); setError(null)
    try {
      const result = await prepared.apply(preview, abort.signal)
      setApplied(true)
      if (result.status === 'applied') close()
      else setError('Merge interrupted. Close this dialog and open Merge Recovery to restore originals as new notes. Current edits will not be overwritten.')
    } catch (cause) {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Merge did not finish. Check Merge Recovery before retrying.')
    } finally { applying.current = false; if (!abort.signal.aborted) setPending(false) }
  }
  const canonical = (path: string): string => path.normalize('NFC').toLowerCase()
  const candidates = [...new Set(props.paths)].filter(path => isSafeVaultRelativePath(path) && /\.(?:md|markdown)$/iu.test(path)
    && canonical(path) !== canonical(props.sourcePath) && canonical(path).includes(canonical(query))).sort()
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent unstyled className="fixed top-1/2 left-1/2 z-[2147483647] box-border flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-border bg-surface p-5 text-sm text-foreground shadow-xl" overlayClassName="z-[2147483646]" showCloseButton={false} onCloseAutoFocus={event => {
      if (returnFocus.current instanceof HTMLElement && returnFocus.current.isConnected) { event.preventDefault(); returnFocus.current.focus() }
    }}>
      <DialogTitle>Merge Entire File With</DialogTitle>
      <DialogDescription className="whitespace-pre-wrap break-words">{prepared ? `Review merging ${props.sourcePath} into ${prepared.destination.path}.` : `Choose where to merge ${props.sourcePath}.`} No merge changes are written during review; any unsaved changes are saved first.</DialogDescription>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!prepared ? <Command shouldFilter={false} onKeyDownCapture={event => {
          if (event.key === 'Enter' && event.shiftKey) {
            const path = event.currentTarget.querySelector('[cmdk-item][data-selected="true"]')?.getAttribute('data-merge-path')
            if (path && candidates.includes(path)) { event.preventDefault(); event.stopPropagation(); void select(path, true) }
          }
        }}>
          <CommandInput autoFocus aria-label="Merge Destination" placeholder="Search note paths…" value={query} onValueChange={setQuery} disabled={pending} />
          <CommandList aria-label="Merge Destinations">
            <CommandEmpty>No Matching Notes</CommandEmpty>
            <CommandGroup>{candidates.slice(0, 200).map(path => <CommandItem className="whitespace-pre-wrap break-all" disabled={pending} key={path} value={JSON.stringify(path)} data-merge-path={path} onSelect={() => { void select(path) }}>{path}</CommandItem>)}</CommandGroup>
          </CommandList>
          {candidates.length > 200 && <p className="text-muted-foreground">Showing the first 200 matches. Narrow your search to find another note.</p>}
        </Command> : <FieldGroup>
          <p className="whitespace-pre-wrap break-all">Destination: {prepared.destination.path}</p>
          <Field><FieldLabel htmlFor={`${id}-placement`}>Placement</FieldLabel><NativeSelect disabled={pending || applied} autoFocus id={`${id}-placement`} value={placement} onChange={event => { invalidatePreview(); setPlacement(event.target.value as typeof placement) }}>
            <NativeSelectOption value="append">Append to Destination</NativeSelectOption><NativeSelectOption value="prepend">Prepend to Destination</NativeSelectOption>
          </NativeSelect></Field>
          <Field><FieldLabel htmlFor={`${id}-source`}>Original Note</FieldLabel><NativeSelect disabled={pending || applied} id={`${id}-source`} value={disposition} onChange={event => { invalidatePreview(); setDisposition(event.target.value as MergeSourceDisposition) }}>
            <NativeSelectOption value="trash">Move to Trash After Confirmation</NativeSelectOption><NativeSelectOption value="keep">Keep Original</NativeSelectOption><NativeSelectOption value="link">Replace With a Link</NativeSelectOption><NativeSelectOption value="embed">Replace With an Embed</NativeSelectOption>
          </NativeSelect></Field>
          {conflicts.map((conflict, index) => <Field key={conflict.key}>
            <FieldLabel htmlFor={`${id}-property-${index}`}>Value for {conflict.key}</FieldLabel>
            <div className="grid gap-2 sm:grid-cols-2">
              <div><p>Source</p><pre className="whitespace-pre-wrap break-words">{conflict.source}</pre></div>
              <div><p>Destination</p><pre className="whitespace-pre-wrap break-words">{conflict.destination}</pre></div>
            </div>
            <NativeSelect disabled={applying.current || applied} id={`${id}-property-${index}`} value={Object.hasOwn(choices, conflict.key) ? choices[conflict.key] : ''} onChange={event => {
              invalidatePreview()
              const value = event.target.value
              setChoices(current => {
                if (value === 'source' || value === 'destination') return { ...current, [conflict.key]: value }
                const next = { ...current }; delete next[conflict.key]; return next
              })
            }}><NativeSelectOption value="">Choose a Value</NativeSelectOption><NativeSelectOption value="source">Keep Source Value</NativeSelectOption><NativeSelectOption value="destination">Keep Destination Value</NativeSelectOption></NativeSelect>
          </Field>)}
          {preview && <section aria-label="Merge Preview" className="flex flex-col gap-3">
            <h3>Merge Preview</h3>
            <p className="whitespace-pre-wrap break-words">{preview.sourceDisposition === 'keep' ? `${props.sourcePath} will be kept unchanged.` : preview.sourceDisposition === 'trash' ? `${props.sourcePath} will move to recoverable trash only after confirmation.` : `${props.sourcePath} will be replaced with the ${preview.sourceDisposition} shown below, only after confirmation.`}</p>
            {preview.plan.requiresKeepSource && preview.sourceDisposition !== 'keep' && <p role="note">Some links cannot be repaired safely. Choose Keep Original and preview again before confirming a merge.</p>}
            {preview.plan.warnings.length > 0 && <details><summary>Link Warnings ({preview.plan.warnings.length})</summary><ul>{preview.plan.warnings.map(warning => <li className="break-words" key={warning}>{warning}</li>)}</ul></details>}
            <details open><summary>Destination Content</summary><pre aria-label="Destination Content" className="max-h-72 overflow-auto whitespace-pre-wrap break-words">{preview.destinationContent}</pre></details>
            {preview.sourceContent !== null && <details open><summary>Original Note Content</summary><pre aria-label="Original Note Content" className="whitespace-pre-wrap break-words">{preview.sourceContent}</pre></details>}
            <details><summary>Other Notes to Update ({preview.plan.updates.length})</summary>{preview.plan.updates.map(update => <details key={update.path}><summary className="break-all">{update.path}</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words">{update.newContent}</pre></details>)}</details>
            <p className="text-muted-foreground">{applied ? 'Check Merge Recovery for the retained originals.' : 'No merge has been applied. Confirm Merge writes these changes; originals remain recoverable as new notes.'}</p>
          </section>}
        </FieldGroup>}
      </div>
      {pending && <p role="status">{applying.current ? 'Applying the reviewed merge…' : prepared ? 'Checking links and preparing the preview…' : 'Saving drafts and reading the selected notes…'}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <DialogFooter className="shrink-0">
        <Button variant="outline" onClick={close}>Cancel</Button>
        {prepared && <><Button variant="outline" disabled={pending || applied} onClick={() => { preparation.current?.abort(); invalidatePreview(); setPrepared(null) }}>Change Destination</Button><Button variant="secondary" disabled={pending || applied || conflicts.some(({ key }) => !Object.hasOwn(choices, key))} onClick={() => { void review() }}>Preview Merge</Button></>}
        {preview && prepared?.apply && <Button disabled={pending || applied || (preview.plan.requiresKeepSource && disposition !== 'keep')} onClick={() => { void confirm() }}>Confirm Merge</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

export function MergeRecoveryDialog(props: {
  onList(signal: AbortSignal, cursor?: string): Promise<import('./types.ts').MergeListResult>
  onRecover(id: string, signal: AbortSignal): Promise<import('./types.ts').MergeResult>
  onClose(): void
}): ReactNode {
  const [merges, setMerges] = useState<import('./types.ts').MergeResult[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [paged, setPaged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const returnFocus = useRef(document.activeElement)
  useEffect(() => {
    const abort = new AbortController(); request.current = abort
    void props.onList(abort.signal).then(result => { if (!abort.signal.aborted) { setMerges(result.merges); setCursor(result.cursor) } })
      .catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Merge Recovery could not be read.') })
      .finally(() => { if (!abort.signal.aborted) setPending(false) })
    return () => { abort.abort() }
  }, [])
  const loadPage = async (after?: string): Promise<void> => {
    const abort = request.current
    if (pending || abort === null || abort.signal.aborted) return
    setPending(true); setError(null); setMessage(null)
    try {
      const result = await props.onList(abort.signal, after)
      if (abort.signal.aborted) return
      setMerges(result.merges); setCursor(result.cursor); setPaged(after !== undefined)
    } catch (cause) { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Merge Recovery could not be read.') }
    finally { if (!abort.signal.aborted) setPending(false) }
  }
  const recover = async (id: string): Promise<void> => {
    const abort = request.current
    if (pending || abort === null || abort.signal.aborted) return
    setPending(true); setError(null); setMessage(null)
    try {
      const result = await props.onRecover(id, abort.signal)
      if (abort.signal.aborted) return
      setMerges(current => current.map(item => item.id === id ? result : item))
      setMessage(`Originals recovered in ${result.recoveryPath}. Current notes were not overwritten.`)
    } catch (cause) { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Recovery did not finish. Existing copies were preserved.') }
    finally { if (!abort.signal.aborted) setPending(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open) props.onClose() }}>
    <DialogContent className="z-[2147483647] max-h-[85dvh] overflow-y-auto" overlayClassName="z-[2147483646]" onCloseAutoFocus={event => {
      if (returnFocus.current instanceof HTMLElement && returnFocus.current.isConnected) { event.preventDefault(); returnFocus.current.focus() }
    }}>
      <DialogTitle>Merge Recovery</DialogTitle>
      <DialogDescription>Restore the original notes as new copies. This does not undo published merge changes or overwrite newer edits. Use the copies to reconcile an interrupted merge.</DialogDescription>
      {!pending && merges.length === 0 && <p>No Merge Originals to Recover</p>}
      <ul className="flex flex-col gap-4">{merges.map(merge => <li key={merge.id} className="flex flex-col gap-2 border-b border-border pb-3">
        <p className="whitespace-pre-wrap break-all">{merge.sourcePath} → {merge.destinationPath}</p>
        <p>{merge.status === 'applied' ? 'Applied' : merge.status === 'recovered' ? 'Originals Recovered' : 'Needs Recovery'}</p>
        <Button variant="outline" disabled={pending} onClick={() => { void recover(merge.id) }}>Restore Originals as New Notes</Button>
      </li>)}</ul>
      {pending && <p role="status">Checking merge recovery…</p>}
      {message && <p role="status" className="whitespace-pre-wrap break-all">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <DialogFooter>
        {paged && <Button variant="outline" disabled={pending} onClick={() => { void loadPage() }}>First Page</Button>}
        {cursor && <Button variant="outline" disabled={pending} onClick={() => { void loadPage(cursor) }}>Next Page</Button>}
        <Button variant="outline" onClick={props.onClose}>Close</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
