import { z } from 'zod';
import { type DomainFacility } from '@deepseek-ai/dsh-storage-domain';
import { ProposalQueue, type ProposalQueueOptions } from './proposals.ts';
export declare const MAX_PROPOSAL_STATE_BYTES: number;
export declare const assistantProposalStateSpec: {
    name: string;
    version: number;
    global: {
        schema: z.ZodObject<{
            permissionEpoch: z.ZodNumber;
            queue: z.ZodString;
        }, z.core.$strict>;
        initial: {
            permissionEpoch: number;
            queue: string;
        };
    };
    tables: {};
};
export declare class AssistantProposalStateStore {
    private readonly domain;
    private state;
    private readonly queueOptions;
    private closed;
    private constructor();
    static open(facility: DomainFacility, queueOptions?: ProposalQueueOptions): Promise<AssistantProposalStateStore>;
    load(): {
        permissionEpoch: number;
        queue: ProposalQueue;
    };
    save(queue: ProposalQueue, permissionEpoch: number): Promise<void>;
    saveSerialized(queue: string, permissionEpoch: number): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=proposal-state.d.ts.map