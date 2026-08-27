import { jsx as _jsx } from "react/jsx-runtime";
// @ts-nocheck -- CodeMirror's declaration graph is not consumable by the pinned Typert NodeNext analyzer; the public adapter remains runtime-typed by CodeMirror.
import { minimalSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { foldAll, foldCode, foldGutter, unfoldAll, unfoldCode } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { Decoration, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, rectangularSelection, scrollPastEnd, } from '@codemirror/view';
import { projectEditorWidgets } from "./editor-widgets.js";
import { useEffect, useMemo, useRef, } from 'react';
import { buildSourceChange, preserveEditorLineEndings, shouldAddEditorSelectionRange, shouldStartEditorRectangularSelection, } from "./source-editor.js";
import { buildSourceEmbedWidgetExtension, refreshSourceEmbedWidgets } from "./source-embed-widgets.js";
import { applyEditorCommandToSelections } from "./editor-commands.js";
import { buildSourceTaskWidgetExtension } from "./source-task-widgets.js";
function normalizeEditorSource(source) {
    return source.replace(/\r\n?/gu, '\n');
}
const EMPTY_EXTENSIONS = Object.freeze([]);
function selectionSnapshot(view) {
    const ranges = view.state.selection.ranges.map(range => ({ from: range.from, to: range.to }));
    const main = ranges[view.state.selection.mainIndex] ?? ranges[0] ?? { from: 0, to: 0 };
    return { main, ranges };
}
function copyLines(view, event) {
    if (!event.clipboardData || view.state.selection.ranges.some(range => !range.empty))
        return false;
    const lines = new Map();
    for (const range of view.state.selection.ranges) {
        const line = view.state.doc.lineAt(range.head);
        lines.set(line.from, { from: line.from, to: line.to + (line.number < view.state.doc.lines ? 1 : 0) });
    }
    if (lines.size === 0)
        return false;
    const text = [...lines.values()].sort((left, right) => left.from - right.from)
        .map(line => view.state.sliceDoc(line.from, line.to)).join('');
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
    return true;
}
function cutLines(view, event) {
    if (view.state.readOnly || !event.clipboardData || view.state.selection.ranges.some(range => !range.empty))
        return false;
    const lines = new Map();
    for (const range of view.state.selection.ranges) {
        const line = view.state.doc.lineAt(range.head);
        lines.set(line.from, { from: line.from, to: line.to + (line.number < view.state.doc.lines ? 1 : 0) });
    }
    if (lines.size === 0)
        return false;
    const ordered = [...lines.values()].sort((left, right) => left.from - right.from);
    event.clipboardData.setData('text/plain', ordered.map(line => view.state.sliceDoc(line.from, line.to)).join(''));
    event.preventDefault();
    view.dispatch({ changes: ordered.map(line => ({ from: line.from, to: line.to, insert: '' })) });
    return true;
}
function deleteCurrentLines(view) {
    if (view.state.readOnly)
        return false;
    const ranges = new Map();
    for (const selection of view.state.selection.ranges) {
        const first = view.state.doc.lineAt(selection.from);
        const last = view.state.doc.lineAt(selection.to);
        for (let lineNumber = first.number; lineNumber <= last.number; lineNumber += 1) {
            const line = view.state.doc.line(lineNumber);
            ranges.set(line.from, { from: line.from, to: line.to + (line.number < view.state.doc.lines ? 1 : 0) });
        }
    }
    const ordered = [...ranges.values()].sort((left, right) => left.from - right.from);
    if (ordered.length === 0)
        return false;
    view.dispatch({ changes: ordered.map(line => ({ from: line.from, to: line.to, insert: '' })) });
    return true;
}
function sourceDecorations(state) {
    const decorations = [];
    let fenceOpen = false;
    let commentOpen = false;
    for (let number = 1; number <= state.doc.lines; number += 1) {
        const line = state.doc.line(number);
        const text = line.text;
        const fence = /^ {0,3}(`{3,}|~{3,})/u.test(text);
        if (fence)
            fenceOpen = !fenceOpen;
        if (fenceOpen || /^\s*(?:[-+*]|\d+[.)])\s+\[[^\]]\]/u.test(text)) {
            decorations.push(Decoration.line({ class: fenceOpen ? 'cm-tock-code-line' : 'cm-tock-task-line' }).range(line.from));
        }
        let cursor = 0;
        if (commentOpen) {
            const close = text.indexOf('%%');
            if (close < 0)
                decorations.push(Decoration.mark({ class: 'cm-tock-comment' }).range(line.from, line.to));
            else {
                decorations.push(Decoration.mark({ class: 'cm-tock-comment' }).range(line.from, line.from + close + 2));
                commentOpen = false;
                cursor = close + 2;
            }
        }
        while (!commentOpen && cursor < text.length) {
            const start = text.indexOf('%%', cursor);
            if (start < 0)
                break;
            const end = text.indexOf('%%', start + 2);
            if (end < 0) {
                decorations.push(Decoration.mark({ class: 'cm-tock-comment' }).range(line.from + start, line.to));
                commentOpen = true;
            }
            else {
                decorations.push(Decoration.mark({ class: 'cm-tock-comment' }).range(line.from + start, line.from + end + 2));
                cursor = end + 2;
            }
        }
    }
    return Decoration.set(decorations);
}
function buildEditorExtensions(props) {
    const hardBreak = (view) => {
        if (view.state.readOnly)
            return false;
        view.dispatch(view.state.changeByRange(range => ({
            changes: { from: range.from, to: range.to, insert: '  \n' },
            range: EditorSelection.cursor(range.from + 3),
        })));
        return true;
    };
    const markdownCommand = (command) => (view) => {
        if (view.state.readOnly)
            return false;
        const result = applyEditorCommandToSelections(view.state.doc.toString(), command, view.state.selection.ranges);
        if (result.source === view.state.doc.toString())
            return false;
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: result.source },
            selection: EditorSelection.create(result.ranges.map(range => EditorSelection.range(range.from, range.to)), view.state.selection.mainIndex),
        });
        return true;
    };
    let plainTextPaste = false;
    const extensions = [
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
            keymap.of([
                { key: 'Shift-Enter', run: hardBreak },
                { key: 'Mod-b', run: markdownCommand('bold') },
                { key: 'Mod-i', run: markdownCommand('italic') },
                { key: 'Shift-Mod-x', run: markdownCommand('strikethrough') },
                { key: 'Shift-Mod-h', run: markdownCommand('highlight') },
                { key: 'Shift-Mod-k', run: markdownCommand('delete-line') },
            ]),
        ] : []),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: props.spellCheck ? 'true' : 'false' }),
        EditorView.decorations.compute(['doc'], sourceDecorations),
        EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                const canonical = update.state.doc.toString();
                props.sourceRef.current = preserveEditorLineEndings(props.sourceRef.current, canonical);
                props.onContentChangeRef.current?.(props.sourceRef.current);
            }
            if (update.selectionSet || update.docChanged) {
                const selection = selectionSnapshot(update.view);
                props.onSelectionChangeRef.current?.(selection);
                props.onWidgetStateRef.current?.(projectEditorWidgets(props.sourceRef.current, selection.main));
            }
        }),
        EditorView.domEventHandlers({
            keydown(event, view) {
                if (event.key === 'Escape' && !view.state.readOnly && (view.state.selection.ranges.length > 1 || !view.state.selection.main.empty)) {
                    view.dispatch({ selection: EditorSelection.cursor(view.state.selection.main.head) });
                    event.preventDefault();
                    return true;
                }
                if (event.key.toLowerCase() === 'v' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
                    plainTextPaste = true;
                    return false;
                }
                if (event.key.toLowerCase() === 'k' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    return deleteCurrentLines(view);
                }
                return false;
            },
            keyup(event) {
                if (event.key.toLowerCase() === 'v')
                    plainTextPaste = false;
                return false;
            },
            blur() {
                plainTextPaste = false;
                return false;
            },
            paste(event, view) {
                if (!plainTextPaste || view.state.readOnly)
                    return false;
                const text = event.clipboardData?.getData('text/plain') ?? '';
                plainTextPaste = false;
                event.preventDefault();
                view.dispatch(view.state.replaceSelection(text));
                return true;
            },
            copy: (event, view) => copyLines(view, event),
            cut: (event, view) => cutLines(view, event),
        }),
        ...props.extraExtensions,
    ];
    return extensions;
}
export function SourceEditorRuntime(props) {
    const parentRef = useRef(null);
    const editorRef = useRef(null);
    const sourceRef = useRef(props.content);
    const embedsRef = useRef(props.resolvedEmbeds ?? []);
    const onContentChangeRef = useRef(props.onContentChange);
    const onSelectionChangeRef = useRef(props.onSelectionChange);
    const onWidgetStateRef = useRef(props.onWidgetState);
    const lastInsertIdRef = useRef(null);
    const lastFoldIdRef = useRef(null);
    const editable = props.editable !== false;
    const showFoldGutter = props.showFoldGutter !== false;
    const userExtensions = props.extraExtensions ?? EMPTY_EXTENSIONS;
    const chromeExtensions = useMemo(() => [
        ...buildSourceEmbedWidgetExtension(() => embedsRef.current),
        ...buildSourceTaskWidgetExtension(),
    ], []);
    const extraExtensions = useMemo(() => [...chromeExtensions, ...userExtensions], [chromeExtensions, userExtensions]);
    useEffect(() => { sourceRef.current = props.content; }, [props.content]);
    useEffect(() => {
        embedsRef.current = props.resolvedEmbeds ?? [];
        refreshSourceEmbedWidgets(editorRef.current);
    }, [props.resolvedEmbeds]);
    useEffect(() => { onContentChangeRef.current = props.onContentChange; }, [props.onContentChange]);
    useEffect(() => { onSelectionChangeRef.current = props.onSelectionChange; }, [props.onSelectionChange]);
    useEffect(() => { onWidgetStateRef.current = props.onWidgetState; }, [props.onWidgetState]);
    const extensions = useMemo(() => buildEditorExtensions({
        editable,
        extraExtensions,
        onContentChangeRef,
        onSelectionChangeRef,
        onWidgetStateRef,
        showFoldGutter,
        sourceRef,
        spellCheck: props.spellCheck !== false,
    }), [editable, extraExtensions, showFoldGutter, props.spellCheck]);
    useEffect(() => {
        const parent = parentRef.current;
        if (!parent)
            return;
        const view = new EditorView({
            parent,
            state: EditorState.create({ doc: normalizeEditorSource(sourceRef.current), extensions }),
        });
        editorRef.current = view;
        if (props.editorViewRef)
            props.editorViewRef.current = view;
        onWidgetStateRef.current?.(projectEditorWidgets(sourceRef.current, selectionSnapshot(view).main));
        return () => {
            onWidgetStateRef.current?.([]);
            view.destroy();
            if (editorRef.current === view)
                editorRef.current = null;
            if (props.editorViewRef?.current === view)
                props.editorViewRef.current = null;
        };
    }, [extensions, props.editorViewRef, showFoldGutter]);
    useEffect(() => {
        const view = editorRef.current;
        if (!view)
            return;
        const change = buildSourceChange(view.state.doc.toString(), normalizeEditorSource(props.content));
        if (change)
            view.dispatch({ changes: change });
    }, [props.content]);
    useEffect(() => {
        const view = editorRef.current;
        const request = props.insertTextRequest;
        if (!view || !editable || !request || request.id === lastInsertIdRef.current)
            return;
        lastInsertIdRef.current = request.id;
        const requestedOffset = Number.isFinite(request.cursorOffset) ? request.cursorOffset ?? request.text.length : request.text.length;
        const cursorOffset = Math.max(0, Math.min(request.text.length, requestedOffset));
        const selection = view.state.selection.main;
        view.dispatch({
            changes: { from: selection.from, to: selection.to, insert: request.text },
            selection: { anchor: selection.from + cursorOffset },
        });
        view.focus();
    }, [editable, props.insertTextRequest]);
    useEffect(() => {
        const view = editorRef.current;
        const request = props.foldRequest;
        if (!view || !request || request.id === lastFoldIdRef.current)
            return;
        lastFoldIdRef.current = request.id;
        if (request.action === 'foldAll')
            foldAll(view);
        else if (request.action === 'unfoldAll')
            unfoldAll(view);
        else if (request.action === 'foldMore')
            foldCode(view);
        else
            unfoldCode(view);
        view.focus();
    }, [props.foldRequest]);
    return _jsx("div", { "aria-label": props.ariaLabel ?? 'Markdown Source Editor', className: `tocktutor-source-editor flex min-h-0 min-w-0 flex-1 overflow-hidden focus-within:outline-2 focus-within:outline-offset-[-2px] focus-within:outline-[var(--tt-accent)] [&_.cm-editor]:h-full [&_.cm-editor]:bg-[var(--tt-panel)] [&_.cm-editor]:text-[var(--tt-text)] [&_.cm-editor]:[font:14px/1.65_ui-monospace,SFMono-Regular,Consolas,monospace] [&_.cm-scroller]:overflow-auto [&_.cm-gutters]:border-0 [&_.cm-gutters]:bg-transparent [&_.cm-content]:pt-[30px] [&_.cm-content]:pr-7 [&_.cm-content]:pb-[72px] [&_.cm-lineNumbers]:text-[var(--tt-muted)] [&_.cm-tock-code-line]:text-[var(--tt-muted)] [&_.cm-tock-comment]:text-[var(--tt-muted)] ${props.className ?? ''}`, id: props.id, children: _jsx("div", { className: "min-h-0 min-w-0 flex-1", ref: parentRef }) });
}
//# sourceMappingURL=source-editor-runtime.js.map