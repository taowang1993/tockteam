import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck -- Milkdown 7.20's extensionless declarations are not consumable by the pinned Typert NodeNext analyzer; runtime stays pinned to the public packages.
import { Editor as MilkdownEditorCore, defaultValueCtx, rootCtx } from '@milkdown/core';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { Plugin } from '@milkdown/prose/state';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { $prose, getMarkdown, replaceAll } from '@milkdown/utils';
import { useEffect, useMemo, useRef, } from 'react';
import { projectEditorWidgets } from "./editor-widgets.js";
import { runLivePreviewTableAction } from "./milkdown-editor-commands.js";
import { splitLivePreviewSource } from "./live-preview-editor.js";
import { buildLivePreviewEmbedPlugin, livePreviewEmbedPluginKey } from "./live-preview-embed-widgets.js";
import { buildLivePreviewChromePlugin } from "./live-preview-chrome.js";
function normalizeSource(source) {
    return source.replace(/\r\n?/gu, '\n');
}
function preserveLineEndings(authored, edited) {
    const separators = [...authored.matchAll(/\r\n|\r|\n/gu)].map(match => match[0]);
    if (separators.length === 0)
        return edited;
    const preferred = separators.find(separator => separator === '\r\n') ?? separators[0] ?? '\n';
    let index = 0;
    return edited.replace(/\n/gu, () => separators[index++] ?? preferred);
}
function sameSelection(left, right) {
    return left?.from === right.from && left.to === right.to;
}
function selectedTextblock(view) {
    const selection = view.state.selection;
    if (!selection.empty || !selection.$from.parent.isTextblock || selection.$from.depth < 1)
        return null;
    return {
        from: selection.$from.before(selection.$from.depth),
        text: `${selection.$from.parent.textContent}\n`,
        to: selection.$from.after(selection.$from.depth),
    };
}
function deleteSelectedTextblock(view) {
    const block = selectedTextblock(view);
    if (block === null || !view.editable)
        return false;
    const transaction = block.from === 0 && block.to === view.state.doc.content.size
        ? view.state.tr.replaceWith(0, view.state.doc.content.size, view.state.schema.nodes.paragraph.create())
        : view.state.tr.delete(block.from, block.to);
    view.dispatch(transaction.scrollIntoView());
    return true;
}
function LivePreviewEditorInner(props) {
    const sourceRef = useRef(props.content);
    const frontmatterRef = useRef(splitLivePreviewSource(props.content).prefix);
    const embedsRef = useRef(props.resolvedEmbeds ?? []);
    const onMarkdownChangeRef = useRef(props.onMarkdownChange);
    const onOpenExternalUrlRef = useRef(props.onOpenExternalUrl);
    const onSelectionChangeRef = useRef(props.onSelectionChange);
    const onWidgetStateRef = useRef(props.onWidgetState);
    const syncingRef = useRef(false);
    const lastSelectionRef = useRef(null);
    const internalEditorViewRef = useRef(null);
    const onEditorViewRef = props.editorViewRef ?? internalEditorViewRef;
    useEffect(() => { onMarkdownChangeRef.current = props.onMarkdownChange; }, [props.onMarkdownChange]);
    useEffect(() => { onOpenExternalUrlRef.current = props.onOpenExternalUrl; }, [props.onOpenExternalUrl]);
    useEffect(() => { onSelectionChangeRef.current = props.onSelectionChange; }, [props.onSelectionChange]);
    useEffect(() => { onWidgetStateRef.current = props.onWidgetState; }, [props.onWidgetState]);
    const editor = useEditor((root) => {
        const lifecycle = $prose(() => new Plugin({
            view: view => {
                onEditorViewRef && (onEditorViewRef.current = view);
                const publish = () => {
                    const selection = { from: view.state.selection.from, to: view.state.selection.to };
                    if (!sameSelection(lastSelectionRef.current, selection)) {
                        lastSelectionRef.current = selection;
                        onSelectionChangeRef.current?.(selection);
                    }
                    onWidgetStateRef.current?.(projectEditorWidgets(sourceRef.current, selection));
                };
                publish();
                return {
                    update: () => { publish(); },
                    destroy: () => {
                        if (onEditorViewRef?.current === view)
                            onEditorViewRef.current = null;
                        onWidgetStateRef.current?.([]);
                    },
                };
            },
        }));
        const chrome = $prose(() => buildLivePreviewChromePlugin(() => onOpenExternalUrlRef.current));
        const embedWidgets = $prose(() => buildLivePreviewEmbedPlugin(() => embedsRef.current));
        const editingShortcuts = $prose(() => new Plugin({
            props: {
                handleKeyDown: (view, event) => {
                    if (!view.editable)
                        return false;
                    if (event.key === 'Enter' && event.shiftKey) {
                        event.preventDefault();
                        view.dispatch(view.state.tr.insertText('  \n'));
                        return true;
                    }
                    if (event.key.toLocaleLowerCase() === 'k' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        return deleteSelectedTextblock(view);
                    }
                    return false;
                },
                handleDOMEvents: {
                    keydown: (_view, event) => {
                        if (event.key.toLowerCase() === 'v' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
                            plainTextPasteViews.add(_view);
                        }
                        return false;
                    },
                    paste: (view, event) => {
                        if (!plainTextPasteViews.delete(view) || !view.editable)
                            return false;
                        const text = event.clipboardData?.getData('text/plain') ?? '';
                        event.preventDefault();
                        view.dispatch(view.state.tr.insertText(text));
                        return true;
                    },
                    copy: (view, event) => {
                        const block = selectedTextblock(view);
                        if (block === null || event.clipboardData === null)
                            return false;
                        event.clipboardData.setData('text/plain', block.text);
                        event.preventDefault();
                        return true;
                    },
                    cut: (view, event) => {
                        const block = selectedTextblock(view);
                        if (block === null || event.clipboardData === null || !view.editable)
                            return false;
                        event.clipboardData.setData('text/plain', block.text);
                        event.preventDefault();
                        return deleteSelectedTextblock(view);
                    },
                },
            },
        }));
        return MilkdownEditorCore.make()
            .config(ctx => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, splitLivePreviewSource(props.content).body);
        })
            .use(commonmark)
            .use(gfm)
            .use(listener)
            .use(history)
            .use(editingShortcuts)
            .use(chrome)
            .use(embedWidgets)
            .use(lifecycle)
            .config(ctx => {
            const manager = ctx.get(listenerCtx);
            manager.markdownUpdated((_ctx, markdown) => {
                if (syncingRef.current)
                    return;
                const next = preserveLineEndings(sourceRef.current, `${frontmatterRef.current}${markdown}`);
                sourceRef.current = next;
                onMarkdownChangeRef.current(next);
            });
        });
    }, []);
    const loading = editor.loading;
    useEffect(() => {
        sourceRef.current = props.content;
        frontmatterRef.current = splitLivePreviewSource(props.content).prefix;
    }, [props.content]);
    useEffect(() => {
        embedsRef.current = props.resolvedEmbeds ?? [];
        const view = onEditorViewRef.current;
        if (view !== null)
            view.dispatch(view.state.tr.setMeta(livePreviewEmbedPluginKey, true));
    }, [onEditorViewRef, props.resolvedEmbeds]);
    useEffect(() => {
        if (loading)
            return;
        const instance = editor.get();
        if (!instance)
            return;
        try {
            const current = instance.action(ctx => getMarkdown()(ctx));
            const body = splitLivePreviewSource(props.content).body;
            if (normalizeSource(current) === body)
                return;
            syncingRef.current = true;
            instance.action(replaceAll(body));
            syncingRef.current = false;
        }
        catch {
            syncingRef.current = false;
        }
    }, [editor, loading, props.content]);
    const tableDocument = /^(?:\s*\|.*\|\s*)$/mu.test(props.content);
    const tableAction = (action) => {
        const view = onEditorViewRef?.current;
        if (view && runLivePreviewTableAction(view, action))
            props.onTableAction?.(action);
    };
    const shellClass = useMemo(() => `tocktutor-live-preview-editor relative min-h-0 min-w-0 flex-1 overflow-auto ${props.className ?? ''}`, [props.className]);
    return (_jsxs("div", { "aria-label": props.ariaLabel ?? 'Live Preview Editor', className: shellClass, children: [tableDocument && (_jsx("div", { "aria-label": "Live Preview Table Commands", className: "sticky top-0 z-1 flex flex-wrap gap-1 border-b border-[var(--tt-border)] bg-[var(--tt-panel)] p-1 text-xs", children: [['add-row-before', 'Add Row Above'], ['add-row-after', 'Add Row Below'], ['move-row-up', 'Move Row Up'], ['move-row-down', 'Move Row Down'], ['delete-row', 'Delete Row'], ['add-column-before', 'Add Column Left'], ['add-column-after', 'Add Column Right'], ['move-column-left', 'Move Column Left'], ['move-column-right', 'Move Column Right'], ['delete-column', 'Delete Column'], ['align-default', 'Default Alignment'], ['align-left', 'Align Left'], ['align-center', 'Align Center'], ['align-right', 'Align Right'], ['sort-ascending', 'Sort Ascending'], ['sort-descending', 'Sort Descending']].map(([action, label]) => (_jsx("button", { className: "rounded border border-[var(--tt-border)] bg-transparent px-1.5 py-0.5 text-inherit", onClick: () => { tableAction(action); }, type: "button", children: label }, action))) })), _jsx(Milkdown, {})] }));
}
const plainTextPasteViews = new WeakSet();
export function LivePreviewEditorRuntime(props) {
    return _jsx(MilkdownProvider, { children: _jsx(LivePreviewEditorInner, { ...props }) });
}
//# sourceMappingURL=live-preview-editor-runtime.js.map