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
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { projectEditorWidgets, type EditorWidgetTarget } from './editor-widgets.ts'

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
  const onEditorViewRef = props.editorViewRef
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
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
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

  const shellClass = useMemo(() => `tocktutor-live-preview-editor min-h-0 min-w-0 flex-1 overflow-auto ${props.className ?? ''}`, [props.className])
  return <div aria-label={props.ariaLabel ?? 'Live Preview Editor'} className={shellClass}><Milkdown /></div>
}

const plainTextPasteViews = new WeakSet<EditorView>()

export function LivePreviewEditor(props: LivePreviewEditorProps): ReactNode {
  return <MilkdownProvider><LivePreviewEditorInner {...props} /></MilkdownProvider>
}
