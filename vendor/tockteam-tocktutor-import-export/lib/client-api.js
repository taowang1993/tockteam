import { createElement } from 'react';
import { TOCKTUTOR_REVIEW_PANEL_SLOT, } from '@tockteam/tocktutor-workbench/client';
import importExportRemote from '@tockteam/tocktutor-import-export/remote';
import { ImportExportReviewPanel, } from "./review-panel.js";
export const name = '@tockteam/tocktutor-import-export';
export const inject = ['remote', 'slots'];
export async function apply(ctx) {
    const disposeRemote = await ctx.remote.$mount(importExportRemote);
    let disposePanel;
    try {
        disposePanel = ctx.slots.inject(TOCKTUTOR_REVIEW_PANEL_SLOT, () => ctx.slots.register({
            id: 'tocktutor-import-export',
            name: TOCKTUTOR_REVIEW_PANEL_SLOT,
            order: 10,
            registrant: name,
        }, (props) => createElement(ImportExportReviewPanel, {
            ...props,
            remote: ctx.remote,
        })));
    }
    catch (error) {
        await disposeRemote();
        throw error;
    }
    return async () => {
        disposePanel?.();
        await disposeRemote();
    };
}
export * from "./review-panel.js";
export * from "./types.js";
//# sourceMappingURL=client-api.js.map