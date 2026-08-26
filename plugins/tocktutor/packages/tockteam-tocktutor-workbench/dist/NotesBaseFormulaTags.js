import { normalizeNotesBaseFilePath } from "./NotesBaseFormulaPath.js";
import { noteHasTag } from "./NotesBaseFormulaTagsMatch.js";
const MAX_NOTES_BASE_TAG_VALUES = 10_000;
const MAX_NOTES_BASE_TAG_TEXT_LENGTH = 100_000;
const MAX_NOTES_BASE_TAG_MATCHES = 100_000;
export function notesBaseTagsSnapshot(value) {
    try {
        if (!Array.isArray(value))
            return null;
        const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
        const length = lengthDescriptor && "value" in lengthDescriptor
            ? lengthDescriptor.value
            : null;
        if (typeof length !== "number"
            || !Number.isSafeInteger(length)
            || length < 0
            || length > MAX_NOTES_BASE_TAG_VALUES
            || value.length !== length)
            return null;
        let textLength = 0;
        const tags = [];
        for (let index = 0; index < length; index += 1) {
            const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
            const entry = descriptor && "value" in descriptor ? descriptor.value : null;
            if (typeof entry !== "string" || value[index] !== entry)
                return null;
            textLength += entry.length;
            if (textLength > MAX_NOTES_BASE_TAG_TEXT_LENGTH)
                return null;
            tags.push(entry);
        }
        return tags;
    }
    catch {
        return null;
    }
}
export function evaluateNotesBaseFileHasTagCall(call, resolveProperty, splitArgs, evaluateArg, fileTagsFor) {
    const args = splitArgs(call.args);
    if ((call.receiver !== "file"
        && call.receiver !== "this.file"
        && !/^file\([\s\S]*\)$/u.test(call.receiver))
        || !args
        || args.length === 0
        || args.length > MAX_NOTES_BASE_TAG_VALUES
        || /,\s*$/u.test(call.args)) {
        return { supported: false };
    }
    let tagValue;
    if (call.receiver === "file") {
        tagValue = resolveProperty("file.tags");
    }
    else {
        const projectedFile = evaluateArg(call.receiver, resolveProperty);
        const path = projectedFile.supported && typeof projectedFile.value === "string"
            ? normalizeNotesBaseFilePath(projectedFile.value)
            : null;
        if (!path || !fileTagsFor)
            return { supported: false };
        try {
            tagValue = fileTagsFor(path);
        }
        catch {
            return { supported: false };
        }
    }
    const tags = notesBaseTagsSnapshot(tagValue);
    if (!tags || tags.length * args.length > MAX_NOTES_BASE_TAG_MATCHES)
        return { supported: false };
    const queries = [];
    let queryLength = 0;
    for (const arg of args) {
        const query = evaluateArg(arg, resolveProperty);
        if (!query.supported || typeof query.value !== "string")
            return { supported: false };
        queryLength += query.value.length;
        if (queryLength > MAX_NOTES_BASE_TAG_TEXT_LENGTH)
            return { supported: false };
        queries.push(query.value);
    }
    return { supported: true, value: queries.some((query) => noteHasTag(tags, query)) };
}
//# sourceMappingURL=NotesBaseFormulaTags.js.map