import { normalizeNotesBaseFilePath } from "./NotesBaseFormulaPath.js";
import { isNotesBaseImagePath } from "./NotesBaseFormulaMedia.js";
const MAX_NOTES_BASE_IMAGE_URL_LENGTH = 4_096;
class NotesBaseImageValue {
    #source;
    constructor(source) {
        this.#source = source;
        Object.freeze(this);
    }
    source() {
        return this.#source;
    }
}
const notesBaseImageValues = new WeakSet();
/** Normalize one bounded absolute HTTP(S) image URL without creating an evaluator-owned value. */
export function normalizeNotesBaseImageUrl(input) {
    if (input.length === 0
        || input.length > MAX_NOTES_BASE_IMAGE_URL_LENGTH
        || input !== input.trim()
        || /[\u0000-\u001F\u007F]/u.test(input)
        || !/^https?:\/\//iu.test(input))
        return null;
    try {
        const url = new URL(input);
        if ((url.protocol !== "http:" && url.protocol !== "https:")
            || url.username.length > 0
            || url.password.length > 0
            || url.hash.length > 0)
            return null;
        const normalized = url.toString();
        return normalized.length <= MAX_NOTES_BASE_IMAGE_URL_LENGTH ? normalized : null;
    }
    catch {
        return null;
    }
}
function notesBaseImageValue(value) {
    return typeof value === "object" && value !== null && notesBaseImageValues.has(value)
        ? value
        : null;
}
/** Create an evaluator-owned image value from one bounded remote URL or safe local image path. */
export function createNotesBaseImageValue(input) {
    const remoteUrl = normalizeNotesBaseImageUrl(input);
    const localPath = remoteUrl === null ? normalizeNotesBaseFilePath(input) : null;
    const source = remoteUrl !== null
        ? { kind: "remote", value: remoteUrl }
        : localPath !== null && isNotesBaseImagePath(localPath)
            ? { kind: "local", value: localPath }
            : null;
    if (source === null)
        return null;
    const value = new NotesBaseImageValue(source);
    notesBaseImageValues.add(value);
    return value;
}
/** Return the normalized remote URL only for evaluator-owned remote image values. */
export function notesBaseImageUrl(value) {
    const source = notesBaseImageValue(value)?.source();
    return source?.kind === "remote" ? source.value : null;
}
/** Return the normalized vault-relative path only for evaluator-owned local image values. */
export function notesBaseImagePath(value) {
    const source = notesBaseImageValue(value)?.source();
    return source?.kind === "local" ? source.value : null;
}
/** Return the inert URL/path projection only for evaluator-owned image values. */
export function notesBaseImageText(value) {
    return notesBaseImageValue(value)?.source().value ?? null;
}
//# sourceMappingURL=NotesBaseFormulaImage.js.map