import { type ReactNode } from 'react';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { TockTutorDesktopCallerBridge, TockTutorDesktopDispatchEvent } from '@tockteam/desktop/client';
import type { TockTutorNativeActionsOwnerProps, TockTutorVaultActionsOwnerProps, VaultReference } from '@tockteam/tocktutor-workbench/client';
import type { NativeActionResult } from './types.ts';
export type DesktopDispatchDelivery = TockTutorDesktopDispatchEvent;
export type DesktopCallerBridge = TockTutorDesktopCallerBridge;
export interface DesktopActionRemote {
    tocktutorDesktop: {
        activateVault(authorization: string, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        activateVaultTarget(authorization: string, target: {
            id: string;
        }, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        closeAllPopOuts(authorization: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        closePopOut(authorization: string, path: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        exportNote(authorization: string, format: 'html' | 'pdf', path: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        openPopOut(authorization: string, path: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        printNote(authorization: string, path: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        requestMicrophone(authorization: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        moveVault(authorization: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        removeVault(authorization: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        renameVault(authorization: string, name: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        revealEntry(authorization: string, path: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
        revealVault(authorization: string, expectedVault: VaultReference, signal?: AbortSignal): Promise<RemoteResult<NativeActionResult>>;
    };
}
export interface DesktopDispatchLoopOptions {
    active?: () => boolean;
    bridge: DesktopCallerBridge;
    owner: () => TockTutorNativeActionsOwnerProps | undefined;
    remote: DesktopActionRemote;
    signal?: AbortSignal;
    unavailableRetryLimit?: number;
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
export interface AudioMediaRecorder {
    readonly mimeType: string;
    readonly state: string;
    addEventListener(type: 'dataavailable' | 'error' | 'stop', listener: (event?: {
        data: Blob;
    }) => void): void;
    start(): void;
    stop(): void;
}
export interface AudioRecording {
    cancel(): void;
    stop(): Promise<{
        dataBase64: string;
        fileName: string;
        status: 'recorded';
    } | {
        status: 'failed' | 'stale' | 'too-large';
    }>;
}
/** Record only after Desktop grants the exact live note, then re-check it before returning bytes. */
export declare function startAudioRecording(authorization: string, path: string, vault: VaultReference, current: () => Pick<TockTutorNativeActionsOwnerProps, 'activePath' | 'vault'>, request: (authorization: string, vault: VaultReference) => Promise<RemoteResult<NativeActionResult>>, mediaDevices: AudioMediaDevices, createRecorder: (stream: Awaited<ReturnType<AudioMediaDevices['getUserMedia']>>) => AudioMediaRecorder, now?: () => Date, readBlob?: (blob: Blob) => Promise<ArrayBuffer>): Promise<{
    result: RemoteResult<NativeActionResult>;
    status: 'not-started';
} | {
    recording: AudioRecording;
    status: 'recording';
}>;
/** Consume the trusted-main dispatch facade until Desktop closes the consumer. */
export declare function runDesktopDispatchLoop(options: DesktopDispatchLoopOptions): Promise<void>;
export declare function replaceActionController(current?: AbortController, reset?: () => void): AbortController;
export type TockTutorNativeActionsProps = TockTutorNativeActionsOwnerProps & {
    bridge: DesktopCallerBridge;
    remote: DesktopActionRemote;
};
export type TockTutorVaultActionsProps = TockTutorVaultActionsOwnerProps & {
    bridge: DesktopCallerBridge;
    remote: DesktopActionRemote;
};
export declare function openFolderAsVault(owner: TockTutorVaultActionsOwnerProps, bridge: DesktopCallerBridge, remote: DesktopActionRemote, signal?: AbortSignal): Promise<NativeActionResult | undefined>;
export declare function revealVault(owner: TockTutorVaultActionsOwnerProps, bridge: DesktopCallerBridge, remote: DesktopActionRemote, signal?: AbortSignal): Promise<NativeActionResult | undefined>;
export declare function renameVault(owner: TockTutorVaultActionsOwnerProps, name: string, bridge: DesktopCallerBridge, remote: DesktopActionRemote, signal?: AbortSignal): Promise<NativeActionResult | undefined>;
export declare function moveVault(owner: TockTutorVaultActionsOwnerProps, bridge: DesktopCallerBridge, remote: DesktopActionRemote, signal?: AbortSignal): Promise<NativeActionResult | undefined>;
export declare function removeVault(owner: TockTutorVaultActionsOwnerProps, bridge: DesktopCallerBridge, remote: DesktopActionRemote, signal?: AbortSignal): Promise<NativeActionResult | undefined>;
/** Desktop-only vault picker and management contribution for the vault dialog. */
export declare function TockTutorVaultActions(props: TockTutorVaultActionsProps): ReactNode;
/** Accessible contribution for Workbench's root-scoped Native Actions seat. */
export declare function TockTutorNativeActions(props: TockTutorNativeActionsProps): ReactNode;
//# sourceMappingURL=client-actions.d.ts.map