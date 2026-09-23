import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Step, StepResult } from '@milkdown/prose/transform';
export declare function withoutGeneratedHeadingIds(node: any): any;
export declare const authoredHistoryKey: PluginKey<any>;
export declare class AuthoredSourceStep extends Step {
    readonly from: number;
    readonly removed: string;
    readonly inserted: string;
    constructor(from: number, removed: string, inserted: string);
    static between(before: string, after: string): AuthoredSourceStep;
    apply(doc: any): StepResult;
    invert(): AuthoredSourceStep;
    map(): this;
    toJSON(): void;
    update(source: string): string;
}
export declare function buildAuthoredHistory(initialSource: () => string, serialize: (doc: any, authored: string) => string): Plugin<string>;
//# sourceMappingURL=live-preview-authored-history.d.ts.map