import { type ReactNode } from 'react';
import type { TockTutorVaultMenuItem } from './native-actions.ts';
import type { VaultReference } from './types.ts';
export interface WorkbenchVaultDialogProps {
    onCreateManagedVault?: ((name: string) => void) | undefined;
    renderVaultActions?: ((placement: 'actions' | 'menu', close: () => void, closeMenu: () => void, beginRename: (rename: (name: string, signal: AbortSignal) => Promise<boolean>) => void, renderMenuItem: (item: TockTutorVaultMenuItem) => ReactNode) => ReactNode) | undefined;
    vault: VaultReference | null;
    vaultName: string | null;
}
export declare function WorkbenchVaultDialog(props: WorkbenchVaultDialogProps): ReactNode;
//# sourceMappingURL=vault-dialog.d.ts.map