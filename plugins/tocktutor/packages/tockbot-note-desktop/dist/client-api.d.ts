import type { Context as CordisContext } from '@deepseek-ai/cordis';
import type { TockTutorSlots } from '@tockteam/tocktutor-workbench/client';
type Context = CordisContext & {
    slots: TockTutorSlots;
};
export declare const name = "tockbot-note-desktop";
export declare const inject: string[];
/** Mount the caller facade Remote and one root-scoped Workbench contribution. */
export declare function apply(ctx: Context): Promise<() => Promise<void>>;
export * from './client-actions.tsx';
export { assertDesktopSurface, TOCKTEAM_SURFACE_SERVICE } from './guard.ts';
//# sourceMappingURL=client-api.d.ts.map