import type { ReactNode } from 'react';
import type { VaultReference } from './types.ts';
/** Ordered UI seat for optional Desktop-native actions owned by the Workbench route. */
export declare const TOCKTUTOR_NATIVE_ACTIONS_SLOT = "tockteam.tocktutor.workbench.native-actions";
/** Ordered UI seat for vault-management actions supplied by the active surface. */
export declare const TOCKTUTOR_VAULT_ACTIONS_SLOT = "tockteam.tocktutor.workbench.vault-actions";
export type TockTutorProtocolRequest = {
    action: 'open' | 'new' | 'daily' | 'unique' | 'search' | 'choose-vault';
    /** Legacy Host-only selector; browser bridge requests use vaultId/vaultGeneration. */
    vault?: string;
    vaultId?: string;
    vaultGeneration?: number;
    file?: string;
    name?: string;
    content?: string;
    query?: string;
    clipboard?: true;
    ifExists?: 'prepend' | 'append' | 'overwrite';
    silent?: true;
    paneType?: 'tab' | 'split' | 'window';
    xSuccess?: string;
    xError?: string;
};
export type TockTutorNativeActionsDispatchEvent = {
    action: 'new' | 'daily' | 'capture' | 'search';
    kind: 'quick-action';
    operationId: string;
} | {
    kind: 'protocol';
    operationId: string;
    request: TockTutorProtocolRequest;
};
export type TockTutorNativeActionsDispatchResult = 'handled' | 'failed' | 'stale';
/** UI callbacks only; the Desktop contribution retains all native authority. */
export interface TockTutorNativeNoteActions {
    activePath: string | null;
    disabled: boolean;
    message: string;
    run(action: 'open-default' | 'copy-absolute' | 'open-window' | 'export-pdf' | 'reveal'): void;
    vault: VaultReference | null;
}
/** Bounded route identity shared with Desktop-native action contributions. */
export interface TockTutorNativeActionsOwnerProps {
    activePath: string | null;
    handleDispatch(event: TockTutorNativeActionsDispatchEvent): Promise<TockTutorNativeActionsDispatchResult>;
    publishNoteActions?(actions: TockTutorNativeNoteActions | null): void;
    saveCurrent?(): Promise<boolean>;
    /** Save only the owning note for note-local native actions. */
    saveNote?(): Promise<boolean>;
    /** Cancels a pending note action if its authored draft changes. */
    noteSource?: string;
    noteOwnerKey?: string;
    storeAudio?(fileName: string, dataBase64: string): Promise<boolean>;
    vault: VaultReference | null;
}
export interface TockTutorVaultMenuItem {
    destructive?: boolean;
    disabled?: boolean;
    icon?: 'move' | 'remove' | 'rename' | 'reveal';
    label: string;
    live?: boolean;
    select(): void;
    separatorBefore?: boolean;
}
export interface TockTutorVaultActionsOwnerProps {
    beginRename(rename: (name: string, signal: AbortSignal) => Promise<boolean>): void;
    close(): void;
    closeMenu(): void;
    placement: 'actions' | 'menu';
    renderMenuItem(item: TockTutorVaultMenuItem): ReactNode;
    saveCurrent?(): Promise<boolean>;
    vault: VaultReference | null;
    vaultName: string | null;
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'tockteam.tocktutor.workbench.native-actions': {
            kind: 'list';
            scope: 'root';
            owner: TockTutorNativeActionsOwnerProps;
        };
        'tockteam.tocktutor.workbench.vault-actions': {
            kind: 'list';
            scope: 'root';
            owner: TockTutorVaultActionsOwnerProps;
        };
    }
}
//# sourceMappingURL=native-actions.d.ts.map