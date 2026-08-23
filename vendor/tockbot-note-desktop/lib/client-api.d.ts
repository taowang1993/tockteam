import type { Context } from '@deepseek-ai/cordis';
export declare const name = "tockbot-note-desktop";
export declare const inject: string[];
/** Browser-side composition guard; native methods remain owned by Desktop. */
export declare function apply(ctx: Context): void;
export { assertDesktopSurface, TOCKTEAM_SURFACE_SERVICE } from './guard.ts';
//# sourceMappingURL=client-api.d.ts.map