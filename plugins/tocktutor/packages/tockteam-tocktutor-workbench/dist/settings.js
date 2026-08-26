import { createWorkbenchSession, hydrateWorkbenchSession, isSafeVaultRelativePath, } from "./session.js";
export const MAX_TOCKTUTOR_SETTINGS_BYTES = 1_048_576;
export const MAX_TOCKTUTOR_WORKSPACES = 32;
export const MAX_TOCKTUTOR_CSS_BYTES = 524_288;
const DEFAULT_SETTINGS = Object.freeze({
    attachmentFolder: 'Attachments',
    backlinksInDocument: false,
    defaultEditingMode: 'live-preview',
    graphDepth: 2,
    graphIncludeAttachments: false,
    graphIncludeOrphans: true,
    graphIncludeTags: false,
    graphQuery: '',
    graphGroupBy: 'none',
    graphColorBy: 'none',
    journalFolder: 'Journals',
    pagePreview: true,
    recoveryIntervalMinutes: 5,
    snapshotRetentionDays: 7,
    templateFolder: 'Templates',
    webClipFolder: 'Clips',
});
function validVaultId(value) {
    return /^vault:[0-9a-f]{64}$/u.test(value);
}
function settingsKey(vaultId) {
    return `tocktutor.settings.v1.${validVaultId(vaultId) ? vaultId : 'invalid'}`;
}
function stateKey(vaultId) {
    return `tocktutor.workbench.v1.${validVaultId(vaultId) ? vaultId : 'invalid'}`;
}
function safeFolder(value, fallback) {
    return typeof value === 'string'
        && value.length <= 1_000
        && isSafeVaultRelativePath(value)
        && !/^[A-Za-z]:/u.test(value)
        ? value
        : fallback;
}
function normalizeSettings(value) {
    const record = typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : {};
    return {
        attachmentFolder: safeFolder(record.attachmentFolder, DEFAULT_SETTINGS.attachmentFolder),
        backlinksInDocument: record.backlinksInDocument === true,
        defaultEditingMode: record.defaultEditingMode === 'source' ? 'source' : 'live-preview',
        graphDepth: record.graphDepth === 1 || record.graphDepth === 3 ? record.graphDepth : 2,
        graphIncludeAttachments: record.graphIncludeAttachments === true,
        graphIncludeOrphans: record.graphIncludeOrphans !== false,
        graphIncludeTags: record.graphIncludeTags === true,
        graphQuery: typeof record.graphQuery === 'string' ? record.graphQuery.slice(0, 1_000) : '',
        graphGroupBy: record.graphGroupBy === 'folder' ? 'folder' : 'none',
        graphColorBy: record.graphColorBy === 'folder' ? 'folder' : 'none',
        journalFolder: safeFolder(record.journalFolder, DEFAULT_SETTINGS.journalFolder),
        pagePreview: record.pagePreview !== false,
        recoveryIntervalMinutes: typeof record.recoveryIntervalMinutes === 'number' && Number.isSafeInteger(record.recoveryIntervalMinutes) && record.recoveryIntervalMinutes >= 1 && record.recoveryIntervalMinutes <= 1_440 ? record.recoveryIntervalMinutes : DEFAULT_SETTINGS.recoveryIntervalMinutes,
        snapshotRetentionDays: typeof record.snapshotRetentionDays === 'number' && Number.isSafeInteger(record.snapshotRetentionDays) && record.snapshotRetentionDays >= 1 && record.snapshotRetentionDays <= 365 ? record.snapshotRetentionDays : DEFAULT_SETTINGS.snapshotRetentionDays,
        templateFolder: safeFolder(record.templateFolder, DEFAULT_SETTINGS.templateFolder),
        webClipFolder: safeFolder(record.webClipFolder, DEFAULT_SETTINGS.webClipFolder),
    };
}
function readJson(storage, key) {
    try {
        const raw = storage.getItem(key);
        if (raw === null || new TextEncoder().encode(raw).byteLength > MAX_TOCKTUTOR_SETTINGS_BYTES)
            return null;
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function writeJson(storage, key, value) {
    try {
        const raw = JSON.stringify(value);
        if (new TextEncoder().encode(raw).byteLength > MAX_TOCKTUTOR_SETTINGS_BYTES)
            return false;
        storage.setItem(key, raw);
        return true;
    }
    catch {
        return false;
    }
}
export function loadTockTutorSettings(storage, vaultId) {
    if (!validVaultId(vaultId))
        return { ...DEFAULT_SETTINGS };
    return normalizeSettings(readJson(storage, settingsKey(vaultId)));
}
export function saveTockTutorSettings(storage, vaultId, change) {
    if (!validVaultId(vaultId))
        return { ...DEFAULT_SETTINGS };
    const settings = normalizeSettings({ ...loadTockTutorSettings(storage, vaultId), ...change });
    writeJson(storage, settingsKey(vaultId), settings);
    return settings;
}
function workspaceId(name) {
    return name.normalize('NFKD')
        .replace(/[\u0300-\u036f]/gu, '')
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '')
        .slice(0, 64) || 'workspace';
}
function normalizeWorkspace(value, vaultId) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return null;
    const record = value;
    if (typeof record.id !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,63})$/u.test(record.id))
        return null;
    if (typeof record.name !== 'string' || record.name.trim().length === 0 || record.name.length > 100)
        return null;
    const session = hydrateWorkbenchSession(record.session);
    if (session.vault?.id !== vaultId)
        return null;
    const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) && record.createdAt >= 0
        ? record.createdAt : 0;
    return { createdAt, focusMode: record.focusMode === true, id: record.id, name: record.name.trim(), session };
}
export function createNamedWorkspace(current, name, session, createdAt = Date.now(), focusMode = false) {
    const safeName = name.trim().slice(0, 100) || 'Workspace';
    const base = workspaceId(safeName);
    const used = new Set(current.map(workspace => workspace.id));
    let id = base;
    for (let index = 2; used.has(id) && index <= MAX_TOCKTUTOR_WORKSPACES + 1; index += 1)
        id = `${base.slice(0, 60)}-${String(index)}`;
    if (used.has(id) || current.length >= MAX_TOCKTUTOR_WORKSPACES)
        return [...current];
    return [...current, { createdAt, focusMode, id, name: safeName, session: hydrateWorkbenchSession(session) }];
}
export function loadWorkbenchState(storage, vaultId) {
    const fallback = { focusMode: false, session: createWorkbenchSession('/tocktutor', validVaultId(vaultId) ? { generation: 0, id: vaultId } : null, 'pane-1'), workspaces: [] };
    if (!validVaultId(vaultId))
        return fallback;
    const value = readJson(storage, stateKey(vaultId));
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return fallback;
    const record = value;
    const session = hydrateWorkbenchSession(record.session);
    if (session.vault?.id !== vaultId)
        return fallback;
    const workspaces = [];
    const ids = new Set();
    if (Array.isArray(record.workspaces)) {
        for (const candidate of record.workspaces.slice(0, MAX_TOCKTUTOR_WORKSPACES)) {
            const workspace = normalizeWorkspace(candidate, vaultId);
            if (workspace !== null && !ids.has(workspace.id)) {
                ids.add(workspace.id);
                workspaces.push(workspace);
            }
        }
    }
    return { focusMode: record.focusMode === true, session, workspaces };
}
export function saveWorkbenchState(storage, vaultId, state) {
    if (!validVaultId(vaultId) || state.session.vault?.id !== vaultId)
        return false;
    return writeJson(storage, stateKey(vaultId), {
        focusMode: state.focusMode === true,
        session: hydrateWorkbenchSession(state.session),
        workspaces: state.workspaces.slice(0, MAX_TOCKTUTOR_WORKSPACES),
    });
}
function safeSnippetId(value) {
    return value.toLocaleLowerCase().replace(/[^a-z0-9_-]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 64) || 'snippet';
}
export function compileTockTutorCssSnippet(id, source) {
    if (typeof source !== 'string' || new TextEncoder().encode(source).byteLength > MAX_TOCKTUTOR_CSS_BYTES)
        return null;
    const stripped = source.replace(/\/\*[\s\S]*?\*\//gu, '').trim();
    if (stripped === '')
        return '';
    if (/@|url\s*\(|expression\s*\(|javascript:|[<>]/iu.test(stripped))
        return null;
    const output = [];
    let cursor = 0;
    let rules = 0;
    while (cursor < stripped.length) {
        const open = stripped.indexOf('{', cursor);
        const close = open < 0 ? -1 : stripped.indexOf('}', open + 1);
        if (open < 0 || close < 0 || stripped.slice(close + 1).includes('{') && stripped.slice(close + 1).indexOf('}') < stripped.slice(close + 1).indexOf('{'))
            return null;
        const selector = stripped.slice(cursor, open).trim();
        const body = stripped.slice(open + 1, close).trim();
        if (selector === '' || body === '' || body.includes('{') || body.includes('}'))
            return null;
        const selectors = selector.split(',').map(value => value.trim());
        if (selectors.some(value => value === '' || value.length > 1_000))
            return null;
        output.push(`${selectors.map(value => `.tocktutor-editor-scope ${value}`).join(', ')} { ${body} }`);
        rules += 1;
        if (rules > 1_000)
            return null;
        cursor = close + 1;
        while (/\s/u.test(stripped[cursor] ?? ''))
            cursor += 1;
    }
    void safeSnippetId(id);
    return output.join('\n');
}
//# sourceMappingURL=settings.js.map