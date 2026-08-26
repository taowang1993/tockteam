function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function assertUniqueEntries(entries, kind) {
    const ids = new Set();
    for (const entry of entries) {
        if (!isRecord(entry) || typeof entry.id !== 'string')
            continue;
        if (ids.has(entry.id))
            throw new Error(`This .canvas file contains duplicate Canvas ${kind} ids.`);
        ids.add(entry.id);
    }
}
/** Reject ambiguous node or edge identities before a Canvas mutation. */
export function assertUniqueCanvasDocumentIdentities(document) {
    if (Array.isArray(document.nodes))
        assertUniqueEntries(document.nodes, 'node');
    if (Array.isArray(document.edges))
        assertUniqueEntries(document.edges, 'edge');
}
//# sourceMappingURL=canvas-identity.js.map