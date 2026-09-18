import type { IndexPeer } from './search-index-auth.ts';
export declare const ISOLATED_SEARCH_SCHEMA = "tocktutor-search-v3";
export type IndexAction = 'init' | 'inventory' | 'document' | 'search';
export type IndexReply = {
    items: unknown[];
    meta: unknown;
};
export declare function exact(value: unknown, keys: string[]): value is Record<string, unknown>;
export declare function integer(value: unknown, min?: number, max?: number): value is number;
export declare function text(value: unknown, max?: number): value is string;
export declare function relativePath(value: unknown): value is string;
export declare function documentRecord(value: unknown): value is {
    path: string;
    revision: string;
    modifiedAt: number;
};
/** One acknowledged data page per direction; at most four live requests, including abandoned work. */
export declare class IndexProtocol {
    private readonly peer;
    private sequence;
    private queuedWrites;
    private writeTail;
    private receivedSequence;
    private nextId;
    private incomingId;
    private failure?;
    private readonly pending;
    private readonly incoming;
    private readonly queue;
    private serving;
    private ack;
    private readonly handle;
    private readonly notice;
    private readonly failed;
    constructor(peer: IndexPeer, handle: IndexProtocol['handle'], notice: IndexProtocol['notice'], failed: IndexProtocol['failed']);
    private send;
    notify(action: 'invalidate' | 'ready' | 'step' | 'failure', value: unknown): Promise<void>;
    request(action: IndexAction, args: unknown, limit: number, maxBytes: number, signal?: AbortSignal): Promise<IndexReply>;
    close(error?: Error): void;
    private receive;
    private serve;
}
