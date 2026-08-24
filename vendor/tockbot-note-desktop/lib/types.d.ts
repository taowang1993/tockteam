import type { NativeFailureStatus } from '@tockteam/desktop/host';
export interface DesktopVaultReference {
    generation: number;
    id: string;
}
export interface NativeActionResult {
    status: NativeFailureStatus | 'activated' | 'closed' | 'exported' | 'focused' | 'granted' | 'opened' | 'printed' | 'revealed';
}
//# sourceMappingURL=types.d.ts.map