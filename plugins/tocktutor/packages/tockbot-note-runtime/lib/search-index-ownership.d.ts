type IndexOwner = {
    close(): Promise<void>;
};
export declare function searchIndexOwnershipFailure(): Error | null;
export declare function adoptSearchIndex(index: IndexOwner): void;
export declare function retireSearchIndex(index: IndexOwner): Promise<void>;
export declare function awaitSearchIndexSettlement(admit?: () => void, signal?: AbortSignal): Promise<void>;
export {};
