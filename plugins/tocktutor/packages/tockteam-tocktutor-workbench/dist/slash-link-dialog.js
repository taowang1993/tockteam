import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@tockteam/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@tockteam/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@tockteam/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@tockteam/ui/field';
import { Input } from '@tockteam/ui/input';
import { classifyExternalEmbed } from "./external-embeds.js";
import { ToggleGroup, ToggleGroupItem } from '@tockteam/ui/toggle-group';
import { ATTACHMENT_ACCEPT, isSupportedAttachment } from "./attachments.js";
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select';
import { SlashWriteUncertainError } from "./markdown-links.js";
export function SlashLinkDialog({ action }) {
    const id = useId();
    const [url, setUrl] = useState('');
    const [label, setLabel] = useState('');
    const [query, setQuery] = useState('');
    const [path, setPath] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [name, setName] = useState('');
    const [folder, setFolder] = useState(action.context?.sourcePath.split('/').slice(0, -1).join('/') ?? '');
    const [uncertain, setUncertain] = useState(false);
    const [fileMode, setFileMode] = useState('existing');
    const [file, setFile] = useState(null);
    const attachment = action.kind === 'file';
    const upload = attachment && fileMode === 'upload';
    const searchLabel = attachment ? 'Search Attachments' : 'Search Notes';
    const written = useRef(null);
    const destination = `${folder ? `${folder}/` : ''}${name.trim().replace(/\.md$/iu, '')}.md`;
    const abort = useRef(new AbortController());
    const submitting = useRef(false);
    useEffect(() => {
        const controller = new AbortController();
        abort.current = controller;
        return () => controller.abort();
    }, []);
    const notes = action.context?.entries.filter(entry => (attachment ? entry.kind === 'attachment' && isSupportedAttachment(entry.path) : entry.kind === 'document' && /\.(?:md|markdown)$/iu.test(entry.path)) && entry.path.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
    return _jsx(Dialog, { open: true, onOpenChange: open => { if (!open)
            action.cancel(); }, children: _jsxs(DialogContent, { className: "tocktutor-slash-link-dialog z-[2147483647] max-h-[calc(100vh-2rem)] overflow-auto !bg-[var(--tockteam-shell-chrome,var(--dsw-alias-bg-layer-1))]", overlayClassName: "z-[2147483646]", onCloseAutoFocus: event => { event.preventDefault(); action.restoreFocus(); }, onEscapeKeyDown: event => event.stopPropagation(), children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: action.kind === 'link' ? 'Link' : action.kind === 'new-note' ? 'New Note' : attachment ? 'File Attachment' : 'Link to Note' }), _jsx(DialogDescription, { children: "Insert an ordinary Markdown link." })] }), _jsxs("form", { className: "flex min-w-0 flex-col gap-4", onSubmit: event => {
                        event.preventDefault();
                        if (submitting.current || uncertain || !action.isCurrent())
                            return;
                        const insert = (result) => {
                            if (abort.current.signal.aborted || !action.isCurrent() || !action.insert(result.href, label.trim() || result.label)) {
                                action.context?.reportUnlinked?.(result);
                                if (!abort.current.signal.aborted)
                                    setError('The link could not be inserted. Check the note size and try again; any created file is retained.');
                            }
                        };
                        if (action.kind === 'link') {
                            const target = classifyExternalEmbed(url);
                            if (!target) {
                                setError('Enter a valid public HTTP or HTTPS URL.');
                                return;
                            }
                            insert({ href: target.sourceUrl, label: target.sourceUrl });
                        }
                        else {
                            if (written.current) {
                                insert(written.current);
                                return;
                            }
                            if (!action.context || ((action.kind === 'note-link' || attachment && !upload) && !path)) {
                                setError('Choose a file from the list.');
                                return;
                            }
                            if (upload && (!file || !isSupportedAttachment(file.name) || file.size > 25 * 1024 * 1024)) {
                                setError('Choose a supported image, audio, video or PDF file no larger than 25 MiB.');
                                return;
                            }
                            if (action.kind === 'new-note' && (!name.trim() || /[\/\\\u0000-\u001f\u007f]/u.test(name))) {
                                setError('Enter a filename without slashes or control characters.');
                                return;
                            }
                            submitting.current = true;
                            setBusy(true);
                            setError('');
                            void action.context.resolve(action.kind === 'new-note' ? { kind: 'new-note', path: destination } : upload ? { kind: 'upload', file: file } : { kind: attachment ? 'attachment' : 'note', path }, abort.current.signal).then(result => {
                                if (result.writtenPath)
                                    written.current = result;
                                insert(result);
                            }).catch(reason => {
                                if (!abort.current.signal.aborted) {
                                    setUncertain(reason instanceof SlashWriteUncertainError);
                                    setError(reason instanceof Error ? reason.message : 'The note could not be linked.');
                                }
                            }).finally(() => {
                                submitting.current = false;
                                if (!abort.current.signal.aborted)
                                    setBusy(false);
                            });
                        }
                    }, children: [_jsxs(FieldGroup, { children: [attachment && _jsxs(_Fragment, { children: [_jsxs(ToggleGroup, { type: "single", "aria-label": "Attachment Source", value: fileMode, onValueChange: value => { if (value) {
                                                setFileMode(value);
                                                setError('');
                                                setPath('');
                                            } }, disabled: busy || !!written.current || uncertain, variant: "outline", children: [_jsx(ToggleGroupItem, { value: "existing", children: "Existing File" }), _jsx(ToggleGroupItem, { value: "upload", children: "Upload File" })] }), _jsx("p", { className: "m-0 text-xs text-muted-foreground", children: "Images, audio, video and PDF, up to 25 MiB. Inserted as a link, never a player. Undo removes the link, not the stored file." })] }), upload ? _jsxs(Field, { children: [_jsx(FieldLabel, { htmlFor: `${id}-file`, children: "File" }), _jsx(Input, { id: `${id}-file`, type: "file", accept: ATTACHMENT_ACCEPT, disabled: busy || !!written.current || uncertain, onChange: event => { setFile(event.target.files?.[0] ?? null); setError(''); } }), _jsxs("p", { className: "m-0 break-all text-xs text-muted-foreground", children: ["Supported extensions: ", ATTACHMENT_ACCEPT.replaceAll(',', ', ')] })] }) : action.kind === 'link' ? _jsxs(Field, { "data-invalid": !!error, children: [_jsx(FieldLabel, { htmlFor: `${id}-url`, children: "URL" }), _jsx(Input, { id: `${id}-url`, value: url, maxLength: 4096, "aria-invalid": !!error, "aria-describedby": error ? `${id}-error` : undefined, onChange: event => { setUrl(event.target.value); setError(''); } })] })
                                    : action.kind === 'new-note' ? _jsxs(_Fragment, { children: [_jsxs(Field, { children: [_jsx(FieldLabel, { htmlFor: `${id}-name`, children: "Note Name" }), _jsx(Input, { id: `${id}-name`, value: name, maxLength: 252, disabled: busy || !!written.current || uncertain, onChange: event => setName(event.target.value) })] }), _jsxs(Field, { children: [_jsx(FieldLabel, { htmlFor: `${id}-folder`, children: "Folder" }), _jsxs(NativeSelect, { id: `${id}-folder`, value: folder, disabled: busy || !!written.current || uncertain, onChange: event => setFolder(event.target.value), children: [_jsx(NativeSelectOption, { value: "", children: "Vault Root" }), action.context?.entries.filter(entry => entry.kind === 'directory').map(entry => _jsx(NativeSelectOption, { value: entry.path, children: entry.path }, entry.path))] })] }), _jsx("p", { className: "m-0 break-all text-xs text-muted-foreground", children: destination }), _jsx("p", { className: "m-0 text-xs text-muted-foreground", children: "Undo removes the link, not the created note." })] }) : _jsxs(Field, { children: [_jsx(FieldLabel, { id: `${id}-search-label`, children: searchLabel }), _jsxs(Command, { shouldFilter: false, value: path, onValueChange: setPath, children: [_jsx(CommandInput, { "aria-labelledby": `${id}-search-label`, "aria-label": searchLabel, value: query, onValueChange: setQuery, disabled: busy }), _jsxs(CommandList, { "aria-label": attachment ? 'Attachments' : 'Notes', children: [_jsx(CommandEmpty, { children: "No Files Found" }), _jsx(CommandGroup, { children: notes.slice(0, 100).map(entry => _jsx(CommandItem, { value: entry.path, disabled: busy, onSelect: setPath, children: _jsx("span", { className: "min-w-0 truncate", children: entry.path }) }, entry.path)) })] })] }), notes.length > 100 && _jsx("p", { className: "m-0 text-xs text-muted-foreground", children: "Showing the first 100 files. Refine your search." })] }), _jsxs(Field, { children: [_jsx(FieldLabel, { htmlFor: `${id}-label`, children: "Display Text" }), _jsx(Input, { id: `${id}-label`, value: label, maxLength: 1000, disabled: busy, onChange: event => setLabel(event.target.value) })] })] }), busy && _jsx("p", { role: "status", className: "m-0 text-sm text-muted-foreground", children: action.kind === 'new-note' ? 'Creating the note…' : upload ? 'Storing the file…' : 'Checking the file…' }), error && _jsx("p", { id: `${id}-error`, role: "alert", className: "m-0 text-sm text-destructive", children: error }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", onClick: action.cancel, children: "Cancel" }), _jsx(Button, { type: "submit", disabled: busy || uncertain, children: written.current ? 'Insert Link' : action.kind === 'new-note' ? 'Create and Link' : upload ? 'Upload and Link' : 'Insert Link' })] })] })] }) });
}
//# sourceMappingURL=slash-link-dialog.js.map