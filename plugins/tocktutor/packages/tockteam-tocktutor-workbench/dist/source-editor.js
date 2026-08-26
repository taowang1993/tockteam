import { jsx as _jsx } from "react/jsx-runtime";
import { lazy, Suspense, } from 'react';
/** Alt-click adds a selection range, matching Tockbot's Source editor. */
export function shouldAddEditorSelectionRange(event) {
    return event.altKey && !event.shiftKey;
}
/** Alt+Shift-drag or middle-drag starts a rectangular selection. */
export function shouldStartEditorRectangularSelection(event) {
    return (event.altKey && event.shiftKey && event.button === 0) || event.button === 1;
}
/** Restore the authored newline sequence after CodeMirror's canonical edit. */
export function preserveEditorLineEndings(authored, edited) {
    const separators = [...authored.matchAll(/\r\n|\r|\n/gu)].map(match => match[0]);
    if (separators.length === 0)
        return edited;
    const preferred = separators.find(separator => separator === '\r\n') ?? separators[0] ?? '\n';
    let index = 0;
    return edited.replace(/\n/gu, () => separators[index++] ?? preferred);
}
export function buildSourceChange(current, next) {
    if (current === next)
        return null;
    let start = 0;
    while (start < current.length && start < next.length && current[start] === next[start])
        start += 1;
    let currentEnd = current.length;
    let nextEnd = next.length;
    while (currentEnd > start && nextEnd > start && current[currentEnd - 1] === next[nextEnd - 1]) {
        currentEnd -= 1;
        nextEnd -= 1;
    }
    return { from: start, insert: next.slice(start, nextEnd), to: currentEnd };
}
const LazySourceEditor = lazy(async () => {
    const module = await import("./source-editor-runtime.js");
    return { default: module.SourceEditorRuntime };
});
export function SourceEditor(props) {
    return (_jsx(Suspense, { fallback: _jsx("div", { "aria-label": props.ariaLabel ?? 'Markdown Source Editor', className: props.className, children: "Loading Source Editor\u2026" }), children: _jsx(LazySourceEditor, { ...props }) }));
}
//# sourceMappingURL=source-editor.js.map