// @ts-nocheck -- CodeMirror's declaration graph is not consumable by the pinned Typert NodeNext analyzer; the public adapter remains runtime-typed by CodeMirror.
import { minimalSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { foldAll, foldCode, foldGutter, unfoldAll, unfoldCode } from '@codemirror/language'
import { EditorSelection, EditorState, type Extension, type Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
  scrollPastEnd,
  type ViewUpdate,
} from '@codemirror/view'
import { projectEditorWidgets, type EditorWidgetTarget } from './editor-widgets.ts'
import {
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import {
  buildSourceChange,
  preserveEditorLineEndings,
  shouldAddEditorSelectionRange,
  shouldStartEditorRectangularSelection,
  type SourceEditorProps,
  type SourceEditorSelection,
} from './source-editor.tsx'

function normalizeEditorSource(source: string): string {
  return source.replace(/\r\n?/gu, '\n')
}

const EMPTY_EXTENSIONS: readonly unknown[] = Object.freeze([])

function selectionSnapshot(view: EditorView): SourceEditorSelection {
  const ranges = view.state.selection.ranges.map(range => ({ from: range.from, to: range.to }))
  const main = ranges[view.state.selection.mainIndex] ?? ranges[0] ?? { from: 0, to: 0 }
  return { main, ranges }
}

function copyLines(view: EditorView, event: ClipboardEvent): boolean {
  if (!event.clipboardData || view.state.selection.ranges.some(range => !range.empty)) return false
  const lines = new Map<number, { from: number; to: number }>()
  for (const range of view.state.selection.ranges) {
    const line = view.state.doc.lineAt(range.head)
    lines.set(line.from, { from: line.from, to: line.to + (line.number < view.state.doc.lines ? 1 : 0) })
  }
  if (lines.size === 0) return false
  const text = [...lines.values()].sort((left, right) => left.from - right.from)
    .map(line => view.state.sliceDoc(line.from, line.to)).join('')
  event.clipboardData.setData('text/plain', text)
  event.preventDefault()
  return true
}

function cutLines(view: EditorView, event: ClipboardEvent): boolean {
  if (view.state.readOnly || !event.clipboardData || view.state.selection.ranges.some(range => !range.empty)) return false
  const lines = new Map<number, { from: number; to: number }>()
  for (const range of view.state.selection.ranges) {
    const line = view.state.doc.lineAt(range.head)
    lines.set(line.from, { from: line.from, to: line.to + (line.number < view.state.doc.lines ? 1 : 0) })
  }
  if (lines.size === 0) return false
  const ordered = [...lines.values()].sort((left, right) => left.from - right.from)
  event.clipboardData.setData('text/plain', ordered.map(line => view.state.sliceDoc(line.from, line.to)).join(''))
  event.preventDefault()
  view.dispatch({ changes: ordered.map(line => ({ from: line.from, to: line.to, insert: '' })) })
  return true
}

function deleteCurrentLines(view: EditorView): boolean {
  if (view.state.readOnly) return false
  const ranges = new Map<number, { from: number; to: number }>()
  for (const selection of view.state.selection.ranges) {
    const first = view.state.doc.lineAt(selection.from)
    const last = view.state.doc.lineAt(selection.to)
    for (let lineNumber = first.number; lineNumber <= last.number; lineNumber += 1) {
      const line = view.state.doc.line(lineNumber)
      ranges.set(line.from, { from: line.from, to: line.to + (line.number < view.state.doc.lines ? 1 : 0) })
    }
  }
  const ordered = [...ranges.values()].sort((left, right) => left.from - right.from)
  if (ordered.length === 0) return false
  view.dispatch({ changes: ordered.map(line => ({ from: line.from, to: line.to, insert: '' })) })
  return true
}

function sourceDecorations(state: EditorState) {
  const decorations: Array<Range<Decoration>> = []
  let fenceOpen = false
  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number)
    const text = line.text
    const fence = /^ {0,3}(`{3,}|~{3,})/u.test(text)
    if (fence) fenceOpen = !fenceOpen
    if (fenceOpen || /^\s*(?:[-+*]|\d+[.)])\s+\[[^\]]\]/u.test(text)) {
      decorations.push(Decoration.line({ class: fenceOpen ? 'cm-tock-code-line' : 'cm-tock-task-line' }).range(line.from))
    }
    const commentStart = text.indexOf('%%')
    if (commentStart >= 0) {
      const commentEnd = text.lastIndexOf('%%') + 2
      if (commentEnd > commentStart + 1) decorations.push(Decoration.mark({ class: 'cm-tock-comment' }).range(line.from + commentStart, line.from + commentEnd))
    }
  }
  return Decoration.set(decorations)
}

function buildEditorExtensions(props: {
  editable: boolean
  extraExtensions: Extension[]
  onContentChangeRef: { current: SourceEditorProps['onContentChange'] }
  onSelectionChangeRef: { current: SourceEditorProps['onSelectionChange'] }
  onWidgetStateRef: { current: SourceEditorProps['onWidgetState'] }
  showFoldGutter: boolean
  sourceRef: { current: string }
  spellCheck: boolean
}): Extension[] {
  const hardBreak = (view: EditorView): boolean => {
    if (view.state.readOnly) return false
    view.dispatch(view.state.changeByRange(range => ({
      changes: { from: range.from, to: range.to, insert: '  \n' },
      range: EditorSelection.cursor(range.from + 3),
    })))
    return true
  }
  let plainTextPaste = false
  const extensions: Extension[] = [
    minimalSetup,
    markdown(),
    lineNumbers(),
    ...(props.showFoldGutter ? [foldGutter()] : []),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    scrollPastEnd(),
    EditorState.readOnly.of(!props.editable),
    EditorView.editable.of(props.editable),
    ...(props.editable ? [
      EditorState.allowMultipleSelections.of(true),
      EditorView.clickAddsSelectionRange.of(shouldAddEditorSelectionRange),
      rectangularSelection({ eventFilter: shouldStartEditorRectangularSelection }),
      keymap.of([{ key: 'Shift-Enter', run: hardBreak }]),
    ] : []),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: props.spellCheck ? 'true' : 'false' }),
    EditorView.decorations.compute(['doc'], sourceDecorations),
    EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        const canonical = update.state.doc.toString()
        props.sourceRef.current = preserveEditorLineEndings(props.sourceRef.current, canonical)
        props.onContentChangeRef.current?.(props.sourceRef.current)
      }
      if (update.selectionSet || update.docChanged) {
        const selection = selectionSnapshot(update.view)
        props.onSelectionChangeRef.current?.(selection)
        props.onWidgetStateRef.current?.(projectEditorWidgets(props.sourceRef.current, selection.main))
      }
    }),
    EditorView.domEventHandlers({
      keydown(event, view) {
        if (event.key === 'Escape' && !view.state.readOnly && (view.state.selection.ranges.length > 1 || !view.state.selection.main.empty)) {
          view.dispatch({ selection: EditorSelection.cursor(view.state.selection.main.head) })
          event.preventDefault()
          return true
        }
        if (event.key.toLowerCase() === 'v' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
          plainTextPaste = true
          return false
        }
        if (event.key.toLowerCase() === 'k' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          return deleteCurrentLines(view)
        }
        return false
      },
      keyup(event) {
        if (event.key.toLowerCase() === 'v') plainTextPaste = false
        return false
      },
      blur() {
        plainTextPaste = false
        return false
      },
      paste(event, view) {
        if (!plainTextPaste || view.state.readOnly) return false
        const text = event.clipboardData?.getData('text/plain') ?? ''
        plainTextPaste = false
        event.preventDefault()
        view.dispatch(view.state.replaceSelection(text))
        return true
      },
      copy: (event, view) => copyLines(view, event),
      cut: (event, view) => cutLines(view, event),
    }),
    ...props.extraExtensions,
  ]
  return extensions
}

function sourceTheme(showFoldGutter: boolean): Extension {
  return EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: 'var(--tt-panel)',
      color: 'var(--tt-text)',
      fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
      fontSize: '14px',
      lineHeight: '1.65',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-gutters': { border: '0', backgroundColor: 'transparent' },
    '.cm-lineNumbers': { color: 'color-mix(in srgb, var(--tt-muted) 55%, transparent)' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 8px', minWidth: '2.25rem' },
    '.cm-content': { padding: '30px 28px 72px 0' },
    '.cm-line': { padding: '0' },
    '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--tt-text) 4%, transparent)' },
    '.cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'color-mix(in srgb, var(--tt-accent) 22%, transparent)' },
    '.cm-tock-task-line': { backgroundColor: 'color-mix(in srgb, var(--tt-accent) 3%, transparent)' },
    '.cm-tock-code-line': { color: 'var(--tt-muted)' },
    '.cm-tock-comment': { color: 'var(--tt-muted)' },
    '.cm-foldGutter .cm-gutterElement': { display: showFoldGutter ? 'block' : 'none' },
  })
}

export function SourceEditorRuntime(props: SourceEditorProps): ReactNode {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<EditorView | null>(null)
  const sourceRef = useRef(props.content)
  const onContentChangeRef = useRef(props.onContentChange)
  const onSelectionChangeRef = useRef(props.onSelectionChange)
  const onWidgetStateRef = useRef(props.onWidgetState)
  const lastInsertIdRef = useRef<number | null>(null)
  const lastFoldIdRef = useRef<number | null>(null)
  const editable = props.editable !== false
  const showFoldGutter = props.showFoldGutter !== false
  const extraExtensions = props.extraExtensions ?? EMPTY_EXTENSIONS
  useEffect(() => { sourceRef.current = props.content }, [props.content])
  useEffect(() => { onContentChangeRef.current = props.onContentChange }, [props.onContentChange])
  useEffect(() => { onSelectionChangeRef.current = props.onSelectionChange }, [props.onSelectionChange])
  useEffect(() => { onWidgetStateRef.current = props.onWidgetState }, [props.onWidgetState])

  const extensions = useMemo(() => buildEditorExtensions({
    editable,
    extraExtensions,
    onContentChangeRef,
    onSelectionChangeRef,
    onWidgetStateRef,
    showFoldGutter,
    sourceRef,
    spellCheck: props.spellCheck !== false,
  }), [editable, extraExtensions, showFoldGutter, props.spellCheck])

  useEffect(() => {
    const parent = parentRef.current
    if (!parent) return
    const view = new EditorView({
      parent,
      state: EditorState.create({ doc: normalizeEditorSource(props.content), extensions: [extensions, sourceTheme(showFoldGutter)] }),
    })
    editorRef.current = view
    if (props.editorViewRef) props.editorViewRef.current = view
    onWidgetStateRef.current?.(projectEditorWidgets(sourceRef.current, selectionSnapshot(view).main))
    return () => {
      onWidgetStateRef.current?.([])
      view.destroy()
      if (editorRef.current === view) editorRef.current = null
      if (props.editorViewRef?.current === view) props.editorViewRef.current = null
    }
  }, [extensions, props.editorViewRef, showFoldGutter])

  useEffect(() => {
    const view = editorRef.current
    if (!view) return
    const change = buildSourceChange(view.state.doc.toString(), normalizeEditorSource(props.content))
    if (change) view.dispatch({ changes: change })
  }, [props.content])

  useEffect(() => {
    const view = editorRef.current
    const request = props.insertTextRequest
    if (!view || !editable || !request || request.id === lastInsertIdRef.current) return
    lastInsertIdRef.current = request.id
    const requestedOffset = Number.isFinite(request.cursorOffset) ? request.cursorOffset ?? request.text.length : request.text.length
    const cursorOffset = Math.max(0, Math.min(request.text.length, requestedOffset))
    const selection = view.state.selection.main
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: request.text },
      selection: { anchor: selection.from + cursorOffset },
    })
    view.focus()
  }, [editable, props.insertTextRequest])

  useEffect(() => {
    const view = editorRef.current
    const request = props.foldRequest
    if (!view || !request || request.id === lastFoldIdRef.current) return
    lastFoldIdRef.current = request.id
    if (request.action === 'foldAll') foldAll(view)
    else if (request.action === 'unfoldAll') unfoldAll(view)
    else if (request.action === 'foldMore') foldCode(view)
    else unfoldCode(view)
    view.focus()
  }, [props.foldRequest])

  return <div aria-label={props.ariaLabel ?? 'Markdown Source Editor'} className={`tocktutor-source-editor flex min-h-0 min-w-0 flex-1 overflow-hidden ${props.className ?? ''}`} id={props.id}><div className="min-h-0 min-w-0 flex-1" ref={parentRef} /></div>
}
