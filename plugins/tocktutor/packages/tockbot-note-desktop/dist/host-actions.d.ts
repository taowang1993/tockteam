import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { type TockTeamDesktopCaller, type TockTeamDesktopMicrophone, type TockTeamDesktopPickerService, type TockTeamDesktopPopOut, type TockTeamDesktopPrintExport } from '@tockteam/desktop/host';
import type { NoteVaultRuntime } from 'tockbot-note-runtime';
import type { DesktopVaultReference as VaultReference, NativeActionResult } from './types.ts';
export type { NativeActionResult } from './types.ts';
export declare const MAX_TRACKED_POPOUTS = 64;
declare module '@deepseek-ai/cordis' {
    interface Context {
        noteVault: NoteVaultRuntime;
        tockTeamDesktopCaller: TockTeamDesktopCaller;
        tockTeamDesktopMicrophone: TockTeamDesktopMicrophone;
        tockTeamDesktopPicker: TockTeamDesktopPickerService;
        tockTeamDesktopPopOut: TockTeamDesktopPopOut;
        tockTeamDesktopPrintExport: TockTeamDesktopPrintExport;
    }
}
/** Caller-bound Host gateway for the bounded TockTutor native action seat. */
export declare class TockTutorDesktopGateway extends TypertRemoteService {
    static inject: string[];
    private readonly activations;
    private readonly targetActivations;
    private readonly lifetime;
    private readonly recoveredResults;
    private readonly popOutClosures;
    private readonly popOuts;
    private readonly revealed;
    constructor(ctx: Context);
    private claimForVault;
    private recoverResult;
    private rememberResult;
    activateVault(authorization: string, signal: AbortSignal): Promise<NativeActionResult>;
    activateVaultTarget(authorization: string, target: {
        id: string;
    }, signal: AbortSignal): Promise<NativeActionResult>;
    openPopOut(authorization: string, path: string, expectedVault: VaultReference, signal: AbortSignal): Promise<NativeActionResult>;
    closePopOut(authorization: string, path: string, expectedVault: VaultReference, signal: AbortSignal): Promise<NativeActionResult>;
    closeAllPopOuts(authorization: string, expectedVault: VaultReference, signal: AbortSignal): Promise<NativeActionResult>;
    printNote(authorization: string, path: string, expectedVault: VaultReference, signal: AbortSignal): Promise<NativeActionResult>;
    exportNote(authorization: string, format: 'html' | 'pdf', path: string, expectedVault: VaultReference, signal: AbortSignal): Promise<NativeActionResult>;
    requestMicrophone(authorization: string, expectedVault: VaultReference, signal: AbortSignal): Promise<NativeActionResult>;
    revealEntry(authorization: string, path: string, expectedVault: VaultReference, signal: AbortSignal): Promise<NativeActionResult>;
}
//# sourceMappingURL=host-actions.d.ts.map