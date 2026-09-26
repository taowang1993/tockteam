import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
// @ts-nocheck -- Milkdown's extensionless declarations are incompatible with the pinned NodeNext analyzer.
import { block, blockConfig, BlockProvider } from '@milkdown/plugin-block';
import { findParent } from '@milkdown/prose';
import { closeHistory } from '@milkdown/prose/history';
import { NodeSelection, TextSelection } from '@milkdown/prose/state';
import { Button } from '@tockteam/ui/button';
import { GripVertical, Plus } from 'lucide-react';
import { createPortal } from 'react-dom';
import { slashKey } from "./live-preview-slash-menu.js";
export { block };
export function configureBlockHandle(ctx, publish) {
    ctx.set(blockConfig.key, { filterNodes: pos => !findParent(node => ['table', 'blockquote', 'math_inline'].includes(node.type.name))(pos) });
    ctx.set(block.key, { view(view) {
            const element = document.createElement('div');
            element.className = 'tocktutor-block-handle absolute flex items-center gap-0.5 text-muted-foreground data-[show=false]:invisible data-[show=false]:pointer-events-none';
            const provider = new BlockProvider({ ctx, content: element, getOffset: () => 8, getPlacement: () => 'left-start' });
            provider.update();
            const currentBlock = () => {
                const active = provider.active;
                return active && view.editable && !view.isDestroyed && active.$pos.doc === view.state.doc ? active : null;
            };
            publish({ element, select() {
                    const active = currentBlock();
                    if (!active || !NodeSelection.isSelectable(active.node))
                        return;
                    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, active.$pos.pos)));
                    view.focus();
                }, add() {
                    const active = currentBlock();
                    if (!active)
                        return;
                    const pos = active.$pos.pos + active.node.nodeSize;
                    const tr = view.state.tr.insert(pos, view.state.schema.nodes.paragraph.create());
                    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
                    view.focus();
                    view.dispatch(closeHistory(tr.setMeta(slashKey, { from: pos + 1, to: pos + 1, slash: false, selected: '' }).scrollIntoView()));
                    view.dispatch(closeHistory(view.state.tr));
                    provider.hide();
                } });
            return { update(view, previous) { if (!previous.doc.eq(view.state.doc))
                    provider.hide(); }, destroy() {
                    provider.destroy();
                    // The public provider initializes on its own next frame; clean up that pending init on early unmount too.
                    requestAnimationFrame(() => provider.destroy());
                    publish(null);
                } };
        } });
}
export function BlockHandle({ handle }) {
    return createPortal(_jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", size: "icon-sm", "aria-label": "Add Block", onPointerDown: event => event.preventDefault(), onClick: handle.add, children: _jsx(Plus, { "aria-hidden": "true" }) }), _jsx(Button, { variant: "ghost", size: "icon-sm", "aria-label": "Drag Block", title: "Select this block to cut and paste, or drag it to move.", draggable: true, onClick: handle.select, children: _jsx(GripVertical, { "aria-hidden": "true" }) })] }), handle.element);
}
//# sourceMappingURL=live-preview-block-handle.js.map