import {
  lazy,
  Suspense,
  type MutableRefObject,
  type ReactNode,
} from 'react'

export type SourceEditorFoldAction = 'foldAll' | 'unfoldAll' | 'foldMore' | 'foldLess'
export interface SourceEditorFoldRequest { action: SourceEditorFoldAction; id: number }
export interface SourceEditorInsertTextRequest { cursorOffset?: number; id: number; text: string }
export interface SourceEditorSelectionRange { from: number; to: number }
export interface SourceEditorSelection {
  main: SourceEditorSelectionRange
  ranges: readonly SourceEditorSelectionRange[]
}

export interface SourceEditorProps {
  ariaLabel?: string
  className?: string
  content: string
  editable?: boolean
  extraExtensions?: readonly unknown[]
  foldRequest?: SourceEditorFoldRequest | null
  id?: string
  insertTextRequest?: SourceEditorInsertTextRequest | null
  onContentChange?: (content: string) => void
  onSelectionChange?: (selection: SourceEditorSelection) => void
  onWidgetState?: (widgets: readonly import('./editor-widgets.ts').EditorWidgetTarget[]) => void
  placeholder?: string
  showFoldGutter?: boolean
  spellCheck?: boolean
  editorViewRef?: MutableRefObject<unknown | null>
}

export type SelectionMouseEvent = Pick<MouseEvent, 'altKey' | 'shiftKey'>
export type RectangularSelectionMouseEvent = SelectionMouseEvent & Pick<MouseEvent, 'button'>

/** Alt-click adds a selection range, matching Tockbot's Source editor. */
export function shouldAddEditorSelectionRange(event: SelectionMouseEvent): boolean {
  return event.altKey && !event.shiftKey
}

/** Alt+Shift-drag or middle-drag starts a rectangular selection. */
export function shouldStartEditorRectangularSelection(event: RectangularSelectionMouseEvent): boolean {
  return (event.altKey && event.shiftKey && event.button === 0) || event.button === 1
}

/** Restore the authored newline sequence after CodeMirror's canonical edit. */
export function preserveEditorLineEndings(authored: string, edited: string): string {
  const separators = [...authored.matchAll(/\r\n|\r|\n/gu)].map(match => match[0])
  if (separators.length === 0) return edited
  const preferred = separators.find(separator => separator === '\r\n') ?? separators[0] ?? '\n'
  let index = 0
  return edited.replace(/\n/gu, () => separators[index++] ?? preferred)
}

export function buildSourceChange(current: string, next: string): { from: number; insert: string; to: number } | null {
  if (current === next) return null
  let start = 0
  while (start < current.length && start < next.length && current[start] === next[start]) start += 1
  let currentEnd = current.length
  let nextEnd = next.length
  while (currentEnd > start && nextEnd > start && current[currentEnd - 1] === next[nextEnd - 1]) {
    currentEnd -= 1
    nextEnd -= 1
  }
  return { from: start, insert: next.slice(start, nextEnd), to: currentEnd }
}

const LazySourceEditor = lazy(async () => {
  const module = await import('./source-editor-runtime.tsx')
  return { default: module.SourceEditorRuntime }
})

export function SourceEditor(props: SourceEditorProps): ReactNode {
  return (
    <Suspense fallback={<div aria-label={props.ariaLabel ?? 'Markdown Source Editor'} className={props.className}>Loading Source Editor…</div>}>
      <LazySourceEditor {...props} />
    </Suspense>
  )
}
