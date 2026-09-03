import { type ReactNode } from 'react';
import type { RecentVaultInfo, VaultReference } from './types.ts';
export interface WorkbenchVaultDialogProps {
    onActivateRecentVault?: ((id: string) => void) | undefined;
    onCreateManagedVault?: ((name: string) => void) | undefined;
    onRemoveRecentVault?: ((id: string) => void) | undefined;
    recentVaults: readonly RecentVaultInfo[];
    vault: VaultReference | null;
}
export declare function WorkbenchVaultDialog(props: WorkbenchVaultDialogProps): ReactNode;
//# sourceMappingURL=vault-dialog.d.ts.map