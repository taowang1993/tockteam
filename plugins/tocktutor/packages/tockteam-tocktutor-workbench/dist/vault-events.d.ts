import type { NoteVaultChangeEvent, VaultReference } from './types.ts';
export type { NoteVaultChangeEvent } from './types.ts';
export interface NoteVaultEventRemote {
    $on(event: 'note-vault/change', listener: (event: NoteVaultChangeEvent) => void): () => void;
}
declare module '@deepseek-ai/cordis' {
    interface Events {
        'note-vault/change': (event: NoteVaultChangeEvent) => void;
    }
}
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteEventSelection extends Record<'note-vault/change', true> {
    }
}
export declare function isNoteVaultChangeEvent(value: unknown): value is NoteVaultChangeEvent;
/** Subscribe to current-vault runtime changes and suppress stale or malformed delivery. */
export declare function subscribeNoteVaultChanges(remote: NoteVaultEventRemote, currentVault: () => VaultReference | null, listener: (event: NoteVaultChangeEvent) => void): () => void;
//# sourceMappingURL=vault-events.d.ts.map