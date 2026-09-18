export type OwnedProcessOptions = Readonly<{
    executable: string;
    args: readonly string[];
    cwd: string;
    env: Readonly<Record<string, string | undefined>>;
    signal: AbortSignal;
    maxOutputBytes?: number;
    /** Host-only admission around actual launch, after asynchronous platform preparation. */
    admit?: (launch: () => Promise<OwnedProcess>) => Promise<OwnedProcess>;
    /** Host-selected Windows shells only: arguments are already quoted for that shell. */
    windowsVerbatimArguments?: boolean;
}>;
export type OwnedProcessResult = Readonly<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stdoutBytes: number;
    stderrBytes: number;
}>;
export type OwnedProcess = Readonly<{
    pid: number;
    completion: Promise<OwnedProcessResult>;
    /** Resolves only after the owned lifetime is verified stopped, even after an operation failure. */
    terminate(): Promise<void>;
}>;
export declare const OWNED_PROCESS_EXIT_DEADLINE_MS = 5000;
/** Host-only lifetime ownership, not filesystem or account confinement. */
export declare function spawnOwnedProcess(options: OwnedProcessOptions): Promise<OwnedProcess>;
