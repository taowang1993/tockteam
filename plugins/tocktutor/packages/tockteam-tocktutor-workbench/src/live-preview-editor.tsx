// @ts-nocheck -- Milkdown 7.20's extensionless declarations are not consumable by the pinned Typert NodeNext analyzer; runtime stays pinned to the public packages.
import { Editor as MilkdownEditorCore, defaultValueCtx, rootCtx } from '@milkdown/core'
import { history } from '@milkdown/plugin-history'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { Plugin } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { $prose, getMarkdown, replaceAll } from '@milkdown/utils'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { projectLivePreview, replaceLivePreviewLine } from './live-preview.ts'
import { projectEditorWidgets, type EditorWidgetTarget } from './editor-widgets.ts'
import { runLivePreviewTableAction, type LivePreviewTableAction } from './milkdown-editor-commands.ts'

export interface LivePreviewSelection {
  from: number
  to: number
}

export interface LivePreviewEditorProps {
  ariaLabel?: string
  className?: string
  content: string
  editorViewRef?: MutableRefObject<EditorView | null>
  onMarkdownChange: (markdown: string) => void
  onSelectionChange?: (selection: LivePreviewSelection) => void
  onTableAction?: (action: LivePreviewTableAction) => void
  onToggleTask?: (index: number) => void
  onWidgetState?: (widgets: readonly EditorWidgetTarget[]) => void
}

function normalizeSource(source: string): string {
  return source.replace(/\r\n?/gu, '\n')
}

function preserveLineEndings(authored: string, edited: string): string {
  const separators = [...authored.matchAll(/\r\n|\r|\n/gu)].map(match => match[0])
  if (separators.length === 0) return edited
  const preferred = separators.find(separator => separator === '\r\n') ?? separators[0] ?? '\n'
  let index = 0
  return edited.replace(/\n/gu, () => separators[index++] ?? preferred)
}

function sameSelection(left: LivePreviewSelection | null, right: LivePreviewSelection): boolean {
  return left?.from === right.from && left.to === right.to
}

function LivePreviewEditorInner(props: LivePreviewEditorProps): ReactNode {
  const sourceRef = useRef(props.content)
  const onMarkdownChangeRef = useRef(props.onMarkdownChange)
  const onSelectionChangeRef = useRef(props.onSelectionChange)
  const onWidgetStateRef = useRef(props.onWidgetState)
  const syncingRef = useRef(false)
  const lastSelectionRef = useRef<LivePreviewSelection | null>(null)
  const internalEditorViewRef = useRef<EditorView | null>(null)
  const onEditorViewRef = props.editorViewRef ?? internalEditorViewRef
  onMarkdownChangeRef.current = props.onMarkdownChange
  onSelectionChangeRef.current = props.onSelectionChange
  onWidgetStateRef.current = props.onWidgetState
  const editor = useEditor((root) => {
    const lifecycle = $prose(() => new Plugin({
      view: view => {
        onEditorViewRef && (onEditorViewRef.current = view)
        const publish = (): void => {
          const selection = { from: view.state.selection.from, to: view.state.selection.to }
          if (!sameSelection(lastSelectionRef.current, selection)) {
            lastSelectionRef.current = selection
            onSelectionChangeRef.current?.(selection)
          }
          onWidgetStateRef.current?.(projectEditorWidgets(sourceRef.current, selection))
        }
        publish()
        return {
          update: () => { publish() },
          destroy: () => {
            if (onEditorViewRef?.current === view) onEditorViewRef.current = null
            onWidgetStateRef.current?.([])
          },
        }
      },
    }))
    const editingShortcuts = $prose(() => new Plugin({
      props: {
        handleKeyDown: (view, event) => {
          if (!view.editable || event.key !== 'Enter' || !event.shiftKey) return false
          event.preventDefault()
          view.dispatch(view.state.tr.insertText('  \n'))
          return true
        },
        handleDOMEvents: {
          keydown: (_view, event) => {
            if (event.key.toLowerCase() === 'v' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
              plainTextPasteViews.add(_view)
            }
            return false
          },
          paste: (view, event) => {
            if (!plainTextPasteViews.delete(view) || !view.editable) return false
            const text = event.clipboardData?.getData('text/plain') ?? ''
            event.preventDefault()
            view.dispatch(view.state.tr.insertText(text))
            return true
          },
        },
      },
    }))
    return MilkdownEditorCore.make()
      .config(ctx => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, normalizeSource(props.content))
      })
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(history)
      .use(editingShortcuts)
      .use(lifecycle)
      .config(ctx => {
        const manager = ctx.get(listenerCtx) as unknown as { markdownUpdated(listener: (_ctx: unknown, markdown: string) => void): void }
        manager.markdownUpdated((_ctx: unknown, markdown: string) => {
          if (syncingRef.current) return
          const next = preserveLineEndings(sourceRef.current, markdown)
          sourceRef.current = next
          onMarkdownChangeRef.current(next)
        })
      })
  }, [])

  const loading = editor.loading
  useEffect(() => {
    sourceRef.current = props.content
  }, [props.content])

  useEffect(() => {
    if (loading) return
    const instance = editor.get()
    if (!instance) return
    try {
      const current = instance.action(ctx => getMarkdown()(ctx))
      if (normalizeSource(current) === normalizeSource(props.content)) return
      syncingRef.current = true
      instance.action(replaceAll(normalizeSource(props.content)))
      syncingRef.current = false
    } catch {
      syncingRef.current = false
    }
  }, [editor, loading, props.content])

  const projection = useMemo(() => projectLivePreview(props.content), [props.content])
  const tableDocument = /^(?:\s*\|.*\|\s*)$/mu.test(props.content)
  const [folded, setFolded] = useState<ReadonlySet<number>>(() => projection.status === 'ready'
    ? new Set(projection.lines.filter(line => line.folded === true).map(line => line.index))
    : new Set())
  useEffect(() => {
    if (projection.status === 'ready') setFolded(new Set(projection.lines.filter(line => line.folded === true).map(line => line.index)))
    else setFolded(new Set())
  }, [projection, props.content])
  const editLine = (line: { index: number }, event: ChangeEvent<HTMLInputElement>): void => {
    props.onMarkdownChange(replaceLivePreviewLine(props.content, line.index, event.target.value))
  }
  const toggleFold = (index: number): void => {
    setFolded(current => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }
  const tableAction = (action: LivePreviewTableAction): void => {
    const view = onEditorViewRef?.current
    if (view && runLivePreviewTableAction(view, action)) props.onTableAction?.(action)
  }
  const shellClass = useMemo(() => `tocktutor-live-preview-editor relative min-h-0 min-w-0 flex-1 overflow-auto ${props.className ?? ''}`, [props.className])
  return (
    <div aria-label={props.ariaLabel ?? 'Live Preview Editor'} className={shellClass}>
      {tableDocument && (
        <div aria-label="Live Preview Table Commands" className="sticky top-0 z-1 flex flex-wrap gap-1 border-b border-[var(--tt-border)] bg-[var(--tt-panel)] p-1 text-xs">
          {([['add-row-before', 'Add Row Above'], ['add-row-after', 'Add Row Below'], ['add-column-before', 'Add Column Left'], ['add-column-after', 'Add Column Right'], ['align-left', 'Align Left'], ['align-center', 'Align Center'], ['align-right', 'Align Right'], ['sort-ascending', 'Sort Ascending'], ['sort-descending', 'Sort Descending']] as const).map(([action, label]) => (
            <button className="rounded border border-[var(--tt-border)] bg-transparent px-1.5 py-0.5 text-inherit" key={action} onClick={() => { tableAction(action) }} type="button">{label}</button>
          ))}
        </div>
      )}
      <Milkdown />
      {projection.status === 'ready' && (
        <div className="pointer-events-none absolute size-px overflow-hidden opacity-0" aria-label="Live Preview Compatibility Controls">
          {projection.lines.map(line => (
            <span key={line.index}>
              {line.foldEndLine !== undefined && (
                <button
                  aria-expanded={!folded.has(line.index)}
                  aria-label={`${folded.has(line.index) ? 'Expand' : 'Collapse'} Line ${String(line.index + 1)}`}
                  onClick={() => { toggleFold(line.index) }}
                  onMouseDown={event => { event.preventDefault() }}
                  type="button"
                />
              )}
              {line.kind === 'task' && line.taskIndex !== undefined && (
                <input
                  aria-label={`Mark Task on Line ${String(line.index + 1)} as ${line.checked === true ? 'Incomplete' : 'Complete'}`}
                  checked={line.checked === true}
                  onChange={() => { props.onToggleTask?.(line.taskIndex!) }}
                  type="checkbox"
                />
              )}
              <input
                aria-label={`Live Preview Line ${String(line.index + 1)}`}
                onChange={event => { editLine(line, event) }}
                value={line.content}
                onChangeCapture={() => { /* source-preserving compatibility edit surface */ }}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const plainTextPasteViews = new WeakSet<EditorView>()

export function LivePreviewEditor(props: LivePreviewEditorProps): ReactNode {
  return <MilkdownProvider><LivePreviewEditorInner {...props} /></MilkdownProvider>
}
