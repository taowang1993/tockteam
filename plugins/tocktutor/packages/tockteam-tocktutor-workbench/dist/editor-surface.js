import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, } from 'react';
import { LivePreviewEditor, MarkdownDocumentHeader } from "./live-preview-editor.js";
import { clampEditorSearchIndex, MAX_EDITOR_SEARCH_MATCHES, moveEditorSearchIndex, searchEditorMatches } from "./editor-search.js";
import { buildMarkdownSlides, renderMarkdownHtml } from "./rich-markdown.js";
import { attachInlineImages } from "./inline-images.js";
function embedLabel(embed) {
    return `${embed.target.path}${embed.target.fragment === null ? '' : `#${embed.target.fragment}`}`;
}
function handleRenderedClick(event, onOpenExternalUrl, onOpenInternalLink) {
    const target = event.target instanceof Element ? event.target : null;
    const url = target?.closest('[data-external-url]')?.dataset.externalUrl;
    if (url !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        onOpenExternalUrl?.(url);
        return;
    }
    const internalTarget = target?.closest('a.internal-link')?.dataset.target;
    if (internalTarget !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        return onOpenInternalLink?.(internalTarget);
    }
    else if (target?.closest('a') !== null) {
        event.preventDefault();
    }
}
export function ResolvedEmbedsView(props) {
    const embeds = props.embeds ?? [];
    if (embeds.length === 0)
        return null;
    return (_jsxs("section", { "aria-label": "Resolved Embeds", className: "mt-5 grid gap-3", children: [_jsx("h2", { className: "m-0 text-sm font-semibold", children: "Resolved Embeds" }), embeds.map((embed, index) => {
                const label = embedLabel(embed);
                const media = embed.target.kind === 'media';
                const image = media && embed.mimeType?.startsWith('image/');
                const audio = media && embed.mimeType?.startsWith('audio/');
                const video = media && embed.mimeType?.startsWith('video/');
                const pdf = media && embed.mimeType === 'application/pdf';
                return (_jsxs("article", { className: "overflow-auto rounded border border-[var(--tt-border)] p-3", "data-embed-depth": embed.depth, children: [_jsx("strong", { className: "block truncate text-xs", children: label }), image && _jsx("img", { alt: embed.target.display ?? embed.target.path, className: "mt-2 max-h-80 max-w-full object-contain", loading: "lazy", src: `data:${embed.mimeType};base64,${embed.content}` }), audio && _jsx("audio", { "aria-label": embed.target.display ?? embed.target.path, className: "mt-2 w-full", controls: true, preload: "metadata", src: `data:${embed.mimeType};base64,${embed.content}` }), video && _jsx("video", { "aria-label": embed.target.display ?? embed.target.path, className: "mt-2 max-h-80 max-w-full", controls: true, preload: "metadata", src: `data:${embed.mimeType};base64,${embed.content}` }), pdf && _jsx("iframe", { className: "mt-2 h-80 w-full", sandbox: "", src: `data:${embed.mimeType};base64,${embed.content}`, title: embed.target.display ?? embed.target.path }), embed.target.kind === 'note' && _jsx("div", { className: "prose text-sm", dangerouslySetInnerHTML: { __html: renderMarkdownHtml(embed.content, { externalEmbedMode: 'viewer', resolvedEmbeds: embeds, resolvedEmbedParentPath: embed.target.path }) }, onClick: event => { handleRenderedClick(event, props.onOpenExternalUrl); } }), (embed.target.kind === 'canvas' || embed.target.kind === 'base') && _jsx("pre", { className: "mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs", children: embed.content })] }, `${label}:${String(index)}`));
            })] }));
}
export function MarkdownSlidesView(props) {
    const slides = useMemo(() => buildMarkdownSlides(props.source, { externalEmbedMode: 'viewer', ...(props.embeds === undefined ? {} : { resolvedEmbeds: props.embeds }) }), [props.source, props.embeds]);
    return (_jsx("section", { "aria-label": "Slides Preview", className: "grid gap-3", children: slides.map((slide, index) => (_jsxs("article", { className: "rounded border border-[var(--tt-border)] p-3", "data-slide-index": index, children: [_jsxs("div", { className: "mb-2 text-xs text-[var(--tt-muted)]", children: ["Slide ", index + 1] }), _jsx("div", { dangerouslySetInnerHTML: { __html: slide }, onClick: event => { handleRenderedClick(event, props.onOpenExternalUrl); } })] }, index))) }));
}
function normalizedFragment(value) {
    try {
        return decodeURIComponent(value).replace(/^#+/u, '').replace(/^\^/u, '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
    }
    catch {
        return value.replace(/^#+/u, '').replace(/^\^/u, '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
    }
}
function scrollReadingFragment(fragment) {
    if (typeof document === 'undefined')
        return;
    const wanted = normalizedFragment(fragment);
    if (wanted === '')
        return;
    const root = document.querySelector('[aria-label="Reading View"] .tocktutor-reading');
    const anchor = Array.from(root?.querySelectorAll('[id]') ?? [])
        .find(candidate => normalizedFragment(candidate.id) === wanted);
    const heading = anchor ?? Array.from(root?.querySelectorAll('h1,h2,h3,h4,h5,h6') ?? [])
        .find(candidate => normalizedFragment(candidate.textContent ?? '') === wanted);
    heading?.scrollIntoView({ block: 'start' });
}
function clearReadingSearchMarks(root) {
    for (const mark of Array.from(root.querySelectorAll('[data-tocktutor-find]'))) {
        mark.replaceWith(root.ownerDocument.createTextNode(mark.textContent ?? ''));
    }
    root.normalize();
    delete root.dataset.tocktutorFindTruncated;
}
function applyReadingSearchMarks(root, query, requestedIndex) {
    clearReadingSearchMarks(root);
    if (query === '')
        return { current: null, marks: [], total: 0, truncated: false };
    const queryCheck = searchEditorMatches('', query);
    if (queryCheck.error !== undefined)
        return { current: null, error: queryCheck.error, marks: [], total: 0, truncated: false };
    const groups = [];
    let group = null;
    const walker = root.ownerDocument.createTreeWalker(root, 5);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (node.nodeType === 1) {
            if (node.tagName === 'BR')
                group = null;
            continue;
        }
        const text = node;
        if (text.parentElement?.closest('script,style') !== null)
            continue;
        const block = text.parentElement?.closest('p,li,h1,h2,h3,h4,h5,h6,pre,td,th,blockquote') ?? root;
        if (group === null || group.block !== block) {
            group = { block, nodes: [] };
            groups.push(group);
        }
        group.nodes.push(text);
    }
    const marks = [];
    let remaining = MAX_EDITOR_SEARCH_MATCHES;
    let truncated = false;
    for (const group of groups) {
        const source = group.nodes.map(node => node.nodeValue ?? '').join('');
        const result = remaining > 0
            ? searchEditorMatches(source, query, remaining)
            : searchEditorMatches(source, query, 1);
        if (result.error !== undefined)
            return { current: null, error: result.error, marks: [], total: 0, truncated: false };
        if (remaining === 0) {
            if (result.matches.length > 0 || result.truncated)
                truncated = true;
            if (truncated)
                break;
            continue;
        }
        const matches = result.matches;
        if (matches.length === 0)
            continue;
        const base = marks.length;
        let offset = 0, index = 0;
        for (const textNode of group.nodes) {
            const text = textNode.nodeValue ?? '';
            const end = offset + text.length;
            const fragment = root.ownerDocument.createDocumentFragment();
            let cursor = 0;
            while (index < matches.length && matches[index].from < end) {
                const match = matches[index];
                const from = Math.max(0, match.from - offset), to = Math.min(text.length, match.to - offset);
                if (from > cursor)
                    fragment.append(root.ownerDocument.createTextNode(text.slice(cursor, from)));
                const mark = root.ownerDocument.createElement('mark');
                mark.className = 'tocktutor-find-match';
                mark.dataset.tocktutorFind = String(base + index);
                mark.textContent = text.slice(from, to);
                marks[base + index] ??= mark;
                fragment.append(mark);
                cursor = to;
                if (match.to > end)
                    break;
                index++;
            }
            if (cursor < text.length)
                fragment.append(root.ownerDocument.createTextNode(text.slice(cursor)));
            textNode.replaceWith(fragment);
            offset = end;
        }
        remaining -= matches.length;
        if (result.truncated) {
            truncated = true;
            break;
        }
    }
    if (truncated)
        root.dataset.tocktutorFindTruncated = 'true';
    const current = clampEditorSearchIndex(marks.length, requestedIndex);
    if (current !== null)
        for (const mark of Array.from(root.querySelectorAll('[data-tocktutor-find]'))) {
            if (mark.dataset.tocktutorFind === String(current))
                mark.classList.add('tocktutor-find-current');
        }
    return { current, marks, total: marks.length, truncated };
}
export function RichReadingView(props) {
    const html = useMemo(() => renderMarkdownHtml(props.source, { externalEmbedMode: 'viewer', ...(props.embeds === undefined ? {} : { resolvedEmbeds: props.embeds }) }), [props.source, props.embeds]);
    const readingRef = useRef(null);
    const lastSearchRequestIdRef = useRef(null);
    useEffect(() => {
        const root = readingRef.current;
        if (root === null)
            return;
        const query = props.searchQuery ?? '';
        const result = applyReadingSearchMarks(root, query, props.searchCurrentIndex);
        props.onSearchState?.({
            current: result.current,
            query,
            total: result.total,
            ...(result.error === undefined ? {} : { error: result.error }),
            ...(result.truncated ? { truncated: true } : {}),
        });
    }, [html, props.onSearchState, props.searchCurrentIndex, props.searchQuery]);
    useEffect(() => {
        const root = readingRef.current;
        const request = props.searchRequest;
        if (root === null || request === null || request === undefined || request.id === lastSearchRequestIdRef.current)
            return;
        if (request.consume?.() === false)
            return;
        lastSearchRequestIdRef.current = request.id;
        const query = props.searchQuery ?? '';
        const queryError = searchEditorMatches('', query).error;
        const fragments = Array.from(root.querySelectorAll('[data-tocktutor-find]'));
        const marks = [...new Map(fragments.map(mark => [mark.dataset.tocktutorFind, mark])).values()];
        const truncated = root.dataset.tocktutorFindTruncated === 'true';
        if (request.action === 'next' || request.action === 'previous') {
            const currentMark = marks.findIndex(mark => mark.classList.contains('tocktutor-find-current'));
            const current = moveEditorSearchIndex(marks.length, currentMark < 0 ? null : currentMark, request.action === 'next' ? 1 : -1);
            for (const mark of fragments)
                mark.classList.toggle('tocktutor-find-current', current !== null && mark.dataset.tocktutorFind === marks[current]?.dataset.tocktutorFind);
            if (current !== null) {
                marks[current].scrollIntoView({ block: 'nearest' });
                root.closest('[aria-label="Reading View"]')?.focus();
            }
            props.onSearchState?.({ current, query, total: marks.length, ...(queryError === undefined ? {} : { error: queryError }), ...(truncated ? { truncated: true } : {}) });
        }
        else {
            props.onSearchState?.({ current: marks.findIndex(mark => mark.classList.contains('tocktutor-find-current')), error: queryError ?? 'Switch to Source or Live Preview to replace text.', query, total: marks.length, ...(truncated ? { truncated: true } : {}) });
        }
    }, [props.onSearchState, props.searchQuery, props.searchRequest]);
    const contentRef = useRef(null);
    useEffect(() => contentRef.current ? attachInlineImages(contentRef.current) : undefined, [html]);
    const onClick = (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.dataset.taskIndex !== undefined) {
            const index = Number(target.dataset.taskIndex);
            if (Number.isSafeInteger(index) && index >= 0)
                props.onToggleTask(index);
            return;
        }
        const result = handleRenderedClick(event, props.onOpenExternalUrl, props.onOpenInternalLink);
        if (result instanceof Promise) {
            void result.then(value => {
                const fragment = value?.fragment;
                if (fragment !== null && fragment !== undefined) {
                    const scroll = () => { scrollReadingFragment(fragment); };
                    if (typeof globalThis.requestAnimationFrame === 'function')
                        globalThis.requestAnimationFrame(scroll);
                    else
                        setTimeout(scroll, 0);
                }
            }).catch(() => undefined);
        }
    };
    return (_jsxs("section", { "aria-label": "Reading View", className: "min-h-full", tabIndex: -1, children: [_jsx(MarkdownDocumentHeader, { className: "mx-auto w-[calc(100%-48px)] max-w-[700px] pt-[18px]", ...(props.onAddProperty === undefined ? {} : { onAddProperty: props.onAddProperty }), ...(props.onSetProperty === undefined ? {} : { onSetProperty: props.onSetProperty }), source: props.source, title: props.title }), _jsx("article", { className: "tocktutor-note-links tocktutor-reading mx-auto w-[calc(100%-48px)] max-w-[700px] pt-[18px] pb-[72px] text-base leading-6 [&_.tocktutor-find-match]:bg-[color-mix(in_srgb,var(--dsw-specific-markdown-highlight)_70%,transparent)] [&_.tocktutor-find-current]:outline [&_.tocktutor-find-current]:outline-1 [&_.tocktutor-find-current]:outline-[var(--dsw-specific-markdown-accent)] [&_.callout]:my-4 [&_.callout]:rounded-md [&_.callout]:border [&_.callout]:border-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_35%,var(--tt-border))] [&_.callout]:bg-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_10%,var(--tt-panel))] [&_.callout]:px-4 [&_.callout]:py-3 [&_.callout>strong]:mb-2 [&_.callout>strong]:block [&_.callout>strong]:text-[var(--dsw-specific-markdown-accent)] [&_.footnotes]:mt-8 [&_.math-display]:my-4 [&_.mermaid]:my-4 [&_.mermaid-diagram]:my-4 [&_.mermaid-diagram]:overflow-x-auto [&_.mermaid-diagram]:rounded-md [&_.mermaid-diagram]:border [&_.mermaid-diagram]:border-[var(--tt-border)] [&_.mermaid-diagram]:bg-[color-mix(in_srgb,var(--tt-text)_3%,var(--tt-panel))] [&_.mermaid-svg]:block [&_.mermaid-svg]:h-auto [&_.mermaid-svg]:min-w-[320px] [&_.mermaid-svg]:w-full [&_.mermaid-edge-path]:fill-none [&_.mermaid-edge-path]:stroke-[var(--dsw-specific-markdown-accent)] [&_.mermaid-edge-path]:stroke-2 [&_.mermaid-arrow-head]:fill-[var(--dsw-specific-markdown-accent)] [&_.mermaid-node-shape]:fill-[color-mix(in_srgb,var(--dsw-specific-markdown-accent)_12%,var(--tt-panel))] [&_.mermaid-node-shape]:stroke-[var(--dsw-specific-markdown-accent)] [&_.mermaid-node-shape]:stroke-2 [&_.mermaid-node-label]:fill-[var(--tt-text)] [&_.mermaid-node-label]:font-[inherit] [&_.mermaid-node-label]:text-sm [&_.task-list]:m-0 [&_.task-list]:list-none [&_.task-list]:pl-1 [&_.task-list_li]:min-h-6 [&_.task-list_li]:leading-6 [&_.task-list_input]:mr-2 [&_.task-list_input]:size-3.5 [&_.task-list_input]:accent-[var(--dsw-specific-markdown-accent)] [&_.task-list_li:has(input:checked)]:text-[var(--tt-muted)] [&_.task-list_li:has(input:checked)]:line-through [&_blockquote]:mx-0 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--dsw-specific-markdown-accent)] [&_blockquote]:pl-6 [&_blockquote_p]:m-0 [&_blockquote>p+p]:mt-4 [&_a]:text-[var(--dsw-specific-markdown-accent)] [&_a]:underline [&_a]:underline-offset-2 [&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-[26px] [&_h1]:leading-[31px] [&_h1]:font-bold [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:text-2xl [&_h3]:mt-6 [&_h3]:mb-4 [&_h3]:text-xl [&_h4]:mt-6 [&_h4]:mb-4 [&_h4]:text-[19px] [&_h4]:leading-[27px] [&_h4]:font-[640] [&_h5]:mt-6 [&_h5]:mb-4 [&_h5]:text-[17px] [&_h5]:leading-[26px] [&_h5]:font-[620] [&_h6]:mt-6 [&_h6]:mb-4 [&_h6]:text-base [&_h6]:leading-6 [&_h6]:font-semibold [&>div>h1:not(:first-child)]:mt-10 [&>div>:is(h1,h2,h3,h4,h5,h6):first-child]:mt-0 [&>div>ol]:!my-6 [&>div>ul]:!my-6 [&_ol]:my-2 [&_ol]:pl-[30px] [&_ul:not(.task-list)]:my-2 [&_ul:not(.task-list)]:list-disc [&_ul:not(.task-list)]:pl-[30px] [&_li>ul]:!my-0 [&_li>ul]:!pl-8 [&_li>ul]:border-l [&_li>ul]:border-[var(--tt-border)] [&_li>ol]:!my-0 [&_li>ol]:!pl-8 [&_li>ol]:border-l [&_li>ol]:border-[var(--tt-border)] [&_mark]:bg-[var(--dsw-specific-markdown-highlight)] [&_mark]:text-inherit [&_code]:rounded-sm [&_code]:bg-[var(--dsw-specific-markdown-inline-code)] [&_code]:px-1 [&_code]:py-0.5 [&_pre_code]:rounded-none [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_p]:mt-0 [&_p]:mb-4 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-[var(--tt-border)] [&_pre]:bg-[color-mix(in_srgb,var(--tt-text)_4%,var(--tt-panel))] [&_pre]:p-3 [&_table]:my-4 [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--dsw-alias-border-l2,var(--tt-border))] [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-[var(--dsw-alias-border-l2,var(--tt-border))] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold", onClick: onClick, ref: readingRef, children: _jsx("div", { className: "[&_img]:h-auto [&_img]:max-h-none [&_img]:max-w-full", dangerouslySetInnerHTML: { __html: html }, ref: contentRef }) })] }));
}
export function LivePreviewView(props) {
    return (_jsx("section", { "aria-label": "Live Preview", className: "flex min-h-full flex-col", tabIndex: -1, children: _jsx(LivePreviewEditor, { ariaLabel: "Live Preview Editor", className: "min-h-[20rem]", content: props.source, localEditRevision: props.localEditRevision, onMarkdownChange: props.onEdit, ...(props.onAddProperty === undefined ? {} : { onAddProperty: props.onAddProperty }), ...(props.onOpenExternalUrl === undefined ? {} : { onOpenExternalUrl: props.onOpenExternalUrl }), ...(props.onSearchState === undefined ? {} : { onSearchState: props.onSearchState }), ...(props.onSetProperty === undefined ? {} : { onSetProperty: props.onSetProperty }), ...(props.embeds === undefined ? {} : { resolvedEmbeds: props.embeds }), ...(props.onSelectionChange === undefined ? {} : { onSelectionChange: props.onSelectionChange }), ...(props.searchCurrentIndex === undefined ? {} : { searchCurrentIndex: props.searchCurrentIndex }), ...(props.searchQuery === undefined ? {} : { searchQuery: props.searchQuery }), ...(props.searchRequest === undefined ? {} : { searchRequest: props.searchRequest }), onToggleTask: props.onToggleTask, title: props.title }, props.documentKey) }));
}
//# sourceMappingURL=editor-surface.js.map