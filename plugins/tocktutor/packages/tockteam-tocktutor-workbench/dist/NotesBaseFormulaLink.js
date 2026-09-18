import { notesBaseIconName } from "./NotesBaseFormulaIcon.js";
class NotesBaseLinkValue {
    #path;
    #display;
    constructor(path, display) {
        this.#path = path;
        this.#display = display === null ? null : Object.freeze(display);
        Object.freeze(this);
    }
    path() {
        return this.#path;
    }
    text() {
        if (this.#display === null)
            return this.#path;
        return this.#display.kind === "text" ? this.#display.value : this.#display.name;
    }
    icon() {
        return this.#display?.kind === "icon" ? this.#display.value : null;
    }
}
const notesBaseLinkValues = new WeakSet();
function notesBaseLinkValue(value) {
    return typeof value === "object" && value !== null && notesBaseLinkValues.has(value)
        ? value
        : null;
}
/** Create an evaluator-owned internal Link value from an already-normalized vault path. */
export function createNotesBaseLinkValue(path, display) {
    let normalizedDisplay = null;
    if (typeof display === "string") {
        normalizedDisplay = { kind: "text", value: display };
    }
    else if (display != null) {
        const name = notesBaseIconName(display);
        if (name === null)
            return null;
        normalizedDisplay = { kind: "icon", name, value: display };
    }
    const value = new NotesBaseLinkValue(path, normalizedDisplay);
    notesBaseLinkValues.add(value);
    return value;
}
/** Return the normalized vault path only for evaluator-owned Link values. */
export function notesBaseLinkPath(value) {
    return notesBaseLinkValue(value)?.path() ?? null;
}
/** Return the visible label only for evaluator-owned Link values. */
export function notesBaseLinkText(value) {
    return notesBaseLinkValue(value)?.text() ?? null;
}
/** Return only a verified evaluator-owned icon used as a Link display value. */
export function notesBaseLinkIcon(value) {
    return notesBaseLinkValue(value)?.icon() ?? null;
}
//# sourceMappingURL=NotesBaseFormulaLink.js.map