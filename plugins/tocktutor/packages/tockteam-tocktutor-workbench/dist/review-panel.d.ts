import type { VaultReference } from './types.ts';
/** Ordered UI seat for optional reviewed workflows owned by the Workbench route. */
export declare const TOCKTUTOR_REVIEW_PANEL_SLOT = "tockteam.tocktutor.workbench.review";
/** Bounded route context shared with reviewed workflow panels. */
export interface TockTutorReviewPanelOwnerProps {
    activePath: string | null;
    vault: VaultReference | null;
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'tockteam.tocktutor.workbench.review': {
            kind: 'list';
            scope: 'root';
            owner: TockTutorReviewPanelOwnerProps;
        };
    }
}
//# sourceMappingURL=review-panel.d.ts.map