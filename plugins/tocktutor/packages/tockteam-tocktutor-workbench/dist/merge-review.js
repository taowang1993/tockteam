import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@tockteam/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@tockteam/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@tockteam/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@tockteam/ui/field';
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select';
import { mergePropertyConflicts } from "./composer.js";
import { isSafeVaultRelativePath } from "./session.js";
/** Review stays non-mutating; only explicit confirmation invokes the optional Host-owned apply. */
export function NoteMergeReview(props) {
    return _jsx(MergeReviewContent, { ...props }, props.sourcePath);
}
function MergeReviewContent(props) {
    const id = useId();
    const returnFocus = useRef(typeof document === 'undefined' ? null : document.activeElement);
    const [query, setQuery] = useState('');
    const [prepared, setPrepared] = useState(null);
    const [conflicts, setConflicts] = useState([]);
    const [choices, setChoices] = useState({});
    const [placement, setPlacement] = useState('append');
    const [disposition, setDisposition] = useState('trash');
    const [preview, setPreview] = useState(null);
    const [error, setError] = useState(null);
    const [pending, setPending] = useState(false);
    const preparation = useRef(null);
    const request = useRef(null);
    const applying = useRef(false);
    const [applied, setApplied] = useState(false);
    useEffect(() => () => { preparation.current?.abort(); request.current?.abort(); }, []);
    useEffect(() => {
        if (!prepared)
            return;
        const invalidate = () => {
            if (applying.current)
                return;
            request.current?.abort();
            setPreview(null);
            setPrepared(null);
            setPending(false);
            setError('The notes or their view changed. Select a destination again.');
        };
        if (prepared.signal.aborted)
            invalidate();
        else
            prepared.signal.addEventListener('abort', invalidate, { once: true });
        return () => { prepared.signal.removeEventListener('abort', invalidate); };
    }, [prepared]);
    const invalidatePreview = () => {
        request.current?.abort();
        setPreview(null);
        setError(null);
        setPending(false);
    };
    const close = () => { preparation.current?.abort(); request.current?.abort(); props.onClose(); };
    const select = async (path, prepend = false) => {
        preparation.current?.abort();
        const abort = new AbortController();
        preparation.current = abort;
        invalidatePreview();
        setPrepared(null);
        setChoices({});
        setPlacement(prepend ? 'prepend' : 'append');
        setPending(true);
        try {
            const result = await props.onPrepare(path, abort.signal);
            abort.signal.throwIfAborted();
            result.signal.throwIfAborted();
            if (result.source.path !== props.sourcePath || result.destination.path !== path)
                throw new Error('The selected notes changed. Select a destination again.');
            const nextConflicts = mergePropertyConflicts(result.source.content, result.destination.content);
            setConflicts(nextConflicts);
            setPrepared(result);
        }
        catch (cause) {
            if (!abort.signal.aborted)
                setError(cause instanceof Error ? cause.message : 'The notes could not be read.');
        }
        finally {
            if (!abort.signal.aborted)
                setPending(false);
        }
    };
    const review = async () => {
        if (!prepared || prepared.signal.aborted || pending || conflicts.some(({ key }) => !Object.hasOwn(choices, key)))
            return;
        invalidatePreview();
        const abort = new AbortController();
        request.current = abort;
        const signal = AbortSignal.any([abort.signal, prepared.signal]);
        setPending(true);
        try {
            const result = await prepared.preview({ placement, sourceDisposition: disposition, propertyChoices: choices }, signal);
            signal.throwIfAborted();
            setPreview(result);
        }
        catch (cause) {
            if (!signal.aborted)
                setError(cause instanceof Error ? cause.message : 'The merge could not be previewed.');
        }
        finally {
            if (!signal.aborted)
                setPending(false);
        }
    };
    const confirm = async () => {
        if (!preview || !prepared?.apply || pending || applied || applying.current || (preview.plan.requiresKeepSource && disposition !== 'keep'))
            return;
        const abort = new AbortController();
        request.current = abort;
        applying.current = true;
        setPending(true);
        setError(null);
        try {
            const result = await prepared.apply(preview, abort.signal);
            setApplied(true);
            if (result.status === 'applied')
                close();
            else
                setError('Merge interrupted. Close this dialog and open Merge Recovery to restore originals as new notes. Current edits will not be overwritten.');
        }
        catch (cause) {
            if (!abort.signal.aborted)
                setError(cause instanceof Error ? cause.message : 'Merge did not finish. Check Merge Recovery before retrying.');
        }
        finally {
            applying.current = false;
            if (!abort.signal.aborted)
                setPending(false);
        }
    };
    const canonical = (path) => path.normalize('NFC').toLowerCase();
    const candidates = [...new Set(props.paths)].filter(path => isSafeVaultRelativePath(path) && /\.(?:md|markdown)$/iu.test(path)
        && canonical(path) !== canonical(props.sourcePath) && canonical(path).includes(canonical(query))).sort();
    return _jsx(Dialog, { open: true, onOpenChange: open => { if (!open)
            close(); }, children: _jsxs(DialogContent, { unstyled: true, className: "fixed top-1/2 left-1/2 z-[2147483647] box-border flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-border bg-surface p-5 text-sm text-foreground shadow-xl", overlayClassName: "z-[2147483646]", showCloseButton: false, onCloseAutoFocus: event => {
                if (returnFocus.current instanceof HTMLElement && returnFocus.current.isConnected) {
                    event.preventDefault();
                    returnFocus.current.focus();
                }
            }, children: [_jsx(DialogTitle, { children: "Merge Entire File With" }), _jsxs(DialogDescription, { className: "whitespace-pre-wrap break-words", children: [prepared ? `Review merging ${props.sourcePath} into ${prepared.destination.path}.` : `Choose where to merge ${props.sourcePath}.`, " No merge changes are written during review; any unsaved changes are saved first."] }), _jsx("div", { className: "min-h-0 flex-1 overflow-y-auto", children: !prepared ? _jsxs(Command, { shouldFilter: false, onKeyDownCapture: event => {
                            if (event.key === 'Enter' && event.shiftKey) {
                                const path = event.currentTarget.querySelector('[cmdk-item][data-selected="true"]')?.getAttribute('data-merge-path');
                                if (path && candidates.includes(path)) {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void select(path, true);
                                }
                            }
                        }, children: [_jsx(CommandInput, { autoFocus: true, "aria-label": "Merge Destination", placeholder: "Search note paths\u2026", value: query, onValueChange: setQuery, disabled: pending }), _jsxs(CommandList, { "aria-label": "Merge Destinations", children: [_jsx(CommandEmpty, { children: "No Matching Notes" }), _jsx(CommandGroup, { children: candidates.slice(0, 200).map(path => _jsx(CommandItem, { className: "whitespace-pre-wrap break-all", disabled: pending, value: JSON.stringify(path), "data-merge-path": path, onSelect: () => { void select(path); }, children: path }, path)) })] }), candidates.length > 200 && _jsx("p", { className: "text-muted-foreground", children: "Showing the first 200 matches. Narrow your search to find another note." })] }) : _jsxs(FieldGroup, { children: [_jsxs("p", { className: "whitespace-pre-wrap break-all", children: ["Destination: ", prepared.destination.path] }), _jsxs(Field, { children: [_jsx(FieldLabel, { htmlFor: `${id}-placement`, children: "Placement" }), _jsxs(NativeSelect, { disabled: pending || applied, autoFocus: true, id: `${id}-placement`, value: placement, onChange: event => { invalidatePreview(); setPlacement(event.target.value); }, children: [_jsx(NativeSelectOption, { value: "append", children: "Append to Destination" }), _jsx(NativeSelectOption, { value: "prepend", children: "Prepend to Destination" })] })] }), _jsxs(Field, { children: [_jsx(FieldLabel, { htmlFor: `${id}-source`, children: "Original Note" }), _jsxs(NativeSelect, { disabled: pending || applied, id: `${id}-source`, value: disposition, onChange: event => { invalidatePreview(); setDisposition(event.target.value); }, children: [_jsx(NativeSelectOption, { value: "trash", children: "Move to Trash After Confirmation" }), _jsx(NativeSelectOption, { value: "keep", children: "Keep Original" }), _jsx(NativeSelectOption, { value: "link", children: "Replace With a Link" }), _jsx(NativeSelectOption, { value: "embed", children: "Replace With an Embed" })] })] }), conflicts.map((conflict, index) => _jsxs(Field, { children: [_jsxs(FieldLabel, { htmlFor: `${id}-property-${index}`, children: ["Value for ", conflict.key] }), _jsxs("div", { className: "grid gap-2 sm:grid-cols-2", children: [_jsxs("div", { children: [_jsx("p", { children: "Source" }), _jsx("pre", { className: "whitespace-pre-wrap break-words", children: conflict.source })] }), _jsxs("div", { children: [_jsx("p", { children: "Destination" }), _jsx("pre", { className: "whitespace-pre-wrap break-words", children: conflict.destination })] })] }), _jsxs(NativeSelect, { disabled: applying.current || applied, id: `${id}-property-${index}`, value: Object.hasOwn(choices, conflict.key) ? choices[conflict.key] : '', onChange: event => {
                                            invalidatePreview();
                                            const value = event.target.value;
                                            setChoices(current => {
                                                if (value === 'source' || value === 'destination')
                                                    return { ...current, [conflict.key]: value };
                                                const next = { ...current };
                                                delete next[conflict.key];
                                                return next;
                                            });
                                        }, children: [_jsx(NativeSelectOption, { value: "", children: "Choose a Value" }), _jsx(NativeSelectOption, { value: "source", children: "Keep Source Value" }), _jsx(NativeSelectOption, { value: "destination", children: "Keep Destination Value" })] })] }, conflict.key)), preview && _jsxs("section", { "aria-label": "Merge Preview", className: "flex flex-col gap-3", children: [_jsx("h3", { children: "Merge Preview" }), _jsx("p", { className: "whitespace-pre-wrap break-words", children: preview.sourceDisposition === 'keep' ? `${props.sourcePath} will be kept unchanged.` : preview.sourceDisposition === 'trash' ? `${props.sourcePath} will move to recoverable trash only after confirmation.` : `${props.sourcePath} will be replaced with the ${preview.sourceDisposition} shown below, only after confirmation.` }), preview.plan.requiresKeepSource && preview.sourceDisposition !== 'keep' && _jsx("p", { role: "note", children: "Some links cannot be repaired safely. Choose Keep Original and preview again before confirming a merge." }), preview.plan.warnings.length > 0 && _jsxs("details", { children: [_jsxs("summary", { children: ["Link Warnings (", preview.plan.warnings.length, ")"] }), _jsx("ul", { children: preview.plan.warnings.map(warning => _jsx("li", { className: "break-words", children: warning }, warning)) })] }), _jsxs("details", { open: true, children: [_jsx("summary", { children: "Destination Content" }), _jsx("pre", { "aria-label": "Destination Content", className: "max-h-72 overflow-auto whitespace-pre-wrap break-words", children: preview.destinationContent })] }), preview.sourceContent !== null && _jsxs("details", { open: true, children: [_jsx("summary", { children: "Original Note Content" }), _jsx("pre", { "aria-label": "Original Note Content", className: "whitespace-pre-wrap break-words", children: preview.sourceContent })] }), _jsxs("details", { children: [_jsxs("summary", { children: ["Other Notes to Update (", preview.plan.updates.length, ")"] }), preview.plan.updates.map(update => _jsxs("details", { children: [_jsx("summary", { className: "break-all", children: update.path }), _jsx("pre", { className: "max-h-72 overflow-auto whitespace-pre-wrap break-words", children: update.newContent })] }, update.path))] }), _jsx("p", { className: "text-muted-foreground", children: applied ? 'Check Merge Recovery for the retained originals.' : 'No merge has been applied. Confirm Merge writes these changes; originals remain recoverable as new notes.' })] })] }) }), pending && _jsx("p", { role: "status", children: applying.current ? 'Applying the reviewed merge…' : prepared ? 'Checking links and preparing the preview…' : 'Saving drafts and reading the selected notes…' }), error && _jsx("p", { role: "alert", className: "text-destructive", children: error }), _jsxs(DialogFooter, { className: "shrink-0", children: [_jsx(Button, { variant: "outline", onClick: close, children: "Cancel" }), prepared && _jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", disabled: pending || applied, onClick: () => { preparation.current?.abort(); invalidatePreview(); setPrepared(null); }, children: "Change Destination" }), _jsx(Button, { variant: "secondary", disabled: pending || applied || conflicts.some(({ key }) => !Object.hasOwn(choices, key)), onClick: () => { void review(); }, children: "Preview Merge" })] }), preview && prepared?.apply && _jsx(Button, { disabled: pending || applied || (preview.plan.requiresKeepSource && disposition !== 'keep'), onClick: () => { void confirm(); }, children: "Confirm Merge" })] })] }) });
}
export function MergeRecoveryDialog(props) {
    const [merges, setMerges] = useState([]);
    const [cursor, setCursor] = useState();
    const [paged, setPaged] = useState(false);
    const [error, setError] = useState(null);
    const [pending, setPending] = useState(true);
    const [message, setMessage] = useState(null);
    const request = useRef(null);
    const returnFocus = useRef(document.activeElement);
    useEffect(() => {
        const abort = new AbortController();
        request.current = abort;
        void props.onList(abort.signal).then(result => { if (!abort.signal.aborted) {
            setMerges(result.merges);
            setCursor(result.cursor);
        } })
            .catch(cause => { if (!abort.signal.aborted)
            setError(cause instanceof Error ? cause.message : 'Merge Recovery could not be read.'); })
            .finally(() => { if (!abort.signal.aborted)
            setPending(false); });
        return () => { abort.abort(); };
    }, []);
    const loadPage = async (after) => {
        const abort = request.current;
        if (pending || abort === null || abort.signal.aborted)
            return;
        setPending(true);
        setError(null);
        setMessage(null);
        try {
            const result = await props.onList(abort.signal, after);
            if (abort.signal.aborted)
                return;
            setMerges(result.merges);
            setCursor(result.cursor);
            setPaged(after !== undefined);
        }
        catch (cause) {
            if (!abort.signal.aborted)
                setError(cause instanceof Error ? cause.message : 'Merge Recovery could not be read.');
        }
        finally {
            if (!abort.signal.aborted)
                setPending(false);
        }
    };
    const recover = async (id) => {
        const abort = request.current;
        if (pending || abort === null || abort.signal.aborted)
            return;
        setPending(true);
        setError(null);
        setMessage(null);
        try {
            const result = await props.onRecover(id, abort.signal);
            if (abort.signal.aborted)
                return;
            setMerges(current => current.map(item => item.id === id ? result : item));
            setMessage(`Originals recovered in ${result.recoveryPath}. Current notes were not overwritten.`);
        }
        catch (cause) {
            if (!abort.signal.aborted)
                setError(cause instanceof Error ? cause.message : 'Recovery did not finish. Existing copies were preserved.');
        }
        finally {
            if (!abort.signal.aborted)
                setPending(false);
        }
    };
    return _jsx(Dialog, { open: true, onOpenChange: open => { if (!open)
            props.onClose(); }, children: _jsxs(DialogContent, { className: "z-[2147483647] max-h-[85dvh] overflow-y-auto", overlayClassName: "z-[2147483646]", onCloseAutoFocus: event => {
                if (returnFocus.current instanceof HTMLElement && returnFocus.current.isConnected) {
                    event.preventDefault();
                    returnFocus.current.focus();
                }
            }, children: [_jsx(DialogTitle, { children: "Merge Recovery" }), _jsx(DialogDescription, { children: "Restore the original notes as new copies. This does not undo published merge changes or overwrite newer edits. Use the copies to reconcile an interrupted merge." }), !pending && merges.length === 0 && _jsx("p", { children: "No Merge Originals to Recover" }), _jsx("ul", { className: "flex flex-col gap-4", children: merges.map(merge => _jsxs("li", { className: "flex flex-col gap-2 border-b border-border pb-3", children: [_jsxs("p", { className: "whitespace-pre-wrap break-all", children: [merge.sourcePath, " \u2192 ", merge.destinationPath] }), _jsx("p", { children: merge.status === 'applied' ? 'Applied' : merge.status === 'recovered' ? 'Originals Recovered' : 'Needs Recovery' }), _jsx(Button, { variant: "outline", disabled: pending, onClick: () => { void recover(merge.id); }, children: "Restore Originals as New Notes" })] }, merge.id)) }), pending && _jsx("p", { role: "status", children: "Checking merge recovery\u2026" }), message && _jsx("p", { role: "status", className: "whitespace-pre-wrap break-all", children: message }), error && _jsx("p", { role: "alert", children: error }), _jsxs(DialogFooter, { children: [paged && _jsx(Button, { variant: "outline", disabled: pending, onClick: () => { void loadPage(); }, children: "First Page" }), cursor && _jsx(Button, { variant: "outline", disabled: pending, onClick: () => { void loadPage(cursor); }, children: "Next Page" }), _jsx(Button, { variant: "outline", onClick: props.onClose, children: "Close" })] })] }) });
}
//# sourceMappingURL=merge-review.js.map