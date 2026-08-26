export declare const MAX_PANE_GROUPS = 8;
export declare const MAX_NOTE_TABS = 20;
export declare const MAX_ID_LENGTH = 128;
export declare const MAX_VAULT_PATH_LENGTH = 4096;
export declare const MAX_ROUTE_ID_LENGTH = 128;
export type EditorMode = 'reading' | 'wysiwyg' | 'source';
export type EditingMode = Exclude<EditorMode, 'reading'>;
export interface VaultIdentity {
    id: string;
    generation: number;
}
export interface NoteTab {
    id: string;
    path: string;
    pinned: boolean;
    mode: EditorMode;
    lastEditingMode: EditingMode;
    revision: number;
    savedRevision: number;
    readonly dirty: boolean;
}
export interface PaneGroup {
    id: string;
    activeTabId: string | null;
    tabs: NoteTab[];
}
export interface WorkbenchSession {
    routeId: string;
    vault: VaultIdentity | null;
    focusedGroupId: string;
    groups: PaneGroup[];
    editorRevision: number;
}
export interface OperationIdentity {
    routeId: string;
    vaultId: string | null;
    vaultGeneration: number | null;
    groupId: string;
    tabId: string;
    path: string;
    editorRevision: number;
    tabRevision: number;
}
export type SaveResult = 'saved' | 'clean' | 'conflict' | 'failed';
export type SaveGateDecision = {
    allowed: true;
} | {
    allowed: false;
    reason: 'conflict' | 'failed';
};
export declare function isSafeVaultRelativePath(value: unknown): value is string;
export declare function createWorkbenchSession(routeId: string, vault?: VaultIdentity | null, initialGroupId?: string): WorkbenchSession;
export declare function hydrateWorkbenchSession(value: unknown): WorkbenchSession;
export declare function addPaneGroup(source: WorkbenchSession, requestedId?: string): {
    session: WorkbenchSession;
    groupId: string;
};
export declare function openNoteTab(source: WorkbenchSession, groupId: string, path: string, options?: Partial<Pick<NoteTab, 'pinned' | 'mode' | 'lastEditingMode'>>): WorkbenchSession;
export declare function markTabDirty(source: WorkbenchSession, groupId: string, path: string, dirty: boolean): WorkbenchSession;
export declare function captureOperation(session: WorkbenchSession, groupId: string, path: string): OperationIdentity | null;
export declare function isCurrentOperation(session: WorkbenchSession, identity: OperationIdentity | null): boolean;
export declare function setActiveNoteTab(source: WorkbenchSession, groupId: string, path: string | null): WorkbenchSession;
export declare function focusPaneGroup(source: WorkbenchSession, groupId: string): WorkbenchSession;
export declare function setNoteTabMode(source: WorkbenchSession, groupId: string, path: string, mode: EditorMode): WorkbenchSession;
export declare function setTabPinned(source: WorkbenchSession, groupId: string, path: string, pinned?: boolean): WorkbenchSession;
export declare function moveNoteTab(source: WorkbenchSession, groupId: string, path: string, direction: -1 | 1): WorkbenchSession;
export interface CloseNoteTabResult {
    closed: NoteTab | null;
    nextPath: string | null;
    session: WorkbenchSession;
}
export declare function closeNoteTab(source: WorkbenchSession, groupId: string, path: string): CloseNoteTabResult;
export declare function createDirtySaveGate(currentTab: () => NoteTab | undefined, save: (tab: NoteTab) => Promise<SaveResult>): () => Promise<SaveGateDecision>;
//# sourceMappingURL=session.d.ts.map