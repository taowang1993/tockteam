import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '@tockteam/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, } from '@tockteam/ui/dialog';
import { Input } from '@tockteam/ui/input';
import { Label } from '@tockteam/ui/label';
import { Folder, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { WorkbenchGlyph } from "./workbench-glyph.js";
export function WorkbenchVaultDialog(props) {
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [open, setOpen] = useState(false);
    const recentVaults = props.recentVaults.filter(vault => vault.id !== props.vault?.id);
    const changeOpen = (open) => {
        if (!open) {
            setCreating(false);
            setName('');
        }
        setOpen(open);
    };
    const submit = (event) => {
        event.preventDefault();
        const normalized = name.trim();
        if (normalized === '')
            return;
        props.onCreateManagedVault?.(normalized);
        changeOpen(false);
    };
    return (_jsxs(Dialog, { onOpenChange: changeOpen, open: open, children: [_jsx(DialogTrigger, { asChild: true, children: _jsxs(Button, { unstyled: true, "aria-expanded": open, className: "tocktutor-vault-switcher grid grid-cols-[14px_minmax(0,1fr)_16px] items-center gap-1.5 border-0 border-t border-[var(--tt-border)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))] px-2.5 text-left [&>span]:truncate [&_svg]:size-[13px]", type: "button", children: [_jsx(WorkbenchGlyph, { kind: "collapse" }), _jsx("span", { children: props.vault === null ? 'Choose Vault' : 'TockTutor Vault' }), _jsx(WorkbenchGlyph, { kind: "more" })] }) }), _jsx(DialogContent, { className: "z-[2147483647] gap-0 overflow-hidden p-0", overlayClassName: "z-[2147483646]", style: { maxWidth: '720px', width: 'calc(100% - 2rem)' }, children: _jsxs("div", { className: "grid min-h-[420px] sm:grid-cols-[230px_minmax(0,1fr)]", children: [_jsxs("section", { "aria-label": "Vault List", className: "flex min-h-0 flex-col border-b border-border bg-muted/35 p-4 sm:border-r sm:border-b-0", children: [_jsxs(DialogHeader, { className: "text-left", children: [_jsx(DialogTitle, { children: "Vaults" }), _jsx(DialogDescription, { className: "sr-only", children: "Switch between local Markdown vaults or create a new one." })] }), _jsxs("div", { className: "mt-6 flex min-h-0 flex-col gap-5", children: [_jsxs("section", { "aria-labelledby": "current-vault-heading", className: "flex flex-col gap-2", children: [_jsx("h2", { className: "text-xs font-medium text-muted-foreground", id: "current-vault-heading", children: "Current Vault" }), _jsxs("div", { className: "flex min-w-0 items-center gap-2 rounded-md bg-accent px-2 py-2 text-accent-foreground", children: [_jsx(Folder, { "aria-hidden": "true", className: "size-4 shrink-0" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate font-medium", children: props.vault === null ? 'No Vault Open' : 'TockTutor Vault' }), _jsx("p", { className: "m-0 text-xs text-muted-foreground", children: props.vault === null ? 'Choose or create a vault' : 'Active' })] })] })] }), _jsxs("section", { "aria-labelledby": "recent-vaults-heading", className: "flex min-h-0 flex-col gap-2", children: [_jsx("h2", { className: "text-xs font-medium text-muted-foreground", id: "recent-vaults-heading", children: "Recent Vaults" }), recentVaults.length === 0
                                                    ? _jsx("p", { className: "m-0 text-sm text-muted-foreground", children: "No other vaults yet." })
                                                    : (_jsx("div", { className: "flex min-h-0 flex-col gap-1 overflow-auto", children: recentVaults.map((vault, index) => (_jsxs("div", { className: "flex min-w-0 items-center gap-1", children: [_jsxs(Button, { "aria-label": `Open Recent Vault ${String(index + 1)}`, className: "h-auto min-w-0 flex-1 justify-start gap-2 px-2 py-2 text-left", onClick: () => { props.onActivateRecentVault?.(vault.id); changeOpen(false); }, variant: "ghost", children: [_jsx(Folder, { "aria-hidden": "true" }), _jsxs("span", { className: "truncate", children: ["Recent Vault ", String(index + 1)] })] }), _jsx(Button, { "aria-label": `Forget Recent Vault ${String(index + 1)}`, onClick: () => { props.onRemoveRecentVault?.(vault.id); }, size: "icon-sm", variant: "ghost", children: _jsx(X, { "aria-hidden": "true" }) })] }, vault.id))) }))] })] })] }), _jsxs("section", { "aria-label": "Vault Actions", className: "flex flex-col justify-center p-6 sm:p-10", children: [_jsxs("div", { className: "mb-8 flex flex-col items-center text-center", children: [_jsx("span", { className: "mb-3 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary", children: _jsx(Folder, { "aria-hidden": "true", className: "size-7" }) }), _jsx("h2", { className: "m-0 text-2xl font-semibold", children: "TockTutor" }), _jsx("p", { className: "mt-1 text-sm text-muted-foreground", children: "Your local Markdown notes, kept together." })] }), _jsx("div", { className: "rounded-xl border border-border bg-muted/20 p-4", children: creating
                                        ? (_jsxs("form", { className: "flex flex-col gap-3", onSubmit: submit, children: [_jsxs("div", { children: [_jsx("h3", { className: "m-0 font-medium", children: "Create new vault" }), _jsx("p", { className: "mt-1 text-xs text-muted-foreground", children: "Give your new collection a name." })] }), _jsx(Label, { htmlFor: "tocktutor-vault-name", children: "Vault Name" }), _jsx(Input, { autoFocus: true, id: "tocktutor-vault-name", maxLength: 80, onChange: event => { setName(event.target.value); }, value: name }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx(Button, { onClick: () => { setCreating(false); setName(''); }, type: "button", variant: "ghost", children: "Cancel" }), _jsx(Button, { disabled: name.trim() === '', type: "submit", children: "Create Vault" })] })] }))
                                        : (_jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("h3", { className: "m-0 font-medium", children: "Create new vault" }), _jsx("p", { className: "mt-1 text-xs text-muted-foreground", children: "Start a new collection of Markdown notes." })] }), _jsxs(Button, { "aria-label": "Create New Vault", onClick: () => { setCreating(true); }, variant: "outline", children: [_jsx(Plus, { "aria-hidden": "true", "data-icon": "inline-start" }), "Create"] })] })) })] })] }) })] }));
}
//# sourceMappingURL=vault-dialog.js.map