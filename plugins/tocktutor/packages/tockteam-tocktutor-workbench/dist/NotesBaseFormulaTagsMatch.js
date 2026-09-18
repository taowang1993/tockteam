export function noteHasTag(tags, tag) {
    const normalized = tag.replace(/^#+/u, '').trim().toLowerCase();
    return tags.some(candidate => {
        const value = candidate.toLowerCase();
        return value === normalized || value.startsWith(`${normalized}/`);
    });
}
//# sourceMappingURL=NotesBaseFormulaTagsMatch.js.map