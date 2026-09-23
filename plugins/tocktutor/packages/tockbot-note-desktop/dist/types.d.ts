import type { NativeFailureStatus } from '@tockteam/desktop/host';
export interface DesktopVaultReference {
    generation: number;
    id: string;
}
export interface NativeActionResult {
    status: NativeFailureStatus | 'activated' | 'closed' | 'copied' | 'exported' | 'focused' | 'granted' | 'moved' | 'opened' | 'printed' | 'renamed' | 'revealed';
}
//# sourceMappingURL=types.d.ts.map