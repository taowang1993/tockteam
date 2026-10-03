import { createElement } from 'react';
import { TOCKTUTOR_REVIEW_PANEL_SLOT, } from '@tockteam/tocktutor-workbench/client';
import importExportRemote from '@tockteam/tocktutor-import-export/remote';
import { ImportExportReviewPanel, } from "./review-panel.js";
export const name = '@tockteam/tocktutor-import-export';
export const inject = ['remote', 'slots'];
export async function apply(ctx) {
    const disposeRemote = await ctx.remote.$mount(importExportRemote);
    let panelFiber;
    try {
        panelFiber = ctx.inject(['remote', 'remote.tocktutor-import-export', 'slots'], child => {
            const mountedRemote = child.remote;
            const remote = {
                'tocktutor-import-export': mountedRemote['tocktutor-import-export'],
            };
            const slots = child.slots;
            return slots.inject(TOCKTUTOR_REVIEW_PANEL_SLOT, () => slots.register({
                id: 'tocktutor-import-export',
                name: TOCKTUTOR_REVIEW_PANEL_SLOT,
                order: 10,
                registrant: name,
            }, (props) => createElement(ImportExportReviewPanel, {
                ...props,
                remote,
            })));
        });
        await panelFiber;
    }
    catch (error) {
        await panelFiber?.dispose();
        await disposeRemote();
        throw error;
    }
    return async () => {
        await panelFiber.dispose();
        await disposeRemote();
    };
}
export * from "./review-panel.js";
export * from "./types.js";
//# sourceMappingURL=client-api.js.map