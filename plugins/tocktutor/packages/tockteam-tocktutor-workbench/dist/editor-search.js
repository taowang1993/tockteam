export const MAX_EDITOR_SEARCH_MATCHES = 10_000;
export const MAX_EDITOR_SEARCH_QUERY_LENGTH = 100_000;
export function searchEditorMatches(source, query, limit = MAX_EDITOR_SEARCH_MATCHES) {
    if (query.length === 0)
        return { matches: [], truncated: false };
    if (query.length > MAX_EDITOR_SEARCH_QUERY_LENGTH)
        return { error: 'Search query is too long.', matches: [], truncated: false };
    if (source.length === 0)
        return { matches: [], truncated: false };
    const boundedLimit = Number.isSafeInteger(limit) ? Math.max(0, Math.min(limit, MAX_EDITOR_SEARCH_MATCHES)) : MAX_EDITOR_SEARCH_MATCHES;
    if (boundedLimit === 0)
        return { matches: [], truncated: false };
    const matches = [];
    let from = source.indexOf(query);
    while (from >= 0) {
        if (matches.length >= boundedLimit)
            return { matches, truncated: true };
        matches.push({ from, to: from + query.length });
        from = source.indexOf(query, from + query.length);
    }
    return { matches, truncated: false };
}
export function findEditorMatches(source, query, limit = MAX_EDITOR_SEARCH_MATCHES) {
    return searchEditorMatches(source, query, limit).matches;
}
export function clampEditorSearchIndex(total, index) {
    if (!Number.isSafeInteger(total) || total <= 0)
        return null;
    const requested = Number.isSafeInteger(index) ? index : 0;
    return Math.max(0, Math.min(requested, total - 1));
}
export function moveEditorSearchIndex(total, current, direction) {
    const index = clampEditorSearchIndex(total, current);
    if (index === null)
        return null;
    return (index + direction + total) % total;
}
//# sourceMappingURL=editor-search.js.map