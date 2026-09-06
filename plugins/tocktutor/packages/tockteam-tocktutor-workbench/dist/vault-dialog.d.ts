import { type ReactNode } from 'react';
import type { VaultReference } from './types.ts';
export interface WorkbenchVaultDialogProps {
    onCreateManagedVault?: ((name: string) => void) | undefined;
    renderVaultActions?: ((placement: 'actions' | 'menu', close: () => void) => ReactNode) | undefined;
    vault: VaultReference | null;
    vaultName: string | null;
}
export declare function WorkbenchVaultDialog(props: WorkbenchVaultDialogProps): ReactNode;
//# sourceMappingURL=vault-dialog.d.ts.map