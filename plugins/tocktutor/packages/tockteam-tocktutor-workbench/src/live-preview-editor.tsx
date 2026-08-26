import {
  lazy,
  Suspense,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import type { EditorWidgetTarget } from './editor-widgets.ts'
import type { LivePreviewTableAction } from './milkdown-editor-commands.ts'

export interface LivePreviewSelection {
  from: number
  to: number
}

export interface LivePreviewEditorProps {
  ariaLabel?: string
  className?: string
  content: string
  editorViewRef?: MutableRefObject<unknown | null>
  onMarkdownChange: (markdown: string) => void
  onSelectionChange?: (selection: LivePreviewSelection) => void
  onTableAction?: (action: LivePreviewTableAction) => void
  onToggleTask?: (index: number) => void
  onWidgetState?: (widgets: readonly EditorWidgetTarget[]) => void
}

const LazyLivePreviewEditor = lazy(async () => {
  const module = await import('./live-preview-editor-runtime.tsx')
  return { default: module.LivePreviewEditorRuntime }
})

export function LivePreviewEditor(props: LivePreviewEditorProps): ReactNode {
  return (
    <Suspense fallback={<div aria-label={props.ariaLabel ?? 'Live Preview Editor'} className={props.className}>Loading Live Preview…</div>}>
      <LazyLivePreviewEditor {...props} />
    </Suspense>
  )
}
