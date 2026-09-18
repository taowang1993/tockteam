import type { Context as CordisContext } from '@deepseek-ai/cordis';
import { type TockTutorSlots } from '@tockteam/tocktutor-workbench/client';
type Context = CordisContext & {
    slots: TockTutorSlots;
};
/** Browser Loader identity for the inline TockTutor assistant. */
export declare const name = "@tockteam/tocktutor-assistant";
/** Required generated transport and Workbench presentation services. */
export declare const inject: string[];
/** Mount transport first, then contribute one lifecycle-owned nested Workbench panel. */
export declare function apply(ctx: Context): Promise<() => Promise<void>>;
export type * from './remote-types.ts';
//# sourceMappingURL=client.d.ts.map