import type { Duplex, Readable } from 'node:stream';
export declare const INDEX_FRAME_BYTES: number;
export declare function encodeIndexFrame(value: unknown): Buffer;
/** Retains only one bounded payload plus its four-byte header. */
export declare function decodeIndexFrames(input: Readable): AsyncGenerator<unknown>;
/** Internal transport only; generation, capability and action validation belong to the protocol. */
export declare class IndexChannel {
    readonly frames: AsyncGenerator<unknown>;
    private readonly socket;
    private queued;
    private tail;
    constructor(socket: Duplex);
    send(value: unknown): Promise<void>;
    close(): void;
}
