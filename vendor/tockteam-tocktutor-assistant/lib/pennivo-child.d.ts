import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
export type PennivoWritePermission = 'read-only' | 'propose';
export interface PennivoBinding {
    vaultId: string;
    vaultGeneration: number;
    writePermission: PennivoWritePermission;
}
export interface PennivoChildInfo {
    instanceId: string;
    binding: PennivoBinding;
}
export interface PennivoChildOptions {
    resolveArgv?: (runtime: SubprocessRuntime) => Promise<readonly string[]>;
    randomId?: () => string;
    requestTimeoutMs?: number;
    restartDelayMs?: number;
    lifetimeMs?: number;
    maxLineBytes?: number;
    maxRequestBytes?: number;
    maxPending?: number;
    maxRestarts?: number;
    graceMs?: number;
    tempRoot?: string;
    onInstanceChange?: (currentInstanceId: string | null, previousInstanceId: string | null) => void;
}
export type PennivoChildErrorCode = 'DISPOSED' | 'CHILD_REPLACED' | 'CHILD_EXITED' | 'TIMEOUT' | 'PROTOCOL' | 'VERSION_MISMATCH' | 'TOO_MANY_PENDING' | 'REQUEST_TOO_LARGE' | 'START_FAILED';
export declare class PennivoChildError extends Error {
    readonly code: PennivoChildErrorCode;
    constructor(code: PennivoChildErrorCode);
}
/** Tombstone every ambient variable except the small platform/runtime allowlist. */
export declare function restrictedPennivoEnvironment(environment?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export declare function resolvePennivoArgv(runtime: SubprocessRuntime): Promise<readonly string[]>;
export declare class PennivoChildManager {
    private readonly runtime;
    private readonly resolveArgv;
    private readonly randomId;
    private readonly requestTimeoutMs;
    private readonly restartDelayMs;
    private readonly lifetimeMs;
    private readonly maxLineBytes;
    private readonly maxRequestBytes;
    private readonly maxPending;
    private readonly maxRestarts;
    private readonly graceMs;
    private readonly tempRoot;
    private readonly onInstanceChange;
    private activeState;
    private desiredBinding;
    private transition;
    private restartTimer;
    private restarts;
    private nextRequestId;
    private publishedInstanceId;
    private disposed;
    constructor(runtime: SubprocessRuntime, options?: PennivoChildOptions);
    active(): PennivoChildInfo | null;
    ensure(nextBinding: PennivoBinding): Promise<PennivoChildInfo>;
    listTools(nextBinding: PennivoBinding): Promise<unknown>;
    stop(): Promise<void>;
    dispose(): Promise<void>;
    private replaceWith;
    private start;
    private assertStartupCurrent;
    private stopUnpublished;
    private assertInitialized;
    private request;
    private notify;
    private onData;
    private onLine;
    private protocolFailure;
    private onExit;
    private scheduleRestart;
    private stopState;
    private publishInstance;
    private clearRestart;
}
//# sourceMappingURL=pennivo-child.d.ts.map