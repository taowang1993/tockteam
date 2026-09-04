import type { Context as CordisContext } from '@deepseek-ai/cordis';
import { type TockTutorSlots } from '@tockteam/tocktutor-workbench/client';
export declare const name = "@tockteam/tocktutor-import-export";
type Context = CordisContext & {
    slots: TockTutorSlots;
};
export declare const inject: string[];
export declare function apply(ctx: Context): Promise<() => Promise<void>>;
export * from './review-panel.tsx';
export * from './types.ts';
//# sourceMappingURL=client-api.d.ts.map