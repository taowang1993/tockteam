import { type WorkbenchSession } from './session.ts';
export declare const MAX_TOCKTUTOR_SETTINGS_BYTES = 1048576;
export declare const MAX_TOCKTUTOR_WORKSPACES = 32;
export declare const MAX_TOCKTUTOR_CSS_BYTES = 524288;
export interface KeyValueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
export interface TockTutorSettings {
    attachmentFolder: string;
    backlinksInDocument: boolean;
    defaultEditingMode: 'live-preview' | 'source';
    graphDepth: 1 | 2 | 3;
    graphIncludeAttachments: boolean;
    graphIncludeOrphans: boolean;
    graphIncludeTags: boolean;
    graphQuery: string;
    graphGroupBy: 'folder' | 'none';
    graphColorBy: 'folder' | 'none';
    journalFolder: string;
    pagePreview: boolean;
    recoveryIntervalMinutes: number;
    snapshotRetentionDays: number;
    templateFolder: string;
    webClipFolder: string;
}
export interface NamedWorkspace {
    createdAt: number;
    focusMode: boolean;
    id: string;
    name: string;
    session: WorkbenchSession;
}
export interface PersistedWorkbenchState {
    focusMode: boolean;
    session: WorkbenchSession;
    workspaces: NamedWorkspace[];
}
export declare function loadTockTutorSettings(storage: KeyValueStorage, vaultId: string): TockTutorSettings;
export declare function saveTockTutorSettings(storage: KeyValueStorage, vaultId: string, change: Partial<TockTutorSettings>): TockTutorSettings;
export declare function createNamedWorkspace(current: readonly NamedWorkspace[], name: string, session: WorkbenchSession, createdAt?: number, focusMode?: boolean): NamedWorkspace[];
export declare function loadWorkbenchState(storage: KeyValueStorage, vaultId: string): PersistedWorkbenchState;
export declare function saveWorkbenchState(storage: KeyValueStorage, vaultId: string, state: PersistedWorkbenchState): boolean;
export declare function compileTockTutorCssSnippet(id: string, source: string): string | null;
//# sourceMappingURL=settings.d.ts.map