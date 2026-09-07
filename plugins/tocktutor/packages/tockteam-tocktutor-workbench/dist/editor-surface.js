import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, } from 'react';
import { LivePreviewEditor, MarkdownDocumentHeader } from "./live-preview-editor.js";
import { buildMarkdownSlides, renderMarkdownHtml } from "./rich-markdown.js";
function embedLabel(embed) {
    return `${embed.target.path}${embed.target.fragment === null ? '' : `#${embed.target.fragment}`}`;
}
function handleRenderedClick(event, onOpenExternalUrl) {
    const target = event.target instanceof Element ? event.target : null;
    const url = target?.closest('[data-external-url]')?.dataset.externalUrl;
    if (url !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        onOpenExternalUrl?.(url);
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
                return (_jsxs("article", { className: "overflow-auto rounded border border-[var(--tt-border)] p-3", "data-embed-depth": embed.depth, children: [_jsx("strong", { className: "block truncate text-xs", children: label }), image && _jsx("img", { alt: embed.target.display ?? embed.target.path, className: "mt-2 max-h-80 max-w-full object-contain", loading: "lazy", src: `data:${embed.mimeType};base64,${embed.content}` }), audio && _jsx("audio", { "aria-label": embed.target.display ?? embed.target.path, className: "mt-2 w-full", controls: true, preload: "metadata", src: `data:${embed.mimeType};base64,${embed.content}` }), video && _jsx("video", { "aria-label": embed.target.display ?? embed.target.path, className: "mt-2 max-h-80 max-w-full", controls: true, preload: "metadata", src: `data:${embed.mimeType};base64,${embed.content}` }), pdf && _jsx("iframe", { className: "mt-2 h-80 w-full", sandbox: "", src: `data:${embed.mimeType};base64,${embed.content}`, title: embed.target.display ?? embed.target.path }), embed.target.kind === 'note' && _jsx("div", { className: "prose text-sm", dangerouslySetInnerHTML: { __html: renderMarkdownHtml(embed.content, { externalEmbedMode: 'viewer' }) }, onClick: event => { handleRenderedClick(event, props.onOpenExternalUrl); } }), (embed.target.kind === 'canvas' || embed.target.kind === 'base') && _jsx("pre", { className: "mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs", children: embed.content })] }, `${label}:${String(index)}`));
            })] }));
}
export function MarkdownSlidesView(props) {
    const slides = useMemo(() => buildMarkdownSlides(props.source, { externalEmbedMode: 'viewer' }), [props.source]);
    return (_jsxs("section", { "aria-label": "Slides Preview", className: "grid gap-3", children: [slides.map((slide, index) => (_jsxs("article", { className: "rounded border border-[var(--tt-border)] p-3", "data-slide-index": index, children: [_jsxs("div", { className: "mb-2 text-xs text-[var(--tt-muted)]", children: ["Slide ", index + 1] }), _jsx("div", { dangerouslySetInnerHTML: { __html: slide }, onClick: event => { handleRenderedClick(event, props.onOpenExternalUrl); } })] }, index))), _jsx(ResolvedEmbedsView, { embeds: props.embeds, onOpenExternalUrl: props.onOpenExternalUrl })] }));
}
export function RichReadingView(props) {
    const html = useMemo(() => {
        const warning = /<\/?(?:script|style|iframe|object|embed|form|svg|link|meta)\b/iu.test(props.source)
            ? '<p class="tocktutor-warning" role="note">Unsafe HTML is inert in Reading view.</p>'
            : '';
        return `${warning}${renderMarkdownHtml(props.source, { externalEmbedMode: 'viewer' })}`;
    }, [props.source]);
    const onClick = (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.dataset.taskIndex !== undefined) {
            const index = Number(target.dataset.taskIndex);
            if (Number.isSafeInteger(index) && index >= 0)
                props.onToggleTask(index);
            return;
        }
        handleRenderedClick(event, props.onOpenExternalUrl);
    };
    return (_jsxs("section", { "aria-label": "Reading View", className: "min-h-full", tabIndex: -1, children: [_jsx(MarkdownDocumentHeader, { className: "mx-auto w-[calc(100%-48px)] max-w-3xl pt-[18px]", ...(props.onAddProperty === undefined ? {} : { onAddProperty: props.onAddProperty }), ...(props.onSetProperty === undefined ? {} : { onSetProperty: props.onSetProperty }), source: props.source, title: props.title }), _jsxs("article", { className: "tocktutor-reading mx-auto w-[calc(100%-48px)] max-w-3xl pt-[18px] pb-[72px] text-base leading-6 [&_.callout]:my-4 [&_.callout]:rounded-md [&_.footnotes]:mt-8 [&_.math-display]:my-4 [&_.mermaid]:my-4 [&_.task-list]:m-0 [&_.task-list]:list-none [&_.task-list]:pl-1 [&_.task-list_li]:min-h-6 [&_.task-list_li]:leading-6 [&_.task-list_input]:mr-2 [&_.task-list_input]:size-3.5 [&_.task-list_input]:accent-[var(--dsw-specific-markdown-accent)] [&_.task-list_li:has(input:checked)]:text-[var(--tt-muted)] [&_.task-list_li:has(input:checked)]:line-through [&_blockquote]:mx-0 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--dsw-specific-markdown-accent)] [&_blockquote]:pl-3 [&_blockquote_p]:m-0 [&_a]:text-[var(--dsw-specific-markdown-accent)] [&_a.internal-link]:no-underline [&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-[30px] [&_h1]:leading-tight [&_h1]:font-[650] [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-2xl [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-xl [&_ol]:my-2 [&_ol]:pl-[30px] [&_ul:not(.task-list)]:my-2 [&_ul:not(.task-list)]:list-disc [&_ul:not(.task-list)]:pl-[30px] [&_li>ul]:!my-0 [&_li>ul]:!pl-4 [&_li>ol]:!my-0 [&_li>ol]:!pl-4 [&_mark]:bg-[var(--dsw-specific-markdown-highlight)] [&_mark]:text-inherit [&_code]:rounded-sm [&_code]:bg-[var(--dsw-specific-markdown-inline-code)] [&_code]:px-1 [&_code]:py-0.5 [&_pre_code]:rounded-none [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_p]:mt-0 [&_p]:mb-4 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-[var(--tt-border)] [&_pre]:bg-[color-mix(in_srgb,var(--tt-text)_4%,var(--tt-panel))] [&_pre]:p-3 [&_table]:my-4 [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--dsw-alias-border-l2,var(--tt-border))] [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-[var(--dsw-alias-border-l2,var(--tt-border))] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold", onClick: onClick, children: [_jsx("div", { dangerouslySetInnerHTML: { __html: html } }), _jsx(ResolvedEmbedsView, { embeds: props.embeds, onOpenExternalUrl: props.onOpenExternalUrl })] })] }));
}
export function LivePreviewView(props) {
    return (_jsxs("section", { "aria-label": "Live Preview", className: "flex min-h-full flex-col", tabIndex: -1, children: [_jsx(LivePreviewEditor, { ariaLabel: "Live Preview Editor", className: "min-h-[20rem]", content: props.source, onMarkdownChange: props.onEdit, ...(props.onAddProperty === undefined ? {} : { onAddProperty: props.onAddProperty }), ...(props.onOpenExternalUrl === undefined ? {} : { onOpenExternalUrl: props.onOpenExternalUrl }), ...(props.onSetProperty === undefined ? {} : { onSetProperty: props.onSetProperty }), ...(props.embeds === undefined ? {} : { resolvedEmbeds: props.embeds }), ...(props.onSelectionChange === undefined ? {} : { onSelectionChange: props.onSelectionChange }), onToggleTask: props.onToggleTask, title: props.title }, props.documentKey), _jsxs("details", { className: "mx-auto mb-6 mt-4 w-[calc(100%-32px)] max-w-3xl rounded border border-[var(--tt-border)] p-2", children: [_jsx("summary", { className: "cursor-pointer text-xs font-medium", children: "Rendered Preview" }), _jsx("div", { "aria-label": "Live Preview Rendered Content", className: "mt-2", dangerouslySetInnerHTML: { __html: renderMarkdownHtml(props.source, { externalEmbedMode: 'viewer' }) }, onClick: event => { handleRenderedClick(event, props.onOpenExternalUrl); } }), _jsxs("details", { className: "mt-3 rounded border border-[var(--tt-border)] p-2", children: [_jsx("summary", { className: "cursor-pointer text-xs font-medium", children: "Slides Preview" }), _jsx(MarkdownSlidesView, { embeds: props.embeds, onOpenExternalUrl: props.onOpenExternalUrl, source: props.source })] })] })] }));
}
//# sourceMappingURL=editor-surface.js.map