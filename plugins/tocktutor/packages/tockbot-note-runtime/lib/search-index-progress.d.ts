export type NativeProgressEvent = Readonly<{
    phase: 'start' | 'progress' | 'end';
    id: number;
}>;
/** Callback progress belongs to the logical operation that submitted it, not the current caller. */
export declare class NativeOperationProgress {
    private readonly context;
    private readonly notify;
    private readonly failed;
    private nextId;
    private readonly pending;
    private failure?;
    constructor(notify: (event: NativeProgressEvent) => void | Promise<void>, failed: (error: Error) => void);
    private report;
    run<T>(work: () => Promise<T>): Promise<T>;
    wrap<This, Args extends unknown[], Result>(callback: (this: This, ...args: Args) => Result): (this: This, ...args: Args) => Result;
}
/** Host monotonic clocks. No heartbeat, submission or another operation renews a stalled step. */
export declare class NativeProgressClock {
    private readonly active;
    private nextId;
    observe(value: unknown, now?: number): void;
    isStalled(now?: number): boolean;
}
