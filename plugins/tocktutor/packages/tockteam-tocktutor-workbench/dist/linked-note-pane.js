import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { cn } from '@tockteam/ui';
import { Alert } from '@tockteam/ui/alert';
import { Button } from '@tockteam/ui/button';
import { useEffect } from 'react';
import { MarkdownDocumentHeader } from "./live-preview-editor.js";
import { NoteBacklinks, NoteOutgoingLinks } from "./note-backlinks.js";
import { NoteOutlinePanel, scrollOutlineHeading } from "./note-outline.js";
import { NoteGraphPanel } from "./note-graph.js";
export const LINKED_VIEW_TITLES = { backlinks: 'Backlinks', 'outgoing-links': 'Outgoing Links', properties: 'Properties', outline: 'Outline', graph: 'Local Graph' };
export function LinkedNotePane({ controller, id }) {
    const snapshot = controller.getPaneSnapshot(id);
    const pane = snapshot.panes.find(pane => pane.id === id);
    const linked = pane?.linkedView;
    const lifetime = controller.paneLifetimeFor(id);
    useEffect(() => { void controller.loadLinkedView(id); }, [controller, id, lifetime, snapshot.revision]);
    if (!linked)
        return null;
    const current = () => controller.paneLifetimeFor(id) === lifetime;
    const onSelect = (path) => { if (current())
        void controller.navigateLinkedView(id, path); };
    const retry = () => { if (current())
        void controller.loadLinkedView(id); };
    const property = controller.bindPropertyActions(id);
    const title = LINKED_VIEW_TITLES[linked.kind];
    const loading = snapshot.linkedLoading === true || (snapshot.revision === null && snapshot.linkedError == null);
    const save = snapshot.saveStatus !== 'saved' && _jsx(Button, { size: "sm", variant: "ghost", disabled: snapshot.saveStatus === 'saving' || snapshot.documentUnavailable, onClick: () => { if (current())
            void controller.saveLinkedView(id); }, children: snapshot.saveStatus === 'saving' ? 'Saving…' : 'Save' });
    return _jsxs("section", { onKeyDown: event => { event.stopPropagation(); }, "aria-label": `${title} Linked View`, "data-pane-id": id, "data-linked-kind": linked.kind, className: cn('grid h-full min-h-0 min-w-0 overflow-hidden', linked.kind === 'properties' ? 'grid-rows-[minmax(0,1fr)] bg-[var(--tockteam-shell-chrome,var(--tt-panel))]' : 'grid-rows-[auto_minmax(0,1fr)] bg-[var(--tt-bg)]'), children: [linked.kind !== 'properties' && _jsxs("header", { className: "flex min-h-10 flex-wrap items-center gap-2 border-b border-[var(--tt-border)] bg-[var(--tt-panel)] px-3 py-1", children: [_jsxs("h2", { className: "m-0 truncate text-sm", title: linked.path ?? undefined, children: [title, linked.path ? ` · ${linked.path}` : ''] }), _jsxs("span", { className: "text-xs text-[var(--tt-muted)]", children: [linked.sourceGroupId ? 'Bound' : linked.pinned ? 'Pinned' : 'Following Active Note', linked.sourceGroupId && linked.pinned ? ' · Pinned' : ''] }), _jsx("span", { className: "flex-1" }), save, linked.sourceGroupId && _jsx(Button, { size: "sm", variant: "ghost", onClick: () => { if (current())
                            controller.unlinkLinkedView(id); }, children: "Unlink" }), _jsx(Button, { size: "sm", variant: "ghost", disabled: !linked.path, "aria-pressed": linked.pinned, onClick: () => { if (current())
                            controller.toggleLinkedPin(id); }, children: linked.pinned ? 'Unpin' : 'Pin' }), _jsx(Button, { size: "sm", variant: "ghost", "aria-label": `Close ${title} Linked View`, onClick: () => { if (current())
                            void controller.closePane(id); }, children: "Close" })] }), _jsxs("div", { className: cn('min-h-0 min-w-0 overflow-auto', linked.kind === 'graph' ? 'relative' : linked.kind === 'properties' ? 'p-3' : 'p-5'), children: [linked.kind === 'properties' && save, snapshot.saveStatus === 'save-failed' && _jsx(Alert, { unstyled: true, role: "alert", children: snapshot.message }), !linked.path ? _jsx(Alert, { unstyled: true, role: "status", children: "No active editor note." })
                        : loading ? _jsxs(Alert, { unstyled: true, role: "status", children: ["Loading ", title.toLocaleLowerCase(), "\u2026"] })
                            : snapshot.linkedError || snapshot.documentUnavailable ? _jsxs(Alert, { unstyled: true, role: "status", children: [snapshot.linkedError ?? 'This note is unavailable. Any local draft has been retained.', " ", _jsx(Button, { variant: "ghost", onClick: retry, children: "Retry" })] })
                                : snapshot.documentKind !== 'markdown' ? _jsx(Alert, { unstyled: true, role: "status", children: "Open a Markdown note to use this linked view." })
                                    : _jsxs(_Fragment, { children: [(linked.kind === 'backlinks' || linked.kind === 'outgoing-links' || linked.kind === 'graph') && snapshot.saveStatus !== 'saved' && _jsx(Alert, { unstyled: true, role: "status", children: "Relationships reflect the saved note. Save to refresh." }), linked.kind === 'backlinks' && _jsx(NoteBacklinks, { links: snapshot.links, loading: snapshot.linksLoading === true, onSelect: onSelect, onRetry: retry }), linked.kind === 'outgoing-links' && _jsx(NoteOutgoingLinks, { links: snapshot.links, loading: snapshot.linksLoading === true, onSelect: onSelect, onRetry: retry }), linked.kind === 'properties' && _jsx(MarkdownDocumentHeader, { compact: true, declaredTypes: controller.getObsidianPropertyTypes(), editableProperties: true, source: snapshot.source, propertyDrafts: controller.getPropertyDrafts(id), suggestions: controller.getPropertySuggestions(), onChangePropertyType: property.changeType, onAddProperty: key => property.set(key, ''), onSetProperty: property.set, onRenameProperty: property.rename, onRemoveProperty: property.remove }, lifetime), linked.kind === 'outline' && _jsx(NoteOutlinePanel, { snapshot: snapshot, onJumpToLine: undefined, onNavigateHeading: async (headings, index) => {
                                                    if (!current() || !linked.path || !await controller.navigateLinkedView(id, linked.path))
                                                        return false;
                                                    const editor = controller.getSnapshot();
                                                    if (!current() || editor.path !== linked.path || editor.source !== snapshot.source)
                                                        return false;
                                                    if (editor.mode === 'source')
                                                        return controller.jumpToLine(headings[index].line);
                                                    const seat = Array.from(document.querySelectorAll('[data-pane-id]')).find(node => node.dataset.paneId === editor.focusedPaneId);
                                                    return scrollOutlineHeading(seat?.querySelector(editor.mode === 'reading' ? '.tocktutor-reading' : '.ProseMirror') ?? null, headings, index);
                                                } }), linked.kind === 'graph' && _jsxs(_Fragment, { children: [_jsx(NoteGraphPanel, { snapshot: snapshot, localOnly: true, onOpenGraphNode: onSelect }), (snapshot.graph?.complete === false || snapshot.graph?.truncated) && _jsx(Alert, { unstyled: true, className: "absolute bottom-0 right-0 max-w-64 bg-[var(--tt-panel)] p-2 text-xs", role: "status", children: "Graph results are incomplete because the vault scan reached its limit." })] })] })] })] });
}
//# sourceMappingURL=linked-note-pane.js.map