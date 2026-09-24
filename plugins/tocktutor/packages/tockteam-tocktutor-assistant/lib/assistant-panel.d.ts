import { type ReactNode } from 'react';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { TockTutorAssistantPanelOwnerProps } from '@tockteam/tocktutor-workbench/client';
import type { AssistantApprovalRequest, AssistantApprovalView, AssistantAuditResult, AssistantDecisionView, AssistantPageRequest, AssistantProposalListResult, AssistantRejectionRequest, AssistantSettingsView, AssistantTurnRequest, AssistantTurnResult } from './remote-types.ts';
interface AssistantTextBlock {
    kind: string;
    text?: string;
}
export interface AssistantSessionSnapshot {
    lastAgentError: string | null;
    openError: {
        message: string;
    } | null;
    openState: 'cold' | 'loading' | 'open' | 'error';
    promptError: {
        error: {
            message: string;
        };
    } | null;
    running: boolean;
}
export interface AssistantChatSnapshot {
    nodes: readonly unknown[];
    partial: {
        blocks: readonly AssistantTextBlock[];
    } | null;
    runningCalls: readonly {
        callId: string;
        name: string;
    }[];
}
interface SnapshotSource<T> {
    getSnapshot(): T;
    subscribe(listener: () => void): () => void;
}
export interface AssistantPanelConversation {
    binding(id: SessionId): {
        target(target: 'chat'): SnapshotSource<{
            legacy: AssistantChatSnapshot;
        } | undefined>;
    };
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
        session: SnapshotSource<AssistantSessionSnapshot>;
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
    uiConversation: AssistantPanelConversation;
}
/** Inline, authority-free browser presentation for the selected Agent and Host review queue. */
export declare function TockTutorAssistantPanel(props: TockTutorAssistantPanelProps): ReactNode;
export {};
//# sourceMappingURL=assistant-panel.d.ts.map