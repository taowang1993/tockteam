import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense, useEffect, useId, useRef, useState, } from 'react';
import { Input } from '@tockteam/ui/input';
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
function titleError(value) {
    const normalized = value.trim();
    if (normalized === '')
        return 'Enter a note title.';
    if (normalized === '.' || normalized === '..')
        return 'Choose a different note title.';
    if (/[\\/]/u.test(normalized))
        return 'Note titles cannot contain a path separator.';
    if (/[\u0000-\u001f\u007f]/u.test(normalized))
        return 'Note titles cannot contain control characters.';
    if (normalized.length > 200)
        return 'Note titles must be 200 characters or fewer.';
    return null;
}
function SourceTitleEditor(props) {
    const errorId = useId();
    const [error, setError] = useState(null);
    const [pending, setPending] = useState(false);
    const [value, setValue] = useState(props.title);
    const pendingRef = useRef(false);
    const skipBlurRef = useRef(false);
    const inputRef = useRef(null);
    useEffect(() => {
        if (!pendingRef.current) {
            setValue(props.title);
            setError(null);
        }
    }, [props.title]);
    const restore = () => {
        setValue(props.title);
        setError(null);
    };
    const commit = (next) => {
        if (pendingRef.current)
            return;
        const normalized = next.trim();
        const validationError = titleError(normalized);
        if (validationError !== null) {
            setError(validationError);
            return;
        }
        if (normalized === props.title) {
            restore();
            return;
        }
        if (props.onRenameTitle === undefined) {
            setError('Note renaming is unavailable.');
            return;
        }
        pendingRef.current = true;
        setPending(true);
        setError(null);
        void Promise.resolve()
            .then(() => props.onRenameTitle?.(normalized))
            .then(success => {
            if (success === true) {
                setValue(normalized);
                setError(null);
            }
            else {
                restore();
                setError('The note could not be renamed.');
            }
        }, () => {
            restore();
            setError('The note could not be renamed.');
        })
            .finally(() => {
            pendingRef.current = false;
            setPending(false);
        });
    };
    return (_jsxs("div", { className: "mx-auto w-[calc(100%-48px)] max-w-3xl pt-[18px]", children: [_jsx(Input, { "aria-describedby": error === null ? undefined : errorId, "aria-invalid": error === null ? undefined : true, "aria-label": "Note title", autoComplete: "off", className: "h-auto w-full border-0 bg-transparent p-0 text-[30px] leading-tight font-[650] tracking-[-.01em] text-[var(--tt-text)] outline-none focus-visible:ring-0", disabled: pending, readOnly: props.onRenameTitle === undefined, onBlur: event => {
                    if (skipBlurRef.current) {
                        skipBlurRef.current = false;
                        return;
                    }
                    commit(event.currentTarget.value);
                }, onChange: event => { setValue(event.currentTarget.value); setError(null); }, onKeyDown: event => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        skipBlurRef.current = true;
                        restore();
                        inputRef.current?.blur();
                    }
                    else if (event.key === 'Enter') {
                        event.preventDefault();
                        commit(event.currentTarget.value);
                    }
                }, ref: inputRef, spellCheck: false, type: "text", value: value }), error !== null && _jsx("p", { className: "mt-1 text-xs text-[var(--dsw-alias-state-error-primary)]", id: errorId, role: "alert", children: error })] }));
}
export function SourceEditor(props) {
    const { className, onRenameTitle, title, ...runtimeProps } = props;
    return (_jsxs("div", { className: `tocktutor-source-surface flex h-full min-h-0 min-w-0 flex-1 flex-col ${className ?? ''}`, children: [title !== undefined && (onRenameTitle === undefined
                ? _jsx(SourceTitleEditor, { title: title })
                : _jsx(SourceTitleEditor, { onRenameTitle: onRenameTitle, title: title })), _jsx(Suspense, { fallback: _jsx("div", { "aria-label": props.ariaLabel ?? 'Markdown Source Editor', className: "min-h-0 min-w-0 flex-1", children: "Loading Source Editor\u2026" }), children: _jsx(LazySourceEditor, { ...runtimeProps, className: "min-h-0 min-w-0 flex-1" }) })] }));
}
//# sourceMappingURL=source-editor.js.map