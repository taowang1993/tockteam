import { isSafeVaultRelativePath } from "./session.js";
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasExactKeys(value, keys) {
    const actual = Object.keys(value).toSorted();
    const expected = keys.toSorted();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function isVaultReference(value) {
    return isRecord(value)
        && hasExactKeys(value, ['generation', 'id'])
        && Number.isSafeInteger(value.generation)
        && value.generation >= 0
        && typeof value.id === 'string'
        && /^vault:[0-9a-f]{64}$/u.test(value.id);
}
export function isNoteVaultChangeEvent(value) {
    if (!isRecord(value) || !isVaultReference(value.vault))
        return false;
    if (value.kind === 'vault') {
        return value.action === 'activated' && hasExactKeys(value, ['action', 'kind', 'vault']);
    }
    if (value.kind === 'tree') {
        return (value.action === 'changed' || value.action === 'watcher-error')
            && hasExactKeys(value, ['action', 'kind', 'vault']);
    }
    if (value.kind !== 'entry' || !isSafeVaultRelativePath(value.path))
        return false;
    if (value.action === 'created'
        || value.action === 'external-change'
        || value.action === 'external-rename'
        || value.action === 'stored'
        || value.action === 'updated')
        return hasExactKeys(value, ['action', 'kind', 'path', 'vault']);
    return (value.action === 'duplicated'
        || value.action === 'moved'
        || value.action === 'restored'
        || value.action === 'trashed')
        && isSafeVaultRelativePath(value.fromPath)
        && hasExactKeys(value, ['action', 'fromPath', 'kind', 'path', 'vault']);
}
/** Subscribe to current-vault runtime changes and suppress stale or malformed delivery. */
export function subscribeNoteVaultChanges(remote, currentVault, listener) {
    return remote.$on('note-vault/change', event => {
        if (!isNoteVaultChangeEvent(event))
            return;
        const current = currentVault();
        if (current === null
            || event.vault.id !== current.id
            || event.vault.generation !== current.generation)
            return;
        listener(event);
    });
}
//# sourceMappingURL=vault-events.js.map