export const MAX_PANE_GROUPS = 8;
export const MAX_NOTE_TABS = 20;
export const MAX_ID_LENGTH = 128;
export const MAX_VAULT_PATH_LENGTH = 4_096;
export const MAX_ROUTE_ID_LENGTH = 128;
export const LINKED_VIEW_KINDS = ['backlinks', 'outgoing-links', 'properties', 'outline', 'graph'];
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
        ...(group.linkedView ? { linkedView: { ...group.linkedView } } : {}),
        id: group.id,
        activeTabId: group.activeTabId,
        tabs: group.tabs.map(cloneTab),
    };
}
function cloneSession(session) {
    return {
        layout: normalizePaneLayout(session.layout, session.groups),
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
    const linked = value.linkedView;
    const linkedView = isRecord(linked) && LINKED_VIEW_KINDS.includes(linked.kind)
        ? { kind: linked.kind, sourceGroupId: isSafeId(linked.sourceGroupId) ? linked.sourceGroupId : null,
            sourceTabId: isSafeId(linked.sourceTabId) ? linked.sourceTabId : null,
            path: isSafeVaultRelativePath(linked.path) ? linked.path : null, pinned: linked.pinned === true } : undefined;
    // Never reinterpret an existing editor group as a linked view and discard its tabs.
    return { id: value.id, activeTabId, tabs, ...(linkedView && tabs.length === 0 ? { linkedView } : {}) };
}
export function createWorkbenchSession(routeId, vault = null, initialGroupId = 'group-1') {
    const safeRouteId = boundedString(routeId, MAX_ROUTE_ID_LENGTH) ? routeId : 'tocktutor';
    const groupId = isSafeId(initialGroupId) ? initialGroupId : 'group-1';
    return {
        layout: { groupId },
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
    return syncLinkedViews({
        layout: normalizePaneLayout(value.layout, groups),
        routeId,
        vault,
        focusedGroupId,
        groups,
        editorRevision: boundedRevision(value.editorRevision),
    });
}
export function addPaneGroup(source, requestedId) {
    const session = cloneSession(source);
    if (session.groups.length >= MAX_PANE_GROUPS)
        return { session, groupId: session.focusedGroupId };
    const used = new Set(session.groups.map(group => group.id));
    const groupId = requestedId !== undefined && isSafeId(requestedId) && !used.has(requestedId)
        ? requestedId
        : nextId('group', used);
    session.layout = { axis: 'horizontal', ratio: .5, children: [session.layout, { groupId }] };
    session.groups.push({ id: groupId, activeTabId: null, tabs: [] });
    session.focusedGroupId = groupId;
    return { session, groupId };
}
function normalizePaneLayout(value, groups) {
    const remaining = new Set(groups.map(group => group.id));
    const seen = new Set();
    const parse = (node, depth) => {
        if (!isRecord(node) || depth >= MAX_PANE_GROUPS || seen.has(node))
            return null;
        seen.add(node);
        if (typeof node.groupId === 'string') {
            if (!remaining.delete(node.groupId))
                return null;
            return { groupId: node.groupId };
        }
        if ((node.axis !== 'horizontal' && node.axis !== 'vertical') || typeof node.ratio !== 'number'
            || !Number.isFinite(node.ratio) || node.ratio < .15 || node.ratio > .85
            || !Array.isArray(node.children) || node.children.length !== 2)
            return null;
        const first = parse(node.children[0], depth + 1);
        const second = parse(node.children[1], depth + 1);
        return first && second ? { axis: node.axis, ratio: node.ratio, children: [first, second] } : null;
    };
    const parsed = parse(value, 0);
    if (parsed && remaining.size === 0)
        return parsed;
    return groups.slice(1).reduce((layout, group) => ({ axis: 'horizontal', ratio: .5, children: [layout, { groupId: group.id }] }), { groupId: groups[0].id });
}
function removeLayoutGroup(node, id) {
    if ('groupId' in node)
        return node.groupId === id ? null : node;
    const first = removeLayoutGroup(node.children[0], id);
    const second = removeLayoutGroup(node.children[1], id);
    return first && second ? { ...node, children: [first, second] } : first ?? second;
}
export function splitPaneGroup(source, owner, axis) {
    const group = source.groups.find(group => group.id === owner);
    if (!group || source.groups.length >= MAX_PANE_GROUPS)
        return { session: cloneSession(source), groupId: owner };
    const added = addPaneGroup(source);
    const replace = (node) => 'groupId' in node
        ? node.groupId === owner ? { axis, ratio: .5, children: [node, { groupId: added.groupId }] } : node
        : { ...node, children: [replace(node.children[0]), replace(node.children[1])] };
    added.session.layout = replace(source.layout);
    const tab = group.tabs.find(tab => tab.id === group.activeTabId);
    if (tab) {
        added.session = openNoteTab(added.session, added.groupId, tab.path, tab);
        const copy = added.session.groups.find(group => group.id === added.groupId)?.tabs[0];
        if (copy) {
            copy.revision = tab.revision;
            copy.savedRevision = tab.savedRevision;
        }
    }
    return added;
}
export function resizePaneSplit(source, path, ratio) {
    const session = cloneSession(source);
    if (!Number.isFinite(ratio) || path.length >= MAX_PANE_GROUPS)
        return syncLinkedViews(session);
    let node = session.layout;
    for (const index of path) {
        if ('groupId' in node || (index !== 0 && index !== 1))
            return syncLinkedViews(session);
        node = node.children[index];
    }
    if (!('groupId' in node))
        node.ratio = Math.min(.85, Math.max(.15, ratio));
    return syncLinkedViews(session);
}
export function closePaneGroup(source, groupId) {
    const session = cloneSession(source);
    if (session.groups.length <= 1)
        return { closed: null, nextGroupId: session.focusedGroupId, session };
    const index = session.groups.findIndex(group => group.id === groupId);
    if (index < 0)
        return { closed: null, nextGroupId: session.focusedGroupId, session };
    const [closed] = session.groups.splice(index, 1);
    if (closed === undefined)
        return { closed: null, nextGroupId: session.focusedGroupId, session };
    session.layout = removeLayoutGroup(session.layout, groupId);
    if (session.focusedGroupId === groupId) {
        session.focusedGroupId = session.groups[index]?.id ?? session.groups[index - 1]?.id ?? session.groups[0].id;
    }
    syncLinkedViews(session);
    return { closed, nextGroupId: session.focusedGroupId, session };
}
function groupOf(session, groupId) {
    return session.groups.find(group => group.id === groupId);
}
export function openNoteTab(source, groupId, path, options = {}) {
    if (!isSafeVaultRelativePath(path))
        return cloneSession(source);
    const session = cloneSession(source);
    const group = groupOf(session, groupId);
    if (group === undefined || group.linkedView)
        return syncLinkedViews(session);
    session.focusedGroupId = groupId;
    const existing = group.tabs.find(tab => tab.path === path);
    if (existing !== undefined) {
        group.activeTabId = existing.id;
        return syncLinkedViews(session);
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
            return syncLinkedViews(session);
        group.tabs.push(tab);
    }
    else {
        group.tabs[activeIndex] = tab;
    }
    group.activeTabId = tab.id;
    return syncLinkedViews(session);
}
export function renameNoteTabPath(source, fromPath, toPath) {
    if (!isSafeVaultRelativePath(fromPath) || !isSafeVaultRelativePath(toPath) || fromPath === toPath)
        return cloneSession(source);
    if (source.groups.some(group => group.tabs.some(tab => tab.path === toPath && tab.path !== fromPath)))
        return cloneSession(source);
    const session = cloneSession(source);
    for (const group of session.groups) {
        if (group.linkedView?.path === fromPath)
            group.linkedView.path = toPath;
        for (const tab of group.tabs) {
            if (tab.path === fromPath)
                tab.path = toPath;
        }
    }
    return syncLinkedViews(session);
}
/** Retire a merged source without duplicating an already-open destination tab. */
export function mergeNoteTabPath(source, fromPath, toPath) {
    const session = cloneSession(source);
    if (!isSafeVaultRelativePath(fromPath) || !isSafeVaultRelativePath(toPath) || fromPath === toPath)
        return session;
    const replaced = new Map();
    for (const group of session.groups) {
        const destination = group.tabs.find(tab => tab.path === toPath);
        group.tabs = group.tabs.filter(tab => {
            if (tab.path !== fromPath)
                return true;
            if (!destination) {
                tab.path = toPath;
                return true;
            }
            destination.pinned ||= tab.pinned;
            replaced.set(tab.id, destination.id);
            if (group.activeTabId === tab.id)
                group.activeTabId = destination.id;
            return false;
        });
    }
    for (const group of session.groups) {
        const linked = group.linkedView;
        if (!linked)
            continue;
        if (linked.path === fromPath)
            linked.path = toPath;
        if (linked.sourceTabId && replaced.has(linked.sourceTabId))
            linked.sourceTabId = replaced.get(linked.sourceTabId);
    }
    return syncLinkedViews(session);
}
export function markTabDirty(source, groupId, path, dirty) {
    const session = cloneSession(source);
    if (!groupOf(session, groupId)?.tabs.some(tab => tab.path === path))
        return syncLinkedViews(session);
    const tabs = session.groups.flatMap(group => group.tabs.filter(tab => tab.path === path));
    if (dirty)
        session.editorRevision += 1;
    const revision = dirty ? Math.max(session.editorRevision, ...tabs.map(tab => tab.revision + 1)) : Math.max(...tabs.map(tab => tab.revision));
    for (const tab of tabs) {
        tab.revision = revision;
        if (!dirty)
            tab.savedRevision = revision;
    }
    return syncLinkedViews(session);
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
        return syncLinkedViews(session);
    group.activeTabId = path === null
        ? null
        : group.tabs.find(tab => tab.path === path)?.id ?? group.activeTabId;
    return syncLinkedViews(session);
}
export function focusPaneGroup(source, groupId) {
    const session = cloneSession(source);
    const group = groupOf(session, groupId);
    if (group !== undefined && !group.linkedView)
        session.focusedGroupId = groupId;
    return syncLinkedViews(session);
}
export function setNoteTabMode(source, groupId, path, mode) {
    const session = cloneSession(source);
    const tab = groupOf(session, groupId)?.tabs.find(candidate => candidate.path === path);
    if (tab === undefined || !isEditorMode(mode))
        return syncLinkedViews(session);
    tab.mode = mode;
    if (mode !== 'reading')
        tab.lastEditingMode = mode;
    return syncLinkedViews(session);
}
export function setTabPinned(source, groupId, path, pinned) {
    const session = cloneSession(source);
    const tab = groupOf(session, groupId)?.tabs.find(candidate => candidate.path === path);
    if (tab !== undefined)
        tab.pinned = pinned ?? !tab.pinned;
    return syncLinkedViews(session);
}
export function moveNoteTab(source, groupId, path, direction) {
    const session = cloneSession(source);
    const tabs = groupOf(session, groupId)?.tabs;
    if (tabs === undefined)
        return syncLinkedViews(session);
    const index = tabs.findIndex(tab => tab.path === path);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= tabs.length)
        return syncLinkedViews(session);
    const [tab] = tabs.splice(index, 1);
    if (tab !== undefined)
        tabs.splice(destination, 0, tab);
    return syncLinkedViews(session);
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
    if (session.focusedGroupId === groupId && group.activeTabId === null
        && session.groups.some(candidate => candidate.linkedView?.sourceGroupId === groupId && candidate.linkedView.sourceTabId === closed.id)) {
        const remaining = session.groups.find(candidate => !candidate.linkedView && candidate.activeTabId !== null);
        if (remaining)
            session.focusedGroupId = remaining.id;
    }
    return {
        closed,
        nextPath: group.tabs.find(tab => tab.id === group.activeTabId)?.path ?? null,
        session: syncLinkedViews(session),
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
/** Normalize bindings in an owned session copy; callers must not pass user-owned state. */
export function syncLinkedViews(session) {
    const focused = session.groups.find(group => group.id === session.focusedGroupId && !group.linkedView);
    const editor = focused ?? session.groups.find(group => !group.linkedView && group.activeTabId !== null);
    if (editor)
        session.focusedGroupId = editor.id;
    const activePath = editor?.tabs.find(tab => tab.id === editor.activeTabId)?.path ?? null;
    for (const group of session.groups) {
        const linked = group.linkedView;
        if (!linked)
            continue;
        const source = session.groups.find(candidate => candidate.id === linked.sourceGroupId && !candidate.linkedView);
        const tab = source?.tabs.find(tab => tab.id === linked.sourceTabId);
        if (tab) {
            linked.path = tab.path;
            linked.pinned = tab.pinned;
        }
        else {
            linked.sourceGroupId = null;
            linked.sourceTabId = null;
            if (!linked.pinned)
                linked.path = activePath;
        }
    }
    return session;
}
export function openLinkedPane(source, owner, kind) {
    const group = source.groups.find(group => group.id === owner && !group.linkedView);
    const tab = group?.tabs.find(tab => tab.id === group.activeTabId);
    if (!tab || !LINKED_VIEW_KINDS.includes(kind) || source.groups.length >= MAX_PANE_GROUPS)
        return { session: cloneSession(source), groupId: owner };
    const added = splitPaneGroup(source, owner, kind === 'outline' || kind === 'graph' ? 'horizontal' : 'vertical');
    const target = added.session.groups.find(group => group.id === added.groupId);
    target.tabs = [];
    target.activeTabId = null;
    target.linkedView = { kind, sourceGroupId: owner, sourceTabId: tab.id, path: tab.path, pinned: tab.pinned };
    added.session.focusedGroupId = source.focusedGroupId;
    return { ...added, session: syncLinkedViews(added.session) };
}
export function unlinkPane(source, id) {
    const session = syncLinkedViews(cloneSession(source));
    const linked = session.groups.find(group => group.id === id)?.linkedView;
    if (linked) {
        linked.sourceGroupId = null;
        linked.sourceTabId = null;
    }
    return syncLinkedViews(session);
}
export function toggleLinkedPanePin(source, id) {
    const session = syncLinkedViews(cloneSession(source));
    const linked = session.groups.find(group => group.id === id)?.linkedView;
    if (!linked)
        return session;
    const tab = session.groups.find(group => group.id === linked.sourceGroupId)?.tabs.find(tab => tab.id === linked.sourceTabId);
    if (tab)
        tab.pinned = !tab.pinned;
    else
        linked.pinned = !linked.pinned;
    return syncLinkedViews(session);
}
//# sourceMappingURL=session.js.map