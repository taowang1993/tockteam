import { type OwnedProcess, type OwnedProcessOptions } from './owned-process.ts';
export type NativePtr = bigint;
type BaseBindings = {
    closeHandle(handle: NativePtr): number;
    getLastError(): number;
    createPipe(read: NativePtr, write: NativePtr, attributes: null, size: number): number;
    setHandleInformation(handle: NativePtr, mask: number, flags: number): number;
    readFile(handle: NativePtr, buffer: Buffer, count: number, read: NativePtr, overlapped: null): number;
    peekNamedPipe(handle: NativePtr, buffer: null, size: number, read: null, available: NativePtr, left: null): number;
    waitForSingleObject(handle: NativePtr, milliseconds: number): number;
    getExitCodeProcess(handle: NativePtr, code: NativePtr): number;
    createJobObjectW(attributes: null, name: null): NativePtr;
    setInformationJobObject(handle: NativePtr, cls: number, information: Buffer, length: number): number;
};
type Extensions = {
    createIoCompletionPort(file: NativePtr, port: null, key: NativePtr, threads: number): NativePtr;
    getQueuedCompletionStatus(port: NativePtr, code: NativePtr, key: NativePtr, value: NativePtr, timeout: number): number;
    openProcess(access: number, inherit: number, pid: number): NativePtr;
    initializeProcThreadAttributeList(list: NativePtr | null, count: number, flags: number, size: NativePtr): number;
    updateProcThreadAttribute(list: NativePtr, flags: number, attribute: number, value: NativePtr, size: number, previous: null, returned: null): number;
    deleteProcThreadAttributeList(list: NativePtr): void;
    createProcessW(application: string, command: NativePtr, processAttributes: null, threadAttributes: null, inherit: number, flags: number, environment: NativePtr, cwd: string, startup: NativePtr, information: NativePtr): number;
    queryInformationJobObject(job: NativePtr, cls: number, information: Buffer, length: number, returned: null): number;
    terminateJobObject(job: NativePtr, code: number): number;
};
export type WindowsOwnedBindings = BaseBindings & Extensions & {
    address(buffer: Buffer): NativePtr;
};
export declare function loadWindowsOwnedBindings(): Promise<WindowsOwnedBindings>;
export declare function encodeWindowsInvocation(options: Pick<OwnedProcessOptions, 'executable' | 'args' | 'env' | 'windowsVerbatimArguments'>): {
    commandLine: Buffer;
    environment: Buffer;
};
/** Creation-time Job ownership; public dispatch is restricted to verified Windows x64. */
export declare function spawnWindowsOwnedProcess(options: OwnedProcessOptions, bindings?: WindowsOwnedBindings): Promise<OwnedProcess>;
export {};
