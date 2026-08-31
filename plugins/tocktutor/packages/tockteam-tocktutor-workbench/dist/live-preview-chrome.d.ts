import { Plugin } from '@milkdown/prose/state';
interface ChromeState {
    folded: ReadonlySet<number>;
}
export declare function buildLivePreviewChromePlugin(options: {
    isProtected(): boolean;
    onOpenExternalUrl(): ((url: string) => void) | undefined;
    onToggleCallout(index: number): void;
    onToggleTask(index: number): void;
}): Plugin<ChromeState>;
export {};
//# sourceMappingURL=live-preview-chrome.d.ts.map