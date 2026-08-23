import type { Context } from '@deepseek-ai/cordis';
import { type TockTutorRouteOwnerProps } from '@tockteam/desktop/client';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'tockteam.tocktutor.route': SlotEntryDef & {
            kind: 'single';
            owner: TockTutorRouteOwnerProps;
            scope: 'root';
        };
    }
}
/** Browser Loader identity for the native TockTutor workbench. */
export declare const name = "@tockteam/tocktutor-workbench";
/** Required transport and route registry supplied by the pinned Desktop client graph. */
export declare const inject: string[];
/** Mount strict transport first, then contribute one lifecycle-owned Desktop route. */
export declare function apply(ctx: Context): Promise<() => Promise<void>>;
export * from './assistant-panel.ts';
export * from './review-panel.ts';
export * from './route.tsx';
export * from './types.ts';
export * from './vault-events.ts';
//# sourceMappingURL=client-api.d.ts.map