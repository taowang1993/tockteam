const IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
function extensionOf(pathValue) {
    const base = pathValue.split(/[\\/]/u).pop() ?? pathValue;
    const dot = base.lastIndexOf('.');
    return dot >= 0 ? base.slice(dot).toLowerCase() : '';
}
/** Return the only local media kind accepted by Base image values. */
export function isNotesBaseImagePath(pathValue) {
    return IMAGE_EXTENSIONS.has(extensionOf(pathValue));
}
//# sourceMappingURL=NotesBaseFormulaMedia.js.map