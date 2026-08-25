import { type ReactNode } from 'react';
import type { TockTutorRouteOwnerProps } from '@tockteam/desktop/client';
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import { TOCKTUTOR_ASSISTANT_PANEL_SLOT } from './assistant-panel.ts';
import { TOCKTUTOR_NATIVE_ACTIONS_SLOT, type TockTutorNativeActionsDispatchEvent, type TockTutorNativeActionsDispatchResult } from './native-actions.ts';
import { TOCKTUTOR_REVIEW_PANEL_SLOT } from './review-panel.ts';
import { type EditorStatus } from './markdown.ts';
import { type NoteVaultEventRemote } from './vault-events.ts';
import type { ActiveVaultResult, CreateDocumentRequest, ListTreeRequest, OpenDocumentResult, SaveDocumentRequest, VaultReference, VaultTreeEntry, VaultTreePage, WriteDocumentResult } from './types.ts';
export declare const MAX_ROUTE_SOURCE_BYTES = 2000000;
export interface WorkbenchRouteRemote extends NoteVaultEventRemote {
    tocktutorWorkbench: {
        currentVault(signal?: AbortSignal): Promise<RemoteResult<ActiveVaultResult>>;
        listTree(request: ListTreeRequest, signal?: AbortSignal): Promise<RemoteResult<VaultTreePage>>;
        createDocument(request: CreateDocumentRequest, signal?: AbortSignal): Promise<RemoteResult<WriteDocumentResult>>;
        openDocument(path: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<OpenDocumentResult>>;
        saveDocument(request: SaveDocumentRequest, signal?: AbortSignal): Promise<RemoteResult<WriteDocumentResult>>;
    };
}
export type RoutePhase = 'loading' | 'inactive' | 'ready' | 'error';
export type RouteEditorMode = 'source' | 'reading';
export type RouteDocumentKind = 'markdown' | 'canvas' | 'base';
export interface RouteTabSummary {
    dirty: boolean;
    path: string;
}
export interface RoutePaneSummary {
    activePath: string | null;
    id: string;
    tabs: readonly RouteTabSummary[];
}
export interface WorkbenchRouteSnapshot {
    dispatchDialog: 'capture' | 'new' | null;
    documentKind: RouteDocumentKind | null;
    entries: readonly VaultTreeEntry[];
    focusedPaneId: string;
    message: string;
    mode: RouteEditorMode;
    path: string | null;
    phase: RoutePhase;
    revision: string | null;
    saveStatus: EditorStatus;
    searchOpen: boolean;
    searchQuery: string;
    source: string;
    panes: readonly RoutePaneSummary[];
    vault: VaultReference | null;
    warnings: readonly string[];
}
export interface NativeDispatchDraft {
    path?: string;
    text?: string;
    title?: string;
}
export declare function pathFromTockTutorLocation(pathname: string): string | null;
/** Bounded route state machine shared by the React contribution and focused tests. */
export declare class WorkbenchRouteController {
    private readonly remote;
    private readonly navigate;
    private readonly now;
    private snapshot;
    private readonly listeners;
    private operation;
    private dispatchRevision;
    private operationAbort;
    private saveAbort;
    private saving;
    private eventDispose;
    private pendingDispatch;
    private pathname;
    private started;
    private disposed;
    constructor(remote: WorkbenchRouteRemote, navigate: TockTutorRouteOwnerProps['navigate'], now?: () => Date);
    getSnapshot: () => WorkbenchRouteSnapshot;
    handleDispatch(event: TockTutorNativeActionsDispatchEvent): Promise<TockTutorNativeActionsDispatchResult>;
    private createDispatchedDocument;
    private openDispatchDialog;
    submitDispatchDialog(draft: NativeDispatchDraft): Promise<void>;
    cancelDispatchDialog(): void;
    setSearchQuery(query: string): void;
    closeSearch(): void;
    openSearch(query: string): void;
    private settlePendingDispatch;
    private dispatchCurrent;
    private invalidateDispatch;
    subscribe: (listener: () => void) => (() => void);
    private update;
    private pane;
    private replacePane;
    private recordOpen;
    private recordDirty;
    private clearDocument;
    private nextOperation;
    private current;
    syncLocation(pathname: string): Promise<void>;
    reload(): Promise<void>;
    private onVaultChange;
    private refreshTree;
    addPane(): Promise<boolean>;
    focusPane(id: string, pathOverride?: string): Promise<boolean>;
    activateTab(paneId: string, path: string): Promise<boolean>;
    select(path: string, navigate?: boolean, dispatchRevision?: number): Promise<boolean>;
    edit(source: string): void;
    setMode(mode: RouteEditorMode): void;
    toggleTask(index: number): void;
    moveCanvasNode(nodeId: string, deltaX: number, deltaY: number): void;
    save(): Promise<boolean>;
    private failureMessage;
    dispose(): void;
}
export interface TockTutorRouteViewProps {
    assistantPanel?: ReactNode;
    nativeActions?: ReactNode;
    onActivateTab(paneId: string, path: string): void;
    onCancelDispatch?(): void;
    onCloseSearch?(): void;
    onAddPane(): void;
    onEdit(source: string): void;
    onFocusPane(paneId: string): void;
    onMoveCanvas(nodeId: string, deltaX: number, deltaY: number): void;
    onMode(mode: RouteEditorMode): void;
    onNewNote?(): void;
    onOpenSearch?(): void;
    onSave(): void;
    onSearchChange?(query: string): void;
    onSelect(path: string): void;
    onSubmitDispatch?(draft: NativeDispatchDraft): void;
    onToggleTask(index: number): void;
    reviewPanel?: ReactNode;
    snapshot: WorkbenchRouteSnapshot;
    titlebarTarget?: Element;
}
/** Semantic, authority-free view for the route state machine. */
export declare function TockTutorRouteView(props: TockTutorRouteViewProps): ReactNode;
export type TockTutorRouteProps = TockTutorRouteOwnerProps & PropsRenderSlots<typeof TOCKTUTOR_ASSISTANT_PANEL_SLOT | typeof TOCKTUTOR_NATIVE_ACTIONS_SLOT | typeof TOCKTUTOR_REVIEW_PANEL_SLOT> & {
    remote: WorkbenchRouteRemote;
};
/** Root-scoped component contributed to TockTeam's exact Desktop route seat. */
export declare function TockTutorRoute(props: TockTutorRouteProps): ReactNode;
//# sourceMappingURL=route.d.ts.map