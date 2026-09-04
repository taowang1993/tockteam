import type { Context as CordisContext } from '@deepseek-ai/cordis';
import type { TockTutorSlots } from '@tockteam/tocktutor-workbench/client';
interface WebClipDesktopBridge {
    authorizeDocument(frameId: number, html: string): Promise<string>;
}
declare global {
    interface Window {
        dshDesktop?: {
            getInfo(): Promise<{
                version: string;
            }>;
            webClip?: WebClipDesktopBridge;
        };
    }
}
export declare const name = "tockbot-web-clip";
type Context = CordisContext & {
    slots: TockTutorSlots;
};
export declare const inject: string[];
export declare function apply(ctx: Context): void;
export {};
