export const MAX_PANE_GROUPS = 8;
export const MAX_NOTE_TABS = 20;
export const MAX_ID_LENGTH = 128;
export const MAX_VAULT_PATH_LENGTH = 4_096;
export const MAX_ROUTE_ID_LENGTH = 128;
const DEFAULT_MODE = 'wysiwyg';
const DEFAULT_EDITING_MODE = 'wysiwyg';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function boundedString(value, max) {
    return typeof value === 'string' && value.length > 0 && value.length <= max;
}
function isSafeId(value) {
    return boundedString(value, MAX_ID_LENGTH) && !/[\0\r\n]/u.test(value);
}
export function isSafeVaultRelativePath(value) {
    if (!boundedString(value, MAX_VAULT_PATH_LENGTH))
        return false;
    if (value.startsWith('/') || value.startsWith('\\') || value.includes('\\') || value.includes('\0'))
        return false;
    if (/^[A-Za-z][A-Za-z\d+.-]*:/u.test(value))
        return false;
    return value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}
function isEditorMode(value) {
    return value === 'reading' || value === 'wysiwyg' || value === 'source';
}
function isEditingMode(value) {
    return value === 'wysiwyg' || value === 'source';
}
function boundedRevision(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? value
        : 0;
}
function tabDirty(revision, savedRevision) {
    return revision !== savedRevision;
}
function makeTab(input) {
    return {
        ...input,
        get dirty() {
            return tabDirty(this.revision, this.savedRevision);
        },
    };
}
function cloneTab(tab) {
    return makeTab({
        id: tab.id,
        path: tab.path,
        pinned: tab.pinned,
        mode: tab.mode,
        lastEditingMode: tab.lastEditingMode,
        revision: tab.revision,
        savedRevision: tab.savedRevision,
    });
}
function cloneGroup(group) {
    return {
        id: group.id,
        activeTabId: group.activeTabId,
        tabs: group.tabs.map(cloneTab),
    };
}
function cloneSession(session) {
    return {
        routeId: session.routeId,
        vault: session.vault === null ? null : { ...session.vault },
        focusedGroupId: session.focusedGroupId,
        groups: session.groups.map(cloneGroup),
        editorRevision: session.editorRevision,
    };
}
function nextId(prefix, used) {
    for (let index = 1; index <= MAX_NOTE_TABS * MAX_PANE_GROUPS; index += 1) {
        const candidate = `${prefix}-${index}`;
        if (!used.has(candidate))
            return candidate;
    }
    return `${prefix}-${Date.now().toString(36)}`.slice(0, MAX_ID_LENGTH);
}
function normalizeVault(value) {
    if (!isRecord(value) || !isSafeId(value.id))
        return null;
    const generation = boundedRevision(value.generation);
    return { id: value.id, generation };
}
function parseTab(value, ids) {
    if (!isRecord(value) || !isSafeId(value.id) || ids.has(value.id) || !isSafeVaultRelativePath(value.path))
        return null;
    const mode = isEditorMode(value.mode) ? value.mode : DEFAULT_MODE;
    const lastEditingMode = isEditingMode(value.lastEditingMode)
        ? value.lastEditingMode
        : mode === 'reading' ? DEFAULT_EDITING_MODE : mode;
    const revision = boundedRevision(value.revision);
    const savedRevision = Math.min(boundedRevision(value.savedRevision), revision);
    ids.add(value.id);
    return makeTab({
        id: value.id,
        path: value.path,
        pinned: value.pinned === true,
        mode,
        lastEditingMode,
        revision,
        savedRevision,
    });
}
function parseGroup(value, groupIds, tabIds) {
    if (!isRecord(value) || !isSafeId(value.id) || groupIds.has(value.id) || !Array.isArray(value.tabs))
        return null;
    groupIds.add(value.id);
    const tabs = [];
    const paths = new Set();
    for (const item of value.tabs.slice(0, MAX_NOTE_TABS)) {
        const tab = parseTab(item, tabIds);
        if (tab === null || paths.has(tab.path))
            continue;
        paths.add(tab.path);
        tabs.push(tab);
    }
    const requestedActive = typeof value.activeTabId === 'string' ? value.activeTabId : null;
    const activeTabId = tabs.some(tab => tab.id === requestedActive)
        ? requestedActive
        : tabs[0]?.id ?? null;
    return { id: value.id, activeTabId, tabs };
}
export function createWorkbenchSession(routeId, vault = null, initialGroupId = 'group-1') {
    const safeRouteId = boundedString(routeId, MAX_ROUTE_ID_LENGTH) ? routeId : 'tocktutor';
    const groupId = isSafeId(initialGroupId) ? initialGroupId : 'group-1';
    return {
        routeId: safeRouteId,
        vault: vault === null ? null : { ...vault },
        focusedGroupId: groupId,
        groups: [{ id: groupId, activeTabId: null, tabs: [] }],
        editorRevision: 0,
    };
}
export function hydrateWorkbenchSession(value) {
    if (!isRecord(value))
        return createWorkbenchSession('tocktutor');
    const routeId = boundedString(value.routeId, MAX_ROUTE_ID_LENGTH) ? value.routeId : 'tocktutor';
    const vault = normalizeVault(value.vault);
    const groups = [];
    const groupIds = new Set();
    const tabIds = new Set();
    if (Array.isArray(value.groups)) {
        for (const item of value.groups.slice(0, MAX_PANE_GROUPS)) {
            const group = parseGroup(item, groupIds, tabIds);
            if (group !== null)
                groups.push(group);
        }
    }
    if (groups.length === 0)
        groups.push({ id: 'group-1', activeTabId: null, tabs: [] });
    const requestedFocus = typeof value.focusedGroupId === 'string' ? value.focusedGroupId : '';
    const focusedGroupId = groups.some(group => group.id === requestedFocus)
        ? requestedFocus
        : groups[0].id;
    return {
        routeId,
        vault,
        focusedGroupId,
        groups,
        editorRevision: boundedRevision(value.editorRevision),
    };
}
export function addPaneGroup(source, requestedId) {
    const session = cloneSession(source);
    if (session.groups.length >= MAX_PANE_GROUPS)
        return { session, groupId: session.focusedGroupId };
    const used = new Set(session.groups.map(group => group.id));
    const groupId = requestedId !== undefined && isSafeId(requestedId) && !used.has(requestedId)
        ? requestedId
        : nextId('group', used);
    session.groups.push({ id: groupId, activeTabId: null, tabs: [] });
    session.focusedGroupId = groupId;
    return { session, groupId };
}
function groupOf(session, groupId) {
    return session.groups.find(group => group.id === groupId);
}
export function openNoteTab(source, groupId, path, options = {}) {
    if (!isSafeVaultRelativePath(path))
        return cloneSession(source);
    const session = cloneSession(source);
    const group = groupOf(session, groupId);
    if (group === undefined)
        return session;
    session.focusedGroupId = groupId;
    const existing = group.tabs.find(tab => tab.path === path);
    if (existing !== undefined) {
        group.activeTabId = existing.id;
        return session;
    }
    const mode = isEditorMode(options.mode) ? options.mode : DEFAULT_MODE;
    const lastEditingMode = isEditingMode(options.lastEditingMode)
        ? options.lastEditingMode
        : mode === 'reading' ? DEFAULT_EDITING_MODE : mode;
    const activeIndex = options.replaceActive === true
        ? group.tabs.findIndex(tab => tab.id === group.activeTabId && !tab.pinned)
        : -1;
    const ids = new Set(session.groups.flatMap(candidate => candidate.tabs.map(tab => tab.id)));
    const tab = makeTab({
        id: activeIndex < 0 ? nextId('tab', ids) : group.tabs[activeIndex].id,
        path,
        pinned: options.pinned === true,
        mode,
        lastEditingMode,
        revision: 0,
        savedRevision: 0,
    });
    if (activeIndex < 0) {
        if (group.tabs.length >= MAX_NOTE_TABS)
            return session;
        group.tabs.push(tab);
    }
    else {
        group.tabs[activeIndex] = tab;
    }
    group.activeTabId = tab.id;
    return session;
}
export function markTabDirty(source, groupId, path, dirty) {
    const session = cloneSession(source);
    const group = groupOf(session, groupId);
    const tab = group?.tabs.find(candidate => candidate.path === path);
    if (tab === undefined)
        return session;
    if (dirty) {
        session.editorRevision += 1;
        tab.revision = Math.max(tab.revision + 1, session.editorRevision);
    }
    else {
        tab.savedRevision = tab.revision;
    }
    return session;
}
export function captureOperation(session, groupId, path) {
    const group = groupOf(session, groupId);
    const tab = group?.tabs.find(candidate => candidate.path === path);
    if (group === undefined || tab === undefined || session.vault === null)
        return null;
    return {
        routeId: session.routeId,
        vaultId: session.vault.id,
        vaultGeneration: session.vault.generation,
        groupId,
        tabId: tab.id,
        path: tab.path,
        editorRevision: session.editorRevision,
        tabRevision: tab.revision,
    };
}
export function isCurrentOperation(session, identity) {
    if (identity === null || session.routeId !== identity.routeId || session.vault === null)
        return false;
    if (session.vault.id !== identity.vaultId || session.vault.generation !== identity.vaultGeneration)
        return false;
    if (session.focusedGroupId !== identity.groupId || session.editorRevision !== identity.editorRevision)
        return false;
    const group = groupOf(session, identity.groupId);
    const tab = group?.tabs.find(candidate => candidate.id === identity.tabId);
    return group?.activeTabId === identity.tabId
        && tab?.path === identity.path
        && tab.revision === identity.tabRevision;
}
export function setActiveNoteTab(source, groupId, path) {
    const session = cloneSession(source);
    const group = groupOf(session, groupId);
    if (group === undefined)
        return session;
    group.activeTabId = path === null
        ? null
        : group.tabs.find(tab => tab.path === path)?.id ?? group.activeTabId;
    return session;
}
export function focusPaneGroup(source, groupId) {
    const session = cloneSession(source);
    if (groupOf(session, groupId) !== undefined)
        session.focusedGroupId = groupId;
    return session;
}
export function setNoteTabMode(source, groupId, path, mode) {
    const session = cloneSession(source);
    const tab = groupOf(session, groupId)?.tabs.find(candidate => candidate.path === path);
    if (tab === undefined || !isEditorMode(mode))
        return session;
    tab.mode = mode;
    if (mode !== 'reading')
        tab.lastEditingMode = mode;
    return session;
}
export function setTabPinned(source, groupId, path, pinned) {
    const session = cloneSession(source);
    const tab = groupOf(session, groupId)?.tabs.find(candidate => candidate.path === path);
    if (tab !== undefined)
        tab.pinned = pinned ?? !tab.pinned;
    return session;
}
export function moveNoteTab(source, groupId, path, direction) {
    const session = cloneSession(source);
    const tabs = groupOf(session, groupId)?.tabs;
    if (tabs === undefined)
        return session;
    const index = tabs.findIndex(tab => tab.path === path);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= tabs.length)
        return session;
    const [tab] = tabs.splice(index, 1);
    if (tab !== undefined)
        tabs.splice(destination, 0, tab);
    return session;
}
export function closeNoteTab(source, groupId, path) {
    const session = cloneSession(source);
    const group = groupOf(session, groupId);
    if (group === undefined)
        return { closed: null, nextPath: null, session };
    const index = group.tabs.findIndex(tab => tab.path === path);
    if (index < 0)
        return { closed: null, nextPath: group.tabs.find(tab => tab.id === group.activeTabId)?.path ?? null, session };
    const [closed] = group.tabs.splice(index, 1);
    if (closed === undefined)
        return { closed: null, nextPath: null, session };
    if (group.activeTabId === closed.id) {
        const next = group.tabs[index] ?? group.tabs[index - 1];
        group.activeTabId = next?.id ?? null;
    }
    return {
        closed,
        nextPath: group.tabs.find(tab => tab.id === group.activeTabId)?.path ?? null,
        session,
    };
}
export function createDirtySaveGate(currentTab, save) {
    let pending;
    return () => {
        if (pending !== undefined)
            return pending;
        const tab = currentTab();
        if (tab === undefined || !tab.dirty)
            return Promise.resolve({ allowed: true });
        const captured = cloneTab(tab);
        const flight = Promise.resolve()
            .then(() => save(captured))
            .then((result) => {
            if (result === 'saved' || result === 'clean')
                return { allowed: true };
            return { allowed: false, reason: result === 'conflict' ? 'conflict' : 'failed' };
        })
            .catch(() => ({ allowed: false, reason: 'failed' }))
            .finally(() => { pending = undefined; });
        pending = flight;
        return flight;
    };
}
//# sourceMappingURL=session.js.map