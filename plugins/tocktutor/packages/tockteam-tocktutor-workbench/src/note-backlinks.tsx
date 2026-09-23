import { Alert } from '@tockteam/ui/alert'
import { Button } from '@tockteam/ui/button'
import type { ReactNode } from 'react'
import { isSafeVaultRelativePath } from './session.ts'
import type { VaultLinksResult } from './types.ts'

/** Shared mention list for the relationship panel and document footer. */
export function NoteBacklinks(props: {
  links: VaultLinksResult | null | undefined
  loading?: boolean
  onSelect(path: string): void
  onRetry: (() => void) | undefined
}): ReactNode {
  if (props.loading) return <Alert unstyled role="status">Loading backlinks…</Alert>
  if (props.links == null) return <Alert unstyled role="status">Backlinks are unavailable. <Button unstyled className="underline" disabled={props.onRetry === undefined} onClick={props.onRetry} type="button">Retry</Button></Alert>
  const linkedMentions = props.links.backlinkDetails
  const unlinkedMentions = props.links.unlinkedMentions ?? []
  return <>
    <details className="rounded border border-[var(--tt-border)]" open>
      <summary className="cursor-pointer list-none px-2 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tt-accent)]">Linked Mentions ({String(linkedMentions.length)})</summary>
      <div className="grid gap-1 border-t border-[var(--tt-border)] p-2">
        {linkedMentions.map((link, index) => (
          <Button unstyled aria-label={`Open Linked Mention ${link.sourcePath}`} className="grid min-w-0 gap-0.5 rounded border-0 bg-transparent px-1 py-1 text-left text-xs hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)]" key={`${link.sourcePath}-${String(link.line)}-${String(index)}`} onClick={() => { props.onSelect(link.sourcePath) }} type="button">
            <span className="truncate">{link.sourcePath} · line {String(link.line)}</span>
            <span className="truncate text-[var(--tt-muted)]">{link.displayText || link.authoredTarget}</span>
          </Button>
        ))}
        {linkedMentions.length === 0 && <span className="text-xs text-[var(--tt-muted)]">No linked mentions.</span>}
      </div>
    </details>
    <details className="mt-2 rounded border border-[var(--tt-border)]">
      <summary className="cursor-pointer list-none px-2 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tt-accent)]">Unlinked Mentions ({String(unlinkedMentions.length)})</summary>
      <div className="grid gap-2 border-t border-[var(--tt-border)] p-2">
        {unlinkedMentions.map((mention, index) => (
          <Button unstyled aria-label={`Open Unlinked Mention ${mention.sourcePath}`} className="grid min-w-0 gap-0.5 rounded border-0 bg-transparent px-1 py-1 text-left text-xs hover:bg-[var(--tt-selected)] focus-visible:bg-[var(--tt-selected)]" key={`${mention.sourcePath}-${String(mention.line)}-${String(index)}`} onClick={() => { props.onSelect(mention.sourcePath) }} type="button">
            <span className="truncate">{mention.sourcePath} · line {String(mention.line)}</span>
            <span className="text-[var(--tt-muted)]">{mention.snippet || mention.matchedText}</span>
          </Button>
        ))}
        {unlinkedMentions.length === 0 && <span className="text-xs text-[var(--tt-muted)]">No unlinked mentions.</span>}
      </div>
    </details>
    {(props.links.complete === false || props.links.truncated) && <Alert unstyled className="mt-2 text-xs text-[var(--tt-muted)]" role="status">Results are incomplete because the vault scan reached its limit.</Alert>}
  </>
}

export function NoteOutgoingLinks(props: Parameters<typeof NoteBacklinks>[0]): ReactNode {
  if (props.loading) return <Alert unstyled role="status">Loading outgoing links…</Alert>
  if (!props.links) return <Alert unstyled role="status">Outgoing links are unavailable. <Button onClick={props.onRetry} disabled={!props.onRetry} variant="ghost">Retry</Button></Alert>
  return <div className="grid gap-2">
    {props.links.outgoingDetails.map((link, index) => <div key={`${link.line}:${index}`} className="min-w-0 text-xs">
      {link.status === 'resolved' && link.resolvedPath && isSafeVaultRelativePath(link.resolvedPath) && /\.(?:md|markdown|canvas|base)$/iu.test(link.resolvedPath)
        ? <Button unstyled className="w-full truncate rounded p-1 text-left hover:bg-[var(--tt-selected)]" onClick={() => { props.onSelect(link.resolvedPath!) }} type="button">{link.displayText || link.authoredTarget} · {link.resolvedPath}</Button>
        : <span>{link.displayText || link.authoredTarget} · {link.status === 'resolved' ? 'Unsupported Target' : link.status === 'ambiguous' ? 'Ambiguous Target' : 'Unresolved Target'}</span>}
    </div>)}
    {props.links.outgoingDetails.length === 0 && <p>No outgoing links.</p>}
    {(props.links.complete === false || props.links.truncated) && <Alert unstyled role="status">Results are incomplete because the vault scan reached its limit.</Alert>}
  </div>
}
