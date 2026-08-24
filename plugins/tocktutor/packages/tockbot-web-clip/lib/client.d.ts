interface WebClipDesktopBridge {
    authorizeDocument(frameId: number, html: string): Promise<string>;
}
interface ClientContext {
    effect(effect: () => (() => void) | void, label?: string): void;
    get(name: string): unknown;
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
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
export {};
