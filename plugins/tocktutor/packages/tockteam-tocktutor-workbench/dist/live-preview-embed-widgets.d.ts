import { Plugin, PluginKey } from '@milkdown/prose/state';
import { type ResolvedEmbedNode } from './embeds.ts';
export declare const livePreviewEmbedPluginKey: PluginKey<any>;
export declare function buildLivePreviewEmbedPlugin(getEmbeds: () => readonly ResolvedEmbedNode[], getDocumentKey: () => string): Plugin;
//# sourceMappingURL=live-preview-embed-widgets.d.ts.map