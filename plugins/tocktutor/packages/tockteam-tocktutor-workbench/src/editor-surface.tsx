import { Alert } from '@tockteam/ui/alert'
import {
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { LivePreviewEditor } from './live-preview-editor.tsx'
import { renderMarkdownHtml } from './rich-markdown.ts'

export function RichReadingView(props: {
  onToggleTask(index: number): void
  source: string
}): ReactNode {
  const html = useMemo(() => {
    const warning = /<\/?(?:script|style|iframe|object|embed|form|svg|link|meta)\b/iu.test(props.source)
      ? '<p class="tocktutor-warning" role="note">Unsafe HTML is inert in Reading view.</p>'
      : ''
    return `${warning}${renderMarkdownHtml(props.source)}`
  }, [props.source])
  const onClick = (event: ReactMouseEvent<HTMLElement>): void => {
    const target = event.target
    if (target instanceof HTMLInputElement && target.dataset.taskIndex !== undefined) {
      const index = Number(target.dataset.taskIndex)
      if (Number.isSafeInteger(index) && index >= 0) props.onToggleTask(index)
      return
    }
    if (target instanceof HTMLAnchorElement) event.preventDefault()
  }
  return (
    <article
      aria-label="Reading View"
      className="tocktutor-reading mx-auto min-h-full w-[calc(100%-48px)] max-w-3xl pt-[18px] pb-[72px] [&_.callout]:my-4 [&_.callout]:rounded-md [&_.footnotes]:mt-8 [&_.math-display]:my-4 [&_.mermaid]:my-4 [&_.task-list]:pl-5 [&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-[30px] [&_h1]:leading-tight [&_h1]:font-[650] [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-2xl [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-xl [&_mark]:bg-[color-mix(in_srgb,#fde047_55%,transparent)] [&_p]:mt-0 [&_p]:mb-4 [&_p]:text-lg [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-[var(--tt-border)] [&_pre]:bg-[color-mix(in_srgb,var(--tt-text)_4%,var(--tt-panel))] [&_pre]:p-3 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--tt-border)] [&_td]:p-2 [&_th]:border [&_th]:border-[var(--tt-border)] [&_th]:p-2"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={onClick}
      tabIndex={-1}
    />
  )
}

export function LivePreviewView(props: {
  documentKey: string
  onEdit(source: string): void
  onToggleTask(index: number): void
  source: string
}): ReactNode {
  void props.documentKey
  return <LivePreviewEditor ariaLabel="Live Preview" content={props.source} onMarkdownChange={props.onEdit} onToggleTask={props.onToggleTask} />
}
