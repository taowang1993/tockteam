import type { Context } from '@deepseek-ai/cordis';
/** Host Loader identity for the native TockTutor workbench. */
export declare const name = "@tockteam/tocktutor-workbench";
/** Required Host capability supplied only by tockbot-note-runtime. */
export declare const inject: string[];
/** Register the accepted read/tree gateway under this plugin's Cordis lifecycle. */
export declare function apply(ctx: Context): void;
export * from './host-read.ts';
export * from './vault-events.ts';
export * from './session.ts';
export * from './canvas.ts';
export * from './base.ts';
export * from './markdown.ts';
//# sourceMappingURL=index.d.ts.map