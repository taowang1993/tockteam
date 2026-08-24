export const MAX_PANE_GROUPS = 8
export const MAX_NOTE_TABS = 20
export const MAX_ID_LENGTH = 128
export const MAX_VAULT_PATH_LENGTH = 4_096
export const MAX_ROUTE_ID_LENGTH = 128

export type EditorMode = 'reading' | 'wysiwyg' | 'source'
export type EditingMode = Exclude<EditorMode, 'reading'>

export interface VaultIdentity {
  id: string
  generation: number
}

export interface NoteTab {
  id: string
  path: string
  pinned: boolean
  mode: EditorMode
  lastEditingMode: EditingMode
  revision: number
  savedRevision: number
  readonly dirty: boolean
}

export interface PaneGroup {
  id: string
  activeTabId: string | null
  tabs: NoteTab[]
}

export interface WorkbenchSession {
  routeId: string
  vault: VaultIdentity | null
  focusedGroupId: string
  groups: PaneGroup[]
  editorRevision: number
}

export interface OperationIdentity {
  routeId: string
  vaultId: string | null
  vaultGeneration: number | null
  groupId: string
  tabId: string
  path: string
  editorRevision: number
  tabRevision: number
}

export type SaveResult = 'saved' | 'clean' | 'conflict' | 'failed'
export type SaveGateDecision =
  | { allowed: true }
  | { allowed: false; reason: 'conflict' | 'failed' }

const DEFAULT_MODE: EditorMode = 'wysiwyg'
const DEFAULT_EDITING_MODE: EditingMode = 'wysiwyg'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function isSafeId(value: unknown): value is string {
  return boundedString(value, MAX_ID_LENGTH) && !/[\0\r\n]/u.test(value)
}

export function isSafeVaultRelativePath(value: unknown): value is string {
  if (!boundedString(value, MAX_VAULT_PATH_LENGTH)) return false
  if (value.startsWith('/') || value.startsWith('\\') || value.includes('\\') || value.includes('\0')) return false
  if (/^[A-Za-z][A-Za-z\d+.-]*:/u.test(value)) return false
  return value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

function isEditorMode(value: unknown): value is EditorMode {
  return value === 'reading' || value === 'wysiwyg' || value === 'source'
}

function isEditingMode(value: unknown): value is EditingMode {
  return value === 'wysiwyg' || value === 'source'
}

function boundedRevision(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0
}

function tabDirty(revision: number, savedRevision: number): boolean {
  return revision !== savedRevision
}

function makeTab(input: {
  id: string
  path: string
  pinned: boolean
  mode: EditorMode
  lastEditingMode: EditingMode
  revision: number
  savedRevision: number
}): NoteTab {
  return {
    ...input,
    get dirty() {
      return tabDirty(this.revision, this.savedRevision)
    },
  }
}

function cloneTab(tab: NoteTab): NoteTab {
  return makeTab({
    id: tab.id,
    path: tab.path,
    pinned: tab.pinned,
    mode: tab.mode,
    lastEditingMode: tab.lastEditingMode,
    revision: tab.revision,
    savedRevision: tab.savedRevision,
  })
}

function cloneGroup(group: PaneGroup): PaneGroup {
  return {
    id: group.id,
    activeTabId: group.activeTabId,
    tabs: group.tabs.map(cloneTab),
  }
}

function cloneSession(session: WorkbenchSession): WorkbenchSession {
  return {
    routeId: session.routeId,
    vault: session.vault === null ? null : { ...session.vault },
    focusedGroupId: session.focusedGroupId,
    groups: session.groups.map(cloneGroup),
    editorRevision: session.editorRevision,
  }
}

function nextId(prefix: string, used: ReadonlySet<string>): string {
  for (let index = 1; index <= MAX_NOTE_TABS * MAX_PANE_GROUPS; index += 1) {
    const candidate = `${prefix}-${index}`
    if (!used.has(candidate)) return candidate
  }
  return `${prefix}-${Date.now().toString(36)}`.slice(0, MAX_ID_LENGTH)
}

function normalizeVault(value: unknown): VaultIdentity | null {
  if (!isRecord(value) || !isSafeId(value.id)) return null
  const generation = boundedRevision(value.generation)
  return { id: value.id, generation }
}

function parseTab(value: unknown, ids: Set<string>): NoteTab | null {
  if (!isRecord(value) || !isSafeId(value.id) || ids.has(value.id) || !isSafeVaultRelativePath(value.path)) return null
  const mode = isEditorMode(value.mode) ? value.mode : DEFAULT_MODE
  const lastEditingMode = isEditingMode(value.lastEditingMode)
    ? value.lastEditingMode
    : mode === 'reading' ? DEFAULT_EDITING_MODE : mode
  const revision = boundedRevision(value.revision)
  const savedRevision = Math.min(boundedRevision(value.savedRevision), revision)
  ids.add(value.id)
  return makeTab({
    id: value.id,
    path: value.path,
    pinned: value.pinned === true,
    mode,
    lastEditingMode,
    revision,
    savedRevision,
  })
}

function parseGroup(value: unknown, groupIds: Set<string>, tabIds: Set<string>): PaneGroup | null {
  if (!isRecord(value) || !isSafeId(value.id) || groupIds.has(value.id) || !Array.isArray(value.tabs)) return null
  groupIds.add(value.id)
  const tabs: NoteTab[] = []
  const paths = new Set<string>()
  for (const item of value.tabs.slice(0, MAX_NOTE_TABS)) {
    const tab = parseTab(item, tabIds)
    if (tab === null || paths.has(tab.path)) continue
    paths.add(tab.path)
    tabs.push(tab)
  }
  const requestedActive = typeof value.activeTabId === 'string' ? value.activeTabId : null
  const activeTabId = tabs.some(tab => tab.id === requestedActive)
    ? requestedActive
    : tabs[0]?.id ?? null
  return { id: value.id, activeTabId, tabs }
}

export function createWorkbenchSession(routeId: string, vault: VaultIdentity | null = null): WorkbenchSession {
  const safeRouteId = boundedString(routeId, MAX_ROUTE_ID_LENGTH) ? routeId : 'tocktutor'
  return {
    routeId: safeRouteId,
    vault: vault === null ? null : { ...vault },
    focusedGroupId: 'group-1',
    groups: [{ id: 'group-1', activeTabId: null, tabs: [] }],
    editorRevision: 0,
  }
}

export function hydrateWorkbenchSession(value: unknown): WorkbenchSession {
  if (!isRecord(value)) return createWorkbenchSession('tocktutor')
  const routeId = boundedString(value.routeId, MAX_ROUTE_ID_LENGTH) ? value.routeId : 'tocktutor'
  const vault = normalizeVault(value.vault)
  const groups: PaneGroup[] = []
  const groupIds = new Set<string>()
  const tabIds = new Set<string>()
  if (Array.isArray(value.groups)) {
    for (const item of value.groups.slice(0, MAX_PANE_GROUPS)) {
      const group = parseGroup(item, groupIds, tabIds)
      if (group !== null) groups.push(group)
    }
  }
  if (groups.length === 0) groups.push({ id: 'group-1', activeTabId: null, tabs: [] })
  const requestedFocus = typeof value.focusedGroupId === 'string' ? value.focusedGroupId : ''
  const focusedGroupId = groups.some(group => group.id === requestedFocus)
    ? requestedFocus
    : groups[0]!.id
  return {
    routeId,
    vault,
    focusedGroupId,
    groups,
    editorRevision: boundedRevision(value.editorRevision),
  }
}

export function addPaneGroup(
  source: WorkbenchSession,
  requestedId?: string,
): { session: WorkbenchSession; groupId: string } {
  const session = cloneSession(source)
  if (session.groups.length >= MAX_PANE_GROUPS) return { session, groupId: session.focusedGroupId }
  const used = new Set(session.groups.map(group => group.id))
  const groupId = requestedId !== undefined && isSafeId(requestedId) && !used.has(requestedId)
    ? requestedId
    : nextId('group', used)
  session.groups.push({ id: groupId, activeTabId: null, tabs: [] })
  session.focusedGroupId = groupId
  return { session, groupId }
}

function groupOf(session: WorkbenchSession, groupId: string): PaneGroup | undefined {
  return session.groups.find(group => group.id === groupId)
}

export function openNoteTab(
  source: WorkbenchSession,
  groupId: string,
  path: string,
  options: Partial<Pick<NoteTab, 'pinned' | 'mode' | 'lastEditingMode'>> = {},
): WorkbenchSession {
  if (!isSafeVaultRelativePath(path)) return cloneSession(source)
  const session = cloneSession(source)
  const group = groupOf(session, groupId)
  if (group === undefined) return session
  session.focusedGroupId = groupId
  const existing = group.tabs.find(tab => tab.path === path)
  if (existing !== undefined) {
    group.activeTabId = existing.id
    return session
  }
  if (group.tabs.length >= MAX_NOTE_TABS) return session
  const ids = new Set(session.groups.flatMap(candidate => candidate.tabs.map(tab => tab.id)))
  const mode = isEditorMode(options.mode) ? options.mode : DEFAULT_MODE
  const lastEditingMode = isEditingMode(options.lastEditingMode)
    ? options.lastEditingMode
    : mode === 'reading' ? DEFAULT_EDITING_MODE : mode
  const tab = makeTab({
    id: nextId('tab', ids),
    path,
    pinned: options.pinned === true,
    mode,
    lastEditingMode,
    revision: 0,
    savedRevision: 0,
  })
  group.tabs.push(tab)
  group.activeTabId = tab.id
  return session
}

export function markTabDirty(
  source: WorkbenchSession,
  groupId: string,
  path: string,
  dirty: boolean,
): WorkbenchSession {
  const session = cloneSession(source)
  const group = groupOf(session, groupId)
  const tab = group?.tabs.find(candidate => candidate.path === path)
  if (tab === undefined) return session
  if (dirty) {
    session.editorRevision += 1
    tab.revision = Math.max(tab.revision + 1, session.editorRevision)
  } else {
    tab.savedRevision = tab.revision
  }
  return session
}

export function captureOperation(
  session: WorkbenchSession,
  groupId: string,
  path: string,
): OperationIdentity | null {
  const group = groupOf(session, groupId)
  const tab = group?.tabs.find(candidate => candidate.path === path)
  if (group === undefined || tab === undefined || session.vault === null) return null
  return {
    routeId: session.routeId,
    vaultId: session.vault.id,
    vaultGeneration: session.vault.generation,
    groupId,
    tabId: tab.id,
    path: tab.path,
    editorRevision: session.editorRevision,
    tabRevision: tab.revision,
  }
}

export function isCurrentOperation(
  session: WorkbenchSession,
  identity: OperationIdentity | null,
): boolean {
  if (identity === null || session.routeId !== identity.routeId || session.vault === null) return false
  if (session.vault.id !== identity.vaultId || session.vault.generation !== identity.vaultGeneration) return false
  if (session.focusedGroupId !== identity.groupId || session.editorRevision !== identity.editorRevision) return false
  const group = groupOf(session, identity.groupId)
  const tab = group?.tabs.find(candidate => candidate.id === identity.tabId)
  return group?.activeTabId === identity.tabId
    && tab?.path === identity.path
    && tab.revision === identity.tabRevision
}

export function createDirtySaveGate(
  currentTab: () => NoteTab | undefined,
  save: (tab: NoteTab) => Promise<SaveResult>,
): () => Promise<SaveGateDecision> {
  let pending: Promise<SaveGateDecision> | undefined
  return () => {
    if (pending !== undefined) return pending
    const tab = currentTab()
    if (tab === undefined || !tab.dirty) return Promise.resolve({ allowed: true })
    const captured = cloneTab(tab)
    const flight: Promise<SaveGateDecision> = Promise.resolve()
      .then(() => save(captured))
      .then((result): SaveGateDecision => {
        if (result === 'saved' || result === 'clean') return { allowed: true }
        return { allowed: false, reason: result === 'conflict' ? 'conflict' : 'failed' }
      })
      .catch((): SaveGateDecision => ({ allowed: false, reason: 'failed' }))
      .finally(() => { pending = undefined })
    pending = flight
    return flight
  }
}
