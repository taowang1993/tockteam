import { type ReactNode } from 'react';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { TockTutorDesktopCallerBridge, TockTutorDesktopDispatchEvent } from '@tockteam/desktop/client';
import type { TockTutorNativeActionsOwnerProps, VaultReference } from '@tockteam/tocktutor-workbench/client';
import type { NativeActionResult } from './types.ts';
export type DesktopDispatchDelivery = TockTutorDesktopDispatchEvent;
export type DesktopCallerBridge = TockTutorDesktopCallerBridge;
export interface DesktopActionRemote {
    tocktutorDesktop: {
        activateVault(authorization: string, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        closeAllPopOuts(authorization: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        closePopOut(authorization: string, path: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        exportNote(authorization: string, format: 'html' | 'pdf', path: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        openPopOut(authorization: string, path: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        printNote(authorization: string, path: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        requestMicrophone(authorization: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        revealEntry(authorization: string, path: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
    };
}
export interface DesktopDispatchLoopOptions {
    active?: () => boolean;
    bridge: DesktopCallerBridge;
    owner: () => TockTutorNativeActionsOwnerProps | undefined;
    remote: DesktopActionRemote;
    signal?: AbortSignal;
}
export interface AudioMediaDevices {
    getUserMedia(constraints: {
        audio: true;
        video: false;
    }): Promise<{
        getTracks(): Array<{
            stop(): void;
        }>;
    }>;
}
/** Complete permission only while the initiating note and vault remain current. */
export declare function requestMicrophoneAccess(authorization: string, path: string, vault: VaultReference, current: () => Pick<TockTutorNativeActionsOwnerProps, 'activePath' | 'vault'>, request: (authorization: string, vault: VaultReference) => Promise<RemoteResult<NativeActionResult>>, mediaDevices: AudioMediaDevices): Promise<RemoteResult<NativeActionResult>>;
/** Consume the trusted-main dispatch facade until Desktop closes the consumer. */
export declare function runDesktopDispatchLoop(options: DesktopDispatchLoopOptions): Promise<void>;
export declare function replaceActionController(current?: AbortController, reset?: () => void): AbortController;
export type TockTutorNativeActionsProps = TockTutorNativeActionsOwnerProps & {
    bridge: DesktopCallerBridge;
    remote: DesktopActionRemote;
};
/** Accessible contribution for Workbench's root-scoped Native Actions seat. */
export declare function TockTutorNativeActions(props: TockTutorNativeActionsProps): ReactNode;
//# sourceMappingURL=client-actions.d.ts.map