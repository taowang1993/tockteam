import { IndexChannel } from './search-index-channel.ts';
export type IndexPeer = Readonly<{
    channel: IndexChannel;
    generation: string;
}>;
/** A fresh, private bootstrap goes only into the owned child's explicit environment. */
export declare function listenForIndexPeer(signal: AbortSignal): Promise<Readonly<{
    bootstrap: string;
    peer: Promise<IndexPeer>;
    close(): Promise<void>;
}>>;
export declare function connectIndexPeer(bootstrap: string, signal: AbortSignal): Promise<IndexPeer>;
