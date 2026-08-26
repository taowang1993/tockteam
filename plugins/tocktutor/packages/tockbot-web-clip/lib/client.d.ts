import type { Context } from '@deepseek-ai/cordis';
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
export declare const inject: string[];
export declare function apply(ctx: Context): void;
export {};
