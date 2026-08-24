import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { TockTeamDesktopCaller, TockTeamDesktopPickerService } from '@tockteam/desktop/host';
import { type BackupPlanView, type BackupPrepareRequest, type BackupPublishResult, type CommitResult, type InspectRequest, type ReviewBindingRequest, type ReviewCancellationRequest, type ReviewPlanView } from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        tockTeamDesktopCaller: TockTeamDesktopCaller;
        tockTeamDesktopPicker: TockTeamDesktopPickerService;
    }
}
export declare const name = "@tockteam/tocktutor-import-export";
export declare const inject: string[];
/** Host-only reviewed operation gateway. Native grants never cross a Remote method. */
export declare class TockTutorImportExportGateway extends TypertRemoteService {
    private readonly backups;
    private readonly caller;
    private readonly imports;
    private readonly runtime;
    constructor(ctx: Context);
    inspect(request: InspectRequest, signal: AbortSignal): Promise<ReviewPlanView>;
    abandonImport(request: InspectRequest, signal: AbortSignal): Promise<{
        status: 'cancelled';
    }>;
    approveImport(request: ReviewBindingRequest): Promise<{
        status: 'approved';
    }>;
    commitImport(request: ReviewBindingRequest, signal: AbortSignal): Promise<CommitResult>;
    cancelImport(request: ReviewCancellationRequest): Promise<{
        status: 'cancelled';
    }>;
    prepareBackup(request: BackupPrepareRequest, signal: AbortSignal): Promise<BackupPlanView>;
    abandonBackup(request: BackupPrepareRequest, signal: AbortSignal): Promise<{
        status: 'cancelled';
    }>;
    approveBackup(request: ReviewBindingRequest): Promise<{
        status: 'approved';
    }>;
    commitBackup(request: ReviewBindingRequest, signal: AbortSignal): Promise<BackupPublishResult>;
    cancelBackup(request: ReviewCancellationRequest): Promise<{
        status: 'cancelled';
    }>;
    private claim;
}
export declare function apply(ctx: Context): void;
export * from './archive.ts';
export * from './backup.ts';
export * from './backup-engine.ts';
export * from './core.ts';
export * from './engine.ts';
export * from './types.ts';
//# sourceMappingURL=index.d.ts.map