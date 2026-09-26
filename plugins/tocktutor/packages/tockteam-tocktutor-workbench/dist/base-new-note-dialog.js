import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useId, useState } from 'react';
import { Button } from '@tockteam/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@tockteam/ui/dialog';
import { Field, FieldLabel } from '@tockteam/ui/field';
import { Input } from '@tockteam/ui/input';
import { NativeSelect, NativeSelectOption } from '@tockteam/ui/native-select';
import { newBaseNotePath } from "./base-note.js";
export function BaseNewNoteDialog(props) {
    const id = useId();
    const [name, setName] = useState('');
    const [location, setLocation] = useState(props.defaultLocation);
    const [folder, setFolder] = useState(props.folders.includes(props.defaultFolder) ? props.defaultFolder : props.folders[0] ?? '');
    const [busy, setBusy] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const [error, setError] = useState('');
    const path = newBaseNotePath(props.basePath, name, location, folder, props.folders);
    const submit = (event) => {
        event.preventDefault();
        if (busy || uncertain || !path) {
            setError('Enter a note name and choose an available folder.');
            return;
        }
        setBusy(true);
        setError('');
        void props.onCreate({ basePath: props.basePath, name, location, folder }).then(created => {
            if (created)
                props.onClose();
            else {
                setUncertain(true);
                setError('Check Files before trying again; the note may have been created.');
            }
        }).catch(() => { setUncertain(true); setError('Could not confirm whether the note was created. Refresh Files before retrying.'); }).finally(() => setBusy(false));
    };
    return _jsx(Dialog, { open: true, onOpenChange: open => { if (!open && !busy)
            props.onClose(); }, children: _jsxs(DialogContent, { className: "z-[2147483647] max-h-[calc(100vh-2rem)] overflow-auto !bg-[var(--tockteam-shell-chrome,var(--dsw-alias-bg-layer-1))]", overlayClassName: "z-[2147483646]", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "New Note" }), _jsx(DialogDescription, { children: "Create a Markdown note in the current Base view." })] }), _jsxs("form", { className: "flex flex-col gap-4", onSubmit: submit, children: [_jsxs(Field, { children: [_jsx(FieldLabel, { htmlFor: `${id}-name`, children: "Note Name" }), _jsx(Input, { id: `${id}-name`, autoFocus: true, maxLength: 240, value: name, disabled: busy, onChange: event => { setName(event.currentTarget.value); setError(''); } })] }), _jsxs(Field, { children: [_jsx(FieldLabel, { htmlFor: `${id}-location`, children: "Note Location" }), _jsxs(NativeSelect, { id: `${id}-location`, value: location, disabled: busy, onChange: event => { setLocation(event.currentTarget.value); setError(''); }, children: [_jsx(NativeSelectOption, { value: "vault", children: "Vault Folder" }), _jsx(NativeSelectOption, { value: "current", children: "Same Folder as Base" }), _jsx(NativeSelectOption, { value: "folder", children: "Chosen Folder" })] })] }), location === 'folder' && _jsxs(Field, { children: [_jsx(FieldLabel, { htmlFor: `${id}-folder`, children: "Destination Folder" }), _jsx(NativeSelect, { id: `${id}-folder`, value: folder, disabled: busy || props.folders.length === 0, onChange: event => setFolder(event.currentTarget.value), children: props.folders.map(candidate => _jsx(NativeSelectOption, { value: candidate, children: candidate }, candidate)) })] }), path && _jsx("p", { className: "m-0 break-all text-sm text-muted-foreground", children: path }), error && _jsx("p", { role: "alert", className: "m-0 text-sm text-destructive", children: error }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", disabled: busy, onClick: props.onClose, children: "Cancel" }), _jsx(Button, { type: "submit", disabled: busy || uncertain || path === null, children: "Create Note" })] })] })] }) });
}
//# sourceMappingURL=base-new-note-dialog.js.map