// @ts-nocheck -- CodeMirror's extensionless declaration graph is incompatible with the pinned NodeNext analyzer.
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
function taskMarkers(source) {
    const markers = [];
    const lines = source.split(/(?<=\n)/u);
    let offset = 0;
    let fence = null;
    let commentOpen = false;
    for (const line of lines) {
        const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
        if (marker !== undefined) {
            if (fence === null)
                fence = { character: marker[0], length: marker.length };
            else if (marker[0] === fence.character && marker.length >= fence.length && /^ {0,3}(?:`{3,}|~{3,})\s*$/u.test(line.trimEnd()))
                fence = null;
            offset += line.length;
            continue;
        }
        if (fence === null) {
            let visible = line;
            if (commentOpen) {
                const close = visible.indexOf('%%');
                if (close < 0) {
                    offset += line.length;
                    continue;
                }
                visible = visible.slice(close + 2);
                commentOpen = false;
            }
            const open = visible.indexOf('%%');
            if (open >= 0) {
                const close = visible.indexOf('%%', open + 2);
                if (close < 0) {
                    visible = visible.slice(0, open);
                    commentOpen = true;
                }
                else
                    visible = `${visible.slice(0, open)}${visible.slice(close + 2)}`;
            }
            const match = /^(?:\s{0,64})(?:[-+*]|\d+[.)])\s+(\[([^\]])\])/u.exec(visible);
            if (match?.index !== undefined) {
                const local = visible.indexOf(match[1], match.index);
                const from = offset + local;
                markers.push({ checked: match[2] !== ' ', from, to: from + 3 });
            }
        }
        offset += line.length;
    }
    return markers;
}
class TaskWidget extends WidgetType {
    marker;
    constructor(marker) {
        super();
        this.marker = marker;
    }
    eq(other) { return this.marker.from === other.marker.from && this.marker.checked === other.marker.checked; }
    toDOM() {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = this.marker.checked;
        input.className = 'tocktutor-source-task';
        input.dataset.taskFrom = String(this.marker.from);
        input.setAttribute('aria-label', this.marker.checked ? 'Mark Source Task as Incomplete' : 'Mark Source Task as Complete');
        input.tabIndex = -1;
        return input;
    }
    ignoreEvent() { return false; }
}
function taskDecorations(view) {
    const builder = new RangeSetBuilder();
    for (const marker of taskMarkers(view.state.doc.toString())) {
        builder.add(marker.from, marker.to, Decoration.replace({ widget: new TaskWidget(marker) }));
    }
    return builder.finish();
}
export function buildSourceTaskWidgetExtension() {
    const plugin = ViewPlugin.fromClass(class {
        decorations;
        constructor(view) { this.decorations = taskDecorations(view); }
        update(update) { if (update.docChanged)
            this.decorations = taskDecorations(update.view); }
    }, {
        decorations: value => value.decorations,
        provide: value => EditorView.atomicRanges.of(view => view.plugin(value)?.decorations ?? Decoration.none),
    });
    const handler = EditorView.domEventHandlers({
        mousedown(event, view) {
            const input = event.target instanceof Element ? event.target.closest('[data-task-from]') : null;
            if (input === null || view.state.readOnly)
                return false;
            event.preventDefault();
            const from = Number(input.dataset.taskFrom);
            if (!Number.isSafeInteger(from) || from < 0 || from + 3 > view.state.doc.length)
                return true;
            const checked = view.state.sliceDoc(from, from + 3) !== '[ ]';
            view.dispatch({ changes: { from, to: from + 3, insert: checked ? '[ ]' : '[x]' }, selection: { anchor: from + 3 } });
            return true;
        },
    });
    return [plugin, handler];
}
//# sourceMappingURL=source-task-widgets.js.map