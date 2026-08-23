import { type ReactNode } from 'react';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { TockTutorAssistantPanelOwnerProps } from '@tockteam/tocktutor-workbench/client';
import type { AssistantApprovalRequest, AssistantApprovalView, AssistantAuditResult, AssistantDecisionView, AssistantPageRequest, AssistantProposalListResult, AssistantRejectionRequest, AssistantSettingsView, AssistantTurnRequest, AssistantTurnResult } from './remote-types.ts';
interface AssistantTextBlock {
    kind: string;
    text?: string;
}
export interface AssistantConversationSnapshot {
    lastAgentError: string | null;
    nodes: readonly unknown[];
    openError: {
        message: string;
    } | null;
    openState: 'cold' | 'loading' | 'open' | 'error';
    partial: {
        blocks: readonly AssistantTextBlock[];
    } | null;
    promptError: {
        error: {
            message: string;
        };
    } | null;
    running: boolean;
    runningCalls: readonly {
        callId: string;
        name: string;
    }[];
}
interface ConversationSource {
    getSnapshot(): AssistantConversationSnapshot;
    subscribe(listener: () => void): () => void;
}
interface ScopedAssistantRemote {
    remote: {
        tocktutorAssistant: {
            continueTurn(request: AssistantTurnRequest, signal?: AbortSignal): Promise<RemoteResult<AssistantTurnResult>>;
        };
    };
}
export interface AssistantPanelSessions {
    binding(id: string): {
        session: ConversationSource;
    } | undefined;
    list: {
        getSnapshot(): {
            current: string | undefined;
        };
        subscribe(listener: () => void): () => void;
    };
    scope(id: string): ScopedAssistantRemote | undefined;
}
export interface AssistantPanelRemote {
    tocktutorAssistant: {
        approveProposal(request: AssistantApprovalRequest, signal?: AbortSignal): Promise<RemoteResult<AssistantApprovalView>>;
        audit(request: AssistantPageRequest, signal?: AbortSignal): Promise<RemoteResult<AssistantAuditResult>>;
        currentSettings(signal?: AbortSignal): Promise<RemoteResult<AssistantSettingsView>>;
        listProposals(request: AssistantPageRequest, signal?: AbortSignal): Promise<RemoteResult<AssistantProposalListResult>>;
        rejectProposal(request: AssistantRejectionRequest, signal?: AbortSignal): Promise<RemoteResult<AssistantDecisionView>>;
        saveSettings(request: AssistantSettingsView, signal?: AbortSignal): Promise<RemoteResult<AssistantSettingsView>>;
    };
}
export interface TockTutorAssistantPanelProps extends TockTutorAssistantPanelOwnerProps {
    remote: AssistantPanelRemote;
    sessions: AssistantPanelSessions;
}
/** Inline, authority-free browser presentation for the selected Agent and Host review queue. */
export declare function TockTutorAssistantPanel(props: TockTutorAssistantPanelProps): ReactNode;
export {};
//# sourceMappingURL=assistant-panel.d.ts.map