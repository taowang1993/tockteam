import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Alert } from '@tockteam/ui/alert';
import { Button } from '@tockteam/ui/button';
import { Checkbox } from '@tockteam/ui/checkbox';
import { Textarea } from '@tockteam/ui/textarea';
import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState, } from 'react';
import { projectLivePreview, replaceLivePreviewLine } from "./live-preview.js";
import { renderMarkdownHtml } from "./rich-markdown.js";
export function RichReadingView(props) {
    const html = useMemo(() => {
        const warning = /<\/?(?:script|style|iframe|object|embed|form|svg|link|meta)\b/iu.test(props.source)
            ? '<p class="tocktutor-warning" role="note">Unsafe HTML is inert in Reading view.</p>'
            : '';
        return `${warning}${renderMarkdownHtml(props.source)}`;
    }, [props.source]);
    const onClick = (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.dataset.taskIndex !== undefined) {
            const index = Number(target.dataset.taskIndex);
            if (Number.isSafeInteger(index) && index >= 0)
                props.onToggleTask(index);
            return;
        }
        if (target instanceof HTMLAnchorElement)
            event.preventDefault();
    };
    return (_jsx("article", { "aria-label": "Reading View", className: "tocktutor-reading mx-auto min-h-full w-[calc(100%-48px)] max-w-3xl pt-[18px] pb-[72px] [&_.callout]:my-4 [&_.callout]:rounded-md [&_.footnotes]:mt-8 [&_.math-display]:my-4 [&_.mermaid]:my-4 [&_.task-list]:pl-5 [&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-[30px] [&_h1]:leading-tight [&_h1]:font-[650] [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-2xl [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-xl [&_mark]:bg-[color-mix(in_srgb,#fde047_55%,transparent)] [&_p]:mt-0 [&_p]:mb-4 [&_p]:text-lg [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-[var(--tt-border)] [&_pre]:bg-[color-mix(in_srgb,var(--tt-text)_4%,var(--tt-panel))] [&_pre]:p-3 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--tt-border)] [&_td]:p-2 [&_th]:border [&_th]:border-[var(--tt-border)] [&_th]:p-2", dangerouslySetInnerHTML: { __html: html }, onClick: onClick, tabIndex: -1 }));
}
export function LivePreviewView(props) {
    const projection = useMemo(() => projectLivePreview(props.source), [props.source]);
    const [folded, setFolded] = useState(() => new Set());
    useEffect(() => {
        if (projection.status !== 'ready') {
            setFolded(new Set());
            return;
        }
        setFolded(new Set(projection.lines.filter(line => line.folded === true).map(line => line.index)));
    }, [props.documentKey]);
    if (projection.status !== 'ready')
        return _jsx(Alert, { unstyled: true, children: projection.reason });
    const hidden = new Set();
    for (const line of projection.lines) {
        if (!folded.has(line.index) || line.foldEndLine === undefined)
            continue;
        for (let index = line.index + 1; index <= line.foldEndLine; index += 1)
            hidden.add(index);
    }
    const toggleFold = (index) => {
        setFolded(current => {
            const next = new Set(current);
            if (next.has(index))
                next.delete(index);
            else
                next.add(index);
            return next;
        });
    };
    return (_jsxs("section", { "aria-label": "Live Preview", className: "mx-auto grid min-h-full w-[calc(100%-32px)] max-w-3xl content-start gap-0.5 py-6", tabIndex: -1, children: [projection.lines.map(line => hidden.has(line.index) ? null : (_jsxs("div", { className: "group flex min-h-7 items-start gap-2 rounded px-1.5 py-0.5 data-[kind=callout]:border-l-4 data-[kind=callout]:border-[var(--tt-accent)] data-[kind=callout]:bg-[var(--tt-selected)] data-[kind=code]:bg-[color-mix(in_srgb,var(--tt-text)_5%,var(--tt-panel))] data-[kind=comment]:text-[var(--tt-muted)] data-[kind=heading]:font-semibold data-[kind=property]:text-[var(--tt-muted)]", "data-kind": line.kind, children: [line.foldEndLine !== undefined ? (_jsx(Button, { unstyled: true, "aria-expanded": !folded.has(line.index), "aria-label": `${folded.has(line.index) ? 'Expand' : 'Collapse'} Line ${String(line.index + 1)}`, className: "mt-1 size-5 shrink-0 rounded border-0 bg-transparent p-0 text-[var(--tt-muted)]", onClick: () => { toggleFold(line.index); }, type: "button", children: _jsx(ChevronRight, { "aria-hidden": "true", className: folded.has(line.index) ? '' : 'rotate-90' }) })) : _jsx("span", { className: "w-5 shrink-0" }), line.kind === 'task' && line.taskIndex !== undefined && (_jsx(Checkbox, { "aria-label": `Mark Task on Line ${String(line.index + 1)} as ${line.checked === true ? 'Incomplete' : 'Complete'}`, checked: line.checked === true, className: "mt-1.5", onCheckedChange: () => { props.onToggleTask(line.taskIndex); } })), _jsx(Textarea, { unstyled: true, "aria-label": `Live Preview Line ${String(line.index + 1)}`, className: "min-h-7 flex-1 resize-none overflow-hidden border-0 bg-transparent px-1 py-0.5 text-inherit outline-none [font:inherit]", onChange: event => { props.onEdit(replaceLivePreviewLine(props.source, line.index, event.target.value)); }, rows: 1, spellCheck: line.kind !== 'code', value: line.content })] }, line.index))), _jsxs("details", { className: "mt-4 rounded border border-[var(--tt-border)] p-2", children: [_jsx("summary", { className: "cursor-pointer text-xs font-medium", children: "Rendered Preview" }), _jsx("div", { "aria-label": "Live Preview Rendered Content", className: "mt-2", dangerouslySetInnerHTML: { __html: renderMarkdownHtml(props.source) } })] })] }));
}
//# sourceMappingURL=editor-surface.js.map