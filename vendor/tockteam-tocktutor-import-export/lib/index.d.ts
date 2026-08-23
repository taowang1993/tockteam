import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { TockTeamDesktopPickerService } from '@tockteam/desktop/host';
import type { BackupPlanView, BackupPublishResult, BrowserOperationIdentity, CommitResult, InspectRequest, ReviewBindingRequest, ReviewPlanView } from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        tockTeamDesktopPicker: TockTeamDesktopPickerService;
    }
}
export declare const name = "@tockteam/tocktutor-import-export";
export declare const inject: string[];
/** Host-only reviewed operation gateway. Native grants never cross a Remote method. */
export declare class TockTutorImportExportGateway extends TypertRemoteService {
    private readonly backups;
    private readonly imports;
    constructor(ctx: Context);
    inspect(request: InspectRequest, signal: AbortSignal): Promise<ReviewPlanView>;
    approveImport(request: ReviewBindingRequest): Promise<{
        status: 'approved';
    }>;
    commitImport(request: ReviewBindingRequest, signal: AbortSignal): Promise<CommitResult>;
    cancelImport(operationId: string, sessionId: string): Promise<{
        status: 'cancelled';
    }>;
    prepareBackup(identity: BrowserOperationIdentity, signal: AbortSignal): Promise<BackupPlanView>;
    approveBackup(request: ReviewBindingRequest): Promise<{
        status: 'approved';
    }>;
    commitBackup(request: ReviewBindingRequest, signal: AbortSignal): Promise<BackupPublishResult>;
    cancelBackup(operationId: string, sessionId: string): Promise<{
        status: 'cancelled';
    }>;
}
export declare function apply(ctx: Context): void;
export * from './archive.ts';
export * from './backup.ts';
export * from './backup-engine.ts';
export * from './core.ts';
export * from './engine.ts';
export * from './types.ts';
//# sourceMappingURL=index.d.ts.map