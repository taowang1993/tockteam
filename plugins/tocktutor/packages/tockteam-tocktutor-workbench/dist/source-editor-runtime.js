import { jsx as _jsx } from "react/jsx-runtime";
// @ts-nocheck -- CodeMirror's declaration graph is not consumable by the pinned Typert NodeNext analyzer; the public adapter remains runtime-typed by CodeMirror.
import { minimalSetup } from 'codemirror';
import { invertedEffects, isolateHistory } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { yamlFrontmatter } from '@codemirror/lang-yaml';
import { Tag, tags } from '@lezer/highlight';
import { defaultHighlightStyle, foldAll, foldCode, foldGutter, HighlightStyle, syntaxHighlighting, syntaxTree, unfoldAll, unfoldCode } from '@codemirror/language';
import { EditorSelection, EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, keymap, rectangularSelection, scrollPastEnd, } from '@codemirror/view';
import { projectEditorWidgets } from "./editor-widgets.js";
import { useEffect, useMemo, useRef, } from 'react';
import { buildSourceChange, preserveEditorLineEndings, shouldAddEditorSelectionRange, shouldStartEditorRectangularSelection, } from "./source-editor.js";
import { buildSourceEmbedWidgetExtension, refreshSourceEmbedWidgets } from "./source-embed-widgets.js";
import { applyEditorCommandToSelections } from "./editor-commands.js";
import { clampEditorSearchIndex, moveEditorSearchIndex, searchEditorMatches } from "./editor-search.js";
import firaCodeUrl from './fonts/FiraCode-VF.woff2';
import { buildLivePreviewExtension, refreshLivePreview } from "./live-preview-decorations.js";
const firaCode = typeof FontFace === 'undefined'
    ? null
    : new FontFace('Fira Code VF', `url(${firaCodeUrl})`, { style: 'normal', weight: '300 700' });
function normalizeEditorSource(source) {
    return source.replace(/\r\n?/gu, '\n');
}
const restoreSeparators = StateEffect.define();
const separators = (source) => source.match(/\r\n|\r|\n/gu) ?? [];
const authoredSource = StateField.define({
    create: state => state.doc.toString(),
    update(source, transaction) {
        const restore = transaction.effects.filter(effect => effect.is(restoreSeparators)).at(-1);
        if (restore) {
            let index = 0;
            return transaction.newDoc.toString().replace(/\n/gu, () => restore.value[index++] ?? '\n');
        }
        if (!transaction.docChanged)
            return source;
        let raw = 0, canonical = 0, copied = 0;
        const parts = [];
        const offset = (position) => {
            while (canonical < position && raw < source.length) {
                if (source[raw] === '\r' && source[raw + 1] === '\n')
                    raw++;
                raw++;
                canonical++;
            }
            return raw;
        };
        transaction.changes.iterChanges((from, to, _newFrom, _newTo, inserted) => {
            const start = offset(from), end = offset(to);
            const original = source.slice(start, end);
            const text = inserted.toString();
            // Bulk replacements must not rescan the remaining document per match.
            const basis = inserted.lines > 1 && !original
                ? source.slice(start).match(/\r\n|\r|\n/u)?.[0] ?? separators(source).at(-1) ?? '\n'
                : original;
            parts.push(source.slice(copied, start), inserted.lines > 1 ? preserveEditorLineEndings(basis, text) : text);
            copied = end;
        });
        return parts.join('') + source.slice(copied);
    },
});
const EMPTY_EXTENSIONS = Object.freeze([]);
const searchDecorationsEffect = StateEffect.define();
const searchDecorationsField = StateField.define({
    create: () => ({ current: null, decorations: Decoration.none, query: '' }),
    update(value, transaction) {
        let query = value.query;
        let current = value.current;
        for (const effect of transaction.effects) {
            if (effect.is(searchDecorationsEffect)) {
                query = effect.value.query;
                current = effect.value.current;
            }
        }
        if (!transaction.docChanged && query === value.query && current === value.current)
            return value;
        const matches = searchEditorMatches(transaction.state.doc.toString(), query).matches;
        const selected = clampEditorSearchIndex(matches.length, current);
        return {
            current: selected,
            decorations: Decoration.set(matches.map((match, index) => Decoration.mark({ class: `cm-tock-find-match${index === selected ? ' cm-tock-find-current' : ''}` }).range(match.from, match.to)), true),
            query,
        };
    },
    provide: field => EditorView.decorations.from(field, value => value.decorations),
});
const highlightTag = Tag.define();
const highlightDelimiter = { resolve: 'Highlight', mark: 'HighlightMark' };
const noteInlineSyntax = {
    defineNodes: [
        { name: 'Highlight', style: { 'Highlight/...': highlightTag } },
        'HighlightMark',
        { name: 'WikiLink', style: tags.link },
    ],
    parseInline: [
        {
            name: 'Highlight',
            parse(cx, char, pos) {
                if (char !== 61 || cx.char(pos + 1) !== 61 || cx.char(pos - 1) === 61 || cx.char(pos + 2) === 61)
                    return -1;
                return cx.addDelimiter(highlightDelimiter, pos, pos + 2, !/\s/u.test(cx.slice(pos + 2, pos + 3)), !/\s/u.test(cx.slice(pos - 1, pos)));
            },
        },
        {
            name: 'WikiLink', before: 'Link',
            parse(cx, char, pos) {
                if (char !== 91 || cx.char(pos + 1) !== 91)
                    return -1;
                const match = /^\[\[[^\]\n]+\]\]/u.exec(cx.slice(pos, cx.end));
                return match ? cx.addElement(cx.elt('WikiLink', pos, pos + match[0].length)) : -1;
            },
        },
    ],
};
function selectionSnapshot(view) {
    const ranges = view.state.selection.ranges.map(range => ({ from: range.from, to: range.to }));
    const main = ranges[view.state.selection.mainIndex] ?? ranges[0] ?? { from: 0, to: 0 };
    return { main, ranges };
}
function applySelectionRequest(view, request) {
    if (request === null || request === undefined || !Number.isSafeInteger(request.id) || request.id < 0)
        return false;
    const from = Number.isSafeInteger(request.from) ? Math.max(0, Math.min(request.from, view.state.doc.length)) : 0;
    const to = Number.isSafeInteger(request.to) ? Math.max(from, Math.min(request.to, view.state.doc.length)) : from;
    view.dispatch({ scrollIntoView: true, selection: { anchor: from, head: to } });
    view.focus();
    return true;
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
    const firstBlock = syntaxTree(state).topNode.firstChild;
    const frontmatterEnd = firstBlock?.name === 'Frontmatter' ? firstBlock.to : 0;
    let fenceOpen = false;
    let commentOpen = false;
    for (let number = 1; number <= state.doc.lines; number += 1) {
        const line = state.doc.line(number);
        if (line.from < frontmatterEnd)
            continue;
        const text = line.text;
        const fence = /^ {0,3}(`{3,}|~{3,})/u.test(text);
        if (fence)
            fenceOpen = !fenceOpen;
        const heading = !fenceOpen && !commentOpen ? text.match(/^ {0,3}(#{1,6})(?:\s|$)/u) : null;
        if (heading !== null) {
            const markerStart = line.from + heading[0].indexOf('#');
            decorations.push(Decoration.line({ class: `cm-tock-heading-line cm-tock-heading-${heading[1].length}` }).range(line.from), Decoration.mark({ class: 'cm-tock-heading-mark' }).range(markerStart, markerStart + heading[1].length));
        }
        if (fenceOpen || /^\s*(?:[-+*]|\d+[.)])\s+\[[^\]]\]/u.test(text)) {
            decorations.push(Decoration.line({ class: fenceOpen ? 'cm-tock-code-line' : 'cm-tock-task-line' }).range(line.from));
        }
        let cursor = 0;
        if (commentOpen) {
            const close = text.indexOf('%%');
            if (close < 0) {
                if (line.from < line.to)
                    decorations.push(Decoration.mark({ class: 'cm-tock-comment' }).range(line.from, line.to));
            }
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
    return Decoration.set(decorations, true);
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
            changes: buildSourceChange(view.state.doc.toString(), result.source),
            selection: EditorSelection.create(result.ranges.map(range => EditorSelection.range(range.from, range.to)), view.state.selection.mainIndex),
        });
        return true;
    };
    let plainTextPaste = false;
    const extensions = [
        minimalSetup,
        authoredSource.init(() => props.sourceRef.current),
        // Undo retains only changed newline metadata, never whole-note snapshots.
        invertedEffects.of(transaction => {
            if (!transaction.docChanged)
                return [];
            const before = separators(transaction.startState.field(authoredSource));
            const after = separators(transaction.state.field(authoredSource));
            return before.join('\0') === after.join('\0') ? [] : [restoreSeparators.of(before)];
        }),
        EditorView.theme({
            '.cm-content': { caretColor: 'var(--tt-text)' },
            '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--tt-text)' },
        }),
        searchDecorationsField,
        yamlFrontmatter({ content: markdown({ base: markdownLanguage, extensions: [noteInlineSyntax] }) }),
        // Keep ordinary punctuation readable; use the shared document colors for links and highlights.
        syntaxHighlighting(HighlightStyle.define([
            ...defaultHighlightStyle.specs.map(spec => ({ ...spec, color: 'inherit' })),
            { tag: [tags.link, tags.url], color: 'var(--dsw-specific-markdown-accent)' },
            { tag: highlightTag, backgroundColor: 'var(--dsw-specific-markdown-highlight)' },
        ])),
        ...(props.showFoldGutter ? [foldGutter()] : []),
        ...(props.livePreview ? [] : [scrollPastEnd()]),
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
        EditorView.contentAttributes.of({
            spellcheck: props.spellCheck ? 'true' : 'false',
        }),
        ...(props.livePreview ? [] : [EditorView.decorations.compute(['doc'], sourceDecorations)]),
        EditorView.updateListener.of((update) => {
            if (update.docChanged && props.sourceRef.current !== update.state.field(authoredSource)) {
                props.sourceRef.current = update.state.field(authoredSource);
                props.onContentChangeRef.current?.(props.sourceRef.current);
                const query = props.searchQueryRef.current;
                const result = searchEditorMatches(update.state.doc.toString(), query);
                const matches = result.matches;
                const current = clampEditorSearchIndex(matches.length, props.searchCurrentIndexRef.current);
                props.searchCurrentIndexRef.current = current;
                props.onSearchStateRef.current?.({
                    current,
                    query,
                    total: matches.length,
                    ...(result.error === undefined ? {} : { error: result.error }),
                    ...(result.truncated ? { truncated: true } : {}),
                });
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
    const localEditRevisionRef = useRef(props.localEditRevision);
    const embedsRef = useRef(props.resolvedEmbeds ?? []);
    const onContentChangeRef = useRef(props.onContentChange);
    const onSelectionChangeRef = useRef(props.onSelectionChange);
    const onWidgetStateRef = useRef(props.onWidgetState);
    const onSearchStateRef = useRef(props.onSearchState);
    const searchQueryRef = useRef(props.searchQuery ?? '');
    const searchCurrentIndexRef = useRef(props.searchCurrentIndex ?? null);
    const lastSearchQueryRef = useRef(props.searchQuery ?? '');
    const lastSearchRequestIdRef = useRef(null);
    const lastInsertIdRef = useRef(null);
    const lastFoldIdRef = useRef(null);
    const lastSelectionRequestIdRef = useRef(null);
    const appliedSelectionViewRef = useRef(null);
    const selectionRequestRef = useRef(props.selectionRequest);
    useEffect(() => { selectionRequestRef.current = props.selectionRequest; }, [props.selectionRequest]);
    const editable = props.editable !== false;
    const livePreview = props.livePreview === true;
    const openUrlRef = useRef(props.onOpenExternalUrl);
    useEffect(() => { openUrlRef.current = props.onOpenExternalUrl; }, [props.onOpenExternalUrl]);
    const showFoldGutter = props.showFoldGutter === true;
    useEffect(() => {
        if (firaCode === null)
            return;
        document.fonts.add(firaCode);
        void firaCode.load().catch(() => undefined);
    }, []);
    const userExtensions = props.extraExtensions ?? EMPTY_EXTENSIONS;
    const chromeExtensions = useMemo(() => livePreview
        ? buildLivePreviewExtension(() => embedsRef.current, url => openUrlRef.current?.(url))
        : buildSourceEmbedWidgetExtension(() => embedsRef.current), [livePreview]);
    const extraExtensions = useMemo(() => [...chromeExtensions, ...userExtensions], [chromeExtensions, userExtensions]);
    useEffect(() => {
        embedsRef.current = props.resolvedEmbeds ?? [];
        if (livePreview)
            editorRef.current?.dispatch({ effects: refreshLivePreview.of(undefined) });
        else
            refreshSourceEmbedWidgets(editorRef.current);
    }, [livePreview, props.resolvedEmbeds]);
    useEffect(() => { onContentChangeRef.current = props.onContentChange; }, [props.onContentChange]);
    useEffect(() => { onSelectionChangeRef.current = props.onSelectionChange; }, [props.onSelectionChange]);
    useEffect(() => { onWidgetStateRef.current = props.onWidgetState; }, [props.onWidgetState]);
    useEffect(() => { onSearchStateRef.current = props.onSearchState; }, [props.onSearchState]);
    const extensions = useMemo(() => buildEditorExtensions({
        editable,
        livePreview,
        extraExtensions,
        onContentChangeRef,
        onSearchStateRef,
        onSelectionChangeRef,
        onWidgetStateRef,
        searchCurrentIndexRef,
        searchQueryRef,
        showFoldGutter,
        sourceRef,
        spellCheck: props.spellCheck !== false,
    }), [editable, livePreview, extraExtensions, showFoldGutter, props.spellCheck]);
    useEffect(() => {
        const parent = parentRef.current;
        if (!parent)
            return;
        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: normalizeEditorSource(sourceRef.current), extensions,
                selection: { anchor: livePreview ? (normalizeEditorSource(sourceRef.current).match(/^---\n[\s\S]*?\n(?:---|\.\.\.)(?:\n|$)/u)?.[0].length ?? 0) : 0 },
            }),
        });
        editorRef.current = view;
        if (props.editorViewRef)
            props.editorViewRef.current = view;
        appliedSelectionViewRef.current = null;
        const selectionRequest = selectionRequestRef.current;
        if (selectionRequest !== null && selectionRequest !== undefined
            && Number.isSafeInteger(selectionRequest.id)
            && selectionRequest.id >= 0
            && (lastSelectionRequestIdRef.current === null || selectionRequest.id >= lastSelectionRequestIdRef.current)) {
            lastSelectionRequestIdRef.current = selectionRequest.id;
            if (applySelectionRequest(view, selectionRequest))
                appliedSelectionViewRef.current = view;
        }
        onSelectionChangeRef.current?.(selectionSnapshot(view));
        onWidgetStateRef.current?.(projectEditorWidgets(sourceRef.current, selectionSnapshot(view).main));
        return () => {
            onWidgetStateRef.current?.([]);
            view.destroy();
            if (editorRef.current === view)
                editorRef.current = null;
            if (props.editorViewRef?.current === view)
                props.editorViewRef.current = null;
        };
    }, [extensions, livePreview, props.editorViewRef, showFoldGutter]);
    const publishSearch = (view, query, requestedIndex, error) => {
        const result = searchEditorMatches(view.state.doc.toString(), query);
        const matches = result.matches;
        const current = clampEditorSearchIndex(matches.length, requestedIndex);
        searchCurrentIndexRef.current = current;
        const stateError = error ?? result.error;
        const state = {
            current,
            query,
            total: matches.length,
            ...(stateError === undefined ? {} : { error: stateError }),
            ...(result.truncated ? { truncated: true } : {}),
        };
        onSearchStateRef.current?.(state);
        return state;
    };
    useEffect(() => {
        const view = editorRef.current;
        if (!view)
            return;
        const localEdit = localEditRevisionRef.current !== props.localEditRevision;
        localEditRevisionRef.current = props.localEditRevision;
        const change = buildSourceChange(view.state.doc.toString(), normalizeEditorSource(props.content));
        if (!change && view.state.field(authoredSource) === props.content)
            return;
        sourceRef.current = props.content;
        if (localEdit) {
            view.dispatch({ changes: change ?? [], effects: restoreSeparators.of(separators(props.content)), annotations: isolateHistory.of('full') });
        }
        else {
            // Synchronize authoritative peer content before consuming same-render commands.
            const { scrollTop, scrollLeft } = view.scrollDOM;
            const focused = view.hasFocus;
            const selection = view.state.selection.main;
            const content = normalizeEditorSource(props.content);
            view.setState(EditorState.create({ doc: content, extensions, selection: {
                    anchor: Math.min(selection.anchor, content.length), head: Math.min(selection.head, content.length),
                } }));
            if (livePreview)
                view.dispatch({ effects: refreshLivePreview.of(focused) });
            view.scrollDOM.scrollTop = scrollTop;
            view.scrollDOM.scrollLeft = scrollLeft;
            onSelectionChangeRef.current?.(selectionSnapshot(view));
            onWidgetStateRef.current?.(projectEditorWidgets(props.content, selectionSnapshot(view).main));
        }
        view.dispatch({ effects: searchDecorationsEffect.of({ query: searchQueryRef.current, current: searchCurrentIndexRef.current }) });
        publishSearch(view, searchQueryRef.current, searchCurrentIndexRef.current);
    }, [extensions, livePreview, props.content, props.localEditRevision]);
    useEffect(() => {
        const view = editorRef.current;
        const query = props.searchQuery ?? '';
        searchQueryRef.current = query;
        if (lastSearchQueryRef.current !== query) {
            searchCurrentIndexRef.current = props.searchCurrentIndex ?? null;
            lastSearchQueryRef.current = query;
        }
        else if (props.searchCurrentIndex !== undefined) {
            searchCurrentIndexRef.current = props.searchCurrentIndex;
        }
        if (view === null)
            return;
        const result = searchEditorMatches(view.state.doc.toString(), query);
        const matches = result.matches;
        const current = clampEditorSearchIndex(matches.length, searchCurrentIndexRef.current);
        searchCurrentIndexRef.current = current;
        view.dispatch({ effects: searchDecorationsEffect.of({ current, query }) });
        publishSearch(view, query, current);
    }, [props.searchCurrentIndex, props.searchQuery]);
    useEffect(() => {
        const view = editorRef.current;
        const request = props.searchRequest;
        if (view === null || request === null || request === undefined || request.id === lastSearchRequestIdRef.current)
            return;
        if (request.consume?.() === false)
            return;
        lastSearchRequestIdRef.current = request.id;
        const query = searchQueryRef.current;
        const source = view.state.doc.toString();
        const result = searchEditorMatches(source, query);
        const matches = result.matches;
        if (result.error !== undefined) {
            publishSearch(view, query, searchCurrentIndexRef.current, result.error);
            return;
        }
        if (request.action === 'next' || request.action === 'previous') {
            const current = moveEditorSearchIndex(matches.length, searchCurrentIndexRef.current, request.action === 'next' ? 1 : -1);
            searchCurrentIndexRef.current = current;
            view.dispatch({
                effects: searchDecorationsEffect.of({ current, query }),
                ...(current === null ? {} : { scrollIntoView: true, selection: { anchor: matches[current].from, head: matches[current].to } }),
            });
            if (current !== null)
                view.focus();
            publishSearch(view, query, current);
            return;
        }
        if (view.state.readOnly) {
            publishSearch(view, query, searchCurrentIndexRef.current, 'This editor is read-only.');
            return;
        }
        if (request.action === 'replace-all' && result.truncated) {
            publishSearch(view, query, searchCurrentIndexRef.current, 'Too many matches to replace all at once; narrow the query.');
            return;
        }
        const current = clampEditorSearchIndex(matches.length, searchCurrentIndexRef.current);
        const selectedMatches = request.action === 'replace-all'
            ? matches
            : current === null ? [] : [matches[current]];
        if (selectedMatches.length === 0) {
            publishSearch(view, query, current);
            return;
        }
        const replacement = (request.replacement ?? '').replace(/\r\n?/gu, '\n');
        const originalBytes = new TextEncoder().encode(source).byteLength;
        const removedBytes = selectedMatches.reduce((total, match) => total + new TextEncoder().encode(source.slice(match.from, match.to)).byteLength, 0);
        const replacementBytes = new TextEncoder().encode(replacement).byteLength * selectedMatches.length;
        if (originalBytes - removedBytes + replacementBytes > 2_000_000) {
            publishSearch(view, query, current, 'Replacement exceeds the editor size limit.');
            return;
        }
        const match = selectedMatches[0];
        const transaction = view.state.update({
            annotations: isolateHistory.of('full'),
            changes: selectedMatches.map(match => ({ from: match.from, to: match.to, insert: replacement })),
            ...(request.action === 'replace-all' ? {} : { scrollIntoView: true, selection: { anchor: match.from, head: match.from + replacement.length } }),
        });
        // Canonical offsets exclude CRLF bytes; check the authored candidate before dispatch.
        if (new TextEncoder().encode(transaction.state.field(authoredSource)).byteLength > 2_000_000) {
            publishSearch(view, query, current, 'Replacement exceeds the editor size limit.');
            return;
        }
        view.dispatch(transaction);
        if (request.action !== 'replace-all')
            view.focus();
        publishSearch(view, query, current);
    }, [props.searchRequest]);
    useEffect(() => {
        const view = editorRef.current;
        const request = props.selectionRequest;
        if (!view || request === null || request === undefined || !Number.isSafeInteger(request.id) || request.id < 0)
            return;
        const latestId = lastSelectionRequestIdRef.current;
        if ((latestId !== null && request.id < latestId) || (request.id === latestId && appliedSelectionViewRef.current === view))
            return;
        lastSelectionRequestIdRef.current = request.id;
        if (applySelectionRequest(view, request))
            appliedSelectionViewRef.current = view;
    }, [props.selectionRequest]);
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
    return _jsx("div", { "aria-label": props.ariaLabel ?? 'Markdown Source Editor', className: `tocktutor-source-editor flex min-h-0 min-w-0 flex-1 overflow-hidden focus-within:outline-2 focus-within:outline-offset-[-2px] focus-within:outline-[var(--tt-accent)] [&_.cm-editor]:h-full [&_.cm-editor]:bg-[var(--tt-panel)] [&_.cm-editor]:text-[var(--tt-text)] [&_.cm-editor]:[font:16px/1.5_'Fira_Code_VF','Fira_Code',ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation_Mono','Courier_New',monospace] [&_.cm-scroller]:overflow-auto [&_.cm-scroller]:leading-6 [&_.cm-gutters]:hidden [&_.cm-content]:mx-auto [&_.cm-content]:w-[calc(100%-48px)] [&_.cm-content]:max-w-3xl [&_.cm-content]:pt-[18px] [&_.cm-content]:pb-[72px] [&_.cm-line.cm-tock-heading-1]:text-[22px] [&_.cm-line.cm-tock-heading-1]:leading-[1.35] [&_.cm-line.cm-tock-heading-2]:text-[20px] [&_.cm-line.cm-tock-heading-2]:leading-[1.35] [&_.cm-line.cm-tock-heading-3]:text-[18px] [&_.cm-line.cm-tock-heading-3]:leading-[1.4] [&_.cm-tock-heading-mark]:[color:light-dark(var(--tt-text),#fff)] [&_.cm-tock-heading-mark_*]:!text-inherit [&_.cm-tock-heading-mark]:[font-size:inherit] [&_.cm-tock-heading-line_*]:no-underline [&_.cm-activeLine]:bg-transparent [&_.cm-tock-code-line]:text-[var(--tt-muted)] [&_.cm-tock-comment]:text-[var(--tt-muted)] [&_.cm-tock-find-match]:bg-[color-mix(in_srgb,var(--dsw-specific-markdown-highlight)_70%,transparent)] [&_.cm-tock-find-current]:outline [&_.cm-tock-find-current]:outline-1 [&_.cm-tock-find-current]:outline-[var(--dsw-specific-markdown-accent)] ${props.className ?? ''}`, id: props.id, children: _jsx("div", { className: "min-h-0 min-w-0 flex-1", ref: parentRef }) });
}
//# sourceMappingURL=source-editor-runtime.js.map