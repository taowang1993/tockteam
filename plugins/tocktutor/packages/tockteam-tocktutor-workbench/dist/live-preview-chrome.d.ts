import { Plugin } from '@milkdown/prose/state';
interface ChromeState {
    folded: ReadonlySet<number>;
}
export declare function buildLivePreviewChromePlugin(onOpenExternalUrl: () => ((url: string) => void) | undefined): Plugin<ChromeState>;
export {};
//# sourceMappingURL=live-preview-chrome.d.ts.map