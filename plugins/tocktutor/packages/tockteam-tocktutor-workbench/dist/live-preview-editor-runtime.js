import { jsx as _jsx } from "react/jsx-runtime";
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
import { isLivePreviewSourceProtected, splitLivePreviewSource } from "./live-preview-editor.js";
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
function toggleCalloutFold(source, targetIndex) {
    let index = 0;
    let offset = 0;
    let fence = null;
    for (const line of source.split(/(?<=\n)/u)) {
        const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
        if (marker !== undefined) {
            if (fence === null)
                fence = { character: marker[0], length: marker.length };
            else if (marker[0] === fence.character && marker.length >= fence.length && /^ {0,3}(?:`{3,}|~{3,})\s*$/u.test(line.trimEnd()))
                fence = null;
            offset += line.length;
            continue;
        }
        if (fence === null) {
            const match = line.match(/^(\s*>\s*\[![A-Za-z][\w-]*\])([+-])/u);
            if (match !== null) {
                if (index === targetIndex) {
                    const from = offset + match[1].length;
                    return `${source.slice(0, from)}${match[2] === '-' ? '+' : '-'}${source.slice(from + 1)}`;
                }
                index += 1;
            }
            else if (/^\s*>\s*\[![A-Za-z][\w-]*\]/u.test(line))
                index += 1;
        }
        offset += line.length;
    }
    return source;
}
function LivePreviewEditorInner(props) {
    const sourceRef = useRef(props.content);
    const synchronizedBodyRef = useRef(splitLivePreviewSource(props.content).body);
    const frontmatterRef = useRef(splitLivePreviewSource(props.content).prefix);
    const embedsRef = useRef(props.resolvedEmbeds ?? []);
    const protectedRef = useRef(isLivePreviewSourceProtected(props.content));
    const onMarkdownChangeRef = useRef(props.onMarkdownChange);
    const onOpenExternalUrlRef = useRef(props.onOpenExternalUrl);
    const onSelectionChangeRef = useRef(props.onSelectionChange);
    const onToggleTaskRef = useRef(props.onToggleTask);
    const onWidgetStateRef = useRef(props.onWidgetState);
    const syncingRef = useRef(false);
    const lastSelectionRef = useRef(null);
    const internalEditorViewRef = useRef(null);
    const onEditorViewRef = props.editorViewRef ?? internalEditorViewRef;
    useEffect(() => { onMarkdownChangeRef.current = props.onMarkdownChange; }, [props.onMarkdownChange]);
    useEffect(() => { onOpenExternalUrlRef.current = props.onOpenExternalUrl; }, [props.onOpenExternalUrl]);
    useEffect(() => { onSelectionChangeRef.current = props.onSelectionChange; }, [props.onSelectionChange]);
    useEffect(() => { onToggleTaskRef.current = props.onToggleTask; }, [props.onToggleTask]);
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
        const chrome = $prose(() => buildLivePreviewChromePlugin({
            isProtected: () => protectedRef.current,
            onOpenExternalUrl: () => onOpenExternalUrlRef.current,
            onToggleCallout: index => {
                const next = toggleCalloutFold(sourceRef.current, index);
                if (next !== sourceRef.current) {
                    sourceRef.current = next;
                    onMarkdownChangeRef.current(next);
                }
            },
            onToggleTask: index => { onToggleTaskRef.current?.(index); },
        }));
        const embedWidgets = $prose(() => buildLivePreviewEmbedPlugin(() => embedsRef.current, () => sourceRef.current));
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
                if (syncingRef.current || protectedRef.current)
                    return;
                const next = preserveLineEndings(sourceRef.current, `${frontmatterRef.current}${markdown}`);
                sourceRef.current = next;
                synchronizedBodyRef.current = splitLivePreviewSource(next).body;
                onMarkdownChangeRef.current(next);
            });
        });
    }, []);
    const loading = editor.loading;
    useEffect(() => {
        sourceRef.current = props.content;
        frontmatterRef.current = splitLivePreviewSource(props.content).prefix;
        protectedRef.current = isLivePreviewSourceProtected(props.content);
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
            const body = splitLivePreviewSource(props.content).body;
            // Serialization normalizes authored list spacing. Unchanged source must not
            // replace the document on a parent render and discard its local fold state.
            if (synchronizedBodyRef.current === body)
                return;
            const current = instance.action(ctx => getMarkdown()(ctx));
            if (normalizeSource(current) === body) {
                synchronizedBodyRef.current = body;
                return;
            }
            syncingRef.current = true;
            instance.action(replaceAll(body));
            synchronizedBodyRef.current = body;
            syncingRef.current = false;
        }
        catch {
            syncingRef.current = false;
        }
    }, [editor, loading, props.content]);
    const shellClass = useMemo(() => `tocktutor-note-links tocktutor-live-preview-editor relative min-h-0 min-w-0 flex-1 overflow-auto text-base leading-6 [&_blockquote]:mx-0 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--dsw-specific-markdown-accent)] [&_blockquote]:pl-6 [&_blockquote_p]:m-0 [&_blockquote>p+p]:mt-4 [&_a]:text-[var(--dsw-specific-markdown-accent)] [&_a]:underline [&_a]:underline-offset-2 [&_.tocktutor-live-internal-link]:text-[var(--dsw-specific-markdown-accent)] [&_.tocktutor-live-internal-link]:underline [&_.tocktutor-live-internal-link]:underline-offset-2 [&_.tocktutor-live-highlight]:bg-[var(--dsw-specific-markdown-highlight)] [&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-[26px] [&_h1]:leading-[31px] [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:leading-8 [&_h3]:mt-6 [&_h3]:mb-4 [&_h3]:text-xl [&_h3]:leading-7 [&_h4]:mt-6 [&_h4]:mb-4 [&_h4]:text-[19px] [&_h4]:leading-[27px] [&_h4]:font-[640] [&_h5]:mt-6 [&_h5]:mb-4 [&_h5]:text-[17px] [&_h5]:leading-[26px] [&_h5]:font-[620] [&_h6]:mt-6 [&_h6]:mb-4 [&_h6]:text-base [&_h6]:leading-6 [&_h6]:font-semibold [&_.ProseMirror>h1:not(:first-child)]:mt-10 [&_.ProseMirror>:is(h1,h2,h3,h4,h5,h6):first-child]:mt-0 [&_.ProseMirror>ol]:!my-6 [&_.ProseMirror>ul]:!my-6 [&_ol]:my-2 [&_ol]:pl-[30px] [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-[30px] [&_li>p]:m-0 [&_li>ul]:!my-0 [&_li>ul]:!pl-8 [&_li>ul]:border-l [&_li>ul]:border-[var(--tt-border)] [&_li>ol]:!my-0 [&_li>ol]:!pl-8 [&_li>ol]:border-l [&_li>ol]:border-[var(--tt-border)] [&_li:has(>.tocktutor-live-fold)]:relative [&_.tocktutor-live-fold]:absolute [&_.tocktutor-live-fold]:top-0 [&_.tocktutor-live-fold]:-left-10 [&_.tocktutor-live-fold]:opacity-0 [&_li:hover>.tocktutor-live-fold]:opacity-100 [&_li:focus-within>.tocktutor-live-fold]:opacity-100 [&_ul:has(li[data-item-type=task])]:m-0 [&_ul:has(li[data-item-type=task])]:list-none [&_ul:has(li[data-item-type=task])]:pl-1 [&_li[data-item-type=task]]:min-h-6 [&_li[data-item-type=task]]:leading-6 [&_li[data-item-type=task]>p]:inline [&_li[data-checked=true]>p]:text-[var(--tt-muted)] [&_li[data-checked=true]>p]:line-through [&_code]:rounded-sm [&_code]:bg-[var(--dsw-specific-markdown-inline-code)] [&_code]:px-1 [&_code]:py-0.5 [&_pre_code]:rounded-none [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-4 [&_table]:border-collapse [&_table_p]:m-0 [&_th]:border [&_th]:border-[var(--dsw-alias-border-l2,var(--tt-border))] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-[var(--dsw-alias-border-l2,var(--tt-border))] [&_td]:px-2 [&_td]:py-1 [&_.selectedCell]:bg-[var(--tt-selected)] ${props.className ?? ''}`, [props.className]);
    return _jsx("div", { "aria-label": props.ariaLabel ?? 'Live Preview Editor', className: shellClass, children: _jsx(Milkdown, {}) });
}
const plainTextPasteViews = new WeakSet();
export function LivePreviewEditorRuntime(props) {
    return _jsx(MilkdownProvider, { children: _jsx(LivePreviewEditorInner, { ...props }) });
}
//# sourceMappingURL=live-preview-editor-runtime.js.map