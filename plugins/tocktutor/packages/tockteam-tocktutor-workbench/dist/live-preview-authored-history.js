// @ts-nocheck -- Milkdown's extensionless declarations are incompatible with the pinned NodeNext analyzer.
import { Fragment } from '@milkdown/prose/model';
import { isHistoryTransaction } from '@milkdown/prose/history';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Step, StepResult } from '@milkdown/prose/transform';
// Pinned commonmark heading.ts generates/adopts DOM IDs, but its Markdown
// parser and serializer do not author them. Normalize only that attribute for
// comparison; keep every level, mark, URL and other node attribute intact.
export function withoutGeneratedHeadingIds(node) {
    const children = [];
    node.forEach(child => children.push(withoutGeneratedHeadingIds(child)));
    const content = node.isLeaf ? node.content : Fragment.fromArray(children);
    return node.type.name === 'heading'
        ? node.type.create({ ...node.attrs, id: '' }, content, node.marks)
        : node.copy(content);
}
function sameAuthoredDocument(before, after) {
    return withoutGeneratedHeadingIds(before).eq(withoutGeneratedHeadingIds(after));
}
export const authoredHistoryKey = new PluginKey('tocktutor-authored-source');
// Ephemeral editor-local history only: never registered in the global Step JSON registry.
// Native history owns grouping, inversion and pruning. Retain only the changed slice,
// not a whole note per keystroke (history depth bounds events, not keystrokes).
// ponytail: delta/step overhead grows with a typing group; coalesce only if profiling warrants it.
export class AuthoredSourceStep extends Step {
    from;
    removed;
    inserted;
    constructor(from, removed, inserted) {
        super();
        this.from = from;
        this.removed = removed;
        this.inserted = inserted;
    }
    static between(before, after) {
        let from = 0;
        while (from < before.length && from < after.length && before[from] === after[from])
            from += 1;
        let endBefore = before.length;
        let endAfter = after.length;
        while (endBefore > from && endAfter > from && before[endBefore - 1] === after[endAfter - 1]) {
            endBefore -= 1;
            endAfter -= 1;
        }
        return new AuthoredSourceStep(from, before.slice(from, endBefore), after.slice(from, endAfter));
    }
    apply(doc) { return StepResult.ok(doc); }
    invert() { return new AuthoredSourceStep(this.from, this.inserted, this.removed); }
    map() { return this; }
    toJSON() { throw new Error('Authored history is editor-local and cannot be persisted.'); }
    update(source) { return source.slice(0, this.from) + this.inserted + source.slice(this.from + this.removed.length); }
}
export function buildAuthoredHistory(initialSource, serialize) {
    return new Plugin({
        key: authoredHistoryKey,
        filterTransaction(transaction, state) {
            // DOM ID adoption must reach the view, but must not become an undo event
            // or clear redo. Set native history metadata before any plugin applies it.
            if (transaction.docChanged && !isHistoryTransaction(transaction)
                && !transaction.steps.some(step => step instanceof AuthoredSourceStep)
                && sameAuthoredDocument(state.doc, transaction.doc))
                transaction.setMeta('addToHistory', false);
            return true;
        },
        state: {
            init: initialSource,
            apply(transaction, source) {
                for (const step of transaction.steps)
                    if (step instanceof AuthoredSourceStep)
                        source = step.update(source);
                return source;
            },
        },
        appendTransaction(transactions, oldState, state) {
            // Undo/redo already includes the inverted authored steps, in native step order.
            if (!transactions.some(transaction => transaction.docChanged)
                || transactions.some(transaction => transaction.steps.some(step => step instanceof AuthoredSourceStep)))
                return null;
            // No serializer publication for DOM-only IDs (including after undo).
            if (sameAuthoredDocument(oldState.doc, state.doc))
                return null;
            const before = authoredHistoryKey.getState(oldState);
            const candidate = transactions.map(transaction => transaction.getMeta(authoredHistoryKey)).find(value => typeof value === 'string');
            const after = candidate ?? serialize(state.doc, before);
            return state.tr.step(AuthoredSourceStep.between(before, after));
        },
    });
}
//# sourceMappingURL=live-preview-authored-history.js.map