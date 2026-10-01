import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@tockteam/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@tockteam/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@tockteam/ui/popover';
/** Suggestions are optional; the ordinary input always accepts free-form values. */
export function PropertySuggestionMenu(props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    return _jsxs(Popover, { onOpenChange: value => { setOpen(value); if (value) {
            setQuery(props.value);
            if (props.suggestions.status === 'idle')
                props.suggestions.onRetry();
        } }, open: open, children: [_jsx(PopoverTrigger, { asChild: true, children: _jsx(Button, { "aria-label": props.label, size: "icon-xs", type: "button", variant: "ghost", children: _jsx(ChevronDown, { "aria-hidden": "true" }) }) }), _jsxs(PopoverContent, { align: "start", className: "w-64 p-0", portalled: false, onEscapeKeyDown: event => { event.stopPropagation(); }, onKeyDown: event => { if (event.key === 'Escape')
                    event.stopPropagation(); }, children: [_jsxs(Command, { children: [_jsx(CommandInput, { "aria-label": `Find ${props.label}`, onValueChange: setQuery, placeholder: "Type to filter\u2026", value: query }), _jsxs(CommandList, { className: "max-h-48", children: [_jsx(CommandEmpty, { children: "No matching suggestions. You can enter your own value." }), _jsx(CommandGroup, { heading: "Suggestions", children: [...new Set(props.items)].slice(0, 1_000).map(item => _jsx(CommandItem, { onSelect: () => { if (props.onSelect(item))
                                                setOpen(false); }, value: item, children: item }, item)) })] })] }), props.suggestions.status === 'loading' && _jsx("p", { className: "m-0 px-3 py-2 text-xs text-muted-foreground", role: "status", children: "Loading suggestions\u2026" }), props.suggestions.status === 'error' && _jsxs("div", { className: "px-3 py-2 text-xs", children: [_jsx("p", { className: "m-0", role: "status", children: "Suggestions could not be loaded. Your input is unchanged." }), _jsx(Button, { onClick: props.suggestions.onRetry, size: "xs", type: "button", variant: "ghost", children: "Retry Suggestions" })] }), props.suggestions.incomplete && _jsx("p", { className: "m-0 px-3 py-2 text-xs text-muted-foreground", role: "status", children: "This is a partial list. You can enter any name or value." })] })] });
}
//# sourceMappingURL=property-suggestions.js.map